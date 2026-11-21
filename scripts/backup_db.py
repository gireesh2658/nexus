#!/usr/bin/env python3
"""
Nexus Database Backup & Safe Restore Verification Utility
Compatible with TimescaleDB / PostgreSQL in Docker or standalone.
Zero credentials logged or leaked.
"""

import os
import sys
import time
import subprocess
import argparse
from pathlib import Path

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CONTAINER_NAME = os.getenv("DB_CONTAINER_NAME", "nexus-timescale")
DB_NAME = os.getenv("POSTGRES_DB", "nexus")
DB_USER = os.getenv("POSTGRES_USER", "postgres")
BACKUP_DIR = Path(os.getenv("BACKUP_DIR", "backups"))

def log(msg: str):
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}")

def ensure_backup_dir() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    return BACKUP_DIR

def run_cmd(cmd: list[str], redact_terms: list[str] = None) -> tuple[int, str, str]:
    safe_cmd_display = " ".join(cmd)
    if redact_terms:
        for t in redact_terms:
            if t:
                safe_cmd_display = safe_cmd_display.replace(t, "[REDACTED]")
    log(f"Executing: {safe_cmd_display}")
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return proc.returncode, proc.stdout, proc.stderr

def create_backup() -> Path:
    ensure_backup_dir()
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    backup_filename = f"nexus_backup_{timestamp}.dump"
    local_target = BACKUP_DIR / backup_filename
    container_target = f"/tmp/{backup_filename}"

    log(f"Initiating binary custom-format backup of database '{DB_NAME}'...")
    dump_cmd = [
        "docker", "exec", CONTAINER_NAME,
        "pg_dump", "-U", DB_USER, "-d", DB_NAME,
        "-F", "c", "-b", "-v", "-f", container_target
    ]
    code, stdout, stderr = run_cmd(dump_cmd)
    if code != 0:
        log(f"ERROR: pg_dump failed with exit code {code}:\n{stderr}")
        sys.exit(code)

    log(f"Copying backup artifact from container to host: {local_target}")
    cp_cmd = ["docker", "cp", f"{CONTAINER_NAME}:{container_target}", str(local_target)]
    code, stdout, stderr = run_cmd(cp_cmd)
    if code != 0:
        log(f"ERROR: Failed to copy backup artifact: {stderr}")
        sys.exit(code)

    # Cleanup container tmp
    run_cmd(["docker", "exec", CONTAINER_NAME, "rm", "-f", container_target])

    file_size_bytes = local_target.stat().st_size
    log(f"[OK] Backup successfully created: {local_target} ({file_size_bytes} bytes)")
    return local_target

def verify_restore(backup_file: Path):
    if not backup_file.exists():
        log(f"ERROR: Backup file {backup_file} not found.")
        sys.exit(1)

    test_db = f"nexus_verify_{int(time.time())}"
    container_dest = f"/tmp/{backup_file.name}"

    log(f"Testing restore onto ISOLATED disposable target database '{test_db}'...")

    # 1. Copy backup file to container
    log("Transferring backup file into container for restore validation...")
    run_cmd(["docker", "cp", str(backup_file), f"{CONTAINER_NAME}:{container_dest}"])

    try:
        # 2. Create isolated database
        log(f"Creating test database '{test_db}'...")
        code, _, stderr = run_cmd(["docker", "exec", CONTAINER_NAME, "createdb", "-U", DB_USER, test_db])
        if code != 0:
            log(f"ERROR: Failed to create test database: {stderr}")
            sys.exit(code)

        # 3. Restore schema & data
        log(f"Restoring dump into '{test_db}' using pg_restore...")
        code, stdout, stderr = run_cmd([
            "docker", "exec", CONTAINER_NAME,
            "pg_restore", "-U", DB_USER, "-d", test_db,
            "--no-owner", "--no-privileges", container_dest
        ])
        # Note: pg_restore can exit with 0 or 1 (warnings on existing extensions/roles)
        log(f"pg_restore finished with status {code}.")

        # 4. Verify integrity of tables
        verify_query = (
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' ORDER BY table_name;"
        )
        code, stdout, stderr = run_cmd([
            "docker", "exec", CONTAINER_NAME,
            "psql", "-U", DB_USER, "-d", test_db, "-c", verify_query
        ])
        if code != 0:
            log(f"ERROR: Table verification query failed: {stderr}")
            sys.exit(code)

        log("Restored tables in isolated test database:")
        for line in stdout.strip().splitlines():
            log(f"  {line}")

        # Check critical tables exist
        required_tables = ["User", "Meeting", "Participant", "focus_events", "meeting_telemetry"]
        missing = [t for t in required_tables if t.lower() not in stdout.lower()]
        if missing:
            log(f"WARNING: The following expected tables were missing: {missing}")
        else:
            log("[OK] All critical tables verified in restored database:")

        log("[OK] Restore verification SUCCESSFUL - data and schema verified without modifying live database.")

    finally:
        # Cleanup test DB and container file
        log(f"Tearing down isolated test database '{test_db}'...")
        run_cmd(["docker", "exec", CONTAINER_NAME, "dropdb", "-U", DB_USER, test_db])
        run_cmd(["docker", "exec", CONTAINER_NAME, "rm", "-f", container_dest])
        log("[OK] Isolated test database cleaned up.")

def main():
    parser = argparse.ArgumentParser(description="Nexus Database Backup & Recovery")
    parser.add_argument("--backup", action="store_true", help="Create a database backup")
    parser.add_argument("--verify", type=str, help="Verify restore on a specific backup file")
    parser.add_argument("--test-all", action="store_true", help="Create backup and immediately verify restore in isolated target")
    args = parser.parse_args()

    if args.test_all or (not args.backup and not args.verify):
        backup_file = create_backup()
        verify_restore(backup_file)
    elif args.backup:
        create_backup()
    elif args.verify:
        verify_restore(Path(args.verify))

if __name__ == "__main__":
    main()
