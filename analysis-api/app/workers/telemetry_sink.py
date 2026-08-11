import os
import json
import asyncio
import datetime
import asyncpg
from aiokafka import AIOKafkaConsumer

async def get_telemetry_pool():
    db_url = os.getenv("TELEMETRY_DATABASE_URL", "postgresql://postgres:password@nexus-timescale:5432/nexus")
    return await asyncpg.create_pool(dsn=db_url, min_size=1, max_size=10)

async def main():
    brokers = os.getenv("KAFKA_BROKERS", "localhost:9092")
    topics = ["telemetry.raw"]
    group_id = "telemetry-sink-group"

    telemetry_pool = None
    # Retry DB connection
    for _ in range(10):
        try:
            if not telemetry_pool:
                telemetry_pool = await get_telemetry_pool()
            print("Connected to Telemetry database.")
            break
        except Exception as e:
            print(f"Waiting for DB... {e}")
            await asyncio.sleep(2)
    else:
        raise Exception("Could not connect to database")

    # Retry Kafka connection
    consumer = AIOKafkaConsumer(
        *topics,
        bootstrap_servers=brokers,
        group_id=group_id,
        enable_auto_commit=False,
        value_deserializer=lambda m: json.loads(m.decode('utf-8'))
    )
    
    connected = False
    for _ in range(10):
        try:
            await consumer.start()
            connected = True
            print(f"Connected to Redpanda broker at {brokers}")
            break
        except Exception as e:
            print(f"Failed to connect to Redpanda, retrying... {e}")
            await asyncio.sleep(2)

    if not connected:
        print("CRITICAL: Could not connect to Redpanda.")
        return

    BATCH_SIZE = 500
    FLUSH_TIMEOUT = 5.0 # seconds
    
    batch_telemetry = []
    last_flush_time = asyncio.get_event_loop().time()

    async def flush_batch():
        nonlocal batch_telemetry, last_flush_time
        if not batch_telemetry:
            return
            
        current_telemetry = batch_telemetry
        batch_telemetry = []
        last_flush_time = asyncio.get_event_loop().time()
        
        try:
            if current_telemetry:
                # Insert into TimescaleDB
                async with telemetry_pool.acquire() as telemetry_conn:
                    await telemetry_conn.executemany(
                        """
                        INSERT INTO meeting_telemetry (recorded_at, meeting_id, participant_id, payload)
                        VALUES ($1, $2, $3, $4)
                        """,
                        current_telemetry
                    )
            
            # Manual Kafka Commit ONLY after successful DB insert
            await consumer.commit()
            print(f"Successfully flushed {len(current_telemetry)} telemetry events.")
            
        except Exception as e:
            print(f"Failed to flush batch: {e}")
            # If we fail, we exit and let the container restart. 
            # Because we haven't committed, Kafka will redeliver the messages.
            raise e

    print("Telemetry Sink Worker started. Listening for telemetry events...")

    try:
        while True:
            try:
                # Use getmany to efficiently fetch multiple messages at once
                result = await consumer.getmany(timeout_ms=1000, max_records=BATCH_SIZE)
                
                for tp, messages in result.items():
                    for msg in messages:
                        val = msg.value
                        
                        if msg.topic == "telemetry.raw":
                            client_id = val.get("client_id", "unknown")
                            meeting_id = val.get("meeting_id", "unknown")
                            participant_id = val.get("participant_id", client_id)
                            timestamp = datetime.datetime.fromtimestamp(val.get("server_timestamp_ms", datetime.datetime.now().timestamp() * 1000) / 1000.0, tz=datetime.timezone.utc)
                            payload = val
                            batch_telemetry.append((timestamp, meeting_id, participant_id, json.dumps(payload)))

                current_time = asyncio.get_event_loop().time()
                total_pending = len(batch_telemetry)
                if total_pending >= BATCH_SIZE or (total_pending > 0 and current_time - last_flush_time >= FLUSH_TIMEOUT):
                    await flush_batch()
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Error in consumer loop: {e}")
                
    finally:
        await flush_batch() # Attempt final flush
        await consumer.stop()
        await telemetry_pool.close()

if __name__ == "__main__":
    asyncio.run(main())
