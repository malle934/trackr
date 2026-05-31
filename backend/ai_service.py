import os
import json
import re
import google.generativeai as genai

# Configure Gemini
genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))
model = genai.GenerativeModel("gemini-2.5-flash")

BATCH_SYSTEM = """You extract job application details from email subjects and snippets.
Return ONLY a valid JSON array. No markdown, no backticks, no explanation.

Each object must have:
{
  "company":       "Company name (required)",
  "title":         "Job title or role",
  "stage":         "applied|phone|interview|final|offer|rejected",
  "applied":       "YYYY-MM-DD date or empty string",
  "salary":        "salary string or empty",
  "location":      "location or empty",
  "url":           "job URL or empty",
  "notes":         "1 sentence summary",
  "email_subject": "original subject line",
  "email_date":    "YYYY-MM-DD"
}

Stage detection rules:
- application received / thank you for applying → "applied"
- phone screen / recruiter call / introductory call → "phone"  
- interview scheduled / technical round / coding challenge → "interview"
- final round / onsite / last round → "final"
- offer letter / congratulations / pleased to offer → "offer"
- unfortunately / not selected / regret / not moving forward → "rejected"

Skip non-job emails. Return empty array [] if none are job-related.
"""

SINGLE_SYSTEM = """Extract job application details from this text.
Return ONLY valid JSON object. No markdown, no backticks.
Fields: company, title, stage(applied/phone/interview/final/offer/rejected),
applied(YYYY-MM-DD or ""), salary, location, url, notes.
"""


def parse_single(text: str) -> dict:
    """Parse a single pasted email using Gemini."""
    response = model.generate_content(SINGLE_SYSTEM + "\n\n" + text)
    raw = response.text.strip().replace("```json","").replace("```","").strip()
    parsed = json.loads(raw)
    if not parsed.get("company"):
        raise ValueError("Could not extract company name")
    return parsed


def parse_batch(emails: list[dict]) -> list[dict]:
    """
    Parse job emails using Gemini.
    Emails already keyword-filtered — these are all job-related.
    Process in chunks of 50 to stay within token limits.
    """
    if not emails:
        return []

    print(f"  Parsing {len(emails)} job emails with Gemini...")
    all_parsed = []
    chunk_size = 50
    chunks     = [emails[i:i+chunk_size] for i in range(0, len(emails), chunk_size)]

    for idx, chunk in enumerate(chunks, 1):
        try:
            lines = []
            for i, e in enumerate(chunk, 1):
                lines.append(
                    f"[{i}] Date:{e.get('date','')} | "
                    f"From:{e.get('from','')} | "
                    f"Subject:{e.get('subject','')} | "
                    f"Snippet:{e.get('snippet','')[:200]}"
                )

            prompt   = BATCH_SYSTEM + "\n\nEmails:\n" + "\n".join(lines)
            response = model.generate_content(prompt)
            raw      = response.text.strip()
            raw      = raw.replace("```json","").replace("```","").strip()

            # Extract JSON array from response
            start = raw.find("[")
            end   = raw.rfind("]") + 1
            if start == -1 or end == 0:
                print(f"  Chunk {idx}: no JSON array — skipping")
                continue

            parsed = json.loads(raw[start:end])
            if isinstance(parsed, list):
                valid = [p for p in parsed if p.get("company")]
                all_parsed.extend(valid)
                print(f"  Chunk {idx}/{len(chunks)}: extracted {len(valid)} apps")

        except json.JSONDecodeError as e:
            print(f"  Chunk {idx} JSON error: {e}")
            continue
        except Exception as e:
            print(f"  Chunk {idx} error: {e}")
            continue

    print(f"  ✓ Gemini extracted {len(all_parsed)} job apps from {len(emails)} emails")
    return all_parsed