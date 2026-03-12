from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from database import SessionLocal
from models import Project, ProjectMember
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

    new_project = Project(
        name=request.name,
        created_by=user_id
    )

    db.add(new_project)
    db.commit()
    db.refresh(new_project)

    project_member = ProjectMember(
        project_id=new_project.project_id,
        user_id=user_id,
        role="admin"
    )

    db.add(project_member)
    db.commit()

    return {
        "message": "Project created successfully",
        "project_id": new_project.project_id
    }

@router.get("/getProjects")
def list_projects(
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    memberships = db.query(ProjectMember).filter(
        ProjectMember.user_id == user_id
    ).all()

    projects = []

    for membership in memberships:
        project = db.query(Project).filter(
            Project.project_id == membership.project_id
        ).first()

        projects.append({
            "project_id": project.project_id,
            "name": project.name,
            "role": membership.role
        })

    return projects

