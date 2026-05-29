from typing import Optional
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
    DocumentChunk,
    ProjectMember,
    User,
    Team,
    TeamMember
)

from routers.audit import create_audit_log
from supabase_client import supabase


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
    allowed_team_ids: Optional[list[int]] = None


class UpdateFolderRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    allowed_team_ids: Optional[list[int]] = None


def _validate_folder_team_ids(
    db: Session,
    project_id: int,
    team_ids: Optional[list[int]]
) -> Optional[list[int]]:
    if not team_ids:
        return None

    cleaned = sorted(set(team_ids))
    existing = db.query(Team).filter(
        Team.project_id == project_id,
        Team.team_id.in_(cleaned)
    ).all()

    if len(existing) != len(cleaned):
        raise HTTPException(
            status_code=400,
            detail="One or more teams are invalid"
        )

    return cleaned


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
        created_by=user_id,
        modified_by=user_id,
        allowed_team_ids=_validate_folder_team_ids(db, project_id, request.allowed_team_ids)
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

    user_team_ids = [
        member.team_id
        for member in db.query(TeamMember).filter(
            TeamMember.user_id == user_id
        ).all()
    ]

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

        is_locked_for_user = False
        if membership.role != "admin":
            folder_team_ids = folder.allowed_team_ids or []
            is_locked_for_user = not bool(set(folder_team_ids) & set(user_team_ids))

        result.append({
            "folder_id": folder.folder_id,
            "name": folder.name,
            "document_count": document_count,
            "created_by": folder.created_by,
            "created_at": folder.created_at,
            "last_modified": folder.last_modified,
            "modified_by": folder.modified_by,
            "allowed_team_ids": folder.allowed_team_ids or [],
            "is_locked_for_user": is_locked_for_user
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
    # Update fields
    # ----------------------------------------
    user = db.query(User).filter(
        User.user_id == user_id
    ).first()

    if request.name is not None:
        # Duplicate name check
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

        create_audit_log(
            db=db,
            project_id=folder.project_id,
            user_id=user_id,
            action="update",
            detail=f"{user.name} renamed folder '{old_name}' to '{folder.name}'"
        )

    if request.allowed_team_ids is not None:
        old_team_ids = folder.allowed_team_ids or []
        new_team_ids = _validate_folder_team_ids(db, folder.project_id, request.allowed_team_ids)
        folder.allowed_team_ids = new_team_ids

        create_audit_log(
            db=db,
            project_id=folder.project_id,
            user_id=user_id,
            action="update",
            detail=(
                f"{user.name} updated folder '{folder.name}' access teams "
                f"from {old_team_ids} to {new_team_ids or []}"
            )
        )

    folder.modified_by = user_id
    folder.last_modified = func.now()

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
    # Verify folder access
    # ----------------------------------------
    if membership.role != "admin":
        user_team_ids = [
            member.team_id
            for member in db.query(TeamMember).filter(
                TeamMember.user_id == user_id
            ).all()
        ]

        allowed_team_ids = folder.allowed_team_ids or []
        has_access = bool(set(allowed_team_ids) & set(user_team_ids))
        if not has_access:
            raise HTTPException(
                status_code=403,
                detail="You do not have access to this folder"
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
            "last_modified": doc.last_modified,
            "modified_by": doc.modified_by,
            "owner_id": doc.owner_id,

            "version": active_version.version_number,
            "file_name": active_version.file_name,
            "file_size": active_version.file_size

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
    delete_documents: bool = False,
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
    # Process documents in folder
    # ----------------------------------------
    documents = db.query(Document).filter(
        Document.folder_id == folder.folder_id
    ).all()

    if delete_documents:
        for doc in documents:
            versions = db.query(DocumentVersion).filter(
                DocumentVersion.document_id == doc.document_id,
                DocumentVersion.is_deleted == False
            ).all()
            
            for version in versions:
                version.is_deleted = True
                version.deleted_at = func.now()
                version.deleted_by = user_id
                version.is_active = False
            
            doc.last_modified = func.now()
            doc.modified_by = user_id
            doc.folder_id = None
    else:
        for doc in documents:
            doc.last_modified = func.now()
            doc.modified_by = user_id
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
