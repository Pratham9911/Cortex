from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from sqlalchemy.orm import Session

from database import SessionLocal
from dependencies import get_current_user
from sqlalchemy.sql import func
from models import ProjectMember, Document, DocumentVersion , DocumentChunk
from supabase_client import supabase
import re
from ingestion.extractor import extract_text
from rag.retriever import semantic_search , keyword_search , hybrid_search
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
    # 5. PREPARE TAGS ARRAY
    # tags sent like: hr,policy,important
    # ---------------------------------------------------
    tag_list = []

    if tags.strip():
        tag_list = [
            tag.strip()
            for tag in tags.split(",")
            if tag.strip()
        ]

    # ---------------------------------------------------
    # 6. CREATE DOCUMENT ROW
    # ---------------------------------------------------
    new_document = Document(
        project_id=project_id,
        title=title,
        description=description,
        owner_id=user_id,
        tags=tag_list,

        download_access_level=download_access_level,
        search_access_level=search_access_level
    )

    db.add(new_document)
    db.commit()
    db.refresh(new_document)

    # ---------------------------------------------------
    # 7. VERSION 1 DETAILS
    # ---------------------------------------------------
    version_number = 1

    file_bytes = file.file.read()

    file_size = len(file_bytes)
    mime_type = file.content_type

    # storage path:
    # project/document/version/file
    clean_name = safe_filename(file.filename)

    file_path = f"{project_id}/{new_document.document_id}/v1/{clean_name}"

    # ---------------------------------------------------
    # 8. UPLOAD TO SUPABASE STORAGE
    # ---------------------------------------------------
    supabase.storage.from_("documents").upload(
    path=file_path,
    file=file_bytes,
    file_options={
        "content-type": mime_type
    }
)

    # ---------------------------------------------------
    # 9. CREATE DOCUMENT VERSION ROW
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
    db.commit()

    # ---------------------------------------------------
    # 10. RESPONSE
    # ---------------------------------------------------
    return {
        "message": "Document uploaded successfully",

        "document_id": new_document.document_id,

        "version": 1,

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

    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership:
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    docs = db.query(Document).filter(
        Document.project_id == project_id
    ).all()

    result = []

    for doc in docs:

        active_version = db.query(DocumentVersion).filter(
            DocumentVersion.document_id == doc.document_id,
            DocumentVersion.is_active == True
        ).first()

        result.append({
            "document_id": doc.document_id,
            "title": doc.title,
            "description": doc.description,
            "tags": doc.tags,
            "created_at": doc.created_at,
            "version": active_version.version_number if active_version else None,
            "file_name": active_version.file_name if active_version else None
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
    # 4. Get latest version
    # ----------------------------------------
    latest_version = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document_id
    ).order_by(
        DocumentVersion.version_number.desc()
    ).first()

    next_version = latest_version.version_number + 1

    # ----------------------------------------
    # 5. Deactivate old version
    # ----------------------------------------
    latest_version.is_active = False

    # ----------------------------------------
    # 6. Upload new file
    # ----------------------------------------
    file_bytes = file.file.read()

    clean_name = safe_filename(file.filename)

    file_path = f"{document.project_id}/{document_id}/v{next_version}/{clean_name}"

    supabase.storage.from_("documents").upload(
    path=file_path,
    file=file_bytes,
    file_options={
        "content-type": mime_type
    }
)

    # ----------------------------------------
    # 7. Insert new version row
    # ----------------------------------------
    new_version = DocumentVersion(
        document_id=document_id,
        version_number=next_version,
        storage_path=file_path,
        file_name=file.filename,
        mime_type=file.content_type,
        file_size=len(file_bytes),
        is_active=True,
        uploaded_by=user_id
    )

    db.add(new_version)
    db.commit()

    return {
        "message": "New version uploaded",
        "document_id": document_id,
        "version": next_version
    }

@router.patch("/documents/{document_id}")
def update_document(
    document_id: int,

    title: str = Form(None),
    description: str = Form(None),
    tags: str = Form(None),

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

    if not membership or membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin can update documents"
        )

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
    # Update title
    # ----------------------------------------
    if title is not None:

        existing_doc = db.query(Document).filter(
            Document.project_id == document.project_id,
            Document.title == title,
            Document.document_id != document_id
        ).first()

        if existing_doc:
            raise HTTPException(
                status_code=400,
                detail="Document title already exists in this project"
            )

        document.title = title

    # ----------------------------------------
    # Update description
    # ----------------------------------------
    if description is not None:
        document.description = description

    # ----------------------------------------
    # Update tags
    # ----------------------------------------
    if tags is not None:

        tag_list = [
            tag.strip()
            for tag in tags.split(",")
            if tag.strip()
        ]

        document.tags = tag_list

    # ----------------------------------------
    # Update permissions
    # ----------------------------------------
    if download_access_level is not None:
        document.download_access_level = download_access_level

    if search_access_level is not None:
        document.search_access_level = search_access_level

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
    # Permission checks
    # ----------------------------------------
    access = document.download_access_level

    if access == "none":
        raise HTTPException(
            status_code=403,
            detail="Downloads disabled for this document"
        )

    if access == "admin" and membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admins can download this document"
        )

    # ----------------------------------------
    # Get active version
    # ----------------------------------------
    version = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document_id,
        DocumentVersion.is_active == True
    ).first()

    if not version:
        raise HTTPException(
            status_code=404,
            detail="No active version found"
        )

    # ----------------------------------------
    # Generate signed URL
    # ----------------------------------------
    signed_url_response = supabase.storage.from_("documents").create_signed_url(
        version.storage_path,
        180
    )
    

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


@router.delete("/documents/{document_id}/versions/{version_number}")
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
    
        db.commit()
    
    return {
        "message": "Document version deleted successfully"
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

    # ----------------------------------------
    # Deactivate all versions
    # ----------------------------------------
    all_versions = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document_id
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

