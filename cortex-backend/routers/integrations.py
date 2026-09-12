import os
import requests
from urllib.parse import urlencode
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from database import SessionLocal
from models import UserIntegration, User
from dependencies import get_current_user
from agentic.email.encryption import encrypt_string
from agentic.email.oauth_state import create_oauth_state, get_and_pop_state_data
from agentic.email.gmail_oauth import get_authorization_url, exchange_code_for_credentials

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Google / Gmail
# ---------------------------------------------------------------------------

@router.get("/google/connect")
async def google_connect(
    token: Optional[str] = Query(None),
    user_id: int = Depends(get_current_user),
):
    """
    Start Google OAuth connection flow for the current authenticated user.
    Generates a secure server-side OAuth state tied to user_id and code_verifier, then redirects to Google consent page.
    """
    _, auth_url, state_token, code_verifier = get_authorization_url()
    create_oauth_state(user_id=user_id, code_verifier=code_verifier, custom_state=state_token)

    return RedirectResponse(auth_url)


@router.get("/google/callback")
async def google_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db),
):
    """
    Handles Google OAuth callback. Validates state, exchanges authorization code and code_verifier for tokens,
    fetches Google account email, encrypts and stores UserIntegration record, then redirects back to frontend Settings.
    """
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

    state_data = get_and_pop_state_data(state)
    if not state_data or not state_data.get("user_id"):
        return RedirectResponse(f"{frontend_url}/settings/connectors?error=invalid_state")

    user_id = state_data["user_id"]
    code_verifier = state_data.get("code_verifier")

    try:
        credentials = exchange_code_for_credentials(code=code, state=state, code_verifier=code_verifier)

        # Retrieve Google account info (email and sub/ID)
        userinfo_res = requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {credentials.token}"},
            timeout=10,
        )

        account_email = None
        google_id = None

        if userinfo_res.ok:
            info = userinfo_res.json()
            account_email = info.get("email")
            google_id = info.get("id")

        # Encrypt tokens
        encrypted_access = encrypt_string(credentials.token)
        encrypted_refresh = encrypt_string(credentials.refresh_token)

        # Check existing integration record for this user + google + gmail
        integration = (
            db.query(UserIntegration)
            .filter(
                UserIntegration.user_id == user_id,
                UserIntegration.provider == "google",
                UserIntegration.integration_type == "gmail",
            )
            .first()
        )

        if not integration:
            integration = UserIntegration(
                user_id=user_id,
                provider="google",
                integration_type="gmail",
                provider_account_id=google_id,
                account_email=account_email,
                access_token=encrypted_access,
                refresh_token=encrypted_refresh,
                token_expires_at=credentials.expiry,
                scopes=credentials.scopes or [],
                is_active=True,
            )
            db.add(integration)
        else:
            integration.provider_account_id = google_id or integration.provider_account_id
            integration.account_email = account_email or integration.account_email
            integration.access_token = encrypted_access
            if encrypted_refresh:
                integration.refresh_token = encrypted_refresh
            integration.token_expires_at = credentials.expiry or integration.token_expires_at
            integration.scopes = credentials.scopes or integration.scopes
            integration.is_active = True
            integration.updated_at = datetime.now(timezone.utc)

        db.commit()
        print(f"[Integrations] Google Gmail connected for user_id={user_id} ({account_email})")

        return RedirectResponse(f"{frontend_url}/settings/connectors?success=gmail_connected")

    except Exception as e:
        print(f"[Integrations] Error during Google OAuth callback: {e}")
        db.rollback()
        return RedirectResponse(f"{frontend_url}/settings/connectors?error={str(e)}")


# ---------------------------------------------------------------------------
# GitHub App (replaces GitHub OAuth App)
# ---------------------------------------------------------------------------

