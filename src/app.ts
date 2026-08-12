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

  app.use(helmet());
  app.use(cors(getCorsConfig()));
  app.use(express.json({ strict: true }));

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.use('/products', productRoutes);
  app.use('/orders', orderRoutes);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(errorHandler);
  return app;
}
