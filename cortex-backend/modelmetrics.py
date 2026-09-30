"""Database models for platform-level usage metrics.

Pack definitions deliberately remain in Supabase-managed tables. Application
code should query those tables through future metric/limit helpers rather than
duplicating plan limits here.
"""

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import BigInteger, CheckConstraint, Column, Computed, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from database import Base


class UserPack(Base):
    """Pack limits applied to an individual user."""

    __tablename__ = "user_packs"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    name = Column(String(20), nullable=False, unique=True)
    max_projects = Column(Integer, nullable=False)
    daily_token_limit = Column(BigInteger, nullable=False)
    daily_request_limit = Column(Integer, nullable=False)
    model_name = Column(String(100), nullable=False, default="DeepSeek V4.1 Flash")
    input_model_cost = Column(Numeric(12, 6), nullable=False, default=0.22)
    output_model_cost = Column(Numeric(12, 6), nullable=False, default=0.66)

    __table_args__ = (
        CheckConstraint("max_projects >= 0", name="ck_user_packs_projects_nonnegative"),
        CheckConstraint("daily_token_limit >= 0", name="ck_user_packs_tokens_nonnegative"),
        CheckConstraint("daily_request_limit >= 0", name="ck_user_packs_requests_nonnegative"),
        CheckConstraint("input_model_cost >= 0", name="ck_user_packs_input_model_cost_nonnegative"),
        CheckConstraint("output_model_cost >= 0", name="ck_user_packs_output_model_cost_nonnegative"),
    )


class ProjectPack(Base):
    """Pack limits applied to a project independently of member packs."""

    __tablename__ = "project_packs"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    name = Column(String(20), nullable=False, unique=True)
    max_members = Column(Integer, nullable=False)
    max_storage_mb = Column(BigInteger, nullable=False)
    max_teams = Column(Integer, nullable=False)
    max_documents = Column(Integer, nullable=False)

    __table_args__ = (
        CheckConstraint("max_members >= 0", name="ck_project_packs_members_nonnegative"),
        CheckConstraint("max_storage_mb >= 0", name="ck_project_packs_storage_nonnegative"),
        CheckConstraint("max_teams >= 0", name="ck_project_packs_teams_nonnegative"),
        CheckConstraint("max_documents >= 0", name="ck_project_packs_documents_nonnegative"),
    )


