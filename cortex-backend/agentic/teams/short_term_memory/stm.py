"""
agentic.teams.short_term_memory.stm
=====================================
Discussion STM logic — team-aware.

Responsibilities
----------------
- Load a discussion's message history from the DB, decorating each message
  with the speaker's name and ID so the LLM knows WHO said what.
- Persist a rolling compressed summary (DiscussionSTM) in the database when
  the active context exceeds TOKEN_THRESHOLD.
- Build the final ordered message list that is handed to the Discussion Agent:
    [Summary SystemMessage] → [unsummarized turns] → [bridge separator] → [latest query]

The summarizer used here is the TEAM-AWARE one from
``agentic.teams.short_term_memory.summarizer`` — it understands participants,
discussion context, decisions, open items, and agent interactions in a
multi-user team environment rather than the generic per-user AI-chat fields.
"""

from typing import List, Optional
from collections.abc import Sequence

from sqlalchemy.orm import Session
from sqlalchemy import func
from langchain_core.messages import BaseMessage, SystemMessage, HumanMessage, AIMessage

from models import Document, DiscussionMessage, DiscussionSTM, User

# ── Team-aware summarizer (lives in this same package) ──────────────────────
from agentic.teams.short_term_memory.summarizer import summarize_history


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Summarize when the active context window exceeds this many tokens.
# We use a lightweight character-based estimate (len / 4) so this is free.
TOKEN_THRESHOLD = 1000

