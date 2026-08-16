from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import SessionLocal
from document_acl import can_download_document, can_search_document, is_owner_override, is_project_owner, is_document_owner
from dependencies import get_current_user
from task_queue.ingestion_queue import enqueue_document_ingestion
from sqlalchemy.sql import func
from models import User, Project, ProjectMember, Document, DocumentVersion , DocumentChunk , Team , Folder, TeamMember
from supabase_client import supabase
from routers.audit import create_audit_log
from services.audit_service import AuditService
import re
import logging
from ingestion.extractor import extract_text
from ingestion.inline_extractor import extract_and_embed_from_bytes

logger = logging.getLogger("cortex.documents")

router = APIRouter()
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def safe_filename(name: str):
    name = name.lower()
    name = name.replace(" ", "_")
    name = re.sub(r"[^a-z0-9._-]", "", name)
    return name


@router.post("/projects/{project_id}/documents/upload")
async def upload_document(
    project_id: int,

    title: str = Form(...),
    description: str = Form(""),
    tags: str = Form(""),

    download_access_level: str = Form("member"),
    search_access_level: str = Form("member"),

    allowed_team_ids: str = Form(...),

    folder_id: int | None = Form(None),

    file: UploadFile = File(...),

    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ---------------------------------------------------
    # 1. CHECK ADMIN ACCESS
    # ---------------------------------------------------

    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    user = db.query(User).filter(
        User.user_id == user_id
    ).first()

    if not membership or membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin can upload"
        )

    # ---------------------------------------------------
    # 2. VALIDATE FILE TYPE
    # ---------------------------------------------------

    allowed_extensions = [
        ".pdf",
        ".md",
        ".txt",
        ".docx",
        ".pptx"
    ]

    filename = file.filename.lower()

    if not any(
        filename.endswith(ext)
        for ext in allowed_extensions
    ):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type"
        )

    # ---------------------------------------------------
    # 3. VALIDATE ACCESS LEVELS
    # ---------------------------------------------------

    allowed_access_levels = [
        "admin",
        "member",
        "none"
    ]

    if download_access_level not in allowed_access_levels:
        raise HTTPException(
            status_code=400,
            detail="Invalid download access level"
        )

    if search_access_level not in allowed_access_levels:
        raise HTTPException(
            status_code=400,
            detail="Invalid search access level"
        )

    # ---------------------------------------------------
    # 4. CHECK DUPLICATE TITLE
    # ---------------------------------------------------

    existing_doc = db.query(Document).filter(
        Document.project_id == project_id,
        Document.title == title
    ).first()

    if existing_doc:
        raise HTTPException(
            status_code=400,
            detail="Document title already exists in this project"
        )

    # ---------------------------------------------------
    # 5. VALIDATE TEAMS
    # ---------------------------------------------------

    try:

        parsed_team_ids = [
            int(team_id.strip())
            for team_id in allowed_team_ids.split(",")
            if team_id.strip()
        ]

    except ValueError:

        raise HTTPException(
            status_code=400,
            detail="Invalid allowed_team_ids format"
        )

    if not parsed_team_ids:
        raise HTTPException(
            status_code=400,
            detail="Document must belong to at least one team"
        )

    existing_teams = db.query(Team).filter(
        Team.project_id == project_id,
        Team.team_id.in_(parsed_team_ids)
    ).all()

    if len(existing_teams) != len(parsed_team_ids):
        raise HTTPException(
            status_code=400,
            detail="One or more teams are invalid"
        )

    # ---------------------------------------------------
    # 6. VALIDATE FOLDER
    # ---------------------------------------------------

    if folder_id is not None:

        folder = db.query(Folder).filter(
            Folder.folder_id == folder_id,
            Folder.project_id == project_id
        ).first()

        if not folder:
            raise HTTPException(
                status_code=404,
                detail="Folder not found"
            )

    # ---------------------------------------------------
    # 7. PREPARE TAGS
    # ---------------------------------------------------

    tag_list = []

    if tags.strip():

        tag_list = [
            tag.strip()
            for tag in tags.split(",")
            if tag.strip()
        ]

    # ---------------------------------------------------
    # 8. READ FILE
    # ---------------------------------------------------

    try:

        file_bytes = await file.read()

        file_size = len(file_bytes)
        mime_type = file.content_type

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Failed to read uploaded file: {str(e)}"
        )

    # ---------------------------------------------------
    # 9. CREATE DOCUMENT
    # ---------------------------------------------------

    new_document = Document(
        project_id=project_id,

        title=title,
        description=description,

        owner_id=user_id,
        modified_by=user_id,

        tags=tag_list,

        folder_id=folder_id,

        allowed_team_ids=parsed_team_ids,

        download_access_level=download_access_level,
        search_access_level=search_access_level
    )

    try:

        db.add(new_document)
        db.flush()

    except Exception as e:

        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=f"Database error during document creation: {str(e)}"
        )

    # ---------------------------------------------------
    # 10. STORAGE PATH
    # ---------------------------------------------------

    version_number = 1

    clean_name = safe_filename(file.filename)

    file_path = (
        f"{project_id}/"
        f"{new_document.document_id}/"
        f"v1/"
        f"{clean_name}"
    )

    # ---------------------------------------------------
    # 11. UPLOAD TO SUPABASE
    # ---------------------------------------------------

    try:

        supabase.storage.from_("documents").upload(
            path=file_path,
            file=file_bytes,
            file_options={
                "content-type": mime_type
            }
        )

    except Exception as upload_error:

        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload file to storage: {str(upload_error)}"
        )

    # ---------------------------------------------------
    # 12. CREATE DOCUMENT VERSION
    # ---------------------------------------------------

    try:

        new_version = DocumentVersion(

            document_id=new_document.document_id,

            version_number=version_number,

            storage_path=file_path,

            file_name=file.filename,
            mime_type=mime_type,
            file_size=file_size,

            is_active=True,

            status="pending",

            uploaded_by=user_id,

            activated_by=user_id,
            activated_at=func.now()
        )

        db.add(new_version)
        db.flush()

    except Exception as e:

        db.rollback()

        try:
            supabase.storage.from_("documents").remove(
                [file_path]
            )
        except Exception:
            pass

        raise HTTPException(
            status_code=500,
            detail=f"Error creating document version: {str(e)}"
        )

    # ---------------------------------------------------
    # 13. AUDIT LOG
    # ---------------------------------------------------

    AuditService.record_event(
        db=db,
        project_id=project_id,
        event_type="document",
        resource_type="document",
        resource_id=new_document.document_id,
        action="create",
        actor_user_id=user_id,
        after={"title": title, "folder_id": folder_id},
        metadata={
            "filename": file.filename,
            "file_size": file_size,
            "mime_type": mime_type,
            "version": 1
        },
        description=f"User {{user:{user_id}}} created document {{document:{new_document.document_id}}}"
    )

    # ---------------------------------------------------
    # 14. UPDATE FOLDER
    # ---------------------------------------------------

    if folder_id is not None:

        folder = db.query(Folder).filter(
            Folder.folder_id == folder_id
        ).first()

        if folder:

            folder.last_modified = func.now()
            folder.modified_by = user_id

    # ---------------------------------------------------
    # 15. COMMIT DOCUMENT + VERSION
    # ---------------------------------------------------

    try:

        db.commit()

    except Exception as e:

        db.rollback()

        try:
            supabase.storage.from_("documents").remove(
                [file_path]
            )
        except Exception:
            pass

        raise HTTPException(
            status_code=500,
            detail=f"Error finalizing document upload: {str(e)}"
        )
    # ---------------------------------------------------
    # 16. ADD INGESTION JOB
    # ---------------------------------------------------
    
    try:
    
        await enqueue_document_ingestion(
            document_id=new_document.document_id,
            version_id=new_version.version_id,
            project_id=project_id,
            storage_path=file_path
        )
    
    except Exception as e:
    
        print(
            "Failed to enqueue ingestion job:",
            e
        )
    
        # -----------------------------------------------
        # Queue failed.
        #
        # The document/version already exists in DB,
        # so preserve it and mark it as failed.
        # This allows the user to retry manually.
        # -----------------------------------------------
    
        try:
    
            new_version.status = "failed"
    
            db.commit()
    
        except Exception as status_error:
    
            db.rollback()
    
            print(
                "Failed to mark version as failed:",
                status_error
            )
    
        raise HTTPException(
            status_code=500,
            detail=(
                "Document was uploaded, but the "
                "ingestion job could not be queued. "
                "The document is marked as failed and "
                "can be retried."
            )
        )
    # ---------------------------------------------------
    # 17. RESPONSE
    # ---------------------------------------------------

    return {
        "message": "Document uploaded successfully",

        "document_id": new_document.document_id,

        "version": 1,

        "folder_id": folder_id,

        "allowed_team_ids": parsed_team_ids,

        "download_access_level": download_access_level,
        "search_access_level": search_access_level,

        "path": file_path,

        "status": "processing"
    }

