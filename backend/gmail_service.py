import os
import base64
import re
from datetime import datetime, timedelta
from typing import Optional

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

import storage

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/userinfo.email",
          "openid"]

CLIENT_CONFIG = {
    "web": {
        "client_id": os.getenv("GOOGLE_CLIENT_ID", ""),
        "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", ""),
        "redirect_uris": [os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/callback")],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
}

# Job-related Gmail search query
JOB_QUERY = (
    'subject:("thank you for applying" OR "application received" OR '
    '"we received your application" OR "application for" OR '
    '"interview" OR "job offer" OR "offer letter" OR '
    '"unfortunately" OR "we regret" OR "not moving forward" OR '
    '"next steps" OR "phone screen" OR "technical interview" OR '
    '"your application" OR "position of" OR "role of")'
)


def create_oauth_flow(state: Optional[str] = None) -> Flow:
    flow = Flow.from_client_config(
        CLIENT_CONFIG,
        scopes=SCOPES,
        state=state
    )
    flow.redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/callback")
    return flow


def get_auth_url() -> tuple[str, str]:
    flow = create_oauth_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent"
    )
    return auth_url, state


def exchange_code(code: str, state: str) -> str:
    """Exchange auth code for tokens. Returns user email."""
    flow = create_oauth_flow(state=state)
    flow.fetch_token(code=code)
    creds = flow.credentials

    # Get user email — try userinfo first, fall back to id_token
    email = "unknown"
    try:
        service = build("oauth2", "v2", credentials=creds)
        user_info = service.userinfo().get().execute()
        email = user_info.get("email", "unknown")
    except Exception:
        # Fallback: decode id_token if available
        try:
            import json, base64
            token = creds.id_token
            if isinstance(token, str):
                # JWT decode (no verification needed here, just read payload)
                payload = token.split(".")[1]
                payload += "=" * (4 - len(payload) % 4)
                decoded = json.loads(base64.urlsafe_b64decode(payload))
                email = decoded.get("email", "unknown")
        except Exception as e2:
            print(f"Could not get email from token: {e2}")

    print(f"✓ OAuth exchange complete for {email}")

    # Save token
    storage.save_token(email, {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes or []),
        "expiry": creds.expiry.isoformat() if creds.expiry else None,
    })
    return email


def get_credentials(email: str) -> Optional[Credentials]:
    token_data = storage.load_token(email)
    if not token_data:
        return None
    creds = Credentials(
        token=token_data.get("token"),
        refresh_token=token_data.get("refresh_token"),
        token_uri=token_data.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=token_data.get("client_id"),
        client_secret=token_data.get("client_secret"),
        scopes=token_data.get("scopes"),
    )
    # Refresh if expired
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        storage.save_token(email, {
            "token": creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri,
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
            "scopes": list(creds.scopes or []),
            "expiry": creds.expiry.isoformat() if creds.expiry else None,
        })
    return creds


def fetch_job_emails(email: str, days: int = 90, max_results: int = 50) -> list[dict]:
    """Fetch job-related emails from Gmail for the given account."""
    creds = get_credentials(email)
    if not creds:
        raise ValueError(f"No credentials found for {email}")

    service = build("gmail", "v1", credentials=creds)

    # Build date filter
    after_date = (datetime.utcnow() - timedelta(days=days)).strftime("%Y/%m/%d")
    query = f"{JOB_QUERY} after:{after_date}"

    # List matching messages
    result = service.users().messages().list(
        userId="me",
        q=query,
        maxResults=max_results
    ).execute()

    messages = result.get("messages", [])
    emails = []

    for msg in messages:
        try:
            full = service.users().messages().get(
                userId="me",
                id=msg["id"],
                format="full"
            ).execute()
            parsed = _parse_email(full)
            if parsed:
                emails.append(parsed)
        except Exception as e:
            print(f"Error fetching message {msg['id']}: {e}")
            continue

    return emails


def _parse_email(msg: dict) -> Optional[dict]:
    """Extract subject, sender, date, and body snippet from a Gmail message."""
    headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
    subject = headers.get("Subject", "")
    sender = headers.get("From", "")
    date_str = headers.get("Date", "")
    snippet = msg.get("snippet", "")

    # Get full body text
    body = _extract_body(msg.get("payload", {}))

    # Parse date
    email_date = _parse_date(date_str)

    return {
        "subject": subject,
        "from": sender,
        "date": email_date,
        "snippet": snippet,
        "body": body[:3000],  # Limit body size for AI processing
    }


def _extract_body(payload: dict) -> str:
    """Recursively extract plain text body from email payload."""
    body = ""
    mime_type = payload.get("mimeType", "")

    if mime_type == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            body = base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="ignore")
    elif mime_type == "text/html":
        data = payload.get("body", {}).get("data", "")
        if data:
            html = base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="ignore")
            # Strip HTML tags
            body = re.sub(r"<[^>]+>", " ", html)
            body = re.sub(r"\s+", " ", body).strip()
    elif "parts" in payload:
        for part in payload["parts"]:
            body += _extract_body(part)

    return body


def _parse_date(date_str: str) -> str:
    """Parse email date string to YYYY-MM-DD."""
    formats = [
        "%a, %d %b %Y %H:%M:%S %z",
        "%d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S %Z",
        "%d %b %Y %H:%M:%S %Z",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return datetime.utcnow().strftime("%Y-%m-%d")
