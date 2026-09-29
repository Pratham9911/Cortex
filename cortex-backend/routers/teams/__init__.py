from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, validator
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import String, cast, func, or_
from sqlalchemy.exc import IntegrityError

from database import SessionLocal
from dependencies import get_current_user

from models import (
    Project,
    ProjectMember,
    User,
    Team,
    TeamMember,
    InboxMessage,
    Document,
    Folder,
    Task,
    TaskAssignee,
    Subtask,
    Decision,
    DecisionParticipant,
    DiscussionSTM,
    TeamDiscussion,
)
from modelmetrics import increment_cortex_global_metrics, ProjectPack

from routers.audit import create_audit_log
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


class UpdateTeamRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = Field(default=None, max_length=300)
    tags: Optional[List[str]] = None

    @validator("name")
    def validate_name(cls, name: Optional[str]):
        if name is None:
            return name
        normalized = name.strip()
        if len(normalized) < 2:
            raise ValueError("Team name must be at least 2 characters")
        return normalized

    @validator("description")
    def validate_description(cls, description: Optional[str]):
        if description is None:
            return description
        normalized = description.strip()
        if len(normalized) < 5:
            raise ValueError("Team description must be at least 5 characters")
        return normalized

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
        if tags is not None and len(tags) > 3:
            raise ValueError("A team can have at most 3 tags")
        return tags