@router.get("/projects/{project_id}/documents")
def list_documents(
    project_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ----------------------------------------
    # Verify membership
    # ----------------------------------------
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership:
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    project = db.query(Project).filter(
        Project.project_id == project_id
    ).first()

    user_team_ids = [
        member.team_id
        for member in db.query(TeamMember).filter(
            TeamMember.user_id == user_id
        ).all()
    ]

    # ----------------------------------------
    # Get all project documents
    # ----------------------------------------
    docs = db.query(Document).filter(
        Document.project_id == project_id
    ).all()

    result = []

    for doc in docs:

        # ----------------------------------------
        # Get ACTIVE + NON-DELETED version
        # ----------------------------------------
        active_version = db.query(DocumentVersion).filter(
            DocumentVersion.document_id == doc.document_id,
            DocumentVersion.is_active == True,
            DocumentVersion.is_deleted == False
        ).first()

        # ----------------------------------------
        # Skip documents with no visible version
        # ----------------------------------------
        if not active_version:
            continue

        if not can_search_document(
            project=project,
            membership=membership,
            document=doc,
            user_id=user_id,
            user_team_ids=user_team_ids
        ):
            continue

        # ----------------------------------------
        # Folder info
        # ----------------------------------------
        folder_name = None

        if doc.folder_id:

            folder = db.query(Folder).filter(
                Folder.folder_id == doc.folder_id
            ).first()

            if folder:
                folder_name = folder.name

        # ----------------------------------------
        # Team names
        # ----------------------------------------
        team_names = []

        if doc.allowed_team_ids:

            teams = db.query(Team).filter(
                Team.team_id.in_(doc.allowed_team_ids)
            ).all()

            team_names = [
                team.name
                for team in teams
            ]

        result.append({

            "document_id": doc.document_id,

            "title": doc.title,
            "description": doc.description,

            "tags": doc.tags,

            "folder_id": doc.folder_id,
            "folder_name": folder_name,

            "allowed_team_ids": doc.allowed_team_ids,
            "allowed_team_names": team_names,

            "download_access_level": doc.download_access_level,
            "search_access_level": doc.search_access_level,

            "created_at": doc.created_at,
            "last_modified": doc.last_modified,
            "modified_by": doc.modified_by,
            "owner_id": doc.owner_id,

            "active_version": active_version.version_number,
            "active_version_id": active_version.version_id,
            "status": active_version.status,
            "file_name": active_version.file_name,
            "file_size": active_version.file_size

        })

    return result


@router.post("/documents/{document_id}/versions/upload")
async def upload_new_version(
    document_id: int,

    file: UploadFile = File(...),

    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    file_path = None
    new_version = None

    # ============================================================
    # 1. FIND DOCUMENT
    # ============================================================

    # Lock the document row so two users cannot calculate
    # the same next version at the same time.
    document = db.query(Document).filter(
        Document.document_id == document_id
    ).with_for_update().first()

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found"
        )

    project_id = document.project_id

    # ============================================================
    # 2. CHECK ADMIN ACCESS
    # ============================================================

    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    user = db.query(User).filter(
        User.user_id == user_id
    ).first()

    if not membership or membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin can upload new version"
        )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    # ============================================================
    # 3. CHECK DOCUMENT ACCESS
    # ============================================================

    project = db.query(Project).filter(
        Project.project_id == project_id
    ).first()

    if (
        document.search_access_level == "none"
        and not is_owner_override(
            project,
            document,
            user_id
        )
    ):
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    # ============================================================
    # 4. VALIDATE FILE
    # ============================================================

    allowed_extensions = [
        ".pdf",
        ".md",
        ".txt",
        ".docx",
        ".pptx"
    ]

    original_filename = file.filename or ""

    if not original_filename:
        raise HTTPException(
            status_code=400,
            detail="Filename is required"
        )

    filename = original_filename.lower()

    if not any(
        filename.endswith(ext)
        for ext in allowed_extensions
    ):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type"
        )

    # ============================================================
    # 5. READ FILE
    # ============================================================

    try:

        file_bytes = await file.read()

        if not file_bytes:
            raise HTTPException(
                status_code=400,
                detail="Uploaded file is empty"
            )

        file_size = len(file_bytes)

        mime_type = (
            file.content_type
            or "application/octet-stream"
        )

    except HTTPException:
        raise

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Failed to read uploaded file: {str(e)}"
        )

    # ============================================================
    # 6. GET NEXT VERSION
    # ============================================================

    latest_version = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document_id,
        DocumentVersion.is_deleted == False
    ).order_by(
        DocumentVersion.version_number.desc()
    ).first()

    if not latest_version:
        raise HTTPException(
            status_code=400,
            detail="Cannot upload version to fully deleted document"
        )

    next_version = (
        latest_version.version_number + 1
    )

    # ============================================================
    # 7. CREATE STORAGE PATH
    # ============================================================

    clean_name = safe_filename(
        original_filename
    )

    file_path = (
        f"{project_id}/"
        f"{document_id}/"
        f"v{next_version}/"
        f"{clean_name}"
    )

    try:

        # ========================================================
        # 8. UPLOAD FILE TO SUPABASE
        # ========================================================

        supabase.storage.from_(
            "documents"
        ).upload(
            path=file_path,
            file=file_bytes,
            file_options={
                "content-type": mime_type
            }
        )

        # ========================================================
        # 9. CREATE NEW VERSION
        # ========================================================

        new_version = DocumentVersion(

            document_id=document_id,

            version_number=next_version,

            storage_path=file_path,

            file_name=original_filename,

            mime_type=mime_type,

            file_size=file_size,

            # IMPORTANT:
            # New version is NOT active yet.
            #
            # The previous completed version remains
            # active until this version is successfully
            # ingested by the worker.
            is_active=False,

            # Worker has not started yet.
            status="pending",

            uploaded_by=user_id,

            is_deleted=False
        )

        db.add(new_version)

        db.flush()

        version_id = new_version.version_id

        # ========================================================
        # 10. AUDIT LOG
        # ========================================================

        AuditService.record_event(
            db=db,
            project_id=project_id,
            event_type="document",
            resource_type="version",
            resource_id=version_id,
            action="create",
            actor_user_id=user_id,
            after={"version_number": next_version},
            metadata={
                "document_id": document.document_id,
                "version_number": next_version,
                "filename": original_filename,
                "file_size": file_size
            },
            description=f"User {{user:{user_id}}} uploaded version {next_version} for document {{document:{document.document_id}}}"
        )

        # ========================================================
        # 11. UPDATE DOCUMENT MODIFIED INFORMATION
        # ========================================================

        document.last_modified = func.now()
        document.modified_by = user_id

        if document.folder_id is not None:

            folder = db.query(Folder).filter(
                Folder.folder_id == document.folder_id
            ).first()

            if folder:

                folder.last_modified = func.now()
                folder.modified_by = user_id

        # ========================================================
        # 12. COMMIT VERSION
        #
        # At this point:
        #
        # Document        → exists
        # New version     → pending
        # Old version     → still active
        # Source file     → stored
        #
        # No chunks exist yet.
        # Worker will create them.
        # ========================================================

        db.commit()

    except HTTPException:
        db.rollback()

        if file_path:

            try:

                supabase.storage.from_(
                    "documents"
                ).remove(
                    [file_path]
                )

            except Exception as cleanup_error:

                print(
                    "Storage cleanup failed:",
                    cleanup_error
                )

        raise

    except Exception as e:

        db.rollback()

        # ========================================================
        # CLEAN STORAGE
        # ========================================================

        if file_path:

            try:

                supabase.storage.from_(
                    "documents"
                ).remove(
                    [file_path]
                )

            except Exception as cleanup_error:

                print(
                    "Storage cleanup failed:",
                    cleanup_error
                )

        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to create new document version: "
                f"{str(e)}"
            )
        )

    # ============================================================
    # 13. QUEUE INGESTION
    # ============================================================

    try:

        await enqueue_document_ingestion(
            document_id=document_id,
            version_id=version_id,
            project_id=project_id,
            storage_path=file_path
        )

    except Exception as e:

        print(
            "Failed to enqueue ingestion job:",
            e
        )

        # ========================================================
        # Queue failed.
        #
        # Keep the version because the user can retry it.
        # ========================================================

        try:

            version = db.query(
                DocumentVersion
            ).filter(
                DocumentVersion.version_id == version_id
            ).first()

            if version:

                version.status = "failed"

                db.commit()

        except Exception as status_error:

            db.rollback()

            print(
                "Failed to mark version as failed:",
                status_error
            )

        raise HTTPException(
            status_code=500,
            detail=(
                "New version was uploaded, but the "
                "ingestion job could not be queued. "
                "The version is marked as failed and "
                "can be retried."
            )
        )

    # ============================================================
    # 14. RESPONSE
    # ============================================================

    return {

        "message": "New version uploaded successfully",

        "document_id": document_id,

        "version": next_version,

        "version_id": version_id,

        "file_name": original_filename,

        "status": "pending"
    }

