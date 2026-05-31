from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime


StageType = Literal[
    "bookmarked", "applied", "phone",
    "interview", "final", "offer", "rejected"
]

PriorityType = Literal["hot", "warm", "cold", ""]


class Application(BaseModel):
    id: str
    company: str
    title: str = ""
    stage: StageType = "applied"
    priority: PriorityType = ""
    applied: str = ""        # YYYY-MM-DD
    followup: str = ""       # YYYY-MM-DD
    salary: str = ""
    location: str = ""
    url: str = ""
    notes: str = ""
    source_auto: bool = False
    created_at: str = ""
    updated_at: str = ""


class ApplicationCreate(BaseModel):
    company: str
    title: str = ""
    stage: StageType = "applied"
    priority: PriorityType = ""
    applied: str = ""
    followup: str = ""
    salary: str = ""
    location: str = ""
    url: str = ""
    notes: str = ""


class ApplicationUpdate(BaseModel):
    company: Optional[str] = None
    title: Optional[str] = None
    stage: Optional[StageType] = None
    priority: Optional[PriorityType] = None
    applied: Optional[str] = None
    followup: Optional[str] = None
    salary: Optional[str] = None
    location: Optional[str] = None
    url: Optional[str] = None
    notes: Optional[str] = None


class ParseRequest(BaseModel):
    text: str


class SyncResult(BaseModel):
    found: int
    added: int
    duplicates: int
    items: list[dict]
    skipped_emails: list[dict] = []  # emails that need manual review


class AuthStatus(BaseModel):
    connected: bool
    email: Optional[str] = None
