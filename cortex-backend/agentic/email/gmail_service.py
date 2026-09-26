import os
import json
import base64
from datetime import datetime, timezone
from email.mime.text import MIMEText
from pathlib import Path

from sqlalchemy.orm import Session
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

from database import SessionLocal
from models import UserIntegration
from agentic.email.encryption import encrypt_string, decrypt_string
from agentic.email.gmail_oauth import SCOPES

BACKEND_DIR = Path(__file__).resolve().parents[2]
CLIENT_SECRET_FILE = BACKEND_DIR / "credentials" / "client_secret.json"


def _get_client_info():
    """Extract client_id and client_secret from client_secret.json or env vars."""
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")

    if client_id and client_secret:
        return client_id, client_secret

    if CLIENT_SECRET_FILE.exists():
        try:
            with CLIENT_SECRET_FILE.open("r", encoding="utf-8") as f:
                data = json.load(f)
                web = data.get("web") or data.get("installed") or {}
                return web.get("client_id"), web.get("client_secret")
        except Exception as e:
            print(f"[GmailService] Error reading {CLIENT_SECRET_FILE}: {e}")

    return None, None


def get_gmail_service(user_id: int, db: Session = None):
    """
    Load Gmail API client for a given Cortex user_id.
    Fetches encrypted tokens from user_integrations table, auto-refreshes if expired,
    and updates DB with refreshed access tokens.
    """
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
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
            raise ValueError(
                "Gmail is not connected. Please connect your Gmail account in Settings -> Connectors."
            )

        client_id, client_secret = _get_client_info()

        plain_access_token = decrypt_string(integration.access_token)
        plain_refresh_token = decrypt_string(integration.refresh_token)

        credentials = Credentials(
            token=plain_access_token,
            refresh_token=plain_refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=client_id,
            client_secret=client_secret,
            scopes=integration.scopes or SCOPES,
        )

        # Check token expiration and refresh if necessary
        if credentials.expired and credentials.refresh_token:
            print(f"[GmailService] Token expired for user_id={user_id}. Refreshing token...")
            credentials.refresh(Request())

            # Update DB with new refreshed access token
            integration.access_token = encrypt_string(credentials.token)
            if credentials.expiry:
                integration.token_expires_at = credentials.expiry
            integration.updated_at = datetime.now(timezone.utc)
            db.commit()
            print(f"[GmailService] Refreshed access token persisted for user_id={user_id}")

        if not credentials.valid:
            integration.is_active = False
            db.commit()
            raise ValueError(
                "Gmail credentials could not be validated. Please reconnect your Gmail account in Settings -> Connectors."
            )

        return build("gmail", "v1", credentials=credentials)

    finally:
        if close_db:
            db.close()


def send_email_via_gmail(
    user_id: int,
    to: str,
    subject: str,
    body: str,
    db: Session = None,
) -> dict:
    """
    Sends an email using the connected Gmail account of the specified user_id.
    """
    gmail = get_gmail_service(user_id, db)

    message = MIMEText(body, "plain", "utf-8")
    message["to"] = to
    message["subject"] = subject

    encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()

    result = (
        gmail.users()
        .messages()
        .send(userId="me", body={"raw": encoded_message})
        .execute()
    )

    return {
        "status": "sent",
        "message_id": result.get("id"),
        "to": to,
        "subject": subject,
        "message": f"Email successfully sent via connected Gmail account to {to}.",
    }
