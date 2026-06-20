import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())

from app.models.db import connect_databases, close_databases
from app.routers import focus, audio, analytics

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    await connect_databases()
    print("Nexus Analysis API started")
    yield
    await close_databases()
    print("Nexus Analysis API stopped")

app = FastAPI(
    title="Nexus Analysis API",
    description="AI-powered meeting intelligence — focus detection, abuse moderation, analytics",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — read from env, fall back to localhost for dev
allowed_origins = os.getenv(
    "ALLOWED_ORIGIN",
    "http://localhost:3000,http://localhost:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check
@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "nexus-analysis-api"}

# Routers
app.include_router(focus.router, prefix="/api/focus", tags=["Focus Detection"])
app.include_router(audio.router, prefix="/api/audio", tags=["Audio Analysis"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
