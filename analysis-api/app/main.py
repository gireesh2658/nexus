import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())
if not os.getenv("GEMINI_API_KEY"):
    parent_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
    if os.path.exists(parent_env):
        load_dotenv(parent_env)

import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

# We are no longer importing MongoDB connection logic.
# Postgres (Timescale) and Redis will be connected here as needed later.
from app.routers import focus, analytics, telemetry, rooms, webhooks, ai
from app.utils.timescale_writer import init_timescale, close_pool
import redis.asyncio as redis

# Global Connections
redis_client = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    global redis_client
    # Initialize TimescaleDB tables and hypertables
    try:
        await init_timescale()
        print("TimescaleDB initialized successfully.")
    except Exception as e:
        print(f"Warning: TimescaleDB initialization failed: {e}")

    # Initialize Redis connection pool
    try:
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        redis_client = redis.from_url(redis_url, decode_responses=True)
        app.state.redis_client = redis_client
    except Exception as e:
        print(f"Warning: Redis connection failed: {e}")
        app.state.redis_client = None
    
    yield
    
    if redis_client:
        await redis_client.aclose()
        print("Redis connection closed.")
    await close_pool()

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
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Health checks (Liveness & Readiness)
@app.get("/api/health")
@app.get("/health")
@app.get("/api/health/live")
async def health():
    return {"status": "ok", "service": "nexus-analysis-api"}

@app.get("/api/health/ready")
async def health_ready():
    from fastapi.responses import JSONResponse
    from app.utils.timescale_writer import get_pool

    db_status = "unknown"
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute("SELECT 1;")
        db_status = "connected"
    except Exception:
        db_status = "unreachable"

    redis_status = "disconnected"
    if redis_client:
        try:
            pong = await redis_client.ping()
            if pong:
                redis_status = "connected"
        except Exception:
            redis_status = "unreachable"

    is_ready = (db_status == "connected")
    return JSONResponse(
        status_code=200 if is_ready else 503,
        content={
            "status": "ready" if is_ready else "unready",
            "service": "nexus-analysis-api",
            "dependencies": {
                "database": db_status,
                "redis": redis_status,
            }
        }
    )

# Routers
app.include_router(telemetry.router, prefix="/api/telemetry", tags=["Telemetry Ingress"])
app.include_router(rooms.router, prefix="/api/rooms", tags=["Rooms (WebRTC)"])
app.include_router(focus.router, prefix="/api/focus", tags=["Focus Detection"])

app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["Webhooks"])
app.include_router(ai.router, prefix="/api/ai", tags=["AI Processing"])

