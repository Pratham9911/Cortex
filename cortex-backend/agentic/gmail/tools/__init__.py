"""
agentic/gmail/tools/__init__.py

Public API for all Gmail tool implementations.

GMAIL_TOOL_IMPLS maps canonical tool names → async implementation functions.
The Gmail agent uses this registry to dispatch tool calls after LLM generation
and HITL approval, keeping tool execution decoupled from tool schema definitions.

Each implementation has the signature:
    async def tool_name(gmail_service, **kwargs) -> dict | list
"""

from .search_emails import search_emails
from .get_email import get_email
from .get_thread import get_thread
from .list_drafts import list_drafts
from .create_draft import create_draft
from .send_email import send_email
from .reply_to_email import reply_to_email

# Registry: tool_name → async implementation function
GMAIL_TOOL_IMPLS: dict = {
    "search_emails": search_emails,
    "get_email": get_email,
    "get_thread": get_thread,
    "list_drafts": list_drafts,
    "create_draft": create_draft,
    "send_email": send_email,
    "reply_to_email": reply_to_email,
}

__all__ = [
    "search_emails",
    "get_email",
    "get_thread",
    "list_drafts",
    "create_draft",
    "send_email",
    "reply_to_email",
    "GMAIL_TOOL_IMPLS",
]
