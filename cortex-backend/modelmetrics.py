"""Database models for platform-level usage metrics.

Pack definitions deliberately remain in Supabase-managed tables. Application
code should query those tables through future metric/limit helpers rather than
duplicating plan limits here.
"""

from datetime import date, datetime, timezone

from sqlalchemy import BigInteger, CheckConstraint, Column, Computed, Date, DateTime, Index, Integer, String
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

    __table_args__ = (
        CheckConstraint("max_projects >= 0", name="ck_user_packs_projects_nonnegative"),
        CheckConstraint("daily_token_limit >= 0", name="ck_user_packs_tokens_nonnegative"),
        CheckConstraint("daily_request_limit >= 0", name="ck_user_packs_requests_nonnegative"),
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
        CheckConstraint("total_input_tokens >= 0", name="ck_global_metrics_input_tokens_nonnegative"),
        CheckConstraint("total_output_tokens >= 0", name="ck_global_metrics_output_tokens_nonnegative"),
        CheckConstraint("total_tokens = total_input_tokens + total_output_tokens", name="ck_global_metrics_tokens_match"),
        Index("ix_cortex_global_metrics_metric_date", "metric_date"),
    )


def increment_cortex_global_metrics(
    db: Session,
    *,
    projects: int = 0,
    teams: int = 0,
    documents: int = 0,
    decisions: int = 0,
    ai_requests: int = 0,
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
