import { describe, expect, it } from 'vitest';
import {
  createCorsOriginChecker,
  isOriginAllowed,
  parseCorsOrigins,
} from '../src/config/cors.js';

const baseEnv = {
  NODE_ENV: 'production' as const,
  PORT: 3000,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  DATABASE_URL: 'postgres://localhost/test',
  IDEMPOTENCY_TTL_DAYS: 7,
};

describe('CORS config', () => {
  it('allows localhost defaults in development', () => {
    const origins = parseCorsOrigins(undefined, 'development');
    expect(origins).toContain('http://localhost:5173');
  });

  it('allows configured production origins', () => {
    expect(
      isOriginAllowed('https://reneo.vercel.app', {
        ...baseEnv,
        CORS_ORIGINS: 'https://reneo.vercel.app',
        CORS_ALLOW_VERCEL_PREVIEWS: false,
      }),
    ).toBe(true);
    expect(
      isOriginAllowed('https://evil.example', {
        ...baseEnv,
        CORS_ORIGINS: 'https://reneo.vercel.app',
        CORS_ALLOW_VERCEL_PREVIEWS: false,
      }),
    ).toBe(false);
  });

  it('allows vercel preview URLs when enabled', () => {
    const env = {
      ...baseEnv,
      CORS_ORIGINS: undefined,
      CORS_ALLOW_VERCEL_PREVIEWS: true,
    };

    expect(
      isOriginAllowed(
        'https://reneo-frontend-ljxgze7w7-chirag-tank1971s-projects.vercel.app',
        env,
      ),
    ).toBe(true);
    expect(isOriginAllowed('https://reneo-git-main-user.vercel.app', env)).toBe(true);
    expect(isOriginAllowed('http://localhost:5173', env)).toBe(false);
  });

  it('allows requests without Origin header', () => {
    expect(
      isOriginAllowed(undefined, {
        ...baseEnv,
        CORS_ORIGINS: 'https://reneo.vercel.app',
        CORS_ALLOW_VERCEL_PREVIEWS: false,
      }),
    ).toBe(true);
  });

  it('uses callback form without error for denied origins', () => {
    const check = createCorsOriginChecker({
      ...baseEnv,
      CORS_ORIGINS: undefined,
      CORS_ALLOW_VERCEL_PREVIEWS: false,
    });

    let allowed = true;
    check('https://blocked.example', (_err, result) => {
      allowed = result === true;
    });
    expect(allowed).toBe(false);
  });
});
