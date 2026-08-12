import { Router } from 'express';
import { ProductController, OrderController } from '../controllers/product.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/errorHandler.js';
import {
  createOrderSchema,
  createProductSchema,
  productListQuerySchema,
  updateProductSchema,
} from '../validators/product.validator.js';

const productController = new ProductController();
const orderController = new OrderController();

export const productRoutes = Router();

productRoutes.post(
  '/',
  authenticate,
  requireRole('SELLER'),
  validateBody(createProductSchema),
  (req, res, next) => productController.create(req, res, next)
);

productRoutes.get(
  '/',
  authenticate,
  validateQuery(productListQuerySchema),
  (req, res, next) => productController.list(req, res, next)
);

productRoutes.get(
  '/mine',
  authenticate,
  requireRole('SELLER'),
  validateQuery(productListQuerySchema),
  (req, res, next) => productController.listMine(req, res, next)
);

productRoutes.get('/:id', authenticate, (req, res, next) =>
  productController.getById(req, res, next)
);

productRoutes.patch(
  '/:id',
  authenticate,
  requireRole('SELLER'),
  validateBody(updateProductSchema),
  (req, res, next) => productController.update(req, res, next)
);

productRoutes.delete(
  '/:id',
  authenticate,
  requireRole('SELLER'),
  (req, res, next) => productController.remove(req, res, next)
);

export const orderRoutes = Router();

orderRoutes.post(
  '/',
  authenticate,
  requireRole('CUSTOMER'),
  validateBody(createOrderSchema),
  (req, res, next) => orderController.create(req, res, next)
);
