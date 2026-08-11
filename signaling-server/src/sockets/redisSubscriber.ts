import { Server } from 'socket.io';
import Redis from 'ioredis';

export const initRedisSubscriber = (io: Server) => {
  const rawUrl = process.env.REDIS_URL;
  if (!rawUrl) {
    console.warn('[Redis] REDIS_URL not set — skipping Pub/Sub subscriber.');
    return;
  }
  const baseUrl = rawUrl.replace(/\/\d+$/, '');   // strip trailing /N
  const signalDb = parseInt(process.env.SIGNAL_REDIS_DB || '0', 10);

  const subscriber = new Redis(`${baseUrl}/${signalDb}`, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 5) {
        console.warn('[Redis] Subscriber giving up after 5 retries.');
        return null;
      }
      return Math.min(times * 500, 3000);
    },
    enableOfflineQueue: false,
  });

  subscriber.on('connect', () => {
    console.log(`[Redis] Subscriber connected to DB ${signalDb} for ML events`);
  });

  subscriber.on('error', (err) => {
    console.error(`[Redis] Subscriber Error:`, err.message);
  });

  // Subscribe to channels emitted by Python Celery workers
  subscriber.subscribe('moderation_events', 'live_subtitles', (err, count) => {
    if (err) {
      console.error('[Redis] Failed to subscribe:', err);
    }
  });

  // Handle incoming messages
  subscriber.on('message', (channel, message) => {
    try {
      if (channel === 'moderation_events') {
        const data = JSON.parse(message);
        const { meetingId, participantId, userId, warnings, action } = data;

        // Broadcast alert to the meeting room
        io.to(`meeting:${meetingId}`).emit('moderation_alert', {
          participantId,
          warnings,
          action,
          message: action === 'kicked'
            ? 'User was removed due to repeated policy violations.'
            : 'Warning: Toxic behavior detected. Further violations may result in removal.',
        });
      } else if (channel === 'live_subtitles') {
        const data = JSON.parse(message);
        const { meetingId, participantId, text } = data;
        io.to(`meeting:${meetingId}`).emit('live_subtitle', { participantId, text });
      }
    } catch (e) {
      console.error('[Redis] Failed to process message:', e);
    }
  });
};
