import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { getCorsConfig } from './config/cors.js';
import { productRoutes, orderRoutes } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { openApiSpec } from './config/swagger.js';

export function createApp() {
  const app = express();
  const corsConfig = getCorsConfig();

  // CORS must run before helmet so preflight responses include ACAO headers.
  app.use(cors(corsConfig));
  app.options(/.*/, cors(corsConfig));
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(express.json({ strict: true }));

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

  const apiRouter = express.Router();
  apiRouter.use('/products', productRoutes);
  apiRouter.use('/orders', orderRoutes);
  // Serve both /products and /api/products (Vercel often sets VITE_API_URL with /api suffix).
  app.use('/api', apiRouter);
  app.use(apiRouter);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(errorHandler);
  return app;
}
