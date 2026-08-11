from fastapi import APIRouter, Request, HTTPException
from livekit import api
import os
import json

router = APIRouter()

# Initialize the receiver to cryptographically validate the Authorization header
receiver = api.WebhookReceiver(
    api.AccessToken(
        os.getenv("LIVEKIT_API_KEY"), 
        os.getenv("LIVEKIT_API_SECRET")
    )
)

@router.post("/livekit")
async def livekit_webhook(request: Request):
    body = await request.body()
    auth_header = request.headers.get("Authorization")
    
    if not auth_header:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
        
    try:
        # Cryptographically validate the incoming webhook payload
        event = receiver.receive(body.decode('utf-8'), auth_header)
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))
        
    # If the event is room_started, asynchronously publish a room.created event
    if event.event == "room_started":
        producer = request.app.state.kafka_producer
        room_name = event.room.name
        
        payload = {
            "event": "room.created",
            "room_name": room_name
        }
        
        # Publish to Redpanda cluster.events topic
        await producer.send_and_wait("cluster.events", json.dumps(payload).encode('utf-8'))

    elif event.event == "room_finished":
        producer = request.app.state.kafka_producer
        room_name = event.room.name
        
        payload = {
            "event": "room.ended",
            "room_name": room_name
        }
        
        # Publish to Redpanda cluster.events topic to trigger Meeting Summarizer
        await producer.send_and_wait("cluster.events", json.dumps(payload).encode('utf-8'))
        
    # Return 200 OK instantly to LiveKit to prevent webhook timeouts
    return {"status": "ok"}
