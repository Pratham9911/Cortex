# send_test_email.py
import os
import base64
from email.mime.text import MIMEText

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build


TOKEN_FILE = "credentials/gmail_token.json"

SCOPES = [
    "https://www.googleapis.com/auth/gmail.send"
]


def send_test_email(to: str):
    credentials = Credentials.from_authorized_user_file(
        TOKEN_FILE,
        SCOPES,
    )

    gmail = build(
        "gmail",
        "v1",
        credentials=credentials,
    )

    message = MIMEText(
        "Hello from Cortex!\n\n"
        "This is a real email sent through the Gmail API."
    )

    message["to"] = to
    message["subject"] = "Cortex Gmail API Test"

    encoded_message = base64.urlsafe_b64encode(
        message.as_bytes()
    ).decode()

    result = gmail.users().messages().send(
        userId="me",
        body={"raw": encoded_message},
    ).execute()

    print("Email sent successfully!")
    print("Message ID:", result["id"])


if __name__ == "__main__":
    send_test_email("prathamt_c23196@students.isquareit.edu.in")