from sqlalchemy import text

from database import engine


def init_ai_usage_daily_table() -> None:
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS ai_usage_daily (
                id BIGSERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                project_id INTEGER NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
                usage_date DATE NOT NULL,
                request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
                successful_requests INTEGER NOT NULL DEFAULT 0 CHECK (successful_requests >= 0),
                failed_requests INTEGER NOT NULL DEFAULT 0 CHECK (failed_requests >= 0),
                input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
                output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
                total_tokens BIGINT GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT uq_ai_usage_user_project_date UNIQUE (user_id, project_id, usage_date)
            )
        """))
        connection.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_ai_usage_daily_user_date
            ON ai_usage_daily (user_id, usage_date)
        """))
