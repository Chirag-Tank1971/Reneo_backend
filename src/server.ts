import 'dotenv/config';
import { createApp } from './app.js';
import { verifyDatabaseConnection } from './config/database.js';
import { getEnv } from './config/env.js';

async function main(): Promise<void> {
  const env = getEnv();
  const app = createApp();

  try {
    await verifyDatabaseConnection();
    console.log('Database connection verified');
  } catch (err) {
    console.error('Database connection failed:', err);
    process.exit(1);
  }

  app.listen(env.PORT, () => {
    console.log(`Reneo API listening on http://localhost:${env.PORT}`);
    console.log(`Swagger docs: http://localhost:${env.PORT}/docs`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
