import { describe, expect, it } from 'vitest';
import { createCorsOriginChecker, parseCorsOrigins } from '../src/config/cors.js';

describe('CORS config', () => {
  it('allows localhost defaults in development', () => {
    const origins = parseCorsOrigins(undefined, 'development');
    expect(origins).toContain('http://localhost:5173');
  });

  it('allows configured production origins', () => {
    const check = createCorsOriginChecker({
      NODE_ENV: 'production',
      PORT: 3000,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      DATABASE_URL: 'postgres://localhost/test',
      IDEMPOTENCY_TTL_DAYS: 7,
      CORS_ORIGINS: 'https://reneo.vercel.app',
      CORS_ALLOW_VERCEL_PREVIEWS: false,
    });

    expect(checkOrigin(check, 'https://reneo.vercel.app')).toBe(true);
    expect(checkOrigin(check, 'https://evil.example')).toBe(false);
  });

  it('allows vercel preview URLs when enabled', () => {
    const check = createCorsOriginChecker({
      NODE_ENV: 'production',
      PORT: 3000,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      DATABASE_URL: 'postgres://localhost/test',
      IDEMPOTENCY_TTL_DAYS: 7,
      CORS_ORIGINS: undefined,
      CORS_ALLOW_VERCEL_PREVIEWS: true,
    });

    expect(checkOrigin(check, 'https://reneo-git-main-user.vercel.app')).toBe(true);
    expect(checkOrigin(check, 'http://localhost:5173')).toBe(false);
  });

  it('allows requests without Origin header', () => {
    const check = createCorsOriginChecker({
      NODE_ENV: 'production',
      PORT: 3000,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      DATABASE_URL: 'postgres://localhost/test',
      IDEMPOTENCY_TTL_DAYS: 7,
      CORS_ORIGINS: 'https://reneo.vercel.app',
      CORS_ALLOW_VERCEL_PREVIEWS: false,
    });

    expect(checkOrigin(check, undefined)).toBe(true);
  });
});

function checkOrigin(
  checker: ReturnType<typeof createCorsOriginChecker>,
  origin: string | undefined,
): boolean {
  let allowed = false;
  let errored = false;

  checker(origin, (err, result) => {
    errored = Boolean(err);
    allowed = Boolean(result);
  });

  return !errored && allowed;
}
