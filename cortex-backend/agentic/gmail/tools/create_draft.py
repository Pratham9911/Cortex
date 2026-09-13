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
    need_approval: bool = True,
    sender_email: str = "me",
    event_callback: Any = None,
) -> dict:
    """
    Create a Gmail draft.

    If need_approval is True, this tool handles HITL pause via interrupt()
    directly. Upon approval ('yes'), it creates the draft immediately.
    If declined ('no'), it returns status='cancelled'. If user provides instructions,
    it returns status='instruction_provided'.
    """
    if need_approval:
        from langgraph.types import interrupt
        from agentic.gmail.gmail_service import build_hitl_payload, decode_decision

        hitl_payload = build_hitl_payload(
            "create_draft",
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
                event_callback("gmail_approval_received", agent="gmail_agent", tool="create_draft", approval_id=hitl_payload.get("approval_id"))
        elif decision in {"no", "reject", "rejected", "false"}:
            if event_callback:
                event_callback("gmail_approval_rejected", agent="gmail_agent", tool="create_draft", approval_id=hitl_payload.get("approval_id"))
            return {
                "status": "cancelled",
                "to": to,
                "subject": subject,
                "message": f"Creating draft for {to} was declined by user.",
                "feedback": feedback,
            }
        else:
            return {
                "status": "instruction_provided",
                "to": to,
                "subject": subject,
                "user_instruction": feedback or decision,
                "message": f"User instructed modification for 'create_draft': '{feedback or decision}'",
            }
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
