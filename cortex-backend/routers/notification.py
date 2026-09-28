from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import SessionLocal
from dependencies import get_current_user
from models import Notification, ProjectMember, User

router = APIRouter(prefix="/projects/{project_id}/notifications", tags=["notifications"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _require_project_member(db: Session, project_id: int, user_id: int) -> None:
    if not db.query(ProjectMember).filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id).first():
        raise HTTPException(status_code=403, detail="You are not a project member")


def _serialize(notification: Notification, actor: User | None) -> dict:
    return {"id": notification.id, "type": notification.type, "title": notification.title, "message": notification.message, "reference_type": notification.reference_type, "reference_id": notification.reference_id, "team_id": notification.team_id, "is_read": notification.is_read, "created_at": notification.created_at, "read_at": notification.read_at, "actor": None if not actor else {"user_id": actor.user_id, "name": actor.name, "avatar_url": actor.avatar_url}}


@router.get("")
def list_notifications(project_id: int, unread_only: bool = Query(default=False), user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_project_member(db, project_id, user_id)
    base_query = db.query(Notification).filter(Notification.project_id == project_id, Notification.user_id == user_id)
    unread_count = base_query.filter(Notification.is_read.is_(False)).count()
    query = base_query
    if unread_only:
        query = query.filter(Notification.is_read.is_(False))
    notifications = query.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(100).all()
    actor_ids = {item.actor_id for item in notifications if item.actor_id}
    actors = {actor.user_id: actor for actor in db.query(User).filter(User.user_id.in_(actor_ids)).all()} if actor_ids else {}
    return {"notifications": [_serialize(item, actors.get(item.actor_id)) for item in notifications], "unread_count": unread_count}


@router.patch("/{notification_id}/read")
def mark_notification_read(project_id: int, notification_id: int, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_project_member(db, project_id, user_id)
    notification = db.query(Notification).filter(Notification.id == notification_id, Notification.project_id == project_id, Notification.user_id == user_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(notification)
    actor = db.query(User).filter(User.user_id == notification.actor_id).first() if notification.actor_id else None
    return {"notification": _serialize(notification, actor)}


@router.delete("/{notification_id}", status_code=204)
def delete_notification(project_id: int, notification_id: int, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_project_member(db, project_id, user_id)
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.project_id == project_id,
        Notification.user_id == user_id,
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    db.delete(notification)
    db.commit()