@router.post("/documents/{document_id}/versions/{version_id}/retry")
async def retry_document_version(
    document_id: int,
    version_id: int,

    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ============================================================
    # 1. FIND DOCUMENT
    # ============================================================

    document = db.query(Document).filter(
        Document.document_id == document_id
    ).first()

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found"
        )

    # ============================================================
    # 2. CHECK ADMIN ACCESS
    # ============================================================

    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == document.project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership or membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin can retry document ingestion"
        )

    # ============================================================
    # 3. FIND VERSION
    # ============================================================

    version = db.query(DocumentVersion).filter(
        DocumentVersion.version_id == version_id,
        DocumentVersion.document_id == document_id,
        DocumentVersion.is_deleted == False
    ).first()

    if not version:
        raise HTTPException(
            status_code=404,
            detail="Document version not found"
        )

    # ============================================================
    # 4. ONLY FAILED VERSIONS CAN BE RETRIED
    # ============================================================

    if version.status != "failed":

        raise HTTPException(
            status_code=400,
            detail=(
                f"Only failed versions can be retried. "
                f"Current status: {version.status}"
            )
        )

    # ============================================================
    # 5. CHECK STORAGE PATH
    # ============================================================

    if not version.storage_path:

        raise HTTPException(
            status_code=400,
            detail="Version has no storage file to retry"
        )

    # ============================================================
    # 6. MARK PENDING
    # ============================================================

    version.status = "pending"

    db.commit()

    # ============================================================
    # 7. QUEUE INGESTION AGAIN
    # ============================================================

    try:

        await enqueue_document_ingestion(
            document_id=document_id,
            version_id=version_id,
            project_id=document.project_id,
            storage_path=version.storage_path
        )

    except Exception as e:

        print(
            "Failed to queue retry:",
            e
        )

        # ----------------------------------------------
        # Queue failed again.
        # Keep version retryable.
        # ----------------------------------------------

        try:

            version = db.query(
                DocumentVersion
            ).filter(
                DocumentVersion.version_id == version_id
            ).first()

            if version:

                version.status = "failed"

                db.commit()

        except Exception as status_error:

            db.rollback()

            print(
                "Failed to mark retry as failed:",
                status_error
            )

        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to queue document ingestion retry. "
                "The version remains failed and can be retried again."
            )
        )

    # ============================================================
    # 8. AUDIT
    # ============================================================

    try:

        AuditService.record_event(
            db=db,
            project_id=document.project_id,
            event_type="document",
            resource_type="version",
            resource_id=version.version_id,
            action="system",
            actor_user_id=user_id,
            metadata={
                "document_id": document.document_id,
                "version_number": version.version_number
            },
            description=f"User {{user:{user_id}}} requested retry of version {version.version_number} of document {{document:{document.document_id}}}"
        )

        db.commit()

    except Exception as audit_error:

        # Audit failure should NOT turn a successfully queued
        # ingestion job into a failed retry.
        db.rollback()

        logger.warning(
            "Failed to create retry audit log: %s",
            audit_error
        )

    # ============================================================
    # 9. RESPONSE
    # ============================================================

    return {
        "message": "Document ingestion retry queued successfully",
        "document_id": document_id,
        "version_id": version_id,
        "version": version.version_number,
        "status": "pending"
    }

