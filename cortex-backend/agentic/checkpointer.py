import sys
import os
import asyncio
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from sqlalchemy import text
from psycopg_pool import AsyncConnectionPool
from psycopg.rows import dict_row
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

load_dotenv()

raw_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/cortex")
conn_string = raw_url.replace("postgresql+psycopg2://", "postgresql://").replace("postgresql+psycopg://", "postgresql://")

# Async pool — created once when the event loop starts
async_pool: AsyncConnectionPool | None = None
postgres_checkpointer: AsyncPostgresSaver | None = None


async def init_checkpointer():
    """
    Must be called once at app startup (inside an async context).
    Creates the async connection pool, sets up the LangGraph tables,
    and sets the module-level checkpointer that main_graph.py imports.
    """
    global async_pool, postgres_checkpointer

    async_pool = AsyncConnectionPool(
        conn_string,
        min_size=1,
        max_size=10,
        max_idle=45.0,
        max_lifetime=300.0,
        check=AsyncConnectionPool.check_connection,
        kwargs={
            "autocommit": True,
            "prepare_threshold": 0,
            "row_factory": dict_row,
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 3,
        },
        open=False,
    )
    await async_pool.open()

    postgres_checkpointer = AsyncPostgresSaver(async_pool)
    try:
        await postgres_checkpointer.setup()
        print("[Checkpointer] AsyncPostgresSaver tables verified.")
    except Exception as e:
        print(f"[Checkpointer] Warning during setup(): {e}")


async def close_checkpointer():
    """Call at app shutdown to gracefully close the async pool."""
    global async_pool
    if async_pool:
        await async_pool.close()
        print("[Checkpointer] Async connection pool closed.")


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
