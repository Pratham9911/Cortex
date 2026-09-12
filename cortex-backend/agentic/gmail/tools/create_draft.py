"""
agentic/gmail/tools/create_draft.py

create_draft — create a Gmail draft.

This tool has need_approval: true.
The Gmail agent will trigger HITL and only call this function AFTER
the user explicitly approves the draft creation.
"""

from __future__ import annotations

import base64
from email.mime.text import MIMEText
from typing import Any, Optional


def _build_raw_message(
    to: str,
    subject: str,
    body: str,
    cc: Optional[str] = None,
    bcc: Optional[str] = None,
    in_reply_to: Optional[str] = None,
    references: Optional[str] = None,
) -> str:
    """Build a base64url-encoded RFC 2822 message string."""
    msg = MIMEText(body, "plain", "utf-8")
    msg["to"] = to
    msg["subject"] = subject
    if cc:
        msg["cc"] = cc
    if bcc:
        msg["bcc"] = bcc
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
    if references:
        msg["References"] = references
    return base64.urlsafe_b64encode(msg.as_bytes()).decode()


async def create_draft(
    gmail_service: Any,
    to: str,
    subject: str,
    body: str,
    cc: Optional[str] = None,
    bcc: Optional[str] = None,
    thread_id: Optional[str] = None,
) -> dict:
    """
    Create a Gmail draft.

    This function is only called AFTER the user approves the HITL prompt.
    Never call this automatically.

    Args:
        gmail_service: Authenticated Gmail API client.
        to:            Recipient email address.
        subject:       Email subject.
        body:          Email body (plain text).
        cc:            Optional CC recipients (comma-separated).
        bcc:           Optional BCC recipients (comma-separated).
        thread_id:     Optional Gmail thread ID (for drafting a reply in a thread).

    Returns:
        Dict with draft_id, recipients, subject, and status.
    """
    raw = _build_raw_message(to=to, subject=subject, body=body, cc=cc, bcc=bcc)

    message_body: dict = {"raw": raw}
    if thread_id:
        message_body["threadId"] = thread_id

    try:
        result = (
            gmail_service.users()
            .drafts()
            .create(userId="me", body={"message": message_body})
            .execute()
        )
    except Exception as exc:
        return {"status": "error", "error": f"Failed to create draft: {exc}"}

    return {
        "status": "draft_created",
        "draft_id": result.get("id"),
        "to": to,
        "cc": cc or "",
        "bcc": bcc or "",
        "subject": subject,
        "thread_id": thread_id or "",
        "message": f"Draft successfully created for {to}.",
    }
