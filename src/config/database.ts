import type { SupabaseClient } from '@supabase/supabase-js';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { getEnv } from './env.js';
import { createServerSupabaseClient } from './supabase.js';

let pgPoolInstance: Pool | null = null;
let supabaseAdminInstance: SupabaseClient | null = null;

function shouldUseSsl(connectionString: string, nodeEnv: string): boolean {
  if (nodeEnv === 'production') return true;
  return /supabase\.com/i.test(connectionString);
}

export function getPgPool(): Pool {
  if (!pgPoolInstance) {
    const env = getEnv();
    pgPoolInstance = new Pool({
      connectionString: env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30_000,
      ssl: shouldUseSsl(env.DATABASE_URL, env.NODE_ENV)
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }
  return pgPoolInstance;
}

/** Lazy pool access — avoids env validation at import time during test collection. */
export const pgPool = {
  connect(): Promise<PoolClient> {
    return getPgPool().connect();
  },
  query<T extends QueryResultRow = QueryResultRow>(
    queryText: string,
    values?: unknown[]
  ): Promise<QueryResult<T>> {
    return getPgPool().query<T>(queryText, values);
  },
  end(): Promise<void> {
    return pgPoolInstance ? pgPoolInstance.end() : Promise.resolve();
  },
};

/** Service-role client — bypasses RLS; used for order transactions and admin test setup. */
export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdminInstance) {
    const env = getEnv();
    supabaseAdminInstance = createServerSupabaseClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
    );
  }
  return supabaseAdminInstance;
}

/** User-scoped client factory — RLS enforced via JWT. */
export function createUserSupabaseClient(accessToken: string): SupabaseClient {
  const env = getEnv();
  return createServerSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function verifyDatabaseConnection(): Promise<void> {
  const client = await getPgPool().connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}
