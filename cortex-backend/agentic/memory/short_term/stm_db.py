"""Database-backed short-term chat memory helper using ChatHistory table."""

from typing import Optional
from collections.abc import Sequence
from sqlalchemy.orm import Session
from sqlalchemy import func

from langchain_core.messages import BaseMessage, SystemMessage, HumanMessage, AIMessage

from agentic.memory.short_term.summarizer import summarize_history


TOKEN_THRESHOLD = 1000

_HISTORY_BRIDGE = SystemMessage(
    content=(
        "── Above is the conversation history / memory context. ──\n"
        "Refer to it only if it is relevant to the question below.\n"
        "Do not repeat or summarise it. Now answer the user's latest message:"
    )
)


def estimate_token_count(messages: Sequence[BaseMessage]) -> int:
    """Estimate token count without an external API call."""
    text = "\n".join(f"{m.type}: {m.content}" for m in messages if m.content)
    return max(1, (len(text) + 3) // 4) if text else 0


def load_chat_history(db: Session, chat_id: int) -> list[BaseMessage]:
    """
    Load history context for a chat ID.
    Returns: [SystemMessage(summary)] (if ChatHistory exists) + [unsummarized recent BaseMessages].
    Never deletes raw messages from the Message table.
    """
    from models import Message, ChatHistory

    chat_hist = db.query(ChatHistory).filter(ChatHistory.chat_id == chat_id).first()

    db_messages_query = (
        db.query(Message)
        .filter(Message.chat_id == chat_id)
        .order_by(Message.created_at.asc(), Message.message_id.asc())
    )

    if chat_hist and chat_hist.last_summarized_message_id:
        db_messages_query = db_messages_query.filter(
            Message.message_id > chat_hist.last_summarized_message_id
        )

    db_messages = db_messages_query.all()

    lc_messages: list[BaseMessage] = []

    if chat_hist and chat_hist.summary:
        lc_messages.append(SystemMessage(content=chat_hist.summary))

    for msg in db_messages:
        role = (msg.role or "").lower()
        if role == "user":
            lc_messages.append(HumanMessage(content=msg.content or ""))
        elif role == "assistant":
            lc_messages.append(AIMessage(content=msg.content or ""))

    return lc_messages


def extract_summary_text(history: list[BaseMessage]) -> Optional[str]:
    """Extract persistent memory summary text if present in history."""
    for msg in history:
        if isinstance(msg, SystemMessage) and msg.content.startswith("PERSISTENT MEMORY:"):
            return msg.content
    return None


def check_and_summarize_db(
    db: Session, chat_id: int, threshold: int = TOKEN_THRESHOLD
) -> list[BaseMessage]:
    """
    Check if active context token count exceeds threshold.
    If so, summarize unsummarized turns and store/update in ChatHistory table.
    Raw chat messages in Message table remain completely untouched.
    """
    from models import Message, ChatHistory

    lc_messages = load_chat_history(db, chat_id)
    if estimate_token_count(lc_messages) <= threshold:
        return lc_messages

    db_messages = (
        db.query(Message)
        .filter(Message.chat_id == chat_id)
        .order_by(Message.created_at.asc(), Message.message_id.asc())
        .all()
    )

    if len(db_messages) <= 2:
        return lc_messages

    # Summarize all messages prior to the latest 2 messages
    messages_to_summarize = lc_messages[:-2]
    last_summarized_msg_id = db_messages[-2].message_id

    try:
        summary_msg = summarize_history(messages_to_summarize)
    except Exception as exc:
        print(f"\n--- Summarizer failed in DB check: {exc} ---\n")
        return lc_messages

    chat_hist = db.query(ChatHistory).filter(ChatHistory.chat_id == chat_id).first()
    if not chat_hist:
        chat_hist = ChatHistory(
            chat_id=chat_id,
            summary=summary_msg.content,
            last_summarized_message_id=last_summarized_msg_id,
        )
        db.add(chat_hist)
    else:
        chat_hist.summary = summary_msg.content
        chat_hist.last_summarized_message_id = last_summarized_msg_id
        chat_hist.updated_at = func.now()

    db.commit()

    return load_chat_history(db, chat_id)


def build_llm_messages(
    history: list[BaseMessage], latest_query: Optional[str] = None
) -> list[BaseMessage]:
    """
    Assemble context format: [History (Summary + prior turns)] + [_HISTORY_BRIDGE] + [latest user query]
    """
    res: list[BaseMessage] = []

    if history:
        res.extend(history)
        res.append(_HISTORY_BRIDGE)

    if latest_query:
        res.append(HumanMessage(content=latest_query))

    return res


__all__ = [
    "TOKEN_THRESHOLD",
    "_HISTORY_BRIDGE",
    "estimate_token_count",
    "load_chat_history",
    "extract_summary_text",
    "check_and_summarize_db",
    "build_llm_messages",
]
