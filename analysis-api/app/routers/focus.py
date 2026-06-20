from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.models.schemas import BehavioralSignal
from app.ml.score_fuser import fuse_scores
from datetime import datetime
import json
import jwt
import os

JWT_SECRET = os.getenv("JWT_SECRET", "nexus_dev_secret_key_64_chars_minimum_for_jwt_signing_replace_in_production_asap_ok")
JWT_PUBLIC_KEY = os.getenv("JWT_PUBLIC_KEY")

def verify_token(token: str) -> bool:
    try:
        if JWT_PUBLIC_KEY:
            jwt.decode(token, JWT_PUBLIC_KEY, algorithms=["RS256"])
        else:
            jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return True
    except Exception:
        return False

router = APIRouter()

# In-memory store: meeting_id → { participant_id → BehavioralSignal }
behavioral_cache: dict[str, dict[str, BehavioralSignal]] = {}

# Track when each meeting started receiving signals (for calibration elapsed_secs)
meeting_start_times: dict[str, datetime] = {}


@router.websocket("/ws/behavioral")
async def behavioral_ws(websocket: WebSocket):
    """WebSocket endpoint for receiving behavioral signals every 5 seconds."""
    await websocket.accept()
    try:
        handshake = await websocket.receive_text()
        handshake_data = json.loads(handshake)
        token = handshake_data.get("token")
        if not token or not verify_token(token):
            await websocket.close(code=1008)
            return
            
        while True:
            data = await websocket.receive_text()
            signal = BehavioralSignal(**json.loads(data))

            key = signal.meeting_id

            # Track per-meeting start time (first signal = t=0)
            if key not in meeting_start_times:
                meeting_start_times[key] = datetime.utcnow()

            # Cache behavioral signal (keyed by participant)
            if key not in behavioral_cache:
                behavioral_cache[key] = {}
            behavioral_cache[key][signal.participant_id] = signal

            behavioral_score = compute_behavioral_score(signal)
            elapsed_secs = (datetime.utcnow() - meeting_start_times[key]).total_seconds()

            result = await fuse_scores(
                participant_id=signal.participant_id,
                meeting_id=signal.meeting_id,
                behavioral_score=behavioral_score,
                elapsed_secs=elapsed_secs,
            )

            if result:
                await websocket.send_text(json.dumps({
                    "participant_id": signal.participant_id,
                    "final_score": result.final_score,
                    "behavioral_score": behavioral_score,
                }))

    except WebSocketDisconnect:
        pass


@router.websocket("/ws/frame")
async def frame_ws(websocket: WebSocket):
    """WebSocket endpoint for receiving analysis video frames at 1 fps."""
    await websocket.accept()
    from app.workers.focus_worker import process_frame_task
    try:
        handshake = await websocket.receive_text()
        handshake_data = json.loads(handshake)
        token = handshake_data.get("token")
        if not token or not verify_token(token):
            await websocket.close(code=1008)
            return

        while True:
            data = await websocket.receive_text()
            frame_data = json.loads(data)

            process_frame_task.delay(
                participant_id=frame_data.get("participant_id"),
                meeting_id=frame_data.get("meeting_id"),
                frame_data=frame_data.get("frame"),
            )

            await websocket.send_text(json.dumps({
                "status": "queued",
                "participant_id": frame_data.get("participant_id"),
            }))
    except WebSocketDisconnect:
        pass


@router.get("/scores/{meeting_id}")
async def get_meeting_scores(meeting_id: str):
    """Get latest focus scores for all participants in a meeting."""
    signals = behavioral_cache.get(meeting_id, {})
    result = {}
    for pid, signal in signals.items():
        result[pid] = {
            "behavioral_score": compute_behavioral_score(signal),
            "tab_visible": signal.tab_visible,
            "idle_seconds": signal.idle_seconds,
        }
    return {"meeting_id": meeting_id, "scores": result}


def compute_behavioral_score(signal: BehavioralSignal) -> float:
    """
    Behavioral score formula:
    tab_visible_ratio × 0.50 + idle_inverse × 0.30 + interaction_ratio × 0.20
    """
    tab_score = 1.0 if signal.tab_visible else 0.0
    idle_inverse = max(0.0, 1.0 - (signal.idle_seconds / 60.0))
    total_events = signal.mouse_events + signal.keyboard_events
    interaction_ratio = min(1.0, total_events / 20.0)

    return (tab_score * 0.50) + (idle_inverse * 0.30) + (interaction_ratio * 0.20)

@router.delete("/cleanup/{meeting_id}")
async def cleanup_meeting(meeting_id: str):
    """Clean up memory when a meeting ends."""
    if meeting_id in behavioral_cache:
        del behavioral_cache[meeting_id]
    if meeting_id in meeting_start_times:
        del meeting_start_times[meeting_id]
    return {"status": "cleaned_up", "meeting_id": meeting_id}
