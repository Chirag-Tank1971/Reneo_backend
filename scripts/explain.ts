import 'dotenv/config';
import pg from 'pg';

const sql = `
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT p.*, i.quantity
FROM products p
JOIN inventory i ON i.product_id = p.id
WHERE p.is_archived = FALSE
  AND p.category = 'clothing'
  AND p.price_minor BETWEEN 1000 AND 50000
  AND p.search_vector @@ websearch_to_tsquery('english', 'shirt')
ORDER BY p.price_minor ASC
LIMIT 20 OFFSET 0;
`;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const result = await client.query(sql);
  console.log(result.rows.map((r) => r['QUERY PLAN']).join('\n'));
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
