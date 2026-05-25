from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from sqlalchemy.orm import Session

from database import SessionLocal
from dependencies import get_current_user
from sqlalchemy.sql import func
from models import User, ProjectMember, Document, DocumentVersion , DocumentChunk , Team , Folder
from supabase_client import supabase
from routers.audit import create_audit_log
import re
from ingestion.extractor import extract_text
from rag.retriever import semantic_search , keyword_search , hybrid_search , hybrid_search_with_rerank
from rag.generator import generate_answer

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
def upload_document(
    project_id: int,

    title: str = Form(...),
    description: str = Form(""),
    tags: str = Form(""),

    download_access_level: str = Form("member"),
    search_access_level: str = Form("member"),

    allowed_team_ids: str = Form(...),

    folder_id: str | None = Form(None),

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
    allowed_extensions = [".pdf", ".md", ".txt"]

    filename = file.filename.lower()

    if not any(filename.endswith(ext) for ext in allowed_extensions):
        raise HTTPException(
            status_code=400,
            detail="Only PDF, MD, TXT files are allowed"
        )

    # ---------------------------------------------------
    # 3. VALIDATE ACCESS LEVELS
    # ---------------------------------------------------
    allowed_access_levels = ["admin", "member", "none"]

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
    # 4. CHECK DUPLICATE TITLE IN SAME PROJECT
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
    # allowed_team_ids example:
    # "1,2,3"
    # ---------------------------------------------------
    parsed_team_ids = []

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
    # 7. PREPARE TAGS ARRAY
    # ---------------------------------------------------
    tag_list = []

    if tags.strip():
        tag_list = [
            tag.strip()
            for tag in tags.split(",")
            if tag.strip()
        ]

    # ---------------------------------------------------
    # 8. CREATE DOCUMENT ROW
    # ---------------------------------------------------
    new_document = Document(
        project_id=project_id,
        title=title,
        description=description,
        owner_id=user_id,

        tags=tag_list,

        folder_id=folder_id,

        allowed_team_ids=parsed_team_ids,

        download_access_level=download_access_level,
        search_access_level=search_access_level
    )

    db.add(new_document)
    db.commit()
    db.refresh(new_document)

    # ---------------------------------------------------
    # 9. VERSION DETAILS
    # ---------------------------------------------------
    version_number = 1

    file_bytes = file.file.read()

    file_size = len(file_bytes)
    mime_type = file.content_type

    clean_name = safe_filename(file.filename)

    file_path = (
        f"{project_id}/"
        f"{new_document.document_id}/"
        f"v1/{clean_name}"
    )

    # ---------------------------------------------------
    # 10. UPLOAD TO STORAGE
    # ---------------------------------------------------
    supabase.storage.from_("documents").upload(
        path=file_path,
        file=file_bytes,
        file_options={
            "content-type": mime_type
        }
    )

    # ---------------------------------------------------
    # 11. CREATE VERSION
    # ---------------------------------------------------
    new_version = DocumentVersion(
        document_id=new_document.document_id,

        version_number=version_number,

        storage_path=file_path,

        file_name=file.filename,
        mime_type=mime_type,
        file_size=file_size,

        is_active=True,

        uploaded_by=user_id,

        activated_by=user_id,
        activated_at=func.now()
    )

    db.add(new_version)

    # ---------------------------------------------------
    # 12. AUDIT LOG
    # ---------------------------------------------------
    create_audit_log(
        db=db,
        project_id=project_id,
        user_id=user_id,
        action="create",
        detail=f"{user.name} uploaded document '{title}' with version 1"
    )

    db.commit()

    # ---------------------------------------------------
    # 13. RESPONSE
    # ---------------------------------------------------
    return {
        "message": "Document uploaded successfully",

        "document_id": new_document.document_id,

        "version": 1,

        "folder_id": folder_id,

        "allowed_team_ids": parsed_team_ids,

        "download_access_level": download_access_level,
        "search_access_level": search_access_level,

        "path": file_path
    }


@router.get("/projects/{project_id}/documents")
def list_documents(
    project_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ----------------------------------------
    # Verify ADMIN access
    # ----------------------------------------
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership or membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin can view documents"
        )

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

            "active_version": active_version.version_number,
            "file_name": active_version.file_name

        })

    return result


