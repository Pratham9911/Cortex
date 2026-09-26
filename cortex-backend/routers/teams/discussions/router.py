from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from routers.teams.chats.connection_manager import manager as ws_manager
from routers.teams.chats.service import format_message

from database import SessionLocal
from dependencies import get_current_user
from models import (
    Document,
    DocumentVersion,
    Folder,
    ProjectMember,
    Team,
    TeamDiscussion,
    DiscussionMessage,
    User,
    Decision,
    DecisionParticipant,
)
from routers.teams.discussions.models_schemas import (
    CreateDiscussionRequest,
    UpdateDiscussionRequest,
)
from routers.teams.discussions.service import delete_team_discussions


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
# SHARED GUARDS
# ---------------------------------------------------

def _require_project_member(
    db: Session,
    project_id: int,
    user_id: int,
) -> ProjectMember:
    """Return the ProjectMember row or raise 403."""
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first()

    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")

    return membership


def _require_admin(membership: ProjectMember) -> None:
    """Raise 403 if the membership is not admin."""
    if membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only project admins can perform this action",
        )


def _require_team(
    db: Session,
    project_id: int,
    team_id: int,
) -> Team:
    """Return the Team row (scoped to project) or raise 404."""
    team = db.query(Team).filter(
        Team.team_id == team_id,
        Team.project_id == project_id,
    ).first()

    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    return team


def _require_discussion(
    db: Session,
    team_id: int,
    discussion_id: int,
) -> TeamDiscussion:
    """Return the TeamDiscussion row (scoped to team) or raise 404."""
    discussion = db.query(TeamDiscussion).filter(
        TeamDiscussion.id == discussion_id,
        TeamDiscussion.team_id == team_id,
    ).first()

    if not discussion:
        raise HTTPException(status_code=404, detail="Discussion not found")

    return discussion


