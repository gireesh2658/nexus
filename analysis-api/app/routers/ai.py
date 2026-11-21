import os
import re
import json
import logging
import asyncio
import urllib.parse
from datetime import datetime
from fastapi import APIRouter, HTTPException, BackgroundTasks
import asyncpg
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)
router = APIRouter()

def get_gemini_config():
    """Retrieve Gemini configuration securely from environment."""
    api_key = os.getenv("GEMINI_API_KEY")
    model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
    return api_key, model

def clean_pg_url(url: str) -> str:
    """Strip unsupported query parameters like ?schema=public that cause asyncpg errors."""
    if not url:
        return url
    parsed = urllib.parse.urlparse(url)
    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, parsed.path, '', '', ''))

async def get_app_pool():
    """Create asyncpg connection pool for app database with cleaned DSN."""
    db_url = os.getenv("APP_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("Neither APP_DATABASE_URL nor DATABASE_URL environment variable is set.")
    clean_url = clean_pg_url(db_url)
    return await asyncpg.create_pool(dsn=clean_url, min_size=1, max_size=5)

def sanitize_error(error_message: str) -> str:
    """Ensure secrets or tokens are never exposed in persisted error messages."""
    api_key, _ = get_gemini_config()
    sanitized = str(error_message)
    if api_key and len(api_key) > 8:
        sanitized = sanitized.replace(api_key, "[REDACTED_API_KEY]")
    # Redact common credential patterns (e.g. AIza..., passwords)
    sanitized = re.sub(r'AIza[0-9A-Za-z-_]{35}', '[REDACTED_KEY]', sanitized)
    sanitized = re.sub(r':\/\/[^:]+:[^@]+@', '://[REDACTED_USER]:[REDACTED_PW]@', sanitized)
    return sanitized

async def call_gemini_summary(transcripts: list) -> tuple[str, list, list, str, str]:
    """
    Invoke Google Gemini API to generate structured meeting intelligence.
    Returns (summary_text, decisions, action_items, follow_up_email, model_used).
    """
    api_key, model_name = get_gemini_config()
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not configured in the environment.")

    # Format transcript with relative timestamps
    min_start = transcripts[0]['startTimeMs'] if transcripts and transcripts[0]['startTimeMs'] else 0
    formatted_lines = []
    for r in transcripts:
        start_ms = r.get('startTimeMs') or 0
        rel_ms = max(0, start_ms - min_start)
        mins = int(rel_ms // 60000)
        secs = int((rel_ms % 60000) // 1000)
        formatted_lines.append(f"[{mins:02d}:{secs:02d}] {r['participantId']}: {r['text']}")

    transcript_text = "\n".join(formatted_lines)

    prompt = f"""You are the Nexus Meeting Intelligence Engine.
Analyze the following transcript of an engineering/product sync meeting.
Provide a factual, accurate, and structured debrief.
Do not fabricate information, participants, or deadlines that are not supported by the transcript.
Explicitly represent missing or unresolved points.

Meeting Transcript:
{transcript_text}

Respond ONLY with a valid JSON object matching this exact schema:
{{
  "executiveSummary": "A concise paragraph summarizing the primary meeting focus, participants, and context.",
  "keyHighlights": [
    "Discussion highlight 1",
    "Discussion highlight 2"
  ],
  "decisions": [
    "Confirmed decision or agreement"
  ],
  "actionItems": [
    {{
      "task": "Concrete task description",
      "owner": "Participant identity or owner name",
      "deadline": "Stated deadline or 'Next sync'"
    }}
  ],
  "openQuestions": [
    "Any unresolved questions mentioned"
  ],
  "followUpEmail": "Subject: Meeting Recap & Next Steps\\n\\nHi team,\\n\\n..."
}}
"""

    # Configure SDK with 45s timeout and attempts=1 to prevent multiplicative retries underneath our explicit application loop
    http_opts = types.HttpOptions(
        timeout=45000,
        retry_options=types.HttpRetryOptions(attempts=1)
    )
    client = genai.Client(api_key=api_key, http_options=http_opts)
    logger.info(f"Calling Gemini API with model {model_name} (bounded retries: max 3 attempts)...")

    # Resilient retry loop with backoff for transient 503 (high demand) or 429 (rate limit)
    max_retries = 3
    response = None
    start_total = asyncio.get_event_loop().time()
    for attempt in range(max_retries):
        t0 = asyncio.get_event_loop().time()
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.2,
                )
            )
            attempt_latency = asyncio.get_event_loop().time() - t0
            total_latency = asyncio.get_event_loop().time() - start_total
            logger.info(f"Gemini API attempt {attempt + 1} succeeded in {attempt_latency:.2f}s (total: {total_latency:.2f}s)")
            break
        except Exception as err:
            attempt_latency = asyncio.get_event_loop().time() - t0
            err_str = str(err)
            is_transient = (
                "503" in err_str or "504" in err_str or "502" in err_str or "429" in err_str 
                or "deadline" in err_str.lower() or "timeout" in err_str.lower() 
                or "high demand" in err_str.lower() or "unavailable" in err_str.lower()
            )
            if is_transient and attempt < max_retries - 1:
                backoff_sec = (attempt + 1) * 2.0
                logger.warning(f"Gemini API transient error on attempt {attempt + 1} after {attempt_latency:.2f}s: {sanitize_error(err_str)}. Retrying in {backoff_sec}s...")
                await asyncio.sleep(backoff_sec)
            else:
                total_latency = asyncio.get_event_loop().time() - start_total
                logger.error(f"Gemini API terminal failure after {attempt + 1} attempts ({total_latency:.2f}s total): {sanitize_error(err_str)}")
                raise

    if not response.text:
        raise ValueError("Gemini returned an empty response.")

    try:
        data = json.loads(response.text)
    except json.JSONDecodeError as err:
        raise ValueError(f"Failed to parse Gemini JSON response: {err}")

    # Build presentation summary_text
    exec_summary = data.get("executiveSummary", "").strip()
    highlights = data.get("keyHighlights", [])
    highlights_bulleted = "\n".join([f"• {h}" for h in highlights]) if highlights else "• None noted."
    
    summary_text = (
        f"Executive Summary:\n{exec_summary}\n\n"
        f"Key Highlights:\n{highlights_bulleted}"
    )

    decisions = [str(d) for d in data.get("decisions", [])]
    action_items = data.get("actionItems", [])
    follow_up_email = data.get("followUpEmail", "")
    model_used = f"gemini/{model_name}"

    return summary_text, decisions, action_items, follow_up_email, model_used

async def generate_summary_task(meeting_id: str):
    """Background task to generate the Gemini AI summary for a meeting idempotently."""
    try:
        pool = await get_app_pool()
    except Exception as e:
        logger.error(f"Failed to connect to database in generate_summary_task: {e}")
        return

    try:
        async with pool.acquire() as conn:
            # 1. Resolve canonical Meeting.id (UUID) if roomCode was passed
            m_row = await conn.fetchrow(
                'SELECT "id" FROM "Meeting" WHERE "id"::text = $1 OR "roomCode" = $1',
                meeting_id
            )
            canonical_meeting_id = m_row['id'] if m_row else meeting_id

            # 2. Atomically claim processing ownership (idempotency safeguard)
            row = await conn.fetchrow("""
                UPDATE "MeetingSummary"
                SET status = 'PROCESSING', "startedAt" = NOW()
                WHERE "meetingId" = $1 AND status IN ('PENDING', 'RETRYABLE')
                RETURNING id, "retryCount"
            """, canonical_meeting_id)

            if not row:
                logger.info(f"Summary for {canonical_meeting_id} already PROCESSING, COMPLETED, or not found.")
                return

            summary_id = row['id']
            retry_count = row['retryCount']

            try:
                # 3. Query transcripts for this meeting
                transcripts = await conn.fetch("""
                    SELECT "participantId", text, "startTimeMs", "endTimeMs"
                    FROM "Transcription" 
                    WHERE "meetingId" = $1 
                    ORDER BY "startTimeMs" ASC
                """, canonical_meeting_id)

                if not transcripts:
                    logger.info(f"No transcripts found for meeting {canonical_meeting_id}. Marking COMPLETED.")
                    await conn.execute("""
                        UPDATE "MeetingSummary"
                        SET status = 'COMPLETED',
                            "completedAt" = NOW(),
                            "summaryText" = 'No transcripts available to summarize.',
                            decisions = ARRAY[]::text[],
                            "actionItems" = ARRAY[]::jsonb[],
                            "followUpEmail" = NULL,
                            "modelUsed" = 'none (no transcripts)',
                            "lastError" = NULL
                        WHERE id = $1
                    """, summary_id)
                    return

                # 4. Call Gemini API for real LLM summarization
                summary_text, decisions, action_items, follow_up_email, model_used = await call_gemini_summary(transcripts)

                # 5. Persist completed Gemini summary
                action_items_jsonb = [json.dumps(a) for a in action_items]
                await conn.execute("""
                    UPDATE "MeetingSummary"
                    SET status = 'COMPLETED',
                        "completedAt" = NOW(),
                        "summaryText" = $1,
                        decisions = $2,
                        "actionItems" = $3::jsonb[],
                        "followUpEmail" = $4,
                        "modelUsed" = $5,
                        "lastError" = NULL
                    WHERE id = $6
                """, summary_text, decisions, action_items_jsonb, follow_up_email, model_used, summary_id)
                logger.info(f"Gemini summary for meeting {canonical_meeting_id} COMPLETED successfully with model {model_used}.")

            except Exception as e:
                sanitized_msg = sanitize_error(str(e))
                logger.error(f"Gemini summary generation failed for {canonical_meeting_id}: {sanitized_msg}")
                new_status = 'RETRYABLE' if retry_count < 3 else 'FAILED'
                await conn.execute("""
                    UPDATE "MeetingSummary"
                    SET status = $1, "failedAt" = NOW(), "lastError" = $2, "retryCount" = "retryCount" + 1
                    WHERE id = $3
                """, new_status, sanitized_msg, summary_id)
    finally:
        await pool.close()

@router.post("/summarize/{meeting_id}")
async def trigger_summarize(meeting_id: str, background_tasks: BackgroundTasks):
    """
    Endpoint triggered when a meeting ends.
    Initiates the background summarization task using Gemini API.
    """
    background_tasks.add_task(generate_summary_task, meeting_id)
    return {"message": "Gemini summarization task triggered", "meeting_id": meeting_id}
