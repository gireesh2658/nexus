# 🧠 Nexus — AI-Powered Real-Time Video Conferencing Platform

Nexus is an enterprise-grade, privacy-first, real-time video conferencing and collaboration platform designed for high-fidelity communication and multi-modal meeting intelligence. Built on a Selective Forwarding Unit (SFU) WebRTC architecture via **LiveKit**, Nexus features sub-second video/audio streams, multi-user collaborative whiteboarding, real-time closed captioning, client-side gaze/focus tracking, and automated post-meeting structured debriefs powered by **Google Gemini**.

---

## 🌟 Key Features

- **High-Performance WebRTC Audio/Video**: Low-latency video grids and screen sharing powered by LiveKit SFU.
- **Privacy-Preserving On-Device Focus Tracking**: Real-time head pose and eye-gaze tracking using MediaPipe FaceMesh in the browser with temporal hysteresis state smoothing to prevent false focus-loss alerts.
- **Local Speech Intelligence & Live Captions**: Self-hosted audio egress pipeline leveraging Silero VAD (Voice Activity Detection) and Faster-Whisper (int8 quantized CPU inference) publishing live captions directly over WebRTC data channels.
- **AI-Powered Post-Meeting Debriefs**: Automated structured executive summaries, key decisions, action items with owners/deadlines, and follow-up emails synthesized by the Google Gemini API (`google-genai` SDK).
- **Time-Series Meeting Telemetry**: Persistent storage of high-frequency attention metrics, participant presence, and transcripts inside a TimescaleDB hypertable.
- **Interactive Collaboration**: Real-time collaborative whiteboard, encrypted room chat, hand-raising, and floating emoji reactions.
- **Strict Meeting Lifecycle Management**: Deterministic room states (waiting room, active meeting, terminal ended states with HTTP 410 guarantees, heartbeat leases, and auto-cleanup).

---

## 🛠️ Architecture & Tech Stack

```text
                               +----------------------------------------+
                               |        React 19 Frontend (Vite)        |
                               | MediaPipe FaceMesh / LiveKit Client    |
                               +-------------------+--------------------+
                                                   |
                     +-----------------------------+-----------------------------+
                     | WebSocket (Signaling/Chat)                                | WebRTC Media / Data Channel
                     v                                                           v
       +----------------------------+                             +----------------------------+
       |   Signaling Server (Node)  |                             |     LiveKit SFU (WebRTC)   |
       |  Express / Socket.IO / TS  |                             | Port: 7880 (Audio/Video/CC)|
       +-------------+--------------+                             +--------------+-------------+
                     |                                                           | Audio Egress
                     | Prisma ORM                                                v
                     v                                            +----------------------------+
       +----------------------------+                             |      Analysis API (Python) |
       |  PostgreSQL / TimescaleDB  | <========================== | FastAPI / Silero VAD       |
       | Port: 5432 (App & Metrics) |   asyncpg Telemetry Writes  | Faster-Whisper / Gemini AI |
       +----------------------------+                             +----------------------------+
                     |                                                           |
                     +---------------------- Redis (Pub/Sub) --------------------+
```

### Stack Breakdown

- **Frontend**: React 19, TypeScript, Vite, TailwindCSS, Zustand, Framer Motion, Lucide Icons.
- **Media Ingress / SFU**: LiveKit WebRTC Server (selective forwarding unit).
- **Signaling Backend**: Node.js 20+, Express, TypeScript, Socket.IO, Prisma ORM, JSON Web Tokens (JWT).
- **Analysis API**: Python 3.12, FastAPI, Uvicorn, Faster-Whisper (`tiny.en`), Silero VAD, `google-genai` SDK.
- **Databases & Cache**: PostgreSQL 16 with TimescaleDB extension, Redis 7 (Pub/Sub, state caching, rate limiting).
- **Containerization**: Docker Compose (multi-container orchestration for local and production deployment).

---

## 📋 Prerequisites

Before running Nexus locally, ensure you have the following installed:

1. **Docker Desktop** (with Docker Compose v2)
2. **Node.js** (v18.0 or v20+ recommended) and **npm**
3. **Python** (v3.10 to v3.12) with virtual environment support
4. **Git**
5. **Google AI Studio API Key** (for post-meeting AI summaries)

---

## ⚙️ Environment Configuration

Nexus uses environment variables for service discovery, database connections, and API keys.

