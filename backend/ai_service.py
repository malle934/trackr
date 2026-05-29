import os
import json
import anthropic

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))

EXTRACT_SYSTEM = """You extract job application details from email or text content.
Return ONLY valid JSON. No markdown, no backticks, no explanation.

JSON fields:
- company: string (company name)
- title: string (job title / role)  
- stage: one of [bookmarked, applied, phone, interview, final, offer, rejected]
  - "applied" = confirmation of application received
  - "phone" = phone screen / recruiter call scheduled
  - "interview" = technical or panel interview scheduled/completed
  - "final" = final round / onsite
  - "offer" = offer letter / offer extended
  - "rejected" = rejection / not moving forward
  - "bookmarked" = job posting saved, not yet applied
- applied: date string "YYYY-MM-DD" or ""
- salary: salary/compensation string or ""
- location: job location or ""
- url: job posting URL or careers page URL or ""
- notes: 1-sentence summary of key info from the email

If you cannot determine a field, use an empty string "".
"""

BATCH_EXTRACT_SYSTEM = """You extract job application details from multiple emails.
Return ONLY a valid JSON array of objects. No markdown, no backticks, no explanation.

Each object has these fields:
- company: string
- title: string
- stage: one of [bookmarked, applied, phone, interview, final, offer, rejected]
- applied: "YYYY-MM-DD" or ""
- salary: string or ""
- location: string or ""
- url: string or ""
- notes: 1-sentence summary
- email_subject: the original email subject line
- email_date: the email date "YYYY-MM-DD"

Only include emails that are clearly job-application related.
Skip newsletters, promotional emails, and unrelated emails.
"""


def parse_single(text: str) -> dict:
    """Parse a single pasted email or text into structured job application data."""
    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=800,
        system=EXTRACT_SYSTEM,
        messages=[{"role": "user", "content": text}]
    )
    raw = message.content[0].text.strip()
    raw = raw.replace("```json", "").replace("```", "").strip()
    parsed = json.loads(raw)
    if not parsed.get("company"):
        raise ValueError("Could not extract company name from text")
    return parsed


def parse_batch(emails: list[dict]) -> list[dict]:
    """Parse a batch of raw emails into structured job application data."""
    if not emails:
        return []

    # Build prompt with all emails
    email_blocks = []
    for i, email in enumerate(emails, 1):
        block = f"""--- Email {i} ---
Subject: {email.get('subject', '')}
From: {email.get('from', '')}
Date: {email.get('date', '')}
Body: {email.get('body', email.get('snippet', ''))[:1500]}
"""
        email_blocks.append(block)

    combined = "\n".join(email_blocks)

    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=4000,
        system=BATCH_EXTRACT_SYSTEM,
        messages=[{"role": "user", "content": combined}]
    )
    raw = message.content[0].text.strip()
    raw = raw.replace("```json", "").replace("```", "").strip()
    parsed = json.loads(raw)
    if not isinstance(parsed, list):
        return []
    return [p for p in parsed if p.get("company")]
