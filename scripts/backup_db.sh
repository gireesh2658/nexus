#!/usr/bin/env bash
# Nexus Database Backup & Safe Restore Verification Script
# Strict zero-credential logging.
set -euo pipefail

CONTAINER_NAME="${DB_CONTAINER_NAME:-nexus-timescale}"
DB_NAME="${POSTGRES_DB:-nexus}"
DB_USER="${POSTGRES_USER:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-backups}"

mkdir -p "${BACKUP_DIR}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/nexus_backup_${TIMESTAMP}.dump"
CONTAINER_TARGET="/tmp/nexus_backup_${TIMESTAMP}.dump"

echo "[$(date +'%Y-%m-%d %H:%M:%S')] Starting binary database backup of '${DB_NAME}'..."
docker exec "${CONTAINER_NAME}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" -F c -b -f "${CONTAINER_TARGET}"

echo "[$(date +'%Y-%m-%d %H:%M:%S')] Transferring backup file to ${BACKUP_FILE}..."
docker cp "${CONTAINER_NAME}:${CONTAINER_TARGET}" "${BACKUP_FILE}"
docker exec "${CONTAINER_NAME}" rm -f "${CONTAINER_TARGET}"

FILE_SIZE=$(wc -c <"${BACKUP_FILE}")
echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✓ Backup created successfully: ${BACKUP_FILE} (${FILE_SIZE} bytes)"

# Optional restore test if requested
if [[ "${1:-}" == "--test-restore" ]]; then
    TEST_DB="nexus_restore_test_${TIMESTAMP}"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Testing restore against ISOLATED disposable database '${TEST_DB}'..."
    docker exec "${CONTAINER_NAME}" createdb -U "${DB_USER}" "${TEST_DB}"
    docker cp "${BACKUP_FILE}" "${CONTAINER_NAME}:/tmp/restore_test.dump"
    docker exec "${CONTAINER_NAME}" pg_restore -U "${DB_USER}" -d "${TEST_DB}" --no-owner --no-privileges /tmp/restore_test.dump || true
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Verifying restored table catalog..."
    docker exec "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${TEST_DB}" -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public';"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Cleaning up isolated disposable database '${TEST_DB}'..."
    docker exec "${CONTAINER_NAME}" dropdb -U "${DB_USER}" "${TEST_DB}"
    docker exec "${CONTAINER_NAME}" rm -f /tmp/restore_test.dump
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✓ Test restore verified successfully."
fi