1. Copy the example environment template:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and configure your settings:
   - `APP_DATABASE_URL`: Connection string for PostgreSQL (`postgresql://postgres:password@localhost:5432/nexus`).
   - `TELEMETRY_DATABASE_URL`: Connection string for TimescaleDB.
   - `JWT_SECRET`: 64+ character random string for signing tokens.
   - `GEMINI_API_KEY`: Your Google AI Studio API key.
   - `LIVEKIT_API_KEY` & `LIVEKIT_API_SECRET`: Defaults to `devkey` / `secret12345678901234567890123456789012` for local development.

---

## 🚀 Quickstart: Single-Command Launch (Windows)

For local development on Windows, an automated orchestration script is provided in `scripts/`:

```powershell
.\scripts\start_nexus_local.ps1
```

The script:
1. Validates and starts Docker containers (`nexus-timescale`, `nexus-redis-1`, `nexus-livekit-1`).
2. Applies pending Prisma database migrations.
3. Initializes the Analysis API (FastAPI) on port `8000`.
4. Starts the Signaling Server (Node.js/Socket.IO) on port `4000`.
5. Boots the Vite Frontend development server on port `3000`.
6. Continuously verifies service health before opening.

To verify system status without starting new processes:
```powershell
.\scripts\start_nexus_local.ps1 -CheckOnly
```

---

## 📦 Manual Step-by-Step Setup

If running without the PowerShell script:

### 1. Start Infrastructure Containers
```bash
docker compose up -d timescale redis livekit
```

### 2. Setup Signaling Backend
```bash
cd signaling-server
npm install
npx prisma migrate deploy
npm run dev
```
Signaling API runs on `http://localhost:4000`.

### 3. Setup Python Analysis API
```bash
cd analysis-api
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Analysis API runs on `http://localhost:8000`.

### 4. Setup Frontend Client
```bash
cd frontend
npm install
npm run dev
```
Client runs on `http://localhost:3000`.

---

## 🧪 Testing & Quality Assurance

Nexus includes unit, regression, integration, and end-to-end browser suites:

### 1. Frontend Focus State Machine Unit Tests
Tests the 28 temporal gaze/focus states, recovery windows, and debounce algorithms:
```bash
cd signaling-server
npm test
```

### 2. Gemini AI Debrief Unit Tests
Tests structured schema generation, transient 503 retry loops, credential redaction, and error handling:
```bash
python -m unittest analysis-api/tests/test_gemini_unit.py -v
```

### 3. Meeting Lifecycle Regression Suite (16 Scenarios)
Verifies schedule expiration, token invalidation, waiting room access, and HTTP 410 terminal states:
```bash
python test_meeting_lifecycle_regression.py
```

### 4. Backend Acceptance & Health Suite (12 Scenarios)
Validates complete user registration, authentication, room tokens, and database integration:
```bash
python test_acceptance_suite.py
```

### 5. Multi-User Integration Suite (3 Participants)
Automated Playwright browser test simulating host and two guest participants simultaneously:
```bash
python test_phase11_multi_user_e2e.py
```

### 6. End-to-End Audio Pipeline Verification
Tests audio frame ingestion -> Silero VAD segmentation -> Faster-Whisper transcription -> TimescaleDB -> Gemini debrief:
```bash
python test_audio_to_summary_e2e.py
```

---

## ⚠️ Known Hardware Limitations

- **Physical Microphone Input**:
  In local headless browser tests without direct user acoustic input, physical microphone tracks acquire successfully at 48kHz, but amplitude remains near baseline (<50 peak int16), which is classified as `HOLD / UNVERIFIED` until audible speech is delivered.
  The software transcription pipeline (Silero VAD, Faster-Whisper int8, and Gemini summarization) is fully verified with audible and synthetic speech streams.
- **Collaborative Whiteboard Persistence**:
  Whiteboard strokes synchronize in real-time across participants over Socket.IO during an active meeting. In the current release, whiteboard canvas data is transient to the live meeting session and is not stored permanently in PostgreSQL after meeting termination.

---

## 🔒 Security & Data Privacy

- **On-Device Computer Vision**: Facial tracking and gaze orientation are computed locally in the client browser using WebAssembly. Raw camera video frames are never streamed to the analysis server for focus detection.
- **Secret Redaction**: All API error handlers intercept and redact database connection credentials and API keys before logging or persisting meeting summaries.
- **Terminal Token Invalidation**: Once a meeting is ended by the host, tokens immediately return HTTP 410 Gone, and participants are forcefully disconnected.
- **Secure Cookies & CORS**: Strict same-site cookie attributes and configurable origin whitelists prevent cross-origin abuse.

---

## 📄 License

This project is licensed under the MIT License.
