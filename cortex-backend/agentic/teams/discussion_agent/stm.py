from typing import List, Optional
from collections.abc import Sequence
from sqlalchemy.orm import Session
from sqlalchemy import func

from langchain_core.messages import BaseMessage, SystemMessage, HumanMessage, AIMessage

from models import Document, DiscussionMessage, DiscussionSTM, User
from agentic.memory.short_term.summarizer import summarize_history

TOKEN_THRESHOLD = 1000

_HISTORY_BRIDGE = SystemMessage(
    content=(
        "── Above is the discussion conversation history / team memory context. ──\n"
        "Refer to it only if it is relevant to the question below.\n"
        "Do not repeat or summarise it. Now answer the latest query:"
    )
)


def estimate_token_count(messages: Sequence[BaseMessage]) -> int:
    """Estimate token count without an external API call."""
    text = "\n".join(f"{m.type}: {m.content}" for m in messages if m.content)
    return max(1, (len(text) + 3) // 4) if text else 0


def get_team_document_ids(db: Session, project_id: int, team_id: int) -> List[int]:
    """
    Find all document_ids in project_id that belong to team_id.
    Each document specifies allowed_team_ids (ARRAY of Integer).
    """
    docs = db.query(Document).filter(Document.project_id == project_id).all()
    allowed_ids = []
    for doc in docs:
        team_ids = doc.allowed_team_ids or []
        if team_id in team_ids:
            allowed_ids.append(doc.document_id)
    return allowed_ids


def load_discussion_chat_history(db: Session, discussion_id: int) -> List[BaseMessage]:
    """
    Load history context for a discussion_id.
    Returns: [SystemMessage(summary)] (if DiscussionSTM exists) + unsummarized recent BaseMessages.
    Messages are tagged with speaker identity ([User Name (ID: X)] / [Cortex AI]).
    """
    stm_entry = db.query(DiscussionSTM).filter(DiscussionSTM.discussion_id == discussion_id).first()

    query = (
        db.query(DiscussionMessage)
        .filter(DiscussionMessage.discussion_id == discussion_id)
        .order_by(DiscussionMessage.id.asc())
    )

    if stm_entry and stm_entry.last_summarized_message_id:
        query = query.filter(DiscussionMessage.id > stm_entry.last_summarized_message_id)

    db_messages = query.all()

    lc_messages: List[BaseMessage] = []

    if stm_entry and stm_entry.summary:
        lc_messages.append(SystemMessage(content=stm_entry.summary))

    for msg in db_messages:
        is_ai = getattr(msg, "is_ai_message", False) or msg.sender_id is None
        if is_ai:
            lc_messages.append(AIMessage(content=f"[Cortex AI]: {msg.content or ''}"))
        else:
            sender = db.query(User).filter(User.user_id == msg.sender_id).first()
            sender_name = sender.name if sender else f"User #{msg.sender_id}"
            lc_messages.append(HumanMessage(content=f"[{sender_name} (ID: {msg.sender_id})]: {msg.content or ''}"))

    return lc_messages


def check_and_summarize_discussion_db(
    db: Session, discussion_id: int, threshold: int = TOKEN_THRESHOLD
) -> List[BaseMessage]:
    """
    Check if discussion active context token count exceeds threshold (1000 tokens).
    If so, summarize unsummarized turns via agentic.memory.short_term.summarizer
    and store/update in DiscussionSTM table.
    """
    lc_messages = load_discussion_chat_history(db, discussion_id)
    if estimate_token_count(lc_messages) <= threshold:
        return lc_messages

    db_messages = (
        db.query(DiscussionMessage)
        .filter(DiscussionMessage.discussion_id == discussion_id)
        .order_by(DiscussionMessage.id.asc())
        .all()
    )

    if len(db_messages) <= 2:
        return lc_messages

    # Summarize all messages prior to the latest 2 messages
    messages_to_summarize = lc_messages[:-2]
    last_summarized_msg_id = db_messages[-2].id

    try:
        summary_msg = summarize_history(messages_to_summarize)
    except Exception as exc:
        print(f"\n--- Summarizer failed in Discussion DB check: {exc} ---\n")
        return lc_messages

    stm_entry = db.query(DiscussionSTM).filter(DiscussionSTM.discussion_id == discussion_id).first()
    if not stm_entry:
        stm_entry = DiscussionSTM(
            discussion_id=discussion_id,
            summary=summary_msg.content,
            last_summarized_message_id=last_summarized_msg_id,
        )
        db.add(stm_entry)
    else:
        stm_entry.summary = summary_msg.content
        stm_entry.last_summarized_message_id = last_summarized_msg_id
        stm_entry.updated_at = func.now()

    db.commit()

    return load_discussion_chat_history(db, discussion_id)


def build_discussion_llm_messages(
    history: List[BaseMessage], latest_query: Optional[str] = None
) -> List[BaseMessage]:
    """
    Assemble context format: [History (Summary + prior turns)] + [_HISTORY_BRIDGE] + [latest query]
    """
    res: List[BaseMessage] = []

    if history:
        res.extend(history)
        res.append(_HISTORY_BRIDGE)

    if latest_query:
        res.append(HumanMessage(content=latest_query))

    return res
