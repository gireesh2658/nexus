import os
import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from livekit import api

router = APIRouter()

class TokenRequest(BaseModel):
    room: str
    identity: str
    name: str

@router.post("/token")
async def generate_token(request: TokenRequest):
    """
    Mints a secure WebRTC connection token for LiveKit.
    Grants the user permission to join the specified room, publish audio/video, and subscribe.
    """
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")

    if not api_key or not api_secret:
        raise HTTPException(status_code=500, detail="LiveKit credentials are not configured")

    token = api.AccessToken(api_key, api_secret)
    token.with_identity(request.identity)
    token.with_name(request.name)
    
    # Define exact permissions (Room Join, Publish, Subscribe)
    grant = api.VideoGrants(
        room_join=True,
        room=request.room,
        can_publish=True,
        can_publish_data=True,
        can_subscribe=True
    )
    token.with_grants(grant)

    # Token expires in 4 hours
    token.with_ttl(datetime.timedelta(hours=4))

    return {"token": token.to_jwt()}
