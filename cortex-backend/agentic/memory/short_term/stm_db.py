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
        "── Above is the conversation history / memory context (including prior turns and previous assistant answers). ──\n"
        "Use this history to resolve pronouns, references (like 'these', 'those', 'it', 'the above'), and maintain context.\n"
        "Do not repeat or verbatim summarise the history. Now answer the user's latest message:"
    )
)


def estimate_token_count(messages: Sequence[BaseMessage]) -> int:
    """Estimate token count without an external API call."""
    text = "\n".join(f"{m.type}: {m.content}" for m in messages if m.content)
    return max(1, (len(text) + 3) // 4) if text else 0


def load_chat_history(
    db: Session, chat_id: int, exclude_message_id: Optional[int] = None
) -> list[BaseMessage]:
    """
    Load history context for a chat ID.
    Returns: [SystemMessage(summary)] (if ChatHistory exists) + [unsummarized recent BaseMessages in raw form].
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

    if exclude_message_id:
        db_messages_query = db_messages_query.filter(
            Message.message_id != exclude_message_id
        )

    db_messages = db_messages_query.all()

    lc_messages: list[BaseMessage] = []

    if chat_hist and chat_hist.summary:
        lc_messages.append(SystemMessage(content=chat_hist.summary))

    for msg in db_messages:
        role = (msg.role or "").lower()
        if role == "user":
            lc_msg = HumanMessage(content=msg.content or "")
            lc_msg.id = str(msg.message_id)
            lc_messages.append(lc_msg)
        elif role == "assistant":
            lc_msg = AIMessage(content=msg.content or "")
            lc_msg.id = str(msg.message_id)
            lc_messages.append(lc_msg)

    return lc_messages


def extract_summary_text(history: list[BaseMessage]) -> Optional[str]:
    """Extract persistent memory summary text if present in history."""
    for msg in history:
        if isinstance(msg, SystemMessage) and msg.content.startswith("PERSISTENT MEMORY:"):
            return msg.content
    return None


def check_and_summarize_db(
    db: Optional[Session] = None,
    chat_id: int = 0,
    threshold: int = TOKEN_THRESHOLD,
) -> list[BaseMessage]:
    """
    Check if active context token count exceeds threshold.
    If so, summarize unsummarized turns and store/update in ChatHistory table.
    Raw chat messages in Message table remain completely untouched.
    Always preserves at least the latest completed turn (user + assistant) in raw form.
    """
    from models import Message, ChatHistory
    from database import SessionLocal

    own_session = False
    if db is None:
        db = SessionLocal()
        own_session = True

    try:
        all_db_msgs = (
            db.query(Message)
            .filter(Message.chat_id == chat_id)
            .order_by(Message.created_at.asc(), Message.message_id.asc())
            .all()
        )

        if not all_db_msgs:
            return load_chat_history(db, chat_id)

        # How many trailing messages must remain in raw form:
        # If the latest message is a User query (mid-turn):
        # We must keep [prev_user, prev_assistant, current_user] (at least 3 messages).
        # If the latest message is an Assistant response (end-of-turn):
        # We must keep [turn_user, turn_assistant] (at least 2 messages).
        last_role = (all_db_msgs[-1].role or "").lower()
        num_raw_to_keep = 3 if last_role == "user" else 2

        if len(all_db_msgs) <= num_raw_to_keep:
            return load_chat_history(db, chat_id)

        # Candidates to be compacted into summary:
        messages_to_compact = all_db_msgs[:-num_raw_to_keep]
        if not messages_to_compact:
            return load_chat_history(db, chat_id)

        # Check if active context exceeds token threshold:
        active_messages = load_chat_history(db, chat_id)
        if estimate_token_count(active_messages) <= threshold:
            return active_messages

        # Summarization is needed!
        chat_hist = db.query(ChatHistory).filter(ChatHistory.chat_id == chat_id).first()
        last_sum_id = chat_hist.last_summarized_message_id if chat_hist else None

        # Filter messages in messages_to_compact that have not yet been summarized:
        unsummarized = [
            m for m in messages_to_compact
            if last_sum_id is None or m.message_id > last_sum_id
        ]

        # Target message ID after this summarization: exactly the last message in messages_to_compact
        new_last_sum_id = messages_to_compact[-1].message_id

        if not unsummarized and chat_hist and chat_hist.summary:
            chat_hist.last_summarized_message_id = new_last_sum_id
            db.commit()
            return load_chat_history(db, chat_id)

        # Prepare messages for the summarizer LLM:
        messages_for_llm: list[BaseMessage] = []
        if chat_hist and chat_hist.summary:
            messages_for_llm.append(SystemMessage(content=chat_hist.summary))

        for msg in unsummarized:
            role = (msg.role or "").lower()
            if role == "user":
                messages_for_llm.append(HumanMessage(content=msg.content or ""))
            elif role == "assistant":
                messages_for_llm.append(AIMessage(content=msg.content or ""))

        try:
            summary_msg = summarize_history(messages_for_llm)
        except Exception as exc:
            print(f"\n--- Summarizer exception in check_and_summarize_db: {exc} ---\n")
            # If summarization completely fails, keep existing history intact
            return load_chat_history(db, chat_id)

        if not chat_hist:
            chat_hist = ChatHistory(
                chat_id=chat_id,
                summary=summary_msg.content,
                last_summarized_message_id=new_last_sum_id,
            )
            db.add(chat_hist)
        else:
            chat_hist.summary = summary_msg.content
            chat_hist.last_summarized_message_id = new_last_sum_id
            chat_hist.updated_at = func.now()

        db.commit()
        return load_chat_history(db, chat_id)
    except Exception as e:
        print(f"\n--- Error in check_and_summarize_db: {e} ---\n")
        db.rollback()
        return load_chat_history(db, chat_id)
    finally:
        if own_session:
            db.close()


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
