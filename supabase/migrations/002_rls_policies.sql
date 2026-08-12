-- Row Level Security policies for Reneo marketplace
-- Security model: authenticated Supabase user identity (auth.uid()) drives ownership.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_own ON profiles;
CREATE POLICY profiles_select_own ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Service role bypasses RLS; sellers/customers cannot change role via API (enforced in app).

-- ---------------------------------------------------------------------------
-- stores — sellers manage own store; customers can read stores (for product context)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS stores_select_all ON stores;
CREATE POLICY stores_select_all ON stores
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS stores_insert_seller ON stores;
CREATE POLICY stores_insert_seller ON stores
  FOR INSERT TO authenticated
  WITH CHECK (
    seller_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'SELLER'
    )
  );

DROP POLICY IF EXISTS stores_update_own ON stores;
CREATE POLICY stores_update_own ON stores
  FOR UPDATE TO authenticated
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

DROP POLICY IF EXISTS stores_delete_own ON stores;
CREATE POLICY stores_delete_own ON stores
  FOR DELETE TO authenticated
  USING (seller_id = auth.uid());

-- ---------------------------------------------------------------------------
-- products — public catalog read; sellers CRUD own store products only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS products_select_visible ON products;
CREATE POLICY products_select_visible ON products
  FOR SELECT TO authenticated
  USING (
    is_archived = FALSE
    OR EXISTS (
      SELECT 1 FROM stores s
      WHERE s.id = products.store_id AND s.seller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS products_insert_own_store ON products;
CREATE POLICY products_insert_own_store ON products
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stores s
      WHERE s.id = store_id AND s.seller_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'SELLER'
    )
  );

DROP POLICY IF EXISTS products_update_own_store ON products;
CREATE POLICY products_update_own_store ON products
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stores s
      WHERE s.id = products.store_id AND s.seller_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stores s
      WHERE s.id = store_id AND s.seller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS products_delete_own_store ON products;
CREATE POLICY products_delete_own_store ON products
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stores s
      WHERE s.id = products.store_id AND s.seller_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- inventory — readable for available products; writable only by owning seller
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS inventory_select_visible ON inventory;
CREATE POLICY inventory_select_visible ON inventory
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = inventory.product_id
        AND (p.is_archived = FALSE OR EXISTS (
          SELECT 1 FROM stores s
          WHERE s.id = p.store_id AND s.seller_id = auth.uid()
        ))
    )
  );

DROP POLICY IF EXISTS inventory_insert_own ON inventory;
CREATE POLICY inventory_insert_own ON inventory
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE p.id = product_id AND s.seller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS inventory_update_own ON inventory;
CREATE POLICY inventory_update_own ON inventory
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE p.id = inventory.product_id AND s.seller_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE p.id = product_id AND s.seller_id = auth.uid()
    )
  );

-- Customers cannot directly UPDATE inventory (order flow uses service role transaction).

-- ---------------------------------------------------------------------------
-- orders — customers see own orders; sellers see orders containing their items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS orders_select_customer ON orders;
CREATE POLICY orders_select_customer ON orders
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

DROP POLICY IF EXISTS orders_select_seller ON orders;
CREATE POLICY orders_select_seller ON orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM order_items oi
      JOIN stores s ON s.id = oi.store_id
      WHERE oi.order_id = orders.id AND s.seller_id = auth.uid()
    )
  );

-- INSERT handled by service-role transaction in API (not via user JWT direct insert).

-- ---------------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS order_items_select_customer ON order_items;
CREATE POLICY order_items_select_customer ON order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id AND o.customer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS order_items_select_seller ON order_items;
CREATE POLICY order_items_select_seller ON order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stores s
      WHERE s.id = order_items.store_id AND s.seller_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- idempotency_keys — users see only their keys
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS idempotency_keys_select_own ON idempotency_keys;
CREATE POLICY idempotency_keys_select_own ON idempotency_keys
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

DROP POLICY IF EXISTS idempotency_keys_insert_own ON idempotency_keys;
CREATE POLICY idempotency_keys_insert_own ON idempotency_keys
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS idempotency_keys_update_own ON idempotency_keys;
CREATE POLICY idempotency_keys_update_own ON idempotency_keys
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- order_events — sellers notified for their store items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS order_events_select_seller ON order_events;
CREATE POLICY order_events_select_seller ON order_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM order_items oi
      JOIN stores s ON s.id = oi.store_id
      WHERE oi.order_id = order_events.order_id AND s.seller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS order_events_select_customer ON order_events;
CREATE POLICY order_events_select_customer ON order_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_events.order_id AND o.customer_id = auth.uid()
    )
  );

-- Grant usage on types/tables to authenticated role (Supabase default)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
