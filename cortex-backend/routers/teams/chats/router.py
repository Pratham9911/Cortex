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
    except WebSocketDisconnect:
        manager.disconnect(discussion_id, websocket)
    except Exception as e:
        print(f"[WebSocket Error] discussion_id={discussion_id}: {e}")
        manager.disconnect(discussion_id, websocket)
    finally:
        db.close()
