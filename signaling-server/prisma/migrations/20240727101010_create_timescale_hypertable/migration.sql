-- Enable the TimescaleDB extension on the Postgres database
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Safely convert the meeting_telemetry table into a time-series hypertable
-- (The Prisma schema uses 'time' as the DateTime identifier)
SELECT create_hypertable('meeting_telemetry', 'time', if_not_exists => TRUE);
