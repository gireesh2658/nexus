import os
import json
import asyncio
import time
import datetime
import uuid
import logging
from livekit import rtc, api
from app.ml.vad_buffer import VADBuffer
from app.ml.transcriber import WhisperExecutor
from app.routers.telemetry import batcher
from app.routers.ai import get_app_pool

logger = logging.getLogger(__name__)

# Global transcriber
transcriber = WhisperExecutor()

# Track active tasks so they aren't garbage collected
# Track active tasks and room connections so they aren't garbage collected
active_tasks = set()
active_rooms = set()
room_connections = {}

# LiveKit Server SDK client for broadcasting CC
lk_api = None

def get_lk_api():
    global lk_api
    if lk_api is None:
        url = os.getenv("LIVEKIT_URL") or os.getenv("LIVEKIT_WS_URL") or "http://localhost:7880"
        if url.startswith("ws://"):
            url = url.replace("ws://", "http://")
        elif url.startswith("wss://"):
            url = url.replace("wss://", "https://")
        key = os.getenv("LIVEKIT_API_KEY")
        secret = os.getenv("LIVEKIT_API_SECRET")
        if not key or not secret:
            raise ValueError("LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be configured")
        lk_api = api.LiveKitAPI(url, key, secret)
    return lk_api

async def stop_room_egress(room_name: str):
    """Gracefully disconnect and release resources when a room ends."""
    room = room_connections.pop(room_name, None)
    if room:
        try:
            await room.disconnect()
            logger.info(f"Egress Daemon disconnected from room: {room_name}")
        except Exception as e:
            logger.warning(f"Error disconnecting egress from room {room_name}: {e}")
    active_rooms.discard(room_name)

