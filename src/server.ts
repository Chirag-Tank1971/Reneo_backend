import 'dotenv/config';
import { createApp } from './app.js';
import { getEnv } from './config/env.js';

const env = getEnv();
const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Reneo API listening on http://localhost:${env.PORT}`);
  console.log(`Swagger docs: http://localhost:${env.PORT}/docs`);
});
