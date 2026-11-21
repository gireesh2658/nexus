"""TimescaleDB writer — async writes using asyncpg connection pool."""
from app.models.schemas import FocusScoreResult
import asyncpg
import os
import logging

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None

import urllib.parse

def clean_pg_url(url: str) -> str:
    if not url:
        return url
    parsed = urllib.parse.urlparse(url)
    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, parsed.path, '', '', ''))

async def get_pool() -> asyncpg.Pool:
    """Get or create the asyncpg connection pool."""
    global _pool
    if _pool is None:
        timescale_url = os.getenv("TELEMETRY_DATABASE_URL")
        if not timescale_url:
            raise ValueError("FATAL: TELEMETRY_DATABASE_URL environment variable is missing.")
        clean_url = clean_pg_url(timescale_url)
        _pool = await asyncpg.create_pool(clean_url, min_size=2, max_size=10)
    return _pool

async def init_timescale():
    """Initialize TimescaleDB schema (called once at startup)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # 1. Initialize meeting_telemetry hypertable
        await conn.execute("""
            CREATE EXTENSION IF NOT EXISTS timescaledb;

            CREATE TABLE IF NOT EXISTS meeting_telemetry (
                recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                meeting_id      TEXT NOT NULL,
                participant_id  TEXT NOT NULL,
                payload         JSONB NOT NULL
            );
        """)
        try:
            await conn.execute("SELECT create_hypertable('meeting_telemetry', 'recorded_at', if_not_exists => TRUE);")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_payload_gin ON meeting_telemetry USING GIN (payload);")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_meeting_time ON meeting_telemetry (meeting_id, recorded_at DESC);")
        except Exception as e:
            logger.info("TimescaleDB meeting_telemetry hypertable/indexes already exist: %s", e)

        # 2. Initialize focus_events hypertable
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS focus_events (
                focus_id        BIGSERIAL,
                participant_id  VARCHAR(128) NOT NULL,
                meeting_id      VARCHAR(128) NOT NULL,
                visual_score    FLOAT,
                behavioral_score FLOAT,
                audio_score     FLOAT,
                final_score     INTEGER NOT NULL CHECK (final_score >= 0 AND final_score <= 100),
                face_present    BOOLEAN DEFAULT TRUE,
                is_calibration  BOOLEAN DEFAULT FALSE,
                recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        
        # Try to create hypertable and configure policies
        try:
            await conn.execute("SELECT create_hypertable('focus_events', 'recorded_at', if_not_exists => TRUE);")
            
            # Enable columnstore compression before attaching compression policy
            try:
                await conn.execute("""
                    ALTER TABLE focus_events SET (
                        timescaledb.compress,
                        timescaledb.compress_segmentby = 'meeting_id, participant_id',
                        timescaledb.compress_orderby = 'recorded_at DESC'
                    );
                """)
            except Exception as ce:
                logger.debug("Columnstore already enabled or unsupported: %s", ce)

            # Compression and Retention policies
            await conn.execute("SELECT add_compression_policy('focus_events', INTERVAL '7 days', if_not_exists => TRUE);")
            await conn.execute("SELECT add_retention_policy('focus_events', INTERVAL '90 days', if_not_exists => TRUE);")
        except Exception as e:
            logger.info("TimescaleDB focus_events hypertable/policies already exist or unavailable: %s", e)
        
        # Create composite index for efficient meeting queries
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_fe_meeting 
            ON focus_events (meeting_id, recorded_at DESC);
        """)
        
        # Create index for per-participant lookups
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_fe_participant
            ON focus_events (participant_id, meeting_id, recorded_at DESC);
        """)

        # Add participant_baselines table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS participant_baselines (
                id                BIGSERIAL    PRIMARY KEY,
                participant_id    VARCHAR(128) NOT NULL,
                meeting_id        VARCHAR(128) NOT NULL,
                baseline_visual   FLOAT        NOT NULL DEFAULT 0.0,
                baseline_behav    FLOAT        NOT NULL DEFAULT 0.0,
                baseline_audio    FLOAT        NOT NULL DEFAULT 0.0,
                baseline_final    FLOAT        NOT NULL DEFAULT 0.0,
                sample_count      INTEGER      NOT NULL DEFAULT 0,
                captured_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                UNIQUE (participant_id, meeting_id)
            );
        """)

async def write_focus_event(result: FocusScoreResult, is_calibration: bool = False):
    """Write a single focus event to TimescaleDB (non-blocking)."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO focus_events 
                    (participant_id, meeting_id, visual_score, behavioral_score, audio_score, final_score, face_present, is_calibration, recorded_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
            """,
                result.participant_id,
                result.meeting_id,
                result.visual_score,
                result.behavioral_score,
                result.audio_score,
                result.final_score,
                result.face_present,
                is_calibration,
                result.recorded_at,
            )
    except Exception as e:
        logger.error("Failed to write focus event for %s/%s: %s",
                     result.participant_id, result.meeting_id, e)

async def close_pool():
    """Close the asyncpg pool on shutdown."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
