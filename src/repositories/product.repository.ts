import type { SupabaseClient } from '@supabase/supabase-js';
import { getPgPool } from '../config/database.js';
import { forbidden, notFound } from '../utils/errors.js';
import type { CreateProductInput, ProductListQuery, UpdateProductInput } from '../validators/product.validator.js';
import type { Product, ProductWithInventory } from '../types/index.js';
import { parsePagination } from '../utils/helpers.js';

const SORT_MAP: Record<string, string> = {
  price_asc: 'p.price_minor ASC',
  price_desc: 'p.price_minor DESC',
  created_at_asc: 'p.created_at ASC',
  created_at_desc: 'p.created_at DESC',
  name_asc: 'p.name ASC',
  name_desc: 'p.name DESC',
};

export class ProductRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  /** DB-level ownership check — does not rely on Supabase RLS or client JWT. */
  private async assertSellerOwnsProduct(sellerId: string, productId: string): Promise<void> {
    const result = await getPgPool().query(
      `SELECT 1
       FROM products p
       INNER JOIN stores s ON s.id = p.store_id
       WHERE p.id = $1 AND s.seller_id = $2`,
      [productId, sellerId],
    );

    if ((result.rowCount ?? 0) === 0) {
      throw forbidden("Cannot modify another seller's product");
    }
  }

  private async getStoreContext(
    storeId: string,
  ): Promise<{ store_name: string | null; seller_name: string | null }> {
    const result = await getPgPool().query<{ store_name: string; seller_name: string | null }>(
      `SELECT s.name AS store_name, pf.full_name AS seller_name
       FROM stores s
       LEFT JOIN profiles pf ON pf.id = s.seller_id
       WHERE s.id = $1`,
      [storeId],
    );
    const row = result.rows[0];
    return {
      store_name: row?.store_name ?? null,
      seller_name: row?.seller_name ?? null,
    };
  }

  private async withStoreContext(product: ProductWithInventory): Promise<ProductWithInventory> {
    const context = await this.getStoreContext(product.store_id);
    return { ...product, ...context };
  }

  async ensureSellerStore(sellerId: string): Promise<string> {
    const { data: existing } = await this.supabase
      .from('stores')
      .select('id')
      .eq('seller_id', sellerId)
      .maybeSingle();

    if (existing?.id) return existing.id;

    const { data: created, error } = await this.supabase
      .from('stores')
      .insert({ seller_id: sellerId, name: 'My Store' })
      .select('id')
      .single();

    if (error || !created) {
      throw forbidden('Unable to resolve seller store');
    }
    return created.id;
  }

  async create(sellerId: string, input: CreateProductInput): Promise<ProductWithInventory> {
    const storeId = await this.ensureSellerStore(sellerId);

    const { data: product, error: productError } = await this.supabase
      .from('products')
      .insert({
        store_id: storeId,
        name: input.name,
        description: input.description ?? null,
        category: input.category,
        price_minor: input.price_minor,
      })
      .select('*')
      .single();

    if (productError || !product) {
      throw forbidden(productError?.message ?? 'Failed to create product');
    }

    const { error: inventoryError } = await this.supabase.from('inventory').insert({
      product_id: product.id,
      quantity: input.quantity,
    });

    if (inventoryError) {
      throw forbidden(inventoryError.message);
    }

    return this.withStoreContext({
      ...(product as Product),
      quantity: input.quantity,
      available: input.quantity > 0,
    });
  }

  async findById(id: string): Promise<ProductWithInventory | null> {
    const { data, error } = await this.supabase
      .from('products')
      .select('*, inventory(quantity)')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;

    const inventory = (data as { inventory?: { quantity: number } | { quantity: number }[] }).inventory;
    const quantity = Array.isArray(inventory)
      ? (inventory[0]?.quantity ?? 0)
      : (inventory?.quantity ?? 0);

    const { inventory: _inv, ...product } = data as Product & { inventory?: unknown };
    return this.withStoreContext({
      ...product,
      quantity,
      available: quantity > 0 && !product.is_archived,
    });
  }

  async update(
    sellerId: string,
    productId: string,
    input: UpdateProductInput,
  ): Promise<ProductWithInventory> {
    await this.assertSellerOwnsProduct(sellerId, productId);

    const existing = await this.findById(productId);
    if (!existing) throw notFound('Product not found');

    const productPatch: Record<string, unknown> = {};
    if (input.name !== undefined) productPatch.name = input.name;
    if (input.description !== undefined) productPatch.description = input.description;
    if (input.category !== undefined) productPatch.category = input.category;
    if (input.price_minor !== undefined) productPatch.price_minor = input.price_minor;
    if (input.is_archived !== undefined) productPatch.is_archived = input.is_archived;

    if (Object.keys(productPatch).length > 0) {
      const { data, error } = await this.supabase
        .from('products')
        .update(productPatch)
        .eq('id', productId)
        .select('id');
      if (error) throw forbidden(error.message);
      if (!data?.length) throw forbidden("Cannot modify another seller's product");
    }

    if (input.quantity !== undefined) {
      const { data, error } = await this.supabase
        .from('inventory')
        .update({ quantity: input.quantity })
        .eq('product_id', productId)
        .select('id');
      if (error) throw forbidden(error.message);
      if (!data?.length) throw forbidden("Cannot modify another seller's product");
    }

    const updated = await this.findById(productId);
    if (!updated) throw notFound('Product not found after update');
    return updated;
  }

  async archive(sellerId: string, productId: string): Promise<void> {
    await this.update(sellerId, productId, { is_archived: true });
  }

  async listForSeller(
    sellerId: string,
    query: ProductListQuery,
  ): Promise<{ data: ProductWithInventory[]; total: number; page: number; limit: number }> {
    return this.search({ ...query, mine: 'true' }, sellerId);
  }

  async search(
    query: ProductListQuery,
    sellerId?: string,
  ): Promise<{ data: ProductWithInventory[]; total: number; page: number; limit: number }> {
    const { page, limit, offset } = parsePagination(query);
    const mineOnly = query.mine === 'true';

    if (mineOnly && !sellerId) {
      throw forbidden('mine=true requires a seller account');
    }

    const conditions: string[] = ['1=1'];
    const values: unknown[] = [];
    let idx = 1;

    if (mineOnly) {
      conditions.push(
        `p.store_id IN (SELECT id FROM stores WHERE seller_id = $${idx++})`,
      );
      values.push(sellerId);
    } else {
      conditions.push('p.is_archived = false');
    }

    if (query.category) {
      conditions.push(`p.category = $${idx++}`);
      values.push(query.category);
    }
    if (query.minPrice) {
      conditions.push(`p.price_minor >= $${idx++}`);
      values.push(Number.parseInt(query.minPrice, 10));
    }
    if (query.maxPrice) {
      conditions.push(`p.price_minor <= $${idx++}`);
      values.push(Number.parseInt(query.maxPrice, 10));
    }
    let searchParamIndex: number | undefined;
    if (query.search) {
      searchParamIndex = idx;
      conditions.push(`p.search_vector @@ plainto_tsquery('english', $${idx++})`);
      values.push(query.search);
    }
    if (query.available === 'true') {
      conditions.push('COALESCE(i.quantity, 0) > 0');
    } else if (query.available === 'false') {
      conditions.push('COALESCE(i.quantity, 0) = 0');
    }

    const whereClause = conditions.join(' AND ');
    const sortClause = SORT_MAP[query.sort ?? 'created_at_desc'];
    const orderBy =
      query.search && searchParamIndex !== undefined
        ? `ts_rank_cd(p.search_vector, plainto_tsquery('english', $${searchParamIndex})) DESC, ${sortClause}`
        : sortClause;

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE ${whereClause}`;

    const dataSql = `
      SELECT p.*,
             COALESCE(i.quantity, 0) AS quantity,
             s.name AS store_name,
             pf.full_name AS seller_name
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      INNER JOIN stores s ON s.id = p.store_id
      LEFT JOIN profiles pf ON pf.id = s.seller_id
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${idx++} OFFSET $${idx++}`;

    const countResult = await getPgPool().query(countSql, values);
    const dataResult = await getPgPool().query(dataSql, [...values, limit, offset]);

    const data: ProductWithInventory[] = dataResult.rows.map((row) => ({
      ...(row as Product),
      quantity: Number(row.quantity),
      available: Number(row.quantity) > 0 && !row.is_archived,
      store_name: (row as { store_name?: string }).store_name ?? null,
      seller_name: (row as { seller_name?: string | null }).seller_name ?? null,
    }));

    return {
      data,
      total: countResult.rows[0]?.total ?? 0,
      page,
      limit,
    };
  }
}
