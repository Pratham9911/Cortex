import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, update
from sqlalchemy.orm import Session

from database import SessionLocal
from dependencies import get_current_user
from agentic.email.oauth_state import invalidate_user_states
from models import (
    Chat,
    ChatHistory,
    AuditLog,
    DecisionParticipant,
    DiscussionMessageReaction,
    InboxMessage,
    Message,
    Notification,
    Project,
    ProjectAuditLog,
    ProjectMember,
    TaskAssignee,
    TeamMember,
    User,
    UserIntegration,
)
from services.audit_service import AuditService
from supabase_client import supabase_admin
from routers.user_profiles import invalidate_avatar_cache


logger = logging.getLogger("cortex.account")
router = APIRouter(tags=["account"])
DELETE_CONFIRMATION = "DELETE MY ACCOUNT"
RECENT_SIGN_IN_WINDOW = timedelta(minutes=10)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class DeleteMyAccountRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    confirmation: str = Field(
        ...,
        min_length=len(DELETE_CONFIRMATION),
        max_length=len(DELETE_CONFIRMATION),
    )


@router.delete("/me/account")
def delete_my_account(
    request: DeleteMyAccountRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if request.confirmation != DELETE_CONFIRMATION:
        raise HTTPException(
            status_code=400,
            detail=f'Type "{DELETE_CONFIRMATION}" to confirm.',
        )
    if supabase_admin is None:
        raise HTTPException(
            status_code=503,
            detail="Account deletion is temporarily unavailable. Please contact support.",
        )

    user = db.query(User).filter(User.user_id == user_id).with_for_update().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.is_deleted:
        raise HTTPException(status_code=410, detail="This Cortex account has already been deleted.")
    if request.email.strip().casefold() != user.email.casefold():
        raise HTTPException(status_code=400, detail="The email does not match the signed-in account.")
    if not user.auth_user_id:
        raise HTTPException(
            status_code=409,
            detail="Your sign-in identity is not linked yet. Sign out and sign in again, then retry.",
        )

    try:
        auth_response = supabase_admin.auth.admin.get_user_by_id(str(user.auth_user_id))
    except Exception as error:
        logger.exception("Could not verify recent authentication for local user_id=%s", user_id)
        raise HTTPException(
            status_code=503,
            detail="Could not verify your sign-in. Please retry shortly.",
        ) from error

    auth_profile = getattr(auth_response, "user", None)
    last_sign_in_at = getattr(auth_profile, "last_sign_in_at", None)
    if isinstance(last_sign_in_at, str):
        try:
            last_sign_in_at = datetime.fromisoformat(last_sign_in_at.replace("Z", "+00:00"))
        except ValueError:
            last_sign_in_at = None
    if isinstance(last_sign_in_at, datetime) and last_sign_in_at.tzinfo is None:
        last_sign_in_at = last_sign_in_at.replace(tzinfo=timezone.utc)

    sign_in_age = (
        datetime.now(timezone.utc) - last_sign_in_at
        if isinstance(last_sign_in_at, datetime)
        else None
    )
    if sign_in_age is None or sign_in_age > RECENT_SIGN_IN_WINDOW or sign_in_age < -timedelta(minutes=1):
        raise HTTPException(
            status_code=403,
            detail="For security, sign out and sign in again, then retry account deletion within 10 minutes.",
        )

    owned_projects = db.query(Project.project_id, Project.name).filter(
        Project.created_by == user_id
    ).with_for_update().all()
    if owned_projects:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "ACCOUNT_OWNS_PROJECTS",
                "message": "Transfer ownership or delete these projects before deleting your account.",
                "projects": [
                    {"project_id": project.project_id, "name": project.name}
                    for project in owned_projects
                ],
            },
        )

    auth_identity_deleted = False
    try:
        original_name = user.name
        original_email = user.email
        project_memberships = db.query(ProjectMember).filter(
            ProjectMember.user_id == user_id
        ).all()
        for membership in project_memberships:
            AuditService.record_event(
                db=db,
                project_id=membership.project_id,
                event_type="account",
                resource_type="account",
                resource_id=user_id,
                action="delete",
                description="A project member deleted their Cortex account; their historical contributions are anonymized.",
                actor_user_id=user_id,
                actor_type="user",
                metadata={"account_deleted": True},
            )

        chat_ids = [
            row[0]
            for row in db.query(Chat.chat_id).filter(Chat.user_id == user_id).all()
        ]
        if chat_ids:
            db.query(Message).filter(Message.chat_id.in_(chat_ids)).delete(
                synchronize_session=False
            )
            db.query(ChatHistory).filter(ChatHistory.chat_id.in_(chat_ids)).delete(
                synchronize_session=False
            )
            db.query(Chat).filter(Chat.chat_id.in_(chat_ids)).delete(
                synchronize_session=False
            )

        db.query(TaskAssignee).filter(TaskAssignee.user_id == user_id).delete(
            synchronize_session=False
        )
        db.query(DecisionParticipant).filter(
            DecisionParticipant.user_id == user_id
        ).delete(synchronize_session=False)
        db.query(DiscussionMessageReaction).filter(
            DiscussionMessageReaction.user_id == user_id
        ).delete(synchronize_session=False)
        db.query(TeamMember).filter(TeamMember.user_id == user_id).delete(
            synchronize_session=False
        )
        db.query(ProjectMember).filter(ProjectMember.user_id == user_id).delete(
            synchronize_session=False
        )
        db.query(InboxMessage).filter(
            or_(
                InboxMessage.receiver_id == user_id,
                InboxMessage.sender_id == user_id,
            )
        ).delete(synchronize_session=False)
        db.query(Notification).filter(Notification.user_id == user_id).delete(
            synchronize_session=False
        )
        db.execute(
            update(Notification)
            .where(Notification.actor_id == user_id)
            .values(actor_id=None)
        )
        db.query(UserIntegration).filter(UserIntegration.user_id == user_id).delete(
            synchronize_session=False
        )

        auth_user_id: UUID = user.auth_user_id
        invalidate_avatar_cache(original_email)
        if original_name:
            db.query(ProjectAuditLog).filter(
                ProjectAuditLog.detail.contains(original_name)
            ).update(
                {
                    ProjectAuditLog.detail: func.replace(
                        ProjectAuditLog.detail, original_name, "Deleted User"
                    )
                },
                synchronize_session=False,
            )
            db.query(AuditLog).filter(
                AuditLog.description.contains(original_name)
            ).update(
                {
                    AuditLog.description: func.replace(
                        AuditLog.description, original_name, "Deleted User"
                    )
                },
                synchronize_session=False,
            )
        for audit_model in (ProjectAuditLog, AuditLog):
            detail_column = (
                audit_model.detail if audit_model is ProjectAuditLog
                else audit_model.description
            )
            db.query(audit_model).filter(detail_column.contains(original_email)).update(
                {detail_column: func.replace(detail_column, original_email, "[deleted]")},
                synchronize_session=False,
            )

        user.name = "Deleted User"
        user.email = f"deleted-{auth_user_id.hex}@deleted.invalid"
        user.password_hash = None
        user.avatar_url = None
        user.plan_id = None
        user.is_deleted = True
        user.deleted_at = datetime.now(timezone.utc)
        db.flush()

        # Keep the local tombstone and historical foreign keys, but permanently
        # remove the Supabase identity so the same email can register afresh.
        invalidate_user_states(user_id)
        supabase_admin.auth.admin.delete_user(str(auth_user_id))
        auth_identity_deleted = True
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        if auth_identity_deleted:
            logger.critical(
                "Supabase identity deleted but local account anonymization "
                "did not commit for user_id=%s",
                user_id,
                exc_info=True,
            )
            detail = (
                "Your sign-in was deleted, but Cortex could not finish "
                "anonymizing your account. Contact support immediately."
            )
        else:
            logger.exception("Account deletion failed for local user_id=%s", user_id)
            detail = (
                "Account deletion could not be completed. No Cortex profile "
                "changes were saved; please retry or contact support."
            )
        raise HTTPException(
            status_code=500 if auth_identity_deleted else 502,
            detail=detail,
        ) from error

    return {
        "message": "Your Cortex account has been deleted. You can sign up again with this email as a new user."
    }
