from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field

from database import SessionLocal
from models import User
from supabase_client import supabase


router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=72)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=72)


@router.post("/register")
def register_user(request: RegisterRequest, db: Session = Depends(get_db)):
    try:
        # Call Supabase signup
        res = supabase.auth.sign_up({
            "email": request.email,
            "password": request.password,
            "options": {
                "data": {
                    "name": request.name
                }
            }
        })
        
        if not res or not res.user:
            raise HTTPException(status_code=400, detail="Registration failed")
            
        return {
            "message": "User registered successfully. Please verify your email if email confirmation is enabled.",
            "user_id": res.user.id
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login")
def login_user(request: LoginRequest, db: Session = Depends(get_db)):
    try:
        # Call Supabase sign in with password
        res = supabase.auth.sign_in_with_password({
            "email": request.email,
            "password": request.password
        })
        
        if not res or not res.session:
            raise HTTPException(status_code=401, detail="Invalid email or password")
            
        return {
            "access_token": res.session.access_token,
            "refresh_token": res.session.refresh_token,
            "token_type": "bearer",
            "expires_in": res.session.expires_in
        }
    except Exception as e:
        error_msg = str(e)
        if "invalid_credentials" in error_msg.lower() or "invalid login credentials" in error_msg.lower():
            raise HTTPException(status_code=401, detail="Invalid email or password")
        raise HTTPException(status_code=401, detail=error_msg)