import logging

from database import engine
from models import Base, Notification


logger = logging.getLogger("cortex.migrations.notifications")


def init_notifications_table():
    Base.metadata.create_all(bind=engine, tables=[Notification.__table__])
    logger.info("Ensured notifications table exists.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    init_notifications_table()
