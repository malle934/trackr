import json
import os
import uuid
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Optional

from models import Application, ApplicationCreate, ApplicationUpdate

DATA_DIR   = Path(os.getenv("DATA_DIR", "./data"))
APPS_FILE  = DATA_DIR / "applications.json"
TOKENS_FILE= DATA_DIR / "tokens.json"
SYNC_FILE  = DATA_DIR / "sync_history.json"


def _ensure_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _read_apps() -> list[dict]:
    _ensure_dir()
    if not APPS_FILE.exists():
        return []
    with open(APPS_FILE, "r") as f:
        return json.load(f)


def _write_apps(apps: list[dict]):
    _ensure_dir()
    with open(APPS_FILE, "w") as f:
        json.dump(apps, f, indent=2)


def _calc_followup(applied: str, stage: str) -> str:
    if not applied:
        return ""
    offsets = {
        "applied": 7, "phone": 5, "interview": 3,
        "final": 3, "offer": 7, "rejected": 0, "bookmarked": 14
    }
    try:
        d = date.fromisoformat(applied)
        d += timedelta(days=offsets.get(stage, 7))
        return d.isoformat()
    except Exception:
        return ""


# ── Applications ───────────────────────────────────────────────

def get_all_applications() -> list[Application]:
    return [Application(**a) for a in _read_apps()]


def get_application(app_id: str) -> Optional[Application]:
    for a in _read_apps():
        if a["id"] == app_id:
            return Application(**a)
    return None


def create_application(data: ApplicationCreate, source_auto: bool = False) -> Application:
    apps = _read_apps()
    now  = datetime.utcnow().isoformat()
    app  = Application(
        id=str(uuid.uuid4()),
        created_at=now, updated_at=now,
        source_auto=source_auto,
        **data.model_dump()
    )
    if not app.followup and app.applied:
        app.followup = _calc_followup(app.applied, app.stage)
    apps.append(app.model_dump())
    _write_apps(apps)
    return app


def update_application(app_id: str, data: ApplicationUpdate) -> Optional[Application]:
    apps = _read_apps()
    for i, a in enumerate(apps):
        if a["id"] == app_id:
            updates = {k: v for k, v in data.model_dump().items() if v is not None}
            apps[i].update(updates)
            apps[i]["updated_at"] = datetime.utcnow().isoformat()
            _write_apps(apps)
            return Application(**apps[i])
    return None


def delete_application(app_id: str) -> bool:
    apps     = _read_apps()
    new_apps = [a for a in apps if a["id"] != app_id]
    if len(new_apps) == len(apps):
        return False
    _write_apps(new_apps)
    return True


def upsert_from_sync(parsed: dict) -> tuple[Application, bool]:
    """Insert if not duplicate. Duplicate = same company + title."""
    apps = _read_apps()
    key  = (parsed.get("company", "").lower().strip(),
            parsed.get("title",   "").lower().strip())
    for a in apps:
        if (a.get("company","").lower().strip(),
            a.get("title",  "").lower().strip()) == key:
            return Application(**a), False

    data = ApplicationCreate(
        company =parsed.get("company",  "Unknown"),
        title   =parsed.get("title",    ""),
        stage   =parsed.get("stage",    "applied"),
        applied =parsed.get("applied",  ""),
        salary  =parsed.get("salary",   ""),
        location=parsed.get("location", ""),
        url     =parsed.get("url",      ""),
        notes   =parsed.get("notes",    ""),
    )
    app = create_application(data, source_auto=True)
    return app, True


# ── OAuth Tokens ───────────────────────────────────────────────

def save_token(user_email: str, token_data: dict):
    _ensure_dir()
    tokens = {}
    if TOKENS_FILE.exists():
        with open(TOKENS_FILE) as f:
            tokens = json.load(f)
    tokens[user_email] = token_data
    with open(TOKENS_FILE, "w") as f:
        json.dump(tokens, f, indent=2)


def load_token(user_email: str) -> Optional[dict]:
    if not TOKENS_FILE.exists():
        return None
    with open(TOKENS_FILE) as f:
        return json.load(f).get(user_email)


def get_all_connected_emails() -> list[str]:
    if not TOKENS_FILE.exists():
        return []
    with open(TOKENS_FILE) as f:
        return list(json.load(f).keys())


def delete_token(user_email: str):
    if not TOKENS_FILE.exists():
        return
    with open(TOKENS_FILE) as f:
        tokens = json.load(f)
    tokens.pop(user_email, None)
    with open(TOKENS_FILE, "w") as f:
        json.dump(tokens, f, indent=2)


# ── Sync History ───────────────────────────────────────────────

def _read_sync_history() -> dict:
    _ensure_dir()
    if not SYNC_FILE.exists():
        return {}
    with open(SYNC_FILE) as f:
        return json.load(f)


def _write_sync_history(data: dict):
    _ensure_dir()
    with open(SYNC_FILE, "w") as f:
        json.dump(data, f, indent=2)


def get_sync_history(email: str) -> Optional[dict]:
    """Get sync history for a Gmail account."""
    return _read_sync_history().get(email)


def save_sync_history(email: str, synced_until: str, total_fetched: int):
    """Save after a successful sync."""
    history = _read_sync_history()
    now     = datetime.utcnow().isoformat()
    if email not in history:
        history[email] = {
            "first_synced":  now,
            "last_synced":   now,
            "synced_until":  synced_until,   # date string YYYY-MM-DD
            "total_fetched": total_fetched,
        }
    else:
        history[email]["last_synced"]   = now
        history[email]["synced_until"]  = synced_until
        history[email]["total_fetched"] = (
            history[email].get("total_fetched", 0) + total_fetched
        )
    _write_sync_history(history)


def get_all_sync_statuses() -> dict:
    """Return sync history for all connected emails."""
    history = _read_sync_history()
    emails  = get_all_connected_emails()
    result  = {}
    for email in emails:
        result[email] = history.get(email, None)
    return result