@router.post("/documents/{document_id}/versions/upload")
def upload_new_version(
    document_id: int,

    file: UploadFile = File(...),

    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ----------------------------------------
    # 1. Find document
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
    # 2. Check admin access
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
            detail="Only admin can upload new version"
        )

    # ----------------------------------------
    # 3. Validate file type
    # ----------------------------------------
    allowed_extensions = [".pdf", ".md", ".txt"]

    filename = file.filename.lower()

    if not any(filename.endswith(ext) for ext in allowed_extensions):
        raise HTTPException(
            status_code=400,
            detail="Only PDF, MD, TXT files are allowed"
        )

    # ----------------------------------------
    # 4. Get latest NON-DELETED version
    # ----------------------------------------
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

    next_version = latest_version.version_number + 1

    # ----------------------------------------
    # 5. Deactivate all active versions
    # ----------------------------------------
    active_versions = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document_id,
        DocumentVersion.is_active == True,
        DocumentVersion.is_deleted == False
    ).all()

    for version in active_versions:
        version.is_active = False

    # ----------------------------------------
    # 6. Upload new file
    # ----------------------------------------
    file_bytes = file.file.read()

    mime_type = file.content_type

    clean_name = safe_filename(file.filename)

    file_path = (
        f"{document.project_id}/"
        f"{document_id}/"
        f"v{next_version}/"
        f"{clean_name}"
    )

    supabase.storage.from_("documents").upload(
        path=file_path,
        file=file_bytes,
        file_options={
            "content-type": mime_type
        }
    )

    # ----------------------------------------
    # 7. Create new version row
    # ----------------------------------------
    new_version = DocumentVersion(
        document_id=document_id,

        version_number=next_version,

        storage_path=file_path,

        file_name=file.filename,
        mime_type=mime_type,
        file_size=len(file_bytes),

        is_active=True,

        uploaded_by=user_id,

        activated_by=user_id,
        activated_at=func.now(),

        is_deleted=False
    )

    db.add(new_version)

    # ----------------------------------------
    # 8. Audit log
    # ----------------------------------------
    create_audit_log(
        db=db,
        project_id=document.project_id,
        user_id=user_id,
        action="create",
        detail=(
            f"{user.name} uploaded "
            f"version {next_version} "
            f"of document '{document.title}'"
        )
    )

    # ----------------------------------------
    # 9. Commit
    # ----------------------------------------
    db.commit()

    return {
        "message": "New version uploaded successfully",

        "document_id": document_id,

        "version": next_version,

        "file_name": file.filename
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

    changed_fields = []

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
    
            document.title = cleaned_title
    
            changed_fields.append("title")
    
    
    # ----------------------------------------
    # Update description
    # ----------------------------------------
    if description is not None:
    
        if description != document.description:
    
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
                document.folder_id = None
                changed_fields.append("folder")
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
                document.folder_id = target_folder_id
                changed_fields.append("folder")
    
    
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
    
            document.allowed_team_ids = parsed_team_ids
    
            changed_fields.append("allowed_team_ids")
    
            system_change = True
    
    
    # ----------------------------------------
    # Update download access
    # ----------------------------------------
    if download_access_level is not None:
    
        if download_access_level != document.download_access_level:
    
            document.download_access_level = download_access_level
    
            changed_fields.append("download_access_level")
    
            system_change = True
    
    
    # ----------------------------------------
    # Update search access
    # ----------------------------------------
    if search_access_level is not None:
    
        if search_access_level != document.search_access_level:
    
            document.search_access_level = search_access_level
    
            changed_fields.append("search_access_level")
    
            system_change = True
    
    
    # ----------------------------------------
    # Audit log
    # ----------------------------------------
    if changed_fields:
    
        action_type = "system" if system_change else "update"
    
        create_audit_log(
            db=db,
            project_id=document.project_id,
            user_id=user_id,
            action=action_type,
            detail=(
                f"{user.name} updated document "
                f"'{document.title}' "
                f"({', '.join(changed_fields)})"
            )
        )
    
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

    # ----------------------------------------
    # TEAM ACCESS VALIDATION
    # Admin bypasses ACL
    # ----------------------------------------
    if membership.role != "admin":

        user_team_ids = [
            member.team_id
            for member in db.query(TeamMember).filter(
                TeamMember.user_id == user_id
            ).all()
        ]

        has_access = bool(
            set(document.allowed_team_ids or [])
            &
            set(user_team_ids)
        )

        if not has_access:
            raise HTTPException(
                status_code=403,
                detail="You do not have access to this document"
            )

    # ----------------------------------------
    # Permission checks
    # ----------------------------------------
    access = document.download_access_level

    if access == "none":
        raise HTTPException(
            status_code=403,
            detail="Downloads disabled for this document"
        )

    if (
        access == "admin"
        and membership.role != "admin"
    ):
        raise HTTPException(
            status_code=403,
            detail="Only admins can download this document"
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
    user = db.query(User).filter(
        User.user_id == user_id
    ).first()

    create_audit_log(
        db=db,
        project_id=document.project_id,
        user_id=user_id,
        action="system",
        detail=(
            f"{user.name} downloaded "
            f"document '{document.title}'"
        )
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
    create_audit_log(
        db=db,
        project_id=document.project_id,
        user_id=user_id,
        action="delete",
        detail=f"{user.name} permanently deleted version {version_number} of document '{document.title}'"
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
        create_audit_log(
            db=db,
            project_id=document.project_id,
            user_id=user_id,
            action="system",
            detail=f"{user.name} triggered fallback activation to version {latest_version.version_number} of document '{document.title}'"
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
    create_audit_log(
        db=db,
        project_id=document.project_id,
        user_id=user_id,
        action="delete",
        detail=f"{user.name} moved version {version_number} of document '{document.title}' to trash"
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
            create_audit_log(
                db=db,
                project_id=document.project_id,
                user_id=user_id,
                action="system",
                detail=f"{user.name} triggered fallback activation to version {latest_version.version_number} of document '{document.title}'"
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
    create_audit_log(
        db=db,
        project_id=document.project_id,
        user_id=user_id,
        action="system",
        detail=f"{user.name} restored version {version_number} of document '{document.title}' from trash"
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
        create_audit_log(
            db=db,
            project_id=document.project_id,
            user_id=user_id,
            action="system",
            detail=f"{user.name} auto-activated restored version {version_number} of document '{document.title}'"
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
    create_audit_log(
        db=db,
        project_id=document.project_id,
        user_id=user_id,
        action="create",
        detail=f"{user.name} activated version {version_number} of document '{document.title}'"
    )

    db.commit()

    return {
        "message": f"Version {version_number} is now active"
    }

# Below endpoint is for asking questions to project documents using RAG
# Currently Uses Simple Semantic Search + Llama 3.3 via Groq API
@router.post("/projects/{project_id}/sementic-search")
def sementic_search_route(
        project_id: int,
        query: str,
        user_id: int = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):

        membership = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id
        ).first()

        if not membership:
            raise HTTPException(status_code=403, detail="Access denied")

        
        chunks = semantic_search(query, project_id, membership.role , db)

        answer = generate_answer(query, chunks)

        return {
            "project_id": project_id,
            "query": query,
            "retrieved_chunks": len(chunks),
            "answer": answer,
            "chunks": chunks
        }
    

@router.post("/projects/{project_id}/keyword-search")
def keyword_search_route(
    project_id: int,
    query: str,
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

    # ----------------------------------------
    # Keyword retrieval
    # ----------------------------------------
    chunks = keyword_search(
        query,
        project_id,
        membership.role,
        db
    )

    return {
        "project_id": project_id,
        "query": query,
        "retrieved_chunks": len(chunks),
        "chunks": chunks
    }

@router.post("/projects/{project_id}/ask")
def ask_route(
        project_id: int,
        query: str,
        user_id: int = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):

        membership = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id
        ).first()

        if not membership:
            raise HTTPException(status_code=403, detail="Access denied")

        
        chunks = hybrid_search(
            query,
            project_id,
            user_id,
            membership.role,
            db
         )

        answer = generate_answer(query, chunks)

        return {
            "project_id": project_id,
            "query": query,
            "retrieved_chunks": len(chunks),
            "answer": answer,
            "chunks": chunks
        }
@router.post("/projects/{project_id}/ask-reranked")
def ask_route_reranked(
        project_id: int,
        query: str,
        user_id: int = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):

        membership = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id
        ).first()

        if not membership:
            raise HTTPException(status_code=403, detail="Access denied")

        
        chunks = hybrid_search_with_rerank(
            query,
            project_id,
            membership.role,
            user_id,
            db
         )

        answer = generate_answer(query, chunks)

        return {
            "project_id": project_id,
            "query": query,
            "reranked_chunks": len(chunks),
            "answer": answer,
            "chunks": chunks
        }

