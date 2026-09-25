"""
agentic.teams.discussion_agent.stm  (backward-compat shim)
===========================================================
All STM logic has been moved to ``agentic.teams.short_term_memory``.

This module re-exports the full public API so that any existing import paths
continue to work without modification.

Prefer importing directly from ``agentic.teams.short_term_memory`` in new code.
"""

from agentic.teams.short_term_memory.stm import (  # noqa: F401
    TOKEN_THRESHOLD,
    estimate_token_count,
    get_team_document_ids,
    load_discussion_chat_history,
    check_and_summarize_discussion_db,
    build_discussion_llm_messages,
    _HISTORY_BRIDGE,
)

__all__ = [
    "TOKEN_THRESHOLD",
    "estimate_token_count",
    "get_team_document_ids",
    "load_discussion_chat_history",
    "check_and_summarize_discussion_db",
    "build_discussion_llm_messages",
    "_HISTORY_BRIDGE",
]
