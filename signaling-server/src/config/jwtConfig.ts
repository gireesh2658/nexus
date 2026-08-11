/**
 * JWT configuration.
 *
 * In production set JWT_PRIVATE_KEY and JWT_PUBLIC_KEY env vars (PEM format).
 * In development a deterministic HS256 secret is used so tokens survive
 * server restarts (RSA key-pair generation on every restart invalidated
 * all sessions — that was a bug).
 */

const isProd = process.env.NODE_ENV === 'production';

// Production: RS256 with external PEM keys
// Development: HS256 with a stable secret
const algorithm = (isProd && process.env.JWT_PRIVATE_KEY) ? 'RS256' as const : 'HS256' as const;

const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('FATAL: JWT_SECRET is not set.');

export const jwtConfig = {
  // For HS256, privateKey / publicKey both resolve to the symmetric secret.
  // For RS256, they resolve to the PEM-encoded key pair from env.
  privateKey: process.env.JWT_PRIVATE_KEY || secret,
  publicKey:  process.env.JWT_PUBLIC_KEY  || secret,
  expiresIn: '24h' as const,
  algorithm,
};

export default jwtConfig;
