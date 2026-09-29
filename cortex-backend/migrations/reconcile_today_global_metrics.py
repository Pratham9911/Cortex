from sqlalchemy import text

from database import engine


def reconcile_today_global_metrics() -> None:
    with engine.begin() as connection:
        connection.execute(text("""
            UPDATE cortex_global_metrics
            SET
                total_projects_created = (
                    SELECT COUNT(*)
                    FROM projects
                    WHERE (created_at AT TIME ZONE 'UTC')::date =
                          (NOW() AT TIME ZONE 'UTC')::date
                ),
                total_teams_created = (
                    SELECT COUNT(*)
                    FROM teams
                    WHERE (created_at AT TIME ZONE 'UTC')::date =
                          (NOW() AT TIME ZONE 'UTC')::date
                ),
                total_documents_uploaded = (
                    SELECT COUNT(*)
                    FROM documents
                    WHERE (created_at AT TIME ZONE 'UTC')::date =
                          (NOW() AT TIME ZONE 'UTC')::date
                ),
                total_decisions_made = (
                    SELECT COUNT(*)
                    FROM decisions
                    WHERE status = 'approved'
                      AND (COALESCE(approved_at, created_at) AT TIME ZONE 'UTC')::date =
                          (NOW() AT TIME ZONE 'UTC')::date
                ),
                updated_at = NOW()
            WHERE metric_date = (NOW() AT TIME ZONE 'UTC')::date
        """))
