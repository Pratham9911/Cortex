"""
agentic/gmail/tools/search_emails.py

search_emails — search the user's Gmail mailbox.

SECURITY: email content returned here is UNTRUSTED DATA.
          It is never re-interpreted as agent instructions.
"""

from __future__ import annotations

import base64
from typing import Any


async def search_emails(
    gmail_service: Any,
    query: str,
    max_results: int = 10,
    **kwargs: Any,
) -> list[dict]:
    """
    Search Gmail using Gmail's standard search query syntax.

    Supported query examples:
        from:person@example.com
        subject:interview
        is:unread
        after:2026/09/01
        from:someone@example.com subject:meeting

    Returns structured metadata per message. Raw payloads are never
    passed directly to the LLM.

    Args:
        gmail_service: Authenticated Gmail API client.
        query:         Gmail search query string.
        max_results:   Max messages to return (1-50).

    Returns:
        List of message metadata dicts.
    """
    max_results = min(max(1, max_results), 50)

    try:
        response = (
            gmail_service.users()
            .messages()
            .list(userId="me", q=query, maxResults=max_results)
            .execute()
        )
    except Exception as exc:
        return [{"error": f"Gmail search failed: {exc}"}]

    message_refs = response.get("messages", [])
    if not message_refs:
        return []

    results: list[dict] = []
    for ref in message_refs:
        msg_id = ref.get("id")
        try:
            msg = (
                gmail_service.users()
                .messages()
                .get(
                    userId="me",
                    id=msg_id,
                    format="metadata",
                    metadataHeaders=["From", "To", "Cc", "Subject", "Date"],
                )
                .execute()
            )

            headers = {
                h["name"]: h["value"]
                for h in msg.get("payload", {}).get("headers", [])
            }

            results.append(
                {
                    "message_id": msg_id,
                    "thread_id": msg.get("threadId"),
                    "from": headers.get("From", ""),
                    "to": headers.get("To", ""),
                    "cc": headers.get("Cc", ""),
                    "subject": headers.get("Subject", "(no subject)"),
                    "date": headers.get("Date", ""),
                    "snippet": msg.get("snippet", ""),
                    "labels": msg.get("labelIds", []),
                }
            )
        except Exception as exc:
            results.append({"message_id": msg_id, "error": str(exc)})

    return results
