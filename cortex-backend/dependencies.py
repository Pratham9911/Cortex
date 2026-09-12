from typing import Optional
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

    # Get or create local user
    db = SessionLocal()
    try:
        metadata = sb_user.user_metadata or {}
        name = metadata.get("name") or metadata.get("full_name") or email.split("@")[0]
        avatar_url = metadata.get("avatar_url")

        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                name=name,
                email=email,
                password_hash=None,
                avatar_url=avatar_url
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            if user.avatar_url != avatar_url or user.name != name:
                user.avatar_url = avatar_url
                user.name = name
                db.commit()
                db.refresh(user)

        return user.user_id
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database synchronization error: {str(e)}")
    finally:
        db.close()
