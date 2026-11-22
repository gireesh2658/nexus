"""Analytics endpoints — post-meeting reports and live SSE stream.

All TimescaleDB queries go through asyncpg (via timescale_writer.get_pool).
App DB queries for authorization go through a lazily cached asyncpg pool for APP_DATABASE_URL.
"""
from fastapi import APIRouter, Request, Depends, HTTPException
from app.utils.auth import verify_token as auth_token
from fastapi.responses import StreamingResponse
import json
import os
import asyncpg
from app.utils.timescale_writer import get_pool, clean_pg_url

import asyncio
from datetime import datetime

router = APIRouter()

_app_pool: asyncpg.Pool | None = None

async def get_app_pool() -> asyncpg.Pool:
    global _app_pool
    if _app_pool is None:
        app_db_url = os.getenv("APP_DATABASE_URL")
        if not app_db_url:
            raise ValueError("FATAL: APP_DATABASE_URL environment variable is missing.")
        clean_url = clean_pg_url(app_db_url)
        _app_pool = await asyncpg.create_pool(clean_url, min_size=1, max_size=5)
    return _app_pool

async def verify_meeting_access(meeting_id: str, user_payload: dict) -> tuple[str, str, bool]:
    """Verify user is host or participant in app DB.
    Returns (canonical_id, room_code, is_host).
    Raises HTTPException:
      401 if user_id is missing from token.
      404 if meeting not found.
      403 if user is not host or active participant.
    """
    user_id = user_payload.get("userId") or user_payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID missing from token")

    app_pool = await get_app_pool()
    async with app_pool.acquire() as conn:
        m_row = await conn.fetchrow(
            'SELECT "id"::text, "roomCode", "hostId"::text FROM "Meeting" WHERE "id"::text = $1 OR "roomCode" = $1',
            meeting_id
        )
        if not m_row:
            raise HTTPException(status_code=404, detail="Meeting not found")

        cid = m_row["id"]
        rcode = m_row["roomCode"]
        host_id = m_row["hostId"]
        is_host = (str(host_id) == str(user_id))

        if is_host:
            return cid, rcode, True

        p_row = await conn.fetchrow(
            'SELECT "id" FROM "Participant" WHERE "meetingId" = $1 AND "userId" = $2 AND "status" NOT IN (\'removed\', \'declined\')',
            cid, user_id
        )
        if not p_row:
            raise HTTPException(status_code=403, detail="Not authorized to access meeting analytics")

        return cid, rcode, False


@router.get("/meeting/{meeting_id}")
async def get_meeting_analytics(meeting_id: str, user_payload: dict = Depends(auth_token)):
    """Get post-meeting analytics from TimescaleDB."""
    cid, rcode, is_host = await verify_meeting_access(meeting_id, user_payload)

    try:
        pool = await get_pool()
    except Exception:
        return {"error": "TimescaleDB not connected"}

    try:
        async with pool.acquire() as conn:
            # Overall engagement timeline (30-second buckets)
            timeline_rows = await conn.fetch("""
                SELECT
                    time_bucket('30 seconds', recorded_at) AS bucket,
                    AVG(final_score)  AS avg_score,
                    MIN(final_score)  AS min_score,
                    MAX(final_score)  AS max_score,
                    COUNT(*)          AS sample_count
                FROM focus_events
                WHERE meeting_id = $1 OR meeting_id = $2
                GROUP BY bucket
                ORDER BY bucket;
            """, cid, rcode)
            timeline = [dict(r) for r in timeline_rows]

            # Lowest-engagement segments
            low_rows = await conn.fetch("""
                SELECT
                    time_bucket('2 minutes', recorded_at) AS segment,
                    AVG(final_score) AS avg_score
                FROM focus_events
                WHERE meeting_id = $1 OR meeting_id = $2
                GROUP BY segment
                ORDER BY avg_score ASC
                LIMIT 5;
            """, cid, rcode)
            low_segments = [dict(r) for r in low_rows]

            result = {
                "meeting_id": meeting_id,
                "timeline": timeline,
                "low_engagement_segments": low_segments,
            }

            # Per-participant averages only for the host
            if is_host:
                part_rows = await conn.fetch("""
                    SELECT
                        participant_id,
                        AVG(final_score)       AS avg_score,
                        AVG(visual_score)      AS avg_visual,
                        AVG(behavioral_score)  AS avg_behavioral,
                        AVG(audio_score)       AS avg_audio,
                        COUNT(*)              AS total_events
                    FROM focus_events
                    WHERE meeting_id = $1 OR meeting_id = $2
                    GROUP BY participant_id;
                """, cid, rcode)
                result["participants"] = [dict(r) for r in part_rows]

            return result
    except Exception as e:
        return {"error": str(e)}


@router.get("/meeting/{meeting_id}/stream")
async def stream_meeting_analytics(meeting_id: str, request: Request, user_payload: dict = Depends(auth_token)):
    """
    Server-to-client only (SSE).  This endpoint never accepts data from
    clients.  Host control commands travel via Socket.IO exclusively.
    """
    cid, rcode, is_host = await verify_meeting_access(meeting_id, user_payload)

    async def event_generator():
        while True:
            if await request.is_disconnected():
                break

            try:
                pool = await get_pool()
                async with pool.acquire() as conn:
                    row = await conn.fetchrow("""
                        SELECT
                            AVG(final_score)              AS room_avg,
                            COUNT(DISTINCT participant_id) AS active_participants
                        FROM focus_events
                        WHERE meeting_id = $1
                          AND recorded_at > NOW() - INTERVAL '30 seconds';
                    """, cid)

                    if row and row["room_avg"] is not None:
                        data = {
                            "room_avg": round(float(row["room_avg"]), 1),
                            "active_participants": row["active_participants"],
                            "timestamp": datetime.utcnow().isoformat(),
                        }
                        yield f"data: {json.dumps(data)}\n\n"
            except Exception as e:
                import logging
                logging.error("Error in SSE stream for meeting %s: %s", meeting_id, e)

            await asyncio.sleep(5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.get("/meeting/{meeting_id}/heatmap")
async def get_focus_heatmap(meeting_id: str, user_payload: dict = Depends(auth_token)):
    """Generate focus heatmap data for post-meeting report."""
    cid, rcode, is_host = await verify_meeting_access(meeting_id, user_payload)

    try:
        pool = await get_pool()
    except Exception:
        return {"error": "TimescaleDB not connected"}

    try:
        async with pool.acquire() as conn:
            if is_host:
                rows = await conn.fetch("""
                    SELECT
                        participant_id,
                        time_bucket('1 minute', recorded_at) AS minute,
                        AVG(final_score) AS avg_score
                    FROM focus_events
                    WHERE meeting_id = $1 OR meeting_id = $2
                    GROUP BY participant_id, minute
                    ORDER BY participant_id, minute;
                """, cid, rcode)
            else:
                rows = await conn.fetch("""
                    SELECT
                        time_bucket('1 minute', recorded_at) AS minute,
                        AVG(final_score) AS avg_score
                    FROM focus_events
                    WHERE meeting_id = $1 OR meeting_id = $2
                    GROUP BY minute
                    ORDER BY minute;
                """, cid, rcode)
            heatmap = [dict(r) for r in rows]

        return {"meeting_id": meeting_id, "heatmap": heatmap}
    except Exception as e:
        return {"error": str(e)}
