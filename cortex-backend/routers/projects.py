from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, aliased
from pydantic import BaseModel, Field, validator
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import String, case, cast, func
from database import SessionLocal
from routers.audit import create_audit_log
from models import Document, DocumentVersion, Project, ProjectMember, Task, User, Team, TeamMember
from modelmetrics import (
    ProjectStorageDaily,
    ProjectTaskActivityDaily,
    increment_cortex_global_metrics,
    ProjectPack,
    UserPack,
)
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

    increment_cortex_global_metrics(db, projects=1, teams=1)

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
            admin_count_expr,
            ProjectPack.name.label("plan_name")
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
        .outerjoin(
            ProjectPack,
            ProjectPack.id == Project.plan_id
        )

        .group_by(
            Project.project_id,
            Project.name,
            Project.created_at,
            Project.created_by,
            User.name,
            membership_alias.role,
            ProjectPack.name
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

            "plan_name": project.plan_name or "Free",

            "created_at": project.created_at
        }
        for project in projects
    ]


@router.get("/projects/{project_id}/dashboard")
def get_project_dashboard(
    project_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied to this project")

    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    team_count = db.query(func.count(Team.team_id)).filter(
        Team.project_id == project_id
    ).scalar() or 0
    document_count = db.query(func.count(Document.document_id)).filter(
        Document.project_id == project_id
    ).scalar() or 0
    open_task_count = db.query(func.count(Task.id)).join(
        Team, Team.team_id == Task.team_id
    ).filter(
        Team.project_id == project_id,
        Task.status != "DONE",
    ).scalar() or 0
    completed_task_count = db.query(func.count(Task.id)).join(
        Team, Team.team_id == Task.team_id
    ).filter(
        Team.project_id == project_id,
        Task.status == "DONE",
    ).scalar() or 0

    members = db.query(
        ProjectMember.user_id,
        ProjectMember.role,
        ProjectMember.joined_at,
        User.name,
        User.email,
        User.avatar_url,
    ).join(
        User, User.user_id == ProjectMember.user_id
    ).filter(
        ProjectMember.project_id == project_id,
        User.is_deleted.is_(False),
    ).all()
    member_by_id = {
        row.user_id: {
            "user_id": row.user_id,
            "name": row.name,
            "email": row.email,
            "avatar_url": row.avatar_url,
            "role": row.role,
            "joined_at": row.joined_at.isoformat() if row.joined_at else None,
            "is_project_owner": row.user_id == project.created_by,
        }
        for row in members
        if row.user_id == project.created_by or row.role == "admin"
    }

    if project.created_by not in member_by_id:
        owner = db.query(User).filter(
            User.user_id == project.created_by,
            User.is_deleted.is_(False),
        ).first()
        if owner:
            member_by_id[owner.user_id] = {
                "user_id": owner.user_id,
                "name": owner.name,
                "email": owner.email,
                "avatar_url": owner.avatar_url,
                "role": "admin",
                "joined_at": None,
                "is_project_owner": True,
            }

    admin_list = sorted(
        member_by_id.values(),
        key=lambda item: (not item["is_project_owner"], item["name"].casefold()),
    )
    member_count = db.query(func.count(ProjectMember.id)).join(
        User, User.user_id == ProjectMember.user_id
    ).filter(
        ProjectMember.project_id == project_id,
        User.is_deleted.is_(False),
    ).scalar() or 0
    admin_count = len(admin_list)

    project_pack = db.query(ProjectPack).filter(
        ProjectPack.id == project.plan_id
    ).first() if project.plan_id else None
    storage_snapshot = db.query(ProjectStorageDaily).filter(
        ProjectStorageDaily.project_id == project_id
    ).order_by(ProjectStorageDaily.date.desc()).first()
    if storage_snapshot:
        storage_used_mb = float(storage_snapshot.storage_used_mb)
    else:
        storage_bytes = db.query(func.coalesce(func.sum(DocumentVersion.file_size), 0)).join(
            Document, Document.document_id == DocumentVersion.document_id
        ).filter(
            Document.project_id == project_id,
            DocumentVersion.status == "completed",
        ).scalar() or 0
        storage_used_mb = float(storage_bytes) / 1048576

    today = datetime.now(timezone.utc).date()
    history_start = today - timedelta(days=89)
    chart_start = start_date or today - timedelta(days=13)
    chart_end = end_date or today
    if chart_start > chart_end:
        raise HTTPException(status_code=422, detail="Start date must be on or before end date")
    if chart_end > today:
        raise HTTPException(status_code=422, detail="End date cannot be in the future")

    range_start = datetime.combine(history_start, datetime.min.time(), tzinfo=timezone.utc)
    range_end = datetime.combine(today + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
    previous_snapshot = db.query(ProjectTaskActivityDaily).filter(
        ProjectTaskActivityDaily.project_id == project_id,
        ProjectTaskActivityDaily.date < chart_start,
    ).order_by(ProjectTaskActivityDaily.date.desc()).first()
    previous_completed_total = db.query(
        func.max(ProjectTaskActivityDaily.completed_tasks)
    ).filter(
        ProjectTaskActivityDaily.project_id == project_id,
        ProjectTaskActivityDaily.date < chart_start,
    ).scalar()
    chart_snapshots = db.query(ProjectTaskActivityDaily).filter(
        ProjectTaskActivityDaily.project_id == project_id,
        ProjectTaskActivityDaily.date >= chart_start,
        ProjectTaskActivityDaily.date <= chart_end,
    ).order_by(ProjectTaskActivityDaily.date.asc()).all()

    task_activity = []
    if previous_snapshot or chart_snapshots:
        if previous_snapshot:
            activity_date = chart_start
            open_tasks_for_day = previous_snapshot.open_tasks
            completed_tasks_for_day = max(
                previous_snapshot.completed_tasks,
                int(previous_completed_total or 0),
            )
        else:
            activity_date = chart_snapshots[0].date
            open_tasks_for_day = chart_snapshots[0].open_tasks
            completed_tasks_for_day = chart_snapshots[0].completed_tasks
        snapshots_by_date = {snapshot.date: snapshot for snapshot in chart_snapshots}
        while activity_date <= chart_end:
            snapshot = snapshots_by_date.get(activity_date)
            if snapshot:
                open_tasks_for_day = snapshot.open_tasks
                completed_tasks_for_day = max(
                    completed_tasks_for_day,
                    snapshot.completed_tasks,
                )
            if activity_date == today:
                completed_tasks_for_day = max(
                    completed_tasks_for_day,
                    int(completed_task_count),
                )
            task_activity.append({
                "date": activity_date.isoformat(),
                "open_tasks": open_tasks_for_day,
                "completed_tasks": completed_tasks_for_day,
            })
            activity_date += timedelta(days=1)
    elif chart_start <= today <= chart_end:
        task_activity = [{
            "date": today.isoformat(),
            "open_tasks": int(open_task_count),
            "completed_tasks": int(completed_task_count),
        }]

    completed_history_total = db.query(
        func.max(ProjectTaskActivityDaily.completed_tasks)
    ).filter(
        ProjectTaskActivityDaily.project_id == project_id,
        ProjectTaskActivityDaily.date <= today,
    ).scalar()
    completed_history_total = max(
        int(completed_history_total or 0),
        int(completed_task_count),
    )

    team_created_rows = db.query(Team.created_at).filter(
        Team.project_id == project_id,
        Team.created_at >= range_start,
        Team.created_at < range_end,
    ).all()
    document_created_rows = db.query(Document.created_at).filter(
        Document.project_id == project_id,
        Document.created_at >= range_start,
        Document.created_at < range_end,
    ).all()

    def utc_date(value: datetime | None) -> date | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).date()

    team_created_by_date: dict[date, int] = {}
    for row in team_created_rows:
        created_date = utc_date(row.created_at)
        if created_date:
            team_created_by_date[created_date] = team_created_by_date.get(created_date, 0) + 1
    documents_created_by_date: dict[date, int] = {}
    for row in document_created_rows:
        created_date = utc_date(row.created_at)
        if created_date:
            documents_created_by_date[created_date] = documents_created_by_date.get(created_date, 0) + 1

    created_activity = []
    activity_date = history_start
    while activity_date <= today:
        created_activity.append({
            "date": activity_date.isoformat(),
            "teams_created": team_created_by_date.get(activity_date, 0),
            "documents_created": documents_created_by_date.get(activity_date, 0),
        })
        activity_date += timedelta(days=1)

    return {
        "project": {
            "project_id": project.project_id,
            "name": project.name,
            "created_at": project.created_at.isoformat() if project.created_at else None,
        },
        "summary": {
            "team_count": int(team_count),
            "document_count": int(document_count),
            "open_tasks": int(open_task_count),
            "completed_tasks": int(completed_history_total),
            "member_count": int(member_count),
            "admin_count": int(admin_count),
            "storage_used_mb": storage_used_mb,
            "storage_limit_mb": int(project_pack.max_storage_mb) if project_pack else None,
        },
        "admins": admin_list,
        "task_activity": task_activity,
        "created_activity": created_activity,
        "task_history_start_date": task_activity[0]["date"] if task_activity else None,
        "task_snapshot_count": len(chart_snapshots),
    }

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


@router.delete("/projects/{project_id}/leave")
def leave_project(
    project_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(
        Project.project_id == project_id
    ).with_for_update().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.created_by == user_id:
        raise HTTPException(
            status_code=403,
            detail="Project owner cannot leave the project. Transfer ownership or delete the project instead.",
        )

    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).with_for_update().first()
    if not membership:
        raise HTTPException(
            status_code=404,
            detail="You are not a member of this project",
        )

    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    team_memberships = db.query(TeamMember).join(
        Team,
        Team.team_id == TeamMember.team_id
    ).filter(
        Team.project_id == project_id,
        TeamMember.user_id == user_id
    ).all()
    for team_membership in team_memberships:
        db.delete(team_membership)

    create_audit_log(
        db=db,
        project_id=project_id,
        user_id=user_id,
        action="delete",
        detail=f"{user.name} left project '{project.name}'",
    )
    db.delete(membership)
    db.commit()

    return {"message": "You left the project successfully"}


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
