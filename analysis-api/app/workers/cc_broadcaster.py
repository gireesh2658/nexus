import os
import json
import asyncio
from aiokafka import AIOKafkaConsumer
from livekit import api

async def main():
    brokers = os.getenv("KAFKA_BROKERS", "localhost:9092")
    
    consumer = AIOKafkaConsumer(
        "audio.transcriptions",
        bootstrap_servers=brokers,
        group_id="cc-broadcaster-group",
        value_deserializer=lambda x: json.loads(x.decode('utf-8')),
        auto_offset_reset="latest"
    )
    await consumer.start()
    print("CC Broadcaster started. Listening for audio.transcriptions...")

    # Initialize the LiveKit Server SDK client
    lk_api = api.LiveKitAPI(
        os.getenv("LIVEKIT_URL"),
        os.getenv("LIVEKIT_API_KEY"),
        os.getenv("LIVEKIT_API_SECRET")
    )

    try:
        async for msg in consumer:
            data = msg.value
            meeting_id = data.get("meeting_id")
            if not meeting_id:
                continue

            # Construct the payload to broadcast to the UI
            payload = json.dumps({
                "participant_id": data.get("participant_id", "Unknown"),
                "text": data.get("text", ""),
                "timestamp": data.get("end_time_ms")
            }).encode('utf-8')

            try:
                # Push the transcript back to all connected LiveKit clients
                # on the "captions" Data Channel. Zero WebSocket overhead.
                await lk_api.room.send_data(
                    room=meeting_id,
                    data=payload,
                    kind=api.DataPacketKind.RELIABLE,
                    topic="captions"
                )
            except Exception as e:
                print(f"Failed to broadcast caption to room {meeting_id}: {e}")
                
    finally:
        await consumer.stop()
        await lk_api.aclose()

if __name__ == "__main__":
    asyncio.run(main())
