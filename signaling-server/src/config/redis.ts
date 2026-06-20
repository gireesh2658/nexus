import Redis from 'ioredis';

/**
 * Redis DB 1 — Session cache (refresh tokens / blacklists).
 *
 * We strip any trailing /N from REDIS_URL so we can force db=1.
 * The .env REDIS_URL may already contain /0 for the default db.
 */
const rawUri = process.env.REDIS_URL;
if (!rawUri) throw new Error('FATAL: REDIS_URL environment variable is missing.');
const baseUri = rawUri.replace(/\/\d+$/, '');   // strip trailing /0, /1, etc.

export const redis1 = new Redis(`${baseUri}/0`);

redis1.on('error', (err) => {
  console.error('[Redis DB 1] Error:', err.message);
});

redis1.on('connect', () => {
  console.log('[Redis DB 1] Connected for Session cache');
});
