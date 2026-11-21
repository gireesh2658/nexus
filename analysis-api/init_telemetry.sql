-- analysis-api/init_telemetry.sql (Raw SQL Initialization Script)

-- 1. Ensure the Timescale extension is loaded
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 2. Create the standard Postgres table
CREATE TABLE IF NOT EXISTS meeting_telemetry (
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    meeting_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    payload JSONB NOT NULL
);

-- 3. Convert the table into a Timescale Hypertable
SELECT create_hypertable('meeting_telemetry', 'recorded_at', if_not_exists => TRUE);

-- 4. Create indexes on meeting_telemetry for fast querying
CREATE INDEX IF NOT EXISTS idx_telemetry_payload_gin ON meeting_telemetry USING GIN (payload);
CREATE INDEX IF NOT EXISTS idx_telemetry_meeting_time ON meeting_telemetry (meeting_id, recorded_at DESC);
