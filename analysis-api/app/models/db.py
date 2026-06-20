"""Database connections — MongoDB (Motor) + TimescaleDB (asyncpg)."""
import os
import motor.motor_asyncio

# MongoDB (async via Motor)
mongo_client: motor.motor_asyncio.AsyncIOMotorClient | None = None
mongo_db = None

async def connect_databases():
    """Connect to MongoDB and initialize TimescaleDB."""
    global mongo_client, mongo_db

    # MongoDB
    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        raise ValueError("FATAL: MONGO_URI environment variable is missing.")
    
    mongo_client = motor.motor_asyncio.AsyncIOMotorClient(mongo_uri)
    mongo_db = mongo_client.nexus
    print(f"[DB] MongoDB connected: {mongo_uri}")

    # TimescaleDB (asyncpg pool managed in timescale_writer)
    from app.utils.timescale_writer import init_timescale
    try:
        await init_timescale()
        print("[DB] TimescaleDB connected and schema initialized")
    except Exception as e:
        print(f"[DB] TimescaleDB connection failed (will retry): {e}")

async def close_databases():
    """Close database connections."""
    global mongo_client
    if mongo_client:
        mongo_client.close()

    from app.utils.timescale_writer import close_pool
    await close_pool()

def get_mongo_db():
    """Return the async Mongo database handle."""
    return mongo_db
