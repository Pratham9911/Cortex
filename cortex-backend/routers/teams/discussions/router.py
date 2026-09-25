from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, text

from database import SessionLocal
from dependencies import get_current_user
from models import (
    Document,
    DocumentVersion,
    Folder,
    ProjectMember,
    Team,
    TeamDiscussion,
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
    _require_admin(membership)
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
    _require_admin(membership)
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
    """Get the current status of a decision (lightweight check for UI sync)."""
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

    return {
        "decision_id": decision.id,
        "status": decision.status,
        "approved_by_name": approved_by_name,
        "rejected_by_name": rejected_by_name,
    }


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
    db.commit()

    return {
        "status": "success",
        "message": f"Decision '{decision.title}' rejected by {user_name}",
        "decision_id": decision.id,
        "decision_status": decision.status,
        "rejected_by_name": user_name
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

    # Regenerate search vector & embedding for updated title/description
    from agentic.teams.decisions.store import generate_embedding
    combined_text = f"{body.title}\n\n{body.description}"
    embedding_vector = generate_embedding(combined_text)
    vector_str = "[" + ",".join(map(str, embedding_vector)) + "]"

    db.execute(
        text("""
            UPDATE decisions
            SET title = :title,
                description = :description,
                status = 'approved',
                approved_by = :approved_by,
                approved_at = NOW(),
                embedding = CAST(:vector_str AS vector),
                search_vector = to_tsvector('english', :title || ' ' || :description)
            WHERE id = :decision_id;
        """),
        {
            "title": body.title,
            "description": body.description,
            "approved_by": user_id,
            "vector_str": vector_str,
            "decision_id": decision_id
        }
    )

    # Update participants if provided
    if body.participants is not None:
        db.query(DecisionParticipant).filter(DecisionParticipant.decision_id == decision_id).delete()
        for item in body.participants:
            uid = item.get("user_id")
            role = item.get("role", "participant")
            if uid:
                db.add(DecisionParticipant(decision_id=decision_id, user_id=uid, role=role))

    db.commit()

    return {
        "status": "success",
        "message": f"Decision '{body.title}' edited and approved by {user_name}",
        "decision_id": decision_id,
        "decision_status": "approved",
        "approved_by_name": user_name
    }

