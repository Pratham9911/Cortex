from sqlalchemy import text

from database import engine


def init_ai_model_costs() -> None:
    with engine.begin() as connection:
        usage_cost_columns_exist = connection.execute(text("""
            SELECT
                EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = 'ai_usage_daily'
                      AND column_name = 'input_cost'
                )
                AND EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = 'ai_usage_daily'
                      AND column_name = 'output_cost'
                )
                AND EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = 'ai_usage_daily'
                      AND column_name = 'total_cost'
                )
        """)).scalar()
        global_cost_components_exist = connection.execute(text("""
            SELECT
                EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = 'cortex_global_metrics'
                      AND column_name = 'total_ai_input_cost'
                )
                AND EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = 'cortex_global_metrics'
                      AND column_name = 'total_ai_output_cost'
                )
        """)).scalar()
        global_total_cost_is_generated = connection.execute(text("""
            SELECT COALESCE((
                SELECT is_generated = 'ALWAYS'
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'cortex_global_metrics'
                  AND column_name = 'total_ai_cost'
            ), FALSE)
        """)).scalar()
        connection.execute(text("""
            ALTER TABLE user_packs
                ADD COLUMN IF NOT EXISTS model_name VARCHAR(100)
                    NOT NULL DEFAULT 'DeepSeek V4.1 Flash',
                ADD COLUMN IF NOT EXISTS input_model_cost NUMERIC(12, 6)
                    NOT NULL DEFAULT 0.22,
                ADD COLUMN IF NOT EXISTS output_model_cost NUMERIC(12, 6)
                    NOT NULL DEFAULT 0.66
        """))
        connection.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'ck_user_packs_input_model_cost_nonnegative'
                      AND conrelid = 'user_packs'::regclass
                ) THEN
                    ALTER TABLE user_packs
                        ADD CONSTRAINT ck_user_packs_input_model_cost_nonnegative
                        CHECK (input_model_cost >= 0);
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'ck_user_packs_output_model_cost_nonnegative'
                      AND conrelid = 'user_packs'::regclass
                ) THEN
                    ALTER TABLE user_packs
                        ADD CONSTRAINT ck_user_packs_output_model_cost_nonnegative
                        CHECK (output_model_cost >= 0);
                END IF;
            END $$;
        """))
        connection.execute(text("""
            ALTER TABLE ai_usage_daily
                ADD COLUMN IF NOT EXISTS input_cost NUMERIC(20, 10)
                    NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS output_cost NUMERIC(20, 10)
                    NOT NULL DEFAULT 0
        """))
        connection.execute(text("""
            ALTER TABLE ai_usage_daily
                ADD COLUMN IF NOT EXISTS total_cost NUMERIC(20, 10)
                GENERATED ALWAYS AS (input_cost + output_cost) STORED
        """))
        connection.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'ck_ai_usage_input_cost_nonnegative'
                      AND conrelid = 'ai_usage_daily'::regclass
                ) THEN
                    ALTER TABLE ai_usage_daily
                        ADD CONSTRAINT ck_ai_usage_input_cost_nonnegative
                        CHECK (input_cost >= 0);
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'ck_ai_usage_output_cost_nonnegative'
                      AND conrelid = 'ai_usage_daily'::regclass
                ) THEN
                    ALTER TABLE ai_usage_daily
                        ADD CONSTRAINT ck_ai_usage_output_cost_nonnegative
                        CHECK (output_cost >= 0);
                END IF;
            END $$;
        """))
        if not usage_cost_columns_exist:
            connection.execute(text("""
                UPDATE ai_usage_daily AS usage
                SET
                    input_cost = ROUND(
                        usage.input_tokens * COALESCE(pack.input_model_cost, 0.22) / 1000000,
                        10
                    ),
                    output_cost = ROUND(
                        usage.output_tokens * COALESCE(pack.output_model_cost, 0.66) / 1000000,
                        10
                    )
                FROM users AS app_user
                LEFT JOIN user_packs AS pack ON pack.id = app_user.plan_id
                WHERE app_user.user_id = usage.user_id
            """))
        connection.execute(text("""
            ALTER TABLE cortex_global_metrics
                ADD COLUMN IF NOT EXISTS total_ai_input_cost NUMERIC(20, 10)
                    NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS total_ai_output_cost NUMERIC(20, 10)
                    NOT NULL DEFAULT 0
        """))
        if not global_cost_components_exist:
            connection.execute(text("""
                UPDATE cortex_global_metrics AS metrics
                SET
                    total_ai_input_cost = COALESCE((
                        SELECT SUM(usage.input_cost)
                        FROM ai_usage_daily AS usage
                        WHERE usage.usage_date = metrics.metric_date
                    ), 0),
                    total_ai_output_cost = COALESCE((
                        SELECT SUM(usage.output_cost)
                        FROM ai_usage_daily AS usage
                        WHERE usage.usage_date = metrics.metric_date
                    ), 0)
            """))
        connection.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'ck_global_metrics_input_cost_nonnegative'
                      AND conrelid = 'cortex_global_metrics'::regclass
                ) THEN
                    ALTER TABLE cortex_global_metrics
                        ADD CONSTRAINT ck_global_metrics_input_cost_nonnegative
                        CHECK (total_ai_input_cost >= 0);
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'ck_global_metrics_output_cost_nonnegative'
                      AND conrelid = 'cortex_global_metrics'::regclass
                ) THEN
                    ALTER TABLE cortex_global_metrics
                        ADD CONSTRAINT ck_global_metrics_output_cost_nonnegative
                        CHECK (total_ai_output_cost >= 0);
                END IF;
            END $$;
        """))
        if not global_total_cost_is_generated:
            connection.execute(text("""
                ALTER TABLE cortex_global_metrics
                    DROP COLUMN IF EXISTS total_ai_cost
            """))
            connection.execute(text("""
                ALTER TABLE cortex_global_metrics
                    ADD COLUMN total_ai_cost NUMERIC(20, 10)
                    GENERATED ALWAYS AS (
                        total_ai_input_cost + total_ai_output_cost
                    ) STORED
            """))
        connection.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'ck_global_metrics_cost_nonnegative'
                      AND conrelid = 'cortex_global_metrics'::regclass
                ) THEN
                    ALTER TABLE cortex_global_metrics
                        ADD CONSTRAINT ck_global_metrics_cost_nonnegative
                        CHECK (total_ai_cost >= 0);
                END IF;
            END $$;
        """))
