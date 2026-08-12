import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../src/config/env.js';
import { getPgPool } from '../src/config/database.js';

type SampleProduct = {
  name: string;
  description: string;
  category: string;
  price_minor: number;
  quantity: number;
};

type DemoSellerConfig = {
  email: string;
  password: string;
  fullName: string;
  storeName: string;
  products: SampleProduct[];
};

const DEMO_SELLER_PASSWORD = 'DemoSeller123!';

const DEMO_SELLERS: DemoSellerConfig[] = [
  {
    email: 'demo-seller@reneo.local',
    password: DEMO_SELLER_PASSWORD,
    fullName: 'Demo Seller - 1',
    storeName: 'Reneo Demo Store',
    products: [
      {
        name: 'Blue Cotton Shirt',
        description: 'Lightweight cotton shirt for everyday wear.',
        category: 'clothing',
        price_minor: 25000,
        quantity: 15,
      },
      {
        name: 'Classic Denim Jacket',
        description: 'Durable denim jacket with a modern fit.',
        category: 'clothing',
        price_minor: 45000,
        quantity: 8,
      },
      {
        name: 'Wireless Earbuds',
        description: 'Compact earbuds with clear sound and long battery life.',
        category: 'electronics',
        price_minor: 35000,
        quantity: 20,
      },
      {
        name: 'USB-C Fast Charger',
        description: '45W charger compatible with phones and tablets.',
        category: 'electronics',
        price_minor: 12000,
        quantity: 30,
      },
      {
        name: 'Organic Green Tea',
        description: 'Premium loose-leaf green tea, 100g pack.',
        category: 'groceries',
        price_minor: 8500,
        quantity: 40,
      },
      {
        name: 'Handmade Ceramic Mug',
        description: 'Artisan mug with a matte glaze finish.',
        category: 'home',
        price_minor: 15000,
        quantity: 12,
      },
      {
        name: 'Running Sneakers',
        description: 'Breathable sneakers designed for daily training.',
        category: 'clothing',
        price_minor: 55000,
        quantity: 6,
      },
      {
        name: 'Leather Wallet',
        description: 'Slim bifold wallet with card slots.',
        category: 'accessories',
        price_minor: 18000,
        quantity: 18,
      },
      {
        name: 'Scented Candle Set',
        description: 'Set of three soy candles — lavender, cedar, citrus.',
        category: 'home',
        price_minor: 22000,
        quantity: 10,
      },
      {
        name: 'Limited Edition Hoodie',
        description: 'Soft fleece hoodie — only a few left in stock.',
        category: 'clothing',
        price_minor: 48000,
        quantity: 1,
      },
    ],
  },
  {
    email: 'demo-seller-2@reneo.local',
    password: DEMO_SELLER_PASSWORD,
    fullName: 'Demo Seller 2',
    storeName: 'Tech & Tools Hub',
    products: [
      {
        name: 'Bluetooth Speaker Mini',
        description: 'Pocket-sized speaker with 12-hour battery and deep bass.',
        category: 'electronics',
        price_minor: 28000,
        quantity: 14,
      },
      {
        name: 'Mechanical Keyboard',
        description: 'Compact 75% layout with tactile switches and RGB backlight.',
        category: 'electronics',
        price_minor: 62000,
        quantity: 5,
      },
      {
        name: 'Portable Power Bank 20K',
        description: '20000mAh power bank with dual USB-C ports.',
        category: 'electronics',
        price_minor: 24000,
        quantity: 22,
      },
      {
        name: 'Stainless Steel Water Bottle',
        description: 'Insulated 750ml bottle — keeps drinks cold for 24 hours.',
        category: 'accessories',
        price_minor: 14000,
        quantity: 25,
      },
      {
        name: 'Yoga Mat Pro',
        description: 'Non-slip mat with carrying strap, 6mm thickness.',
        category: 'fitness',
        price_minor: 19000,
        quantity: 16,
      },
      {
        name: 'Smart Watch Band',
        description: 'Silicone replacement band, fits most 42–46mm watches.',
        category: 'accessories',
        price_minor: 9500,
        quantity: 35,
      },
      {
        name: 'Bamboo Cutting Board',
        description: 'Eco-friendly board with juice groove and handle cutout.',
        category: 'home',
        price_minor: 16500,
        quantity: 11,
      },
      {
        name: 'Desk Lamp LED',
        description: 'Adjustable arm lamp with warm/cool white modes.',
        category: 'home',
        price_minor: 21000,
        quantity: 9,
      },
      {
        name: 'Gaming Mouse Pad XL',
        description: 'Extended cloth pad with stitched edges, 900×400mm.',
        category: 'electronics',
        price_minor: 11000,
        quantity: 20,
      },
      {
        name: 'Flash Sale Webcam HD',
        description: '1080p webcam with built-in mic — last unit in stock.',
        category: 'electronics',
        price_minor: 42000,
        quantity: 1,
      },
    ],
  },
];

const DEMO_SELLER_1_EMAIL = 'demo-seller@reneo.local';