# ---------------------------------------------------
# CREATE DISCUSSION
# Admin only
# ---------------------------------------------------
@router.post("/projects/{project_id}/teams/{team_id}/discussions")
def create_discussion(
    project_id: int,
    team_id: int,
    body: CreateDiscussionRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = _require_project_member(db, project_id, user_id)
    _require_team(db, project_id, team_id)

    # Prevent duplicate names within the same team (case-insensitive)
    existing = db.query(TeamDiscussion).filter(
        TeamDiscussion.team_id == team_id,
        func.lower(TeamDiscussion.name) == body.name.lower(),
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="A discussion with this name already exists in the team",
        )

    discussion = TeamDiscussion(
        team_id=team_id,
        name=body.name,
        description=body.description,
        is_pinned=body.is_pinned or False,
        created_by=user_id,
    )

    db.add(discussion)
    db.commit()
    db.refresh(discussion)

    return {
        "message": "Discussion created successfully",
        "discussion": _format_discussion(discussion),
    }


# ---------------------------------------------------
# LIST DISCUSSIONS
# Any project member
# ---------------------------------------------------
@router.get("/projects/{project_id}/teams/{team_id}/discussions")
def list_discussions(
    project_id: int,
    team_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_project_member(db, project_id, user_id)
    _require_team(db, project_id, team_id)

    discussions = db.query(TeamDiscussion).filter(
        TeamDiscussion.team_id == team_id,
    ).order_by(TeamDiscussion.is_pinned.desc(), TeamDiscussion.created_at.asc()).all()

    return {
        "team_id": team_id,
        "discussions": [_format_discussion(d) for d in discussions],
    }


# ---------------------------------------------------
# GET SINGLE DISCUSSION
# Any project member
# ---------------------------------------------------
@router.get("/projects/{project_id}/teams/{team_id}/discussions/{discussion_id}")
def get_discussion(
    project_id: int,
    team_id: int,
    discussion_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_project_member(db, project_id, user_id)
    _require_team(db, project_id, team_id)
    discussion = _require_discussion(db, team_id, discussion_id)

    creator = db.query(User).filter(User.user_id == discussion.created_by).first()

    return {
        **_format_discussion(discussion),
        "created_by_name": creator.name if creator else "Unknown User",
        "created_by_email": creator.email if creator else None,
        "created_by_avatar": creator.avatar_url if creator else None,
    }


# ---------------------------------------------------
# UPDATE DISCUSSION
# Admin only
# ---------------------------------------------------
@router.patch("/projects/{project_id}/teams/{team_id}/discussions/{discussion_id}")
def update_discussion(
    project_id: int,
    team_id: int,
    discussion_id: int,
    body: UpdateDiscussionRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = _require_project_member(db, project_id, user_id)
    _require_team(db, project_id, team_id)
    discussion = _require_discussion(db, team_id, discussion_id)

    # If renaming, check uniqueness
    if body.name is not None and body.name.lower() != discussion.name.lower():
        conflict = db.query(TeamDiscussion).filter(
            TeamDiscussion.team_id == team_id,
            TeamDiscussion.id != discussion_id,
            func.lower(TeamDiscussion.name) == body.name.lower(),
        ).first()

        if conflict:
            raise HTTPException(
                status_code=400,
                detail="A discussion with this name already exists in the team",
            )

        discussion.name = body.name

    # description: None means "don't touch", empty-stripped string clears it
    if body.description is not None:
        discussion.description = body.description if body.description else None

    if body.is_pinned is not None:
        discussion.is_pinned = body.is_pinned

    db.commit()
    db.refresh(discussion)

    return {
        "message": "Discussion updated successfully",
        "discussion": _format_discussion(discussion),
    }


# ---------------------------------------------------
# DELETE DISCUSSION
# Admin only — wipes all related data via service
# ---------------------------------------------------
@router.delete("/projects/{project_id}/teams/{team_id}/discussions/{discussion_id}")
def delete_discussion(
    project_id: int,
    team_id: int,
    discussion_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = _require_project_member(db, project_id, user_id)
    _require_admin(membership)
    _require_team(db, project_id, team_id)
    discussion = _require_discussion(db, team_id, discussion_id)

    from routers.teams.discussions.service import delete_single_discussion_data
    delete_single_discussion_data(db, discussion.id)

    db.delete(discussion)
    db.commit()

    return {"message": "Discussion deleted successfully"}


# ---------------------------------------------------
# INTERNAL FORMATTER
# ---------------------------------------------------
def _format_discussion(d: TeamDiscussion) -> dict:
    return {
        "id": d.id,
        "team_id": d.team_id,
        "name": d.name,
        "description": d.description,
        "is_pinned": bool(getattr(d, "is_pinned", False)),
        "created_by": d.created_by,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }


# ---------------------------------------------------
# TEAM-SCOPED DOCUMENTS (for discussion doc-selector)
# ---------------------------------------------------
@router.get("/projects/{project_id}/teams/{team_id}/documents")
def list_team_documents(
    project_id: int,
    team_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return documents that belong to this team and are searchable by the user."""
    _require_project_member(db, project_id, user_id)

    # Verify team belongs to project
    team = db.query(Team).filter(
        Team.team_id == team_id,
        Team.project_id == project_id,
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    # All documents in this project that include team_id in allowed_team_ids
    docs = db.query(Document).filter(
        Document.project_id == project_id,
    ).all()

    result = []
    for doc in docs:
        # Must belong to this team
        if team_id not in (doc.allowed_team_ids or []):
            continue

        # Must have an active, non-deleted version
        active_version = db.query(DocumentVersion).filter(
            DocumentVersion.document_id == doc.document_id,
            DocumentVersion.is_active == True,
            DocumentVersion.is_deleted == False,
        ).first()
        if not active_version:
            continue

        folder_name = None
        if doc.folder_id:
            folder = db.query(Folder).filter(Folder.folder_id == doc.folder_id).first()
            if folder:
                folder_name = folder.name

        result.append({
            "document_id": doc.document_id,
            "title": doc.title,
            "description": doc.description,
            "folder_id": doc.folder_id,
            "folder_name": folder_name,
            "allowed_team_ids": doc.allowed_team_ids,
            "download_access_level": doc.download_access_level,
            "search_access_level": doc.search_access_level,
            "active_version": active_version.version_number,
            "active_version_id": active_version.version_id,
            "status": active_version.status,
            "file_name": active_version.file_name,
            "file_size": active_version.file_size,
        })

    return result


# ---------------------------------------------------
# DECISION HITL APPROVAL ENDPOINTS
# ---------------------------------------------------

from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class EditApproveDecisionRequest(BaseModel):
    title: str
    description: str
    participants: Optional[List[Dict[str, Any]]] = None


@router.get("/projects/{project_id}/teams/{team_id}/decisions/{decision_id}/status")
def get_decision_status(
    project_id: int,
    team_id: int,
    decision_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current status and full details of a decision (for UI sync)."""
    _require_project_member(db, project_id, user_id)

    decision = db.query(Decision).filter(
        Decision.id == decision_id,
        Decision.team_id == team_id
    ).first()

    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    approved_by_name = None
    rejected_by_name = None
    if decision.approved_by:
        approver = db.query(User).filter(User.user_id == decision.approved_by).first()
        name = approver.name if approver else "Admin"
        if decision.status == "approved":
            approved_by_name = name
        elif decision.status == "rejected":
            rejected_by_name = name

    # Retrieve participants
    participants_rows = db.query(DecisionParticipant, User).join(
        User, DecisionParticipant.user_id == User.user_id
    ).filter(DecisionParticipant.decision_id == decision_id).all()

    participants = [
        {
            "user_id": p.user_id,
            "name": u.name,
            "role": p.role or "Participant",
            "avatar_url": u.avatar_url,
        }
        for p, u in participants_rows
    ]

    return {
        "decision_id": decision.id,
        "title": decision.title,
        "description": decision.description,
        "status": decision.status,
        "approved_by_name": approved_by_name,
        "rejected_by_name": rejected_by_name,
        "participants": participants,
    }


def _sync_decision_in_discussions(
    db: Session,
    team_id: int,
    decision_id: int,
    title: str,
    description: str,
    status: str,
    participants: list,
    approved_by_name: str = None,
    rejected_by_name: str = None,
):
    """Sync decision details inside DiscussionMessage ai_sources JSON field in Postgres."""
    from sqlalchemy.orm.attributes import flag_modified
    from models import DiscussionMessage, TeamDiscussion
    
    # Query messages in discussions for this team
    messages = db.query(DiscussionMessage).join(
        TeamDiscussion, DiscussionMessage.discussion_id == TeamDiscussion.id
    ).filter(TeamDiscussion.team_id == team_id).all()

    for msg in messages:
        if msg.ai_sources and isinstance(msg.ai_sources, dict):
            dp = msg.ai_sources.get("decision_proposal")
            if dp and (dp.get("id") == decision_id or dp.get("decision_id") == decision_id):
                dp["title"] = title
                dp["description"] = description
                dp["status"] = status
                dp["participants"] = participants
                if approved_by_name:
                    dp["approved_by_name"] = approved_by_name
                if rejected_by_name:
                    dp["rejected_by_name"] = rejected_by_name
                msg.ai_sources = dict(msg.ai_sources)
                flag_modified(msg, "ai_sources")


@router.post("/projects/{project_id}/teams/{team_id}/decisions/{decision_id}/approve")
def approve_decision(
    project_id: int,
    team_id: int,
    decision_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Approve a pending decision proposal. Requires project member access."""
    membership = _require_project_member(db, project_id, user_id)
    _require_admin(membership)
    _require_team(db, project_id, team_id)

    decision = db.query(Decision).filter(
        Decision.id == decision_id,
        Decision.team_id == team_id
    ).first()

    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    user = db.query(User).filter(User.user_id == user_id).first()
    user_name = user.name if user else "Admin"

    decision.status = "approved"
    decision.approved_by = user_id
    decision.approved_at = func.now()

    # Retrieve current participants list
    participants_rows = db.query(DecisionParticipant, User).join(
        User, DecisionParticipant.user_id == User.user_id
    ).filter(DecisionParticipant.decision_id == decision_id).all()

    participants_list = [
        {
            "user_id": p.user_id,
            "name": u.name,
            "role": p.role or "Participant",
            "avatar_url": u.avatar_url,
        }
        for p, u in participants_rows
    ]

    _sync_decision_in_discussions(
        db=db,
        team_id=team_id,
        decision_id=decision_id,
        title=decision.title,
        description=decision.description,
        status="approved",
        participants=participants_list,
        approved_by_name=user_name,
    )

    db.commit()
    db.refresh(decision)

    return {
        "status": "success",
        "message": f"Decision '{decision.title}' approved by {user_name}",
        "decision_id": decision.id,
        "decision_status": decision.status,
        "approved_by_name": user_name
    }


@router.post("/projects/{project_id}/teams/{team_id}/decisions/{decision_id}/reject")
def reject_decision(
    project_id: int,
    team_id: int,
    decision_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reject a pending decision proposal. Requires project member access."""
    membership = _require_project_member(db, project_id, user_id)
    _require_admin(membership)
    _require_team(db, project_id, team_id)

    decision = db.query(Decision).filter(
        Decision.id == decision_id,
        Decision.team_id == team_id
    ).first()

    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    user = db.query(User).filter(User.user_id == user_id).first()
    user_name = user.name if user else "Admin"

    decision.status = "rejected"
    decision.approved_by = user_id
    decision.approved_at = func.now()

    # Retrieve current participants list
    participants_rows = db.query(DecisionParticipant, User).join(
        User, DecisionParticipant.user_id == User.user_id
    ).filter(DecisionParticipant.decision_id == decision_id).all()

    participants_list = [
        {
            "user_id": p.user_id,
            "name": u.name,
            "role": p.role or "Participant",
            "avatar_url": u.avatar_url,
        }
        for p, u in participants_rows
    ]

    _sync_decision_in_discussions(
        db=db,
        team_id=team_id,
        decision_id=decision_id,
        title=decision.title,
        description=decision.description,
        status="rejected",
        participants=participants_list,
        rejected_by_name=user_name,
    )

    db.commit()

    return {
        "status": "success",
        "message": f"Decision '{decision.title}' rejected by {user_name}",
        "decision_id": decision.id,
        "decision_status": decision.status,
        "rejected_by_name": user_name
    }


@router.put("/projects/{project_id}/teams/{team_id}/decisions/{decision_id}")
def edit_decision(
    project_id: int,
    team_id: int,
    decision_id: int,
    body: EditApproveDecisionRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Edit title, description, and participants of a decision proposal without changing its approval status."""
    membership = _require_project_member(db, project_id, user_id)
    _require_team(db, project_id, team_id)

    decision = db.query(Decision).filter(
        Decision.id == decision_id,
        Decision.team_id == team_id
    ).first()

    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    decision.title = body.title
    decision.description = body.description

    from agentic.teams.decisions.store import generate_embedding
    combined_text = f"{body.title}\n\n{body.description}"
    embedding_vector = generate_embedding(combined_text)
    vector_str = "[" + ",".join(map(str, embedding_vector)) + "]"
    db.execute(
        text("""
            UPDATE decisions
            SET title = :title, description = :description,
                embedding = CAST(:vector_str AS vector),
                search_vector = to_tsvector('english', :title || ' ' || :description)
            WHERE id = :decision_id
        """),
        {"title": body.title, "description": body.description, "vector_str": vector_str, "decision_id": decision_id},
    )
    if body.participants is not None:
        db.query(DecisionParticipant).filter(DecisionParticipant.decision_id == decision_id).delete()
        seen_uids = set()
        for item in body.participants:
            uid = item.get("user_id")
            if uid is not None:
                try:
                    uid = int(uid)
                except (ValueError, TypeError):
                    continue
                if uid not in seen_uids:
                    seen_uids.add(uid)
                    role = item.get("role") or "Participant"
                    db.add(DecisionParticipant(decision_id=decision_id, user_id=uid, role=role))
    
    db.flush()
    # Retrieve updated participants list
    participants_rows = db.query(DecisionParticipant, User).join(
        User, DecisionParticipant.user_id == User.user_id
    ).filter(DecisionParticipant.decision_id == decision_id).all()

    participants_list = [
        {
            "user_id": p.user_id,
            "name": u.name,
            "role": p.role or "Participant",
            "avatar_url": u.avatar_url,
        }
        for p, u in participants_rows
    ]

    _sync_decision_in_discussions(
        db=db,
        team_id=team_id,
        decision_id=decision_id,
        title=body.title,
        description=body.description,
        status=decision.status,
        participants=participants_list,
    )

    db.commit()

    return {
        "status": "success",
        "message": f"Decision '{body.title}' updated successfully",
        "decision_id": decision_id,
        "title": body.title,
        "description": body.description,
        "decision_status": decision.status,
        "participants": participants_list,
    }


@router.put("/projects/{project_id}/teams/{team_id}/decisions/{decision_id}/edit-approve")
def edit_and_approve_decision(
    project_id: int,
    team_id: int,
    decision_id: int,
    body: EditApproveDecisionRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Edit fields/participants and approve a decision proposal."""
    membership = _require_project_member(db, project_id, user_id)
    _require_team(db, project_id, team_id)

    decision = db.query(Decision).filter(
        Decision.id == decision_id,
        Decision.team_id == team_id
    ).first()

    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    user = db.query(User).filter(User.user_id == user_id).first()
    user_name = user.name if user else "Admin"
    decision.title = body.title
    decision.description = body.description
    decision.status = "approved"
    decision.approved_by = user_id
    decision.approved_at = func.now()

    from agentic.teams.decisions.store import generate_embedding
    combined_text = f"{body.title}\n\n{body.description}"
    embedding_vector = generate_embedding(combined_text)
    vector_str = "[" + ",".join(map(str, embedding_vector)) + "]"
    db.execute(
        text("""
            UPDATE decisions
            SET title = :title, description = :description, status = 'approved',
                approved_by = :approved_by, approved_at = NOW(),
                embedding = CAST(:vector_str AS vector),
                search_vector = to_tsvector('english', :title || ' ' || :description)
            WHERE id = :decision_id
        """),
        {"title": body.title, "description": body.description, "approved_by": user_id,
         "vector_str": vector_str, "decision_id": decision_id},
    )
    if body.participants is not None:
        db.query(DecisionParticipant).filter(DecisionParticipant.decision_id == decision_id).delete()
        seen_uids = set()
        for item in body.participants:
            uid = item.get("user_id")
            if uid is not None:
                try:
                    uid = int(uid)
                except (ValueError, TypeError):
                    continue
                if uid not in seen_uids:
                    seen_uids.add(uid)
                    role = item.get("role") or "Participant"
                    db.add(DecisionParticipant(decision_id=decision_id, user_id=uid, role=role))
    db.flush()
    # Retrieve updated participants list
    participants_rows = db.query(DecisionParticipant, User).join(
        User, DecisionParticipant.user_id == User.user_id
    ).filter(DecisionParticipant.decision_id == decision_id).all()

    participants_list = [
        {
            "user_id": p.user_id,
            "name": u.name,
            "role": p.role or "Participant",
            "avatar_url": u.avatar_url,
        }
        for p, u in participants_rows
    ]

    _sync_decision_in_discussions(
        db=db,
        team_id=team_id,
        decision_id=decision_id,
        title=body.title,
        description=body.description,
        status="approved",
        participants=participants_list,
        approved_by_name=user_name,
    )

    db.commit()

    return {
        "status": "success",
        "message": f"Decision '{body.title}' edited and approved by {user_name}",
        "decision_id": decision_id,
        "title": body.title,
        "description": body.description,
        "decision_status": "approved",
        "approved_by_name": user_name,
        "participants": participants_list,
    }


# ---------------------------------------------------
# CHAT-SCOPED DECISION PROPOSAL ENDPOINTS
# ---------------------------------------------------

@router.put("/projects/{project_id}/teams/{team_id}/discussions/{discussion_id}/messages/{message_id}/proposal")
async def edit_message_decision_proposal(
    project_id: int,
    team_id: int,
    discussion_id: int,
    message_id: int,
    body: EditApproveDecisionRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Edit proposal fields (title, description, participants) stored in DiscussionMessage.ai_sources."""
    membership = _require_project_member(db, project_id, user_id)
    _require_team(db, project_id, team_id)

    msg = db.query(DiscussionMessage).filter(
        DiscussionMessage.id == message_id,
        DiscussionMessage.discussion_id == discussion_id
    ).first()

    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    if not msg.ai_sources or not isinstance(msg.ai_sources, dict) or "decision_proposal" not in msg.ai_sources:
        raise HTTPException(status_code=404, detail="No decision proposal attached to this message")

    dp = dict(msg.ai_sources["decision_proposal"])
    dp["title"] = body.title
    dp["description"] = body.description

    if body.participants is not None:
        validated_parts = []
        seen_uids = set()
        for item in body.participants:
            uid = item.get("user_id")
            if uid is not None:
                try:
                    uid = int(uid)
                except (ValueError, TypeError):
                    continue
                if uid not in seen_uids:
                    seen_uids.add(uid)
                    user = db.query(User).filter(User.user_id == uid).first()
                    validated_parts.append({
                        "user_id": uid,
                        "name": user.name if user else item.get("name") or f"User #{uid}",
                        "role": item.get("role") or "Participant",
                        "avatar_url": user.avatar_url if user else item.get("avatar_url"),
                    })
        dp["participants"] = validated_parts

    ai_sources = dict(msg.ai_sources)
    ai_sources["decision_proposal"] = dp
    msg.ai_sources = ai_sources
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(msg, "ai_sources")
    db.commit()
    db.refresh(msg)

    # Real-time broadcast to all connected clients in this discussion
    serialized = format_message(msg, db, current_user_id=user_id)
    await ws_manager.broadcast(
        discussion_id,
        {"event": "proposal_updated", "message": serialized},
    )

    return {
        "status": "success",
        "message": f"Proposal '{body.title}' updated",
        "decision_proposal": dp,
    }


@router.post("/projects/{project_id}/teams/{team_id}/discussions/{discussion_id}/messages/{message_id}/proposal/reject")
async def reject_message_decision_proposal(
    project_id: int,
    team_id: int,
    discussion_id: int,
    message_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reject proposal stored in DiscussionMessage.ai_sources without creating a DB decision row."""
    membership = _require_project_member(db, project_id, user_id)
    _require_admin(membership)
    _require_team(db, project_id, team_id)

    msg = db.query(DiscussionMessage).filter(
        DiscussionMessage.id == message_id,
        DiscussionMessage.discussion_id == discussion_id
    ).first()

    if not msg or not msg.ai_sources or not isinstance(msg.ai_sources, dict) or "decision_proposal" not in msg.ai_sources:
        raise HTTPException(status_code=404, detail="Decision proposal not found")

    dp = dict(msg.ai_sources["decision_proposal"])

    # Integrity guard: cannot reject an already-approved decision
    if dp.get("status") == "approved":
        raise HTTPException(
            status_code=409,
            detail="This decision has already been approved and cannot be rejected.",
        )

    user = db.query(User).filter(User.user_id == user_id).first()
    user_name = user.name if user else "Admin"

    dp["status"] = "rejected"
    dp["rejected_by_name"] = user_name

    ai_sources = dict(msg.ai_sources)
    ai_sources["decision_proposal"] = dp
    msg.ai_sources = ai_sources
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(msg, "ai_sources")
    db.commit()
    db.refresh(msg)

    # Real-time broadcast
    serialized = format_message(msg, db, current_user_id=user_id)
    await ws_manager.broadcast(
        discussion_id,
        {"event": "proposal_updated", "message": serialized},
    )

    return {
        "status": "success",
        "message": f"Proposal '{dp.get('title', 'Decision')}' rejected by {user_name}",
        "decision_proposal": dp,
    }


@router.post("/projects/{project_id}/teams/{team_id}/discussions/{discussion_id}/messages/{message_id}/proposal/approve")
async def approve_message_decision_proposal(
    project_id: int,
    team_id: int,
    discussion_id: int,
    message_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Approve decision proposal: Convert proposal into official team decision in 'decisions' DB table,
    generate Fireworks 1024-dim embeddings, insert participants, and update DiscussionMessage.ai_sources.
    """
    membership = _require_project_member(db, project_id, user_id)
    _require_admin(membership)
    _require_team(db, project_id, team_id)

    msg = db.query(DiscussionMessage).filter(
        DiscussionMessage.id == message_id,
        DiscussionMessage.discussion_id == discussion_id
    ).first()

    if not msg or not msg.ai_sources or not isinstance(msg.ai_sources, dict) or "decision_proposal" not in msg.ai_sources:
        raise HTTPException(status_code=404, detail="Decision proposal not found")

    user = db.query(User).filter(User.user_id == user_id).first()
    user_name = user.name if user else "Admin"

    dp = dict(msg.ai_sources["decision_proposal"])
    title = dp.get("title", "Untitled Decision")
    description = dp.get("description", "")
    created_by = dp.get("created_by") or user_id
    participants = dp.get("participants") or []

    # Store in decisions DB table (generates Fireworks embedding & search vector)
    from agentic.teams.decisions.store import store_decision
    res = store_decision(
        db=db,
        team_id=team_id,
        title=title,
        description=description,
        created_by=created_by,
        participants=participants,
        status="approved"
    )

    decision_id = res["decision_id"]

    # Mark as approved by admin in DB
    decision_row = db.query(Decision).filter(Decision.id == decision_id).first()
    if decision_row:
        decision_row.approved_by = user_id
        decision_row.approved_at = func.now()

    # Update proposal payload with decision_id and approved status
    dp["id"] = decision_id
    dp["decision_id"] = decision_id
    dp["status"] = "approved"
    dp["approved_by_name"] = user_name

    ai_sources = dict(msg.ai_sources)
    ai_sources["decision_proposal"] = dp
    msg.ai_sources = ai_sources
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(msg, "ai_sources")

    db.commit()
    db.refresh(msg)

    # Real-time broadcast
    serialized = format_message(msg, db, current_user_id=user_id)
    await ws_manager.broadcast(
        discussion_id,
        {"event": "proposal_updated", "message": serialized},
    )

    return {
        "status": "success",
        "message": f"Decision '{title}' approved and persisted to decisions database by {user_name}",
        "decision_id": decision_id,
        "decision_proposal": dp,
    }