@router.patch("/documents/{document_id}")
def update_document(
    document_id: int,

    title: str = Form(None),
    description: str = Form(None),
    tags: str = Form(None),

    folder_id: str | None = Form(None),

    allowed_team_ids: str = Form(None),

    download_access_level: str = Form(None),
    search_access_level: str = Form(None),

    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ----------------------------------------
    # Get document
    # ----------------------------------------
    document = db.query(Document).filter(
        Document.document_id == document_id
    ).first()

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found"
        )

    # ----------------------------------------
    # Verify admin access
    # ----------------------------------------
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == document.project_id,
        ProjectMember.user_id == user_id
    ).first()

    user = db.query(User).filter(
        User.user_id == user_id
    ).first()

    if not membership or membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin can update documents"
        )

    project = db.query(Project).filter(
        Project.project_id == document.project_id
    ).first()

    # ----------------------------------------
    # Owner-only/project-owner update rule when search is none
    # ----------------------------------------
    if (
        document.search_access_level == "none"
        and not is_owner_override(project, document, user_id)
    ):
        raise HTTPException(
            status_code=403,
            detail="Only owner or project owner can update this document when search access is none"
        )

    changed_fields = []
    before_state = {}
    after_state = {}

    # ----------------------------------------
    # Validate access levels
    # ----------------------------------------
    allowed_access_levels = ["admin", "member", "none"]

    if (
        download_access_level is not None
        and download_access_level not in allowed_access_levels
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid download access level"
        )

    if (
        search_access_level is not None
        and search_access_level not in allowed_access_levels
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid search access level"
        )

    # ----------------------------------------
    # Track security/system changes
    # ----------------------------------------
    system_change = False

    
    # ----------------------------------------
    # Update title
    # ----------------------------------------
    if title is not None:
    
        cleaned_title = title.strip()
    
        if cleaned_title != document.title:
    
            existing_doc = db.query(Document).filter(
                Document.project_id == document.project_id,
                Document.title == cleaned_title,
                Document.document_id != document_id
            ).first()
    
            if existing_doc:
                raise HTTPException(
                    status_code=400,
                    detail="Document title already exists in this project"
                )
    
            before_state["name"] = document.title
            after_state["name"] = cleaned_title
            document.title = cleaned_title
    
            changed_fields.append("name")
    
    
    # ----------------------------------------
    # Update description
    # ----------------------------------------
    if description is not None:
    
        if description != document.description:
    
            before_state["description"] = document.description
            after_state["description"] = description
            document.description = description
    
            changed_fields.append("description")
    
    
    # ----------------------------------------
    # Update tags
    # ----------------------------------------
    if tags is not None:
    
        tag_list = [
            tag.strip()
            for tag in tags.split(",")
            if tag.strip()
        ]
    
        current_tags = document.tags or []
    
        if sorted(tag_list) != sorted(current_tags):
    
            before_state["tags"] = current_tags
            after_state["tags"] = tag_list
            document.tags = tag_list
    
            changed_fields.append("tags")
    
    
    # ----------------------------------------
    # Update folder
    # ----------------------------------------
    if folder_id is not None:
        # Allow empty value to mean "no folder"
        raw_folder_id = folder_id.strip()
        target_folder_id: int | None = None

        if raw_folder_id.lower() in {"", "null", "none"}:
            # Explicit clear-folder path
            if document.folder_id is not None:
                before_state["folder_id"] = document.folder_id
                after_state["folder_id"] = None
                document.folder_id = None
                changed_fields.append("folder_id")
        else:
            try:
                target_folder_id = int(raw_folder_id)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid folder_id"
                )

            folder = db.query(Folder).filter(
                Folder.folder_id == target_folder_id,
                Folder.project_id == document.project_id
            ).first()

            if not folder:
                raise HTTPException(
                    status_code=404,
                    detail="Folder not found"
                )

            if target_folder_id != document.folder_id:
                before_state["folder_id"] = document.folder_id
                after_state["folder_id"] = target_folder_id
                document.folder_id = target_folder_id
                changed_fields.append("folder_id")
    
    
    # ----------------------------------------
    # Update allowed teams
    # ----------------------------------------
    if allowed_team_ids is not None:
    
        try:
    
            parsed_team_ids = [
                int(team_id.strip())
                for team_id in allowed_team_ids.split(",")
                if team_id.strip()
            ]
    
        except:
            raise HTTPException(
                status_code=400,
                detail="Invalid allowed_team_ids format"
            )
    
        if not parsed_team_ids:
            raise HTTPException(
                status_code=400,
                detail="Document must belong to at least one team"
            )
    
        existing_teams = db.query(Team).filter(
            Team.project_id == document.project_id,
            Team.team_id.in_(parsed_team_ids)
        ).all()
    
        if len(existing_teams) != len(parsed_team_ids):
            raise HTTPException(
                status_code=400,
                detail="One or more teams are invalid"
            )
    
        current_team_ids = document.allowed_team_ids or []
    
        if sorted(parsed_team_ids) != sorted(current_team_ids):
    
            before_state["allowed_team_ids"] = current_team_ids
            after_state["allowed_team_ids"] = parsed_team_ids
            document.allowed_team_ids = parsed_team_ids
    
            changed_fields.append("allowed_team_ids")
    
            system_change = True
    
    
    # ----------------------------------------
    # Update download access
    # ----------------------------------------
    if download_access_level is not None:
    
        if download_access_level != document.download_access_level:
    
            before_state["download_access_level"] = document.download_access_level
            after_state["download_access_level"] = download_access_level
            document.download_access_level = download_access_level
    
            changed_fields.append("download_access_level")
    
            system_change = True
    
    
    # ----------------------------------------
    # Update search access
    # ----------------------------------------
    if search_access_level is not None:
    
        if search_access_level != document.search_access_level:
    
            before_state["search_access_level"] = document.search_access_level
            after_state["search_access_level"] = search_access_level
            document.search_access_level = search_access_level
    
            changed_fields.append("search_access_level")
    
            system_change = True
    
    
    # ----------------------------------------
    # Audit log
    # ----------------------------------------
    if changed_fields:
    
        action_type = "system" if system_change else "update"
    
        AuditService.record_event(
            db=db,
            project_id=document.project_id,
            event_type="document",
            resource_type="document",
            resource_id=document.document_id,
            action=action_type,
            actor_user_id=user_id,
            before=before_state,
            after=after_state,
            metadata={"updated_fields": changed_fields},
            description=f"User {{user:{user_id}}} updated document {{document:{document.document_id}}} ({', '.join(changed_fields)})"
        )
    
    # ----------------------------------------
    # Update Document and Folder Modified Date
    # ----------------------------------------
    document.last_modified = func.now()
    document.modified_by = user_id

    if document.folder_id is not None:
        folder = db.query(Folder).filter(Folder.folder_id == document.folder_id).first()
        if folder:
            folder.last_modified = func.now()
            folder.modified_by = user_id

    db.commit()

    return {
        "message": "Document updated successfully",
        "document_id": document.document_id
    }

@router.get("/documents/{document_id}/download")
def download_document(
    document_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ----------------------------------------
    # Get document
    # ----------------------------------------
    document = db.query(Document).filter(
        Document.document_id == document_id
    ).first()

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found"
        )

    # ----------------------------------------
    # Verify project membership
    # ----------------------------------------
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == document.project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership:
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    project = db.query(Project).filter(
        Project.project_id == document.project_id
    ).first()

    user_team_ids = [
        member.team_id
        for member in db.query(TeamMember).filter(
            TeamMember.user_id == user_id
        ).all()
    ]

    # ----------------------------------------
    # Permission checks
    # ----------------------------------------
    if not can_download_document(
        project=project,
        membership=membership,
        document=document,
        user_id=user_id,
        user_team_ids=user_team_ids
    ):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to download this document"
        )

    # ----------------------------------------
    # Get active NON-DELETED version
    # ----------------------------------------
    version = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document_id,
        DocumentVersion.is_active == True,
        DocumentVersion.is_deleted == False
    ).first()

    if not version:
        raise HTTPException(
            status_code=404,
            detail="No active version found"
        )

    # ----------------------------------------
    # Generate signed URL
    # ----------------------------------------
    signed_url_response = (
        supabase.storage
        .from_("documents")
        .create_signed_url(
            version.storage_path,
            180
        )
    )

    # ----------------------------------------
    # Audit log
    # ----------------------------------------
    AuditService.record_event(
        db=db,
        project_id=document.project_id,
        event_type="document",
        resource_type="document",
        resource_id=document.document_id,
        action="system",
        actor_user_id=user_id,
        metadata={"document_id": document.document_id},
        description=f"User {{user:{user_id}}} downloaded document {{document:{document.document_id}}}"
    )

    db.commit()

    return {
        "document_id": document.document_id,
        "file_name": version.file_name,
        "download_url": signed_url_response["signedURL"]
    }


