import time
import asyncio
from uuid import uuid4
from typing import Optional

import json
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from langchain_core.messages import HumanMessage

from database import SessionLocal
from document_acl import can_download_document, can_search_document
from dependencies import get_current_user
from models import (
    Chat,
    ChatHistory,
    Document,
    DocumentVersion,
    Message,
    Project,
    ProjectMember,
    TeamMember
)
from rag.orchestrator import run_pipeline

import agentic.main_graph as main_graph
from agentic.checkpointer import delete_checkpoint
from agentic.tools import set_active_event_callback, set_active_project_context
from agentic.memory.short_term.stm_db import (
    load_chat_history,
    extract_summary_text,
    check_and_summarize_db,
)


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
    is_agent: Optional[bool] = False
    document_ids: Optional[list[int]] = Field(default=None, description="Optional list of document IDs to restrict RAG/Agent search to.")


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


def _coalesce_document_sources(raw_sources: list) -> list[dict]:
    """Merge per-page document rows into one entry per document/version with page_numbers."""
    grouped: dict[tuple, dict] = {}

    for source in raw_sources or []:
        if not isinstance(source, dict):
            continue

        document_id = source.get("document_id")
        if not document_id:
            continue

        version_number = source.get("version_number")
        key = (document_id, version_number)

        pages: list[int] = []
        if isinstance(source.get("page_numbers"), list):
            pages = [
                int(page)
                for page in source["page_numbers"]
                if page is not None
            ]
        elif source.get("page_number") is not None:
            pages = [int(source["page_number"])]

        if key not in grouped:
            grouped[key] = {
                "document_id": document_id,
                "document_title": source.get("document_title"),
                "file_name": source.get("file_name"),
                "version_number": version_number,
                "page_numbers": [],
            }

        entry = grouped[key]
        if not entry.get("document_title") and source.get("document_title"):
            entry["document_title"] = source.get("document_title")
        if not entry.get("file_name") and source.get("file_name"):
            entry["file_name"] = source.get("file_name")

        for page in pages:
            if page not in entry["page_numbers"]:
                entry["page_numbers"].append(page)

    result = []
    for entry in grouped.values():
        entry["page_numbers"].sort()
        result.append(entry)

    return result


