from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, aliased
from pydantic import BaseModel, Field, validator
from sqlalchemy import String, case, cast, func
from sqlalchemy.dialects.postgresql import insert
from database import SessionLocal
from routers.audit import create_audit_log
from models import Project, ProjectMember, User , Team, TeamMember
from modelmetrics import CortexGlobalMetric, ProjectPack, UserPack
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

    @validator("name")
    def validate_name(cls, name: str) -> str:
        normalized_name = name.strip()
        if len(normalized_name) < 2:
            raise ValueError("Project name must be at least 2 characters.")
        return normalized_name

@router.post("/projects")
def create_project(
    request: CreateProjectRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.user_id == user_id
    ).with_for_update().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_pack = None
    if user.plan_id is not None:
        user_pack = db.query(UserPack).filter(
            UserPack.id == user.plan_id
        ).first()
    if user_pack is None:
        user_pack = db.query(UserPack).filter(
            func.lower(cast(UserPack.name, String)) == "free"
        ).first()
    if user_pack is None:
        raise HTTPException(
            status_code=500,
            detail="The Free user plan is not configured.",
        )

    current_project_count = db.query(func.count(ProjectMember.id)).filter(
        ProjectMember.user_id == user_id
    ).scalar() or 0
    if current_project_count >= user_pack.max_projects:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "PROJECT_LIMIT_REACHED",
                "message": "You have reached the project limit for your current plan.",
                "current_projects": current_project_count,
                "max_projects": user_pack.max_projects,
                "plan_name": user_pack.name,
            },
        )

    free_project_pack = db.query(ProjectPack).filter(
        func.lower(cast(ProjectPack.name, String)) == "free"
    ).first()
    if not free_project_pack:
        raise HTTPException(
            status_code=500,
            detail="The Free project plan is not configured.",
        )

    new_project = Project(
        name=request.name.strip(),
        created_by=user_id,
        plan_id=free_project_pack.id,
    )
    db.add(new_project)
    db.flush()

    project_member = ProjectMember(
        project_id=new_project.project_id,
        user_id=user_id,
        role="admin"
    )
    db.add(project_member)

    general_team = Team(
        project_id=new_project.project_id,
        name="general",
        description="Default team for this project.",
        created_by=user_id
    )
    db.add(general_team)
    db.flush()

    general_team_member = TeamMember(
        team_id=general_team.team_id,
        user_id=user_id,
        added_by=user_id
    )
    db.add(general_team_member)

    create_audit_log(
        db=db,
        project_id=new_project.project_id,
        user_id=user_id,
        action="create",
        detail=f"{user.name} created project '{new_project.name}'"
    )

    latest_metric = db.query(CortexGlobalMetric).order_by(
        CortexGlobalMetric.metric_date.desc()
    ).first()
    global_metric_insert = insert(CortexGlobalMetric).values(
        metric_date=func.current_date(),
        total_projects_created=(latest_metric.total_projects_created if latest_metric else 0) + 1,
        total_teams_created=(latest_metric.total_teams_created if latest_metric else 0) + 1,
        total_documents_uploaded=latest_metric.total_documents_uploaded if latest_metric else 0,
        total_decisions_made=latest_metric.total_decisions_made if latest_metric else 0,
        total_ai_requests=latest_metric.total_ai_requests if latest_metric else 0,
        total_input_tokens=latest_metric.total_input_tokens if latest_metric else 0,
        total_output_tokens=latest_metric.total_output_tokens if latest_metric else 0,
    )
    db.execute(
        global_metric_insert.on_conflict_do_update(
            index_elements=[CortexGlobalMetric.metric_date],
            set_={
                "total_projects_created": CortexGlobalMetric.total_projects_created + 1,
                "total_teams_created": CortexGlobalMetric.total_teams_created + 1,
                "updated_at": func.now(),
            },
        )
    )

    db.commit()
    db.refresh(new_project)

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

class UpdateProjectRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)

