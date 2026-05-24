from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, aliased
from pydantic import BaseModel, Field
from sqlalchemy import func, case
from database import SessionLocal
from routers.audit import create_audit_log
from models import Project, ProjectMember, User , Team, TeamMember
from dependencies import get_current_user


router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class CreateProjectRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)

@router.post("/projects")
def create_project(
    request: CreateProjectRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ----------------------------------------
    # Create project
    # ----------------------------------------
    new_project = Project(
        name=request.name,
        created_by=user_id
    )

    db.add(new_project)
    db.commit()
    db.refresh(new_project)

    # ----------------------------------------
    # Add creator as admin
    # ----------------------------------------
    project_member = ProjectMember(
        project_id=new_project.project_id,
        user_id=user_id,
        role="admin"
    )

    db.add(project_member)

    # ----------------------------------------
    # Create default "general" team
    # ----------------------------------------
    general_team = Team(
        project_id=new_project.project_id,
        name="general",
        created_by=user_id
    )

    db.add(general_team)
    db.commit()
    db.refresh(general_team)

    # ----------------------------------------
    # Add admin to general team
    # ----------------------------------------
    general_team_member = TeamMember(
        team_id=general_team.team_id,
        user_id=user_id,
        added_by=user_id
    )

    db.add(general_team_member)

    # ----------------------------------------
    # Audit log
    # ----------------------------------------
    user = db.query(User).filter(
        User.user_id == user_id
    ).first()

    create_audit_log(
        db=db,
        project_id=new_project.project_id,
        user_id=user_id,
        action="create",
        detail=f"{user.name} created project '{new_project.name}'"
    )

    # ----------------------------------------
    # Final commit
    # ----------------------------------------
    db.commit()

    return {
        "message": "Project created successfully",
        "project_id": new_project.project_id
    }
@router.get("/getprojects")
def list_projects(
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    membership_alias = aliased(ProjectMember)

    # total members INCLUDING admins
    member_count_expr = func.count(
        ProjectMember.user_id
    ).label("member_count")

    # only admins count
    admin_count_expr = func.sum(
        case(
            (ProjectMember.role == "admin", 1),
            else_=0
        )
    ).label("admin_count")

    projects = (
        db.query(
            Project.project_id,
            Project.name,
            Project.created_at,
            Project.created_by,

            User.name.label("created_by_name"),

            membership_alias.role.label("current_user_role"),

            member_count_expr,
            admin_count_expr
        )

        # all project members for counting
        .join(
            ProjectMember,
            Project.project_id == ProjectMember.project_id
        )

        # creator info
        .join(
            User,
            User.user_id == Project.created_by
        )

        # current logged-in user's membership
        .join(
            membership_alias,
            (membership_alias.project_id == Project.project_id) &
            (membership_alias.user_id == user_id)
        )

        .group_by(
            Project.project_id,
            Project.name,
            Project.created_at,
            Project.created_by,
            User.name,
            membership_alias.role
        )

        .all()
    )

    return [
        {
            "project_id": project.project_id,

            "name": project.name,

            "created_by": {
                "user_id": project.created_by,
                "name": project.created_by_name
            },

            "member_count": project.member_count,

            "admin_count": project.admin_count,

            "current_user_role": project.current_user_role,

            "created_at": project.created_at
        }
        for project in projects
    ]