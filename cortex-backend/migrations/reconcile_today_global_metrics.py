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
                    WHERE created_at::date = CURRENT_DATE
                ),
                total_teams_created = (
                    SELECT COUNT(*)
                    FROM teams
                    WHERE created_at::date = CURRENT_DATE
                ),
                total_documents_uploaded = (
                    SELECT COUNT(*)
                    FROM documents
                    WHERE created_at::date = CURRENT_DATE
                ),
                total_decisions_made = (
                    SELECT COUNT(*)
                    FROM decisions
                    WHERE status = 'approved'
                      AND COALESCE(approved_at, created_at)::date = CURRENT_DATE
                ),
                updated_at = NOW()
            WHERE metric_date = CURRENT_DATE
        """))
