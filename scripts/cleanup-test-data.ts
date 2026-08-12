import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../src/config/env.js';
import { getPgPool } from '../src/config/database.js';
import { purgeUser } from './lib/purge-user.js';

const TEST_EMAIL_SUFFIX = '@reneo-test.local';

async function listAllUsers(admin: ReturnType<typeof createClient>) {
  const users: Array<{ id: string; email?: string }> = [];
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      throw new Error(`Failed to list users: ${error.message}`);
    }

    users.push(...data.users.map((user) => ({ id: user.id, email: user.email })));

    if (data.users.length < 1000) break;
    page += 1;
  }

  return users;
}

async function main() {
  const env = getEnv();
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const pool = getPgPool();

  const testUsers = (await listAllUsers(admin)).filter((user) =>
    user.email?.endsWith(TEST_EMAIL_SUFFIX),
  );

  if (testUsers.length === 0) {
    console.info('No test users found.');
    await pool.end();
    return;
  }

  console.info(`Removing ${testUsers.length} test user(s)...`);

  for (const user of testUsers) {
    await purgeUser(admin, pool, user.id, user.email);
    console.info(`  - ${user.email}`);
  }

  const remainingProducts = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM products p
     JOIN stores s ON s.id = p.store_id
     JOIN profiles pf ON pf.id = s.seller_id
     WHERE pf.email LIKE '%@reneo-test.local'`,
  );

  console.info('');
  console.info(`Cleanup complete. Removed ${testUsers.length} test account(s).`);
  console.info(`Remaining test-catalog products: ${remainingProducts.rows[0]?.count ?? '0'}`);
  console.info('Demo sellers (demo-seller@reneo.local, demo-seller-2@reneo.local) were kept.');

  await pool.end();
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
