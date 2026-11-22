from fastapi import APIRouter, Depends
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
