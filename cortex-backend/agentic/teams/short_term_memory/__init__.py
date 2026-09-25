"""
agentic.teams.short_term_memory
================================
Team-aware short-term memory package for the Discussion Agent.

Public API
----------
- summarize_history          : compact old messages → SystemMessage (team-aware)
- get_team_document_ids      : return doc IDs that belong to a specific team
- load_discussion_chat_history
- check_and_summarize_discussion_db
- build_discussion_llm_messages
- estimate_token_count
- TOKEN_THRESHOLD
"""

from agentic.teams.short_term_memory.summarizer import summarize_history
from agentic.teams.short_term_memory.stm import (
    TOKEN_THRESHOLD,
    estimate_token_count,
    get_team_document_ids,
    load_discussion_chat_history,
    check_and_summarize_discussion_db,
    build_discussion_llm_messages,
)

__all__ = [
    "summarize_history",
    "TOKEN_THRESHOLD",
    "estimate_token_count",
    "get_team_document_ids",
    "load_discussion_chat_history",
    "check_and_summarize_discussion_db",
    "build_discussion_llm_messages",
]