@router.patch("/projects/{project_id}")
def update_project(
    project_id: int,
    request: UpdateProjectRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()
    
    if not membership or membership.role != "admin":
        raise HTTPException(status_code=403, detail="Only project admin can update this project")

    project.name = request.name
    
    # Create audit log
    user = db.query(User).filter(User.user_id == user_id).first()
    create_audit_log(
        db=db,
        project_id=project_id,
        user_id=user_id,
        action="update",
        detail=f"{user.name} updated project name to '{request.name}'"
    )
    
    db.commit()
    return {"message": "Project updated successfully", "project": {"project_id": project.project_id, "name": project.name}}

@router.delete("/projects/{project_id}")
def delete_project(
    project_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    from models import (
        Document,
        DocumentVersion,
        DocumentChunk,
        Folder,
        ProjectAuditLog,
        InboxMessage,
        TeamMember,
        Team
    )

    from supabase_client import supabase

    # ----------------------------------------
    # Get project
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
    # Verify admin
    # ----------------------------------------
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership or membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin can delete project"
        )

    # ----------------------------------------
    # DELETE STORAGE FILES RECURSIVELY
    # ----------------------------------------
    try:

        files = supabase.storage.from_("documents").list(
            path=str(project_id)
        )

        file_paths = []

        def collect_paths(items, current_path):

            for item in items:

                item_name = item["name"]

                full_path = f"{current_path}/{item_name}"

                # folder
                if item.get("id") is None:

                    nested = supabase.storage.from_("documents").list(
                        path=full_path
                    )

                    collect_paths(nested, full_path)

                else:
                    file_paths.append(full_path)

        collect_paths(files, str(project_id))

        # delete all files
        if file_paths:

            supabase.storage.from_("documents").remove(
                file_paths
            )

    except Exception as e:

        print(f"Storage cleanup failed: {e}")

    # ----------------------------------------
    # Delete document chunks
    # ----------------------------------------
    db.query(DocumentChunk).filter(
        DocumentChunk.project_id == project_id
    ).delete(synchronize_session=False)

    # ----------------------------------------
    # Delete document versions
    # ----------------------------------------
    docs = db.query(Document).filter(
        Document.project_id == project_id
    ).all()

    doc_ids = [doc.document_id for doc in docs]

    if doc_ids:

        db.query(DocumentVersion).filter(
            DocumentVersion.document_id.in_(doc_ids)
        ).delete(synchronize_session=False)

    # ----------------------------------------
    # Delete documents
    # ----------------------------------------
    db.query(Document).filter(
        Document.project_id == project_id
    ).delete(synchronize_session=False)

    # ----------------------------------------
    # Delete folders
    # ----------------------------------------
    db.query(Folder).filter(
        Folder.project_id == project_id
    ).delete(synchronize_session=False)

    # ----------------------------------------
    # Delete audit logs
    # ----------------------------------------
    db.query(ProjectAuditLog).filter(
        ProjectAuditLog.project_id == project_id
    ).delete(synchronize_session=False)

    # ----------------------------------------
    # Delete inbox messages
    # ----------------------------------------
    db.query(InboxMessage).filter(
        InboxMessage.related_project_id == project_id
    ).delete(synchronize_session=False)

    # ----------------------------------------
    # Delete teams
    # ----------------------------------------
    teams = db.query(Team).filter(
        Team.project_id == project_id
    ).all()

    team_ids = [team.team_id for team in teams]

    if team_ids:

        db.query(TeamMember).filter(
            TeamMember.team_id.in_(team_ids)
        ).delete(synchronize_session=False)

    db.query(Team).filter(
        Team.project_id == project_id
    ).delete(synchronize_session=False)

    # ----------------------------------------
    # Delete project members
    # ----------------------------------------
    db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id
    ).delete(synchronize_session=False)

    # ----------------------------------------
    # Delete project
    # ----------------------------------------
    db.query(Project).filter(
        Project.project_id == project_id
    ).delete(synchronize_session=False)

    db.commit()

    return {
        "message": "Project deleted successfully"
    }
