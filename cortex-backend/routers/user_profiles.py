from typing import List, Dict, Any
from time import time

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import SessionLocal
from dependencies import get_current_user
from models import User
from supabase_client import supabase_admin

router = APIRouter()
AVATAR_CACHE_TTL_SECONDS = 120
_avatar_cache: Dict[str, Dict[str, Any]] = {}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _extract_supabase_users(raw: Any) -> List[Any]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw

    data = getattr(raw, "data", None)
    if isinstance(data, list):
        return data
    if data is not None:
        users = getattr(data, "users", None)
        if isinstance(users, list):
            return users
        if isinstance(data, dict):
            maybe_users = data.get("users")
            if isinstance(maybe_users, list):
                return maybe_users

    users = getattr(raw, "users", None)
    if isinstance(users, list):
        return users

    if isinstance(raw, dict):
        maybe_users = raw.get("users")
        if isinstance(maybe_users, list):
            return maybe_users
    return []


def _user_email(item: Any) -> str:
    if isinstance(item, dict):
        return item.get("email") or ""
    return getattr(item, "email", "") or ""


def _user_avatar(item: Any) -> str | None:
    metadata = None
    if isinstance(item, dict):
        metadata = item.get("user_metadata") or {}
    else:
        metadata = getattr(item, "user_metadata", {}) or {}
    return metadata.get("avatar_url")


def _list_supabase_users_until_emails_found(target_emails: set[str]) -> Dict[str, str | None]:
    if supabase_admin is None:
        return {}

    found: Dict[str, str | None] = {}
    page = 1
    per_page = 200

    while True:
        response = supabase_admin.auth.admin.list_users(page=page, per_page=per_page)
        users = _extract_supabase_users(response)
        if not users:
            break

        for sb_user in users:
            email = _user_email(sb_user).lower()
            if email in target_emails and email not in found:
                found[email] = _user_avatar(sb_user)

        if len(found) >= len(target_emails):
            break

        if len(users) < per_page:
            break
        page += 1

    return found


def _query_supabase_auth_avatars(db: Session, emails: set[str]) -> Dict[str, str | None]:
    if not emails:
        return {}
    query = text("""
        SELECT email, raw_user_meta_data->>'avatar_url' as avatar_url
        FROM auth.users
        WHERE LOWER(email) = ANY(:emails)
    """)
    try:
        result = db.execute(query, {"emails": [e.lower() for e in emails]}).all()
        return {row[0].lower(): row[1] for row in result if row[0]}
    except Exception as e:
        print(f"Direct auth.users query failed: {e}")
        return {}


@router.get("/users/avatars")
def get_user_avatars(
    user_ids: List[int] = Query(default=[]),
    force_refresh: bool = Query(default=False),
    _: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user_ids:
        return {"avatars": {}}

    local_users = db.query(User).filter(User.user_id.in_(user_ids)).all()
    email_to_id: Dict[str, int] = {u.email.lower(): u.user_id for u in local_users if u.email}
    result: Dict[str, str | None] = {str(uid): None for uid in user_ids}

    unresolved_emails: set[str] = set()
    now_ts = time()

    for u in local_users:
        if not u.email:
            continue
        email_key = u.email.lower()
        
        cache_item = _avatar_cache.get(email_key)
        is_fresh = cache_item and (now_ts - cache_item["fetched_at"] <= AVATAR_CACHE_TTL_SECONDS)

        if (not force_refresh) and is_fresh:
            result[str(u.user_id)] = cache_item["avatar_url"]
        elif (not force_refresh) and u.avatar_url is not None:
            result[str(u.user_id)] = u.avatar_url
            _avatar_cache[email_key] = {
                "avatar_url": u.avatar_url,
                "fetched_at": now_ts
            }
        else:
            unresolved_emails.add(email_key)

    if not unresolved_emails:
        return {"avatars": result, "source": "local_db_cache"}

    try:
        fetched = _query_supabase_auth_avatars(db, unresolved_emails)
        
        missing_emails = unresolved_emails - set(fetched.keys())
        if missing_emails and supabase_admin is not None:
            fallback_fetched = _list_supabase_users_until_emails_found(missing_emails)
            fetched.update(fallback_fetched)

        db_updated = False
        for u in local_users:
            if not u.email:
                continue
            email_key = u.email.lower()
            if email_key in fetched:
                avatar_url = fetched[email_key]
                result[str(u.user_id)] = avatar_url
                
                _avatar_cache[email_key] = {
                    "avatar_url": avatar_url,
                    "fetched_at": now_ts,
                }
                
                if u.avatar_url != avatar_url:
                    u.avatar_url = avatar_url
                    db_updated = True
        
        if db_updated:
            db.commit()

        source_info = "direct_db_query"
    except Exception as e:
        print(f"Failed to fetch avatars: {e}")
        return {"avatars": result, "source": "failed"}

    return {"avatars": result, "source": source_info}
