from sqlalchemy.orm import Session
from models import TeamDiscussion, DiscussionMessage, DiscussionMessageReaction


def delete_single_discussion_data(db: Session, discussion_id: int) -> None:
    """Deletes all messages and reactions for a single discussion before deleting it."""
    msg_ids = [
        msg_id
        for (msg_id,) in db.query(DiscussionMessage.id)
        .filter(DiscussionMessage.discussion_id == discussion_id)
        .all()
    ]
    if msg_ids:
        db.query(DiscussionMessageReaction).filter(
            DiscussionMessageReaction.message_id.in_(msg_ids)
        ).delete(synchronize_session=False)

        db.query(DiscussionMessage).filter(
            DiscussionMessage.discussion_id == discussion_id
        ).delete(synchronize_session=False)


def delete_team_discussions(db: Session, team_id: int) -> None:
    """Deletes ALL discussion data and messages associated with a team."""
    discussion_ids = [
        d_id
        for (d_id,) in db.query(TeamDiscussion.id)
        .filter(TeamDiscussion.team_id == team_id)
        .all()
    ]

    for d_id in discussion_ids:
        delete_single_discussion_data(db, d_id)

    db.query(TeamDiscussion).filter(
        TeamDiscussion.team_id == team_id
    ).delete(synchronize_session=False)
