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

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid"
]

CLIENT_CONFIG = {
    "web": {
        "client_id":     os.getenv("GOOGLE_CLIENT_ID", ""),
        "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", ""),
        "redirect_uris": [os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/callback")],
        "auth_uri":      "https://accounts.google.com/o/oauth2/auth",
        "token_uri":     "https://oauth2.googleapis.com/token",
    }
}

# ── Keyword filter — catches 95%+ of job emails ───────────────
JOB_KEYWORDS = [
    # Application status
    "applied", "application", "application received", "thank you for applying",
    "thank you for your application", "we received your application",
    "successfully applied", "application submitted",

    # Interview
    "interview", "interview invitation", "interview scheduled",
    "interview request", "schedule an interview", "technical interview",
    "hr interview", "virtual interview", "coding round", "coding challenge",
    "technical round", "assessment", "online test", "aptitude test",
    "hiring assessment",

    # Offer / Selection
    "offer", "offer letter", "job offer", "congratulations",
    "selected", "shortlisted", "pleased to inform",
    "we are happy", "we are pleased", "next steps",

    # Rejection
    "unfortunately", "regret", "not selected", "not moving forward",
    "other candidates", "position has been filled", "not shortlisted",
    "thank you for your interest", "we will not", "after careful consideration",

    # Indian job boards
    "naukri", "linkedin", "internshala", "unstop", "foundit",
    "shine", "glassdoor", "indeed", "hirist", "iimjobs",
    "cutshort", "wellfound", "angellist", "freshersworld",
    "monster", "timesjobs", "apna",

    # Recruiter keywords
    "recruiter", "hiring", "job opportunity", "career opportunity",
    "position", "role", "vacancy", "opening", "requisition",
    "we came across your profile", "your profile matches",
    "exciting opportunity",

    # Indian IT companies (common employers)
    "infosys", "wipro", "tcs", "accenture", "cognizant",
    "capgemini", "hcl", "tech mahindra", "mphasis", "hexaware",
    "mindtree", "l&t technology", "persistent", "mphasis",
    "amazon", "google", "microsoft", "flipkart", "swiggy",
    "zomato", "paytm", "razorpay", "phonepe", "byju",
    "unacademy", "meesho", "ola", "uber",
]


def _is_job_email(subject: str, snippet: str) -> bool:
    """Check if email is job-related using keyword matching."""
    text = (subject + " " + snippet).lower()
    return any(kw in text for kw in JOB_KEYWORDS)


# ── OAuth ─────────────────────────────────────────────────────

def create_oauth_flow(state: Optional[str] = None) -> Flow:
    flow = Flow.from_client_config(CLIENT_CONFIG, scopes=SCOPES, state=state)
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
    flow = create_oauth_flow(state=state)
    flow.fetch_token(code=code)
    creds = flow.credentials

    email = "unknown"
    try:
        service   = build("oauth2", "v2", credentials=creds)
        user_info = service.userinfo().get().execute()
        email     = user_info.get("email", "unknown")
    except Exception:
        try:
            import json as _json
            token   = creds.id_token
            if isinstance(token, str):
                payload = token.split(".")[1]
                payload += "=" * (4 - len(payload) % 4)
                decoded = _json.loads(base64.urlsafe_b64decode(payload))
                email   = decoded.get("email", "unknown")
        except Exception as e2:
            print(f"Could not get email: {e2}")

    print(f"✓ OAuth exchange complete for {email}")
    storage.save_token(email, {
        "token":         creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri":     creds.token_uri,
        "client_id":     creds.client_id,
        "client_secret": creds.client_secret,
        "scopes":        list(creds.scopes or []),
        "expiry":        creds.expiry.isoformat() if creds.expiry else None,
    })
    return email