@router.post("/documents/{document_id}/extract-text")
def extract_text_route(
    document_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    result = extract_text(document_id, user_id, db)

    return result


@router.delete("/documents/{document_id}/versions/{version_number}/permanent")
def delete_document_version(
    document_id: int,
    version_number: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ----------------------------------------
    # Get document
    # ----------------------------------------
    document = db.query(Document).filter(
        Document.document_id == document_id
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # ----------------------------------------
    # Verify membership
    # ----------------------------------------
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == document.project_id,
        ProjectMember.user_id == user_id
    ).first()
    user = db.query(User).filter(User.user_id == user_id).first()

    if not membership or membership.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete")

    project = db.query(Project).filter(
        Project.project_id == document.project_id
    ).first()

    if (
        document.search_access_level == "none"
        and not is_owner_override(project, document, user_id)
    ):
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    # ----------------------------------------
    # Update Document and Folder Modified Date
    # ----------------------------------------
    document.last_modified = func.now()
    document.modified_by = user_id

    if document.folder_id is not None:
        folder = db.query(Folder).filter(Folder.folder_id == document.folder_id).first()
        if folder:
            folder.last_modified = func.now()
            folder.modified_by = user_id

    # ----------------------------------------
    # Get version
    # ----------------------------------------
    version = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document_id,
        DocumentVersion.version_number == version_number
    ).first()

    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    # ----------------------------------------
    # Delete chunks
    # ----------------------------------------
    db.query(DocumentChunk).filter(
        DocumentChunk.version_id == version.version_id
    ).delete()

    # ----------------------------------------
    # Delete file from storage
    # ----------------------------------------
    supabase.storage.from_("documents").remove(
        [version.storage_path]
    )

        # ----------------------------------------
    # Remember whether deleted version was active
    # ----------------------------------------
    was_active = version.is_active
    
    # ----------------------------------------
    # Delete version
    # ----------------------------------------
    db.delete(version)
    AuditService.record_event(
        db=db,
        project_id=document.project_id,
        event_type="document",
        resource_type="version",
        resource_id=version.version_id,
        action="delete",
        actor_user_id=user_id,
        metadata={"document_id": document.document_id, "version_number": version_number},
        description=f"User {{user:{user_id}}} permanently deleted version {version_number} of document {{document:{document.document_id}}}"
    )
    
    db.commit()
    
    # ----------------------------------------
    # Fetch remaining versions
    # ----------------------------------------
    remaining_versions = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document_id
    ).order_by(
        DocumentVersion.version_number.desc()
    ).all()
    
    # ----------------------------------------
    # If no versions remain → delete document
    # ----------------------------------------
    if not remaining_versions:
    
        db.query(Document).filter(
            Document.document_id == document_id
        ).delete()
    
        db.commit()
    
        return {
            "message": "Document and all versions deleted successfully"
        }
    
    # ----------------------------------------
    # If deleted version was ACTIVE
    # activate highest remaining version
    # ----------------------------------------
    if was_active:
    
        # deactivate all first
        for v in remaining_versions:
            v.is_active = False
    
        latest_version = remaining_versions[0]
    
        latest_version.is_active = True
    
        # audit metadata
        latest_version.activated_by = user_id
        latest_version.activated_at = func.now()
        AuditService.record_event(
            db=db,
            project_id=document.project_id,
            event_type="document",
            resource_type="version",
            resource_id=latest_version.version_id,
            action="system",
            actor_user_id=user_id,
            metadata={"document_id": document.document_id, "activated_version": latest_version.version_number},
            description=f"User {{user:{user_id}}} triggered fallback activation to version {latest_version.version_number} of document {{document:{document.document_id}}}"
        )
    
        db.commit()
    
    return {
        "message": "Document version deleted successfully"
    }

@router.patch("/documents/{document_id}/versions/{version_number}/delete")
def soft_delete_document_version(
    document_id: int,
    version_number: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ----------------------------------------
    # Get document
    # ----------------------------------------
    document = db.query(Document).filter(
        Document.document_id == document_id
    ).first()

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found"
        )

    # ----------------------------------------
    # Verify admin
    # ----------------------------------------
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == document.project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership or membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin can delete"
        )

    # ----------------------------------------
    # Update Document and Folder Modified Date
    # ----------------------------------------
    document.last_modified = func.now()
    document.modified_by = user_id

    if document.folder_id is not None:
        folder = db.query(Folder).filter(Folder.folder_id == document.folder_id).first()
        if folder:
            folder.last_modified = func.now()
            folder.modified_by = user_id

    # ----------------------------------------
    # Get version
    # ----------------------------------------
    version = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document_id,
        DocumentVersion.version_number == version_number
    ).first()

    if not version:
        raise HTTPException(
            status_code=404,
            detail="Version not found"
        )

    if version.is_deleted:
        raise HTTPException(
            status_code=400,
            detail="Version already deleted"
        )

    # ----------------------------------------
    # Soft delete
    # ----------------------------------------
    was_active = version.is_active

    version.is_deleted = True
    version.deleted_at = func.now()
    version.deleted_by = user_id

    version.is_active = False
    db.flush()  

    user = db.query(User).filter(
    User.user_id == user_id
     ).first()

    # ----------------------------------------
    # Audit log
    # ----------------------------------------
    AuditService.record_event(
        db=db,
        project_id=document.project_id,
        event_type="document",
        resource_type="version",
        resource_id=version.version_id,
        action="delete",
        actor_user_id=user_id,
        before={"is_deleted": False},
        after={"is_deleted": True},
        metadata={"document_id": document.document_id, "version_number": version_number},
        description=f"User {{user:{user_id}}} moved version {version_number} of document {{document:{document.document_id}}} to trash"
    )

    # ----------------------------------------
    # Activate latest remaining non-deleted version
    # ----------------------------------------
    if was_active:

        remaining_versions = db.query(DocumentVersion).filter(
            DocumentVersion.document_id == document_id,
            DocumentVersion.is_deleted == False
        ).order_by(
            DocumentVersion.version_number.desc()
        ).all()

        if remaining_versions:

            latest_version = remaining_versions[0]

            latest_version.is_active = True
            latest_version.activated_by = user_id
            latest_version.activated_at = func.now()

            # ----------------------------------------
            # Audit log
            # ----------------------------------------
            AuditService.record_event(
                db=db,
                project_id=document.project_id,
                event_type="document",
                resource_type="version",
                resource_id=latest_version.version_id,
                action="system",
                actor_user_id=user_id,
                metadata={"document_id": document.document_id, "activated_version": latest_version.version_number},
                description=f"User {{user:{user_id}}} triggered fallback activation to version {latest_version.version_number} of document {{document:{document.document_id}}}"
            )

    # ----------------------------------------
    # Commit once (ACID)
    # ----------------------------------------
    db.commit()

    return {
        "message": "Version moved to trash successfully"
    }

@router.patch("/documents/{document_id}/versions/{version_number}/restore")
def restore_document_version(
    document_id: int,
    version_number: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ----------------------------------------
    # Get document
    # ----------------------------------------
    document = db.query(Document).filter(
        Document.document_id == document_id
    ).first()

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found"
        )

    # ----------------------------------------
    # Verify admin
    # ----------------------------------------
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == document.project_id,
        ProjectMember.user_id == user_id
    ).first()
    user = db.query(User).filter(User.user_id == user_id).first()

    if not membership or membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin can restore"
        )

    # ----------------------------------------
    # Update Document and Folder Modified Date
    # ----------------------------------------
    document.last_modified = func.now()
    document.modified_by = user_id

    if document.folder_id is not None:
        folder = db.query(Folder).filter(Folder.folder_id == document.folder_id).first()
        if folder:
            folder.last_modified = func.now()
            folder.modified_by = user_id

    # ----------------------------------------
    # Get deleted version
    # ----------------------------------------
    version = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document_id,
        DocumentVersion.version_number == version_number
    ).first()

    if not version:
        raise HTTPException(
            status_code=404,
            detail="Version not found"
        )

    if not version.is_deleted:
        raise HTTPException(
            status_code=400,
            detail="Version is not deleted"
        )

    # ----------------------------------------
    # Restore
    # ----------------------------------------
    version.is_deleted = False
    version.deleted_at = None
    version.deleted_by = None
    version.is_active = False
    db.flush()
    AuditService.record_event(
        db=db,
        project_id=document.project_id,
        event_type="document",
        resource_type="version",
        resource_id=version.version_id,
        action="system",
        actor_user_id=user_id,
        before={"is_deleted": True},
        after={"is_deleted": False},
        metadata={"document_id": document.document_id, "version_number": version_number},
        description=f"User {{user:{user_id}}} restored version {version_number} of document {{document:{document.document_id}}} from trash"
    )
    # If this is the only non-deleted version, make it active
    non_deleted_versions = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document_id,
        DocumentVersion.is_deleted == False
    ).all()

    if len(non_deleted_versions) == 1:
        version.is_active = True
        version.activated_by = user_id
        version.activated_at = func.now()
        AuditService.record_event(
            db=db,
            project_id=document.project_id,
            event_type="document",
            resource_type="version",
            resource_id=version.version_id,
            action="system",
            actor_user_id=user_id,
            metadata={"document_id": document.document_id, "activated_version": version_number},
            description=f"User {{user:{user_id}}} auto-activated restored version {version_number} of document {{document:{document.document_id}}}"
        )

    db.commit()

    return {
        "message": "Version restored successfully"
    }


