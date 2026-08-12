# Reneo Marketplace

Multi-vendor marketplace backend for the **Reneo Backend Developer Internship** technical assessment.

Sellers manage products and inventory. Customers browse, search, and place orders. The API enforces server-side pricing, transactional stock control, idempotent checkout, PostgreSQL Row Level Security (RLS), and an outbox for order notifications.

Includes an optional React frontend for end-to-end demos.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Demo accounts](#demo-accounts)
- [Project structure](#project-structure)
- [API reference](#api-reference)
- [Architecture](#architecture)
- [Database design](#database-design)
- [Authentication & RLS](#authentication--rls)
- [Error handling](#error-handling)
- [Search, indexes & EXPLAIN](#search-indexes--explain)
- [Order flow & concurrency](#order-flow--concurrency)
- [Idempotency](#idempotency)
- [Events](#events)
- [Testing](#testing)
- [Scripts](#scripts)
- [Frontend](#frontend)
- [Environment variables](#environment-variables)
- [Part D — Scaling to 10M users](#part-d--scaling-to-10m-users)
- [Part D — Two more days](#part-d--two-more-days)
- [Part D — AI & library usage](#part-d--ai--library-usage)
- [Known limitations](#known-limitations)
- [Assumptions](#assumptions)
- [Brief compliance checklist](#brief-compliance-checklist)
- [License](#license)

---

## Features

| Area | Implementation |
|------|----------------|
| Auth | Supabase JWT with roles `SELLER` and `CUSTOMER` |
| Products | CRUD, soft-delete (archive), restore, search & filters |
| Search | PostgreSQL full-text search + indexed filters |
| Orders | Transactional creation with server-side pricing |
| Concurrency | `SELECT … FOR UPDATE` on inventory rows |
| Idempotency | `Idempotency-Key` header with payload hashing |
| Security | Express middleware + PostgreSQL RLS |
| Events | `ORDER_CREATED` outbox for seller notifications |
| Docs | OpenAPI / Swagger UI at `/docs` |
| Tests | 17 integration tests including concurrent race |

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20+, TypeScript |
| HTTP | Express.js |
| Auth | Supabase Auth (JWT) |
| Database | PostgreSQL (Supabase) |
| Security | PostgreSQL RLS |
| Validation | Zod |
| Tests | Vitest + Supertest |
| API docs | Swagger UI |
| Frontend | React 19, Vite, Tailwind CSS (optional) |

---

## Quick start

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (Auth + PostgreSQL)

### 1. Install

```bash
git clone <your-repo-url>
cd reneo/backend
npm install
cp .env.example .env
```

### 2. Configure environment

Edit `.env` with your Supabase credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres.[ref]:[password]@...pooler.supabase.com:5432/postgres
PORT=3000
```

> Use the **direct connection** (port 5432) for migrations. The pooler is fine for the running app.

### 3. Migrate, seed, and run

```bash
npm run migrate    # apply SQL migrations
npm run seed       # create demo sellers + products
npm run dev        # start API on http://localhost:3000
```

Verify:

```bash
curl http://localhost:3000/health   # → {"status":"ok"}
```

Open Swagger: **http://localhost:3000/docs**

### 4. Run tests

```bash
npm test           # 17 integration tests (requires .env)
```

---

## Demo accounts

After `npm run seed`, two seller accounts and their stores are ready to use. Sign in via the frontend (`http://localhost:5173/auth`) or Supabase Auth directly.

### Demo Seller - 1 — Reneo Demo Store

| Field | Value |
|-------|-------|
| **Email** | `demo-seller@reneo.local` |
| **Password** | `DemoSeller123!` |
| **Role** | `SELLER` |
| **Name** | Demo Seller - 1 |
| **Store** | Reneo Demo Store |

**Sample products:** Blue Cotton Shirt, Classic Denim Jacket, Wireless Earbuds, USB-C Fast Charger, Organic Green Tea, Handmade Ceramic Mug, Running Sneakers, Leather Wallet, Scented Candle Set, Limited Edition Hoodie *(qty 1 — good for stock-race demos)*.

---

### Demo Seller 2 — Tech & Tools Hub

| Field | Value |
|-------|-------|
| **Email** | `demo-seller-2@reneo.local` |
| **Password** | `DemoSeller123!` |
| **Role** | `SELLER` |
| **Store** | Tech & Tools Hub |

**Sample products:** Bluetooth Speaker Mini, Mechanical Keyboard, Portable Power Bank 20K, Stainless Steel Water Bottle, Yoga Mat Pro, Smart Watch Band, Bamboo Cutting Board, Desk Lamp LED, Gaming Mouse Pad XL, Flash Sale Webcam HD *(qty 1)*.

---

### Customer account

There is no pre-seeded customer. Register one at:

- **Frontend:** http://localhost:5173/auth → choose **Customer**
- **Or** create a user in Supabase Dashboard → Authentication → Users, then set role `CUSTOMER` in `profiles`

Customers can browse both stores, add items to cart, and place orders.

### Re-seeding

```bash
npm run seed
```

- Creates sellers if they do not exist
- **Skips** product insert for stores that already have products
- Safe to run multiple times
- To fully reset Demo Seller - 1 (delete account + products and re-seed): `npm run seed:reset-demo-seller-1`

### Demo walkthrough

1. Start backend (`npm run dev`) and frontend (`npm run dev:frontend`)
2. Sign in as **Demo Seller - 1** → Seller Studio → create / edit / archive products
3. Sign in as **Demo Seller 2** → manage Tech & Tools Hub catalog
4. Sign in as **Customer** → Marketplace → add to cart → checkout
5. Open Swagger at `/docs` to try API endpoints directly

---

## Project structure

```
reneo/
├── backend/
│   ├── src/
│   │   ├── config/          # env, database, swagger
│   │   ├── controllers/     # HTTP handlers
│   │   ├── middleware/      # auth, validation, errors
│   │   ├── repositories/    # data access (Supabase + raw SQL)
│   │   ├── routes/          # route definitions
│   │   ├── services/        # orders, events
│   │   ├── types/           # shared TypeScript types
│   │   ├── utils/           # helpers, error classes
│   │   ├── app.ts           # Express app setup
│   │   └── server.ts        # entry point
│   ├── supabase/migrations/ # SQL schema, RLS, indexes
│   ├── scripts/
│   │   ├── migrate.ts       # run migrations
│   │   ├── seed.ts          # demo sellers + products
│   │   └── explain.ts       # EXPLAIN product search query
│   ├── tests/
│   │   └── api.test.ts      # integration tests
│   └── docker-compose.yml   # local Postgres (optional)
└── frontend/                # optional React UI
```

---

## API reference

All protected routes require:

```
Authorization: Bearer <supabase_access_token>
```

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Liveness check |

### Products

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/products` | SELLER | Create product + inventory |
| GET | `/products` | Any | Search, filter, paginate |
| GET | `/products/:id` | Any | Get single product |
| PATCH | `/products/:id` | SELLER | Update own product |
| DELETE | `/products/:id` | SELLER | Archive (soft delete) |

**Search example:**

```
GET /products?page=1&limit=20&search=shirt&category=clothing&minPrice=1000&maxPrice=50000&available=true&sort=price_asc
```

| Query param | Description |
|-------------|-------------|
| `search` | Full-text search on name/description |
| `category` | Filter by category |
| `minPrice` / `maxPrice` | Price range (minor units) |
| `available` | `true` = in stock only |
| `mine` | `true` = seller's own products (incl. archived) |
| `sort` | `price_asc`, `price_desc`, `created_at_asc`, `created_at_desc`, `name_asc`, `name_desc` |

### Orders

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/orders` | CUSTOMER | Create order |

**Headers:**

```
Idempotency-Key: <unique-string>
```

**Body:**

```json
{
  "items": [
    { "product_id": "uuid", "quantity": 2 }
  ]
}
```

Prices are **never** accepted from the client. The server reads `price_minor` from the database inside the transaction.

### Documentation

Interactive OpenAPI docs: **http://localhost:3000/docs**

---

## Architecture

```mermaid
flowchart TB
  Client[Client / Frontend]
  API[Express API]
  Auth[Supabase Auth JWT]
  PG[(PostgreSQL + RLS)]
  Outbox[order_events outbox]
  Worker[Event processor]

  Client -->|Bearer JWT| API
  API --> Auth
  API -->|User-scoped Supabase client| PG
  API -->|Transactional pg pool| PG
  API --> Outbox
  Worker --> Outbox
  Worker -->|Seller notification| Notify[Email / Webhook / Realtime]
```

**Request flow**

1. Client sends JWT → middleware validates token and loads `profiles.role`
2. Controllers validate input with Zod
3. Services run business logic; orders use raw `pg` transactions
4. RLS policies enforce row access on direct Supabase client queries
5. Errors map to consistent HTTP status codes via centralized handler

---

## Database design

### Money

All prices use **`BIGINT` minor units** (e.g. XOF/FCFA). No floating point — avoids rounding errors.

### Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User role + metadata (`SELLER` / `CUSTOMER`) |
| `stores` | One store per seller (`seller_id` UNIQUE) |
| `products` | Catalog with `search_vector` for FTS |
| `inventory` | Stock per product (`quantity >= 0`) |
| `orders` | Customer orders with `total_minor` |
| `order_items` | Line items; `unit_price_minor` snapshotted at purchase |
| `idempotency_keys` | `UNIQUE(customer_id, idempotency_key)` |
| `order_events` | Outbox for `ORDER_CREATED` notifications |

### Relationships

```
Seller → Store → Products → Inventory
Customer → Order → Order Items → Product / Store (price snapshot)
```

---

## Authentication & RLS

### Authentication

- Identity comes from the JWT — **never trust client-supplied user IDs**
- Roles: `SELLER` (manage own store) and `CUSTOMER` (place orders)
- Sellers can only mutate resources tied to their `store.seller_id`

### Row Level Security

RLS is enabled on all business tables using `auth.uid()`:

| Table | Policy summary |
|-------|----------------|
| `products` | Public read (non-archived); sellers CRUD own store |
| `inventory` | Public read; sellers update own products |
| `orders` | Customers see own orders; sellers see orders with their items |
| `idempotency_keys` | Customers access own keys only |

Express middleware is the first line of defense; **RLS is the mandatory second line** against direct database access.

RLS policy SQL lives in [`supabase/migrations/002_rls_policies.sql`](supabase/migrations/002_rls_policies.sql). Automated test #12 verifies Seller B cannot read Seller A's archived product via a user-scoped Supabase client.

---

## Error handling

All errors return a consistent JSON shape:

```json
{
  "error": {
    "code": "OUT_OF_STOCK",
    "message": "Insufficient stock for product …"
  }
}
```

| HTTP | Code | When |
|------|------|------|
| **400** | `INVALID_INPUT` | Validation failure, unknown price fields in payload |
| **401** | `UNAUTHENTICATED` | Missing or invalid JWT |
| **403** | `FORBIDDEN` | Wrong role or not owner of resource |
| **404** | `NOT_FOUND` | Product or resource does not exist |
| **409** | `OUT_OF_STOCK` | Insufficient inventory |
| **409** | `IDEMPOTENCY_PAYLOAD_MISMATCH` | Same idempotency key, different body |
| **500** | `INTERNAL_ERROR` | Unexpected server error |

Implementation: [`src/utils/errors.ts`](src/utils/errors.ts) + [`src/middleware/errorHandler.ts`](src/middleware/errorHandler.ts).

---

## Search, indexes & EXPLAIN

Search runs entirely in PostgreSQL — no post-filtering in JavaScript. Indexes are defined in [`supabase/migrations/003_indexes.sql`](supabase/migrations/003_indexes.sql):

| Index | Purpose |
|-------|---------|
| `idx_products_search_vector` (GIN) | Full-text search on name/description |
| `idx_products_category_price` | Category + price filter (partial, non-archived) |
| `idx_products_not_archived` | Partial index for active products |
| `idx_inventory_available` | Availability filter (`quantity > 0`) |
| B-tree on `price_minor`, `created_at`, `store_id` | Sorting and range filters |

### EXPLAIN output

Run against your database:

```bash
npm run explain
```

Example output (small seed dataset — planner may use sequential scans until ~1M rows; indexes are in place for scale):

```
Limit  (cost=3.64..3.65 rows=1 width=221) (actual time=0.246..0.249 rows=4 loops=1)
  ->  Sort  (cost=3.64..3.65 rows=1 width=221)
        Sort Key: p.price_minor
        ->  Hash Join  (cost=2.38..3.63 rows=1 width=221)
              ->  Seq Scan on inventory i
              ->  Hash
                    ->  Index Scan using idx_products_category_price on products p
                          Index Cond: (category = 'clothing' AND price_minor >= 1000 AND price_minor <= 50000)
                          Filter: (search_vector @@ '''shirt'''::tsquery)
Planning Time: 21.917 ms
Execution Time: 0.308 ms
```

At 1M+ rows the planner selects GIN + composite B-tree indexes instead of sequential scans. `LIMIT/OFFSET` is acceptable at moderate scale; cursor pagination is listed under [Part D — Two more days](#part-d--two-more-days).

---

### Transaction steps

1. Authenticate customer
2. Validate payload (reject client prices via Zod `.strict()`)
3. Claim idempotency key
4. Lock inventory rows: `SELECT … FOR UPDATE OF i` (sorted by `product_id` to avoid deadlocks)
5. Verify stock and product availability
6. Decrement inventory: `UPDATE … WHERE quantity >= $qty`
7. Insert `orders` + `order_items` with database prices
8. Insert `order_events` (`ORDER_CREATED`)
9. Cache idempotency response
10. `COMMIT` (full `ROLLBACK` on any failure)

### Concurrent stock (critical)

**Problem:** Two customers ordering the last unit must not both succeed.

**Solution:** Row-level lock on `inventory` inside a single transaction.

| Step | What happens |
|------|--------------|
| Tx A | Locks inventory row, decrements to 0, commits |
| Tx B | Blocks on `FOR UPDATE`, then sees `quantity < 1` → **409 OUT_OF_STOCK** |

With `stock = 1`, exactly **one** concurrent order succeeds. Verified by Test 5 (`Promise.all` race).

### What is atomic?

The entire order creation — idempotency claim, inventory lock, stock decrement, order insert, event insert, idempotency response cache — runs in **one PostgreSQL transaction**. Either all steps commit or all roll back.

### What is locked?

The **`inventory` row** for each product in the order, via `SELECT … FOR UPDATE OF i`, in sorted `product_id` order to prevent deadlocks. The lock is held until `COMMIT` or `ROLLBACK`.

### What happens to the second request?

While the first transaction holds the lock, the second **blocks** on `FOR UPDATE`. When the first commits with `quantity = 0`, the second proceeds, fails the `quantity >= requested` check (or the conditional `UPDATE`), and returns **409 OUT_OF_STOCK**.

### Alternatives considered

| Approach | Verdict |
|----------|---------|
| Application-level check only | ❌ Race condition — both requests can read `quantity = 1` |
| Optimistic locking (version column) | ✅ Valid, but more retries under high contention |
| `SELECT FOR UPDATE` | ✅ **Chosen** — simple, strong guarantee, works with RLS |
| Redis distributed lock | ❌ Extra infrastructure; does not protect direct DB access |

### Price integrity

- Clients must not send `price`, `price_minor`, `total`, or similar fields
- `unit_price_minor` is read from `products.price_minor` inside the transaction
- Historical orders stay correct even if prices change later

---

## Idempotency

| Behavior | Result |
|----------|--------|
| New key + valid payload | **201** — order created |
| Same key + same payload | **201** — cached response (same order) |
| Same key + different payload | **409** `IDEMPOTENCY_PAYLOAD_MISMATCH` |

- Header: `Idempotency-Key: <unique-string>`
- Body hashed with SHA-256
- Retention: `IDEMPOTENCY_TTL_DAYS` (default **7**)
- Concurrent duplicates: second request blocks on idempotency row lock until first completes

---

## Events

After a successful order commit, an outbox row is written to `order_events`. A worker (`processPendingOrderEvents`) simulates seller notification.

**Failure handling:** If notification fails, the order remains committed. The event stays `pending`/`failed` for retry. Orders are never rolled back because of a downstream notification failure.

---

## Testing

```bash
npm test              # run all tests
npm run test:watch    # watch mode
npm run typecheck     # TypeScript check
npm run build         # compile to dist/
```

### Scenarios covered (17 tests)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Seller A creates product | Success |
| 2 | Seller B modifies Seller A product | Denied |
| 3 | Seller A `GET /products/mine` lists only own products | Scoped |
| 4 | `GET /products?mine=true` rejected | 403 |
| 5 | Marketplace list includes store/seller names | Names present |
| 6 | Seller B cannot archive Seller A product | Denied |
| 7 | Customer orders available product | 201 |
| 8 | Customer orders more than stock | 409 |
| 9 | **Concurrent orders, stock = 1** | One 201, one 409 |
| 10 | Unauthenticated request | 401 |
| 11 | Invalid input | 400 |
| 12 | Price manipulation in payload | 400 |
| 13 | Duplicate idempotency key | 201 (same order) |
| 14 | Same key, different payload | 409 |
| 15 | Invalid product ID | 404 |
| 16 | RLS — Seller B cannot read Seller A archived product | Blocked |
| 17 | Env guard when not configured | Skipped |

Tests require a configured `.env` pointing at a real Supabase project.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled server |
| `npm test` | Integration tests |
| `npm run migrate` | Apply SQL migrations |
| `npm run seed` | Create demo sellers + products |
| `npm run seed:reset-demo-seller-1` | Delete and re-seed Demo Seller - 1 |
| `npm run cleanup:test-data` | Remove `@reneo-test.local` test users |
| `npm run explain` | Print EXPLAIN plan for product search |
| `npm run dev:frontend` | Start React frontend |

---

## Frontend

Optional React marketplace UI in `frontend/`.

```bash
cd frontend
cp .env.example .env    # same SUPABASE_URL + SUPABASE_ANON_KEY as backend
npm install
npm run dev
```

Or from repo root:

```bash
npm run dev:frontend
```

| URL | Page |
|-----|------|
| http://localhost:5173 | Marketplace (browse & search) |
| http://localhost:5173/auth | Sign in / register (Seller or Customer) |
| http://localhost:5173/seller | Seller Studio (create, edit, archive, restore) |
| http://localhost:5173/cart | Cart & checkout |

API requests proxy to `http://localhost:3000` via Vite in dev.

### Deploying backend on Render

Use [`render.yaml`](render.yaml) or configure manually:

| Setting | Value |
|---------|--------|
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Health Check | `/health` |

Required env vars: Supabase + `DATABASE_URL`, plus:

```env
NODE_ENV=production
CORS_ALLOW_VERCEL_PREVIEWS=true
```

### Deploying frontend on Vercel

1. Set Vercel environment variables (same Supabase keys as backend):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL` = your **public backend URL** (not `/api` — Vite proxy is dev-only)
2. On the backend host, allow the Vercel origin via CORS:
   - `CORS_ORIGINS=https://your-app.vercel.app`, **or**
   - `CORS_ALLOW_VERCEL_PREVIEWS=true` (default) to allow any `https://*.vercel.app` deploy/preview URL

---

## Environment variables

See [`.env.example`](.env.example).

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Public anon key (JWT verification) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (tests, seed, admin) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORT` | No | HTTP port (default `3000`) |
| `NODE_ENV` | No | `development` / `production` |
| `IDEMPOTENCY_TTL_DAYS` | No | Key retention in days (default `7`) |
| `CORS_ORIGINS` | No* | Comma-separated frontend URLs allowed to call the API |
| `CORS_ALLOW_VERCEL_PREVIEWS` | No | `true` (default) — allow `https://*.vercel.app` origins |

\* In production, set `CORS_ORIGINS` to your Vercel URL **or** keep `CORS_ALLOW_VERCEL_PREVIEWS=true`.

**Never commit `.env` or real credentials.**

---

## Part D — Scaling to 10M users

### What breaks first?

1. **Write contention** on hot `inventory` rows (flash sales)
2. **Connection exhaustion** without pooling (PgBouncer / Supabase pooler)
3. **Deep offset pagination** on product search
4. **Single-node write throughput** on `orders` + `order_events`

### Target architecture

```mermaid
flowchart TB
  subgraph Edge["Edge & clients"]
    Web[Web / Mobile apps]
    CDN[CDN — cached catalog pages]
  end

  subgraph Gateway["API layer"]
    LB[Load balancer]
    RL[Rate limiter / API gateway]
    API1[Express API × N]
    API2[Express API × N]
  end

  subgraph Data["Data & cache"]
    Pool[PgBouncer — transaction pooling]
    PGW[(PostgreSQL primary — writes)]
    PGR1[(Read replica — search)]
    PGR2[(Read replica — reports)]
    Redis[(Redis — hot catalog cache)]
  end

  subgraph Async["Async & search"]
    Outbox[(order_events outbox)]
    Q[Queue — SQS / BullMQ]
    Worker[Notification workers]
    OS[OpenSearch — full catalog search]
  end

  subgraph Observe["Observability"]
    Prom[Prometheus metrics]
    Graf[Grafana dashboards]
    Trace[OpenTelemetry traces]
  end

  Web --> CDN
  Web --> LB
  LB --> RL --> API1 & API2
  API1 & API2 --> Pool --> PGW
  API1 & API2 --> PGR1 & PGR2
  API1 & API2 --> Redis
  PGW --> Outbox --> Q --> Worker
  Worker --> Notify[Email / Webhook / Realtime]
  PGR1 -.->|CDC / sync| OS
  API1 & API2 --> Prom --> Graf
  API1 & API2 --> Trace
```

### Evolution plan

| Concern | Approach |
|---------|----------|
| PostgreSQL | Read replicas for search; partition `orders` by month |
| Pooling | PgBouncer transaction mode |
| Caching | Redis + CDN for catalog reads |
| Orders | Queue workers for notifications and side effects |
| Search | OpenSearch when Postgres FTS is exhausted |
| Monitoring | Prometheus + Grafana; p95 alerts on `POST /orders` |
| Rate limiting | API gateway per customer / IP |

### What not to build yet

- Multi-region active-active
- Custom search cluster before Postgres indexes are exhausted
- Microservices split before team size justifies it
- Redis distributed locks for inventory (DB row locks + RLS already suffice)

---

## Part D — Two more days

With two extra days, I would add:

- Cursor-based pagination (replace deep `OFFSET`)
- Dedicated worker container for outbox processing
- Structured logging (pino) + OpenTelemetry traces
- Load tests (k6) for concurrent order scenarios
- Admin endpoints for order status management

---

## Part D — AI & library usage

| Tool / library | Usage |
|----------------|-------|
| Cursor / Claude | Scaffolding, README, concurrency docs, test layout, frontend UI |
| Express | HTTP server |
| Supabase JS | Auth + RLS-scoped data access |
| `pg` | Transactional order processing |
| Zod | Request validation |
| Vitest + Supertest | Integration tests |

**Key learnings:** `FOR UPDATE` with sorted lock order prevents deadlocks; idempotency via DB unique constraints; outbox pattern decouples notifications from the request path.

---

## Known limitations

- Product search via `pgPool` mirrors RLS rules in application code (RLS still protects direct Supabase access)
- `LIMIT/OFFSET` pagination degrades at very deep pages
- Notification worker is in-process, not a separate queue consumer
- No rate limiting or API gateway in this assessment scope
- EXPLAIN on a small seed DB may show sequential scans; indexes target 1M+ row scale

---

## Assumptions

| Topic | Assumption |
|-------|------------|
| Currency | XOF/FCFA stored as integer minor units (`BIGINT`) |
| One store per seller | `stores.seller_id` is UNIQUE |
| Archive vs delete | Products are soft-deleted (`is_archived`) to preserve order history |
| Idempotency scope | Per customer — `UNIQUE(customer_id, idempotency_key)` |
| Notifications | Outbox table + in-process worker (not Supabase Realtime in this scope) |
| Frontend | Optional extra for demos — **not required** by the brief |

---

## Brief compliance checklist

Mapping to the Reneo Backend Developer Internship brief:

| Requirement | Status | Where |
|-------------|--------|-------|
| **A1** Auth + roles (`SELLER`, `CUSTOMER`) | ✅ | [Authentication & RLS](#authentication--rls), `profiles` table |
| **A2** Schema (profiles, stores, products, orders, order_items, inventory) | ✅ | [`001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql), [Database design](#database-design) |
| **A3** Product API (CRUD + list own) | ✅ | [API reference](#api-reference) |
| **A4** Search + pagination + EXPLAIN | ✅ | [Search, indexes & EXPLAIN](#search-indexes--explain) |
| **A5** Server-side pricing | ✅ | [Order flow & concurrency](#order-flow--concurrency) |
| **A6** RLS policies | ✅ | [`002_rls_policies.sql`](supabase/migrations/002_rls_policies.sql), test #12 |
| **A7** Consistent errors (400–500) | ✅ | [Error handling](#error-handling) |
| **B1** Concurrent stock | ✅ | [Concurrent stock](#concurrent-stock-critical), test #5 |
| **B2** Idempotency | ✅ | [Idempotency](#idempotency), tests #9–10 |
| **B3** ORDER_CREATED events | ✅ | [Events](#events) |
| **C** Five mandatory tests | ✅ | [Testing](#testing) — 17 tests total |
| **D1** Scaling + diagram | ✅ | [Part D — Scaling](#part-d--scaling-to-10m-users) |
| **D2** Two more days | ✅ | [Part D — Two more days](#part-d--two-more-days) |
| **D3** AI / library usage | ✅ | [Part D — AI & library usage](#part-d--ai--library-usage) |
| SQL migrations | ✅ | `supabase/migrations/` |
| OpenAPI / Swagger | ✅ | http://localhost:3000/docs |
| `.env.example`, no secrets | ✅ | [Environment variables](#environment-variables) |
| **GitHub commit history** | ⚠️ | Push repo with multiple commits (not one squash) |
| **3–5 min demo video** | ⚠️ | Record separately — include concurrency test run |

---

## License

MIT
