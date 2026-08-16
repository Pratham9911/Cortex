from typing import Optional, List
import re
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, or_, case

from database import SessionLocal
from dependencies import get_current_user
from models import AuditLog, User, ProjectMember, Document, Folder, Project
from services.audit_service import AuditService

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_audit_log(
    db,
    project_id,
    user_id,
    action,
    detail
):
    """
    Backward-compatible wrapper around AuditService.record_event.
    """
    act = str(action).lower() if action else "system"
    if act not in ["create", "update", "delete", "system"]:
        act = "system"

    return AuditService.record_event(
        db=db,
        project_id=project_id,
        event_type="project",
        resource_type="project",
        resource_id=str(project_id),
        action=act,
        actor_user_id=user_id,
        actor_type="user",
        description=str(detail),
        status="success"
    )


def _build_audit_query(
    db: Session,
    project_id: int,
    event_type: Optional[str] = None,
    action: Optional[str] = None,
    status: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    q: Optional[str] = None,
    days: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    query = db.query(AuditLog, User).outerjoin(
        User, AuditLog.actor_user_id == User.user_id
    ).filter(
        AuditLog.project_id == project_id
    )

    if event_type and event_type != "all":
        query = query.filter(AuditLog.event_type == event_type)
    if action and action != "all":
        query = query.filter(AuditLog.action == action)
    if status and status != "all":
        query = query.filter(AuditLog.status == status)
    if resource_type and resource_type != "all":
        if resource_type == "document":
            query = query.filter(AuditLog.resource_type.in_(["document", "version"]))
        else:
            query = query.filter(AuditLog.resource_type == resource_type)
    if resource_id:
        query = query.filter(AuditLog.resource_id == str(resource_id))
    if actor_user_id:
        query = query.filter(AuditLog.actor_user_id == actor_user_id)

    # Date range filters
    if start_date:
        try:
            dt_start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            query = query.filter(AuditLog.created_at >= dt_start)
        except Exception:
            pass

    if end_date:
        try:
            dt_end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            query = query.filter(AuditLog.created_at <= dt_end)
        except Exception:
            pass
    elif days and days > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        query = query.filter(AuditLog.created_at >= cutoff)

    # Targeted performance-optimized q search
    if q and q.strip():
        term = f"%{q.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(AuditLog.description).like(term),
                func.lower(AuditLog.resource_id).like(term),
                func.lower(User.name).like(term),
                func.lower(AuditLog.metadata_["filename"].as_string()).like(term),
                func.lower(AuditLog.metadata_["file_name"].as_string()).like(term),
                func.lower(AuditLog.metadata_["folder_name"].as_string()).like(term),
                func.lower(AuditLog.metadata_["target_folder_name"].as_string()).like(term)
            )
        )

    return query


def _format_audit_log_items(db: Session, rows):
    doc_ids = set()
    version_ids = set()
    folder_ids = set()
    project_ids = set()
    user_ids = set()

    for log, actor_user in rows:
        if log.actor_user_id:
            user_ids.add(log.actor_user_id)
        if log.project_id:
            project_ids.add(log.project_id)

        if log.resource_type == "document" and log.resource_id and str(log.resource_id).isdigit():
            doc_ids.add(int(log.resource_id))
        elif log.resource_type == "version" and log.resource_id and str(log.resource_id).isdigit():
            version_ids.add(int(log.resource_id))
        elif log.resource_type == "folder" and log.resource_id and str(log.resource_id).isdigit():
            folder_ids.add(int(log.resource_id))
        elif log.resource_type == "project" and log.resource_id and str(log.resource_id).isdigit():
            project_ids.add(int(log.resource_id))

        if log.metadata_:
            if "document_id" in log.metadata_ and str(log.metadata_["document_id"]).isdigit():
                doc_ids.add(int(log.metadata_["document_id"]))
            if "version_id" in log.metadata_ and str(log.metadata_["version_id"]).isdigit():
                version_ids.add(int(log.metadata_["version_id"]))
            if "target_folder_id" in log.metadata_ and str(log.metadata_["target_folder_id"]).isdigit():
                folder_ids.add(int(log.metadata_["target_folder_id"]))

    version_obj_map = {}
    if version_ids:
        from models import DocumentVersion
        versions = db.query(DocumentVersion).filter(DocumentVersion.version_id.in_(version_ids)).all()
        for v in versions:
            version_obj_map[v.version_id] = v
            doc_ids.add(v.document_id)

    # Fetch document versions to map document_id -> file_name with extension (.pdf, .txt, .md, .docx, .pptx)
    doc_file_name_map = {}
    if doc_ids:
        from models import DocumentVersion
        doc_versions = db.query(DocumentVersion).filter(DocumentVersion.document_id.in_(doc_ids)).order_by(DocumentVersion.version_number.desc()).all()
        for dv in doc_versions:
            if dv.document_id not in doc_file_name_map and dv.file_name:
                doc_file_name_map[dv.document_id] = dv.file_name

    doc_map = {d.document_id: d.title for d in db.query(Document).filter(Document.document_id.in_(doc_ids)).all()} if doc_ids else {}
    folder_map = {f.folder_id: f.name for f in db.query(Folder).filter(Folder.folder_id.in_(folder_ids)).all()} if folder_ids else {}
    project_map = {p.project_id: p.name for p in db.query(Project).filter(Project.project_id.in_(project_ids)).all()} if project_ids else {}
    user_map = {u.user_id: u.name for u in db.query(User).filter(User.user_id.in_(user_ids)).all()} if user_ids else {}

    items = []
    for log, actor_user in rows:
        actor_name = actor_user.name if actor_user else (user_map.get(log.actor_user_id) or (f"User {log.actor_user_id}" if log.actor_user_id else "System"))

        doc_id = None
        v_obj = None

        if log.resource_type == "version" and log.resource_id and str(log.resource_id).isdigit():
            v_id = int(log.resource_id)
            v_obj = version_obj_map.get(v_id)
            if v_obj:
                doc_id = v_obj.document_id
        elif log.resource_type == "document" and log.resource_id and str(log.resource_id).isdigit():
            doc_id = int(log.resource_id)

        if not doc_id and log.metadata_ and "document_id" in log.metadata_ and str(log.metadata_["document_id"]).isdigit():
            doc_id = int(log.metadata_["document_id"])

        resource_name = None
        if log.metadata_ and log.metadata_.get("filename"):
            resource_name = log.metadata_["filename"]
        elif log.metadata_ and log.metadata_.get("file_name"):
            resource_name = log.metadata_["file_name"]
        elif v_obj and v_obj.file_name:
            resource_name = v_obj.file_name
        elif doc_id and doc_id in doc_file_name_map:
            resource_name = doc_file_name_map[doc_id]
        elif doc_id and doc_id in doc_map:
            resource_name = doc_map[doc_id]
        elif log.resource_type == "folder" and log.resource_id and str(log.resource_id).isdigit() and int(log.resource_id) in folder_map:
            resource_name = folder_map[int(log.resource_id)]
        elif log.metadata_ and log.metadata_.get("folder_name"):
            resource_name = log.metadata_["folder_name"]
        elif log.metadata_ and log.metadata_.get("target_folder_name"):
            resource_name = log.metadata_["target_folder_name"]
        elif log.resource_type == "project":
            p_id = int(log.resource_id) if log.resource_id and str(log.resource_id).isdigit() else log.project_id
            resource_name = project_map.get(p_id) or project_map.get(log.project_id) or "Project"
        else:
            resource_name = doc_map.get(doc_id) if doc_id else f"{log.resource_type.capitalize()}"

        display_resource_type = "document" if log.resource_type in ["document", "version"] else log.resource_type

        # Structured token resolution
        desc = log.description or ""

        def _user_repl(m):
            uid = int(m.group(1))
            return user_map.get(uid, actor_name)

        desc = re.sub(r"\{user:(\d+)\}", _user_repl, desc)

        def _doc_repl(m):
            did = int(m.group(1))
            return f"'{doc_file_name_map.get(did) or doc_map.get(did, resource_name)}'"

        desc = re.sub(r"\{document:(\d+)\}", _doc_repl, desc)

        def _folder_repl(m):
            fid = int(m.group(1))
            return f"'{folder_map.get(fid, 'Folder')}'"

        desc = re.sub(r"\{folder:(\d+)\}", _folder_repl, desc)

        def _project_repl(m):
            pid = int(m.group(1))
            return f"'{project_map.get(pid, 'Project')}'"

        desc = re.sub(r"\{project:(\d+)\}", _project_repl, desc)

        # Fallbacks for unparsed legacy strings
        if log.actor_user_id:
            desc = re.sub(rf"\bUser\s+{log.actor_user_id}\b", actor_name, desc, flags=re.IGNORECASE)
        desc = re.sub(r"\bUser\s+\d+\b", actor_name, desc, flags=re.IGNORECASE)

        if doc_id and (doc_id in doc_map or doc_id in doc_file_name_map):
            d_name = doc_file_name_map.get(doc_id) or doc_map.get(doc_id)
            desc = re.sub(rf"\bdocument\s+{doc_id}\b", f"'{d_name}'", desc, flags=re.IGNORECASE)

        if log.resource_type == "folder" and log.resource_id and str(log.resource_id).isdigit():
            f_id = int(log.resource_id)
            if f_id in folder_map:
                desc = re.sub(rf"\bfolder\s+{f_id}\b", f"'{folder_map[f_id]}'", desc, flags=re.IGNORECASE)

        items.append({
            "log_id": log.log_id,
            "project_id": log.project_id,
            "event_type": log.event_type,
            "action": log.action,
            "status": log.status,
            "actor": {
                "user_id": log.actor_user_id,
                "name": actor_name,
                "type": log.actor_type
            },
            "resource": {
                "type": display_resource_type,
                "id": str(doc_id if doc_id else log.resource_id),
                "name": resource_name
            },
            "before": log.before,
            "after": log.after,
            "metadata": log.metadata_,
            "description": desc,
            "created_at": log.created_at.isoformat() if log.created_at else None
        })

    return items


@router.get("/projects/{project_id}/audit-logs")
def list_project_audit_logs(
    project_id: int,
    event_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    resource_id: Optional[str] = Query(None),
    actor_user_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None),
    days: Optional[int] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")

    query = _build_audit_query(
        db=db,
        project_id=project_id,
        event_type=event_type,
        action=action,
        status=status,
        resource_type=resource_type,
        resource_id=resource_id,
        actor_user_id=actor_user_id,
        q=q,
        days=days,
        start_date=start_date,
        end_date=end_date
    )

    total = query.count()
    offset = (page - 1) * page_size
    rows = query.order_by(desc(AuditLog.created_at)).offset(offset).limit(page_size).all()

    items = _format_audit_log_items(db, rows)

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items
    }


@router.get("/projects/{project_id}/audit-logs/stats")
def get_audit_log_stats(
    project_id: int,
    days: int = Query(30),
    event_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    resource_id: Optional[str] = Query(None),
    actor_user_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")

    base_query = _build_audit_query(
        db=db,
        project_id=project_id,
        event_type=event_type,
        action=action,
        status=status,
        resource_type=resource_type,
        resource_id=resource_id,
        actor_user_id=actor_user_id,
        q=q,
        days=days if (not start_date and not end_date) else None,
        start_date=start_date,
        end_date=end_date
    )

    total_events = base_query.count()
    success_events = base_query.filter(AuditLog.status == "success").count()
    failed_events = base_query.filter(AuditLog.status == "failed").count()

    creates_count = base_query.filter(AuditLog.action == "create").count()
    updates_count = base_query.filter(AuditLog.action == "update").count()
    deletes_count = base_query.filter(AuditLog.action == "delete").count()
    system_count = base_query.filter(AuditLog.action == "system").count()

    daily_rows = (
        base_query.with_entities(
            func.date(AuditLog.created_at).label("day"),
            func.count(AuditLog.log_id).label("total"),
            func.sum(case((AuditLog.action == "create", 1), else_=0)).label("creates"),
            func.sum(case((AuditLog.action == "update", 1), else_=0)).label("updates"),
            func.sum(case((AuditLog.action == "delete", 1), else_=0)).label("deletes"),
            func.sum(case((AuditLog.action == "system", 1), else_=0)).label("system_cnt"),
            func.sum(case((AuditLog.status == "failed", 1), else_=0)).label("failed_cnt"),
        )
        .group_by(func.date(AuditLog.created_at))
        .order_by(func.date(AuditLog.created_at).asc())
        .all()
    )

    daily_activity = [
        {
            "date": str(r.day),
            "total": r.total or 0,
            "creates": r.creates or 0,
            "updates": r.updates or 0,
            "deletes": r.deletes or 0,
            "system": r.system_cnt or 0,
            "failed": r.failed_cnt or 0,
        }
        for r in daily_rows
    ]

    return {
        "total_events": total_events,
        "success_events": success_events,
        "failed_events": failed_events,
        "creates_count": creates_count,
        "updates_count": updates_count,
        "deletes_count": deletes_count,
        "system_count": system_count,
        "daily_activity": daily_activity,
    }