@router.get("/github/connect")
async def github_connect(
    token: Optional[str] = Query(None),
    user_id: int = Depends(get_current_user),
):
    """
    Start GitHub App user-authorization flow for the current authenticated Cortex user.
    Uses GITHUB_APP_CLIENT_ID (or GITHUB_APP_SLUG if provided).
    GitHub will show permission screen + repository selection.
    After installation, GitHub redirects back with code + installation_id.
    """
    client_id = os.getenv("GITHUB_APP_CLIENT_ID")
    app_slug = os.getenv("GITHUB_APP_SLUG")
    if not client_id and not app_slug:
        raise HTTPException(status_code=500, detail="GITHUB_APP_CLIENT_ID not configured on server.")

    redirect_uri = os.getenv("GITHUB_OAUTH_REDIRECT_URI", "http://localhost:8000/api/integrations/github/callback")
    state_token = create_oauth_state(user_id=user_id)

    if app_slug:
        # Direct installation flow via App Slug
        params = {"state": state_token}
        auth_url = f"https://github.com/apps/{app_slug}/installations/new?{urlencode(params)}"
    else:
        # Standard user authorization (OAuth) flow for GitHub Apps
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "state": state_token,
        }
        auth_url = f"https://github.com/login/oauth/authorize?{urlencode(params)}"

    return RedirectResponse(auth_url)


@router.get("/github/callback")
async def github_callback(
    code: str = Query(...),
    state: str = Query(...),
    installation_id: Optional[str] = Query(None),  # GitHub App passes this
    db: Session = Depends(get_db),
):
    """
    Handles GitHub App callback after user authorizes and installs the GitHub App.
    Validates state, exchanges code for ghu_ user access token + refresh token,
    stores encrypted credentials in user_integrations, then redirects back to Settings.
    """
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

    state_data = get_and_pop_state_data(state)
    if not state_data or not state_data.get("user_id"):
        return RedirectResponse(f"{frontend_url}/settings/connectors?error=invalid_github_state")

    user_id = state_data["user_id"]
    client_id = os.getenv("GITHUB_APP_CLIENT_ID")
    client_secret = os.getenv("GITHUB_APP_CLIENT_SECRET")
    redirect_uri = os.getenv("GITHUB_OAUTH_REDIRECT_URI", "http://localhost:8000/api/integrations/github/callback")

    if not client_id or not client_secret:
        return RedirectResponse(f"{frontend_url}/settings/connectors?error=github_app_unconfigured")

    try:
        # Exchange authorization code → user access token
        token_res = requests.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
            },
            timeout=15,
        )

        if not token_res.ok:
            print(f"[GitHub App] Token exchange HTTP error: {token_res.status_code} {token_res.text}")
            return RedirectResponse(f"{frontend_url}/settings/connectors?error=github_token_exchange_failed")

        token_data = token_res.json()
        access_token = token_data.get("access_token")  # ghu_... user access token

        if not access_token:
            err_desc = token_data.get("error_description", "no_access_token")
            print(f"[GitHub App] No access token in response: {token_data}")
            return RedirectResponse(f"{frontend_url}/settings/connectors?error={err_desc}")

        # GitHub App user tokens: extract refresh token and expiry
        refresh_token = token_data.get("refresh_token")          # present if token expiration enabled
        expires_in = token_data.get("expires_in")                # seconds until access token expires
        token_type = token_data.get("token_type", "bearer")

        # Compute absolute expiry datetime (if the App has token expiration enabled)
        token_expires_at = None
        if expires_in:
            token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))

        # Fetch GitHub user info
        userinfo_res = requests.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "Cortex-App",
            },
            timeout=10,
        )

        github_id = None
        github_login = None
        account_email = None

        if userinfo_res.ok:
            info = userinfo_res.json()
            github_id = str(info.get("id"))
            github_login = info.get("login")
            account_email = info.get("email") or github_login

        # Encrypt tokens before storage — never store plaintext
        encrypted_access = encrypt_string(access_token)
        encrypted_refresh = encrypt_string(refresh_token) if refresh_token else None

        # Build metadata to store installation_id and github_login for later use
        metadata = {}
        if installation_id:
            metadata["installation_id"] = installation_id
        if github_login:
            metadata["github_login"] = github_login

        # Deactivate any existing GitHub integration for this user (clean reconnect)
        existing = (
            db.query(UserIntegration)
            .filter(
                UserIntegration.user_id == user_id,
                UserIntegration.provider == "github",
            )
            .first()
        )

        if not existing:
            integration = UserIntegration(
                user_id=user_id,
                provider="github",
                integration_type="github_app",
                provider_account_id=github_id,
                account_email=account_email,
                access_token=encrypted_access,
                refresh_token=encrypted_refresh,
                token_expires_at=token_expires_at,
                scopes=[],          # GitHub App uses permissions, not OAuth scopes
                metadata_=metadata if metadata else None,
                is_active=True,
            )
            db.add(integration)
        else:
            # Update in place — handles re-connect after disconnect or App re-install
            existing.integration_type = "github_app"
            existing.provider_account_id = github_id or existing.provider_account_id
            existing.account_email = account_email or existing.account_email
            existing.access_token = encrypted_access
            existing.refresh_token = encrypted_refresh or existing.refresh_token
            existing.token_expires_at = token_expires_at or existing.token_expires_at
            existing.scopes = []
            existing.metadata_ = metadata if metadata else existing.metadata_
            existing.is_active = True
            existing.updated_at = datetime.now(timezone.utc)

        db.commit()
        print(
            f"[GitHub App] Connected for user_id={user_id} "
            f"login={github_login} installation_id={installation_id}"
        )

        return RedirectResponse(f"{frontend_url}/settings/connectors?success=github_connected")

    except Exception as e:
        print(f"[GitHub App] Error during callback: {e}")
        db.rollback()
        return RedirectResponse(f"{frontend_url}/settings/connectors?error=github_callback_failed")