@router.post("/documents/{document_id}/activate/{version_number}")
def activate_document_version(
    document_id: int,
    version_number: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ----------------------------------------
    # Get document
    # ----------------------------------------
    document = db.query(Document).filter(
        Document.document_id == document_id
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # ----------------------------------------
    # Verify admin access
    # ----------------------------------------
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == document.project_id,
        ProjectMember.user_id == user_id
    ).first()
    user = db.query(User).filter(User.user_id == user_id).first()

    if not membership or membership.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can activate versions")

    project = db.query(Project).filter(
        Project.project_id == document.project_id
    ).first()

    if (
        document.search_access_level == "none"
        and not is_owner_override(project, document, user_id)
    ):
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    # ----------------------------------------
    # Update Document and Folder Modified Date
    # ----------------------------------------
    document.last_modified = func.now()
    document.modified_by = user_id

    if document.folder_id is not None:
        folder = db.query(Folder).filter(Folder.folder_id == document.folder_id).first()
        if folder:
            folder.last_modified = func.now()
            folder.modified_by = user_id

    # ----------------------------------------
    # Get target version
    # ----------------------------------------
    target_version = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document_id,
        DocumentVersion.version_number == version_number
    ).first()

    if not target_version:
        raise HTTPException(status_code=404, detail="Version not found")
    if target_version.is_deleted:
       raise HTTPException(
        status_code=400,
        detail="Cannot activate deleted version"
    )
    # ----------------------------------------
    # Deactivate all versions
    # ----------------------------------------
    all_versions = db.query(DocumentVersion).filter(
    DocumentVersion.document_id == document_id,
    DocumentVersion.is_deleted == False
        ).all()

    for version in all_versions:
        version.is_active = False

    # ----------------------------------------
    # Activate selected version
    # ----------------------------------------
    target_version.is_active = True

    # audit metadata
    target_version.activated_by = user_id
    target_version.activated_at = func.now()
    AuditService.record_event(
        db=db,
        project_id=document.project_id,
        event_type="document",
        resource_type="version",
        resource_id=target_version.version_id,
        action="create",
        actor_user_id=user_id,
        metadata={"document_id": document.document_id, "version_number": version_number},
        description=f"User {{user:{user_id}}} activated version {version_number} of document {{document:{document.document_id}}}"
    )

    db.commit()

    return {
        "message": f"Version {version_number} is now active"
    }

@router.get("/documents/{document_id}/versions")
def list_document_versions(
    document_id: int,
    include_deleted: bool = False,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Get document
    document = db.query(Document).filter(
        Document.document_id == document_id
    ).first()
    
    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found"
        )

    # 2. Verify membership
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == document.project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership:
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    project = db.query(Project).filter(
        Project.project_id == document.project_id
    ).first()

    # 2b. Check search access level permissions
    if (
        document.search_access_level == "none"
        and not is_owner_override(project, document, user_id)
    ):
        raise HTTPException(
            status_code=403,
            detail="Only the document owner or project owner can access versions when search access is none."
        )

    # 3. Retrieve versions
    query = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document_id
    )
    
    if not include_deleted:
        query = query.filter(DocumentVersion.is_deleted == False)

    versions = query.order_by(DocumentVersion.version_number.desc()).all()

    # 4. Map user IDs to names for uploader/deleted info
    user_ids = set()
    for v in versions:
        user_ids.add(v.uploaded_by)
        if v.activated_by:
            user_ids.add(v.activated_by)
        if v.deleted_by:
            user_ids.add(v.deleted_by)
            
    users = db.query(User).filter(User.user_id.in_(list(user_ids))).all()
    user_names = {u.user_id: u.name for u in users}

    result = []
    for v in versions:
        result.append({
            "version_id": v.version_id,
            "document_id": v.document_id,
            "version_number": v.version_number,
            "file_name": v.file_name,
            "mime_type": v.mime_type,
            "file_size": v.file_size,
            "is_active": v.is_active,
            "is_deleted": v.is_deleted,
            "status": v.status,
            "uploaded_by": v.uploaded_by,
            "uploaded_by_name": user_names.get(v.uploaded_by, f"User {v.uploaded_by}"),
            "uploaded_at": v.uploaded_at,
            "activated_by": v.activated_by,
            "activated_by_name": user_names.get(v.activated_by) if v.activated_by else None,
            "activated_at": v.activated_at,
            "deleted_by": v.deleted_by,
            "deleted_by_name": user_names.get(v.deleted_by) if v.deleted_by else None,
            "deleted_at": v.deleted_at
        })

    return result


