"""Analytics endpoints — post-meeting reports and live SSE stream.

All TimescaleDB queries go through asyncpg (via timescale_writer.get_pool).
"""
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from app.utils.timescale_writer import get_pool
from app.models.db import get_mongo_db
import json
import asyncio
from datetime import datetime

router = APIRouter()


@router.get("/meeting/{meeting_id}")
async def get_meeting_analytics(meeting_id: str):
    """Get post-meeting analytics from TimescaleDB."""
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
                WHERE meeting_id = $1
                GROUP BY bucket
                ORDER BY bucket;
            """, meeting_id)
            timeline = [dict(r) for r in timeline_rows]

            # Per-participant averages
            part_rows = await conn.fetch("""
                SELECT
                    participant_id,
                    AVG(final_score)       AS avg_score,
                    AVG(visual_score)      AS avg_visual,
                    AVG(behavioral_score)  AS avg_behavioral,
                    AVG(audio_score)       AS avg_audio,
                    COUNT(*)              AS total_events
                FROM focus_events
                WHERE meeting_id = $1
                GROUP BY participant_id;
            """, meeting_id)
            participants = [dict(r) for r in part_rows]

            # Lowest-engagement segments
            low_rows = await conn.fetch("""
                SELECT
                    time_bucket('2 minutes', recorded_at) AS segment,
                    AVG(final_score) AS avg_score
                FROM focus_events
                WHERE meeting_id = $1
                GROUP BY segment
                ORDER BY avg_score ASC
                LIMIT 5;
            """, meeting_id)
            low_segments = [dict(r) for r in low_rows]

        # Moderation logs from MongoDB
        mongo_db = get_mongo_db()
        moderation_logs: list[dict] = []
        if mongo_db:
            cursor = mongo_db.moderationlogs.find(
                {"meetingId": meeting_id}
            ).sort("createdAt", -1)
            async for log in cursor:
                log["_id"] = str(log["_id"])
                moderation_logs.append(log)

        return {
            "meeting_id": meeting_id,
            "timeline": timeline,
            "participants": participants,
            "low_engagement_segments": low_segments,
            "moderation_logs": moderation_logs,
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/meeting/{meeting_id}/stream")
async def stream_meeting_analytics(meeting_id: str, request: Request):
    """
    Server-to-client only (SSE).  This endpoint never accepts data from
    clients.  Host control commands travel via Socket.IO exclusively.
    """

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
                    """, meeting_id)

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
async def get_focus_heatmap(meeting_id: str):
    """Generate focus heatmap data for post-meeting report."""
    try:
        pool = await get_pool()
    except Exception:
        return {"error": "TimescaleDB not connected"}

    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT
                    participant_id,
                    time_bucket('1 minute', recorded_at) AS minute,
                    AVG(final_score) AS avg_score
                FROM focus_events
                WHERE meeting_id = $1
                GROUP BY participant_id, minute
                ORDER BY participant_id, minute;
            """, meeting_id)
            heatmap = [dict(r) for r in rows]

        return {"meeting_id": meeting_id, "heatmap": heatmap}
    except Exception as e:
        return {"error": str(e)}
