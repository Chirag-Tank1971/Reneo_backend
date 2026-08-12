-- Indexes for product search at ~1M scale

CREATE INDEX idx_products_store_id ON public.products (store_id);
CREATE INDEX idx_products_category ON public.products (category);
CREATE INDEX idx_products_price_minor ON public.products (price_minor);
CREATE INDEX idx_products_created_at ON public.products (created_at DESC);
CREATE INDEX idx_products_not_archived ON public.products (is_archived) WHERE is_archived = false;
CREATE INDEX idx_products_search_vector ON public.products USING GIN (search_vector);

-- Composite index for common filter + sort patterns
CREATE INDEX idx_products_category_price ON public.products (category, price_minor)
  WHERE is_archived = false;

CREATE INDEX idx_inventory_product_id ON public.inventory (product_id);
CREATE INDEX idx_inventory_available ON public.inventory (product_id, quantity)
  WHERE quantity > 0;

CREATE INDEX idx_orders_customer_id ON public.orders (customer_id);
CREATE INDEX idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX idx_order_items_store_id ON public.order_items (store_id);
CREATE INDEX idx_idempotency_expires ON public.idempotency_keys (expires_at);
CREATE INDEX idx_order_events_status ON public.order_events (status) WHERE status = 'pending';
