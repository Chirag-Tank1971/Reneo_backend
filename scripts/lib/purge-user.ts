import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';

export async function purgeUser(
  admin: SupabaseClient,
  pool: Pool,
  userId: string,
  email?: string,
): Promise<void> {
  const storeResult = await pool.query<{ id: string }>(
    'SELECT id FROM stores WHERE seller_id = $1',
    [userId],
  );
  const storeIds = storeResult.rows.map((row) => row.id);

  let productIds: string[] = [];
  if (storeIds.length > 0) {
    const productResult = await pool.query<{ id: string }>(
      'SELECT id FROM products WHERE store_id = ANY($1::uuid[])',
      [storeIds],
    );
    productIds = productResult.rows.map((row) => row.id);
  }

  if (productIds.length > 0) {
    await pool.query('DELETE FROM order_items WHERE product_id = ANY($1::uuid[])', [productIds]);
  }

  if (storeIds.length > 0) {
    await pool.query('DELETE FROM order_items WHERE store_id = ANY($1::uuid[])', [storeIds]);
  }

  await pool.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_id = $1)', [
    userId,
  ]);

  await pool.query(
    `DELETE FROM order_events
     WHERE order_id IN (
       SELECT o.id FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE oi.id IS NULL OR o.customer_id = $1
     )`,
    [userId],
  );

  await pool.query(
    `DELETE FROM orders
     WHERE customer_id = $1
        OR id IN (
          SELECT o.id FROM orders o
          LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE oi.id IS NULL
        )`,
    [userId],
  );

  await pool.query('DELETE FROM idempotency_keys WHERE customer_id = $1', [userId]);

  if (storeIds.length > 0) {
    await pool.query('DELETE FROM products WHERE store_id = ANY($1::uuid[])', [storeIds]);
    await pool.query('DELETE FROM stores WHERE id = ANY($1::uuid[])', [storeIds]);
  }

  await pool.query('DELETE FROM profiles WHERE id = $1', [userId]);

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(`Failed to delete ${email ?? userId}: ${error.message}`);
  }
}
