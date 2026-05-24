from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import SessionLocal
from dependencies import get_current_user

from models import (
    Folder,
    Document,
    DocumentVersion,
    ProjectMember,
    User
)

from routers.audit import create_audit_log


router = APIRouter()


# ---------------------------------------------------
# DB
# ---------------------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------
# REQUEST MODELS
# ---------------------------------------------------
class CreateFolderRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)


class UpdateFolderRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)


# ---------------------------------------------------
# CREATE FOLDER
# ---------------------------------------------------
@router.post("/projects/{project_id}/folders")
def create_folder(
    project_id: int,
    request: CreateFolderRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ----------------------------------------
    # Verify admin
    # ----------------------------------------
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership or membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin can create folders"
        )

    # ----------------------------------------
    # Prevent duplicate folder name
    # ----------------------------------------
    existing_folder = db.query(Folder).filter(
        Folder.project_id == project_id,
        func.lower(Folder.name) == request.name.lower()
    ).first()

    if existing_folder:
        raise HTTPException(
            status_code=400,
            detail="Folder already exists"
        )

    # ----------------------------------------
    # Create folder
    # ----------------------------------------
    folder = Folder(
        project_id=project_id,
        name=request.name.strip(),
        created_by=user_id
    )

    db.add(folder)

    # ----------------------------------------
    # Audit log
    # ----------------------------------------
    user = db.query(User).filter(
        User.user_id == user_id
    ).first()

    create_audit_log(
        db=db,
        project_id=project_id,
        user_id=user_id,
        action="create",
        detail=f"{user.name} created folder '{folder.name}'"
    )

    db.commit()
    db.refresh(folder)

    return {
        "message": "Folder created successfully",
        "folder_id": folder.folder_id
    }


# ---------------------------------------------------
# GET FOLDERS
# ---------------------------------------------------
@router.get("/projects/{project_id}/folders")
def get_folders(
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

    folders = db.query(Folder).filter(
        Folder.project_id == project_id
    ).order_by(
        Folder.created_at.asc()
    ).all()

    result = []

    for folder in folders:

        document_count = db.query(Document).filter(
            Document.folder_id == folder.folder_id
        ).count()

        result.append({
            "folder_id": folder.folder_id,
            "name": folder.name,
            "document_count": document_count,
            "created_at": folder.created_at
        })

    return result


# ---------------------------------------------------
# UPDATE FOLDER
# ---------------------------------------------------
@router.patch("/folders/{folder_id}")
def update_folder(
    folder_id: int,
    request: UpdateFolderRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ----------------------------------------
    # Get folder
    # ----------------------------------------
    folder = db.query(Folder).filter(
        Folder.folder_id == folder_id
    ).first()

    if not folder:
        raise HTTPException(
            status_code=404,
            detail="Folder not found"
        )

    # ----------------------------------------
    # Verify admin
    # ----------------------------------------
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == folder.project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership or membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin can update folders"
        )

    # ----------------------------------------
    # Duplicate name check
    # ----------------------------------------
    existing_folder = db.query(Folder).filter(
        Folder.project_id == folder.project_id,
        func.lower(Folder.name) == request.name.lower(),
        Folder.folder_id != folder_id
    ).first()

    if existing_folder:
        raise HTTPException(
            status_code=400,
            detail="Folder name already exists"
        )

    old_name = folder.name

    folder.name = request.name.strip()

    # ----------------------------------------
    # Audit log
    # ----------------------------------------
    user = db.query(User).filter(
        User.user_id == user_id
    ).first()

    create_audit_log(
        db=db,
        project_id=folder.project_id,
        user_id=user_id,
        action="update",
        detail=f"{user.name} renamed folder '{old_name}' to '{folder.name}'"
    )

    db.commit()

    return {
        "message": "Folder updated successfully"
    }

@router.get("/folders/{folder_id}/documents")
def get_folder_documents(
    folder_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ----------------------------------------
    # Get folder
    # ----------------------------------------
    folder = db.query(Folder).filter(
        Folder.folder_id == folder_id
    ).first()

    if not folder:
        raise HTTPException(
            status_code=404,
            detail="Folder not found"
        )

    # ----------------------------------------
    # Verify membership
    # ----------------------------------------
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == folder.project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership:
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    # ----------------------------------------
    # Get folder documents
    # Only visible active documents
    # ----------------------------------------
    documents = db.query(Document).filter(
        Document.folder_id == folder_id
    ).all()

    result = []

    for doc in documents:

        active_version = db.query(DocumentVersion).filter(
            DocumentVersion.document_id == doc.document_id,
            DocumentVersion.is_active == True,
            DocumentVersion.is_deleted == False
        ).first()

        # skip invalid docs
        if not active_version:
            continue

        result.append({

            "document_id": doc.document_id,

            "title": doc.title,
            "description": doc.description,

            "tags": doc.tags,

            "allowed_team_ids": doc.allowed_team_ids,

            "created_at": doc.created_at,

            "version": active_version.version_number,
            "file_name": active_version.file_name

        })

    return {
        "folder_id": folder.folder_id,
        "folder_name": folder.name,
        "documents": result
    }

# ---------------------------------------------------
# DELETE FOLDER
# ---------------------------------------------------
@router.delete("/folders/{folder_id}")
def delete_folder(
    folder_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ----------------------------------------
    # Get folder
    # ----------------------------------------
    folder = db.query(Folder).filter(
        Folder.folder_id == folder_id
    ).first()

    if not folder:
        raise HTTPException(
            status_code=404,
            detail="Folder not found"
        )

    # ----------------------------------------
    # Verify admin
    # ----------------------------------------
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == folder.project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership or membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin can delete folders"
        )

    # ----------------------------------------
    # Remove folder references from documents
    # ----------------------------------------
    documents = db.query(Document).filter(
        Document.folder_id == folder.folder_id
    ).all()

    for doc in documents:
        doc.folder_id = None

    folder_name = folder.name

    # ----------------------------------------
    # Delete folder
    # ----------------------------------------
    db.delete(folder)

    # ----------------------------------------
    # Audit log
    # ----------------------------------------
    user = db.query(User).filter(
        User.user_id == user_id
    ).first()

    create_audit_log(
        db=db,
        project_id=folder.project_id,
        user_id=user_id,
        action="delete",
        detail=f"{user.name} deleted folder '{folder_name}'"
    )

    db.commit()

    return {
        "message": "Folder deleted successfully"
    }