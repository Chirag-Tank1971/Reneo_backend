import type { Env } from './env.js';
import { getEnv } from './env.js';

const DEFAULT_DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

/** Matches production and preview deployments on Vercel. */
const VERCEL_ORIGIN = /^https:\/\/[\w.-]+\.vercel\.app$/i;

export function parseCorsOrigins(raw: string | undefined, nodeEnv: Env['NODE_ENV']): string[] {
  if (!raw?.trim()) {
    return nodeEnv === 'production' ? [] : [...DEFAULT_DEV_ORIGINS];
  }

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function createCorsOriginChecker(env: Env = getEnv()) {
  const allowedOrigins = parseCorsOrigins(env.CORS_ORIGINS, env.NODE_ENV);
  const allowVercelPreviews = env.CORS_ALLOW_VERCEL_PREVIEWS;

  return function corsOrigin(
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ): void {
    // Same-origin requests, curl, and some server-side clients omit Origin.
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    if (allowVercelPreviews && VERCEL_ORIGIN.test(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked origin: ${origin}`));
  };
}

export function getCorsConfig(env: Env = getEnv()) {
  return {
    origin: createCorsOriginChecker(env),
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  };
}
