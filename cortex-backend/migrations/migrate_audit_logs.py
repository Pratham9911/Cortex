import logging
from sqlalchemy import text
from database import engine, SessionLocal
from models import Base, AuditLog, ProjectAuditLog

logger = logging.getLogger("cortex.migrations.audit")

def init_audit_logs_table_and_migrate():
    """
    Creates the `audit_logs` table (and indexes) if it does not exist,
    and explicitly migrates existing records from `project_audit_logs`.
    """
    # 1. Create table via SQLAlchemy metadata
    Base.metadata.create_all(bind=engine, tables=[AuditLog.__table__])
    logger.info("Ensured audit_logs table exists.")

    # 2. Add GIN index on metadata column if using PostgreSQL
    try:
        with engine.connect() as conn:
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata_gin ON audit_logs USING GIN (metadata);"))
            conn.commit()
    except Exception as e:
        logger.warning(f"Could not create GIN index on metadata (may not be Postgres or already exists): {e}")

    # 3. Explicit Data Migration
    db = SessionLocal()
    try:
        # Check if legacy logs exist
        legacy_logs = db.query(ProjectAuditLog).all()
        if not legacy_logs:
            logger.info("No legacy project_audit_logs found to migrate.")
            return

        # Check existing migrated count
        migrated_count = db.query(AuditLog).filter(
            AuditLog.metadata_["migrated_from_legacy"].as_boolean() == True
        ).count()

        if migrated_count >= len(legacy_logs):
            logger.info("Legacy audit logs have already been migrated.")
            return

        logger.info(f"Migrating {len(legacy_logs)} legacy project_audit_logs records to audit_logs...")

        new_entries = []
        for old in legacy_logs:
            # Map action string to valid category
            act = old.action.lower() if old.action else "system"
            if act not in ["create", "update", "delete", "system"]:
                act = "system"

            new_entries.append(AuditLog(
                project_id=old.project_id,
                event_type="project",              # Explicit project event
                actor_type="user",
                actor_user_id=old.user_id,
                resource_type="project",           # Explicit project resource
                resource_id=str(old.project_id),
                action=act,
                status="success",
                created_at=old.created_at,
                description=old.detail,
                metadata_={"migrated_from_legacy": True, "original_log_id": old.log_id}
            ))

        db.bulk_save_objects(new_entries)
        db.commit()
        logger.info(f"Successfully migrated {len(new_entries)} legacy audit log entries.")
    except Exception as e:
        db.rollback()
        logger.error(f"Error migrating legacy audit logs: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    init_audit_logs_table_and_migrate()
