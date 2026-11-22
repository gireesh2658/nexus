import json
import asyncio
import logging
from typing import List, Dict, Any
from fastapi import APIRouter
import asyncpg
from app.utils.timescale_writer import get_pool

router = APIRouter()
logger = logging.getLogger(__name__)

class TelemetryBatcher:
    def __init__(self, max_queue_size=10000, batch_size=500, flush_interval_sec=2.0):
        self.queue = asyncio.Queue(maxsize=max_queue_size)
        self.batch_size = batch_size
        self.flush_interval_sec = flush_interval_sec
        self.pool = None
        self._flush_task = None

    async def start(self):
        self.pool = await get_pool()
        self._flush_task = asyncio.create_task(self._flush_loop())
        logger.info("Telemetry batcher started")

    async def stop(self):
        if self._flush_task:
            self._flush_task.cancel()
        if self.pool:
            await self.pool.close()
        logger.info("Telemetry batcher stopped")

    def enqueue(self, payload: Dict[str, Any]) -> bool:
        """Enqueue telemetry. Returns False if dropped due to overload."""
        try:
            self.queue.put_nowait(payload)
            return True
        except asyncio.QueueFull:
            logger.warning("Telemetry queue full! Dropping event to prevent memory exhaustion.")
            return False

    async def _flush_loop(self):
        while True:
            try:
                await asyncio.sleep(self.flush_interval_sec)
                await self._flush_batch()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in telemetry flush loop: {e}")
                # Wait briefly before retrying to prevent hot loop on DB down
                await asyncio.sleep(1.0)

    async def _flush_batch(self):
        if self.queue.empty():
            return

        batch = []
        while not self.queue.empty() and len(batch) < self.batch_size:
            batch.append(self.queue.get_nowait())
            self.queue.task_done()

        if not batch:
            return

        if not self.pool:
            logger.error("No database pool available. Dropping batch.")
            return

        # 1. Persist raw payloads to meeting_telemetry hypertable
        try:
            async with self.pool.acquire() as conn:
                def to_jsonb(p):
                    if isinstance(p, (dict, list)):
                        return json.dumps(p)
                    return str(p) if p is not None else "{}"

                formatted_records = [
                    (str(item.get('meeting_id', '')), str(item.get('participant_id', '')), to_jsonb(item.get('payload')))
                    for item in batch
                ]

                await conn.executemany(
                    """
                    INSERT INTO meeting_telemetry (meeting_id, participant_id, payload)
                    VALUES ($1, $2, $3::jsonb)
                    """,
                    formatted_records
                )
                logger.debug("Successfully persisted %d raw records to meeting_telemetry", len(formatted_records))
        except asyncpg.exceptions.PostgresError as e:
            logger.error("Database error during meeting_telemetry batch insert (%d records): %s", len(batch), e)
        except Exception as e:
            logger.error("Unexpected error during meeting_telemetry flush: %s", e)

        # 2. Extract and persist analytical metrics to focus_events (isolated from raw telemetry failures)
        try:
            focus_records = []
            for item in batch:
                payload = item.get('payload') or {}
                if isinstance(payload, dict) and ('focus_score' in payload or 'final_score' in payload):
                    f_score = payload.get('final_score')
                    if f_score is None and 'focus_score' in payload:
                        f_score = int(float(payload['focus_score']) * 100)
                    f_score = max(0, min(100, int(f_score))) if f_score is not None else 50
                    focus_records.append((
                        str(item.get('participant_id', 'unknown')),
                        str(item.get('meeting_id', 'unknown')),
                        float(payload.get('visual_score', payload.get('focus_score', 0.5))),
                        float(payload.get('behavioral_score', 0.5)),
                        float(payload.get('audio_score', 0.5)),
                        f_score,
                        bool(payload.get('is_active', True)),
                        False
                    ))
            if focus_records:
                async with self.pool.acquire() as conn:
                    await conn.executemany(
                        """
                        INSERT INTO focus_events (participant_id, meeting_id, visual_score, behavioral_score, audio_score, final_score, face_present, is_calibration)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        """,
                        focus_records
                    )
                logger.debug("Successfully persisted %d metrics to focus_events", len(focus_records))
        except asyncpg.exceptions.PostgresError as e:
            logger.error("Database error during focus_events batch insert (%d records): %s", len(focus_records), e)
        except Exception as e:
            logger.error("Unexpected error during focus_events flush: %s", e)


batcher = TelemetryBatcher()

@router.on_event("startup")
async def startup_event():
    await batcher.start()

@router.on_event("shutdown")
async def shutdown_event():
    await batcher.stop()


