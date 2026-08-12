import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  IDEMPOTENCY_TTL_DAYS: z.coerce.number().int().positive().default(7),
  /** Comma-separated browser origins, e.g. https://reneo.vercel.app */
  CORS_ORIGINS: z.string().optional(),
  /** Allow any https://*.vercel.app origin (preview + production deploys). */
  CORS_ALLOW_VERCEL_PREVIEWS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

export const env = new Proxy({} as Env, {
  get(_target, prop: keyof Env) {
    return getEnv()[prop];
  },
});
