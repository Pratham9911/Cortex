from typing import Optional
from uuid import UUID
from fastapi import Depends, HTTPException, Query, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase_client import supabase
from models import User
from database import SessionLocal

security = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    # Backward-compatible query-token fallback. Header auth remains the
    # documented/default mechanism for API clients.
    token: Optional[str] = Query(None, include_in_schema=False),
):
    token_str = None
    if credentials and credentials.credentials:
        token_str = credentials.credentials
    elif token:
        token_str = token

    if not token_str:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        # Verify token with Supabase Auth
        res = supabase.auth.get_user(token_str)
        if not res or not res.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        
        sb_user = res.user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid or expired token: {str(e)}"
        )

    email = sb_user.email
    if not email:
        raise HTTPException(status_code=400, detail="Token does not contain an email address")
    try:
        auth_user_id = UUID(str(sb_user.id))
    except (AttributeError, TypeError, ValueError) as e:
        raise HTTPException(status_code=401, detail="Authenticated identity is invalid") from e

    # Get or create local user
    db = SessionLocal()
    try:
        metadata = sb_user.user_metadata or {}
        name = metadata.get("name") or metadata.get("full_name") or email.split("@")[0]
        avatar_url = metadata.get("avatar_url")

        user = db.query(User).filter(User.auth_user_id == auth_user_id).first()
        if user and user.is_deleted:
            raise HTTPException(status_code=403, detail="This Cortex account has been deleted.")

        user_by_email = db.query(User).filter(User.email == email).first()
        if user is None:
            user = user_by_email
        elif user_by_email and user_by_email.user_id != user.user_id:
            raise HTTPException(status_code=403, detail="This email is linked to another Cortex identity.")

        if not user:
            user = User(
                name=name,
                email=email,
                password_hash=None,
                avatar_url=avatar_url,
                auth_user_id=auth_user_id,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            if user.auth_user_id and user.auth_user_id != auth_user_id:
                raise HTTPException(status_code=403, detail="This email is linked to another Cortex identity.")
            changed = False
            if user.auth_user_id is None:
                user.auth_user_id = auth_user_id
                changed = True
            # Google metadata is the initial default, not the source of truth
            # after the user has customized their Cortex profile.
            if user.avatar_url is None and avatar_url:
                user.avatar_url = avatar_url
                changed = True
            if changed:
                db.commit()

        return user.user_id
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database synchronization error: {str(e)}")
    finally:
        db.close()
