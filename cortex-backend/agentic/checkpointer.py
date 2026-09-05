import os
from dotenv import load_dotenv
from sqlalchemy import text
from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row
from langgraph.checkpoint.postgres import PostgresSaver

load_dotenv()

raw_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/cortex")
conn_string = raw_url.replace("postgresql+psycopg2://", "postgresql://").replace("postgresql+psycopg://", "postgresql://")

# Initialize connection pool and PostgresSaver checkpointer
pool = ConnectionPool(conn_string, kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row})
postgres_checkpointer = PostgresSaver(pool)

# Create checkpoint tables if not existing
try:
    postgres_checkpointer.setup()
    print("[Checkpointer] PostgresSaver tables setup successfully.")
except Exception as e:
    print(f"[Checkpointer] Warning during setup(): {e}")


def delete_checkpoint(thread_id: str, db_session):
    """
    Deletes all checkpoint records for a given thread_id from PostgreSQL.
    """
    try:
        tables = ["checkpoint_writes", "checkpoint_blobs", "checkpoints"]
        for table in tables:
            db_session.execute(text(f"DELETE FROM {table} WHERE thread_id = :tid"), {"tid": thread_id})
        db_session.commit()
        print(f"[Checkpointer] Cleaned up checkpoint state for thread_id={thread_id}")
    except Exception as e:
        db_session.rollback()
        print(f"[Checkpointer] Error deleting checkpoint for thread_id={thread_id}: {e}")
