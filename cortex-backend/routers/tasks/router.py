from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import asc, desc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import SessionLocal
from dependencies import get_current_user
from models import ProjectMember, Subtask, Task, TaskAssignee, Team, TeamMember, User
from routers.audit import create_audit_log


router = APIRouter(prefix="/projects/{project_id}/teams/{team_id}/tasks", tags=["tasks"])

VALID_STATUSES = {"TODO", "IN_PROGRESS", "DONE"}
VALID_PRIORITIES = {"LOW", "MEDIUM", "HIGH"}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class SubtaskInput(BaseModel):
    title: str = Field(..., min_length=1, max_length=80)
    position: Optional[int] = Field(default=None, ge=1)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Subtask title cannot be empty")
        return value


class TaskInput(BaseModel):
    title: str = Field(..., min_length=1, max_length=50)
    description: str = Field(default="", max_length=150)
    status: str = "TODO"
    due_date: date
    priority: str = "MEDIUM"
    assignee_ids: List[int] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list, max_length=3)
    subtasks: List[SubtaskInput] = Field(..., min_length=1)

    @field_validator("title", "description")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        value = value.upper()
        if value not in VALID_STATUSES:
            raise ValueError("Invalid task status")
        return value

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value: str) -> str:
        value = value.upper()
        if value not in VALID_PRIORITIES:
            raise ValueError("Invalid task priority")
        return value

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, values: List[str]) -> List[str]:
        normalized = []
        seen = set()
        for tag in values:
            tag = tag.strip()
            if not tag or len(tag) > 24:
                raise ValueError("Tags must be between 1 and 24 characters")
            key = tag.lower()
            if key in seen:
                raise ValueError("Tags must be unique")
            seen.add(key)
            normalized.append(tag)
        return normalized

    @model_validator(mode="after")
    def validate_lists(self):
        if len(set(self.assignee_ids)) != len(self.assignee_ids):
            raise ValueError("Assignees must be unique")
        return self


