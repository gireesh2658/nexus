import './env';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import connectDB from './config/db';
import authRoutes from './routes/authRoutes';
import meetingRoutes from './routes/meetingRoutes';
import { errorMiddleware } from './middleware/errorMiddleware';
import { setupMeetingHandler } from './sockets/meetingHandler';
import { initRedisSubscriber } from './sockets/redisSubscriber';
import { apiLimiter, authLimiter } from './middleware/rateLimiter';
import { initMailer } from './services/mailer';

import path from 'path';

const app = express();
const server = http.createServer(app);

// Resolve allowed origins — NEVER fall back to '*'
const devOrigins = 'http://localhost:3000,http://localhost:5173';
let allowedOriginsString = process.env.ALLOWED_ORIGIN || devOrigins;
// In dev, always add the dev origins even if ALLOWED_ORIGIN is set
if (process.env.NODE_ENV !== 'production') {
  allowedOriginsString = `${allowedOriginsString},${devOrigins}`;
}
const ALLOWED_ORIGINS: string[] = [...new Set(allowedOriginsString.split(',').map(s => s.trim()).filter(Boolean))];

// HTTPS redirect (production only, behind a reverse proxy)
// app.use((req, res, next) => {
//   if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
//     return res.redirect(301, 'https://' + req.headers.host + req.url);
//   }
//   next();
// });

// Trust proxy (required for secure cookies and rate limiting behind reverse proxies)
app.set('trust proxy', 1);

// Security headers (Helmet)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'blob:'],
      connectSrc: [
        "'self'",
        ...(process.env.VITE_SIGNAL_URL ? [process.env.VITE_SIGNAL_URL] : []),
        ...(process.env.VITE_ANALYSIS_URL ? [process.env.VITE_ANALYSIS_URL] : []),
        'wss:',
        'ws:',
      ],
      mediaSrc: ["'self'", 'blob:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Rate Limiting
app.use('/api/', apiLimiter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'nexus-signaling-server', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);

// Error handler
app.use(errorMiddleware);

// Socket.IO handlers
setupMeetingHandler(io);

// Redis Pub/Sub for ML events
initRedisSubscriber(io);

// Start server
const PORT = process.env.PORT || 4000;

const startServer = async () => {
  await connectDB();
  await initMailer();
  server.listen(PORT, () => {
    console.log(`\n🚀 Nexus Signaling Server running on port ${PORT}`);
    console.log(`🔗 API: http://localhost:${PORT}/api`);
    console.log(`🔒 CORS origins: ${ALLOWED_ORIGINS.join(', ')}\n`);
  });
};

startServer().catch(console.error);

// Global error handlers — prevent silent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error);
  process.exit(1);
});

export { io };
