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
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.send",
]

CLIENT_SECRET_FILE = os.path.join("credentials", "client_secret.json")

REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:8000/api/integrations/google/callback"
)


def create_google_flow(state: str = None) -> Flow:
    """Create Google OAuth Flow object using client secret file or env vars."""
    if os.path.exists(CLIENT_SECRET_FILE):
        flow = Flow.from_client_secrets_file(
            CLIENT_SECRET_FILE,
            scopes=SCOPES,
            state=state,
        )
    else:
        client_config = {
            "web": {
                "client_id": os.getenv("GOOGLE_CLIENT_ID"),
                "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        }
        flow = Flow.from_client_config(
            client_config,
            scopes=SCOPES,
            state=state,
        )

    flow.redirect_uri = REDIRECT_URI
    return flow


def get_authorization_url(custom_state: str = None):
    """
    Create Google OAuth flow and authorization URL using custom_state token.
    Returns (flow, authorization_url, state, code_verifier).
    """
    flow = create_google_flow(state=custom_state)

    auth_kwargs = {
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    if custom_state:
        auth_kwargs["state"] = custom_state

    authorization_url, state = flow.authorization_url(**auth_kwargs)
    code_verifier = getattr(flow, "code_verifier", None)
    return flow, authorization_url, state, code_verifier


def exchange_code_for_credentials(code: str, state: str = None, code_verifier: str = None):
    """
    Exchange authorization code using flow configured with state and PKCE code_verifier.
    """
    flow = create_google_flow(state=state)
    if code_verifier:
        flow.code_verifier = code_verifier
    flow.fetch_token(code=code, include_client_id=True)
    return flow.credentials