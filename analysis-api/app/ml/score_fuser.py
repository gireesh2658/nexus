"""Fuses behavioral, visual, and audio scores into a final focus metric."""
from app.models.schemas import FocusScoreResult
from app.utils.timescale_writer import write_focus_event, get_pool
from app.models.db import get_mongo_db
import os
import redis
import json
from datetime import datetime, timezone

redis_url = os.getenv("REDIS_URL")
redis_cache = None
if redis_url:
    # Redis client to read cached visual/audio scores
    redis_cache = redis.Redis.from_url(
        redis_url,
        decode_responses=True,
    )
else:
    import logging
    logging.warning("REDIS_URL missing. Score fuser will fall back to default neutral scores.")

# ── Fusion formulas ──────────────────────────────────────────────────────────
#  cam-on:  visual × 0.44  +  behavioral × 0.39  +  audio × 0.17  = 1.00
#  cam-off: behavioral × 0.80  +  audio × 0.20                     = 1.00
#  audio sub-formula:  speaking_ratio × 0.60  +  latency_score × 0.40 = 1.00

W_VIS, W_BEH_ON, W_AUD_ON = 0.44, 0.39, 0.17
W_BEH_OFF, W_AUD_OFF       = 0.80, 0.20
W_SPEAK, W_LATENCY          = 0.60, 0.40   # audio sub-weights


def fuse_cam_on(v: float, b: float, a: float) -> float:
    """Camera-on fusion → returns value in 0-100 range."""
    return (v * W_VIS + b * W_BEH_ON + a * W_AUD_ON) * 100


def fuse_cam_off(b: float, a: float) -> float:
    """Camera-off fusion → returns value in 0-100 range."""
    return (b * W_BEH_OFF + a * W_AUD_OFF) * 100


# ── Baseline calibration ────────────────────────────────────────────────────

async def get_or_create_baseline(participant_id: str, meeting_id: str) -> float | None:
    """Return the stored baseline_final, creating it from the first 30 s of
    calibration rows if it doesn't yet exist."""
    try:
        pool = await get_pool()
    except Exception:
        return None

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT baseline_final FROM participant_baselines "
            "WHERE participant_id = $1 AND meeting_id = $2",
            participant_id, meeting_id,
        )
        if row:
            return float(row["baseline_final"])

        avg_row = await conn.fetchrow(
            """SELECT AVG(visual_score)      AS avg_v,
                      AVG(behavioral_score)  AS avg_b,
                      AVG(audio_score)       AS avg_a,
                      AVG(final_score)       AS avg_f,
                      COUNT(*)               AS cnt
               FROM focus_events
               WHERE participant_id = $1
                 AND meeting_id     = $2
                 AND is_calibration = TRUE""",
            participant_id, meeting_id,
        )

        if avg_row and avg_row["avg_f"] is not None and avg_row["cnt"] >= 3:
            baseline_final = float(avg_row["avg_f"])
            await conn.execute(
                """INSERT INTO participant_baselines
                       (participant_id, meeting_id, baseline_visual,
                        baseline_behav, baseline_audio, baseline_final, sample_count)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)
                   ON CONFLICT (participant_id, meeting_id) DO NOTHING""",
                participant_id, meeting_id,
                float(avg_row["avg_v"]), float(avg_row["avg_b"]),
                float(avg_row["avg_a"]), baseline_final, int(avg_row["cnt"]),
            )
            return baseline_final
    return None


# ── Main entry point ─────────────────────────────────────────────────────────

async def fuse_scores(
    participant_id: str,
    meeting_id: str,
    behavioral_score: float,
    elapsed_secs: float,
) -> FocusScoreResult | None:
    """Fuse real-time signals into a 0-100 focus score and persist it."""

    # Consent gate (skip if Mongo is unavailable — allows standalone dev)
    db = get_mongo_db()
    if db is not None:
        participant = await db.participants.find_one(
            {"meetingId": meeting_id, "userId": participant_id}
        )
        if participant and not participant.get("consentGiven", False):
            return None

    # ── Read cached sub-scores from Redis ────────────────────────────────
    visual_score = 0.5   # neutral default when camera is off
    audio_score  = 1.0   # assume engaged if no audio penalty
    cam_active   = False

    try:
        if redis_cache:
            raw = redis_cache.get(f"visual_score:{meeting_id}:{participant_id}")
            if raw:
                visual_score = json.loads(raw)["score"]
                cam_active = True
    except Exception:
        pass

    try:
        if redis_cache:
            raw = redis_cache.get(f"audio_score:{meeting_id}:{participant_id}")
            if raw:
                audio_score = json.loads(raw)["score"]
    except Exception:
        pass

    # ── Fusion ───────────────────────────────────────────────────────────
    if cam_active:
        raw_score = fuse_cam_on(visual_score, behavioral_score, audio_score)
    else:
        raw_score = fuse_cam_off(behavioral_score, audio_score)

    # ── Baseline normalization ───────────────────────────────────────────
    is_calibration = elapsed_secs < 30.0

    if not is_calibration:
        baseline = await get_or_create_baseline(participant_id, meeting_id)
        if baseline and baseline > 0:
            # Centre around 50: score == baseline → 50
            raw_score = ((raw_score - baseline) / max(1.0, baseline)) * 50 + 50

    final_percentage = min(100, max(0, int(round(raw_score))))

    result = FocusScoreResult(
        meeting_id=meeting_id,
        participant_id=participant_id,
        recorded_at=datetime.now(timezone.utc),
        final_score=final_percentage,
        behavioral_score=int(behavioral_score * 100),
        visual_score=int(visual_score * 100),
        audio_score=int(audio_score * 100),
        face_present=cam_active,
    )

    await write_focus_event(result, is_calibration=is_calibration)
    return result
