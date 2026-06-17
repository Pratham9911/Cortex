from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import SessionLocal
from dependencies import get_current_user
from models import Chat, Project, ProjectMember


router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class CreateChatRequest(BaseModel):
    title: Optional[str] = Field(None, max_length=150)


class UpdateChatRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=150)


def _require_project_membership(
    db: Session,
    project_id: int,
    user_id: int
) -> ProjectMember:
    project = db.query(Project).filter(
        Project.project_id == project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership:
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    return membership


def _serialize_chat(chat: Chat) -> dict:
    return {
        "chat_id": chat.chat_id,
        "project_id": chat.project_id,
        "user_id": chat.user_id,
        "title": chat.title,
        "created_at": chat.created_at,
        "updated_at": chat.updated_at
    }


@router.post("/projects/{project_id}/chats")
def create_chat(
    project_id: int,
    request: CreateChatRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _require_project_membership(
        db=db,
        project_id=project_id,
        user_id=user_id
    )

    chat = Chat(
        project_id=project_id,
        user_id=user_id,
        title=request.title.strip() if request.title else None
    )

    db.add(chat)
    db.commit()
    db.refresh(chat)

    return {
        "message": "Chat created successfully",
        "chat": _serialize_chat(chat)
    }


@router.get("/projects/{project_id}/chats")
def list_chats(
    project_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _require_project_membership(
        db=db,
        project_id=project_id,
        user_id=user_id
    )

    chats = db.query(Chat).filter(
        Chat.project_id == project_id,
        Chat.user_id == user_id
    ).order_by(
        Chat.updated_at.desc()
    ).all()

    return [
        _serialize_chat(chat)
        for chat in chats
    ]


@router.get("/chats/{chat_id}")
def get_chat(
    chat_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    chat = db.query(Chat).filter(
        Chat.chat_id == chat_id,
        Chat.user_id == user_id
    ).first()

    if not chat:
        raise HTTPException(
            status_code=404,
            detail="Chat not found"
        )

    _require_project_membership(
        db=db,
        project_id=chat.project_id,
        user_id=user_id
    )

    return _serialize_chat(chat)


@router.patch("/chats/{chat_id}")
def update_chat(
    chat_id: int,
    request: UpdateChatRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    chat = db.query(Chat).filter(
        Chat.chat_id == chat_id,
        Chat.user_id == user_id
    ).first()

    if not chat:
        raise HTTPException(
            status_code=404,
            detail="Chat not found"
        )

    _require_project_membership(
        db=db,
        project_id=chat.project_id,
        user_id=user_id
    )

    chat.title = request.title.strip()
    chat.updated_at = func.now()

    db.commit()
    db.refresh(chat)

    return {
        "message": "Chat updated successfully",
        "chat": _serialize_chat(chat)
    }


@router.delete("/chats/{chat_id}")
def delete_chat(
    chat_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    chat = db.query(Chat).filter(
        Chat.chat_id == chat_id,
        Chat.user_id == user_id
    ).first()

    if not chat:
        raise HTTPException(
            status_code=404,
            detail="Chat not found"
        )

    _require_project_membership(
        db=db,
        project_id=chat.project_id,
        user_id=user_id
    )

    db.delete(chat)
    db.commit()

    return {
        "message": "Chat deleted successfully"
    }
