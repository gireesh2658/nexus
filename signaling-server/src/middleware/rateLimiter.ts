import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis1 } from '../config/redis';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // 100 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again in 15 minutes.' },
  store: new RedisStore({
    // @ts-expect-error - ioredis and rate-limit-redis typing mismatch
    sendCommand: (...args: string[]) => redis1.call(args[0], ...args.slice(1)),
  }),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,                    // Increased limit for local dev
  message: { error: 'Too many auth attempts. Try again in 15 minutes.' },
  store: new RedisStore({
    // @ts-expect-error - ioredis and rate-limit-redis typing mismatch
    sendCommand: (...args: string[]) => redis1.call(args[0], ...args.slice(1)),
  }),
});