# ---------------------------------------------------
# MOVE DOCUMENT TO FOLDER / ROOT
# ---------------------------------------------------
@router.patch("/documents/{document_id}/move")
def move_document(
    document_id: int,
    folder_id: Optional[int] = None,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    document = db.query(Document).filter(
        Document.document_id == document_id
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    project = db.query(Project).filter(
        Project.project_id == document.project_id
    ).first()

    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == document.project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")

    # Authorization Check
    is_admin = membership.role == "admin"
    is_proj_owner = is_project_owner(project, user_id)
    is_doc_owner = is_document_owner(document, user_id)
    
    if not (is_admin or is_proj_owner or is_doc_owner):
        # If regular member, check if document permission is "none"
        if document.search_access_level == "none" or document.download_access_level == "none":
            raise HTTPException(status_code=403, detail="You do not have permission to move this document")
        
        # Check team access for member if applicable
        user_team_ids = [
            m.team_id for m in db.query(TeamMember).filter(TeamMember.user_id == user_id).all()
        ]
        if document.allowed_team_ids and not (set(document.allowed_team_ids) & set(user_team_ids)):
            raise HTTPException(status_code=403, detail="You do not have team access to move this document")

    # Target Folder Check
    target_folder_name = "Root"
    if folder_id is not None:
        target_folder = db.query(Folder).filter(
            Folder.folder_id == folder_id,
            Folder.project_id == document.project_id
        ).first()

        if not target_folder:
            raise HTTPException(status_code=404, detail="Target folder not found in this project")

        # If regular member, verify folder team access
        if not (is_admin or is_proj_owner):
            user_team_ids = [
                m.team_id for m in db.query(TeamMember).filter(TeamMember.user_id == user_id).all()
            ]
            if target_folder.allowed_team_ids and not (set(target_folder.allowed_team_ids) & set(user_team_ids)):
                raise HTTPException(status_code=403, detail="You do not have access to the target folder")
        
        target_folder_name = target_folder.name

    # Update modified date on old folder if exists
    if document.folder_id is not None:
        old_folder = db.query(Folder).filter(Folder.folder_id == document.folder_id).first()
        if old_folder:
            old_folder.last_modified = func.now()
            old_folder.modified_by = user_id

    # Update document folder_id
    old_folder_id = document.folder_id
    document.folder_id = folder_id
    document.last_modified = func.now()
    document.modified_by = user_id

    # Update modified date on new folder if exists
    if folder_id is not None:
        new_folder = db.query(Folder).filter(Folder.folder_id == folder_id).first()
        if new_folder:
            new_folder.last_modified = func.now()
            new_folder.modified_by = user_id

    user = db.query(User).filter(User.user_id == user_id).first()
    user_name = user.name if user else f"User {user_id}"

    AuditService.record_event(
        db=db,
        project_id=document.project_id,
        event_type="document",
        resource_type="document",
        resource_id=document.document_id,
        action="update",
        actor_user_id=user_id,
        before={"folder_id": old_folder_id},
        after={"folder_id": folder_id},
        metadata={"updated_fields": ["folder_id"], "target_folder_name": target_folder_name},
        description=f"User {{user:{user_id}}} moved document {{document:{document.document_id}}} to folder '{target_folder_name}'"
    )

    db.commit()

    return {
        "message": "Document moved successfully",
        "document_id": document.document_id,
        "folder_id": document.folder_id
    }


# ---------------------------------------------------
# TRASH & BULK OPERATIONS MODELS AND ROUTES
# ---------------------------------------------------

class BulkItemTarget(BaseModel):
    version_id: Optional[int] = None
    document_id: Optional[int] = None
    version_number: Optional[int] = None


class BulkActionRequest(BaseModel):
    items: Optional[List[BulkItemTarget]] = None
    version_ids: Optional[List[int]] = None


@router.get("/projects/{project_id}/trash")
@router.get("/projects/{project_id}/documents/trash")
def list_trashed_documents(
    project_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify membership
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")

    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    is_admin = membership.role == "admin"
    is_proj_owner = is_project_owner(project, user_id)

    # Get all trashed versions for documents in this project
    trashed_versions = db.query(DocumentVersion, Document).join(
        Document, DocumentVersion.document_id == Document.document_id
    ).filter(
        Document.project_id == project_id,
        DocumentVersion.is_deleted == True
    ).order_by(
        DocumentVersion.deleted_at.desc()
    ).all()

    # Pre-fetch user names and folder names
    user_ids = set()
    folder_ids = set()
    for ver, doc in trashed_versions:
        if doc.owner_id:
            user_ids.add(doc.owner_id)
        if ver.deleted_by:
            user_ids.add(ver.deleted_by)
        if doc.folder_id:
            folder_ids.add(doc.folder_id)

    users = db.query(User).filter(User.user_id.in_(list(user_ids))).all() if user_ids else []
    user_map = {u.user_id: u.name for u in users}

    folders = db.query(Folder).filter(Folder.folder_id.in_(list(folder_ids))).all() if folder_ids else []
    folder_map = {f.folder_id: f.name for f in folders}

    result = []
    for ver, doc in trashed_versions:
        is_doc_owner = is_document_owner(doc, user_id)
        if not (is_admin or is_proj_owner or is_doc_owner):
            if doc.search_access_level == "none":
                continue

        # Extract file extension / type
        file_name = ver.file_name or doc.file_name or ""
        ext = ""
        if "." in file_name:
            ext = "." + file_name.rsplit(".", 1)[-1].lower()
        else:
            ext = "file"

        location_name = folder_map.get(doc.folder_id, "Root") if doc.folder_id else "Root"

        result.append({
            "version_id": ver.version_id,
            "document_id": doc.document_id,
            "version_number": ver.version_number,
            "document": doc.title,
            "title": doc.title,
            "file_name": file_name,
            "type": ext,
            "owner_id": doc.owner_id,
            "owner": user_map.get(doc.owner_id, f"User {doc.owner_id}"),
            "size": ver.file_size or doc.file_size or 0,
            "location": location_name,
            "folder_id": doc.folder_id,
            "delete_time": ver.deleted_at.isoformat() if ver.deleted_at else None,
            "deleted_by": ver.deleted_by,
            "deleted_by_name": user_map.get(ver.deleted_by, f"User {ver.deleted_by}") if ver.deleted_by else None,
            "last_modified": (doc.last_modified or doc.created_at).isoformat() if (doc.last_modified or doc.created_at) else None
        })

    return result


@router.post("/projects/{project_id}/documents/versions/bulk-restore")
def bulk_restore_document_versions(
    project_id: int,
    payload: BulkActionRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")

    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    is_admin = membership.role == "admin"
    is_proj_owner = is_project_owner(project, user_id)

    if not (is_admin or is_proj_owner):
        raise HTTPException(status_code=403, detail="Only admins or project owners can perform bulk restore")

    # Input resolution & deduplication
    v_ids = set(payload.version_ids or [])
    doc_ver_pairs = set()

    if payload.items:
        for item in payload.items:
            if item.version_id:
                v_ids.add(item.version_id)
            elif item.document_id and item.version_number:
                doc_ver_pairs.add((item.document_id, item.version_number))

    total_items = len(v_ids) + len(doc_ver_pairs)
    if total_items == 0:
        return {"message": "No versions provided", "restored_count": 0, "restored_items": []}
    if total_items > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 items allowed per bulk restore request")

    query_conditions = []
    if v_ids:
        query_conditions.append(DocumentVersion.version_id.in_(list(v_ids)))
    if doc_ver_pairs:
        for doc_id, ver_num in doc_ver_pairs:
            query_conditions.append(
                (DocumentVersion.document_id == doc_id) & (DocumentVersion.version_number == ver_num)
            )

    from sqlalchemy import or_
    target_rows = db.query(DocumentVersion, Document).join(
        Document, DocumentVersion.document_id == Document.document_id
    ).filter(
        Document.project_id == project_id,
        DocumentVersion.is_deleted == True,
        or_(*query_conditions)
    ).all()

    if not target_rows:
        return {"message": "No matching trashed versions found in project", "restored_count": 0, "restored_items": []}

    user = db.query(User).filter(User.user_id == user_id).first()
    user_name = user.name if user else f"User {user_id}"

    restored_count = 0
    restored_items = []
    affected_doc_ids = set()

    try:
        for version, doc in target_rows:
            version.is_deleted = False
            version.deleted_at = None
            version.deleted_by = None
            version.is_active = False

            doc.last_modified = func.now()
            doc.modified_by = user_id

            if doc.folder_id:
                folder = db.query(Folder).filter(Folder.folder_id == doc.folder_id).first()
                if folder:
                    folder.last_modified = func.now()
                    folder.modified_by = user_id

            AuditService.record_event(
                db=db,
                project_id=project_id,
                event_type="document",
                resource_type="version",
                resource_id=version.version_id,
                action="system",
                actor_user_id=user_id,
                metadata={"document_id": doc.document_id, "version_number": version.version_number},
                description=f"User {{user:{user_id}}} restored version {version.version_number} of document {{document:{doc.document_id}}} from trash"
            )

            affected_doc_ids.add(doc.document_id)
            restored_count += 1
            restored_items.append({
                "document_id": doc.document_id,
                "version_number": version.version_number,
                "version_id": version.version_id
            })

        db.flush()

        for doc_id in affected_doc_ids:
            non_deleted = db.query(DocumentVersion).filter(
                DocumentVersion.document_id == doc_id,
                DocumentVersion.is_deleted == False
            ).all()

            if len(non_deleted) == 1:
                sole_v = non_deleted[0]
                sole_v.is_active = True
                sole_v.activated_by = user_id
                sole_v.activated_at = func.now()

        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error during bulk restore in project {project_id}: {e}")
        raise HTTPException(status_code=500, detail="Bulk restore failed due to a database error")

    return {
        "message": f"Successfully restored {restored_count} versions",
        "restored_count": restored_count,
        "restored_items": restored_items
    }


@router.post("/projects/{project_id}/documents/versions/bulk-permanent-delete")
def bulk_permanent_delete_document_versions(
    project_id: int,
    payload: BulkActionRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Permanently delete document versions belonging to a project.

    Guarantees:
    - User must be a project admin.
    - Maximum 20 unique requested targets.
    - Cross-project version IDs cannot be deleted.
    - Target rows and affected documents are locked during the transaction.
    - DB changes are committed before Supabase storage cleanup.
    - Latest remaining version is activated when necessary.
    - Documents with no remaining versions are deleted.
    - DB failures are rolled back.
    - Storage cleanup failures do not corrupt the DB state.
    """

    from sqlalchemy import exists, func, or_, tuple_

    MAX_BULK_DELETE = 20

    # ------------------------------------------------------------------
    # 1. Validate project admin access
    # ------------------------------------------------------------------

    membership = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
        .first()
    )

    if not membership or membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only project admins can permanently delete versions",
        )

    # ------------------------------------------------------------------
    # 2. Normalize request
    #
    # A version_id and a (document_id, version_number) pair are treated
    # as the same target if they resolve to the same version.
    # ------------------------------------------------------------------

    requested_version_ids = {
        int(version_id)
        for version_id in (payload.version_ids or [])
        if version_id is not None
    }

    requested_pairs = {
        (int(item.document_id), int(item.version_number))
        for item in (payload.items or [])
        if (
            item.version_id is None
            and item.document_id is not None
            and item.version_number is not None
        )
    }

    # Items containing version_id take precedence.
    for item in payload.items or []:
        if item.version_id is not None:
            requested_version_ids.add(int(item.version_id))

    if not requested_version_ids and not requested_pairs:
        return {
            "message": "No versions provided",
            "requested_count": 0,
            "deleted_count": 0,
            "not_found_count": 0,
            "storage_cleanup_failed_count": 0,
        }

    # This is the maximum number of unique request selectors.
    # Actual versions are deduplicated again after resolution.
    requested_selector_count = (
        len(requested_version_ids) + len(requested_pairs)
    )

    if requested_selector_count > MAX_BULK_DELETE:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Maximum {MAX_BULK_DELETE} unique versions are allowed "
                "per bulk delete request"
            ),
        )

    # ------------------------------------------------------------------
    # 3. Build project-scoped target query
    #
    # The project filter is mandatory. This prevents a version_id from
    # another project from being deleted.
    # ------------------------------------------------------------------

    conditions = []

    if requested_version_ids:
        conditions.append(
            DocumentVersion.version_id.in_(requested_version_ids)
        )

    if requested_pairs:
        conditions.append(
            tuple_(
                DocumentVersion.document_id,
                DocumentVersion.version_number,
            ).in_(list(requested_pairs))
        )

    target_rows = (
        db.query(DocumentVersion, Document)
        .join(
            Document,
            DocumentVersion.document_id == Document.document_id,
        )
        .filter(
            Document.project_id == project_id,
            or_(*conditions),
        )
        .with_for_update()
        .all()
    )

    # ------------------------------------------------------------------
    # 4. Deduplicate actual versions
    # ------------------------------------------------------------------

    target_by_version_id = {
        version.version_id: (version, doc)
        for version, doc in target_rows
    }

    target_rows = list(target_by_version_id.values())

    if not target_rows:
        return {
            "message": "No matching versions found in project",
            "requested_count": requested_selector_count,
            "deleted_count": 0,
            "not_found_count": requested_selector_count,
            "storage_cleanup_failed_count": 0,
        }

    # ------------------------------------------------------------------
    # 5. Calculate exact matched selectors
    # ------------------------------------------------------------------

    matched_version_ids = {
        version.version_id
        for version, _doc in target_rows
    }

    matched_pairs = {
        (version.document_id, version.version_number)
        for version, _doc in target_rows
    }

    matched_selector_count = (
        len(requested_version_ids & matched_version_ids)
        + len(requested_pairs & matched_pairs)
    )

    not_found_count = max(
        requested_selector_count - matched_selector_count,
        0,
    )

    deleted_version_ids = list(matched_version_ids)
    deleted_count = len(deleted_version_ids)

    affected_doc_ids = {
        doc.document_id
        for _version, doc in target_rows
    }

    # ------------------------------------------------------------------
    # 6. Lock affected documents too.
    # ------------------------------------------------------------------

    locked_documents = (
        db.query(Document)
        .filter(
            Document.document_id.in_(affected_doc_ids),
            Document.project_id == project_id,
        )
        .with_for_update()
        .all()
    )

    locked_doc_ids = {
        doc.document_id
        for doc in locked_documents
    }

    if locked_doc_ids != affected_doc_ids:
        raise HTTPException(
            status_code=409,
            detail="One or more affected documents changed during deletion",
        )

    # ------------------------------------------------------------------
    # 7. Collect storage paths before deleting ORM objects.
    # ------------------------------------------------------------------

    storage_paths_to_delete = {
        version.storage_path
        for version, _doc in target_rows
        if version.storage_path
    }

    # ------------------------------------------------------------------
    # 8. Load user for audit logging.
    # ------------------------------------------------------------------

    user = (
        db.query(User)
        .filter(User.user_id == user_id)
        .first()
    )

    user_name = user.name if user else f"User {user_id}"

    # ------------------------------------------------------------------
    # 9. Database transaction
    # ------------------------------------------------------------------

    try:
        (
            db.query(DocumentChunk)
            .filter(
                DocumentChunk.version_id.in_(deleted_version_ids)
            )
            .delete(
                synchronize_session=False
            )
        )

        for version, doc in target_rows:
            AuditService.record_event(
                db=db,
                project_id=project_id,
                event_type="document",
                resource_type="version",
                resource_id=version.version_id,
                action="delete",
                actor_user_id=user_id,
                metadata={"document_id": doc.document_id, "version_number": version.version_number},
                description=f"User {{user:{user_id}}} permanently deleted version {version.version_number} of document {{document:{doc.document_id}}}"
            )

            db.delete(version)

        db.flush()

        for doc_id in affected_doc_ids:
            remaining_versions = (
                db.query(DocumentVersion)
                .filter(
                    DocumentVersion.document_id == doc_id
                )
                .with_for_update()
                .order_by(
                    DocumentVersion.version_number.desc()
                )
                .all()
            )

            if not remaining_versions:
                document = (
                    db.query(Document)
                    .filter(
                        Document.document_id == doc_id,
                        Document.project_id == project_id,
                    )
                    .with_for_update()
                    .first()
                )

                if document:
                    db.delete(document)

                continue

            active_version_exists = (
                db.query(
                    exists().where(
                        (DocumentVersion.document_id == doc_id)
                        & (
                            DocumentVersion.is_active.is_(True)
                        )
                    )
                )
                .scalar()
            )

            if not active_version_exists:
                latest_remaining_version = remaining_versions[0]

                latest_remaining_version.is_active = True
                latest_remaining_version.activated_by = user_id
                latest_remaining_version.activated_at = func.now()

        db.flush()
        db.commit()

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()

        logger.exception(
            "Bulk permanent deletion failed: project_id=%s user_id=%s "
            "requested_version_ids=%s requested_pairs=%s",
            project_id,
            user_id,
            list(requested_version_ids),
            list(requested_pairs),
        )

        raise HTTPException(
            status_code=500,
            detail="Bulk deletion failed due to a database error",
        )

    # ------------------------------------------------------------------
    # 10. Storage cleanup AFTER successful DB commit
    # ------------------------------------------------------------------

    storage_cleanup_failed_count = 0
    storage_cleanup_failed_paths = []

    if storage_paths_to_delete:
        try:
            storage_result = (
                supabase.storage
                .from_("documents")
                .remove(list(storage_paths_to_delete))
            )

            if isinstance(storage_result, list):
                removed_paths = set()

                for item in storage_result:
                    if isinstance(item, str):
                        removed_paths.add(item)

                    elif isinstance(item, dict):
                        path = (
                            item.get("name")
                            or item.get("path")
                        )

                        if path:
                            removed_paths.add(path)

                if removed_paths:
                    storage_cleanup_failed_paths = sorted(
                        storage_paths_to_delete - removed_paths
                    )

        except Exception:
            storage_cleanup_failed_paths = sorted(
                storage_paths_to_delete
            )

            logger.exception(
                "Supabase storage cleanup failed after DB commit: "
                "project_id=%s user_id=%s version_ids=%s paths=%s",
                project_id,
                user_id,
                deleted_version_ids,
                storage_cleanup_failed_paths,
            )

    storage_cleanup_failed_count = len(
        storage_cleanup_failed_paths
    )

    # ------------------------------------------------------------------
    # 11. Response
    # ------------------------------------------------------------------

    if storage_cleanup_failed_count:
        message = (
            f"Successfully deleted {deleted_count} versions from the "
            "database, but some storage files require cleanup"
        )

    elif not_found_count:
        message = (
            f"Successfully deleted {deleted_count} versions; "
            f"{not_found_count} requested targets were not found "
            "in this project"
        )

    else:
        message = (
            f"Successfully deleted {deleted_count} versions permanently"
        )

    return {
        "message": message,
        "requested_count": requested_selector_count,
        "deleted_count": deleted_count,
        "not_found_count": not_found_count,
        "storage_cleanup_failed_count": storage_cleanup_failed_count,
        "storage_cleanup_failed_paths": storage_cleanup_failed_paths,
    }


