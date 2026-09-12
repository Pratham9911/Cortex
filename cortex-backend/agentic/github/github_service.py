import os
import json
import requests
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple, List, Dict
from sqlalchemy.orm import Session
from models import UserIntegration
from agentic.email.encryption import decrypt_string, encrypt_string
from langchain_mcp_adapters.client import MultiServerMCPClient

_tool_config_cache: Optional[dict] = None

# Token refresh: refresh if less than this many minutes remain
_TOKEN_REFRESH_BUFFER_MINUTES = 10


def load_github_tool_config(filepath: Optional[str] = None) -> dict:
    """
    Loads and validates the GitHub tool registry JSON file.
    Uses in-memory caching to avoid repeated disk I/O.
    """
    global _tool_config_cache
    if _tool_config_cache is not None and filepath is None:
        return _tool_config_cache

    search_paths = []
    if filepath:
        search_paths.append(filepath)

    base_dir = os.path.dirname(os.path.abspath(__file__))
    search_paths.extend([
        os.path.join(base_dir, "allowed_tools.json"),
        os.path.join(base_dir, "github_tools.json"),
        os.path.join(os.path.dirname(base_dir), "github", "allowed_tools.json"),
        os.path.join(os.path.dirname(base_dir), "github", "github_tools.json"),
    ])

    chosen_path = None
    for p in search_paths:
        if os.path.exists(p):
            chosen_path = p
            break

    if not chosen_path:
        raise FileNotFoundError(
            f"GitHub MCP tool registry JSON not found. Searched in: {search_paths}"
        )

    try:
        with open(chosen_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        raise ValueError(f"Failed to parse GitHub tool registry JSON at {chosen_path}: {e}") from e

    if "github" not in data or "tools" not in data["github"]:
        raise ValueError(
            f"Malformed GitHub tool registry at {chosen_path}: Missing 'github.tools' key."
        )

    _tool_config_cache = data
    return _tool_config_cache


def filter_github_mcp_tools(
    discovered_tools: list,
    config_filepath: Optional[str] = None,
    log_summary: bool = True,
) -> Tuple[List, Dict]:
    """
    Filters discovered MCP tools against the Cortex GitHub tool registry.
    Only tools explicitly defined with '"enabled": true' in the registry are returned.
    Attaches risk metadata to selected tools via tool.metadata dict.

    Returns:
        (selected_tools: list, tool_config: dict)
    """
    config = load_github_tool_config(filepath=config_filepath)
    tool_config = config.get("github", {}).get("tools", {})

    selected_tools = []
    enabled_count = 0
    disabled_count = 0

    for tool in discovered_tools:
        name = getattr(tool, "name", "")
        reg_entry = tool_config.get(name)

        if reg_entry and reg_entry.get("enabled") is True:
            enabled_count += 1
            # Preserve risk metadata in tool.metadata dictionary for HITL
            if getattr(tool, "metadata", None) is None:
                setattr(tool, "metadata", {})
            tool.metadata["risk_level"] = reg_entry.get("risk", "read")
            tool.metadata["registry_description"] = reg_entry.get("description", "")
            selected_tools.append(tool)
        else:
            disabled_count += 1

    if log_summary:
        print("\n" + "=" * 60)
        print("=== GITHUB MCP TOOL REGISTRY FILTERING ===")
        print(f"GitHub MCP tools discovered: {len(discovered_tools)}")
        print(f"GitHub MCP tools enabled:    {len(selected_tools)}")
        print(f"GitHub MCP tools disabled:   {len(discovered_tools) - len(selected_tools)}")
        print("=" * 60 + "\n")

    return selected_tools, tool_config


def _refresh_github_app_token(refresh_token: str) -> Tuple[str, Optional[str], Optional[datetime]]:
    """
    Exchanges a GitHub App refresh token for a new user access token.
    Returns (new_access_token, new_refresh_token, new_expires_at).
    Raises ValueError on failure.
    """
    client_id = os.getenv("GITHUB_APP_CLIENT_ID")
    client_secret = os.getenv("GITHUB_APP_CLIENT_SECRET")

    if not client_id or not client_secret:
        raise ValueError("GITHUB_APP_CLIENT_ID / GITHUB_APP_CLIENT_SECRET not configured.")

    resp = requests.post(
        "https://github.com/login/oauth/access_token",
        headers={"Accept": "application/json"},
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
            "client_secret": client_secret,
        },
        timeout=15,
    )

    if not resp.ok:
        raise ValueError(f"GitHub token refresh HTTP error: {resp.status_code} {resp.text}")

    data = resp.json()
    new_access = data.get("access_token")
    if not new_access:
        raise ValueError(f"GitHub token refresh returned no access_token: {data}")

    new_refresh = data.get("refresh_token")
    expires_in = data.get("expires_in")
    new_expiry = (
        datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
        if expires_in else None
    )

    return new_access, new_refresh, new_expiry


