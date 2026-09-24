from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from database import SessionLocal
from dependencies import get_current_user
from models import ProjectMember, Team, TeamDiscussion, User
from routers.teams.chats.connection_manager import manager
from routers.teams.chats.models_schemas import (
    CreateMessageRequest,
    EditMessageRequest,
    ToggleReactionRequest,
)
from routers.teams.chats.service import (
    create_message,
    delete_message,
    edit_message,
    list_messages,
    toggle_reaction,
)

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _require_project_member(db: Session, project_id: int, user_id: int) -> ProjectMember:
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")
    return membership


def _require_team(db: Session, project_id: int, team_id: int) -> Team:
    team = db.query(Team).filter(Team.team_id == team_id, Team.project_id == project_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


def _require_discussion(db: Session, team_id: int, discussion_id: int) -> TeamDiscussion:
    discussion = (
        db.query(TeamDiscussion)
        .filter(TeamDiscussion.id == discussion_id, TeamDiscussion.team_id == team_id)
        .first()
    )
    if not discussion:
        raise HTTPException(status_code=404, detail="Discussion not found")
    return discussion


# ---------------------------------------------------
# GET MESSAGES
# ---------------------------------------------------
@router.get("/projects/{project_id}/teams/{team_id}/discussions/{discussion_id}/messages")
def get_discussion_messages(
    project_id: int,
    team_id: int,
    discussion_id: int,
    limit: int = Query(10, ge=1, le=100),
    before_id: Optional[int] = Query(None),
    target_id: Optional[int] = Query(None),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_project_member(db, project_id, user_id)
    _require_team(db, project_id, team_id)
    _require_discussion(db, team_id, discussion_id)

    messages = list_messages(
        db, discussion_id, user_id, limit=limit, before_id=before_id, target_id=target_id
    )
    has_more = len(messages) == limit if target_id is None else True
    return {
        "discussion_id": discussion_id,
        "messages": messages,
        "has_more": has_more,
    }


# ---------------------------------------------------
# SEND MESSAGE (REST)
# ---------------------------------------------------
@router.post("/projects/{project_id}/teams/{team_id}/discussions/{discussion_id}/messages")
async def send_discussion_message(
    project_id: int,
    team_id: int,
    discussion_id: int,
    body: CreateMessageRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_project_member(db, project_id, user_id)
    _require_team(db, project_id, team_id)
    _require_discussion(db, team_id, discussion_id)

    msg_data = create_message(
        db,
        discussion_id=discussion_id,
        sender_id=user_id,
        content=body.content,
        parent_message_id=body.parent_message_id,
    )

    # Real-time WebSocket broadcast
    await manager.broadcast(
        discussion_id,
        {
            "event": "new_message",
            "message": msg_data,
        },
    )

    return {"message": "Message sent", "data": msg_data}


# ---------------------------------------------------
# EDIT MESSAGE
# ---------------------------------------------------
@router.patch(
    "/projects/{project_id}/teams/{team_id}/discussions/{discussion_id}/messages/{message_id}"
)
async def update_discussion_message(
    project_id: int,
    team_id: int,
    discussion_id: int,
    message_id: int,
    body: EditMessageRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_project_member(db, project_id, user_id)
    _require_team(db, project_id, team_id)
    _require_discussion(db, team_id, discussion_id)

    updated_msg = edit_message(
        db,
        discussion_id=discussion_id,
        message_id=message_id,
        user_id=user_id,
        new_content=body.content,
    )

    if not updated_msg:
        raise HTTPException(
            status_code=403,
            detail="Cannot edit message: not found, already deleted, or permission denied",
        )

    # Real-time WebSocket broadcast
    await manager.broadcast(
        discussion_id,
        {
            "event": "edit_message",
            "message": updated_msg,
        },
    )

    return {"message": "Message updated", "data": updated_msg}


# ---------------------------------------------------
# DELETE MESSAGE
# ---------------------------------------------------
@router.delete(
    "/projects/{project_id}/teams/{team_id}/discussions/{discussion_id}/messages/{message_id}"
)
async def remove_discussion_message(
    project_id: int,
    team_id: int,
    discussion_id: int,
    message_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = _require_project_member(db, project_id, user_id)
    _require_team(db, project_id, team_id)
    _require_discussion(db, team_id, discussion_id)

    is_admin = membership.role == "admin"
    deleted_msg = delete_message(
        db,
        discussion_id=discussion_id,
        message_id=message_id,
        deleter_user_id=user_id,
        is_admin=is_admin,
    )

    if not deleted_msg:
        raise HTTPException(
            status_code=403,
            detail="Cannot delete message: permission denied or message not found",
        )

    # Real-time WebSocket broadcast
    await manager.broadcast(
        discussion_id,
        {
            "event": "delete_message",
            "message": deleted_msg,
        },
    )

    return {"message": "Message deleted", "data": deleted_msg}


# ---------------------------------------------------
# TOGGLE REACTION
# ---------------------------------------------------
@router.post(
    "/projects/{project_id}/teams/{team_id}/discussions/{discussion_id}/messages/{message_id}/reactions"
)
async def toggle_discussion_message_reaction(
    project_id: int,
    team_id: int,
    discussion_id: int,
    message_id: int,
    body: ToggleReactionRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_project_member(db, project_id, user_id)
    _require_team(db, project_id, team_id)
    _require_discussion(db, team_id, discussion_id)

    updated_msg = toggle_reaction(
        db,
        discussion_id=discussion_id,
        message_id=message_id,
        user_id=user_id,
        emoji=body.emoji,
    )

    if not updated_msg:
        raise HTTPException(
            status_code=400,
            detail="Cannot react to deleted or non-existent message",
        )

    # Real-time WebSocket broadcast
    await manager.broadcast(
        discussion_id,
        {
            "event": "reaction_update",
            "message": updated_msg,
        },
    )

    return {"message": "Reaction updated", "data": updated_msg}


# ---------------------------------------------------
# GET REACTION DETAILS
# ---------------------------------------------------
@router.get(
    "/projects/{project_id}/teams/{team_id}/discussions/{discussion_id}/messages/{message_id}/reactions/details"
)
def get_message_reactions_details_endpoint(
    project_id: int,
    team_id: int,
    discussion_id: int,
    message_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_project_member(db, project_id, user_id)
    _require_team(db, project_id, team_id)
    _require_discussion(db, team_id, discussion_id)

    from routers.teams.chats.service import get_message_reactions_details
    reactors = get_message_reactions_details(db, discussion_id, message_id)
    return {"message_id": message_id, "reactors": reactors}


# ---------------------------------------------------
# WEBSOCKET REAL-TIME ENDPOINT
# ---------------------------------------------------
@router.websocket("/ws/discussions/{discussion_id}")
async def discussion_websocket(
    websocket: WebSocket,
    discussion_id: int,
    token: Optional[str] = Query(None),
):
    if not token:
        await websocket.close(code=4001, reason="Missing auth token")
        return

    db = SessionLocal()
    try:
        from supabase_client import supabase

        res = supabase.auth.get_user(token)
        if not res or not res.user or not res.user.email:
            await websocket.close(code=4001, reason="Invalid token")
            return

        user = db.query(User).filter(User.email == res.user.email).first()
        if not user:
            await websocket.close(code=4001, reason="User not found")
            return

        discussion = db.query(TeamDiscussion).filter(TeamDiscussion.id == discussion_id).first()
        if not discussion:
            await websocket.close(code=4004, reason="Discussion not found")
            return

        # Check membership
        team = db.query(Team).filter(Team.team_id == discussion.team_id).first()
        membership = (
            db.query(ProjectMember)
            .filter(ProjectMember.project_id == team.project_id, ProjectMember.user_id == user.user_id)
            .first()
        )
        if not membership:
            await websocket.close(code=4003, reason="Access denied")
            return

        await manager.connect(discussion_id, websocket)

        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            if action == "send_message":
                content = data.get("content", "").strip()
                parent_id = data.get("parent_message_id")
                if content:
                    new_msg = create_message(
                        db,
                        discussion_id=discussion_id,
                        sender_id=user.user_id,
                        content=content,
                        parent_message_id=parent_id,
                    )
                    await manager.broadcast(
                        discussion_id,
                        {
                            "event": "new_message",
                            "message": new_msg,
                        },
                    )

                    if "@cortex" in content.lower():
                        cleaned_query = content.replace("@Cortex", "").replace("@cortex", "").strip()
                        if not cleaned_query:
                            cleaned_query = content

                        import asyncio
                        asyncio.create_task(
                            _trigger_cortex_discussion_agent_ws(
                                discussion_id=discussion_id,
                                project_id=team.project_id,
                                team_id=discussion.team_id,
                                user_id=user.user_id,
                                user_role=membership.role,
                                query_text=cleaned_query,
                                parent_message_id=new_msg.get("id"),
                            )
                        )
    except WebSocketDisconnect:
        manager.disconnect(discussion_id, websocket)
    except Exception as e:
        print(f"[WebSocket Error] discussion_id={discussion_id}: {e}")
        manager.disconnect(discussion_id, websocket)
    finally:
        db.close()


async def _trigger_cortex_discussion_agent_ws(
    discussion_id: int,
    project_id: int,
    team_id: int,
    user_id: int,
    user_role: str,
    query_text: str,
    parent_message_id: Optional[int] = None,
):
    import asyncio
    from database import SessionLocal
    from routers.teams.chats.connection_manager import manager
    from routers.teams.chats.service import create_ai_message, list_messages
    from agentic.teams.discussion_agent.runner import run_discussion_agent

    db = SessionLocal()
    try:
        await manager.broadcast(
            discussion_id,
            {
                "event": "cortex_thinking",
                "status": "Cortex is thinking...",
                "agent_name": "discussion_agent",
            },
        )

        def ws_event_callback(event_type: str, **data):
            if event_type == "reasoning":
                return

            agent = data.get("agent", "discussion_agent")
            if event_type == "agent_completed" and agent == "discussion_agent":
                return

            agent_display = "Retrieval Agent" if agent == "retrieval_agent" else ("Web Agent" if agent == "web_agent" else "Cortex")

            status_text = f"{agent_display} is working..."
            if event_type == "agent_started":
                status_text = f"{agent_display}: Started task"
            elif event_type == "tool_started":
                tool = data.get("tool", "")
                if tool in ("project_search", "discussion_retrieval_agent"):
                    status_text = "Retrieval Agent: Searching team documents..."
                elif tool in ("web_search", "discussion_web_agent"):
                    status_text = "Web Agent: Searching web..."
                else:
                    status_text = f"{agent_display}: Executing {tool}..."
            elif event_type == "agent_completed":
                status_text = f"{agent_display}: Finalizing response..."

            asyncio.create_task(
                manager.broadcast(
                    discussion_id,
                    {
                        "event": "cortex_thinking",
                        "status": status_text,
                        "agent_name": agent,
                    },
                )
            )

        result = await run_discussion_agent(
            question=query_text,
            project_id=project_id,
            team_id=team_id,
            discussion_id=discussion_id,
            user_id=user_id,
            user_role=user_role,
            db=db,
            event_callback=ws_event_callback,
        )

        ai_msg = create_ai_message(
            db,
            discussion_id=discussion_id,
            content=result.get("answer", ""),
            parent_message_id=parent_message_id,
            ai_sources=result.get("sources"),
            ai_chunks=result.get("chunks"),
        )

        await manager.broadcast(
            discussion_id,
            {
                "event": "new_message",
                "message": ai_msg,
            },
        )

        await manager.broadcast(
            discussion_id,
            {
                "event": "cortex_thinking",
                "status": None,
                "agent_name": None,
            },
        )
    except Exception as e:
        print(f"[Cortex WS Trigger Error] discussion_id={discussion_id}: {e}")
        await manager.broadcast(
            discussion_id,
            {
                "event": "cortex_thinking",
                "status": None,
                "agent_name": None,
            },
        )
    finally:
        db.close()

