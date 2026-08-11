import os
import json
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from aiokafka import AIOKafkaProducer
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

# We are no longer importing MongoDB connection logic.
# Postgres (Timescale) and Redis will be connected here as needed later.
from app.routers import focus, audio, analytics, telemetry, rooms, webhooks
import redis.asyncio as redis

# Global Connections
redis_client = None

# Global Kafka Producer
kafka_producer: AIOKafkaProducer = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    global kafka_producer, redis_client
    brokers = os.getenv("KAFKA_BROKERS", "localhost:9092")
    
    # Initialize Redis connection pool
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    redis_client = redis.from_url(redis_url, decode_responses=True)
    app.state.redis_client = redis_client
    
    # Initialize Kafka Producer
    kafka_producer = AIOKafkaProducer(
        bootstrap_servers=brokers,
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )
    
    # Retry mechanism for connecting to Redpanda on startup
    connected = False
    for i in range(5):
        try:
            await kafka_producer.start()
            connected = True
            print(f"Nexus Analysis API connected to Redpanda at {brokers}")
            break
        except Exception as e:
            print(f"Failed to connect to Redpanda (Attempt {i+1}/5): {e}")
            await asyncio.sleep(5)
            
    if not connected:
        print("CRITICAL: Could not connect to Redpanda broker.")
    
    # Inject producer into app state for routers to use
    app.state.kafka_producer = kafka_producer
    
    yield
    
    if kafka_producer:
        await kafka_producer.stop()
        print("Redpanda connection closed.")
        
    if redis_client:
        await redis_client.aclose()
        print("Redis connection closed.")

def get_redis(request: Request):
    """Dependency to inject the Redis connection pool into routers."""
    return request.app.state.redis_client

app = FastAPI(
    title="Nexus Analysis API",
    description="Real-time telemetry ingress and AI-powered meeting intelligence.",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS
allowed_origins = os.getenv(
    "ALLOWED_ORIGIN",
    "http://localhost:3000,http://localhost:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in allowed_origins],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Health check
@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "nexus-analysis-api"}

# Routers
app.include_router(telemetry.router, prefix="/api/telemetry", tags=["Telemetry Ingress"])
app.include_router(rooms.router, prefix="/api/rooms", tags=["Rooms (WebRTC)"])
app.include_router(focus.router, prefix="/api/focus", tags=["Focus Detection"])
app.include_router(audio.router, prefix="/api/audio", tags=["Audio Analysis"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["Webhooks"])

