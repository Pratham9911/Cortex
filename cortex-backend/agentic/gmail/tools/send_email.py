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
    need_approval: bool = True,
    sender_email: str = "me",
    event_callback: Any = None,
) -> dict:
    """
    Send an email via the Gmail API.

    If need_approval is True, this tool handles HITL pause via interrupt()
    directly. Upon approval ('yes'), it executes the API send call immediately.
    If declined ('no'), it returns status='cancelled'. If user provides instructions,
    it returns status='instruction_provided'.
    """
    if need_approval:
        from langgraph.types import interrupt
        from agentic.gmail.gmail_service import build_hitl_payload, decode_decision

        hitl_payload = build_hitl_payload(
            "send_email",
            {"to": to, "subject": subject, "body": body, "cc": cc, "bcc": bcc, "thread_id": thread_id},
            sender_email=sender_email,
        )

        if event_callback:
            safe_hitl = {k: v for k, v in hitl_payload.items() if k != "user_id"}
            event_callback("gmail_hitl_required", **safe_hitl)

        raw_decision = interrupt(hitl_payload)
        decision, feedback = decode_decision(raw_decision)

        if decision in {"yes", "approve", "approved", "accept", "true"}:
            if event_callback:
                event_callback("gmail_approval_received", agent="gmail_agent", tool="send_email", approval_id=hitl_payload.get("approval_id"))
        elif decision in {"no", "reject", "rejected", "false"}:
            if event_callback:
                event_callback("gmail_approval_rejected", agent="gmail_agent", tool="send_email", approval_id=hitl_payload.get("approval_id"))
            return {
                "status": "cancelled",
                "to": to,
                "subject": subject,
                "message": f"Sending email to {to} was declined by user.",
                "feedback": feedback,
            }
        else:
            return {
                "status": "instruction_provided",
                "to": to,
                "subject": subject,
                "user_instruction": feedback or decision,
                "message": f"User instructed modification for 'send_email': '{feedback or decision}'",
            }
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
