from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from models import (
    DiscussionMessage,
    DiscussionMessageReaction,
    User,
)


def format_message(msg: DiscussionMessage, db: Session, current_user_id: int) -> Dict[str, Any]:
    """Format a single DiscussionMessage into dict response format."""
    sender = db.query(User).filter(User.user_id == msg.sender_id).first()
    sender_name = sender.name if sender else "Unknown User"
    sender_avatar_url = sender.avatar_url if sender else None

    # Parent message reference
    parent_ref = None
    if msg.parent_message_id:
        parent_msg = db.query(DiscussionMessage).filter(DiscussionMessage.id == msg.parent_message_id).first()
        if parent_msg:
            parent_sender = db.query(User).filter(User.user_id == parent_msg.sender_id).first()
            parent_ref = {
                "id": parent_msg.id,
                "sender_name": parent_sender.name if parent_sender else "Unknown User",
                "content": parent_msg.content,
                "is_deleted": parent_msg.is_deleted,
            }

    # Reactions breakdown
    reactions_list: List[Dict[str, Any]] = []
    if not msg.is_deleted:
        reactions_rows = (
            db.query(
                DiscussionMessageReaction.emoji,
                func.count(DiscussionMessageReaction.id).label("count"),
            )
            .filter(DiscussionMessageReaction.message_id == msg.id)
            .group_by(DiscussionMessageReaction.emoji)
            .order_by(func.count(DiscussionMessageReaction.id).desc())
            .all()
        )

        user_reacted_emojis = set(
            r.emoji
            for r in db.query(DiscussionMessageReaction.emoji)
            .filter(
                DiscussionMessageReaction.message_id == msg.id,
                DiscussionMessageReaction.user_id == current_user_id,
            )
            .all()
        )

        for emoji, count in reactions_rows:
            reactions_list.append(
                {
                    "emoji": emoji,
                    "count": count,
                    "user_reacted": emoji in user_reacted_emojis,
                }
            )

    return {
        "id": msg.id,
        "discussion_id": msg.discussion_id,
        "sender_id": msg.sender_id,
        "sender_name": sender_name,
        "sender_avatar_url": sender_avatar_url,
        "content": msg.content,
        "parent_message_id": msg.parent_message_id,
        "parent_message": parent_ref,
        "is_deleted": msg.is_deleted,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
        "updated_at": msg.updated_at.isoformat() if msg.updated_at else None,
        "reactions": reactions_list,
    }


def list_messages(db: Session, discussion_id: int, current_user_id: int) -> List[Dict[str, Any]]:
    """Return all messages for a discussion ordered chronologically."""
    messages = (
        db.query(DiscussionMessage)
        .filter(DiscussionMessage.discussion_id == discussion_id)
        .order_by(DiscussionMessage.created_at.asc())
        .all()
    )
    return [format_message(msg, db, current_user_id) for msg in messages]


def create_message(
    db: Session,
    discussion_id: int,
    sender_id: int,
    content: str,
    parent_message_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Create a new message in a discussion."""
    if parent_message_id:
        parent_exists = (
            db.query(DiscussionMessage)
            .filter(
                DiscussionMessage.id == parent_message_id,
                DiscussionMessage.discussion_id == discussion_id,
            )
            .first()
        )
        if not parent_exists:
            parent_message_id = None

    msg = DiscussionMessage(
        discussion_id=discussion_id,
        sender_id=sender_id,
        content=content.strip(),
        parent_message_id=parent_message_id,
        is_deleted=False,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    return format_message(msg, db, sender_id)


def edit_message(
    db: Session,
    discussion_id: int,
    message_id: int,
    user_id: int,
    new_content: str,
) -> Optional[Dict[str, Any]]:
    """Edit message content if user is the sender and message is active."""
    msg = (
        db.query(DiscussionMessage)
        .filter(
            DiscussionMessage.id == message_id,
            DiscussionMessage.discussion_id == discussion_id,
        )
        .first()
    )
    if not msg:
        return None

    if msg.sender_id != user_id:
        return None

    if msg.is_deleted:
        return None

    msg.content = new_content.strip()
    db.commit()
    db.refresh(msg)

    return format_message(msg, db, user_id)


def delete_message(
    db: Session,
    discussion_id: int,
    message_id: int,
    deleter_user_id: int,
    is_admin: bool,
) -> Optional[Dict[str, Any]]:
    """
    Deletes a message by:
    1. Clearing all reactions from discussion_message_reactions.
    2. Replacing content with "Message deleted by {user_name}".
    3. Setting is_deleted = True.
    """
    msg = (
        db.query(DiscussionMessage)
        .filter(
            DiscussionMessage.id == message_id,
            DiscussionMessage.discussion_id == discussion_id,
        )
        .first()
    )
    if not msg:
        return None

    # Permission: sender or admin
    if msg.sender_id != deleter_user_id and not is_admin:
        return None

    if msg.is_deleted:
        return format_message(msg, db, deleter_user_id)

    # 1. Clear all reactions
    db.query(DiscussionMessageReaction).filter(
        DiscussionMessageReaction.message_id == message_id
    ).delete(synchronize_session=False)

    # 2. Fetch deleter user name
    deleter_user = db.query(User).filter(User.user_id == deleter_user_id).first()
    deleter_name = deleter_user.name if deleter_user else "user"

    # 3. Update content and mark as deleted
    msg.content = f"Message deleted by {deleter_name}"
    msg.is_deleted = True

    db.commit()
    db.refresh(msg)

    return format_message(msg, db, deleter_user_id)


def toggle_reaction(
    db: Session,
    discussion_id: int,
    message_id: int,
    user_id: int,
    emoji: str,
) -> Optional[Dict[str, Any]]:
    """Add or remove an emoji reaction on a message."""
    msg = (
        db.query(DiscussionMessage)
        .filter(
            DiscussionMessage.id == message_id,
            DiscussionMessage.discussion_id == discussion_id,
        )
        .first()
    )
    if not msg or msg.is_deleted:
        return None

    existing = (
        db.query(DiscussionMessageReaction)
        .filter(
            DiscussionMessageReaction.message_id == message_id,
            DiscussionMessageReaction.user_id == user_id,
            DiscussionMessageReaction.emoji == emoji,
        )
        .first()
    )

    if existing:
        db.delete(existing)
    else:
        reaction = DiscussionMessageReaction(
            message_id=message_id,
            user_id=user_id,
            emoji=emoji,
        )
        db.add(reaction)

    db.commit()
    return format_message(msg, db, user_id)