class StatusInput(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        value = value.upper()
        if value not in VALID_STATUSES:
            raise ValueError("Invalid task status")
        return value


class SubtaskCompletionInput(BaseModel):
    is_completed: bool


def _project_role(db: Session, project_id: int, user_id: int) -> Optional[str]:
    membership = db.query(ProjectMember.role).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first()
    return membership[0] if membership else None


def _team_or_404(db: Session, project_id: int, team_id: int) -> Team:
    team = db.query(Team).filter(Team.team_id == team_id, Team.project_id == project_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


def _require_project_member(db: Session, project_id: int, team_id: int, user_id: int) -> str:
    role = _project_role(db, project_id, user_id)
    if not role:
        raise HTTPException(status_code=403, detail="You are not a project member")
    _team_or_404(db, project_id, team_id)
    if role != "admin" and not db.query(TeamMember.id).filter(TeamMember.team_id == team_id, TeamMember.user_id == user_id).first():
        raise HTTPException(status_code=403, detail="You are not a member of this team")
    return role


def _task_or_404(db: Session, team_id: int, task_id: int) -> Task:
    task = db.query(Task).filter(Task.id == task_id, Task.team_id == team_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _is_assigned(db: Session, task_id: int, user_id: int) -> bool:
    return db.query(TaskAssignee.id).filter(TaskAssignee.task_id == task_id, TaskAssignee.user_id == user_id).first() is not None


def _require_task_access(db: Session, project_id: int, team_id: int, task_id: int, user_id: int) -> tuple[Task, str]:
    role = _require_project_member(db, project_id, team_id, user_id)
    task = _task_or_404(db, team_id, task_id)
    if role != "admin" and not _is_assigned(db, task.id, user_id):
        raise HTTPException(status_code=404, detail="Task not found")
    return task, role


def _require_admin(db: Session, project_id: int, team_id: int, user_id: int) -> None:
    if _require_project_member(db, project_id, team_id, user_id) != "admin":
        raise HTTPException(status_code=403, detail="Only project admins can manage tasks")


def _validate_assignees(db: Session, team_id: int, assignee_ids: List[int]) -> None:
    if not assignee_ids:
        return
    member_ids = {row[0] for row in db.query(TeamMember.user_id).filter(TeamMember.team_id == team_id, TeamMember.user_id.in_(assignee_ids)).all()}
    if member_ids != set(assignee_ids):
        raise HTTPException(status_code=422, detail="Every assignee must belong to the task team")


def _all_subtasks_complete(db: Session, task_id: int) -> bool:
    subtasks = db.query(Subtask).filter(Subtask.task_id == task_id).all()
    return bool(subtasks) and all(item.is_completed for item in subtasks)


def _serialize_task(db: Session, task: Task) -> dict:
    assignees = db.query(User).join(TaskAssignee, TaskAssignee.user_id == User.user_id).filter(TaskAssignee.task_id == task.id).order_by(User.name).all()
    subtasks = db.query(Subtask).filter(Subtask.task_id == task.id).order_by(asc(Subtask.position), asc(Subtask.id)).all()
    return {
        "id": task.id,
        "team_id": task.team_id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "due_date": task.due_date.isoformat(),
        "priority": task.priority,
        "assignees": [{"user_id": user.user_id, "name": user.name, "avatar_url": user.avatar_url} for user in assignees],
        "assignee_ids": [user.user_id for user in assignees],
        "tags": task.tags or [],
        "created_by": task.created_by,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        "subtasks": [{"id": item.id, "task_id": item.task_id, "title": item.title, "is_completed": item.is_completed, "position": item.position} for item in subtasks],
    }


def _replace_task_relations(db: Session, task: Task, payload: TaskInput) -> None:
    _validate_assignees(db, task.team_id, payload.assignee_ids)
    db.query(TaskAssignee).filter(TaskAssignee.task_id == task.id).delete(synchronize_session=False)
    db.query(Subtask).filter(Subtask.task_id == task.id).delete(synchronize_session=False)
    db.add_all([TaskAssignee(task_id=task.id, user_id=user_id) for user_id in payload.assignee_ids])
    db.add_all([Subtask(task_id=task.id, title=item.title, position=item.position or index) for index, item in enumerate(payload.subtasks, start=1)])


@router.get("")
def list_tasks(
    project_id: int,
    team_id: int,
    status: Optional[str] = Query(default=None),
    priority: Optional[str] = Query(default=None),
    sort: str = Query(default="due_date"),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    role = _require_project_member(db, project_id, team_id, user_id)
    query = db.query(Task).filter(Task.team_id == team_id)
    if role != "admin":
        query = query.join(TaskAssignee).filter(TaskAssignee.user_id == user_id)
    if status:
        status = status.upper()
        if status not in VALID_STATUSES:
            raise HTTPException(status_code=422, detail="Invalid status filter")
        query = query.filter(Task.status == status)
    if priority:
        priority = priority.upper()
        if priority not in VALID_PRIORITIES:
            raise HTTPException(status_code=422, detail="Invalid priority filter")
        query = query.filter(Task.priority == priority)
    order = [asc(Task.due_date), asc(Task.id)] if sort == "due_date" else [asc(Task.priority), asc(Task.due_date), asc(Task.id)]
    return {"tasks": [_serialize_task(db, task) for task in query.order_by(*order).all()]}


@router.post("", status_code=201)
def create_task(project_id: int, team_id: int, payload: TaskInput, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_admin(db, project_id, team_id, user_id)
    if payload.due_date < date.today():
        raise HTTPException(status_code=422, detail="Due date must be today or in the future")
    try:
        _validate_assignees(db, team_id, payload.assignee_ids)
        task = Task(team_id=team_id, title=payload.title, description=payload.description, status=payload.status, due_date=payload.due_date, priority=payload.priority, tags=payload.tags, created_by=user_id)
        db.add(task)
        db.flush()
        _replace_task_relations(db, task, payload)
        if task.status == "DONE" and not _all_subtasks_complete(db, task.id):
            raise HTTPException(status_code=422, detail="Complete every subtask before marking a task done")
        create_audit_log(db, project_id, user_id, "create", f"Created task '{task.title}'")
        db.commit()
        db.refresh(task)
        return {"task": _serialize_task(db, task)}
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Could not create task due to a data conflict")


@router.get("/{task_id}")
def get_task(project_id: int, team_id: int, task_id: int, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    task, _ = _require_task_access(db, project_id, team_id, task_id, user_id)
    return {"task": _serialize_task(db, task)}


@router.patch("/{task_id}")
def update_task(project_id: int, team_id: int, task_id: int, payload: TaskInput, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_admin(db, project_id, team_id, user_id)
    task = _task_or_404(db, team_id, task_id)
    if payload.due_date < date.today() and payload.due_date != task.due_date:
        raise HTTPException(status_code=422, detail="Due date must be today or in the future")
    try:
        task.title, task.description = payload.title, payload.description
        task.status, task.due_date, task.priority, task.tags = payload.status, payload.due_date, payload.priority, payload.tags
        _replace_task_relations(db, task, payload)
        db.flush()
        if task.status == "DONE" and not _all_subtasks_complete(db, task.id):
            raise HTTPException(status_code=422, detail="Complete every subtask before marking a task done")
        create_audit_log(db, project_id, user_id, "update", f"Updated task '{task.title}'")
        db.commit()
        db.refresh(task)
        return {"task": _serialize_task(db, task)}
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Could not update task due to a data conflict")


@router.delete("/{task_id}", status_code=204)
def delete_task(project_id: int, team_id: int, task_id: int, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_admin(db, project_id, team_id, user_id)
    task = _task_or_404(db, team_id, task_id)
    title = task.title
    db.delete(task)
    create_audit_log(db, project_id, user_id, "delete", f"Deleted task '{title}'")
    db.commit()


@router.patch("/{task_id}/status")
def update_task_status(project_id: int, team_id: int, task_id: int, payload: StatusInput, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    task, role = _require_task_access(db, project_id, team_id, task_id, user_id)
    if role != "admin" and not _is_assigned(db, task.id, user_id):
        raise HTTPException(status_code=403, detail="Only assignees can update this task")
    if payload.status == "DONE" and not _all_subtasks_complete(db, task.id):
        raise HTTPException(status_code=422, detail="Complete every subtask before marking a task done")
    task.status = payload.status
    create_audit_log(db, project_id, user_id, "update", f"Updated status for task '{task.title}'")
    db.commit()
    db.refresh(task)
    return {"task": _serialize_task(db, task)}


@router.patch("/{task_id}/subtasks/{subtask_id}")
def update_subtask_completion(project_id: int, team_id: int, task_id: int, subtask_id: int, payload: SubtaskCompletionInput, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    task, role = _require_task_access(db, project_id, team_id, task_id, user_id)
    if role != "admin" and not _is_assigned(db, task.id, user_id):
        raise HTTPException(status_code=403, detail="Only assignees can update subtasks")
    subtask = db.query(Subtask).filter(Subtask.id == subtask_id, Subtask.task_id == task.id).first()
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")
    subtask.is_completed = payload.is_completed
    if task.status == "DONE" and not payload.is_completed:
        task.status = "IN_PROGRESS"
    create_audit_log(db, project_id, user_id, "update", f"Updated a subtask on '{task.title}'")
    db.commit()
    db.refresh(task)
    return {"task": _serialize_task(db, task)}
