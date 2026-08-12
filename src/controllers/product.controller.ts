import type { Request, Response, NextFunction } from 'express';
import { createUserSupabaseClient } from '../config/database.js';
import { ProductRepository } from '../repositories/product.repository.js';
import { OrderService, assertCustomerRole } from '../services/order.service.js';
import { forbidden, notFound } from '../utils/errors.js';
import type { ProductListQuery } from '../validators/product.validator.js';

const orderService = new OrderService();

export class ProductController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const supabase = createUserSupabaseClient(req.accessToken!);
      const repo = new ProductRepository(supabase);
      const product = await repo.create(req.user!.id, req.body);
      res.status(201).json({ data: product });
    } catch (err) {
      next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const supabase = createUserSupabaseClient(req.accessToken!);
      const repo = new ProductRepository(supabase);
      const query = (req as Request & { validatedQuery: ProductListQuery }).validatedQuery;

      if (query.mine === 'true') {
        throw forbidden('Use GET /products/mine for your seller catalog');
      }

      const result = await repo.search(query);

      res.json({
        data: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          total_pages: Math.ceil(result.total / result.limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async listMine(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const supabase = createUserSupabaseClient(req.accessToken!);
      const repo = new ProductRepository(supabase);
      const query = (req as Request & { validatedQuery: ProductListQuery }).validatedQuery;
      const result = await repo.listForSeller(req.user!.id, query);

      res.json({
        data: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          total_pages: Math.ceil(result.total / result.limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const supabase = createUserSupabaseClient(req.accessToken!);
      const repo = new ProductRepository(supabase);

      const product = await repo.findById(req.params.id);
      if (!product) {
        throw notFound('Product not found');
      }

      if (product.is_archived) {
        if (req.user?.role !== 'SELLER') {
          throw notFound('Product not found');
        }
        const { data: store } = await supabase
          .from('stores')
          .select('seller_id')
          .eq('id', product.store_id)
          .single();
        if (store?.seller_id !== req.user.id) {
          throw notFound('Product not found');
        }
      }

      res.json({ data: product });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const supabase = createUserSupabaseClient(req.accessToken!);
      const repo = new ProductRepository(supabase);
      const product = await repo.update(req.user!.id, req.params.id, req.body);
      res.json({ data: product });
    } catch (err) {
      next(err);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const supabase = createUserSupabaseClient(req.accessToken!);
      const repo = new ProductRepository(supabase);
      await repo.archive(req.user!.id, req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
}

export class OrderController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await assertCustomerRole(req.user!.id);

      const idempotencyKey = req.header('Idempotency-Key') ?? undefined;
      const result = await orderService.createOrder(
        req.user!.id,
        req.body,
        idempotencyKey
      );

      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
}
