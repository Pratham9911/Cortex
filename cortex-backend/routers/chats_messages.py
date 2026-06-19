from typing import Optional

import json
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import SessionLocal
from document_acl import can_download_document, can_search_document
from dependencies import get_current_user
from models import (
    Chat,
    Document,
    DocumentVersion,
    Message,
    Project,
    ProjectMember,
    TeamMember
)
from rag.orchestrator import run_pipeline


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


class AskChatRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000)


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


def _get_owned_chat(
    db: Session,
    chat_id: int,
    user_id: int
) -> Chat:
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

    return chat


def _serialize_chat(chat: Chat) -> dict:
    return {
        "chat_id": chat.chat_id,
        "project_id": chat.project_id,
        "user_id": chat.user_id,
        "title": chat.title,
        "created_at": chat.created_at,
        "updated_at": chat.updated_at
    }


def _title_from_query(query: str) -> str:
    cleaned = " ".join(query.strip().split())
    if not cleaned:
        return "New Chat"

    lowered = cleaned.lower()
    if "compare" in lowered and " and " in lowered:
        candidate = cleaned
        for prefix in ["compare ", "Compare "]:
            if candidate.startswith(prefix):
                candidate = candidate[len(prefix):]
                break
        parts = candidate.split(" and ", 1)
        if len(parts) == 2:
            left = parts[0].strip(" ?.")
            right = parts[1].strip(" ?.")
            if left and right:
                return f"{left} vs {right} Comparison"[:150]

    if len(cleaned) <= 70:
        return cleaned

    return f"{cleaned[:67].rstrip()}..."


def _user_team_ids(db: Session, user_id: int) -> list[int]:
    return [
        member.team_id
        for member in db.query(TeamMember).filter(
            TeamMember.user_id == user_id
        ).all()
    ]


def _normalize_web_sources(raw_sources: list) -> list[dict]:
    normalized = []
    seen_urls = set()

    for source in raw_sources or []:
        if not isinstance(source, dict):
            continue

        url = source.get("url")
        if not url or url in seen_urls:
            continue

        seen_urls.add(url)
        normalized.append({
            "title": source.get("title") or url,
            "url": url,
            "favicon": source.get("favicon"),
            "snippet": source.get("snippet"),
            "score": source.get("score")
        })

    return normalized


def _normalize_document_sources(raw_chunks: list) -> list[dict]:
    normalized = []
    seen = set()

    for item in raw_chunks or []:
        if not isinstance(item, dict):
            continue

        document = item.get("document")
        chunk = item.get("chunk")

        if isinstance(document, dict):
            document_id = document.get("document_id")
            document_title = document.get("title")
            file_name = document.get("file_name")
            version_number = document.get("version")
            page_number = chunk.get("page_number") if isinstance(chunk, dict) else None
        else:
            document_id = item.get("document_id")
            document_title = item.get("document_title")
            file_name = item.get("file_name")
            version_number = item.get("version_number")
            page_number = item.get("page_number")

        if not document_id:
            continue

        source_key = (
            document_id,
            version_number,
            page_number
        )
        if source_key in seen:
            continue

        seen.add(source_key)
        normalized.append({
            "document_id": document_id,
            "document_title": document_title,
            "file_name": file_name,
            "version_number": version_number,
            "page_number": page_number
        })

    return normalized


def _filter_document_sources(
    db: Session,
    chat: Chat,
    user_id: int,
    raw_sources: list
) -> list[dict]:
    project = db.query(Project).filter(
        Project.project_id == chat.project_id
    ).first()

    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == chat.project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not project or not membership:
        return []

    user_team_ids = _user_team_ids(db, user_id)
    filtered = []

    for source in raw_sources or []:
        document_id = source.get("document_id") if isinstance(source, dict) else None
        if not document_id:
            continue

        document = db.query(Document).filter(
            Document.document_id == document_id,
            Document.project_id == chat.project_id
        ).first()

        if not document:
            continue

        active_version = db.query(DocumentVersion).filter(
            DocumentVersion.document_id == document_id,
            DocumentVersion.is_active == True,
            DocumentVersion.is_deleted == False
        ).first()

        if not active_version:
            continue

        if not can_search_document(
            project=project,
            membership=membership,
            document=document,
            user_id=user_id,
            user_team_ids=user_team_ids
        ):
            continue

        filtered.append({
            **source,
            "document_title": source.get("document_title") or document.title,
            "file_name": source.get("file_name") or active_version.file_name,
            "version_number": source.get("version_number") or active_version.version_number,
            "can_download": can_download_document(
                project=project,
                membership=membership,
                document=document,
                user_id=user_id,
                user_team_ids=user_team_ids
            )
        })

    return filtered


