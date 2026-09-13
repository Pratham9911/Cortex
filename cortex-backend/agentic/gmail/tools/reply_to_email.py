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
    need_approval: bool = True,
    sender_email: str = "me",
    event_callback: Any = None,
) -> dict:
    """
    Reply to an existing Gmail message in-thread.

    If need_approval is True, this tool handles HITL pause via interrupt()
    directly. Upon approval ('yes'), it sends the reply immediately.
    If declined ('no'), it returns status='cancelled'. If user provides instructions,
    it returns status='instruction_provided'.

    Fetches the original message headers to build a proper RFC 2822 reply
    with In-Reply-To / References / Re: subject prefix.

    Args:
        gmail_service: Authenticated Gmail API client.
        message_id:    ID of the message to reply to.
        body:          Plain-text reply body.
        thread_id:     Optional thread ID override (auto-detected from original if not provided).
        need_approval: Whether to trigger HITL approval.
        sender_email:  Sender email address for HITL payload.
        event_callback: Optional callback for HITL events.

    Returns:
        Dict with sent message_id, thread_id, recipient, subject, and status.
    """
    if need_approval:
        from langgraph.types import interrupt
        from agentic.gmail.gmail_service import build_hitl_payload, decode_decision

        hitl_payload = build_hitl_payload(
            "reply_to_email",
            {"message_id": message_id, "body": body, "thread_id": thread_id},
            sender_email=sender_email,
        )

        if event_callback:
            safe_hitl = {k: v for k, v in hitl_payload.items() if k != "user_id"}
            event_callback("gmail_hitl_required", **safe_hitl)

        raw_decision = interrupt(hitl_payload)
        decision, feedback = decode_decision(raw_decision)

        if decision in {"yes", "approve", "approved", "accept", "true"}:
            if event_callback:
                event_callback("gmail_approval_received", agent="gmail_agent", tool="reply_to_email", approval_id=hitl_payload.get("approval_id"))
        elif decision in {"no", "reject", "rejected", "false"}:
            if event_callback:
                event_callback("gmail_approval_rejected", agent="gmail_agent", tool="reply_to_email", approval_id=hitl_payload.get("approval_id"))
            return {
                "status": "cancelled",
                "message_id": message_id,
                "message": f"Replying to message {message_id} was declined by user.",
                "feedback": feedback,
            }
        else:
            return {
                "status": "instruction_provided",
                "message_id": message_id,
                "user_instruction": feedback or decision,
                "message": f"User instructed modification for 'reply_to_email': '{feedback or decision}'",
            }

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
