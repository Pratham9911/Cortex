from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import SessionLocal
from dependencies import get_current_user
from models import (
    ProjectMember,
    Team,
    TeamDiscussion,
    User,
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
