"""Abuse detection Celery worker with ephemeral detectedText.
Two-stage pipeline: transcribe_audio → classify_toxicity.
"""
from app.workers.celery_app import celery_app
from pymongo import MongoClient, ReturnDocument
import os
import json
import redis
import logging

logger = logging.getLogger(__name__)

mongo_uri = os.getenv("MONGO_URI")
mongo_client = None
db = None
if mongo_uri:
    # Synchronous Clients for Celery Workers
    mongo_client = MongoClient(mongo_uri)
    db = mongo_client.get_database()
else:
    logger.warning("MONGO_URI missing. Abuse worker will not log moderation events.")

redis_url = os.getenv("REDIS_URL")
redis_pubsub = None
if redis_url:
    # Redis Pub/Sub client (DB 2 for signaling)
    redis_pubsub = redis.Redis.from_url(
        redis_url,
        db=int(os.getenv("SIGNAL_REDIS_DB", "2")),
    )
else:
    logger.warning("REDIS_URL missing. Abuse worker will not broadcast events.")


@celery_app.task(name='abuse.transcribe_audio')
def transcribe_audio_task(participant_id: str, meeting_id: str, audio_data: str):
    """Stage 1: Transcribe audio chunk using Whisper."""
    from app.ml.whisper_transcriber import transcribe_audio
    from app.utils.audio_converter import convert_audio_to_numpy

    audio_array = convert_audio_to_numpy(audio_data)

    # detectedText is ephemeral — NEVER stored in database
    text = transcribe_audio(audio_array)

    # Chain directly to Stage 2 if text exists
    if text:
        # Broadcast Live Subtitle
        subtitle_payload = {
            "meetingId": str(meeting_id),
            "participantId": str(participant_id),
            "text": text,
        }
        if redis_pubsub:
            redis_pubsub.publish("live_subtitles", json.dumps(subtitle_payload))

        classify_toxicity_task.delay({
            "participant_id": participant_id,
            "meeting_id": meeting_id,
            "text": text,  # ephemeral — passed to next task only
        })

    return {"status": "transcribed" if text else "empty"}


@celery_app.task(name='abuse.classify_toxicity')
def classify_toxicity_task(transcription_result: dict):
    """Stage 2: Classify toxicity using DistilBERT.
    CRITICAL: transcription text (detectedText) is garbage-collected after this task.
    """
    from app.ml.toxicity_classifier import classify_toxicity
    from bson.objectid import ObjectId
    import datetime

    text = transcription_result.get("text", "")
    meeting_id = transcription_result["meeting_id"]
    participant_id = transcription_result["participant_id"]

    result = classify_toxicity(text)

    # GDPR: immediately dispose of raw text
    del text

    if result["is_toxic"] and db is not None:
        try:
            # Query by userId field (participant_id IS the userId string in Nexus)
            participant = db.participants.find_one({
                "meetingId": ObjectId(meeting_id),
                "userId": ObjectId(participant_id),
            })

            if participant:
                user_id = participant.get("userId")
                # ATOMIC increment + read (ReturnDocument.AFTER)
                updated_user = db.users.find_one_and_update(
                    {"_id": user_id},
                    {"$inc": {"warnings": 1}},
                    return_document=ReturnDocument.AFTER,
                )
                warnings = updated_user.get("warnings", 1) if updated_user else 1

                # Log the moderation event (no raw text stored)
                db.moderationlogs.insert_one({
                    "meetingId": ObjectId(meeting_id),
                    "participantId": ObjectId(participant_id),
                    "userId": user_id,
                    "actionTaken": "kicked" if warnings >= 3 else "warned",
                    "reason": "Toxic language detected",
                    "redactedText": "[ flagged content ]",
                    "toxicityScore": result["score"],
                    "createdAt": datetime.datetime.now(datetime.timezone.utc),
                })

                # Publish to Redis DB 2 for signaling-server
                event_payload = {
                    "meetingId": str(meeting_id),
                    "participantId": str(participant_id),
                    "userId": str(user_id),
                    "warnings": warnings,
                    "action": "kicked" if warnings >= 3 else "warned",
                }

                if redis_pubsub:
                    redis_pubsub.publish("moderation_events", json.dumps(event_payload))

        except Exception as e:
            logger.error("Toxicity moderation failed for participant %s in meeting %s: %s",
                         participant_id, meeting_id, e)

    return {
        "participant_id": participant_id,
        "meeting_id": meeting_id,
        "is_toxic": result["is_toxic"],
        "toxicity_score": result["score"],
        "redacted_text": "[ flagged content ]" if result["is_toxic"] else "",
    }
