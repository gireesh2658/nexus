import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis1 } from '../config/redis';

/**
 * Build the rate-limit store config.
 * When Redis is available, uses RedisStore; otherwise falls back to MemoryStore.
 */
const buildStore = () => {
  if (redis1) {
    try {
      return new RedisStore({
        // @ts-expect-error - ioredis and rate-limit-redis typing mismatch
        sendCommand: (...args: string[]) => redis1.call(args[0], ...args.slice(1)),
      });
    } catch {
      return undefined;
    }
  }
  return undefined; // express-rate-limit defaults to MemoryStore
};

const isDev = process.env.NODE_ENV !== 'production';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: isDev ? 10000 : 1000, // Generous limit in dev, 1000 in prod
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again in 15 minutes.' },
  store: buildStore(),
  skip: () => process.env.DISABLE_RATE_LIMIT === 'true',
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 100 : 15,        // 15 failed attempts per 15 mins in prod, 100 in dev
  skipSuccessfulRequests: true, // Do not penalize successful logins/registrations
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Try again in 15 minutes.' },
  store: buildStore(),
  skip: () => process.env.DISABLE_RATE_LIMIT === 'true',
});
