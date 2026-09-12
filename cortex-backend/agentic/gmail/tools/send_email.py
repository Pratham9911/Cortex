"""
agentic/gmail/tools/send_email.py

send_email — send a Gmail message.

This tool has need_approval: true.
The Gmail agent will trigger HITL and only call this function AFTER
the user explicitly approves.

NEVER call this automatically. NEVER bypass HITL.
"""

from __future__ import annotations

import base64
from email.mime.text import MIMEText
from typing import Any, Optional


async def send_email(
    gmail_service: Any,
    to: str,
    subject: str,
    body: str,
    cc: Optional[str] = None,
    bcc: Optional[str] = None,
    thread_id: Optional[str] = None,
) -> dict:
    """
    Send an email via the Gmail API.

    This function is only called AFTER the user explicitly approves the HITL
    prompt showing the full email preview. Never call this automatically.

    Args:
        gmail_service: Authenticated Gmail API client.
        to:            Recipient email address.
        subject:       Email subject line.
        body:          Plain-text email body.
        cc:            Optional CC recipients (comma-separated).
        bcc:           Optional BCC recipients (comma-separated).
        thread_id:     Optional thread ID — used when sending inside an existing thread.

    Returns:
        Dict with message_id, thread_id, recipient, subject, and status.
    """
    msg = MIMEText(body, "plain", "utf-8")
    msg["to"] = to
    msg["subject"] = subject
    if cc:
        msg["cc"] = cc
    if bcc:
        msg["bcc"] = bcc

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()

    send_body: dict = {"raw": raw}
    if thread_id:
        send_body["threadId"] = thread_id

    try:
        result = (
            gmail_service.users()
            .messages()
            .send(userId="me", body=send_body)
            .execute()
        )
    except Exception as exc:
        return {"status": "error", "error": f"Failed to send email: {exc}"}

    return {
        "status": "sent",
        "message_id": result.get("id"),
        "thread_id": result.get("threadId"),
        "to": to,
        "cc": cc or "",
        "subject": subject,
        "message": f"Email successfully sent to {to}.",
    }
