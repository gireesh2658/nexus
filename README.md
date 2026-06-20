# 🧠 Nexus

Nexus is a state-of-the-art, real-time video conferencing and collaboration platform designed for extreme performance and intelligence. Powered by WebRTC via LiveKit, it supports high-fidelity audio, seamless video grids, and instant messaging. Beyond standard meetings, Nexus incorporates intelligent features like facial tracking, live transcription, and Google Gemini AI-powered post-meeting debriefs, providing an unparalleled user experience.

## 🛠️ Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Zustand (State Management), TailwindCSS
- **Real-Time Video/Audio:** LiveKit (WebRTC)
- **Backend:** Node.js, Express, Socket.IO (for signaling), Mongoose
- **Database:** MongoDB (via Atlas) & Neon PostgreSQL
- **AI/ML:** Google Gemini API (for intelligent meeting summaries), MediaPipe (for facial tracking)
- **Infrastructure:** Redis (Pub/Sub & Caching)
- **Agent Architecture:** Built and optimized by Antigravity

## 📋 Prerequisites

Before you can run Nexus locally, you must have the following installed on your machine:
1. **Node.js:** v18.0 or higher
2. **npm** or **yarn**
3. **MongoDB:** A local instance running on port 27017 or a MongoDB Atlas URI
4. **Redis:** A local Redis server running on port 6379

## 🚀 Getting Started

Follow these steps carefully to spin up the entire Nexus stack.

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/nexus.git
cd nexus
```

### 2. Configure Environment Variables
You must configure the central environment file before booting the servers.
```bash
cp .env.example .env
```
Open `.env` and fill in the required keys, specifically your `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `GEMINI_API_KEY`. (See the Environment Variables section below).

### 3. Install Dependencies
Install dependencies for both the frontend and the signaling server.
```bash
# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../signaling-server
npm install
```

### 4. Run the Development Servers
You will need two terminal windows to run both servers simultaneously.

**Terminal 1 (Backend):**
```bash
cd signaling-server
npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```
The application will now be running at `http://localhost:3000`.

## 🔐 Environment Variables

The `.env` file at the root controls the entire application. The following variables are required:

- `JWT_SECRET`: A secure, 64+ character string used for signing authentication tokens.
- `MONGO_URI`: Connection string for your MongoDB database.
- `PORT`: The port for the backend server (default: 4000).
- `LIVEKIT_API_KEY`: Found in your LiveKit Cloud Dashboard under Settings > Keys.
- `LIVEKIT_API_SECRET`: The corresponding secret for your LiveKit key.
- `LIVEKIT_WS_URL`: Your project's WebSocket URL from LiveKit (e.g., `wss://your-project.livekit.cloud`).
- `VITE_LIVEKIT_WS_URL`: The exact same WebSocket URL, exposed to the Vite frontend.
- `GEMINI_API_KEY`: Your Google AI Studio API key used to generate intelligent meeting summaries.

*Note: Any additional integrations like Cloudinary, Resend, or TimescaleDB are documented in `.env.example` but are optional for basic execution.*

## 📁 Folder Structure

```text
nexus/
├── .env                  # Master environment variables (gitignored)
├── .env.example          # Documentation of all required env variables
├── .gitignore            # Unified ignore rules for the entire monorepo
├── package.json          # Root workspace metadata
├── frontend/             # The React/Vite web client
│   ├── src/
│   │   ├── components/   # React UI components (LiveKit Grid, Controls)
│   │   ├── hooks/        # Custom React hooks (Transcription, FaceMesh)
│   │   ├── pages/        # Route layouts (MeetingRoom, Dashboard)
│   │   ├── services/     # API clients and WebSocket bindings
│   │   └── store/        # Zustand state management
│   └── vite.config.ts    # Vite configuration (wired to root .env)
├── signaling-server/     # Node.js/Express backend
│   ├── src/
│   │   ├── controllers/  # Route logic and AI meeting summary generation
│   │   ├── models/       # Mongoose schemas
│   │   ├── routes/       # Express REST endpoints
│   │   └── sockets/      # Socket.IO logic for live chat/whiteboard
└── analysis-api/         # (Optional) Python FastAPI for advanced ML workloads
```

## ☁️ Deployment to Antigravity

Nexus is designed to be fully compatible with Antigravity infrastructure. 
1. Connect your GitHub repository to Antigravity.
2. In the deployment configuration, set the Frontend build command to `npm run build` within the `/frontend` directory and the output directory to `dist`.
3. Set the Backend build command to `npm run build` and the start command to `npm start` within the `/signaling-server` directory.
4. Ensure all environment variables from your `.env` file are copied into the Antigravity project dashboard.

---
*Developed with extreme precision. Built like an Ultra Promax Developer.*
