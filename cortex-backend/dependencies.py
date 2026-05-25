from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase_client import supabase
from models import User
from database import SessionLocal

security = HTTPBearer()


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials

    try:
        # Verify token with Supabase Auth
        res = supabase.auth.get_user(token)
        if not res or not res.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        
        sb_user = res.user
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