import type { PoolClient } from 'pg';
import { getEnv } from '../config/env.js';
import { getPgPool } from '../config/database.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { hashRequestPayload } from '../utils/helpers.js';
import type { CreateOrderInput } from '../validators/product.validator.js';
import type { Order, OrderItem } from '../types/index.js';
import { processPendingOrderEvents } from './event.service.js';

interface OrderResponse {
  order: Order;
  items: OrderItem[];
}

function normalizeOrderResponse(response: OrderResponse): OrderResponse {
  return {
    order: {
      ...response.order,
      total_minor: Number(response.order.total_minor),
    },
    items: response.items.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      unit_price_minor: Number(item.unit_price_minor),
    })),
  };
}

interface ProductRow {
  id: string;
  store_id: string;
  name: string;
  price_minor: string;
  currency: string;
  is_archived: boolean;
  quantity: number;
}

export class OrderService {
  async createOrder(
    customerId: string,
    input: CreateOrderInput,
    idempotencyKey?: string,
  ): Promise<OrderResponse> {
    if (!idempotencyKey?.trim()) {
      throw badRequest('Idempotency-Key header is required', 'MISSING_IDEMPOTENCY_KEY');
    }

    const requestHash = hashRequestPayload(input);
    const client = await getPgPool().connect();

    try {
      await client.query('BEGIN');

      const cached = await this.resolveIdempotency(
        client,
        customerId,
        idempotencyKey.trim(),
        requestHash,
      );
      if (cached) {
        await client.query('COMMIT');
        return normalizeOrderResponse(cached);
      }

      const productIds = input.items.map((i) => i.product_id);
      const uniqueIds = [...new Set(productIds)];

      const productsResult = await client.query<ProductRow>(
        `SELECT p.id, p.store_id, p.name, p.price_minor, p.currency, p.is_archived, i.quantity
         FROM products p
         INNER JOIN inventory i ON i.product_id = p.id
         WHERE p.id = ANY($1::uuid[])
         ORDER BY p.id
         FOR UPDATE OF i`,
        [uniqueIds],
      );

      const productMap = new Map(productsResult.rows.map((row) => [row.id, row]));

      for (const item of input.items) {
        const product = productMap.get(item.product_id);
        if (!product) {
          throw notFound(`Product not found: ${item.product_id}`);
        }
        if (product.is_archived) {
          throw conflict(`Product is not available: ${item.product_id}`, 'PRODUCT_UNAVAILABLE');
        }
      }

      const aggregated = new Map<string, number>();
      for (const item of input.items) {
        aggregated.set(item.product_id, (aggregated.get(item.product_id) ?? 0) + item.quantity);
      }

      for (const [productId, requestedQty] of aggregated) {
        const product = productMap.get(productId)!;
        if (product.quantity < requestedQty) {
          throw conflict('Insufficient inventory', 'OUT_OF_STOCK');
        }

        const updateResult = await client.query(
          `UPDATE inventory
           SET quantity = quantity - $1, updated_at = now()
           WHERE product_id = $2 AND quantity >= $1`,
          [requestedQty, productId],
        );

        if (updateResult.rowCount === 0) {
          throw conflict('Insufficient inventory', 'OUT_OF_STOCK');
        }
      }

      let totalMinor = 0;
      const lineItems: Array<{
        product_id: string;
        store_id: string;
        quantity: number;
        unit_price_minor: number;
        currency: string;
      }> = [];

      for (const item of input.items) {
        const product = productMap.get(item.product_id)!;
        const unitPrice = Number(product.price_minor);
        totalMinor += unitPrice * item.quantity;
        lineItems.push({
          product_id: item.product_id,
          store_id: product.store_id,
          quantity: item.quantity,
          unit_price_minor: unitPrice,
          currency: product.currency,
        });
      }

      const orderResult = await client.query<Order>(
        `INSERT INTO orders (customer_id, status, total_minor, currency)
         VALUES ($1, 'confirmed', $2, $3)
         RETURNING *`,
        [customerId, totalMinor, lineItems[0]?.currency ?? 'XOF'],
      );
      const order = orderResult.rows[0];

      const insertedItems: OrderItem[] = [];
      for (const line of lineItems) {
        const itemResult = await client.query<OrderItem>(
          `INSERT INTO order_items
             (order_id, product_id, store_id, quantity, unit_price_minor, currency)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [order.id, line.product_id, line.store_id, line.quantity, line.unit_price_minor, line.currency],
        );
        insertedItems.push(itemResult.rows[0]);
      }

      const eventPayload = {
        order_id: order.id,
        customer_id: customerId,
        total_minor: totalMinor,
        items: insertedItems.map((i) => ({
          product_id: i.product_id,
          store_id: i.store_id,
          quantity: i.quantity,
          unit_price_minor: i.unit_price_minor,
        })),
      };

      await client.query(
        `INSERT INTO order_events (order_id, event_type, payload, status)
         VALUES ($1, 'ORDER_CREATED', $2, 'pending')`,
        [order.id, JSON.stringify(eventPayload)],
      );

      const response = normalizeOrderResponse({ order, items: insertedItems });

      await client.query(
        `UPDATE idempotency_keys
         SET order_id = $1, response_body = $2, status = 'completed'
         WHERE customer_id = $3 AND idempotency_key = $4`,
        [order.id, JSON.stringify(response), customerId, idempotencyKey.trim()],
      );

      await client.query('COMMIT');

      void processPendingOrderEvents().catch((err) => {
        console.error('ORDER_CREATED notification processing failed:', err);
      });

      return response;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async resolveIdempotency(
    client: PoolClient,
    customerId: string,
    key: string,
    requestHash: string,
  ): Promise<OrderResponse | null> {
    const env = getEnv();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + env.IDEMPOTENCY_TTL_DAYS);

    const insertResult = await client.query(
      `INSERT INTO idempotency_keys (customer_id, idempotency_key, request_hash, expires_at, status)
       VALUES ($1, $2, $3, $4, 'processing')
       ON CONFLICT (customer_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [customerId, key, requestHash, expiresAt.toISOString()],
    );

    if (insertResult.rowCount === 1) {
      return null;
    }

    const existingResult = await client.query<{
      request_hash: string;
      response_body: OrderResponse | null;
      order_id: string | null;
      status: string;
    }>(
      `SELECT request_hash, response_body, order_id, status
       FROM idempotency_keys
       WHERE customer_id = $1 AND idempotency_key = $2
       FOR UPDATE`,
      [customerId, key],
    );

    const existing = existingResult.rows[0];
    if (!existing) {
      throw conflict('Idempotency key conflict — retry request', 'IDEMPOTENCY_CONFLICT');
    }

    if (existing.request_hash !== requestHash) {
      throw conflict(
        'Idempotency-Key reused with different payload',
        'IDEMPOTENCY_PAYLOAD_MISMATCH',
      );
    }

    if (existing.response_body) {
      return normalizeOrderResponse(existing.response_body);
    }

    if (existing.status === 'processing') {
      throw conflict('Duplicate request is still processing', 'IDEMPOTENCY_IN_PROGRESS');
    }

    if (existing.order_id) {
      const orderResult = await client.query<Order>('SELECT * FROM orders WHERE id = $1', [
        existing.order_id,
      ]);
      const itemsResult = await client.query<OrderItem>(
        'SELECT * FROM order_items WHERE order_id = $1',
        [existing.order_id],
      );
      return normalizeOrderResponse({ order: orderResult.rows[0], items: itemsResult.rows });
    }

    throw conflict('Idempotency key conflict — retry request', 'IDEMPOTENCY_CONFLICT');
  }
}

export async function assertCustomerRole(customerId: string): Promise<void> {
  const result = await getPgPool().query<{ role: string }>(
    'SELECT role FROM profiles WHERE id = $1',
    [customerId],
  );
  if (result.rowCount === 0) {
    throw forbidden('Profile not found');
  }
  if (result.rows[0].role !== 'CUSTOMER') {
    throw forbidden('Only customers can place orders');
  }
}
