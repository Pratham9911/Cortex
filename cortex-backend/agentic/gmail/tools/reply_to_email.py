"""
agentic/gmail/tools/reply_to_email.py

reply_to_email — reply to an existing Gmail message/thread.

This tool has need_approval: true.
The Gmail agent will trigger HITL and only call this function AFTER
the user explicitly approves.

Preserves Gmail threading headers:
  - threadId
  - In-Reply-To
  - References
  - Re: Subject prefix
"""

from __future__ import annotations

import base64
from email.mime.text import MIMEText
from typing import Any, Optional


async def reply_to_email(
    gmail_service: Any,
    message_id: str,
    body: str,
    thread_id: Optional[str] = None,
) -> dict:
    """
    Reply to an existing Gmail message in-thread.

    Fetches the original message headers to build a proper RFC 2822 reply
    with In-Reply-To / References / Re: subject prefix.
    This function is only called AFTER the user explicitly approves.

    Args:
        gmail_service: Authenticated Gmail API client.
        message_id:    ID of the message to reply to.
        body:          Plain-text reply body.
        thread_id:     Optional thread ID override (auto-detected from original if not provided).

    Returns:
        Dict with sent message_id, thread_id, recipient, subject, and status.
    """
    # ── Fetch original message headers for threading ──────────────────────────
    try:
        original = (
            gmail_service.users()
            .messages()
            .get(
                userId="me",
                id=message_id,
                format="metadata",
                metadataHeaders=["From", "To", "Subject", "Message-ID", "References"],
            )
            .execute()
        )
    except Exception as exc:
        return {"status": "error", "error": f"Failed to fetch original message {message_id}: {exc}"}

    payload = original.get("payload", {})
    headers = {h["name"]: h["value"] for h in payload.get("headers", [])}

    actual_thread_id = thread_id or original.get("threadId")
    reply_to_address = headers.get("From", "")
    original_subject = headers.get("Subject", "")
    original_message_id = headers.get("Message-ID", "")
    original_references = headers.get("References", "")

    # RFC 2822 reply subject
    reply_subject = (
        original_subject
        if original_subject.lower().startswith("re:")
        else f"Re: {original_subject}"
    )

    # Build References chain
    if original_references.strip():
        new_references = f"{original_references.strip()} {original_message_id}".strip()
    else:
        new_references = original_message_id

    # ── Build the reply message ───────────────────────────────────────────────
    msg = MIMEText(body, "plain", "utf-8")
    msg["to"] = reply_to_address
    msg["subject"] = reply_subject
    if original_message_id:
        msg["In-Reply-To"] = original_message_id
    if new_references.strip():
        msg["References"] = new_references.strip()

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    send_body: dict = {"raw": raw}
    if actual_thread_id:
        send_body["threadId"] = actual_thread_id

    # ── Send ─────────────────────────────────────────────────────────────────
    try:
        result = (
            gmail_service.users()
            .messages()
            .send(userId="me", body=send_body)
            .execute()
        )
    except Exception as exc:
        return {"status": "error", "error": f"Failed to send reply: {exc}"}

    return {
        "status": "reply_sent",
        "message_id": result.get("id"),
        "thread_id": result.get("threadId"),
        "replied_to_address": reply_to_address,
        "replied_to_message_id": message_id,
        "subject": reply_subject,
        "message": f"Reply successfully sent to {reply_to_address}.",
    }
