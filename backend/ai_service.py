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
    """Parse all emails efficiently — subject+sender only, max 50 per call."""
    if not emails:
        return []

    print(f"  Processing {len(emails)} emails in optimized batches...")
    all_parsed = []

    # Split into chunks of 50 — subject+sender only = ~100 chars each = ~5000 chars per chunk
    chunk_size = 50
    chunks = [emails[i:i+chunk_size] for i in range(0, len(emails), chunk_size)]
    print(f"  Split into {len(chunks)} chunks of {chunk_size}")

    for idx, chunk in enumerate(chunks, 1):
        try:
            # Use ONLY subject + sender + date — no body/snippet at all
            lines = []
            for i, email in enumerate(chunk, 1):
                lines.append(
                    f"[{i}] {email.get('date','')} | {email.get('from','')} | {email.get('subject','')}"
                )
            combined = "\n".join(lines)
            print(f"  Chunk {idx}/{len(chunks)}: {len(combined)} chars, {len(chunk)} emails")

            message = client.messages.create(
                model="claude-sonnet-4-5",
                max_tokens=4000,
                system=BATCH_SYSTEM,
                messages=[{"role": "user", "content": combined}]
            )

            raw = message.content[0].text.strip()
            raw = raw.replace("```json","").replace("```","").strip()

            start = raw.find("[")
            end   = raw.rfind("]") + 1

            if start == -1 or end == 0:
                print(f"  Chunk {idx}: no JSON array found, skipping")
                continue

            parsed = json.loads(raw[start:end])
            if isinstance(parsed, list):
                valid = [p for p in parsed if p.get("company")]
                all_parsed.extend(valid)
                print(f"  Chunk {idx}: extracted {len(valid)} job applications")

        except json.JSONDecodeError as e:
            print(f"  Chunk {idx} JSON error: {e}, skipping")
            continue
        except Exception as e:
            print(f"  Chunk {idx} error: {e}, skipping")
            continue

    print(f"  ✓ Total extracted: {len(all_parsed)} job applications from {len(emails)} emails")
    return all_parsed