# gmail_oauth.py
import os

from dotenv import load_dotenv
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request


load_dotenv()


SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.send",
]


CLIENT_SECRET_FILE = os.path.join(
    "credentials",
    "client_secret.json",
)


TOKEN_FILE = os.path.join(
    "credentials",
    "gmail_token.json",
)


REDIRECT_URI = (
    "http://localhost:8000/api/integrations/google/callback"
)


def get_authorization_url():
    """
    Create Google OAuth flow and authorization URL.

    IMPORTANT:
    The returned flow object MUST be reused when exchanging
    the authorization code. This preserves the PKCE verifier.
    """

    flow = Flow.from_client_secrets_file(
        CLIENT_SECRET_FILE,
        scopes=SCOPES,
    )

    flow.redirect_uri = REDIRECT_URI

    authorization_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )

    return flow, authorization_url, state


def exchange_code_for_credentials(flow, code):
    """
    Exchange authorization code using the SAME Flow object
    that generated the authorization URL.
    """

    flow.fetch_token(
    code=code,
    include_client_id=True,
)

    return flow.credentials


def load_saved_credentials():
    """
    Load saved Gmail credentials.

    Refreshes expired credentials automatically when possible.
    """

    if not os.path.exists(TOKEN_FILE):
        return None

    credentials = Credentials.from_authorized_user_file(
        TOKEN_FILE,
        SCOPES,
    )

    if credentials.valid:
        return credentials

    if (
        credentials.expired
        and credentials.refresh_token
    ):
        credentials.refresh(Request())
        save_token(credentials)
        return credentials

    return None


def save_token(credentials):
    """
    Save Gmail OAuth credentials locally.

    This is only for our current local testing.
    Later, production credentials should be stored per user
    in the database / secure credential storage.
    """

    os.makedirs(
        os.path.dirname(TOKEN_FILE),
        exist_ok=True,
    )

    with open(TOKEN_FILE, "w") as token:
        token.write(
            credentials.to_json()
        )