def get_github_connection(user_id: int, db: Session) -> Optional[dict]:
    """
    Retrieves the active GitHub UserIntegration record for a given user_id,
    handles proactive token refresh for GitHub App tokens, decrypts the stored
    access token, and returns connection details.

    Supports both:
      - integration_type="github_app"  (new GitHub App flow, ghu_ tokens)
      - integration_type="github_repo" (legacy OAuth App tokens, for backward compat)
    """
    record = (
        db.query(UserIntegration)
        .filter(
            UserIntegration.user_id == user_id,
            UserIntegration.provider == "github",
            UserIntegration.is_active == True,
        )
        .first()
    )

    if not record or not record.access_token:
        return None

    # ── Proactive token refresh for GitHub App tokens ──────────────────────
    # GitHub App user access tokens expire in 8 hours (if token expiration enabled).
    # We refresh proactively if within the buffer window to avoid mid-session failures.
    if record.integration_type == "github_app" and record.token_expires_at and record.refresh_token:
        now = datetime.now(timezone.utc)
        expires_at = record.token_expires_at
        # Make expires_at timezone-aware if it isn't
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        buffer = timedelta(minutes=_TOKEN_REFRESH_BUFFER_MINUTES)
        if now + buffer >= expires_at:
            print(f"[GitHub App] Token expiring soon for user_id={user_id}, refreshing...")
            try:
                plain_refresh = decrypt_string(record.refresh_token)
                if plain_refresh:
                    new_access, new_refresh, new_expiry = _refresh_github_app_token(plain_refresh)
                    record.access_token = encrypt_string(new_access)
                    if new_refresh:
                        record.refresh_token = encrypt_string(new_refresh)
                    if new_expiry:
                        record.token_expires_at = new_expiry
                    record.updated_at = datetime.now(timezone.utc)
                    db.commit()
                    print(f"[GitHub App] Token refreshed successfully for user_id={user_id}")
            except Exception as e:
                print(f"[GitHub App] Token refresh failed for user_id={user_id}: {e}")
                # Continue with existing token; let MCP call fail naturally if truly expired

    decrypted_token = decrypt_string(record.access_token)
    if not decrypted_token:
        return None

    meta = record.metadata_ or {}

    return {
        "user_id": user_id,
        "provider": record.provider,
        "integration_type": record.integration_type,
        "provider_account_id": record.provider_account_id,
        "account_email": record.account_email,
        "access_token": decrypted_token,
        "scopes": record.scopes,
        "installation_id": meta.get("installation_id"),
        "github_login": meta.get("github_login"),
        "token_expires_at": record.token_expires_at,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


async def get_github_mcp_client_for_user(user_id: int, db: Session) -> MultiServerMCPClient:
    """
    Retrieves the authenticated user's GitHub token from database (with auto-refresh),
    and returns a MultiServerMCPClient instance connected to GitHub Remote MCP Server.

    Works with both GitHub App user access tokens (ghu_) and legacy OAuth tokens (gho_).
    Raises ValueError if no active GitHub integration exists for user.
    """
    conn = get_github_connection(user_id=user_id, db=db)
    if not conn or not conn.get("access_token"):
        raise ValueError(
            f"No active GitHub connection found for Cortex user_id={user_id}. "
            "Please connect GitHub via Settings > Connectors first."
        )

    access_token = conn["access_token"]
    integration_type = conn.get("integration_type", "unknown")
    print(f"[GitHub MCP] Building client for user_id={user_id} (type={integration_type})")

    client = MultiServerMCPClient(
        {
            "github": {
                "transport": "streamable_http",
                "url": "https://api.githubcopilot.com/mcp/",
                "headers": {
                    "Authorization": f"Bearer {access_token}"
                },
            }
        }
    )

    return client
