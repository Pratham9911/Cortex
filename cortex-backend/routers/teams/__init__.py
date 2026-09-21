from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, validator
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from database import SessionLocal
from dependencies import get_current_user

from models import (
    Project,
    ProjectMember,
    User,
    Team,
    TeamMember,
    InboxMessage
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
# SEARCH PROJECT MEMBERS AVAILABLE FOR A TEAM
# ---------------------------------------------------
@router.get("/projects/{project_id}/teams/{team_id}/available-members")
def search_available_project_members_for_team(
    project_id: int,
    team_id: int,
    q: str = Query("", max_length=100),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership or membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin can search project members"
        )

    team = db.query(Team).filter(
        Team.team_id == team_id,
        Team.project_id == project_id
    ).first()

    if not team:
        raise HTTPException(
            status_code=404,
            detail="Team not found"
        )

    if team.name.lower() == "general":
        raise HTTPException(
            status_code=400,
            detail="Use project invites to add members to the general team"
        )

    existing_team_member_ids = db.query(TeamMember.user_id).filter(
        TeamMember.team_id == team_id
    )

    search_term = q.strip()

    query = db.query(User, ProjectMember).join(
        ProjectMember,
        ProjectMember.user_id == User.user_id
    ).filter(
        ProjectMember.project_id == project_id,
        ~User.user_id.in_(existing_team_member_ids)
    )

    if search_term:
        query = query.filter(
            or_(
                User.name.ilike(f"%{search_term}%"),
                User.email.ilike(f"%{search_term}%")
            )
        )

    rows = query.order_by(
        ProjectMember.role.asc(),
        User.name.asc()
    ).limit(12).all()

    return {
        "users": [
            {
                "user_id": user.user_id,
                "name": user.name,
                "email": user.email,
                "avatar_url": user.avatar_url,
                "role": project_membership.role,
                "joined_at": project_membership.joined_at
            }
            for user, project_membership in rows
        ]
    }


# ---------------------------------------------------
# REMOVE MEMBER FROM TEAM ONLY
# ---------------------------------------------------
@router.delete("/projects/{project_id}/teams/{team_id}/members/{target_user_id}")
def remove_member_from_team(
    project_id: int,
    team_id: int,
    target_user_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership or membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin can remove team members"
        )

    team = db.query(Team).filter(
        Team.team_id == team_id,
        Team.project_id == project_id
    ).first()

    if not team:
        raise HTTPException(
            status_code=404,
            detail="Team not found"
        )

    if team.name.lower() == "general":
        raise HTTPException(
            status_code=400,
            detail="General team removal removes a member from the project. Use the project-member removal route."
        )

    target_membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == target_user_id
    ).first()

    if not target_membership:
        raise HTTPException(
            status_code=404,
            detail="User is not part of this project"
        )

    if user_id == target_user_id:
        raise HTTPException(
            status_code=400,
            detail="Admin cannot remove themselves"
        )

    project = db.query(Project).filter(
        Project.project_id == project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    is_project_owner = project.created_by == user_id
    target_is_project_owner = project.created_by == target_user_id

    if target_is_project_owner:
        raise HTTPException(
            status_code=403,
            detail="Project owner cannot be removed"
        )

    if target_membership.role == "admin" and not is_project_owner:
        raise HTTPException(
            status_code=403,
            detail="Only the project owner can remove another admin"
        )

    team_membership = db.query(TeamMember).filter(
        TeamMember.team_id == team_id,
        TeamMember.user_id == target_user_id
    ).first()

    if not team_membership:
        raise HTTPException(
            status_code=404,
            detail="User is not part of this team"
        )

    target_user = db.query(User).filter(
        User.user_id == target_user_id
    ).first()

    admin_user = db.query(User).filter(
        User.user_id == user_id
    ).first()

    db.delete(team_membership)

    create_audit_log(
        db=db,
        project_id=project_id,
        user_id=user_id,
        action="delete",
        detail=f"{admin_user.name} removed {target_user.name} from team '{team.name}'"
    )

    db.commit()

    return {
        "message": "Member removed from team successfully"
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

    project = db.query(Project).filter(
        Project.project_id == project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
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
        project_membership = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.user_id
        ).first()

        result.append({
            "user_id": user.user_id,
            "name": user.name,
            "email": user.email,
            "avatar_url": user.avatar_url,
            "role": project_membership.role if project_membership else "member",
            "is_project_owner": user.user_id == project.created_by,
            "joined_at": project_membership.joined_at if project_membership else None,
            "added_at": member.added_at
        })

    return {
        "team_id": team.team_id,
        "team_name": team.name,
        "current_user_role": membership.role,
        "members": result
    }


# ---------------------------------------------------
# GET PROJECT MEMBER DETAILS FROM GENERAL TEAM
# ---------------------------------------------------
@router.get("/projects/{project_id}/teams/{team_id}/members/{target_user_id}/details")
def get_general_project_member_details(
    project_id: int,
    team_id: int,
    target_user_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    requester_membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not requester_membership:
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    general_team = db.query(Team).filter(
        Team.team_id == team_id,
        Team.project_id == project_id,
        func.lower(Team.name) == "general"
    ).first()

    if not general_team:
        raise HTTPException(
            status_code=403,
            detail="Project members can only be managed from the general team"
        )

    target_user = db.query(User).filter(
        User.user_id == target_user_id
    ).first()

    target_membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == target_user_id
    ).first()

    if not target_user or not target_membership:
        raise HTTPException(
            status_code=404,
            detail="User is not part of this project"
        )

    project = db.query(Project).filter(
        Project.project_id == project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    is_project_owner = project.created_by == user_id
    target_is_project_owner = project.created_by == target_user_id
    can_remove_target = (
        requester_membership.role == "admin"
        and target_user_id != user_id
        and not target_is_project_owner
        and (
            target_membership.role != "admin"
            or is_project_owner
        )
    )

    team_rows = db.query(Team, TeamMember).join(
        TeamMember,
        TeamMember.team_id == Team.team_id
    ).filter(
        Team.project_id == project_id,
        TeamMember.user_id == target_user_id
    ).order_by(
        Team.name.asc()
    ).all()

    return {
        "user_id": target_user.user_id,
        "name": target_user.name,
        "email": target_user.email,
        "avatar_url": target_user.avatar_url,
        "role": target_membership.role,
        "is_project_owner": target_is_project_owner,
        "joined_at": target_membership.joined_at,
        "teams": [
            {
                "team_id": team.team_id,
                "name": team.name,
                "added_at": team_member.added_at
            }
            for team, team_member in team_rows
        ],
        "can_remove": can_remove_target
    }


# ---------------------------------------------------
# REMOVE PROJECT MEMBER FROM GENERAL TEAM
# ---------------------------------------------------
@router.delete("/projects/{project_id}/teams/{team_id}/members/{target_user_id}/project")
def remove_project_member_from_general_team(
    project_id: int,
    team_id: int,
    target_user_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    admin_membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not admin_membership or admin_membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin can remove project members"
        )

    if user_id == target_user_id:
        raise HTTPException(
            status_code=400,
            detail="Admin cannot remove themselves"
        )

    general_team = db.query(Team).filter(
        Team.team_id == team_id,
        Team.project_id == project_id,
        func.lower(Team.name) == "general"
    ).first()

    if not general_team:
        raise HTTPException(
            status_code=403,
            detail="Project members can only be removed from the general team"
        )

    project = db.query(Project).filter(
        Project.project_id == project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    target_membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == target_user_id
    ).first()

    if not target_membership:
        raise HTTPException(
            status_code=404,
            detail="User is not part of this project"
        )

    is_project_owner = project.created_by == user_id
    target_is_project_owner = project.created_by == target_user_id

    if target_is_project_owner:
        raise HTTPException(
            status_code=403,
            detail="Project owner cannot be removed"
        )

    if target_membership.role == "admin" and not is_project_owner:
        raise HTTPException(
            status_code=403,
            detail="Only the project owner can remove another admin"
        )

    target_user = db.query(User).filter(
        User.user_id == target_user_id
    ).first()

    admin_user = db.query(User).filter(
        User.user_id == user_id
    ).first()

    team_memberships = db.query(TeamMember).join(
        Team,
        Team.team_id == TeamMember.team_id
    ).filter(
        Team.project_id == project_id,
        TeamMember.user_id == target_user_id
    ).all()

    for team_membership in team_memberships:
        db.delete(team_membership)

    db.delete(target_membership)

    inbox_message = InboxMessage(
        receiver_id=target_user_id,
        sender_id=user_id,
        type="system",
        title=f"Removed From Project: {project.name}",
        message=f"{admin_user.name} removed you from project '{project.name}'",
        related_project_id=project_id,
        status="unread"
    )

    db.add(inbox_message)

    create_audit_log(
        db=db,
        project_id=project_id,
        user_id=user_id,
        action="delete",
        detail=f"{admin_user.name} removed {target_user.name} from project '{project.name}'"
    )

    db.commit()

    return {
        "message": "Member removed from project successfully"
    }
