from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import SessionLocal
from dependencies import get_current_user

from models import (
    InboxMessage,
    User,
    Project,
    ProjectMember,
    Team,
    TeamMember
)

from routers.audit import create_audit_log
router = APIRouter()


# ---------------------------------------------------
# DB
# ---------------------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/inbox")
def get_my_inbox(
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    messages = db.query(InboxMessage).filter(
        InboxMessage.receiver_id == user_id
    ).order_by(
        InboxMessage.created_at.desc()
    ).all()

    result = []

    for msg in messages:

        sender_name = None

        if msg.sender_id:

            sender = db.query(User).filter(
                User.user_id == msg.sender_id
            ).first()

            if sender:
                sender_name = sender.name

        project_name = None

        if msg.related_project_id:

            project = db.query(Project).filter(
                Project.project_id == msg.related_project_id
            ).first()

            if project:
                project_name = project.name

        result.append({

            "message_id": msg.message_id,

            "type": msg.type,

            "title": msg.title,

            "message": msg.message,

            "status": msg.status,

            "sender_id": msg.sender_id,
            "sender_name": sender_name,

            "related_project_id": msg.related_project_id,
            "project_name": project_name,

            "created_at": msg.created_at
        })

    return result

@router.patch("/inbox/{message_id}/read")
def mark_message_as_read(
    message_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    message = db.query(InboxMessage).filter(
        InboxMessage.message_id == message_id,
        InboxMessage.receiver_id == user_id
    ).first()

    if not message:
        raise HTTPException(
            status_code=404,
            detail="Message not found"
        )

    if message.status == "unread":
        message.status = "read"

        db.commit()

    return {
        "message": "Message marked as read"
    }

# ---------------------------------------------------
# SEND PROJECT INVITE
# ---------------------------------------------------
@router.post("/projects/{project_id}/invite/send")
def invite_user_to_project(
    project_id: int,
    email: str,
    message: str = "",
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ----------------------------------------
    # Verify admin
    # ----------------------------------------
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership or membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin can invite users"
        )

    # ----------------------------------------
    # Get project
    # ----------------------------------------
    project = db.query(Project).filter(
        Project.project_id == project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    # ----------------------------------------
    # Find receiver
    # ----------------------------------------
    receiver = db.query(User).filter(
        User.email == email
    ).first()

    if not receiver:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    # ----------------------------------------
    # Prevent self invite
    # ----------------------------------------
    if receiver.user_id == user_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot invite yourself"
        )

    # ----------------------------------------
    # Already member check
    # ----------------------------------------
    existing_member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == receiver.user_id
    ).first()

    if existing_member:
        raise HTTPException(
            status_code=400,
            detail="User already in project"
        )

    # ----------------------------------------
    # Prevent duplicate pending invite
    # ----------------------------------------
    existing_invite = db.query(InboxMessage).filter(
        InboxMessage.receiver_id == receiver.user_id,
        InboxMessage.related_project_id == project_id,
        InboxMessage.type == "invite",
        InboxMessage.status == "unread"
    ).first()

    if existing_invite:
        raise HTTPException(
            status_code=400,
            detail="Invite already pending"
        )

    sender = db.query(User).filter(
        User.user_id == user_id
    ).first()

    # ----------------------------------------
    # Create inbox invite
    # ----------------------------------------
    invite = InboxMessage(

        receiver_id=receiver.user_id,

        sender_id=user_id,

        type="invite",

        title=f"Project Invite: {project.name}",

        message=(
            message
            if message.strip()
            else f"{sender.name} invited you to join project '{project.name}'"
        ),

        related_project_id=project_id,

        status="unread"
    )

    db.add(invite)

    # ----------------------------------------
    # Audit log
    # ----------------------------------------
    create_audit_log(
        db=db,
        project_id=project_id,
        user_id=user_id,
        action="create",
        detail=(
            f"{sender.name} invited "
            f"{receiver.name} to project '{project.name}'"
        )
    )

    db.commit()

    return {
        "message": "Invite sent successfully"
    }



@router.patch("/inbox/{message_id}/accept")
def accept_project_invite(
    message_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ----------------------------------------
    # Get inbox message
    # ----------------------------------------
    inbox = db.query(InboxMessage).filter(
        InboxMessage.message_id == message_id,
        InboxMessage.receiver_id == user_id
    ).first()

    if not inbox:
        raise HTTPException(
            status_code=404,
            detail="Invite not found"
        )

    if inbox.type != "invite":
        raise HTTPException(
            status_code=400,
            detail="Not an invite"
        )

    if inbox.status in ["accepted", "rejected"]:
        raise HTTPException(
            status_code=400,
            detail="Invite already handled"
        )

    # ----------------------------------------
    # Get project
    # ----------------------------------------
    project = db.query(Project).filter(
        Project.project_id == inbox.related_project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    # ----------------------------------------
    # Already member check
    # ----------------------------------------
    existing_member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project.project_id,
        ProjectMember.user_id == user_id
    ).first()

    if existing_member:
        raise HTTPException(
            status_code=400,
            detail="Already in project"
        )

    # ----------------------------------------
    # Add project member
    # ----------------------------------------
    new_member = ProjectMember(
        project_id=project.project_id,
        user_id=user_id,
        role="member"
    )

    db.add(new_member)

    # ----------------------------------------
    # Add to general team
    # ----------------------------------------
    general_team = db.query(Team).filter(
        Team.project_id == project.project_id,
        Team.name == "general"
    ).first()

    if general_team:

        existing_team_member = db.query(TeamMember).filter(
            TeamMember.team_id == general_team.team_id,
            TeamMember.user_id == user_id
        ).first()

        if not existing_team_member:

            general_member = TeamMember(
                team_id=general_team.team_id,
                user_id=user_id,
                added_by=inbox.sender_id
            )

            db.add(general_member)

    # ----------------------------------------
    # Update invite status
    # ----------------------------------------
    inbox.status = "accepted"

    # ----------------------------------------
    # Audit log
    # ----------------------------------------
    receiver = db.query(User).filter(
        User.user_id == user_id
    ).first()

    create_audit_log(
        db=db,
        project_id=project.project_id,
        user_id=user_id,
        action="create",
        detail=(
            f"{receiver.name} joined "
            f"project '{project.name}'"
        )
    )

    db.commit()

    return {
        "message": "Invite accepted successfully"
    }
@router.patch("/inbox/{message_id}/reject")
def reject_project_invite(
    message_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    inbox = db.query(InboxMessage).filter(
        InboxMessage.message_id == message_id,
        InboxMessage.receiver_id == user_id
    ).first()

    if not inbox:
        raise HTTPException(
            status_code=404,
            detail="Invite not found"
        )

    if inbox.type != "invite":
        raise HTTPException(
            status_code=400,
            detail="Not an invite"
        )

    if inbox.status in ["accepted", "rejected"]:
        raise HTTPException(
            status_code=400,
            detail="Invite already handled"
        )

    inbox.status = "rejected"

    db.commit()

    return {
        "message": "Invite rejected"
    }

@router.delete("/projects/{project_id}/members/{target_user_id}")
def remove_member_from_project(
    project_id: int,
    target_user_id: int,

    message: str = "",

    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ----------------------------------------
    # Verify admin
    # ----------------------------------------
    admin_membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not admin_membership or admin_membership.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin can remove members"
        )

    # ----------------------------------------
    # Prevent self removal
    # ----------------------------------------
    if user_id == target_user_id:
        raise HTTPException(
            status_code=400,
            detail="Admin cannot remove themselves"
        )

    # ----------------------------------------
    # Get project
    # ----------------------------------------
    project = db.query(Project).filter(
        Project.project_id == project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    # ----------------------------------------
    # Get target membership
    # ----------------------------------------
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == target_user_id
    ).first()

    if not membership:
        raise HTTPException(
            status_code=404,
            detail="User is not part of project"
        )

    # ----------------------------------------
    # Remove from all teams
    # ----------------------------------------
    team_memberships = db.query(TeamMember).join(
        Team,
        Team.team_id == TeamMember.team_id
    ).filter(
        Team.project_id == project_id,
        TeamMember.user_id == target_user_id
    ).all()

    for tm in team_memberships:
        db.delete(tm)

    # ----------------------------------------
    # Remove from project
    # ----------------------------------------
    db.delete(membership)

    # ----------------------------------------
    # Get users
    # ----------------------------------------
    admin_user = db.query(User).filter(
        User.user_id == user_id
    ).first()

    target_user = db.query(User).filter(
        User.user_id == target_user_id
    ).first()

    # ----------------------------------------
    # Inbox message
    # ----------------------------------------
    inbox_message = InboxMessage(

        receiver_id=target_user_id,

        sender_id=user_id,

        type="system",

        title=f"Removed From Project: {project.name}",

        message=(
            message
            if message.strip()
            else (
                f"{admin_user.name} removed you "
                f"from project '{project.name}'"
            )
        ),

        related_project_id=project_id,

        status="unread"
    )

    db.add(inbox_message)

    # ----------------------------------------
    # Audit log
    # ----------------------------------------
    create_audit_log(
        db=db,
        project_id=project_id,
        user_id=user_id,
        action="delete",
        detail=(
            f"{admin_user.name} removed "
            f"{target_user.name} from "
            f"project '{project.name}'"
        )
    )

    db.commit()

    return {
        "message": "Member removed successfully"
    }