class UpdateProjectMemberRoleRequest(BaseModel):
    role: str

    @validator("role")
    def validate_role(cls, role: str):
        if role not in {"admin", "member", "owner"}:
            raise ValueError("Role must be admin, member, or owner")
        return role


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
    ).with_for_update().first()

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

    project_pack = None
    if project.plan_id is not None:
        project_pack = db.query(ProjectPack).filter(
            ProjectPack.id == project.plan_id
        ).first()
    if project_pack is None:
        project_pack = db.query(ProjectPack).filter(
            func.lower(cast(ProjectPack.name, String)) == "free"
        ).first()
    if project_pack is None:
        raise HTTPException(
            status_code=500,
            detail="The Free project plan is not configured.",
        )

    current_team_count = db.query(func.count(Team.team_id)).filter(
        Team.project_id == project_id
    ).scalar() or 0
    if current_team_count >= project_pack.max_teams:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "TEAM_LIMIT_REACHED",
                "message": "This project has reached the team limit for its current plan.",
                "current_teams": current_team_count,
                "max_teams": project_pack.max_teams,
                "plan_name": project_pack.name,
            },
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

    increment_cortex_global_metrics(db, teams=1)

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

    project = db.query(Project).filter(
        Project.project_id == project_id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    is_project_owner = project.created_by == user_id
    if not membership or (membership.role != "admin" and not is_project_owner):
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
        member_rows = db.query(
            TeamMember.user_id,
            User.name,
            User.avatar_url,
        ).join(
            User,
            User.user_id == TeamMember.user_id,
        ).filter(
            TeamMember.team_id == team.team_id,
        ).order_by(
            User.name.asc(),
        ).all()

        result.append({
            "team_id": team.team_id,
            "name": team.name,
            "description": team.description,
            "tags": team.tags,
            "member_count": len(member_rows),
            "created_at": team.created_at,
            "is_member": any(member.user_id == user_id for member in member_rows),
            "members": [
                {
                    "user_id": member.user_id,
                    "name": member.name,
                    "avatar_url": member.avatar_url,
                }
                for member in member_rows
            ],
        })

    return result


# ---------------------------------------------------
# UPDATE TEAM DETAILS
# ---------------------------------------------------
@router.patch("/projects/{project_id}/teams/{team_id}")
def update_team(
    project_id: int,
    team_id: int,
    request: UpdateTeamRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(
        Project.project_id == project_id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first()
    if project.created_by != user_id and (
        not membership or membership.role != "admin"
    ):
        raise HTTPException(status_code=403, detail="Only project admins can update a team")

    team = db.query(Team).filter(
        Team.team_id == team_id,
        Team.project_id == project_id,
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    changed_fields = request.model_fields_set
    if not changed_fields:
        raise HTTPException(status_code=400, detail="No team changes were provided")

    is_general_team = team.name.strip().lower() == "general"
    audit_changes: List[str] = []
    if "description" in changed_fields:
        if request.description is None:
            raise HTTPException(status_code=400, detail="Team description cannot be empty")
        if request.description != team.description:
            audit_changes.append(
                f"description changed from '{team.description}' to '{request.description}'"
            )
            team.description = request.description

    if "name" in changed_fields:
        if request.name is None:
            raise HTTPException(status_code=400, detail="Team name cannot be empty")
        new_name = request.name
        if is_general_team and new_name.lower() != "general":
            raise HTTPException(status_code=400, detail="The General team cannot be renamed")
        if not is_general_team and new_name.lower() == "general":
            raise HTTPException(status_code=400, detail="The General team name is reserved")
        conflict = db.query(Team.team_id).filter(
            Team.project_id == project_id,
            Team.team_id != team_id,
            func.lower(Team.name) == new_name.lower(),
        ).first()
        if conflict:
            raise HTTPException(status_code=409, detail="A team with this name already exists")
        if new_name != team.name:
            audit_changes.append(f"name changed from '{team.name}' to '{new_name}'")
            team.name = new_name

    if "tags" in changed_fields:
        new_tags = request.tags or []
        old_tags = team.tags or []
        if new_tags != old_tags:
            audit_changes.append(f"tags changed from {old_tags} to {new_tags}")
            team.tags = new_tags or None

    if not audit_changes:
        return {
            "message": "Team settings are unchanged",
            "team": {
                "team_id": team.team_id,
                "name": team.name,
                "description": team.description,
                "tags": team.tags or [],
                "created_at": team.created_at,
            },
        }

    actor = db.query(User).filter(User.user_id == user_id).first()
    actor_name = actor.name if actor else "A project admin"
    create_audit_log(
        db=db,
        project_id=project_id,
        user_id=user_id,
        action="update",
        detail=f"{actor_name} updated team '{team.name}': {'; '.join(audit_changes)}",
    )

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if "name" in changed_fields and request.name and db.query(Team.team_id).filter(
            Team.project_id == project_id,
            Team.team_id != team_id,
            func.lower(Team.name) == request.name.lower(),
        ).first():
            raise HTTPException(
                status_code=409,
                detail="A team with this name already exists",
            ) from exc
        raise
    db.refresh(team)
    return {
        "message": "Team updated successfully",
        "team": {
            "team_id": team.team_id,
            "name": team.name,
            "description": team.description,
            "tags": team.tags or [],
            "created_at": team.created_at,
        },
    }


# ---------------------------------------------------
# DELETE TEAM
# ---------------------------------------------------
@router.delete("/projects/{project_id}/teams/{team_id}")
def delete_team(
    project_id: int,
    team_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(
        Project.project_id == project_id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first()
    if project.created_by != user_id and (
        not membership or membership.role != "admin"
    ):
        raise HTTPException(status_code=403, detail="Only project admins can delete a team")

    team = db.query(Team).filter(
        Team.team_id == team_id,
        Team.project_id == project_id,
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if team.name.strip().lower() == "general":
        raise HTTPException(status_code=400, detail="The General team cannot be deleted")

    team_name = team.name
    actor = db.query(User).filter(User.user_id == user_id).first()
    actor_name = actor.name if actor else "A project admin"

    discussion_ids = [
        row[0]
        for row in db.query(TeamDiscussion.id).filter(
            TeamDiscussion.team_id == team_id
        ).all()
    ]
    if discussion_ids:
        db.query(DiscussionSTM).filter(
            DiscussionSTM.discussion_id.in_(discussion_ids)
        ).delete(synchronize_session=False)
    delete_team_discussions(db, team_id)

    db.query(TeamMember).filter(TeamMember.team_id == team_id).delete(
        synchronize_session=False
    )

    task_ids = [
        row[0]
        for row in db.query(Task.id).filter(Task.team_id == team_id).all()
    ]
    if task_ids:
        db.query(TaskAssignee).filter(TaskAssignee.task_id.in_(task_ids)).delete(
            synchronize_session=False
        )
        db.query(Subtask).filter(Subtask.task_id.in_(task_ids)).delete(
            synchronize_session=False
        )
        db.query(Task).filter(Task.id.in_(task_ids)).delete(
            synchronize_session=False
        )

    decision_ids = [
        row[0]
        for row in db.query(Decision.id).filter(Decision.team_id == team_id).all()
    ]
    if decision_ids:
        db.query(DecisionParticipant).filter(
            DecisionParticipant.decision_id.in_(decision_ids)
        ).delete(synchronize_session=False)
        db.query(Decision).filter(Decision.id.in_(decision_ids)).delete(
            synchronize_session=False
        )

    db.query(Document).filter(
        Document.project_id == project_id,
        Document.allowed_team_ids.contains([team_id]),
    ).update(
        {Document.allowed_team_ids: func.array_remove(Document.allowed_team_ids, team_id)},
        synchronize_session=False,
    )
    db.query(Folder).filter(
        Folder.project_id == project_id,
        Folder.allowed_team_ids.contains([team_id]),
    ).update(
        {Folder.allowed_team_ids: func.array_remove(Folder.allowed_team_ids, team_id)},
        synchronize_session=False,
    )

    create_audit_log(
        db=db,
        project_id=project_id,
        user_id=user_id,
        action="delete",
        detail=f"{actor_name} deleted team '{team_name}' and its team-scoped data",
    )
    db.delete(team)
    db.commit()

    return {"message": "Team deleted successfully"}


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

    is_project_owner = project.created_by == user_id
    is_team_member = db.query(TeamMember.id).filter(
        TeamMember.team_id == team_id,
        TeamMember.user_id == user_id,
    ).first() is not None
    if not is_team_member and membership.role != "admin" and not is_project_owner:
        raise HTTPException(status_code=403, detail="Access denied")

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
            "role": "admin" if user.user_id == project.created_by else project_membership.role if project_membership else "member",
            "is_project_owner": user.user_id == project.created_by,
            "joined_at": project_membership.joined_at if project_membership else None,
            "added_at": member.added_at
        })

    return {
        "team_id": team.team_id,
        "team_name": team.name,
        "team_description": team.description,
        "team_tags": team.tags or [],
        "team_created_at": team.created_at,
        "team_created_by": team.created_by,
        "member_count": len(result),
        "current_user_role": "admin" if is_project_owner else membership.role,
        "current_user_is_project_owner": is_project_owner,
        "members": result
    }


# ---------------------------------------------------
# GET PROJECT MEMBER DETAILS
# ---------------------------------------------------
@router.get("/projects/{project_id}/members/{target_user_id}/details")
def get_project_member_details(
    project_id: int,
    target_user_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Read-only member profile for any project surface, including tasks."""
    requester_membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()
    if not requester_membership:
        raise HTTPException(status_code=403, detail="Access denied")

    target_user = db.query(User).filter(User.user_id == target_user_id).first()
    target_membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == target_user_id
    ).first()
    if not target_user or not target_membership:
        raise HTTPException(status_code=404, detail="User is not part of this project")

    team_rows = db.query(Team, TeamMember).join(
        TeamMember,
        TeamMember.team_id == Team.team_id
    ).filter(
        Team.project_id == project_id,
        TeamMember.user_id == target_user_id
    ).order_by(Team.name.asc()).all()

    return {
        "user_id": target_user.user_id,
        "name": target_user.name,
        "email": target_user.email,
        "avatar_url": target_user.avatar_url,
        "role": target_membership.role,
        "joined_at": target_membership.joined_at,
        "teams": [
            {"team_id": team.team_id, "name": team.name, "added_at": team_member.added_at}
            for team, team_member in team_rows
        ],
    }


# ---------------------------------------------------
# GET PROJECT MEMBER DETAILS FROM A TEAM
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

    team = db.query(Team).filter(
        Team.team_id == team_id,
        Team.project_id == project_id
    ).first()

    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    project = db.query(Project).filter(
        Project.project_id == project_id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    requester_is_owner = project.created_by == user_id
    requester_is_admin = requester_membership.role == "admin" or requester_is_owner
    requester_is_team_member = db.query(TeamMember.id).filter(
        TeamMember.team_id == team_id,
        TeamMember.user_id == user_id,
    ).first() is not None
    if not requester_is_team_member and not requester_is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

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

    target_is_team_member = db.query(TeamMember.id).filter(
        TeamMember.team_id == team_id,
        TeamMember.user_id == target_user_id,
    ).first() is not None
    if not target_is_team_member:
        raise HTTPException(status_code=404, detail="User is not part of this team")

    target_is_project_owner = project.created_by == target_user_id
    can_remove_target = (
        requester_is_admin
        and target_user_id != user_id
        and not target_is_project_owner
        and (
            target_membership.role != "admin"
            or requester_is_owner
        )
    )
    can_change_role = (
        requester_is_admin
        and target_user_id != user_id
        and not target_is_project_owner
        and (requester_is_owner or target_membership.role != "admin")
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
        "role": "admin" if target_is_project_owner else target_membership.role,
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
        "can_remove": can_remove_target,
        "can_remove_project_member": (
            team.name.strip().lower() == "general" and can_remove_target
        ),
        "can_remove_team_member": (
            team.name.strip().lower() != "general" and can_remove_target
        ),
        "can_change_role": can_change_role
    }


# ---------------------------------------------------
# UPDATE PROJECT MEMBER ROLE (project-wide)
# ---------------------------------------------------
@router.patch("/projects/{project_id}/teams/{team_id}/members/{target_user_id}/role")
def update_team_member_project_role(
    project_id: int,
    team_id: int,
    target_user_id: int,
    request: UpdateProjectMemberRoleRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    requester_membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first()
    project = db.query(Project).filter(
        Project.project_id == project_id
    ).with_for_update().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not requester_membership:
        raise HTTPException(status_code=403, detail="Access denied")

    team = db.query(Team).filter(
        Team.team_id == team_id,
        Team.project_id == project_id,
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    is_project_owner = project.created_by == user_id
    if requester_membership.role != "admin" and not is_project_owner:
        raise HTTPException(status_code=403, detail="Only project admins can change roles")
    if target_user_id == user_id:
        raise HTTPException(status_code=400, detail="You cannot change your own project role")
    if not db.query(TeamMember.id).filter(
        TeamMember.team_id == team_id,
        TeamMember.user_id == target_user_id,
    ).first():
        raise HTTPException(status_code=404, detail="User is not part of this team")

    target_membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == target_user_id,
    ).with_for_update().first()
    target_user = db.query(User).filter(User.user_id == target_user_id).first()
    if not target_membership or not target_user:
        raise HTTPException(status_code=404, detail="User is not part of this project")
    if project.created_by == target_user_id:
        raise HTTPException(status_code=403, detail="Project owner role cannot be changed")

    if request.role == "owner":
        if not is_project_owner:
            raise HTTPException(
                status_code=403,
                detail="Only the current project owner can transfer ownership",
            )
        if target_membership.role != "admin":
            raise HTTPException(
                status_code=400,
                detail="Ownership can only be transferred to a project admin",
            )

        former_owner_membership = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        ).with_for_update().first()
        if not former_owner_membership:
            raise HTTPException(
                status_code=409,
                detail="The current project owner does not have a project membership",
            )

        project.created_by = target_user_id
        former_owner_membership.role = "admin"
        actor = db.query(User).filter(User.user_id == user_id).first()
        actor_name = actor.name if actor else "The previous project owner"
        create_audit_log(
            db=db,
            project_id=project_id,
            user_id=user_id,
            action="update",
            detail=(
                f"{actor_name} transferred project ownership to {target_user.name}; "
                "the previous owner remains a project admin"
            ),
        )
        db.commit()
        return {
            "message": "Project ownership transferred",
            "role": target_membership.role,
            "is_project_owner": True,
        }

    if target_membership.role == request.role:
        return {"message": "Role is unchanged", "role": target_membership.role}
    if target_membership.role == "admin" and not is_project_owner:
        raise HTTPException(status_code=403, detail="Only the project owner can demote an admin")

    previous_role = target_membership.role
    target_membership.role = request.role
    actor = db.query(User).filter(User.user_id == user_id).first()
    actor_name = actor.name if actor else "A project admin"
    create_audit_log(
        db=db,
        project_id=project_id,
        user_id=user_id,
        action="update",
        detail=f"{actor_name} changed {target_user.name}'s project role from {previous_role} to {request.role}",
    )
    db.commit()
    return {"message": "Project role updated", "role": request.role}


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

    is_project_owner = project.created_by == user_id
    if not admin_membership or (
        admin_membership.role != "admin" and not is_project_owner
    ):
        raise HTTPException(status_code=403, detail="Only admin can remove project members")

    if user_id == target_user_id:
        raise HTTPException(status_code=400, detail="Admin cannot remove themselves")

    target_membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == target_user_id
    ).first()

    if not target_membership:
        raise HTTPException(
            status_code=404,
            detail="User is not part of this project"
        )

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
