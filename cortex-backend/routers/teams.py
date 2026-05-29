from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, validator
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import SessionLocal
from dependencies import get_current_user

from models import (
    Project,
    ProjectMember,
    User,
    Team,
    TeamMember
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
class CreateTeamRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=50)
    description: str = Field(..., min_length=5, max_length=300)
    tags: Optional[List[str]] = Field(default=None)

    @validator("tags", each_item=True)
    def validate_tag_item(cls, tag: str):
        normalized = tag.strip()
        if not normalized:
            raise ValueError("Tags cannot be empty")
        if len(normalized) > 30:
            raise ValueError("Each tag must be 30 characters or fewer")
        return normalized

    @validator("tags")
    def validate_tag_count(cls, tags: Optional[List[str]]):
        if tags is None:
            return tags
        if len(tags) > 3:
            raise ValueError("A team can have at most 3 tags")
        return tags


class AddTeamMemberRequest(BaseModel):
    user_id: int


# ---------------------------------------------------
# CREATE TEAM
# ---------------------------------------------------
@router.post("/projects/{project_id}/teams")
def create_team(
    project_id: int,
    request: CreateTeamRequest,
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
            detail="Only admin can create teams"
        )

    # ----------------------------------------
    # Check project
    # ----------------------------------------
    project = db.query(Project).filter(
        Project.project_id == project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    # ----------------------------------------
    # Prevent duplicate team names
    # ----------------------------------------
    existing_team = db.query(Team).filter(
        Team.project_id == project_id,
        func.lower(Team.name) == request.name.lower()
    ).first()

    if existing_team:
        raise HTTPException(
            status_code=400,
            detail="Team already exists"
        )

    # ----------------------------------------
    # Create team
    # ----------------------------------------
    new_team = Team(
        project_id=project_id,
        name=request.name.strip(),
        description=request.description.strip(),
        tags=[tag.strip() for tag in request.tags] if request.tags else None,
        created_by=user_id
    )

    db.add(new_team)
    db.flush()

    # Automatically add the creator as a team member
    creator_member = TeamMember(
        team_id=new_team.team_id,
        user_id=user_id,
        added_by=user_id
    )
    db.add(creator_member)

    # ----------------------------------------
    # Audit
    # ----------------------------------------
    user = db.query(User).filter(
        User.user_id == user_id
    ).first()

    create_audit_log(
        db=db,
        project_id=project_id,
        user_id=user_id,
        action="create",
        detail=f"{user.name} created team '{request.name}'"
    )

    db.commit()
    db.refresh(new_team)

    return {
        "message": "Team created successfully",
        "team_id": new_team.team_id,
        "team": {
            "team_id": new_team.team_id,
            "name": new_team.name,
            "description": new_team.description,
            "tags": new_team.tags,
            "created_at": new_team.created_at
        }
    }


# ---------------------------------------------------
# ADD MEMBER TO TEAM
# ---------------------------------------------------
@router.post("/projects/{project_id}/teams/{team_id}/members")
def add_member_to_team(
    project_id: int,
    team_id: int,
    request: AddTeamMemberRequest,
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
            detail="Only admin can add team members"
        )

    # ----------------------------------------
    # Verify team
    # ----------------------------------------
    team = db.query(Team).filter(
        Team.team_id == team_id,
        Team.project_id == project_id
    ).first()

    if not team:
        raise HTTPException(
            status_code=404,
            detail="Team not found"
        )

    # ----------------------------------------
    # Verify user exists
    # ----------------------------------------
    target_user = db.query(User).filter(
        User.user_id == request.user_id
    ).first()

    if not target_user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    # ----------------------------------------
    # Verify user belongs to project
    # ----------------------------------------
    target_membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == request.user_id
    ).first()

    if not target_membership:
        raise HTTPException(
            status_code=400,
            detail="User is not part of this project"
        )

    # ----------------------------------------
    # Prevent duplicate membership
    # ----------------------------------------
    existing_member = db.query(TeamMember).filter(
        TeamMember.team_id == team_id,
        TeamMember.user_id == request.user_id
    ).first()

    if existing_member:
        raise HTTPException(
            status_code=400,
            detail="User already in team"
        )

    # ----------------------------------------
    # Add member
    # ----------------------------------------
    new_member = TeamMember(
        team_id=team_id,
        user_id=request.user_id,
        added_by=user_id
    )

    db.add(new_member)

    # ----------------------------------------
    # Audit
    # ----------------------------------------
    admin_user = db.query(User).filter(
        User.user_id == user_id
    ).first()

    create_audit_log(
        db=db,
        project_id=project_id,
        user_id=user_id,
        action="system",
        detail=f"{admin_user.name} added {target_user.name} to team '{team.name}'"
    )

    db.commit()

    return {
        "message": "Member added successfully"
    }


# ---------------------------------------------------
# GET TEAMS
# ---------------------------------------------------
@router.get("/projects/{project_id}/teams")
def get_teams(
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

    teams = db.query(Team).filter(
        Team.project_id == project_id
    ).order_by(
        Team.created_at.asc()
    ).all()

    result = []

    for team in teams:

        member_count = db.query(TeamMember).filter(
            TeamMember.team_id == team.team_id
        ).count()

        result.append({
            "team_id": team.team_id,
            "name": team.name,
            "description": team.description,
            "tags": team.tags,
            "member_count": member_count,
            "created_at": team.created_at
        })

    return result


# ---------------------------------------------------
# GET TEAM MEMBERS
# ---------------------------------------------------
@router.get("/projects/{project_id}/teams/{team_id}/members")
def get_team_members(
    project_id: int,
    team_id: int,
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

    # ----------------------------------------
    # Verify team
    # ----------------------------------------
    team = db.query(Team).filter(
        Team.team_id == team_id,
        Team.project_id == project_id
    ).first()

    if not team:
        raise HTTPException(
            status_code=404,
            detail="Team not found"
        )

    members = db.query(
        TeamMember,
        User
    ).join(
        User,
        User.user_id == TeamMember.user_id
    ).filter(
        TeamMember.team_id == team_id
    ).all()

    result = []

    for member, user in members:

        result.append({
            "user_id": user.user_id,
            "name": user.name,
            "email": user.email,
            "avatar_url": user.avatar_url,
            "added_at": member.added_at
        })

    return {
        "team_id": team.team_id,
        "team_name": team.name,
        "members": result
    }