def _serialize_sources(
    db: Session,
    chat: Chat,
    user_id: int,
    sources: Optional[dict]
) -> Optional[dict]:
    if not sources:
        return None

    return {
        "intent": sources.get("intent"),
        "web": _normalize_web_sources(sources.get("web", [])),
        "documents": _filter_document_sources(
            db=db,
            chat=chat,
            user_id=user_id,
            raw_sources=sources.get("documents", [])
        )
    }


def _serialize_message(
    db: Session,
    chat: Chat,
    user_id: int,
    message: Message
) -> dict:
    return {
        "message_id": message.message_id,
        "chat_id": message.chat_id,
        "role": message.role,
        "content": message.content,
        "sources": _serialize_sources(
            db=db,
            chat=chat,
            user_id=user_id,
            sources=message.sources
        ),
        "created_at": message.created_at
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
    response: Response,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    response.headers["Cache-Control"] = "no-store"

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
    response: Response,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    response.headers["Cache-Control"] = "no-store"

    chat = _get_owned_chat(
        db=db,
        chat_id=chat_id,
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
    chat = _get_owned_chat(
        db=db,
        chat_id=chat_id,
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
    chat = _get_owned_chat(
        db=db,
        chat_id=chat_id,
        user_id=user_id
    )

    db.query(Message).filter(
        Message.chat_id == chat.chat_id
    ).delete(synchronize_session=False)
    db.delete(chat)
    db.commit()

    return {
        "message": "Chat deleted successfully"
    }


@router.get("/chats/{chat_id}/messages")
def list_messages(
    chat_id: int,
    response: Response,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    response.headers["Cache-Control"] = "no-store"

    chat = _get_owned_chat(
        db=db,
        chat_id=chat_id,
        user_id=user_id
    )

    messages = db.query(Message).filter(
        Message.chat_id == chat.chat_id
    ).order_by(
        Message.created_at.asc(),
        Message.message_id.asc()
    ).all()

    return [
        _serialize_message(
            db=db,
            chat=chat,
            user_id=user_id,
            message=message
        )
        for message in messages
    ]


@router.post("/chats/{chat_id}/ask")
def ask_chat(
    chat_id: int,
    request: AskChatRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    chat = _get_owned_chat(
        db=db,
        chat_id=chat_id,
        user_id=user_id
    )

    membership = _require_project_membership(
        db=db,
        project_id=chat.project_id,
        user_id=user_id
    )

    query = request.query.strip()
    if not query:
        raise HTTPException(
            status_code=400,
            detail="Query is required"
        )

    existing_user_messages = db.query(Message).filter(
        Message.chat_id == chat.chat_id,
        Message.role == "user"
    ).count()

    user_message = Message(
        chat_id=chat.chat_id,
        role="user",
        content=query
    )
    db.add(user_message)

    if existing_user_messages == 0 and not chat.title:
        chat.title = _title_from_query(query)

    chat.updated_at = func.now()
    db.commit()

    def event_generator():
        final_answer = None
        final_intent = None
        web_sources = []
        document_chunks = []

        try:
            for event in run_pipeline(
                query=query,
                project_id=chat.project_id,
                user_id=user_id,
                user_role=membership.role,
                db=db
            ):
                if event.get("type") == "debug" and event.get("step") == "intent":
                    final_intent = event.get("intent")

                if event.get("type") == "sources":
                    web_sources.extend(event.get("sources", []))

                if event.get("type") == "final":
                    final_answer = event.get("answer")
                    final_intent = event.get("intent") or final_intent
                    web_sources.extend(event.get("sources", []))
                    document_chunks.extend(event.get("chunks", []))

                yield (
                    f"data: "
                    f"{json.dumps(event)}"
                    f"\n\n"
                )

            if final_answer is None:
                final_answer = (
                    "I could not generate a final answer for this request."
                )

            assistant_message = Message(
                chat_id=chat.chat_id,
                role="assistant",
                content=final_answer,
                sources={
                    "intent": final_intent or "unknown",
                    "web": _normalize_web_sources(web_sources),
                    "documents": _normalize_document_sources(document_chunks)
                }
            )
            db.add(assistant_message)
            chat.updated_at = func.now()
            db.commit()

            yield (
                "event: done\n"
                "data: complete\n\n"
            )

        except Exception as e:
            db.rollback()

            fallback_answer = (
                "I ran into an error while generating this answer. "
                "Please try again."
            )

            try:
                assistant_message = Message(
                    chat_id=chat.chat_id,
                    role="assistant",
                    content=fallback_answer,
                    sources={
                        "intent": final_intent or "unknown",
                        "web": [],
                        "documents": []
                    }
                )
                db.add(assistant_message)
                chat.updated_at = func.now()
                db.commit()
            except Exception:
                db.rollback()

            error_event = {
                "type": "error",
                "message": str(e)
            }

            yield (
                f"data: "
                f"{json.dumps(error_event)}"
                f"\n\n"
            )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )
