import logging
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from database import SessionLocal
from models import AuditLog

logger = logging.getLogger("cortex.audit")


class AuditService:
    @staticmethod
    def record_event(
        db: Session,
        project_id: int,
        event_type: str,
        resource_type: str,
        resource_id: Any,
        action: str,
        description: str,
        actor_user_id: Optional[int] = None,
        actor_type: str = "user",
        before: Optional[Dict[str, Any]] = None,
        after: Optional[Dict[str, Any]] = None,
        status: str = "success",
        metadata: Optional[Dict[str, Any]] = None
    ) -> AuditLog:
        """
        Records a structured audit log entry in the provided primary DB session.
        Participates in the main business transaction.
        Errors are NOT swallowed so that main transaction atomicity is preserved.
        """
        log_entry = AuditLog(
            project_id=project_id,
            event_type=event_type,
            actor_type=actor_type,
            actor_user_id=actor_user_id,
            resource_type=resource_type,
            resource_id=str(resource_id),
            action=action,
            before=before,
            after=after,
            status=status,
            metadata_=metadata,
            description=description
        )
        db.add(log_entry)
        return log_entry

    @staticmethod
    def record_failure(
        project_id: int,
        event_type: str,
        resource_type: str,
        resource_id: Any,
        action: str,
        description: str,
        error_detail: str,
        actor_user_id: Optional[int] = None,
        actor_type: str = "user",
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Records a failed audit event in an isolated DB session so it persists
        even when the main business transaction rolls back.
        """
        db = SessionLocal()
        try:
            meta = metadata or {}
            meta["error_detail"] = str(error_detail)
            log_entry = AuditLog(
                project_id=project_id,
                event_type=event_type,
                actor_type=actor_type,
                actor_user_id=actor_user_id,
                resource_type=resource_type,
                resource_id=str(resource_id),
                action=action,
                before=None,
                after=None,
                status="failed",
                metadata_=meta,
                description=description
            )
            db.add(log_entry)
            db.commit()
            logger.info(f"Recorded audit failure event for resource {resource_type}:{resource_id}")
        except Exception as e:
            db.rollback()
            logger.exception(f"Failed to record audit failure entry: {e}")
        finally:
            db.close()
