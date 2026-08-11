import os
import json
import asyncio
import datetime
import asyncpg
import uuid
from aiokafka import AIOKafkaConsumer

async def get_app_pool():
    db_url = os.getenv("APP_DATABASE_URL")
    return await asyncpg.create_pool(dsn=db_url, min_size=1, max_size=10)

async def main():
    brokers = os.getenv("KAFKA_BROKERS", "localhost:9092")
    topics = ["audio.transcriptions"]
    group_id = "transcript-sink-group"

    app_pool = None
    # Retry DB connection
    for _ in range(10):
        try:
            if not app_pool:
                app_pool = await get_app_pool()
            print("Connected to App database (NeonDB).")
            break
        except Exception as e:
            print(f"Waiting for NeonDB... {e}")
            await asyncio.sleep(2)
    else:
        raise Exception("Could not connect to NeonDB")

    # Retry Kafka connection
    consumer = None
    for _ in range(10):
        try:
            consumer = AIOKafkaConsumer(
                *topics,
                bootstrap_servers=brokers,
                group_id=group_id,
                value_deserializer=lambda x: json.loads(x.decode('utf-8')),
                auto_offset_reset="earliest",
                enable_auto_commit=False # We commit manually after DB insert
            )
            await consumer.start()
            print("Connected to Redpanda")
            break
        except Exception as e:
            print(f"Failed to connect to Redpanda, retrying... {e}")
            await asyncio.sleep(2)
            
    if not consumer:
        print("CRITICAL: Could not connect to Redpanda.")
        return

    BATCH_SIZE = 100
    FLUSH_TIMEOUT = 5.0 # seconds
    
    batch_transcriptions = []
    last_flush_time = asyncio.get_event_loop().time()

    async def flush_batch():
        nonlocal batch_transcriptions, last_flush_time
        if not batch_transcriptions:
            return
            
        current_transcriptions = batch_transcriptions
        batch_transcriptions = []
        last_flush_time = asyncio.get_event_loop().time()
        
        try:
            if current_transcriptions:
                # Insert into NeonDB
                async with app_pool.acquire() as app_conn:
                    await app_conn.executemany(
                    """
                    INSERT INTO "Transcription" ("id", "meetingId", "participantId", "text", "startTimeMs", "endTimeMs", "createdAt")
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    """,
                    current_transcriptions
                    )
            
            # Manual Kafka Commit ONLY after successful DB insert
            await consumer.commit()
            print(f"Successfully flushed {len(current_transcriptions)} transcriptions.")
            
        except Exception as e:
            print(f"Failed to flush batch: {e}")
            # If we fail, we exit and let the container restart. 
            # Because we haven't committed, Kafka will redeliver the messages.
            raise e

    print("Transcript Sink Worker started. Listening for transcriptions...")

    try:
        while True:
            try:
                # Use getmany to efficiently fetch multiple messages at once
                result = await consumer.getmany(timeout_ms=1000, max_records=BATCH_SIZE)
                
                for tp, messages in result.items():
                    for msg in messages:
                        val = msg.value
                        
                        if msg.topic == "audio.transcriptions":
                            t_id = str(uuid.uuid4())
                            meeting_id = val.get("meeting_id", "unknown")
                            participant_id = val.get("participant_id", "unknown")
                            text = val.get("text", "")
                            start_ms = val.get("start_time_ms", 0)
                            end_ms = val.get("end_time_ms", 0)
                            created_at = datetime.datetime.now(datetime.timezone.utc)
                            
                            batch_transcriptions.append((t_id, meeting_id, participant_id, text, start_ms, end_ms, created_at))

                current_time = asyncio.get_event_loop().time()
                total_pending = len(batch_transcriptions)
                if total_pending >= BATCH_SIZE or (total_pending > 0 and current_time - last_flush_time >= FLUSH_TIMEOUT):
                    await flush_batch()
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Error processing messages: {e}")
                await asyncio.sleep(1)

    finally:
        if batch_transcriptions: # Attempt final flush if any exist
           await flush_batch()
        await consumer.stop()
        if app_pool:
            await app_pool.close()

if __name__ == "__main__":
    asyncio.run(main())
