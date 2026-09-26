import logging

from database import engine
from models import Base, Subtask, Task, TaskAssignee


logger = logging.getLogger("cortex.migrations.tasks")


def init_tasks_tables():
    """Create the task tables and indexes if they are not already present."""
    Base.metadata.create_all(
        bind=engine,
        tables=[Task.__table__, TaskAssignee.__table__, Subtask.__table__],
    )
    logger.info("Ensured task tables exist.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    init_tasks_tables()
