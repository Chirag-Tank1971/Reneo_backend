import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');

function isSupabaseHosted(databaseUrl: string): boolean {
  return databaseUrl.includes('supabase.co') || databaseUrl.includes('supabase.com');
}

/** Local-only migration; hosted Supabase already owns the auth schema. */
async function shouldSkipMigration(
  file: string,
  client: pg.Client,
  databaseUrl: string,
): Promise<string | null> {
  if (file !== '000_auth_stub.sql') {
    return null;
  }

  if (isSupabaseHosted(databaseUrl)) {
    return 'hosted Supabase already provides auth.users';
  }

  const existingAuth = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'auth' AND table_name = 'users'
     ) AS exists`,
  );

  if (existingAuth.rows[0]?.exists) {
    return 'auth.users already exists';
  }

  return null;
}

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const applied = await client.query(
      'SELECT 1 FROM public.schema_migrations WHERE filename = $1',
      [file],
    );
    if (applied.rowCount && applied.rowCount > 0) {
      console.info(`Skipping ${file} (already applied)`);
      continue;
    }

    const skipReason = await shouldSkipMigration(file, client, databaseUrl);
    if (skipReason) {
      console.info(`Skipping ${file} (${skipReason})`);
      await client.query('INSERT INTO public.schema_migrations (filename) VALUES ($1)', [file]);
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    console.info(`Applying ${file}...`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO public.schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.info(`Applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }

  await client.end();
  console.info('Migrations complete.');
}

runMigrations().catch((err) => {
  console.error(err);
  process.exit(1);
});
