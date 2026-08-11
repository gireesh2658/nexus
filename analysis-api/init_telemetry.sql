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

-- 4. Create a GIN index on the JSONB payload for ultra-fast deep key querying
CREATE INDEX idx_telemetry_payload_gin ON meeting_telemetry USING GIN (payload);
