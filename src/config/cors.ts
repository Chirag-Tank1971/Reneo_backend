import type { Env } from './env.js';
import { getEnv } from './env.js';

const DEFAULT_DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

/**
 * Vercel production + preview URLs, e.g.
 * https://reneo-frontend.vercel.app
 * https://reneo-frontend-ljxgze7w7-chirag-tank1971s-projects.vercel.app
 */
const VERCEL_ORIGIN = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

export function parseCorsOrigins(raw: string | undefined, nodeEnv: Env['NODE_ENV']): string[] {
  if (!raw?.trim()) {
    return nodeEnv === 'production' ? [] : [...DEFAULT_DEV_ORIGINS];
  }

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isOriginAllowed(
  origin: string | undefined,
  env: Pick<Env, 'NODE_ENV' | 'CORS_ORIGINS' | 'CORS_ALLOW_VERCEL_PREVIEWS'>,
): boolean {
  if (!origin) return true;

  const allowedOrigins = parseCorsOrigins(env.CORS_ORIGINS, env.NODE_ENV);
  if (allowedOrigins.includes(origin)) return true;

  if (env.CORS_ALLOW_VERCEL_PREVIEWS && VERCEL_ORIGIN.test(origin)) return true;

  return false;
}

export function createCorsOriginChecker(env: Env = getEnv()) {
  return function corsOrigin(
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ): void {
    callback(null, isOriginAllowed(origin, env));
  };
}

export function getCorsConfig(env: Env = getEnv()) {
  return {
    origin: createCorsOriginChecker(env),
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    optionsSuccessStatus: 204,
  };
}
