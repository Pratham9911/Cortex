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
from typing import Optional

# ──────────────────────────────────────────────────────────────────────────────
# Re-export canonical Gmail service (single source of truth).
# All OAuth/token-refresh logic lives in agentic/email/gmail_service.py.
# Never duplicate that logic here.
# ──────────────────────────────────────────────────────────────────────────────
from agentic.email.gmail_service import (   # noqa: F401  (re-exported)
    get_gmail_service,
    send_email_via_gmail,
)

__all__ = [
    "get_gmail_service",
    "send_email_via_gmail",
    "load_gmail_tool_config",
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
