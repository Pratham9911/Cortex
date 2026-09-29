from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import SessionLocal
from dependencies import get_current_user
from models import AiUsageDaily, Project, ProjectMember, User
from services.ai_usage import get_ai_usage_snapshot, get_user_pack


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
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    pack = get_user_pack(db, user)
    if project_id is not None and project_id not in project_names:
        raise HTTPException(status_code=403, detail="Access denied to this project")

    usage_query = (
        db.query(
            AiUsageDaily.project_id,
            AiUsageDaily.usage_date,
            func.sum(AiUsageDaily.request_count).label("requests"),
            func.sum(AiUsageDaily.successful_requests).label("successful_requests"),
            func.sum(AiUsageDaily.failed_requests).label("failed_requests"),
            func.sum(AiUsageDaily.input_tokens).label("input_tokens"),
            func.sum(AiUsageDaily.output_tokens).label("output_tokens"),
            func.sum(AiUsageDaily.input_cost).label("input_cost"),
            func.sum(AiUsageDaily.output_cost).label("output_cost"),
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

    day_totals: dict[date, dict[str, int | float]] = {}
    project_totals: dict[int, dict[str, int | float]] = {}
    for usage in usage_rows:
        requests = int(usage.requests or 0)
        successful_requests = int(usage.successful_requests or 0)
        failed_requests = int(usage.failed_requests or 0)
        input_tokens = int(usage.input_tokens or 0)
        output_tokens = int(usage.output_tokens or 0)
        input_cost = float(usage.input_cost or 0)
        output_cost = float(usage.output_cost or 0)
        day = day_totals.setdefault(
            usage.usage_date,
            {
                "requests": 0,
                "successful_requests": 0,
                "failed_requests": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "input_cost": 0.0, "output_cost": 0.0,
            },
        )
        day["requests"] += requests
        day["successful_requests"] += successful_requests
        day["failed_requests"] += failed_requests
        day["input_tokens"] += input_tokens
        day["output_tokens"] += output_tokens
        day["input_cost"] += input_cost
        day["output_cost"] += output_cost
        day["total_cost"] = day["input_cost"] + day["output_cost"]

        project = project_totals.setdefault(
            usage.project_id,
            {
                "requests": 0,
                "successful_requests": 0,
                "failed_requests": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "input_cost": 0.0, "output_cost": 0.0,
            },
        )
        project["requests"] += requests
        project["successful_requests"] += successful_requests
        project["failed_requests"] += failed_requests
        project["input_tokens"] += input_tokens
        project["output_tokens"] += output_tokens
        project["input_cost"] += input_cost
        project["output_cost"] += output_cost
        project["total_cost"] = project["input_cost"] + project["output_cost"]

    daily = []
    current = start
    while current <= end:
        totals = day_totals.get(
            current,
            {
                "requests": 0,
                "successful_requests": 0,
                "failed_requests": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "input_cost": 0.0, "output_cost": 0.0, "total_cost": 0.0,
            },
        )
        daily.append({
            "date": current.isoformat(),
            **totals,
            "total_tokens": totals["input_tokens"] + totals["output_tokens"],
            "total_cost": totals["input_cost"] + totals["output_cost"],
        })
        current += timedelta(days=1)

    contributions = []
    for item in projects:
        totals = project_totals.get(
            item.project_id,
            {
                "requests": 0,
                "successful_requests": 0,
                "failed_requests": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "input_cost": 0.0, "output_cost": 0.0, "total_cost": 0.0,
            },
        )
        contributions.append({
            "project_id": item.project_id,
            "project_name": item.name,
            **totals,
            "total_tokens": totals["input_tokens"] + totals["output_tokens"],
            "total_cost": totals["input_cost"] + totals["output_cost"],
        })

    if project_id is not None:
        contributions = [
            item for item in contributions if item["project_id"] == project_id
        ]

    totals = {
        "requests": sum(item["requests"] for item in contributions),
        "successful_requests": sum(item["successful_requests"] for item in contributions),
        "failed_requests": sum(item["failed_requests"] for item in contributions),
        "input_tokens": sum(item["input_tokens"] for item in contributions),
        "output_tokens": sum(item["output_tokens"] for item in contributions),
    }
    totals["total_tokens"] = totals["input_tokens"] + totals["output_tokens"]
    totals["input_cost"] = sum(float(item["input_cost"]) for item in contributions)
    totals["output_cost"] = sum(float(item["output_cost"]) for item in contributions)
    totals["total_cost"] = totals["input_cost"] + totals["output_cost"]
    return {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "selected_project_id": project_id,
        "model_name": pack.model_name,
        "input_model_cost_per_million": float(pack.input_model_cost),
        "output_model_cost_per_million": float(pack.output_model_cost),
        "projects": [
            {"project_id": item.project_id, "project_name": item.name}
            for item in projects
        ],
        "daily": daily,
        "projects_usage": contributions,
        "totals": totals,
    }
