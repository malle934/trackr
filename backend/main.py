import os
import json
from typing import Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from dotenv import load_dotenv

load_dotenv()

import storage
import gmail_service
import ai_service
from models import (
    Application, ApplicationCreate, ApplicationUpdate,
    ParseRequest, SyncResult, AuthStatus
)

app = FastAPI(title="Trackr API", version="1.0.0")

# Build allowed origins list — includes localhost + any Vercel deployment
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
ALLOWED_ORIGINS = [
    FRONTEND_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "null",  # file:// origin for local HTML
]
# Support Vercel preview URLs (https://*.vercel.app)
VERCEL_URL = os.getenv("VERCEL_URL", "")
if VERCEL_URL:
    ALLOWED_ORIGINS.append(f"https://{VERCEL_URL}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",  # allow all Vercel preview URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────
# HEALTH
# ─────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "ok", "app": "Trackr API", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


# ─────────────────────────────────────────
# APPLICATIONS — CRUD
# ─────────────────────────────────────────

@app.get("/api/applications", response_model=list[Application])
def list_applications():
    return storage.get_all_applications()


@app.get("/api/applications/{app_id}", response_model=Application)
def get_application(app_id: str):
    app = storage.get_application(app_id)
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


@app.post("/api/applications", response_model=Application, status_code=201)
def create_application(data: ApplicationCreate):
    return storage.create_application(data)


@app.patch("/api/applications/{app_id}", response_model=Application)
def update_application(app_id: str, data: ApplicationUpdate):
    app = storage.update_application(app_id, data)
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


@app.delete("/api/applications/{app_id}")
def delete_application(app_id: str):
    deleted = storage.delete_application(app_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Application not found")
    return {"deleted": True, "id": app_id}


# ─────────────────────────────────────────
# STATS
# ─────────────────────────────────────────

@app.get("/api/stats")
def get_stats():
    apps = storage.get_all_applications()
    total = len(apps)
    active = sum(1 for a in apps if a.stage not in ["rejected", "offer"])
    interviews = sum(1 for a in apps if a.stage in ["interview", "final"])
    offers = sum(1 for a in apps if a.stage == "offer")
    rejected = sum(1 for a in apps if a.stage == "rejected")
    responded = sum(1 for a in apps if a.stage not in ["applied", "bookmarked"])
    rate = round((responded / total * 100)) if total > 0 else 0

    by_stage = {}
    for stage in ["bookmarked","applied","phone","interview","final","offer","rejected"]:
        by_stage[stage] = sum(1 for a in apps if a.stage == stage)

    return {
        "total": total,
        "active": active,
        "interviews": interviews,
        "offers": offers,
        "rejected": rejected,
        "response_rate": rate,
        "by_stage": by_stage,
    }


# ─────────────────────────────────────────
# SMART PASTE — AI parse single text
# ─────────────────────────────────────────

@app.post("/api/parse", response_model=Application)
def parse_and_create(req: ParseRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    try:
        parsed = ai_service.parse_single(req.text)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI parsing failed: {str(e)}")

    data = ApplicationCreate(
        company=parsed.get("company", ""),
        title=parsed.get("title", ""),
        stage=parsed.get("stage", "applied"),
        applied=parsed.get("applied", ""),
        salary=parsed.get("salary", ""),
        location=parsed.get("location", ""),
        url=parsed.get("url", ""),
        notes=parsed.get("notes", ""),
    )
    return storage.create_application(data, source_auto=True)


# ─────────────────────────────────────────
# GMAIL AUTH — OAuth2 flow
# ─────────────────────────────────────────

# In-memory state store (use Redis in production)
_oauth_states: dict[str, str] = {}

@app.get("/auth/gmail")
def start_gmail_auth():
    """Redirect user to Google OAuth consent screen."""
    if not os.getenv("GOOGLE_CLIENT_ID"):
        raise HTTPException(
            status_code=503,
            detail="Google OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env"
        )
    auth_url, state = gmail_service.get_auth_url()
    _oauth_states[state] = state
    return RedirectResponse(url=auth_url)


@app.get("/auth/callback")
def gmail_callback(code: str = Query(...), state: str = Query(...), error: Optional[str] = Query(None)):
    """Handle OAuth2 callback from Google."""
    if error:
        return RedirectResponse(url=f"{FRONTEND_URL}?auth_error={error}")

    if state not in _oauth_states:
        return RedirectResponse(url=f"{FRONTEND_URL}?auth_error=invalid_state")

    del _oauth_states[state]

    try:
        email = gmail_service.exchange_code(code, state)
        return RedirectResponse(url=f"{FRONTEND_URL}?auth_success=1&email={email}")
    except Exception as e:
        print(f"OAuth callback error: {e}")
        return RedirectResponse(url=f"{FRONTEND_URL}?auth_error=exchange_failed")


@app.get("/auth/status")
def auth_status():
    """List all connected Gmail accounts with sync history."""
    emails       = storage.get_all_connected_emails()
    sync_statuses= storage.get_all_sync_statuses()
    accounts     = []
    for email in emails:
        history = sync_statuses.get(email)
        accounts.append({
            "email":        email,
            "last_synced":  history["last_synced"]  if history else None,
            "synced_until": history["synced_until"] if history else None,
            "total_fetched":history["total_fetched"]if history else 0,
            "is_first_sync":history is None,
        })
    return {"connected": len(emails) > 0, "emails": emails, "accounts": accounts}


@app.delete("/auth/disconnect/{email}")
def disconnect_gmail(email: str):
    """Disconnect a Gmail account."""
    storage.delete_token(email)
    return {"disconnected": True, "email": email}


# ─────────────────────────────────────────
# GMAIL SYNC STATUS
# ─────────────────────────────────────────

@app.get("/api/sync/status")
def get_sync_status():
    """Get sync history for all connected Gmail accounts."""
    return storage.get_all_sync_statuses()


# ─────────────────────────────────────────
# GMAIL SYNC — INCREMENTAL
# ─────────────────────────────────────────

@app.post("/api/sync/{email}")
def sync_gmail(email: str) -> SyncResult:
    """
    Smart incremental Gmail sync:
    - First sync  → fetch last 90 days
    - Later syncs → fetch only since last sync date
    """
    import traceback

    print(f"\n── Sync requested for {email} ──")

    # Check credentials
    creds = gmail_service.get_credentials(email)
    if not creds:
        raise HTTPException(
            status_code=401,
            detail=f"Gmail account '{email}' is not connected. Please authenticate first."
        )
    print(f"✓ Credentials loaded for {email}")

    # Smart incremental fetch
    try:
        raw_emails, fetch_from, is_first = gmail_service.fetch_job_emails_incremental(email)
        print(f"✓ Found {len(raw_emails)} job emails (scanned since {fetch_from})")
    except Exception as e:
        print(f"ERROR fetching emails:\n{traceback.format_exc()}")
        raise HTTPException(status_code=502, detail=f"Gmail fetch failed: {str(e)}")

    if not raw_emails:
        # Still update sync history even if no new emails
        today = datetime.utcnow().strftime("%Y-%m-%d")
        storage.save_sync_history(email, today, 0)
        print("No new job emails found")
        return SyncResult(found=0, added=0, duplicates=0, items=[])

    # Gemini AI parse
    try:
        parsed_list = ai_service.parse_batch(raw_emails)
        print(f"✓ Gemini parsed {len(parsed_list)} job applications")
    except Exception as e:
        print(f"ERROR in AI parsing:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"AI parsing failed: {str(e)}")

    # Upsert into storage
    added = 0
    duplicates = 0
    items = []

    for parsed in parsed_list:
        try:
            app, is_new = storage.upsert_from_sync(parsed)
            if is_new:
                added += 1
                print(f"  + Added: {parsed.get('company')} — {parsed.get('title')}")
            else:
                duplicates += 1
                print(f"  ~ Duplicate: {parsed.get('company')}")
            items.append({
                "id":            app.id,
                "company":       app.company,
                "title":         app.title,
                "stage":         app.stage,
                "email_subject": parsed.get("email_subject", ""),
                "email_date":    parsed.get("email_date", ""),
                "is_new":        is_new,
            })
        except Exception as e:
            print(f"  ERROR upserting {parsed.get('company')}: {e}")
            continue

    # Save sync history — mark today as last synced
    today = datetime.utcnow().strftime("%Y-%m-%d")
    storage.save_sync_history(email, today, len(raw_emails))
    print(f"✓ Sync complete — {added} added, {duplicates} skipped\n")

    return SyncResult(
        found=len(parsed_list),
        added=added,
        duplicates=duplicates,
        items=items,
    )