async def handle_room_events(room_name: str):
    logger.info(f"Egress Daemon connecting to room: {room_name}")
    
    room = rtc.Room()
    room_connections[room_name] = room
    
    # Resolve true UUID meetingId from room_name (roomCode or id) once at connection
    canonical_meeting_id = room_name
    try:
        pool = await get_app_pool()
        async with pool.acquire() as conn:
            m_row = await conn.fetchrow(
                'SELECT "id"::text FROM "Meeting" WHERE "id"::text = $1 OR "roomCode" = $1',
                room_name
            )
            if m_row:
                canonical_meeting_id = m_row['id']
                logger.info(f"Resolved room {room_name} to canonical meeting ID {canonical_meeting_id}")
    except Exception as e:
        logger.warning(f"Failed to resolve canonical meeting ID for {room_name}: {e}")

    @room.on("disconnected")
    def on_disconnected(*args, **kwargs):
        logger.info(f"Room {room_name} closed. Releasing resources.")
        room_connections.pop(room_name, None)
        active_rooms.discard(room_name)
    
    # 1. Telemetry Egress
    @room.on("data_received")
    def on_data_received(data_packet: rtc.DataPacket):
        logger.info(f"Data received in room {room_name}: topic={data_packet.topic}, len={len(data_packet.data)}")
        if data_packet.topic == "telemetry":
            try:
                raw_data = data_packet.data.decode('utf-8')
                parsed = json.loads(raw_data)
                
                participant_id = data_packet.participant.identity if data_packet.participant else 'unknown'
                
                enriched_payload = {
                    **parsed,
                    "server_timestamp_ms": int(time.time() * 1000),
                    "participant_id": participant_id,
                    "meeting_id": canonical_meeting_id
                }
                
                logger.info(f"Enqueued telemetry for {participant_id} in meeting {canonical_meeting_id}")
                # Push directly to TimescaleDB batcher
                batcher.enqueue({
                    "meeting_id": canonical_meeting_id,
                    "participant_id": participant_id,
                    "payload": enriched_payload
                })
            except Exception as e:
                logger.error(f"Error parsing telemetry from data channel: {e}")

    vad_buffers = {}
    
    @room.on("participant_disconnected")
    def on_participant_disconnected(participant: rtc.RemoteParticipant):
        logger.info(f"Participant disconnected: {participant.identity}")
        if participant.identity in vad_buffers:
            del vad_buffers[participant.identity]
    
    # 2. Audio Transcription Egress
    @room.on("track_subscribed")
    def on_track_subscribed(track: rtc.Track, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
        if track.kind == rtc.TrackKind.KIND_AUDIO:
            logger.info(f"Subscribed to audio track for {participant.identity} in {room_name}")
            # rtc.AudioStream natively resamples to 16kHz mono
            audio_stream = rtc.AudioStream(track, sample_rate=16000, num_channels=1)
            vad_buffers[participant.identity] = VADBuffer()
            
            async def process_audio_stream(stream: rtc.AudioStream, pid: str):
                vad = vad_buffers[pid]

                async def handle_speech_chunk(speech_chunk: bytes):
                    if not speech_chunk:
                        return
                    text = await transcriber.transcribe_audio(speech_chunk)
                    if text and text.strip():
                        start_ms = int(time.time() * 1000) - len(speech_chunk) // 32
                        end_ms = int(time.time() * 1000)
                        created_at = datetime.datetime.utcnow()
                        
                        logger.info(f"Transcribed [{pid}]: {text}")
                        
                        # A. Save to Postgres/TimescaleDB directly
                        try:
                            pool = await get_app_pool()
                            async with pool.acquire() as conn:
                                # Resolve true UUID meetingId from room_name (roomCode or id)
                                m_row = await conn.fetchrow(
                                    'SELECT "id" FROM "Meeting" WHERE "id"::text = $1 OR "roomCode" = $1',
                                    room_name
                                )
                                canonical_meeting_id = m_row['id'] if m_row else room_name
                                
                                await conn.execute(
                                    """
                                    INSERT INTO "Transcription" ("id", "meetingId", "participantId", "text", "startTimeMs", "endTimeMs", "createdAt")
                                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                                    """,
                                    str(uuid.uuid4()), canonical_meeting_id, pid, text, start_ms, end_ms, created_at
                                )
                        except Exception as e:
                            logger.error(f"Failed to save transcription to DB: {e}")
                        
                        # B. Broadcast CC to LiveKit
                        try:
                            payload = json.dumps({
                                "participant_id": pid,
                                "text": text,
                                "timestamp": end_ms
                            }).encode('utf-8')
                            
                            lk = get_lk_api()
                            await lk.room.send_data(
                                api.SendDataRequest(
                                    room=room_name,
                                    data=payload,
                                    topic="captions"
                                )
                            )
                        except Exception as e:
                            logger.error(f"Failed to broadcast caption to room {room_name}: {e}")

                try:
                    async for audio_frame_event in stream:
                        frame_bytes = bytes(audio_frame_event.frame.data)
                        speech_chunk = vad.process_frame(frame_bytes)
                        if speech_chunk:
                            await handle_speech_chunk(speech_chunk)

                    # Flush remaining buffered speech when stream finishes
                    remaining_chunk = vad.flush()
                    if remaining_chunk:
                        await handle_speech_chunk(remaining_chunk)
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.error(f"Error processing audio stream for {pid}: {e}")

            task = asyncio.create_task(process_audio_stream(audio_stream, participant.identity))
            active_tasks.add(task)
            task.add_done_callback(active_tasks.discard)

    try:
        url = os.getenv("LIVEKIT_URL") or os.getenv("LIVEKIT_WS_URL") or "ws://localhost:7880"
        api_key = os.getenv("LIVEKIT_API_KEY")
        api_secret = os.getenv("LIVEKIT_API_SECRET")
        if not api_key or not api_secret:
            raise ValueError("LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be configured")
        
        token = api.AccessToken(api_key, api_secret) \
            .with_identity("nexus-egress-daemon") \
            .with_name("Nexus AI") \
            .with_grants(api.VideoGrants(room_join=True, room=room_name, can_publish=False, can_subscribe=True, can_publish_data=True, hidden=True)) \
            .to_jwt()

        await room.connect(url, token)
        logger.info(f"Egress Daemon successfully joined room: {room_name}")
        
    except Exception as e:
        logger.error(f"Failed to connect to LiveKit room {room_name}: {e}")
        room_connections.pop(room_name, None)
        active_rooms.discard(room_name)

def spawn_room_egress(room_name: str):
    if room_name in active_rooms:
        logger.info(f"Egress Daemon already active for room {room_name}. Skipping duplicate.")
        return
    active_rooms.add(room_name)
    task = asyncio.create_task(handle_room_events(room_name))
    active_tasks.add(task)
    def _cleanup(_):
        active_tasks.discard(task)
        active_rooms.discard(room_name)
    task.add_done_callback(_cleanup)
