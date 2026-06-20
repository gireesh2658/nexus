"""Focus detection Celery worker."""
from app.workers.celery_app import celery_app
import os
import redis
import json
import logging

logger = logging.getLogger(__name__)

redis_url = os.getenv("REDIS_URL")
if not redis_url:
    raise ValueError("FATAL: REDIS_URL environment variable is missing.")

# Redis client for caching focus scores (DB 0 for Celery, but we can store fast-expiring keys here)
redis_cache = redis.Redis.from_url(redis_url, db=0)

@celery_app.task(name='focus.process_frame')
def process_frame_task(participant_id: str, meeting_id: str, frame_data: str):
    """Process one video frame through MediaPipe Face Mesh."""
    from app.ml.mediapipe_processor import process_frame
    
    result = process_frame(frame_data)
    
    # Cache the visual score in Redis so score_fuser can read it.
    # We use a short TTL (10 seconds) so if they turn off camera, the score resets.
    if result.get("face_present"):
        cache_key = f"visual_score:{meeting_id}:{participant_id}"
        try:
            redis_cache.setex(
                cache_key, 
                10, 
                json.dumps({"score": result["visual_score"]})
            )
        except Exception as e:
            logger.error("Failed to cache visual score: %s", e)
    
    return {
        "participant_id": participant_id,
        "meeting_id": meeting_id,
        **result,
    }