def _normalize_document_sources(raw_chunks: list) -> list[dict]:
    flat_sources = []

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

        flat_sources.append({
            "document_id": document_id,
            "document_title": document_title,
            "file_name": file_name,
            "version_number": version_number,
            "page_number": page_number,
        })

    return _coalesce_document_sources(flat_sources)


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

    for source in _coalesce_document_sources(raw_sources):
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
            "document_id": document_id,
            "document_title": source.get("document_title") or document.title,
            "file_name": source.get("file_name") or active_version.file_name,
            "version_number": source.get("version_number") or active_version.version_number,
            "page_numbers": source.get("page_numbers") or [],
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

    res = {
        "intent": sources.get("intent"),
        "mode": sources.get("mode", "normal"),
        "latency_ms": sources.get("latency_ms"),
        "web": _normalize_web_sources(sources.get("web", [])),
        "documents": _filter_document_sources(
            db=db,
            chat=chat,
            user_id=user_id,
            raw_sources=sources.get("documents", [])
        )
    }
    if "reasoning" in sources:
        res["reasoning"] = sources["reasoning"]
    if "input_tokens" in sources:
        res["input_tokens"] = sources["input_tokens"]
    if "output_tokens" in sources:
        res["output_tokens"] = sources["output_tokens"]
    if "total_tokens" in sources:
        res["total_tokens"] = sources["total_tokens"]
    return res


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

    db.query(ChatHistory).filter(
        ChatHistory.chat_id == chat.chat_id
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
    limit: int = Query(default=20, ge=1, le=100),
    before_message_id: Optional[int] = Query(default=None, ge=1),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    response.headers["Cache-Control"] = "no-store"

    chat = _get_owned_chat(
        db=db,
        chat_id=chat_id,
        user_id=user_id
    )

    query = db.query(Message).filter(
        Message.chat_id == chat.chat_id,
        Message.role != "system"
    )
    if before_message_id is not None:
        query = query.filter(Message.message_id < before_message_id)

    messages = query.order_by(
        Message.created_at.desc(),
        Message.message_id.desc()
    ).limit(limit + 1).all()
    has_more = len(messages) > limit
    response.headers["X-Has-More"] = "true" if has_more else "false"
    messages = list(reversed(messages[:limit]))

    return [
        _serialize_message(
            db=db,
            chat=chat,
            user_id=user_id,
            message=message
        )
        for message in messages
    ]


class CreateMessageRequest(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1)
    sources: Optional[dict] = None


@router.post("/chats/{chat_id}/messages")
def create_message(
    chat_id: int,
    request: CreateMessageRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Save a single message to the chat (used for cancellation notices, etc.)."""
    chat = _get_owned_chat(
        db=db,
        chat_id=chat_id,
        user_id=user_id
    )

    message = Message(
        chat_id=chat.chat_id,
        role=request.role,
        content=request.content,
        sources=request.sources,
    )
    db.add(message)
    chat.updated_at = func.now()
    db.commit()
    db.refresh(message)

    return _serialize_message(
        db=db,
        chat=chat,
        user_id=user_id,
        message=message
    )


def _emit_sse(event_type: str, **data):
    payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload)}\n\n"


def _emit_interrupt(thread_id: str, interrupt_value):
    payload = dict(interrupt_value) if isinstance(interrupt_value, dict) else {
        "details": str(interrupt_value)
    }
    payload.pop("thread_id", None)
    payload.setdefault("agent", "main")
    return _emit_sse("interrupt", thread_id=thread_id, **payload)


async def _stream_workflow_helper(workflow, input_data, config=None):
    event_queue = asyncio.Queue()
    stream_completed = False

    def forward_event(event_type: str, *args, **data):
        agent_val = data.pop("agent", None) or (args[0] if args else "main")
        event_type = {
            "gmail_agent_started": "agent_started",
            "gmail_tool_started": "tool_started",
            "gmail_tool_completed": "tool_completed",
            "gmail_agent_completed": "agent_completed",
        }.get(event_type, event_type)
        event_queue.put_nowait(("event", event_type, {"agent": agent_val, **data}))

    async def produce():
        set_active_event_callback(forward_event)
        completed_normally = False
        try:
            async for update in workflow.astream(
                input_data,
                config=config,
                stream_mode="updates",
            ):
                await event_queue.put(("update", update, None))
            completed_normally = True
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await event_queue.put(("error", exc, None))
        finally:
            set_active_event_callback(None)
        if completed_normally:
            await event_queue.put(("done", None, None))

    task = asyncio.create_task(produce())
    try:
        while True:
            item = await event_queue.get()
            if item[0] == "done":
                stream_completed = True
                break
            if item[0] == "error":
                raise item[1]
            yield item
    finally:
        if not task.done():
            if stream_completed:
                await task
            else:
                task.cancel()

        try:
            await task
        except asyncio.CancelledError:
            pass


@router.post("/chats/{chat_id}/ask")
async def ask_chat(
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

    is_agent = bool(request.is_agent)
    start_time = time.time()

    async def event_generator():
        final_answer = None
        final_intent = None
        web_sources = []
        document_chunks = []
        activities = []

        try:
            # Check and load short-term memory
            history_messages = check_and_summarize_db(db, chat.chat_id)
            prior_history = [
                m for m in history_messages
                if not (isinstance(m, HumanMessage) and m.content == query)
            ]
            summary_ctx = extract_summary_text(prior_history)

            if not is_agent:
                input_tokens = 0
                output_tokens = 0
                total_tokens = 0
                for event in run_pipeline(
                    query=query,
                    project_id=chat.project_id,
                    user_id=user_id,
                    user_role=membership.role,
                    db=db,
                    history=prior_history,
                    summary_context=summary_ctx,
                    document_ids=request.document_ids
                ):
                    if event.get("type") == "debug" and event.get("step") == "intent":
                        final_intent = event.get("intent")

                    if event.get("type") == "sources":
                        web_sources.extend(event.get("sources", []))

                    stream_event = event
                    if event.get("type") == "final":
                        final_answer = event.get("answer")
                        final_intent = event.get("intent") or final_intent
                        input_tokens = event.get("input_tokens", input_tokens) or 0
                        output_tokens = event.get("output_tokens", output_tokens) or 0
                        total_tokens = event.get("total_tokens")
                        if total_tokens is None:
                            total_tokens = input_tokens + output_tokens
                        web_sources.extend(event.get("sources", []))
                        document_chunks.extend(event.get("chunks", []))
                        stream_event = {
                            **event,
                            "sources": _normalize_web_sources(web_sources),
                            "chunks": _normalize_document_sources(document_chunks),
                        }

                    yield f"data: {json.dumps(stream_event)}\n\n"

                if final_answer is None:
                    final_answer = "I could not generate a final answer for this request."

                latency_ms = int((time.time() - start_time) * 1000)

                assistant_message = Message(
                    chat_id=chat.chat_id,
                    role="assistant",
                    content=final_answer,
                    sources={
                        "intent": final_intent or "unknown",
                        "mode": "normal",
                        "latency_ms": latency_ms,
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "total_tokens": total_tokens,
                        "web": _normalize_web_sources(web_sources),
                        "documents": _normalize_document_sources(document_chunks)
                    }
                )
                db.add(assistant_message)
                chat.updated_at = func.now()
                db.commit()

                # Post-response memory check & compaction
                check_and_summarize_db(db, chat.chat_id)

                yield "event: done\ndata: complete\n\n"

            else:
                stream_db = SessionLocal()
                thread_id = str(uuid4())
                config = {"configurable": {"thread_id": thread_id}}

                initial_state = {
                    "messages": [*prior_history, HumanMessage(content=query)],
                    "question": query,
                    "answer": "",
                    "reasoning": "",
                    "tool_calls": [],
                    "sources": [],
                    "chunks": [],
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "iterations": 0,
                }

                pending_events = []
                def sub_event_emitter(event_type: str, *args, **data):
                    agent_val = data.pop("agent", None) or (args[0] if args else "main")
                    pending_events.append((event_type, {"agent": agent_val, **data}))

                yield _emit_sse("agent_started", agent="main", thread_id=thread_id)

                set_active_event_callback(sub_event_emitter)
                set_active_project_context(
                    project_id=chat.project_id,
                    user_id=user_id,
                    user_role=membership.role,
                    db=stream_db,
                    thread_id=thread_id,
                    document_ids=request.document_ids
                )

                is_interrupted = False
                input_tokens = 0
                output_tokens = 0

                try:
                    workflow = main_graph.workflow or main_graph.build_workflow()
                    async for stream_kind, stream_value, stream_data in _stream_workflow_helper(
                        workflow, initial_state, config=config
                    ):
                        if stream_kind == "event":
                            sub_type = stream_value
                            agent_name = stream_data.get("agent", "main")
                            AGENT_TOOLS = {"web_agent", "retrieval_agent", "github_agent", "gmail_agent"}
                            def _get_agent_display(name_str: str) -> str:
                                if name_str == "web_agent": return "Web"
                                if name_str == "retrieval_agent": return "Project"
                                if name_str == "github_agent": return "GitHub"
                                if name_str == "gmail_agent": return "Gmail"
                                return "Main"

                            if sub_type == "agent_started":
                                display_name = _get_agent_display(agent_name)
                                activities.append({
                                    "agent": agent_name,
                                    "kind": "status",
                                    "content": "Planning the request..." if agent_name == "main" else f"{display_name} agent started"
                                })
                            elif sub_type == "reasoning":
                                content_val = stream_data.get("content") or ""
                                if content_val:
                                    activities.append({"agent": agent_name, "kind": "thought", "content": content_val})
                            elif sub_type == "tool_started":
                                tool = stream_data.get("tool") or "unknown"
                                tool_agent = tool if tool in AGENT_TOOLS else agent_name
                                label = "Searching web" if tool == "web_agent" else "Searching project" if tool == "retrieval_agent" else "Searching GitHub" if tool == "github_agent" else f"Using {tool}"
                                args = stream_data.get("args")
                                args_str = f" {json.dumps(args)}" if args else ""
                                content = label if tool in AGENT_TOOLS else f"{label}{args_str}"
                                activities.append({"agent": tool_agent, "kind": "tool", "label": label, "content": content})
                            elif sub_type == "tool_completed":
                                tool = stream_data.get("tool") or ""
                                if tool in AGENT_TOOLS:
                                    display_name = _get_agent_display(tool)
                                    activities.append({"agent": tool, "kind": "status", "content": f"{display_name} search complete"})
                            elif sub_type == "agent_completed" and agent_name != "main":
                                display_name = _get_agent_display(agent_name)
                                activities.append({"agent": agent_name, "kind": "status", "content": f"{display_name} agent finished"})

                            yield _emit_sse(sub_type, **stream_data)
                            continue

                        update = stream_value
                        for node_name, node_update in update.items():
                            if node_name == "__interrupt__":
                                is_interrupted = True
                                interrupt_val = node_update[0].value if node_update else {}
                                yield _emit_interrupt(thread_id, interrupt_val)
                                break

                            if node_name in ("chat_node", "force_synthesis_node"):
                                reasoning = node_update.get("reasoning", "")
                                answer = node_update.get("answer", "")
                                tool_calls = node_update.get("tool_calls", [])
                                iteration = node_update.get("iterations")

                                if answer:
                                    final_answer = answer
                                input_tokens = node_update.get("input_tokens", input_tokens)
                                output_tokens = node_update.get("output_tokens", output_tokens)

                                if reasoning:
                                    activities.append({"agent": "main", "kind": "thought", "content": reasoning})
                                    yield _emit_sse("reasoning", agent="main", iteration=iteration, content=reasoning)

                                for tc in tool_calls:
                                    t_name = tc.get("name", "tool")
                                    t_args = tc.get("args")
                                    t_agent = t_name if t_name in {"web_agent", "retrieval_agent", "github_agent", "gmail_agent"} else "main"
                                    t_label = "Searching web" if t_name == "web_agent" else "Searching project" if t_name == "retrieval_agent" else "Searching GitHub" if t_name == "github_agent" else f"Using {t_name}"
                                    t_content = t_label if t_name in {"web_agent", "retrieval_agent"} else f"{t_label}{f' {json.dumps(t_args)}' if t_args else ''}"
                                    activities.append({"agent": t_agent, "kind": "tool", "label": t_label, "content": t_content})
                                    yield _emit_sse("tool_started", agent="main", iteration=iteration, tool=t_name, args=tc.get("args"), call_id=tc.get("id"))

                            elif node_name == "tool_node":
                                activities.append({"agent": "main", "kind": "status", "content": "Sub-agent complete"})
                                yield _emit_sse("tool_completed", agent="main", tool="sub_agent")

                            elif node_name == "collect_tool_results":
                                sources = node_update.get("sources", [])
                                chunks = node_update.get("chunks", [])
                                if sources:
                                    web_sources = sources
                                if chunks:
                                    document_chunks = chunks

                        if is_interrupted:
                            return

                    delete_checkpoint(thread_id, stream_db)

                finally:
                    set_active_event_callback(None)
                    set_active_project_context(None)
                    stream_db.close()

                if not final_answer:
                    final_answer = "Agent workflow completed."

                latency_ms = int((time.time() - start_time) * 1000)

                assistant_message = Message(
                    chat_id=chat.chat_id,
                    role="assistant",
                    content=final_answer,
                    sources={
                        "intent": "cortex-agent",
                        "mode": "agent",
                        "latency_ms": latency_ms,
                        "reasoning": activities,
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "total_tokens": input_tokens + output_tokens,
                        "web": _normalize_web_sources(web_sources),
                        "documents": _normalize_document_sources(document_chunks)
                    }
                )
                db.add(assistant_message)
                chat.updated_at = func.now()
                db.commit()

                # Post-response memory check & compaction
                check_and_summarize_db(db, chat.chat_id)

                yield _emit_sse(
                    "agent_completed",
                    agent="main",
                    thread_id=thread_id,
                    answer=final_answer,
                    sources=_normalize_web_sources(web_sources),
                    chunks=_normalize_document_sources(document_chunks),
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=input_tokens + output_tokens,
                )
                yield "event: done\ndata: complete\n\n"

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
                        "mode": "agent" if is_agent else "normal",
                        "latency_ms": int((time.time() - start_time) * 1000),
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

            yield f"data: {json.dumps(error_event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )

