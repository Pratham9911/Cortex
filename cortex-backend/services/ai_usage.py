import logging
from datetime import date, datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from modelmetrics import UserPack, increment_cortex_global_metrics
from models import AiUsageDaily, ProjectMember, User


# Reserve prompt space for system and orchestration instructions.
AI_SYSTEM_PROMPT_TOKEN_RESERVE = 2500
logger = logging.getLogger("cortex.ai_usage")


def utc_usage_date() -> date:
    return datetime.now(timezone.utc).date()


def get_user_pack(db: Session, user: User) -> UserPack:
    user_pack = None
    if user.plan_id is not None:
        user_pack = db.query(UserPack).filter(UserPack.id == user.plan_id).first()
    if user_pack is None:
        user_pack = db.query(UserPack).filter(
            func.lower(UserPack.name) == "free"
        ).first()
    if user_pack is None:
        raise HTTPException(
            status_code=503,
            detail="AI usage limits are unavailable because no user plan is configured.",
        )
    return user_pack


def get_ai_usage_snapshot(db: Session, user_id: int, project_id: int) -> dict:
    membership = db.query(ProjectMember.id).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied to this project")

    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    pack = get_user_pack(db, user)
    usage_date = utc_usage_date()
    totals = db.query(
        func.coalesce(func.sum(AiUsageDaily.request_count), 0),
        func.coalesce(func.sum(AiUsageDaily.input_tokens), 0),
        func.coalesce(func.sum(AiUsageDaily.output_tokens), 0),
    ).filter(
        AiUsageDaily.user_id == user_id,
        AiUsageDaily.usage_date == usage_date,
    ).one()
    project_usage = db.query(AiUsageDaily).filter(
        AiUsageDaily.user_id == user_id,
        AiUsageDaily.project_id == project_id,
        AiUsageDaily.usage_date == usage_date,
    ).first()

    request_count, input_tokens, output_tokens = (int(value) for value in totals)
    total_tokens = input_tokens + output_tokens
    request_limit_reached = request_count >= pack.daily_request_limit
    token_limit_reached = (
        total_tokens + AI_SYSTEM_PROMPT_TOKEN_RESERVE >= pack.daily_token_limit
    )
    return {
        "usage_date": usage_date.isoformat(),
        "project_id": project_id,
        "plan_name": pack.name,
        "request_count": request_count,
        "request_limit": pack.daily_request_limit,
        "requests_remaining": max(pack.daily_request_limit - request_count, 0),
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "token_limit": pack.daily_token_limit,
        "tokens_remaining": max(pack.daily_token_limit - total_tokens, 0),
        "token_reserve": AI_SYSTEM_PROMPT_TOKEN_RESERVE,
        "can_request": not request_limit_reached and not token_limit_reached,
        "limit_reason": (
            "request_limit"
            if request_limit_reached
            else "token_limit"
            if token_limit_reached
            else None
        ),
        "project_request_count": project_usage.request_count if project_usage else 0,
        "project_total_tokens": project_usage.total_tokens if project_usage else 0,
    }


def reserve_ai_request(db: Session, user_id: int, project_id: int) -> date:
    user = db.query(User).filter(
        User.user_id == user_id
    ).with_for_update().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    membership = db.query(ProjectMember.id).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied to this project")

    pack = get_user_pack(db, user)
    usage_date = utc_usage_date()
    totals = db.query(
        func.coalesce(func.sum(AiUsageDaily.request_count), 0),
        func.coalesce(func.sum(AiUsageDaily.input_tokens), 0),
        func.coalesce(func.sum(AiUsageDaily.output_tokens), 0),
    ).filter(
        AiUsageDaily.user_id == user_id,
        AiUsageDaily.usage_date == usage_date,
    ).one()
    request_count, input_tokens, output_tokens = (int(value) for value in totals)
    used_tokens = input_tokens + output_tokens

    limit_reason = None
    if request_count >= pack.daily_request_limit:
        limit_reason = "request_limit"
    elif used_tokens + AI_SYSTEM_PROMPT_TOKEN_RESERVE >= pack.daily_token_limit:
        limit_reason = "token_limit"
    if limit_reason:
        db.rollback()
        raise HTTPException(
            status_code=429,
            detail={
                "code": "AI_DAILY_LIMIT_REACHED",
                "reason": limit_reason,
                "message": (
                    "Your daily AI request limit has been reached."
                    if limit_reason == "request_limit"
                    else "Your daily AI token limit has been reached."
                ),
                "usage_date": usage_date.isoformat(),
                "request_count": request_count,
                "request_limit": pack.daily_request_limit,
                "total_tokens": used_tokens,
                "token_limit": pack.daily_token_limit,
                "token_reserve": AI_SYSTEM_PROMPT_TOKEN_RESERVE,
            },
        )

    db.execute(
        insert(AiUsageDaily)
        .values(
            user_id=user_id,
            project_id=project_id,
            usage_date=usage_date,
            request_count=0,
            successful_requests=0,
            failed_requests=0,
            input_tokens=0,
            output_tokens=0,
        )
        .on_conflict_do_nothing(
            index_elements=[
                AiUsageDaily.user_id,
                AiUsageDaily.project_id,
                AiUsageDaily.usage_date,
            ]
        )
    )
    db.execute(
        update(AiUsageDaily)
        .where(
            AiUsageDaily.user_id == user_id,
            AiUsageDaily.project_id == project_id,
            AiUsageDaily.usage_date == usage_date,
        )
        .values(request_count=AiUsageDaily.request_count + 1, updated_at=func.now())
    )
    increment_cortex_global_metrics(
        db,
        ai_requests=1,
        metric_date=usage_date,
    )
    db.commit()
    return usage_date


def finish_ai_request(
    db: Session,
    user_id: int,
    project_id: int,
    usage_date: date,
    *,
    succeeded: bool,
    input_tokens: int = 0,
    output_tokens: int = 0,
) -> None:
    input_tokens = max(int(input_tokens or 0), 0)
    output_tokens = max(int(output_tokens or 0), 0)
    values = {
        "successful_requests": AiUsageDaily.successful_requests + int(succeeded),
        "failed_requests": AiUsageDaily.failed_requests + int(not succeeded),
        "input_tokens": AiUsageDaily.input_tokens + input_tokens,
        "output_tokens": AiUsageDaily.output_tokens + output_tokens,
        "updated_at": func.now(),
    }
    try:
        result = db.execute(
            update(AiUsageDaily)
            .where(
                AiUsageDaily.user_id == user_id,
                AiUsageDaily.project_id == project_id,
                AiUsageDaily.usage_date == usage_date,
            )
            .values(**values)
        )
        if result.rowcount != 1:
            raise RuntimeError("The reserved daily AI usage row was not found.")
        increment_cortex_global_metrics(
            db,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            metric_date=usage_date,
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception(
            "Could not finalize AI usage for user_id=%s project_id=%s usage_date=%s",
            user_id,
            project_id,
            usage_date,
        )
        raise
