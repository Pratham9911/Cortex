import logging

from sqlalchemy import text

from database import engine


logger = logging.getLogger("cortex.migrations.user_account_deletion")


def init_user_account_deletion_fields():
    with engine.begin() as connection:
        connection.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID"
        ))
        connection.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        connection.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ"
        ))
        connection.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_auth_user_id "
            "ON users (auth_user_id) WHERE auth_user_id IS NOT NULL"
        ))
    logger.info("Ensured user identity and account deletion fields exist.")