async function deleteDemoSellerByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<void> {
  const { data: listData, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) {
    throw new Error(`Failed to list users for deletion: ${listError.message}`);
  }

  const user = listData.users.find((u) => u.email === email);
  if (!user) {
    console.info(`No existing account found for ${email}.`);
    return;
  }

  const pool = getPgPool();
  const storeResult = await pool.query<{ id: string }>(
    'SELECT id FROM stores WHERE seller_id = $1',
    [user.id],
  );
  const storeIds = storeResult.rows.map((row) => row.id);

  if (storeIds.length > 0) {
    const productResult = await pool.query<{ id: string }>(
      'SELECT id FROM products WHERE store_id = ANY($1::uuid[])',
      [storeIds],
    );
    const productIds = productResult.rows.map((row) => row.id);

    if (productIds.length > 0) {
      await pool.query('DELETE FROM order_items WHERE product_id = ANY($1::uuid[])', [productIds]);
    }

    await pool.query('DELETE FROM order_items WHERE store_id = ANY($1::uuid[])', [storeIds]);

    await pool.query(
      `DELETE FROM order_events
       WHERE order_id IN (
         SELECT o.id FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         WHERE oi.id IS NULL
       )`,
    );

    await pool.query(
      `DELETE FROM orders
       WHERE id IN (
         SELECT o.id FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         WHERE oi.id IS NULL
       )`,
    );

    await pool.query('DELETE FROM products WHERE store_id = ANY($1::uuid[])', [storeIds]);
    await pool.query('DELETE FROM stores WHERE id = ANY($1::uuid[])', [storeIds]);
  }

  await pool.query('DELETE FROM profiles WHERE id = $1', [user.id]);

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    throw new Error(`Failed to delete ${email}: ${error.message}`);
  }

  console.info(`Deleted account, store, and products for ${email}.`);
}

async function ensureDemoSeller(
  admin: ReturnType<typeof createClient>,
  config: DemoSellerConfig,
) {
  const { data: listData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = listData.users.find((u) => u.email === config.email);

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: config.email,
      password: config.password,
      email_confirm: true,
      user_metadata: { role: 'SELLER', full_name: config.fullName },
    });
    if (error || !data.user) {
      throw new Error(`Failed to create ${config.email}: ${error?.message}`);
    }
    user = data.user;
    console.info(`Created demo seller: ${config.email}`);
  } else {
    console.info(`Using existing demo seller: ${config.email}`);
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { role: 'SELLER', full_name: config.fullName },
    });
  }

  await admin.from('profiles').upsert(
    {
      id: user.id,
      role: 'SELLER',
      email: config.email,
      full_name: config.fullName,
    },
    { onConflict: 'id' },
  );

  const { data: store, error: storeError } = await admin
    .from('stores')
    .upsert({ seller_id: user.id, name: config.storeName }, { onConflict: 'seller_id' })
    .select('id')
    .single();

  if (storeError || !store) {
    throw new Error(`Failed to ensure store for ${config.email}: ${storeError?.message}`);
  }

  return { userId: user.id, storeId: store.id as string };
}

async function seedProducts(
  admin: ReturnType<typeof createClient>,
  storeId: string,
  storeName: string,
  products: SampleProduct[],
): Promise<number> {
  const { count } = await admin
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', storeId);

  if (count && count > 0) {
    console.info(`  ${storeName} already has ${count} product(s). Skipping insert.`);
    return 0;
  }

  let inserted = 0;

  for (const sample of products) {
    const { data: product, error: productError } = await admin
      .from('products')
      .insert({
        store_id: storeId,
        name: sample.name,
        description: sample.description,
        category: sample.category,
        price_minor: sample.price_minor,
        currency: 'XOF',
      })
      .select('id')
      .single();

    if (productError || !product) {
      throw new Error(`Failed to insert ${sample.name}: ${productError?.message}`);
    }

    const { error: inventoryError } = await admin.from('inventory').insert({
      product_id: product.id,
      quantity: sample.quantity,
    });

    if (inventoryError) {
      throw new Error(`Failed to insert inventory for ${sample.name}: ${inventoryError.message}`);
    }

    inserted += 1;
    console.info(`  + ${sample.name} (${sample.price_minor} XOF, qty ${sample.quantity})`);
  }

  return inserted;
}

async function restoreDemoCatalog(
  admin: ReturnType<typeof createClient>,
  storeId: string,
  storeName: string,
): Promise<void> {
  const { error } = await admin
    .from('products')
    .update({ is_archived: false })
    .eq('store_id', storeId)
    .eq('is_archived', true);

  if (error) {
    throw new Error(`Failed to restore demo catalog for ${storeName}: ${error.message}`);
  }

  console.info(`  Ensured demo catalog is active for ${storeName}.`);
}

async function main() {
  const resetDemoSeller1 = process.argv.includes('--reset-demo-seller-1');
  const env = getEnv();
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (resetDemoSeller1) {
    console.info('Resetting Demo Seller - 1...');
    await deleteDemoSellerByEmail(admin, DEMO_SELLER_1_EMAIL);
  }

  let totalInserted = 0;

  for (const seller of DEMO_SELLERS) {
    console.info('');
    console.info(`--- ${seller.fullName} (${seller.storeName}) ---`);
    const { storeId } = await ensureDemoSeller(admin, seller);
    console.info('Seeding products...');
    totalInserted += await seedProducts(admin, storeId, seller.storeName, seller.products);
    if (!resetDemoSeller1 || seller.email !== DEMO_SELLER_1_EMAIL) {
      await restoreDemoCatalog(admin, storeId, seller.storeName);
    }
  }

  console.info('');
  console.info('Seed complete.');
  if (totalInserted > 0) {
    console.info(`Inserted ${totalInserted} product(s) across demo stores.`);
  }
  console.info('');
  console.info('Demo seller logins:');
  for (const seller of DEMO_SELLERS) {
    console.info(`  ${seller.fullName}`);
    console.info(`    Email:    ${seller.email}`);
    console.info(`    Password: ${seller.password}`);
    console.info(`    Store:    ${seller.storeName}`);
    console.info('');
  }
  console.info('Refresh the marketplace at http://localhost:5173');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
