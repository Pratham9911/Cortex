import sys
import os

# Ensure backend root is on Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
from database import SessionLocal, engine
from models import Base, AuditLog, ProjectAuditLog, Project, User
from migrations.migrate_audit_logs import init_audit_logs_table_and_migrate
from services.audit_service import AuditService


class TestAuditService(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        init_audit_logs_table_and_migrate()

    def setUp(self):
        self.db = SessionLocal()

    def tearDown(self):
        self.db.close()

    def test_01_schema_and_record_event(self):
        """Test creating a structured audit event in the main transaction."""
        # Find or create a project & user for test
        user = self.db.query(User).first()
        project = self.db.query(Project).first()

        if not user or not project:
            self.skipTest("No test user or project found in DB")

        log = AuditService.record_event(
            db=self.db,
            project_id=project.project_id,
            event_type="document",
            resource_type="document",
            resource_id="99999",
            action="update",
            actor_user_id=user.user_id,
            before={"title": "Old Document.pdf"},
            after={"title": "New Document.pdf"},
            metadata={"source": "unittest", "file_size": 1024},
            description=f"User {user.user_id} renamed test document 99999"
        )
        self.db.commit()

        self.assertIsNotNone(log.log_id)
        self.assertEqual(log.event_type, "document")
        self.assertEqual(log.action, "update")
        self.assertEqual(log.status, "success")
        self.assertEqual(log.before, {"title": "Old Document.pdf"})
        self.assertEqual(log.after, {"title": "New Document.pdf"})

        # Clean up test entry
        self.db.delete(log)
        self.db.commit()

    def test_02_record_failure_isolation(self):
        """Test isolated session logging for failed operations."""
        project = self.db.query(Project).first()
        if not project:
            self.skipTest("No test project found in DB")

        AuditService.record_failure(
            project_id=project.project_id,
            event_type="document",
            resource_type="document",
            resource_id="88888",
            action="create",
            description="System failed to ingest document 88888",
            error_detail="MemoryLimitExceeded in pdf_parser",
            metadata={"stage": "text_extraction"}
        )

        failed_entry = self.db.query(AuditLog).filter(
            AuditLog.resource_id == "88888",
            AuditLog.status == "failed"
        ).first()

        self.assertIsNotNone(failed_entry)
        self.assertEqual(failed_entry.status, "failed")
        self.assertIn("error_detail", failed_entry.metadata_)
        self.assertEqual(failed_entry.metadata_["error_detail"], "MemoryLimitExceeded in pdf_parser")

        # Clean up test entry
        self.db.delete(failed_entry)
        self.db.commit()

    def test_03_explicit_legacy_migration(self):
        """Verify legacy project_audit_logs entries migrate explicitly as project/project events."""
        # Query any migrated logs
        migrated_entry = self.db.query(AuditLog).filter(
            AuditLog.metadata_["migrated_from_legacy"].as_boolean() == True
        ).first()

        if migrated_entry:
            self.assertEqual(migrated_entry.event_type, "project")
            self.assertEqual(migrated_entry.resource_type, "project")
            self.assertIsNotNone(migrated_entry.resource_id)


    def test_04_update_comparison_snapshots(self):
        """Test field comparison and exact before/after snapshot structure for document/folder updates."""
        user = self.db.query(User).first()
        project = self.db.query(Project).first()

        if not user or not project:
            self.skipTest("No test user or project found in DB")

        before_state = {"name": "old.pdf", "description": "Old", "tags": ["api"]}
        after_state = {"name": "new.pdf", "description": "New", "tags": ["api", "backend"]}
        updated_fields = ["name", "description", "tags"]

        log = AuditService.record_event(
            db=self.db,
            project_id=project.project_id,
            event_type="document",
            resource_type="document",
            resource_id="77777",
            action="update",
            actor_user_id=user.user_id,
            before=before_state,
            after=after_state,
            metadata={"updated_fields": updated_fields},
            description=f"User {user.user_id} updated document 77777 ({', '.join(updated_fields)})"
        )
        self.db.commit()

        fetched = self.db.query(AuditLog).filter(AuditLog.resource_id == "77777").first()
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched.before, before_state)
        self.assertEqual(fetched.after, after_state)
        self.assertEqual(fetched.metadata_["updated_fields"], ["name", "description", "tags"])

        self.db.delete(fetched)
        self.db.commit()


if __name__ == "__main__":
    unittest.main()