# Bridge message injected between the history block and the latest user query
# so the LLM knows where the "memory" ends and the live query begins.
_HISTORY_BRIDGE = SystemMessage(
    content=(
        "── Above is the team discussion memory and conversation history. ──\n"
        "Use it as background context when it is relevant to the question below.\n"
        "Do not repeat, paraphrase, or summarise it. Focus on the latest query:"
    )
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def estimate_token_count(messages: Sequence[BaseMessage]) -> int:
    """Lightweight token estimate — avoids any external API call.

    Uses the common approximation: tokens ≈ characters / 4.
    Accurate enough for threshold gating; never used for billing.
    """
    text = "\n".join(f"{m.type}: {m.content}" for m in messages if m.content)
    return max(1, (len(text) + 3) // 4) if text else 0


def get_team_document_ids(db: Session, project_id: int, team_id: int) -> List[int]:
    """Return all document_ids in *project_id* whose ``allowed_team_ids`` includes *team_id*.

    Each Document row stores an ARRAY of Integer team IDs.
    This function is the single source of truth for team-scoped document access.
    """
    docs = db.query(Document).filter(Document.project_id == project_id).all()
    return [
        doc.document_id
        for doc in docs
        if team_id in (doc.allowed_team_ids or [])
    ]


# ---------------------------------------------------------------------------
# History loading
# ---------------------------------------------------------------------------

def _lookup_sender_name(db: Session, sender_id: Optional[int]) -> str:
    """Return the display name for a sender_id, or a safe fallback."""
    if sender_id is None:
        return "Unknown"
    user = db.query(User).filter(User.user_id == sender_id).first()
    return user.name if user else f"User #{sender_id}"


def load_discussion_chat_history(db: Session, discussion_id: int) -> List[BaseMessage]:
    """Load the LangChain message list for *discussion_id*.

    Layout:
      1. A single ``SystemMessage`` containing the current compressed summary
         (if a ``DiscussionSTM`` row exists for this discussion).
      2. Every ``DiscussionMessage`` that was created *after* the last
         summarised message, formatted as:
           - AI turns  → ``AIMessage``  tagged ``[Cortex AI]:``
           - User turns → ``HumanMessage`` tagged ``[Name (ID: X)]:``

    This allows the Discussion Agent to see:
      • What happened before (compressed summary)
      • What happened recently (verbatim turns)
    """
    stm_entry = (
        db.query(DiscussionSTM)
        .filter(DiscussionSTM.discussion_id == discussion_id)
        .first()
    )

    # Only load messages that are NOT yet summarised
    query = (
        db.query(DiscussionMessage)
        .filter(DiscussionMessage.discussion_id == discussion_id)
        .order_by(DiscussionMessage.id.asc())
    )
    if stm_entry and stm_entry.last_summarized_message_id:
        query = query.filter(
            DiscussionMessage.id > stm_entry.last_summarized_message_id
        )

    db_messages = query.all()

    lc_messages: List[BaseMessage] = []

    # Prepend the compressed summary as a SystemMessage so the LLM treats
    # it as background context, not as a conversation turn.
    if stm_entry and stm_entry.summary:
        lc_messages.append(SystemMessage(content=stm_entry.summary))

    for msg in db_messages:
        is_ai = getattr(msg, "is_ai_message", False) or msg.sender_id is None
        if is_ai:
            lc_messages.append(
                AIMessage(content=f"[Cortex AI]: {msg.content or ''}")
            )
        else:
            name = _lookup_sender_name(db, msg.sender_id)
            lc_messages.append(
                HumanMessage(
                    content=f"[{name} (ID: {msg.sender_id})]: {msg.content or ''}"
                )
            )

    return lc_messages


# ---------------------------------------------------------------------------
# Summarisation trigger
# ---------------------------------------------------------------------------

def check_and_summarize_discussion_db(
    db: Session,
    discussion_id: int,
    threshold: int = TOKEN_THRESHOLD,
) -> List[BaseMessage]:
    """Summarise and persist discussion history when the token budget is exceeded.

    Flow
    ----
    1. Load current history (summary + unsummarised turns).
    2. If token count ≤ threshold → return as-is (no-op).
    3. If fewer than 3 messages exist → return as-is (nothing meaningful to compress).
    4. Summarise everything *except the latest 2 turns* using the team-aware summarizer.
    5. Upsert the result into ``DiscussionSTM``.
    6. Reload and return the fresh history (summary + last 2 turns only).

    Why keep the last 2 turns verbatim?
    The most recent human message and AI response are the most important for
    follow-up continuity; compressing them immediately would lose that context.
    """
    lc_messages = load_discussion_chat_history(db, discussion_id)

    if estimate_token_count(lc_messages) <= threshold:
        return lc_messages

    # Fetch raw DB messages to determine the boundary message ID
    db_messages = (
        db.query(DiscussionMessage)
        .filter(DiscussionMessage.discussion_id == discussion_id)
        .order_by(DiscussionMessage.id.asc())
        .all()
    )

    if len(db_messages) <= 2:
        # Not enough history to safely compress anything
        return lc_messages

    # Summarise everything except the final 2 LangChain messages
    messages_to_summarize = lc_messages[:-2]
    # The boundary is the second-to-last *DB* message
    last_summarized_msg_id = db_messages[-2].id

    try:
        summary_msg = summarize_history(messages_to_summarize)
    except Exception as exc:
        print(f"\n--- [TeamSTM] Summarizer failed for discussion {discussion_id}: {exc} ---\n")
        return lc_messages

    # Upsert the STM entry
    stm_entry = (
        db.query(DiscussionSTM)
        .filter(DiscussionSTM.discussion_id == discussion_id)
        .first()
    )
    if stm_entry is None:
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

    # Reload so the returned list reflects the freshly compressed state
    return load_discussion_chat_history(db, discussion_id)


# ---------------------------------------------------------------------------
# Message assembly for the LLM
# ---------------------------------------------------------------------------

def build_discussion_llm_messages(
    history: List[BaseMessage],
    latest_query: Optional[str] = None,
) -> List[BaseMessage]:
    """Assemble the ordered message list to hand to the Discussion Agent LLM.

    Order:
      [History block (summary + unsummarised turns)]
      [_HISTORY_BRIDGE separator]          ← only if history is non-empty
      [HumanMessage(latest_query)]         ← only if a query is provided

    The bridge separator tells the model where the "memory" ends so it does
    not treat the summary as part of the live conversation.
    """
    result: List[BaseMessage] = []

    if history:
        result.extend(history)
        result.append(_HISTORY_BRIDGE)

    if latest_query:
        result.append(HumanMessage(content=latest_query))

    return result
