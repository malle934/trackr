import os
import json
import anthropic

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))

EXTRACT_SYSTEM = """Extract job application details from email or text.
Return ONLY valid JSON. No markdown, no backticks, no explanation.
Fields: company, title, stage(bookmarked/applied/phone/interview/final/offer/rejected),
applied(YYYY-MM-DD or ""), salary, location, url, notes(1 sentence).
"""

BATCH_SYSTEM = """Extract job application details from multiple emails.
Use ONLY subject line, sender, date, and brief snippet — that is enough.
Return ONLY a valid JSON array. No markdown, no backticks, no explanation.

Each object:
{
  "company": string,
  "title": string,
  "stage": "applied"|"phone"|"interview"|"final"|"offer"|"rejected"|"bookmarked",
  "applied": "YYYY-MM-DD" or "",
  "salary": string or "",
  "location": string or "",
  "url": string or "",
  "notes": "1 sentence summary",
  "email_subject": string,
  "email_date": string
}

Stage detection from subject/snippet:
- "thank you for applying", "application received", "received your application" → applied
- "phone screen", "phone call", "recruiter", "introductory call" → phone
- "interview", "technical", "coding challenge", "assessment" → interview
- "final round", "onsite", "final interview", "last round" → final
- "offer", "congratulations", "pleased to offer", "we would like to offer" → offer
- "unfortunately", "not moving forward", "other candidates", "regret", "position filled" → rejected

Skip newsletters, job alerts, promotions. Only include actual application-related emails.
"""


def parse_single(text: str) -> dict:
    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=600,
        system=EXTRACT_SYSTEM,
        messages=[{"role": "user", "content": text}]
    )
    raw = message.content[0].text.strip().replace("```json","").replace("```","").strip()
    parsed = json.loads(raw)
    if not parsed.get("company"):
        raise ValueError("Could not extract company name")
    return parsed


def parse_batch(emails: list[dict]) -> list[dict]:
    """Parse all emails in ONE API call using subject+snippet only (cheap & fast)."""
    if not emails:
        return []

    print(f"  Building optimized batch for {len(emails)} emails (subject+snippet only)...")

    # Build compact email list — subject + sender + date + first 200 chars only
    lines = []
    for i, email in enumerate(emails, 1):
        snippet = (email.get('body','') or email.get('snippet','')).strip()[:200]
        lines.append(
            f"[{i}] Date:{email.get('date','')} | From:{email.get('from','')} | "
            f"Subject:{email.get('subject','')} | Snippet:{snippet}"
        )

    combined = "\n".join(lines)
    print(f"  Sending {len(combined)} chars to Claude in 1 API call...")

    try:
        message = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=4000,
            system=BATCH_SYSTEM,
            messages=[{"role": "user", "content": combined}]
        )
        raw = message.content[0].text.strip()
        raw = raw.replace("```json","").replace("```","").strip()

        # Find JSON array
        start = raw.find("[")
        end   = raw.rfind("]") + 1
        if start == -1 or end == 0:
            print("  No JSON array in response")
            return []

        parsed = json.loads(raw[start:end])
        if not isinstance(parsed, list):
            return []

        valid = [p for p in parsed if p.get("company")]
        print(f"  ✓ Single API call extracted {len(valid)} job applications from {len(emails)} emails")
        return valid

    except json.JSONDecodeError as e:
        print(f"  JSON parse error: {e}")
        # Fallback to chunked if single call fails
        print("  Falling back to chunked parsing...")
        return _parse_batch_chunked(emails)
    except Exception as e:
        print(f"  Batch parse error: {e}")
        return []


def _parse_batch_chunked(emails: list[dict]) -> list[dict]:
    """Fallback: process in chunks of 15 if single call fails."""
    all_parsed = []
    chunks = [emails[i:i+15] for i in range(0, len(emails), 15)]
    for i, chunk in enumerate(chunks, 1):
        try:
            lines = []
            for j, email in enumerate(chunk, 1):
                snippet = (email.get('body','') or email.get('snippet','')).strip()[:200]
                lines.append(f"[{j}] Date:{email.get('date','')} | From:{email.get('from','')} | Subject:{email.get('subject','')} | Snippet:{snippet}")
            message = client.messages.create(
                model="claude-sonnet-4-5",
                max_tokens=2000,
                system=BATCH_SYSTEM,
                messages=[{"role": "user", "content": "\n".join(lines)}]
            )
            raw = message.content[0].text.strip().replace("```json","").replace("```","").strip()
            start = raw.find("["); end = raw.rfind("]")+1
            if start == -1: continue
            parsed = json.loads(raw[start:end])
            if isinstance(parsed, list):
                all_parsed.extend([p for p in parsed if p.get("company")])
            print(f"  Chunk {i}/{len(chunks)}: extracted {len(parsed)} apps")
        except Exception as e:
            print(f"  Chunk {i} error: {e}")
            continue
    return all_parsed
