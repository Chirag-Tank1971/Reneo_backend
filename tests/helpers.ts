import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import type { Express } from 'express';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

export const hasTestEnv = Boolean(
  supabaseUrl &&
    serviceRoleKey &&
    anonKey &&
    process.env.DATABASE_URL
);

export function getAdminClient(): SupabaseClient {
  if (!hasTestEnv) {
    throw new Error('Test environment variables are not configured');
  }
  return createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createTestUser(
  role: 'SELLER' | 'CUSTOMER',
  label: string
): Promise<{ id: string; email: string; token: string }> {
  const admin = getAdminClient();
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@reneo-test.local`;
  const password = `Test-${Math.random().toString(36).slice(2)}!Aa1`;

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: label },
  });

  if (error || !created.user) {
    throw new Error(`Failed to create test user: ${error?.message}`);
  }

  await admin.from('profiles').update({ role }).eq('id', created.user.id);

  if (role === 'SELLER') {
    await admin.from('stores').upsert(
      { seller_id: created.user.id, name: `${label} Store` },
      { onConflict: 'seller_id' }
    );
  }

  const anon = createClient(supabaseUrl!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: session, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !session.session?.access_token) {
    throw new Error(`Failed to sign in test user: ${signInError?.message}`);
  }

  return {
    id: created.user.id,
    email,
    token: session.session.access_token,
  };
}

export async function authRequest(
  app: Express,
  method: 'get' | 'post' | 'patch' | 'delete',
  url: string,
  token: string,
  body?: unknown,
  headers?: Record<string, string>
) {
  const request = (await import('supertest')).default(app)[method](url)
    .set('Authorization', `Bearer ${token}`);

  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      request.set(key, value);
    }
  }

  if (body !== undefined && body !== null) {
    request.send(body);
  }

  return request;
}

export async function cleanupTestUsers(userIds: string[]) {
  const admin = getAdminClient();
  const { getPgPool } = await import('../src/config/database.js');
  const { purgeUser } = await import('../scripts/lib/purge-user.js');
  const pool = getPgPool();

  for (const id of userIds) {
    try {
      await purgeUser(admin, pool, id);
    } catch {
      await admin.auth.admin.deleteUser(id);
    }
  }
}
