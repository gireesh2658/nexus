import Redis from 'ioredis';

/**
 * Redis DB 0 — Session cache (refresh tokens / blacklists).
 *
 * We strip any trailing /N from REDIS_URL so we can force db=0.
 * The .env REDIS_URL may already contain /0 for the default db.
 *
 * For local dev, Redis is optional — the server will still boot
 * if the remote Redis is unreachable.
 */
const rawUri = process.env.REDIS_URL;
if (!rawUri) console.warn('[Redis] REDIS_URL not set — Redis features disabled.');

const baseUri = rawUri ? rawUri.replace(/\/\d+$/, '') : '';

export const redis1 = rawUri
  ? new Redis(`${baseUri}/0`, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null;       // stop retrying after 5 attempts
        return Math.min(times * 500, 3000);
      },
      lazyConnect: false,
      enableOfflineQueue: false,
    })
  : (null as unknown as Redis);

if (redis1) {
  redis1.on('error', (err) => {
    console.error('[Redis DB 0] Error:', err.message);
  });

  redis1.on('connect', () => {
    console.log('[Redis DB 0] Connected for Session cache');
  });
}

export const isRedisAvailable = (): boolean => {
  return redis1 !== null && redis1.status === 'ready';
};