class CortexGlobalMetric(Base):
    """Daily totals of Cortex usage."""

    __tablename__ = "cortex_global_metrics"

    id = Column(Integer, primary_key=True, index=True)
    metric_date = Column(Date, nullable=False, unique=True, index=True)
    total_projects_created = Column(Integer, nullable=False)
    total_teams_created = Column(Integer, nullable=False)
    total_documents_uploaded = Column(Integer, nullable=False)
    total_decisions_made = Column(Integer, nullable=False)
    total_ai_requests = Column(Integer, nullable=False)
    total_ai_input_cost = Column(
        Numeric(20, 10),
        nullable=False,
        default=Decimal("0"),
        server_default="0",
    )
    total_ai_output_cost = Column(
        Numeric(20, 10),
        nullable=False,
        default=Decimal("0"),
        server_default="0",
    )
    total_ai_cost = Column(
        Numeric(20, 10),
        Computed("total_ai_input_cost + total_ai_output_cost", persisted=True),
        nullable=False,
    )
    total_input_tokens = Column(BigInteger, nullable=False)
    total_output_tokens = Column(BigInteger, nullable=False)
    total_tokens = Column(BigInteger, Computed("total_input_tokens + total_output_tokens", persisted=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("total_projects_created >= 0", name="ck_global_metrics_projects_nonnegative"),
        CheckConstraint("total_teams_created >= 0", name="ck_global_metrics_teams_nonnegative"),
        CheckConstraint("total_documents_uploaded >= 0", name="ck_global_metrics_documents_nonnegative"),
        CheckConstraint("total_decisions_made >= 0", name="ck_global_metrics_decisions_nonnegative"),
        CheckConstraint("total_ai_requests >= 0", name="ck_global_metrics_requests_nonnegative"),
        CheckConstraint("total_ai_input_cost >= 0", name="ck_global_metrics_input_cost_nonnegative"),
        CheckConstraint("total_ai_output_cost >= 0", name="ck_global_metrics_output_cost_nonnegative"),
        CheckConstraint("total_ai_cost >= 0", name="ck_global_metrics_cost_nonnegative"),
        CheckConstraint("total_input_tokens >= 0", name="ck_global_metrics_input_tokens_nonnegative"),
        CheckConstraint("total_output_tokens >= 0", name="ck_global_metrics_output_tokens_nonnegative"),
        CheckConstraint("total_tokens = total_input_tokens + total_output_tokens", name="ck_global_metrics_tokens_match"),
        Index("ix_cortex_global_metrics_metric_date", "metric_date"),
    )


class ProjectStorageDaily(Base):
    """Per-project daily snapshots of successfully ingested document storage."""

    __tablename__ = "project_storage_daily"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(
        Integer,
        ForeignKey("projects.project_id", ondelete="CASCADE"),
        nullable=False,
    )
    date = Column(Date, nullable=False)
    storage_used_mb = Column(
        Numeric(24, 12),
        nullable=False,
        default=Decimal("0"),
        server_default="0",
    )

    __table_args__ = (
        CheckConstraint("storage_used_mb >= 0", name="ck_project_storage_nonnegative"),
        UniqueConstraint(
            "project_id",
            "date",
            name="uq_project_storage_daily_project_date",
        ),
    )


class ProjectTaskActivityDaily(Base):
    """Per-project daily snapshots of open and completed task counts."""

    __tablename__ = "project_task_activity_daily"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(
        Integer,
        ForeignKey("projects.project_id", ondelete="CASCADE"),
        nullable=False,
    )
    date = Column(Date, nullable=False)
    open_tasks = Column(Integer, nullable=False, default=0, server_default="0")
    completed_tasks = Column(Integer, nullable=False, default=0, server_default="0")

    __table_args__ = (
        CheckConstraint("open_tasks >= 0", name="ck_project_task_activity_open_nonnegative"),
        CheckConstraint("completed_tasks >= 0", name="ck_project_task_activity_completed_nonnegative"),
        UniqueConstraint(
            "project_id",
            "date",
            name="uq_project_task_activity_daily_project_date",
        ),
    )


def sync_project_storage_snapshot(
    db: Session,
    project_id: int,
    *,
    storage_date: date | None = None,
) -> None:
    """Replace today's snapshot with the project's successfully ingested storage."""
    storage_date = storage_date or datetime.now(timezone.utc).date()
    db.execute(
        text("""
            INSERT INTO project_storage_daily (
                project_id,
                date,
                storage_used_mb
            )
            SELECT
                :project_id,
                :storage_date,
                COALESCE((
                    SELECT SUM(version.file_size)::numeric / 1048576
                    FROM documents AS document
                    JOIN document_versions AS version
                        ON version.document_id = document.document_id
                    WHERE document.project_id = :project_id
                      AND version.status = 'completed'
                ), 0)
            ON CONFLICT (project_id, date)
            DO UPDATE SET storage_used_mb = EXCLUDED.storage_used_mb
        """),
        {
            "project_id": project_id,
            "storage_date": storage_date,
        },
    )


def ensure_project_task_activity_snapshot(
    db: Session,
    project_id: int,
) -> date:
    """Create today's baseline from current task totals if it does not exist."""
    activity_date = datetime.now(timezone.utc).date()
    db.execute(
        text("""
            INSERT INTO project_task_activity_daily (
                project_id,
                date,
                open_tasks,
                completed_tasks
            )
            SELECT
                :project_id,
                :activity_date,
                COUNT(task.id) FILTER (WHERE task.status <> 'DONE'),
                COUNT(task.id) FILTER (WHERE task.status = 'DONE')
            FROM teams AS team
            LEFT JOIN tasks AS task ON task.team_id = team.team_id
            WHERE team.project_id = :project_id
            ON CONFLICT (project_id, date)
            DO NOTHING
        """),
        {
            "project_id": project_id,
            "activity_date": activity_date,
        },
    )
    return activity_date


def record_project_task_activity_change(
    db: Session,
    project_id: int,
    *,
    open_delta: int = 0,
    completed_delta: int = 0,
    activity_date: date | None = None,
) -> None:
    """Apply a task-count change to the baseline initialized before the change."""
    activity_date = activity_date or datetime.now(timezone.utc).date()
    result = db.execute(
        text("""
            UPDATE project_task_activity_daily
            SET open_tasks = open_tasks + :open_delta,
                completed_tasks = completed_tasks + :completed_delta
            WHERE project_id = :project_id
              AND date = :activity_date
        """),
        {
            "project_id": project_id,
            "activity_date": activity_date,
            "open_delta": open_delta,
            "completed_delta": completed_delta,
        },
    )
    if result.rowcount != 1:
        raise RuntimeError("Task activity baseline was not initialized for this project and date")


def increment_cortex_global_metrics(
    db: Session,
    *,
    projects: int = 0,
    teams: int = 0,
    documents: int = 0,
    decisions: int = 0,
    ai_requests: int = 0,
    ai_input_cost: Decimal | int = Decimal("0"),
    ai_output_cost: Decimal | int = Decimal("0"),
    input_tokens: int = 0,
    output_tokens: int = 0,
    metric_date: date | None = None,
) -> None:
    increments = {
        "total_projects_created": projects,
        "total_teams_created": teams,
        "total_documents_uploaded": documents,
        "total_decisions_made": decisions,
    }
    metric_date = metric_date or datetime.now(timezone.utc).date()
    increments.update({
        "total_ai_requests": ai_requests,
        "total_ai_input_cost": ai_input_cost,
        "total_ai_output_cost": ai_output_cost,
        "total_input_tokens": input_tokens,
        "total_output_tokens": output_tokens,
    })
    values = {
        "metric_date": metric_date,
        "total_projects_created": projects,
        "total_teams_created": teams,
        "total_documents_uploaded": documents,
        "total_decisions_made": decisions,
        "total_ai_requests": ai_requests,
        "total_ai_input_cost": ai_input_cost,
        "total_ai_output_cost": ai_output_cost,
        "total_input_tokens": input_tokens,
        "total_output_tokens": output_tokens,
    }
    db.execute(
        insert(CortexGlobalMetric)
        .values(**values)
        .on_conflict_do_update(
            index_elements=[CortexGlobalMetric.metric_date],
            set_={
                **{
                    column: getattr(CortexGlobalMetric, column) + amount
                    for column, amount in increments.items()
                    if amount
                },
                "updated_at": func.now(),
            },
        )
    )