# ---------------------------------------------------------------------------
# List all active integrations
# ---------------------------------------------------------------------------

@router.get("")
async def get_user_integrations(
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns list of active integration statuses for current user.
    NEVER exposes access_token, refresh_token, or client secrets.
    """
    records = (
        db.query(UserIntegration)
        .filter(
            UserIntegration.user_id == user_id,
            UserIntegration.is_active == True,
        )
        .all()
    )

    result = []
    for r in records:
        result.append({
            "id": r.id,
            "provider": r.provider,
            "type": r.integration_type,
            "connected": True,
            "account_email": r.account_email,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    return result


# ---------------------------------------------------------------------------
# Disconnect
# ---------------------------------------------------------------------------

@router.delete("/google/gmail")
async def disconnect_gmail(
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Deactivates/disconnects the Gmail integration for the current authenticated user.
    """
    integration = (
        db.query(UserIntegration)
        .filter(
            UserIntegration.user_id == user_id,
            UserIntegration.provider == "google",
            UserIntegration.integration_type == "gmail",
            UserIntegration.is_active == True,
        )
        .first()
    )

    if not integration:
        raise HTTPException(status_code=404, detail="Gmail integration not found or already disconnected.")

    integration.is_active = False
    integration.updated_at = datetime.now(timezone.utc)
    db.commit()

    print(f"[Integrations] Gmail integration disconnected for user_id={user_id}")
    return {
        "status": "disconnected",
        "provider": "google",
        "type": "gmail",
        "message": "Gmail integration disconnected successfully.",
    }


@router.delete("/github")
async def disconnect_github(
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Deactivates/disconnects the GitHub App integration for the current authenticated user.
    Works for both github_app and legacy github_repo integration types.
    """
    integration = (
        db.query(UserIntegration)
        .filter(
            UserIntegration.user_id == user_id,
            UserIntegration.provider == "github",
            UserIntegration.is_active == True,
        )
        .first()
    )

    if not integration:
        raise HTTPException(status_code=404, detail="GitHub integration not found or already disconnected.")

    integration.is_active = False
    integration.updated_at = datetime.now(timezone.utc)
    db.commit()

    print(f"[GitHub App] Disconnected for user_id={user_id}")
    return {
        "status": "disconnected",
        "provider": "github",
        "type": integration.integration_type,
        "message": "GitHub integration disconnected successfully.",
    }
