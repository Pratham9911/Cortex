# agentic/email/gmail_service.py
import os
import base64

from email.mime.text import MIMEText

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build


TOKEN_FILE = os.path.join(
    "credentials",
    "gmail_token.json",
)


SCOPES = [
    "https://www.googleapis.com/auth/gmail.send"
]


def save_credentials(credentials):
    os.makedirs(
        os.path.dirname(TOKEN_FILE),
        exist_ok=True,
    )

    with open(TOKEN_FILE, "w") as token:
        token.write(
            credentials.to_json()
        )


def load_credentials():

    if not os.path.exists(TOKEN_FILE):
        raise ValueError(
            "Gmail is not connected. "
            "Connect Google first."
        )

    credentials = Credentials.from_authorized_user_file(
        TOKEN_FILE,
        SCOPES,
    )

    # Refresh expired access token
    if (
        credentials.expired
        and credentials.refresh_token
    ):
        credentials.refresh(Request())
        save_credentials(credentials)

    if not credentials.valid:
        raise ValueError(
            "Gmail credentials are invalid. "
            "Please connect Google again."
        )

    return credentials


def get_gmail_service():

    credentials = load_credentials()

    return build(
        "gmail",
        "v1",
        credentials=credentials,
    )


def send_email(
    to: str,
    subject: str,
    body: str,
):

    gmail = get_gmail_service()

    message = MIMEText(
        body,
        "plain",
        "utf-8",
    )

    message["to"] = to
    message["subject"] = subject

    encoded_message = base64.urlsafe_b64encode(
        message.as_bytes()
    ).decode()

    result = (
        gmail.users()
        .messages()
        .send(
            userId="me",
            body={
                "raw": encoded_message
            },
        )
        .execute()
    )

    return {
        "status": "sent",
        "message_id": result["id"],
        "to": to,
        "subject": subject,
    }