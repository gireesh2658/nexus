from fastapi import APIRouter, Request, HTTPException
from livekit import api
import os
import logging
import asyncio
from app.services.livekit_egress import spawn_room_egress, stop_room_egress

logger = logging.getLogger(__name__)
router = APIRouter()

def get_receiver():
    """Create receiver using current environment credentials."""
    key = os.getenv("LIVEKIT_API_KEY")
    secret = os.getenv("LIVEKIT_API_SECRET")
    if not key or not secret:
        raise ValueError("LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set")
    return api.WebhookReceiver(api.TokenVerifier(key, secret))

@router.post("/livekit")
async def livekit_webhook(request: Request):
    body = await request.body()
    auth_header = request.headers.get("Authorization")
    
    if not auth_header:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
        
    token = auth_header.replace("Bearer ", "").strip() if auth_header.startswith("Bearer ") else auth_header.strip()

    try:
        receiver = get_receiver()
        event = receiver.receive(body.decode('utf-8'), token)
    except Exception as e:
        logger.warning(f"Webhook signature verification failed: {e}")
        raise HTTPException(status_code=401, detail=f"Webhook verification failed: {str(e)}")
        
    # Spawn in-process LiveKit egress worker to handle telemetry, audio, and CC
    if event.event == "room_started":
        room_name = event.room.name
        logger.info(f"Received verified room_started webhook for {room_name}")
        spawn_room_egress(room_name)

    elif event.event == "room_finished":
        room_name = event.room.name
        logger.info(f"Received verified room_finished webhook for {room_name}")
        asyncio.create_task(stop_room_egress(room_name))
        
    # Return 200 OK instantly to LiveKit to prevent webhook timeouts
    return {"status": "ok"}
