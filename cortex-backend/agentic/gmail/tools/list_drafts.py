"""
agentic/gmail/tools/list_drafts.py

list_drafts — list the user's Gmail drafts in compact format.
"""

from __future__ import annotations

from typing import Any


async def list_drafts(
    gmail_service: Any,
    max_results: int = 10,
) -> list[dict]:
    """
    List Gmail drafts. Returns compact metadata for each draft.

    Args:
        gmail_service: Authenticated Gmail API client.
        max_results:   Maximum number of drafts to return (1-50).

    Returns:
        List of draft metadata dicts.
    """
    max_results = min(max(1, max_results), 50)

    try:
        response = (
            gmail_service.users()
            .drafts()
            .list(userId="me", maxResults=max_results)
            .execute()
        )
    except Exception as exc:
        return [{"error": f"Failed to list drafts: {exc}"}]

    draft_refs = response.get("drafts", [])
    if not draft_refs:
        return []

    results: list[dict] = []
    for ref in draft_refs:
        draft_id = ref.get("id")
        try:
            draft = (
                gmail_service.users()
                .drafts()
                .get(
                    userId="me",
                    id=draft_id,
                    format="metadata",
                    metadataHeaders=["To", "Cc", "Subject", "Date"],
                )
                .execute()
            )

            msg = draft.get("message", {})
            payload = msg.get("payload", {})
            headers = {
                h["name"]: h["value"]
                for h in payload.get("headers", [])
            }

            results.append(
                {
                    "draft_id": draft_id,
                    "to": headers.get("To", ""),
                    "cc": headers.get("Cc", ""),
                    "subject": headers.get("Subject", "(no subject)"),
                    "snippet": msg.get("snippet", ""),
                    "internal_date": msg.get("internalDate"),
                }
            )
        except Exception as exc:
            results.append({"draft_id": draft_id, "error": str(exc)})

    return results
