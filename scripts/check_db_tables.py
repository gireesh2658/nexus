import asyncio
import asyncpg

async def check():
    conn = await asyncpg.connect('postgresql://postgres:password@localhost:5432/nexus')
    tables = ['User', 'Meeting', 'Participant', 'MeetingSummary', 'Transcription', 'AbuseIncident', 'UserSession', 'meeting_telemetry', 'focus_events']
    print("--- POSTGRESQL / TIMESCALEDB ROW COUNT AUDIT ---")
    for t in tables:
        try:
            cnt = await conn.fetchval(f'SELECT count(*) FROM "{t}"')
            print(f"Table '{t}': {cnt} rows")
        except Exception as e:
            print(f"Table '{t}': error ({e})")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(check())
