from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import SessionLocal
from dependencies import get_current_user
from services.ai_usage import get_ai_usage_snapshot


router = APIRouter(tags=["AI usage"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/me/ai-usage")
def get_my_ai_usage(
    project_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_ai_usage_snapshot(db, user_id, project_id)
