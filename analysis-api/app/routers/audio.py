from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from app.utils.auth import verify_token as auth_token
import json
import logging

from app.routers.focus import verify_token

logger = logging.getLogger(__name__)

router = APIRouter()

@router.websocket("/ws/chunks")
async def audio_chunk_ws(websocket: WebSocket):
    """
    WebSocket endpoint for receiving 10-second audio chunks.
    Triggers Whisper STT → DistilBERT toxicity pipeline via Celery.

    SECURITY: First message must be a JSON handshake with a valid JWT token.
    """
    await websocket.accept()
    from app.workers.abuse_worker import transcribe_audio_task

    try:
        # ── JWT handshake ────────────────────────────────────────────
        handshake = await websocket.receive_text()
        handshake_data = json.loads(handshake)
        token = handshake_data.get("token")
        if not token or not verify_token(token):
            await websocket.close(code=1008)
            return

        while True:
            data = await websocket.receive_text()
            chunk = json.loads(data)
            
            # Send to Celery worker chain
            transcribe_audio_task.delay(
                participant_id=chunk.get("participant_id"),
                meeting_id=chunk.get("meeting_id"),
                audio_data=chunk.get("audio_data")
            )
            
            await websocket.send_text(json.dumps({
                "status": "queued",
                "participant_id": chunk.get("participant_id"),
                "meeting_id": chunk.get("meeting_id"),
            }))
    except WebSocketDisconnect:
        pass
    except json.JSONDecodeError:
        logger.warning("Audio WS received malformed JSON")
        await websocket.close(code=1003)
    except Exception as e:
        logger.error("Audio WS error: %s", e)

@router.get("/status", dependencies=[Depends(auth_token)])
async def audio_status():
    """Check audio analysis pipeline status."""
    try:
        from app.ml.whisper_transcriber import model as whisper_model
        whisper_loaded = whisper_model is not None
    except Exception:
        whisper_loaded = False

    try:
        from app.ml.toxicity_classifier import toxicity_pipeline as tox_pipe
        toxicity_loaded = tox_pipe is not None
    except Exception:
        toxicity_loaded = False

    return {
        "status": "ok",
        "whisper_loaded": whisper_loaded,
        "toxicity_loaded": toxicity_loaded,
    }
