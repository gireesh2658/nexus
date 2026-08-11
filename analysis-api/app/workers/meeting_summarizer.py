import os
import json
import asyncio
import asyncpg
import httpx
from aiokafka import AIOKafkaConsumer

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")

async def get_app_pool():
    db_url = os.getenv("APP_DATABASE_URL")
    return await asyncpg.create_pool(dsn=db_url, min_size=1, max_size=5)

async def summarize_meeting(meeting_id: str, pool):
    print(f"Initiating summary generation for meeting: {meeting_id}")
    
    # 1. Safely query NeonDB for all transcripts associated with this meeting
    async with pool.acquire() as conn:
        try:
            # We assume a Prisma-managed table named "Transcription"
            rows = await conn.fetch(
                """
                SELECT "participantId", text 
                FROM "Transcription" 
                WHERE "meetingId" = $1 
                ORDER BY "startTimeMs" ASC
                """,
                meeting_id
            )
        except Exception as e:
            print(f"Failed to query NeonDB for transcripts: {e}")
            return

    if not rows:
        print(f"No transcripts found for meeting {meeting_id}. Skipping summary.")
        return

    # 2. Construct the chronological meeting log
    transcript_text = "\n".join([f"{r['participantId']}: {r['text']}" for r in rows])
    prompt = f"Summarize the following meeting transcript. Highlight key decisions and action items in bullet points.\n\nTranscript:\n{transcript_text}"

    # 3. Request summary from the local Ollama LLM instance
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(OLLAMA_URL, json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False
            }, timeout=120.0)
            response.raise_for_status()
            summary_text = response.json().get("response", "")
        except Exception as e:
            print(f"Ollama generation failed for {meeting_id}: {e}")
            return

    # 4. Save the generated summary back to NeonDB
    async with pool.acquire() as conn:
        try:
            import uuid
            summary_id = str(uuid.uuid4())
            await conn.execute(
                """
                INSERT INTO "MeetingSummary" ("id", "meetingId", "summaryText", "decisions", "actionItems", "createdAt") 
                VALUES ($1, $2, $3, $4, $5, NOW())
                """,
                summary_id, meeting_id, summary_text, [], '[]'
            )
            print(f"Successfully saved MeetingSummary for {meeting_id}.")
        except Exception as e:
            print(f"Failed to insert summary into NeonDB: {e}")

async def main():
    brokers = os.getenv("KAFKA_BROKERS", "localhost:9092")
    
    consumer = AIOKafkaConsumer(
        "cluster.events",
        bootstrap_servers=brokers,
        group_id="meeting-summarizer-group",
        value_deserializer=lambda x: json.loads(x.decode('utf-8'))
    )
    await consumer.start()
    
    # Establish pool to NeonDB to avoid cold-start crashing
    pool = await get_app_pool()
    print("Meeting Summarizer started. Listening for room.ended events...")
    
    try:
        async for msg in consumer:
            data = msg.value
            if data.get("event") == "room.ended":
                meeting_id = data.get("room_name")
                if meeting_id:
                    # Offload to background task to prevent blocking the Kafka consumer queue
                    asyncio.create_task(summarize_meeting(meeting_id, pool))
    finally:
        await consumer.stop()
        await pool.close()

if __name__ == "__main__":
    asyncio.run(main())
