from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from database import SessionLocal
from models import ProjectMember, ProjectInvite
from dependencies import get_current_user
from utils import generate_invite_token


router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class InviteRequest(BaseModel):
    email: EmailStr


@router.post("/projects/{project_id}/invite")
def invite_user(
    project_id: int,
    request: InviteRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership or membership.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can invite users")

    token = generate_invite_token()

    invite = ProjectInvite(
        project_id=project_id,
        email=request.email,
        token=token,
        invited_by=user_id
    )

    db.add(invite)
    db.commit()

    invite_link = f"http://localhost:3000/invite/{token}"

    return {
        "message": "Invite created",
        "invite_link": invite_link
    }


@router.post("/invites/{token}/accept")
def accept_invite(
    token: str,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    invite = db.query(ProjectInvite).filter(ProjectInvite.token == token).first()

    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")

    if invite.status != "pending":
        raise HTTPException(status_code=400, detail="Invite already used or expired")

    existing_member = db.query(ProjectMember).filter(
        ProjectMember.project_id == invite.project_id,
        ProjectMember.user_id == user_id
    ).first()

    if existing_member:
        raise HTTPException(status_code=400, detail="User already a member")

    member = ProjectMember(
        project_id=invite.project_id,
        user_id=user_id,
        role="member"
    )

    db.add(member)

    invite.status = "accepted"

    db.commit()

    return {"message": "Invite accepted"}