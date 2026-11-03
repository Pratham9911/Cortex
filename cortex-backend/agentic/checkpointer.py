"""
agentic/checkpointer.py

Checkpointer has been retired in favor of fast in-memory execution.
No database tables, async pools, or HITL checkpoints are used.
"""

postgres_checkpointer = None


async def init_checkpointer():
    """No-op: checkpointer retired."""
    pass


async def close_checkpointer():
    """No-op: checkpointer retired."""
    pass


def delete_checkpoint(thread_id: str, db_session=None):
    """No-op: checkpoints are no longer stored in the database."""
    pass
