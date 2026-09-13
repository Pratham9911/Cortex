"""
agentic/gmail/gmail_service.py

Gmail service layer for the Cortex Gmail Integration.

Re-exports the canonical get_gmail_service() and send_email_via_gmail()
from agentic/email/gmail_service.py — single source of truth for
OAuth credential loading, token refresh, and Gmail API client construction.

Also provides load_gmail_tool_config() to read agentic/gmail/allowed_tools.json.
"""

import os
import json
from typing import Any, Optional

# ──────────────────────────────────────────────────────────────────────────────
# Re-export canonical Gmail service (single source of truth).
# All OAuth/token-refresh logic lives in agentic/email/gmail_service.py.
# Never duplicate that logic here.
# ──────────────────────────────────────────────────────────────────────────────
from agentic.email.gmail_service import (   # noqa: F401  (re-exported)
    get_gmail_service,
    send_email_via_gmail,
)

import uuid

__all__ = [
    "get_gmail_service",
    "send_email_via_gmail",
    "load_gmail_tool_config",
    "build_hitl_payload",
    "decode_decision",
]

# ──────────────────────────────────────────────────────────────────────────────
# Tool configuration loader
# ──────────────────────────────────────────────────────────────────────────────

_tool_config_cache: Optional[dict] = None


def load_gmail_tool_config(filepath: Optional[str] = None) -> dict:
    """
    Load and validate the Gmail tool registry (allowed_tools.json).

    Uses in-memory caching to avoid repeated disk I/O.
    Pass filepath explicitly only in tests.

    Returns the full parsed JSON dict.
    Raises FileNotFoundError / ValueError on missing or malformed file.
    """
    global _tool_config_cache
    if _tool_config_cache is not None and filepath is None:
        return _tool_config_cache

    search_paths: list[str] = []
    if filepath:
        search_paths.append(filepath)

    base_dir = os.path.dirname(os.path.abspath(__file__))
    search_paths.append(os.path.join(base_dir, "allowed_tools.json"))

    chosen_path: Optional[str] = None
    for p in search_paths:
        if os.path.exists(p):
            chosen_path = p
            break

    if not chosen_path:
        raise FileNotFoundError(
            f"[GmailService] Gmail tool registry not found. Searched: {search_paths}"
        )

    try:
        with open(chosen_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as exc:
        raise ValueError(
            f"[GmailService] Failed to parse Gmail tool registry at {chosen_path}: {exc}"
        ) from exc

    if "gmail" not in data or "tools" not in data.get("gmail", {}):
        raise ValueError(
            f"[GmailService] Malformed Gmail tool registry at {chosen_path}: "
            "missing 'gmail.tools' key."
        )

    _tool_config_cache = data
    return _tool_config_cache


def build_hitl_payload(
    tool_name: str,
    tool_args: dict,
    sender_email: str = "me",
    user_id: int = 1,
    thread_id: Optional[str] = None,
) -> dict:
    """Build a rich, human-readable HITL payload for a Gmail write tool."""
    approval_id = str(uuid.uuid4())
    divider = "─" * 48

    base = {
        "approval_id": approval_id,
        "action": tool_name,
        "agent": "gmail_agent",
        "tool": tool_name,
        "args": tool_args,
        "user_id": user_id,
        "thread_id": thread_id or "",
        "from": sender_email,
    }

    if tool_name == "send_email":
        to = tool_args.get("to", "")
        cc = tool_args.get("cc") or ""
        bcc = tool_args.get("bcc") or ""
        subject = tool_args.get("subject", "")
        body = tool_args.get("body", "")

        preview_lines = [
            "📧  Email Approval Required",
            divider,
            f"From:    {sender_email}",
            f"To:      {to}",
        ]
        if cc:
            preview_lines.append(f"Cc:      {cc}")
        if bcc:
            preview_lines.append(f"Bcc:     {bcc}")
        preview_lines += [f"Subject: {subject}", divider, body]

        base.update(
            {
                "preview_title": "Email Approval Required",
                "to": to,
                "cc": cc,
                "bcc": bcc,
                "subject": subject,
                "body": body,
                "draft": {"to": to, "subject": subject, "body": body},
                "preview": "\n".join(preview_lines),
            }
        )

    elif tool_name == "reply_to_email":
        message_id = tool_args.get("message_id", "")
        body = tool_args.get("body", "")

        preview_lines = [
            "💬  Reply Approval Required",
            divider,
            f"From:           {sender_email}",
            f"Replying to:    message ID {message_id}",
            divider,
            "Your reply:",
            body,
        ]

        base.update(
            {
                "preview_title": "Reply Approval Required",
                "message_id": message_id,
                "body": body,
                "draft": {"to": f"Reply to {message_id}", "subject": "Reply", "body": body},
                "preview": "\n".join(preview_lines),
            }
        )

    elif tool_name == "create_draft":
        to = tool_args.get("to", "")
        cc = tool_args.get("cc") or ""
        bcc = tool_args.get("bcc") or ""
        subject = tool_args.get("subject", "")
        body = tool_args.get("body", "")

        preview_lines = [
            "📝  Draft Approval Required",
            divider,
            f"To:      {to}",
        ]
        if cc:
            preview_lines.append(f"Cc:      {cc}")
        if bcc:
            preview_lines.append(f"Bcc:     {bcc}")
        preview_lines += [f"Subject: {subject}", divider, body]

        base.update(
            {
                "preview_title": "Draft Approval Required",
                "to": to,
                "cc": cc,
                "bcc": bcc,
                "subject": subject,
                "body": body,
                "draft": {"to": to, "subject": subject, "body": body},
                "preview": "\n".join(preview_lines),
            }
        )

    return base


def decode_decision(approval_res: Any) -> tuple[str, str]:
    """Decode decision string and feedback string from interrupt() result."""
    decision = ""
    feedback = ""
    if isinstance(approval_res, dict):
        decision = str(
            approval_res.get("action")
            or approval_res.get("decision")
            or approval_res.get("approval")
            or ""
        ).lower()
        feedback = str(approval_res.get("feedback", "")).strip()
    elif isinstance(approval_res, str):
        decision = approval_res.strip().lower()
    return decision, feedback

