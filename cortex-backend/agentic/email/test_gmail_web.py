import webbrowser

from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

from .gmail_oauth import (
    get_authorization_url,
    exchange_code_for_credentials,
)

from .gmail_service import (
    save_credentials,
    send_email,
)


PORT = 8000


class OAuthCallbackHandler(BaseHTTPRequestHandler):

    authorization_code = None

    def do_GET(self):

        parsed = urlparse(self.path)

        if parsed.path != "/api/integrations/google/callback":

            self.send_response(404)
            self.end_headers()

            return

        params = parse_qs(parsed.query)

        code = params.get(
            "code",
            [None],
        )[0]

        if not code:

            self.send_response(400)
            self.end_headers()

            self.wfile.write(
                b"Google OAuth failed."
            )

            return

        OAuthCallbackHandler.authorization_code = code

        self.send_response(200)

        self.send_header(
            "Content-Type",
            "text/html",
        )

        self.end_headers()

        self.wfile.write(
            b"""
            <html>
                <body>
                    <h2>Cortex Google authentication successful.</h2>
                    <p>You can close this window.</p>
                </body>
            </html>
            """
        )

    def log_message(self, format, *args):
        pass


def main():

    print()
    print("==============================")
    print("CORTEX GMAIL WEB OAUTH TEST")
    print("==============================")


    # ------------------------------------------------
    # 1. Create OAuth flow
    # ------------------------------------------------

    flow, authorization_url, state = (
        get_authorization_url()
    )


    print()
    print("Opening Google OAuth...")


    # ------------------------------------------------
    # 2. Start local callback server
    # ------------------------------------------------

    server = HTTPServer(
        ("localhost", PORT),
        OAuthCallbackHandler,
    )


    # ------------------------------------------------
    # 3. Open browser
    # ------------------------------------------------

    webbrowser.open(
        authorization_url
    )


    print()
    print("Waiting for Google callback...")


    # ------------------------------------------------
    # 4. Wait for Google callback
    # ------------------------------------------------

    while (
        OAuthCallbackHandler.authorization_code
        is None
    ):
        server.handle_request()


    server.server_close()


    code = (
        OAuthCallbackHandler.authorization_code
    )


    print(
        "Authorization code received."
    )


    # ------------------------------------------------
    # 5. Exchange code
    #
    # IMPORTANT:
    # SAME flow object
    # ------------------------------------------------

    credentials = (
        exchange_code_for_credentials(
            flow,
            code,
        )
    )


    print(
        "Google authentication successful."
    )


    # ------------------------------------------------
    # 6. Save credentials
    # ------------------------------------------------

    save_credentials(
        credentials
    )


    print(
        "Credentials saved."
    )


    # ------------------------------------------------
    # 7. Send real email
    # ------------------------------------------------

    result = send_email(

        to="prathamtiwari0123@gmail.com",

        subject="Cortex EMAIL AGENT",

        body=(
            "Hello!\n\n"
            "This email was sent from Cortex using "
            "Google Web OAuth and the Gmail API.\n\n"
            "Cortex Gmail integration is working!"
        ),
    )


    print()
    print("==============================")
    print("EMAIL SENT SUCCESSFULLY")
    print("==============================")


    print(
        "To:",
        result["to"],
    )

    print(
        "Subject:",
        result["subject"],
    )

    print(
        "Message ID:",
        result["message_id"],
    )


if __name__ == "__main__":
    main()