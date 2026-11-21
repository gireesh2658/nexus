-- 20261115140000_telemetry_timescale_fix/migration.sql
-- Forward corrective migration to establish canonical TimescaleDB telemetry schema

-- 1. Ensure TimescaleDB extension is active
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 2. Create canonical meeting_telemetry table on recorded_at
CREATE TABLE IF NOT EXISTS meeting_telemetry (
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meeting_id      TEXT NOT NULL,
    participant_id  TEXT NOT NULL,
    payload         JSONB NOT NULL
);

-- 3. Handle schema migration if legacy 'time' column was created
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'meeting_telemetry' 
          AND column_name = 'time'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'meeting_telemetry' 
          AND column_name = 'recorded_at'
    ) THEN
        ALTER TABLE meeting_telemetry RENAME COLUMN "time" TO recorded_at;
    END IF;
END $$;

-- 4. Convert meeting_telemetry into hypertable partitioned on recorded_at
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.hypertables 
        WHERE hypertable_name = 'meeting_telemetry'
    ) THEN
        PERFORM create_hypertable('meeting_telemetry', 'recorded_at', if_not_exists => TRUE);
    END IF;
END $$;

-- 5. Create fast querying indexes on meeting_telemetry
CREATE INDEX IF NOT EXISTS idx_telemetry_payload_gin ON meeting_telemetry USING GIN (payload);
CREATE INDEX IF NOT EXISTS idx_telemetry_meeting_time ON meeting_telemetry (meeting_id, recorded_at DESC);

-- 6. Create analytical focus_events table
CREATE TABLE IF NOT EXISTS focus_events (
    focus_id         BIGSERIAL,
    participant_id   VARCHAR(128) NOT NULL,
    meeting_id       VARCHAR(128) NOT NULL,
    visual_score     FLOAT,
    behavioral_score FLOAT,
    audio_score      FLOAT,
    final_score      INTEGER NOT NULL CHECK (final_score >= 0 AND final_score <= 100),
    face_present     BOOLEAN DEFAULT TRUE,
    is_calibration   BOOLEAN DEFAULT FALSE,
    recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Convert focus_events into hypertable and configure columnstore compression
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.hypertables 
        WHERE hypertable_name = 'focus_events'
    ) THEN
        PERFORM create_hypertable('focus_events', 'recorded_at', if_not_exists => TRUE);
    END IF;

    -- Enable columnstore compression
    BEGIN
        ALTER TABLE focus_events SET (
            timescaledb.compress,
            timescaledb.compress_segmentby = 'meeting_id, participant_id',
            timescaledb.compress_orderby = 'recorded_at DESC'
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- Add compression policy (7 days)
    BEGIN
        PERFORM add_compression_policy('focus_events', INTERVAL '7 days', if_not_exists => TRUE);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- Add retention policy (90 days)
    BEGIN
        PERFORM add_retention_policy('focus_events', INTERVAL '90 days', if_not_exists => TRUE);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END $$;

CREATE INDEX IF NOT EXISTS idx_fe_meeting ON focus_events (meeting_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_fe_participant ON focus_events (participant_id, meeting_id, recorded_at DESC);

-- 8. Create participant_baselines table
CREATE TABLE IF NOT EXISTS participant_baselines (
    id                BIGSERIAL PRIMARY KEY,
    participant_id    VARCHAR(128) NOT NULL,
    meeting_id        VARCHAR(128) NOT NULL,
    baseline_visual   FLOAT NOT NULL DEFAULT 0.0,
    baseline_behav    FLOAT NOT NULL DEFAULT 0.0,
    baseline_audio    FLOAT NOT NULL DEFAULT 0.0,
    baseline_final    FLOAT NOT NULL DEFAULT 0.0,
    sample_count      INTEGER NOT NULL DEFAULT 0,
    captured_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (participant_id, meeting_id)
);