def get_credentials(email: str) -> Optional[Credentials]:
    token_data = storage.load_token(email)
    if not token_data:
        return None
    creds = Credentials(
        token         =token_data.get("token"),
        refresh_token =token_data.get("refresh_token"),
        token_uri     =token_data.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id     =token_data.get("client_id"),
        client_secret =token_data.get("client_secret"),
        scopes        =token_data.get("scopes"),
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        storage.save_token(email, {
            "token":         creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri":     creds.token_uri,
            "client_id":     creds.client_id,
            "client_secret": creds.client_secret,
            "scopes":        list(creds.scopes or []),
            "expiry":        creds.expiry.isoformat() if creds.expiry else None,
        })
    return creds


# ── Smart incremental email fetch ────────────────────────────

def fetch_job_emails_incremental(email: str) -> tuple[list[dict], str, bool]:
    """
    Smart incremental fetch:
    - First ever sync  → fetch last 90 days
    - Subsequent syncs → fetch only since last sync date
    Returns: (emails, fetch_from_date, is_first_sync)
    """
    history = storage.get_sync_history(email)
    today   = datetime.utcnow().date()

    if history and history.get("synced_until"):
        # Incremental — fetch only since last sync
        last_date    = history["synced_until"]  # YYYY-MM-DD
        fetch_from   = last_date
        is_first     = False
        print(f"  Incremental sync from {fetch_from} → {today}")
    else:
        # First sync — fetch last 90 days
        fetch_from   = (datetime.utcnow() - timedelta(days=90)).strftime("%Y-%m-%d")
        is_first     = True
        print(f"  First sync — fetching last 90 days from {fetch_from}")

    emails = _fetch_emails_since(email, fetch_from)
    return emails, fetch_from, is_first


def _fetch_emails_since(email: str, since_date: str) -> list[dict]:
    """
    Fetch emails since a given date.
    Uses metadata only (fast) + keyword filter (smart).
    Scans up to 500 emails, stops when 100 job emails found.
    """
    creds = get_credentials(email)
    if not creds:
        raise ValueError(f"No credentials for {email}")

    service    = build("gmail", "v1", credentials=creds)
    after_date = since_date.replace("-", "/")

    print(f"  Gmail query: after:{after_date}")

    # Fetch metadata only — much faster than full format
    result = service.users().messages().list(
        userId="me",
        q=f"after:{after_date}",
        maxResults=500
    ).execute()

    messages   = result.get("messages", [])
    print(f"  Total emails in inbox since {since_date}: {len(messages)}")

    job_emails = []
    scanned    = 0

    for msg in messages:
        scanned += 1
        try:
            # Fetch metadata only (headers + snippet) — very fast
            meta = service.users().messages().get(
                userId="me",
                id=msg["id"],
                format="metadata",
                metadataHeaders=["Subject", "From", "Date"]
            ).execute()

            headers = {
                h["name"]: h["value"]
                for h in meta.get("payload", {}).get("headers", [])
            }
            subject = headers.get("Subject", "")
            sender  = headers.get("From", "")
            date_str= headers.get("Date", "")
            snippet = meta.get("snippet", "")

            # Keyword filter — only process job emails
            if not _is_job_email(subject, snippet):
                continue

            job_emails.append({
                "subject": subject,
                "from":    sender,
                "date":    _parse_date(date_str),
                "snippet": snippet[:300],
                "body":    "",   # not needed — subject+snippet is enough
            })

            # Stop early once we have 100 job emails
            if len(job_emails) >= 100:
                print(f"  Reached 100 job emails after scanning {scanned} emails — stopping")
                break

        except Exception as e:
            print(f"  Error fetching metadata for {msg['id']}: {e}")
            continue

    print(f"  Scanned {scanned}/{len(messages)} emails → found {len(job_emails)} job emails")
    return job_emails


def _parse_date(date_str: str) -> str:
    formats = [
        "%a, %d %b %Y %H:%M:%S %z",
        "%d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S %Z",
        "%d %b %Y %H:%M:%S %Z",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(date_str.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return datetime.utcnow().strftime("%Y-%m-%d")
