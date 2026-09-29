from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import SessionLocal
from dependencies import get_current_user
from models import AiUsageDaily, Project, ProjectMember
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


@router.get("/me/ai-analytics")
def get_my_ai_analytics(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    project_id: int | None = Query(None, gt=0),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = datetime.now(timezone.utc).date()
    end = end_date or today
    start = start_date or (end - timedelta(days=13))
    if start > end:
        raise HTTPException(status_code=422, detail="start_date must be on or before end_date")
    if (end - start).days > 365:
        raise HTTPException(status_code=422, detail="Analytics date range cannot exceed 366 days")

    projects = (
        db.query(Project.project_id, Project.name)
        .join(ProjectMember, ProjectMember.project_id == Project.project_id)
        .filter(ProjectMember.user_id == user_id)
        .order_by(Project.name)
        .all()
    )
    project_names = {item.project_id: item.name for item in projects}
    if project_id is not None and project_id not in project_names:
        raise HTTPException(status_code=403, detail="Access denied to this project")

    usage_query = (
        db.query(
            AiUsageDaily.project_id,
            AiUsageDaily.usage_date,
            func.sum(AiUsageDaily.request_count).label("requests"),
            func.sum(AiUsageDaily.input_tokens).label("input_tokens"),
            func.sum(AiUsageDaily.output_tokens).label("output_tokens"),
        )
        .join(ProjectMember, ProjectMember.project_id == AiUsageDaily.project_id)
        .filter(
            AiUsageDaily.user_id == user_id,
            ProjectMember.user_id == user_id,
            AiUsageDaily.usage_date >= start,
            AiUsageDaily.usage_date <= end,
        )
    )
    if project_id is not None:
        usage_query = usage_query.filter(AiUsageDaily.project_id == project_id)

    usage_rows = usage_query.group_by(
        AiUsageDaily.project_id,
        AiUsageDaily.usage_date,
    ).all()

    day_totals: dict[date, dict[str, int]] = {}
    project_totals: dict[int, dict[str, int]] = {}
    for usage in usage_rows:
        requests = int(usage.requests or 0)
        input_tokens = int(usage.input_tokens or 0)
        output_tokens = int(usage.output_tokens or 0)
        day = day_totals.setdefault(
            usage.usage_date,
            {"requests": 0, "input_tokens": 0, "output_tokens": 0},
        )
        day["requests"] += requests
        day["input_tokens"] += input_tokens
        day["output_tokens"] += output_tokens

        project = project_totals.setdefault(
            usage.project_id,
            {"requests": 0, "input_tokens": 0, "output_tokens": 0},
        )
        project["requests"] += requests
        project["input_tokens"] += input_tokens
        project["output_tokens"] += output_tokens

    daily = []
    current = start
    while current <= end:
        totals = day_totals.get(
            current,
            {"requests": 0, "input_tokens": 0, "output_tokens": 0},
        )
        daily.append({
            "date": current.isoformat(),
            **totals,
            "total_tokens": totals["input_tokens"] + totals["output_tokens"],
        })
        current += timedelta(days=1)

    contributions = []
    for item in projects:
        totals = project_totals.get(
            item.project_id,
            {"requests": 0, "input_tokens": 0, "output_tokens": 0},
        )
        contributions.append({
            "project_id": item.project_id,
            "project_name": item.name,
            **totals,
            "total_tokens": totals["input_tokens"] + totals["output_tokens"],
        })

    if project_id is not None:
        contributions = [
            item for item in contributions if item["project_id"] == project_id
        ]

    totals = {
        "requests": sum(item["requests"] for item in contributions),
        "input_tokens": sum(item["input_tokens"] for item in contributions),
        "output_tokens": sum(item["output_tokens"] for item in contributions),
    }
    totals["total_tokens"] = totals["input_tokens"] + totals["output_tokens"]
    return {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "selected_project_id": project_id,
        "projects": [
            {"project_id": item.project_id, "project_name": item.name}
            for item in projects
        ],
        "daily": daily,
        "projects_usage": contributions,
        "totals": totals,
    }
