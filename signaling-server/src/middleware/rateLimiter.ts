import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis1, isRedisAvailable } from '../config/redis';

/**
 * Build the rate-limit store config.
 * Falls back to the default in-memory store when Redis is unavailable
 * (e.g. local dev without a running Redis server).
 */
const buildStore = () => {
  if (redis1 && isRedisAvailable()) {
    return new RedisStore({
      // @ts-expect-error - ioredis and rate-limit-redis typing mismatch
      sendCommand: (...args: string[]) => redis1.call(args[0], ...args.slice(1)),
    });
  }
  console.warn('[RateLimiter] Redis unavailable — using in-memory store.');
  return undefined; // express-rate-limit defaults to MemoryStore
};

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // 100 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again in 15 minutes.' },
  store: buildStore(),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,                    // 15 requests per 15 minutes
  message: { error: 'Too many auth attempts. Try again in 15 minutes.' },
  store: buildStore(),
});
