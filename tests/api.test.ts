import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import {
  authRequest,
  cleanupTestUsers,
  createTestUser,
  hasTestEnv,
} from './helpers.js';

const describeIf = hasTestEnv ? describe : describe.skip;

describeIf('Reneo API', () => {
  let app: Express;
  const userIds: string[] = [];

  let sellerA: { id: string; token: string };
  let sellerB: { id: string; token: string };
  let customer: { id: string; token: string };
  let productId: string;

  beforeAll(async () => {
    const { createApp } = await import('../src/app.js');
    app = createApp();

    sellerA = await createTestUser('SELLER', 'seller-a');
    sellerB = await createTestUser('SELLER', 'seller-b');
    customer = await createTestUser('CUSTOMER', 'customer');
    userIds.push(sellerA.id, sellerB.id, customer.id);
  });

  afterAll(async () => {
    await cleanupTestUsers(userIds);
  });

  it('Test 1: Seller A creates a product — SUCCESS', async () => {
    const res = await authRequest(app, 'post', '/products', sellerA.token, {
      name: 'Test Shirt',
      description: 'Blue cotton shirt',
      category: 'clothing',
      price_minor: 50000,
      quantity: 5,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Test Shirt');
    expect(res.body.data.price_minor).toBe(50000);
    productId = res.body.data.id;
  });

  it('Test 2: Seller B cannot modify Seller A product — DENIED', async () => {
    const res = await authRequest(app, 'patch', `/products/${productId}`, sellerB.token, {
      name: 'Hijacked',
    });

    expect([403, 404]).toContain(res.status);
    expect(res.body.error).toBeDefined();
  });

  it('Seller A mine=true lists only own products', async () => {
    const sellerBProduct = await authRequest(app, 'post', '/products', sellerB.token, {
      name: 'Seller B Exclusive',
      category: 'test',
      price_minor: 999,
      quantity: 1,
    });
    expect(sellerBProduct.status).toBe(201);
    const sellerBProductId = sellerBProduct.body.data.id as string;

    const mineRes = await authRequest(app, 'get', '/products/mine?limit=100', sellerA.token);
    expect(mineRes.status).toBe(200);

    const ids = (mineRes.body.data as Array<{ id: string }>).map((p) => p.id);
    expect(ids).toContain(productId);
    expect(ids).not.toContain(sellerBProductId);
  });

  it('GET /products?mine=true is rejected — use /products/mine', async () => {
    const res = await authRequest(app, 'get', '/products?mine=true&limit=100', sellerA.token);
    expect(res.status).toBe(403);
  });

  it('marketplace list includes store and seller names', async () => {
    const res = await authRequest(app, 'get', '/products?limit=100', customer.token);
    expect(res.status).toBe(200);

    const created = res.body.data.find((p: { id: string }) => p.id === productId);
    expect(created).toBeDefined();
    expect(created.store_name).toBeTruthy();
    expect(typeof created.store_name).toBe('string');
  });

  it('Seller B cannot archive Seller A product — DENIED', async () => {
    const res = await authRequest(app, 'delete', `/products/${productId}`, sellerB.token);
    expect([403, 404]).toContain(res.status);
    expect(res.body.error).toBeDefined();

    const stillThere = await authRequest(app, 'get', `/products/${productId}`, sellerA.token);
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.data.is_archived).toBe(false);
  });

  it('Test 3: Customer orders available product — SUCCESS', async () => {
    const res = await authRequest(
      app,
      'post',
      '/orders',
      customer.token,
      { items: [{ product_id: productId, quantity: 1 }] },
      { 'Idempotency-Key': `order-test3-${Date.now()}` },
    );

    expect(res.status).toBe(201);
    expect(res.body.data.order.total_minor).toBe(50000);
    expect(res.body.data.items[0].unit_price_minor).toBe(50000);
  });

  it('Test 4: Customer orders more than stock — 409', async () => {
    const lowStockProduct = await authRequest(app, 'post', '/products', sellerA.token, {
      name: 'Limited Item',
      category: 'clothing',
      price_minor: 1000,
      quantity: 2,
    });

    const limitedId = lowStockProduct.body.data.id;

    const res = await authRequest(
      app,
      'post',
      '/orders',
      customer.token,
      { items: [{ product_id: limitedId, quantity: 99 }] },
      { 'Idempotency-Key': `order-test4-${Date.now()}` },
    );

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OUT_OF_STOCK');
  });

  it('Test 5 CRITICAL: concurrent orders with stock=1 — one SUCCESS, one 409', async () => {
    const productRes = await authRequest(app, 'post', '/products', sellerA.token, {
      name: 'Race Product',
      category: 'electronics',
      price_minor: 25000,
      quantity: 1,
    });

    const raceProductId = productRes.body.data.id;
    const payload = { items: [{ product_id: raceProductId, quantity: 1 }] };

    const [resA, resB] = await Promise.all([
      authRequest(
        app,
        'post',
        '/orders',
        customer.token,
        payload,
        { 'Idempotency-Key': `race-a-${Date.now()}-${Math.random()}` },
      ),
      authRequest(
        app,
        'post',
        '/orders',
        customer.token,
        payload,
        { 'Idempotency-Key': `race-b-${Date.now()}-${Math.random()}` },
      ),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const success = resA.status === 201 ? resA : resB;
    const failure = resA.status === 409 ? resA : resB;
    expect(success.body.data.order).toBeDefined();
    expect(failure.body.error.code).toBe('OUT_OF_STOCK');
  });

  it('rejects unauthenticated requests — 401', async () => {
    const res = await request(app).get('/products');
    expect(res.status).toBe(401);

    const apiPrefixed = await request(app).get('/api/products');
    expect(apiPrefixed.status).toBe(401);
  });

  it('rejects invalid input — 400', async () => {
    const res = await authRequest(app, 'post', '/products', sellerA.token, {
      name: '',
      category: 'x',
      price_minor: -1,
    });
    expect(res.status).toBe(400);
  });

  it('rejects price manipulation on order items — 400', async () => {
    const res = await authRequest(
      app,
      'post',
      '/orders',
      customer.token,
      {
        items: [{ product_id: productId, quantity: 1, price_minor: 500 }],
      },
      { 'Idempotency-Key': `price-attack-${Date.now()}` },
    );
    expect(res.status).toBe(400);
  });

  it('idempotency: duplicate key returns same order — 201', async () => {
    const key = `idem-${Date.now()}`;
    const payload = { items: [{ product_id: productId, quantity: 1 }] };

    const first = await authRequest(app, 'post', '/orders', customer.token, payload, {
      'Idempotency-Key': key,
    });

    expect(first.status).toBe(201);
    const orderId = first.body.data.order.id;

    const second = await authRequest(app, 'post', '/orders', customer.token, payload, {
      'Idempotency-Key': key,
    });

    expect(second.status).toBe(201);
    expect(second.body.data.order.id).toBe(orderId);
  });

  it('idempotency: same key different payload — 409', async () => {
    const key = `idem-mismatch-${Date.now()}`;

    await authRequest(
      app,
      'post',
      '/orders',
      customer.token,
      { items: [{ product_id: productId, quantity: 1 }] },
      { 'Idempotency-Key': key },
    );

    const conflict = await authRequest(
      app,
      'post',
      '/orders',
      customer.token,
      { items: [{ product_id: productId, quantity: 2 }] },
      { 'Idempotency-Key': key },
    );

    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
  });

  it('invalid product — 404', async () => {
    const res = await authRequest(
      app,
      'post',
      '/orders',
      customer.token,
      { items: [{ product_id: '00000000-0000-4000-8000-000000009999', quantity: 1 }] },
      { 'Idempotency-Key': `invalid-prod-${Date.now()}` },
    );
    expect(res.status).toBe(404);
  });
});

describeIf('RLS direct database access', () => {
  it('Seller B cannot read Seller A archived product via user-scoped client', async () => {
    const { createApp } = await import('../src/app.js');
    const app = createApp();

    const sellerA = await createTestUser('SELLER', 'rls-a');
    const sellerB = await createTestUser('SELLER', 'rls-b');

    const createRes = await authRequest(app, 'post', '/products', sellerA.token, {
      name: 'RLS Secret',
      category: 'test',
      price_minor: 100,
      quantity: 1,
    });

    const pid = createRes.body.data.id;
    await authRequest(app, 'delete', `/products/${pid}`, sellerA.token);

    const { createClient } = await import('@supabase/supabase-js');
    const clientB = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${sellerB.token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data } = await clientB.from('products').select('*').eq('id', pid).maybeSingle();
    expect(data).toBeNull();

    await cleanupTestUsers([sellerA.id, sellerB.id]);
  });
});

describe('Environment guard', () => {
  it('skips integration tests when env is not configured', () => {
    expect(typeof hasTestEnv).toBe('boolean');
  });
});

if (hasTestEnv) {
  afterAll(async () => {
    const { pgPool } = await import('../src/config/database.js');
    await pgPool.end();
  });
}
