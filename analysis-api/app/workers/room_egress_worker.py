import os
import json
import asyncio
import time
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from livekit import rtc
from app.ml.vad_buffer import VADBuffer
from app.ml.transcriber import WhisperExecutor

# Instantiate global models. They are thread-safe and stateless (mostly) across rooms.
transcriber = WhisperExecutor()

async def handle_room_events(room_name: str, kafka_producer: AIOKafkaProducer, active_rooms: set):
    print(f"Egress Daemon connecting to room: {room_name}")
    
    room = rtc.Room()
    
    # 1. Memory Leak Patch: Clean up state when the room dies
    @room.on("disconnected")
    def on_disconnected():
        print(f"Room {room_name} closed. Releasing resources.")
        if room_name in active_rooms:
            active_rooms.remove(room_name)
    
    # Extracts WASM telemetry directly from the WebRTC Data Plane in real-time
    @room.on("data_received")
    async def on_data_received(data_packet: rtc.DataPacket):
        if data_packet.topic == "telemetry":
            try:
                raw_data = data_packet.data.decode('utf-8')
                parsed = json.loads(raw_data)
                
                # Enrich with participant ID and a secure server-side chronological timestamp
                participant_id = data_packet.participant.identity if data_packet.participant else 'unknown'
                
                enriched_payload = {
                    **parsed,
                    "server_timestamp_ms": int(time.time() * 1000),
                    "participant_id": participant_id,
                    "meeting_id": room_name
                }
                
                # Use .send() NOT .send_and_wait().
                # .send() drops it in aiokafka's local memory buffer instantly.
                # The producer will batch and flush it in the background efficiently.
                await kafka_producer.send("telemetry.raw", json.dumps(enriched_payload).encode('utf-8'))
            except Exception as e:
                print(f"Error parsing telemetry from data channel: {e}")

    # Dictionary to maintain VAD state per participant
    vad_buffers = {}
    
    @room.on("participant_disconnected")
    def on_participant_disconnected(participant: rtc.RemoteParticipant):
        print(f"Participant disconnected: {participant.identity}")
        if participant.identity in vad_buffers:
            del vad_buffers[participant.identity]
    
    # Egress: Audio Stream (Whisper + Silero VAD prep)
    @room.on("track_subscribed")
    def on_track_subscribed(track: rtc.Track, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
        if track.kind == rtc.TrackKind.KIND_AUDIO:
            print(f"Subscribed to audio track for {participant.identity} in {room_name}")
            audio_stream = rtc.AudioStream(track)
            
            # Initialize VAD Buffer for this specific participant
            vad_buffers[participant.identity] = VADBuffer()
            
            # Initialize Resampler from 48kHz (WebRTC default) down to 16kHz (VAD/Whisper requirement)
            resampler = rtc.AudioResampler(input_rate=track.sample_rate, output_rate=16000, num_channels=1)
            
            async def process_audio_stream(stream: rtc.AudioStream, pid: str):
                vad = vad_buffers[pid]
                
                # Asynchronously iterate over incoming raw PCM frames without blocking the main WebRTC loop
                async for audio_frame_event in stream:
                    # Push the 48kHz frame through the resampler
                    resampled_frames = resampler.push(audio_frame_event.frame)
                    
                    for frame in resampled_frames:
                        # Feed the 16kHz PCM bytes into the stateful VAD buffer
                        speech_chunk = vad.process_frame(frame.data)
                        
                        # If VAD detects a natural pause > 500ms, it yields the flush chunk
                        if speech_chunk:
                            # Offload the heavy INT8 matrix multiplication to the asyncio thread pool executor
                            text = await transcriber.transcribe_audio(speech_chunk)
                            
                            if text:
                                # Publish the finished transcription to the Redpanda queue
                                payload = {
                                    "meeting_id": room_name,
                                    "participant_id": pid,
                                    "text": text,
                                    "start_time_ms": int(time.time() * 1000) - len(speech_chunk) // 32, # approx based on 16kHz 16-bit
                                    "end_time_ms": int(time.time() * 1000)
                                }
                                
                                await kafka_producer.send("audio.transcriptions", json.dumps(payload).encode('utf-8'))
                                print(f"Transcribed [{pid}]: {text}")

            # Fire and forget the async processor for this specific track
            asyncio.create_task(process_audio_stream(audio_stream, participant.identity))

    # Construct the headless participant connection
    try:
        url = os.getenv("LIVEKIT_URL")
        api_key = os.getenv("LIVEKIT_API_KEY")
        api_secret = os.getenv("LIVEKIT_API_SECRET")
        
        # We don't join immediately, we need a token for a headless participant.
        # But wait, the RTC SDK connects using a token.
        from livekit import api
        token = api.AccessToken(api_key, api_secret) \
            .with_identity("nexus-egress-daemon") \
            .with_name("Nexus AI") \
            .with_grants(api.VideoGrant(roomJoin=True, room=room_name, canPublish=False, canSubscribe=True)) \
            .to_jwt()

        await room.connect(url, token)
        print(f"Egress Daemon successfully joined room: {room_name}")
        
    except Exception as e:
        print(f"Failed to connect to LiveKit room {room_name}: {e}")

async def main():
    brokers = os.getenv("KAFKA_BROKERS", "localhost:9092")
    
    # Initialize global producer for the egress callbacks
    producer = AIOKafkaProducer(bootstrap_servers=brokers)
    await producer.start()
    
    # Initialize consumer to listen for room spawns (Control Plane -> Data Plane handoff)
    consumer = AIOKafkaConsumer(
        "cluster.events",
        bootstrap_servers=brokers,
        group_id="room-egress-group",
        value_deserializer=lambda x: json.loads(x.decode('utf-8')),
        auto_offset_reset="latest"
    )
    await consumer.start()
    print("Headless Egress Worker started. Listening for cluster.events...")
    
    # We maintain a set of active rooms to prevent double-joining
    active_rooms = set()
    
    try:
        async for msg in consumer:
            val = msg.value
            if val.get("event") == "room.created":
                room_name = val.get("room_name")
                if room_name and room_name not in active_rooms:
                    active_rooms.add(room_name)
                    asyncio.create_task(handle_room_events(room_name, producer, active_rooms))
    finally:
        await consumer.stop()
        await producer.stop()

if __name__ == "__main__":
    asyncio.run(main())
