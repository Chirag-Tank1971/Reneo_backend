import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  category: z.string().min(1).max(100),
  price_minor: z.number().int().nonnegative(),
  quantity: z.number().int().nonnegative().default(0),
});

export const updateProductSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).nullable().optional(),
    category: z.string().min(1).max(100).optional(),
    price_minor: z.number().int().nonnegative().optional(),
    quantity: z.number().int().nonnegative().optional(),
    is_archived: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const productListQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  category: z.string().optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  available: z.enum(['true', 'false']).optional(),
  sort: z
    .enum(['price_asc', 'price_desc', 'created_at_asc', 'created_at_desc', 'name_asc', 'name_desc'])
    .optional()
    .default('created_at_desc'),
  mine: z.enum(['true', 'false']).optional(),
});

export const orderItemSchema = z
  .object({
    product_id: z.string().uuid(),
    quantity: z.number().int().positive(),
  })
  .strict();

export const createOrderSchema = z
  .object({
    items: z.array(orderItemSchema).min(1),
  })
  .strict()
  .superRefine((data, ctx) => {
    const body = data as Record<string, unknown>;
    if ('price' in body || 'price_minor' in body || 'total' in body || 'total_minor' in body) {
      ctx.addIssue({
        code: 'custom',
        message: 'Client-supplied price fields are not allowed',
        path: ['items'],
      });
    }
    for (const item of data.items) {
      const itemRecord = item as Record<string, unknown>;
      if ('price' in itemRecord || 'price_minor' in itemRecord) {
        ctx.addIssue({
          code: 'custom',
          message: 'Client-supplied price fields are not allowed on order items',
          path: ['items'],
        });
      }
    }
  });

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
