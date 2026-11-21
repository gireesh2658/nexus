#!/usr/bin/env python3
"""
Nexus Controlled Load & Concurrency Benchmark
Evaluates local API latency, concurrent meeting creation, analytics query speed,
and TimescaleDB write responsiveness under bounded concurrency.
"""

import os
import sys
import time
from datetime import datetime, timezone
import asyncio
import statistics
import requests
import asyncpg
import concurrent.futures

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Use 127.0.0.1 directly to avoid Windows IPv6 localhost DNS resolution fallback latency
SIGNAL_URL = os.getenv("SIGNAL_URL", "http://127.0.0.1:4000/api")
ANALYSIS_URL = os.getenv("ANALYSIS_URL", "http://127.0.0.1:8000/api")

def log(msg: str):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def benchmark_endpoint(name: str, url: str, num_requests: int = 50, concurrency: int = 5, headers: dict = None):
    log(f"Benchmarking {name} ({url}) with {num_requests} requests (concurrency={concurrency})...")
    latencies = []
    errors = 0

    def fetch():
        start = time.perf_counter()
        try:
            r = requests.get(url, headers=headers, timeout=5)
            duration = (time.perf_counter() - start) * 1000.0
            return (r.status_code == 200, duration)
        except Exception:
            return (False, 0.0)

    start_total = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(fetch) for _ in range(num_requests)]
        for f in concurrent.futures.as_completed(futures):
            ok, duration = f.result()
            if ok:
                latencies.append(duration)
            else:
                errors += 1
    total_time = time.perf_counter() - start_total

    rps = num_requests / total_time if total_time > 0 else 0
    if latencies:
        avg_lat = statistics.mean(latencies)
        p95_lat = statistics.quantiles(latencies, n=20)[18] if len(latencies) >= 20 else max(latencies)
        min_lat = min(latencies)
        max_lat = max(latencies)
        log(f"  [OK] {name}: {len(latencies)}/{num_requests} ok | Errors: {errors} | Avg: {avg_lat:.2f}ms | p95: {p95_lat:.2f}ms | Min: {min_lat:.2f}ms | Max: {max_lat:.2f}ms | Throughput: {rps:.1f} req/s")
    else:
        log(f"  [FAIL] {name}: 0 successful requests | Errors: {errors}")
    return {"avg_ms": avg_lat if latencies else None, "errors": errors, "rps": rps}

def run_concurrent_meeting_creations(count: int = 5):
    log(f"\nTesting concurrent meeting creations ({count} meetings)...")
    ts = int(time.time() * 1000) % 1000000
    host_user = f"loadhost_{ts}"
    guest_user = f"loadguest_{ts}"
    
    # 1. Register host
    reg_host = requests.post(f"{SIGNAL_URL}/auth/register", json={
        "name": "Load Host",
        "username": host_user,
        "email": f"{host_user}@example.com",
        "password": "Password123!"
    })
    token = reg_host.json().get("token")
    if not token:
        log(f"  [FAIL] Could not register test host: {reg_host.text}")
        return None, []

    # 2. Register guest to invite
    requests.post(f"{SIGNAL_URL}/auth/register", json={
        "name": "Load Guest",
        "username": guest_user,
        "email": f"{guest_user}@example.com",
        "password": "Password123!"
    })

    headers = {"Authorization": f"Bearer {token}"}
    meeting_ids = []
    durations = []

    def create_meeting(idx: int):
        t0 = time.perf_counter()
        r = requests.post(f"{SIGNAL_URL}/meetings", headers=headers, json={
            "title": f"Load Benchmark Meeting {idx}",
            "scheduledAt": datetime.now(timezone.utc).isoformat(),
            "scheduledDurationMins": 30,
            "participantUsernames": [guest_user]
        })
        dur = (time.perf_counter() - t0) * 1000.0
        if r.status_code == 201:
            mid = r.json().get("meeting", {}).get("id")
            return True, dur, mid
        else:
            log(f"  [DEBUG] Meeting creation failed: {r.status_code} - {r.text}")
            return False, dur, None

    with concurrent.futures.ThreadPoolExecutor(max_workers=count) as executor:
        futures = [executor.submit(create_meeting, i) for i in range(count)]
        for f in concurrent.futures.as_completed(futures):
            ok, dur, mid = f.result()
            if ok and mid:
                durations.append(dur)
                meeting_ids.append(mid)

    if durations:
        log(f"  [OK] Created {len(meeting_ids)}/{count} meetings concurrently. Avg creation latency: {statistics.mean(durations):.2f}ms | p95: {max(durations):.2f}ms")
    else:
        log(f"  [FAIL] Meeting creations failed.")
    return token, meeting_ids

async def run_timescale_write_benchmark(num_records: int = 100):
    log(f"\nBenchmarking TimescaleDB direct write latency ({num_records} events)...")
    db_conn_str = (os.getenv("DATABASE_URL") or os.getenv("TELEMETRY_DATABASE_URL") or "postgresql://postgres:password@localhost:5432/nexus").split("?")[0]
    try:
        conn = await asyncpg.connect(db_conn_str)
        t0 = time.perf_counter()
        meeting_id = f"bench_{int(time.time())}"
        records = [
            (f"part_{i % 5}", meeting_id, 0.85, 0.90, 0.80, 85, True, False)
            for i in range(num_records)
        ]
        await conn.executemany(
            """
            INSERT INTO focus_events (participant_id, meeting_id, visual_score, behavioral_score, audio_score, final_score, face_present, is_calibration)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """,
            records
        )
        total_time = (time.perf_counter() - t0) * 1000.0
        avg_per_record = total_time / num_records
        log(f"  [OK] Batch wrote {num_records} focus_events in {total_time:.2f}ms ({avg_per_record:.3f}ms/event, {num_records / (total_time/1000):.1f} writes/s)")
        await conn.close()
    except Exception as e:
        log(f"  [WARN] TimescaleDB write benchmark warning: {e}")

def main():
    log("==================================================")
    log("NEXUS PRODUCTION LOAD & READINESS BENCHMARK")
    log("==================================================")

    # 1. Health checks baseline
    benchmark_endpoint("Signaling Liveness (/api/health/live)", f"{SIGNAL_URL}/health/live", num_requests=50, concurrency=5)
    benchmark_endpoint("Signaling Readiness (/api/health/ready)", f"{SIGNAL_URL}/health/ready", num_requests=50, concurrency=5)
    benchmark_endpoint("Analysis Liveness (/api/health/live)", f"{ANALYSIS_URL}/health/live", num_requests=50, concurrency=5)
    benchmark_endpoint("Analysis Readiness (/api/health/ready)", f"{ANALYSIS_URL}/health/ready", num_requests=50, concurrency=5)

    # 2. Meeting creation load
    token, meeting_ids = run_concurrent_meeting_creations(count=5)

    # 3. Analytics query benchmark
    if meeting_ids:
        mid = meeting_ids[0]
        benchmark_endpoint(
            "Analytics Query (/api/analytics/meeting/:id)",
            f"{ANALYSIS_URL}/analytics/meeting/{mid}",
            num_requests=20,
            concurrency=4,
            headers={"Authorization": f"Bearer {token}"}
        )

    # 4. TimescaleDB batch write throughput
    asyncio.run(run_timescale_write_benchmark(num_records=100))

    log("\n==================================================")
    log("[OK] Load & Readiness benchmark completed successfully.")
    log("==================================================")

if __name__ == "__main__":
    main()
