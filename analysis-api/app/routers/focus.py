from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from app.utils.auth import verify_token as auth_token
from app.models.schemas import BehavioralSignal

from datetime import datetime
import json
import jwt
import os

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise ValueError("FATAL: JWT_SECRET is not set.")
JWT_PUBLIC_KEY = os.getenv("JWT_PUBLIC_KEY")

def verify_token(token: str) -> bool:
    try:
        if JWT_PUBLIC_KEY:
            payload = jwt.decode(token, JWT_PUBLIC_KEY, algorithms=["RS256"])
        else:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload.get("typ") == "access"
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

            # Just return the local behavioral score as final for now
            # since fuse_scores is deleted.
            result = type("Result", (object,), {"final_score": behavioral_score})

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
    """WebSocket endpoint for receiving analysis landmarks at 10 fps."""
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
            frame_data = json.loads(data)
            
            landmarks = frame_data.get("landmarks")
            participant_id = frame_data.get("participant_id")
            meeting_id = frame_data.get("meeting_id")
            
            if landmarks and len(landmarks) > 263 and participant_id and meeting_id:
                import math
                nose = landmarks[1]
                left_eye = landmarks[33]
                right_eye = landmarks[263]
                chin = landmarks[152]
                
                # yaw
                dx = right_eye['x'] - left_eye['x']
                nx = nose['x'] - left_eye['x']
                yaw_deg = ((nx / dx) - 0.5) * 100 if dx else 0
                
                # pitch
                eyey = (left_eye['y'] + right_eye['y']) / 2
                dy = chin['y'] - eyey
                ny = nose['y'] - eyey
                pitch_deg = ((ny / dy) - 0.5) * 100 if dy else 0
                
                # roll
                dxd = right_eye['x'] - left_eye['x']
                dyd = right_eye['y'] - left_eye['y']
                roll_deg = math.atan2(dyd, dxd) * (180 / math.pi) if dxd else 0
                
                pose_score = 100
                if abs(yaw_deg) > 15: pose_score -= abs(yaw_deg) * 2
                if abs(pitch_deg) > 10: pose_score -= abs(pitch_deg) * 3
                if abs(roll_deg) > 8: pose_score -= abs(roll_deg) * 4
                pose_score = max(0, min(100, pose_score))
                
                # EAR
                L_v1, L_v2 = landmarks[159], landmarks[145]
                L_h1, L_h2 = landmarks[33], landmarks[133]
                ear_dx = L_h1['x'] - L_h2['x']
                ear = abs(L_v1['y'] - L_v2['y']) / abs(ear_dx) if ear_dx else 0
                
                blink_score = 50 if ear < 0.15 else 100
                visual_score = (pose_score * 0.6) + (blink_score * 0.4)
                
                # visual_score caching removed since score_fuser is gone

            await websocket.send_text(json.dumps({
                "status": "processed",
                "participant_id": participant_id,
            }))
    except WebSocketDisconnect:
        pass


@router.get("/scores/{meeting_id}", dependencies=[Depends(auth_token)])
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

@router.delete("/cleanup/{meeting_id}", dependencies=[Depends(auth_token)])
async def cleanup_meeting(meeting_id: str):
    """Clean up memory when a meeting ends."""
    if meeting_id in behavioral_cache:
        del behavioral_cache[meeting_id]
    if meeting_id in meeting_start_times:
        del meeting_start_times[meeting_id]
    return {"status": "cleaned_up", "meeting_id": meeting_id}
