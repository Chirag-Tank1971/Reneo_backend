# Reneo Marketplace — Demo Video Script (~3–5 min)

Use this as a teleprompter while recording your walkthrough.

---

## Pre-recording checklist

| Step | Command / note |
|------|----------------|
| Backend running | `cd backend && npm run dev` |
| Frontend (optional) | `cd frontend && npm run dev` |
| Demo data | `npm run migrate && npm run seed` |
| Tests ready | `cd backend && npm test` |
| `.env` configured | Supabase + `DATABASE_URL` |

**Demo accounts (after seed):**
- Seller: `demo-seller@reneo.local` / `DemoSeller123!`
- Seller 2: `demo-seller-2@reneo.local` / `DemoSeller123!`
- Customer: register at `/auth`

---

## [0:00–0:25] Intro

**Say:**
> Hi, this is Reneo — a multi-vendor marketplace I built for the backend internship assessment.
> Sellers manage products and inventory; customers browse, search, and checkout.
> The backend is Node.js and Express with PostgreSQL on Supabase, JWT auth, Row Level Security, and an optional React frontend.

**Show:** README title + repo structure (`backend/`, `frontend/`).

---

## [0:25–1:00] Architecture

**Say:**
> Requests hit Express middleware for auth and validation, then services and repositories.
> Product search runs in Postgres with full-text search and indexes — not filtered in JavaScript.
> Orders run inside a single database transaction: lock inventory with SELECT FOR UPDATE, decrement stock, insert the order, and write an outbox event.
> Supabase handles auth; RLS is a second line of defense if someone bypasses the API.

**Show:** `src/routes`, order service, or README architecture section.

---

## [1:00–2:00] Live demo

**Say:**
> I'll show the app end to end.

**Show:** Frontend at `http://localhost:5173` (or Vercel URL).

1. **Marketplace (customer)** — sign in as customer
   > Customers see products with seller and store names, can search, filter by category, and sort.

2. **Seller Studio** — sign in as `demo-seller@reneo.local`
   > Sellers only see and edit their own catalog — cross-seller edits are blocked in the API and by RLS.

3. **Checkout (optional, ~15 sec)**
   > Checkout sends an Idempotency-Key header so retries don't double-charge. Prices always come from the database, never from the client.

**Show:** Add to cart → place order.

---

## [2:00–3:30] Concurrency test (critical)

**Say:**
> The hardest requirement is concurrent orders when stock equals one. Two customers must not both succeed.

**Show:** `backend/tests/api.test.ts` (Test 5) or README "Concurrent stock" section.

> The test creates a product with quantity one, then fires two order requests at the same time with Promise.all.
> One must return 201 Created; the other must return 409 OUT_OF_STOCK.

**Show:** Terminal in `backend/`:

```bash
npm test
```

Or only the race test:

```bash
npx vitest run -t "concurrent orders"
```

**While tests run, say:**
> Under the hood, each order starts a transaction, locks the inventory row with FOR UPDATE, checks quantity, and decrements atomically.
> The first transaction commits with stock zero. The second waits on the lock, then fails the stock check and rolls back — no overselling.

**Point at output:**
```
✓ Test 5 CRITICAL: concurrent orders with stock=1 — one SUCCESS, one 409
```

> That green check is the proof: exactly one winner, one loser — never two successful orders for the last unit.

*(Optional)* Mention seller isolation test:
> I also test seller isolation — Seller B cannot modify Seller A's products.

---

## [3:30–4:15] Other guarantees

**Say:**
> Quick summary of other behavior covered by the test suite:
> unauthenticated requests get 401; invalid payloads get 400; client-supplied prices are rejected;
> duplicate idempotency keys return the same order; mismatched payloads get 409.
> Swagger docs are at /docs for the full API.

**Show:** `http://localhost:3000/docs` or `17 passed` test summary.

---

## [4:15–4:30] Close

**Say:**
> So Reneo is a production-style marketplace API: transactional inventory, idempotent checkout, Postgres search, RLS, and tests that prove the concurrency story.
> Thanks for watching.

**Show:** GitHub repo URL + green test run.

---

## Timing variants

| Length | What to cut / keep |
|--------|---------------------|
| **~3 min** | Skip live checkout; architecture → Test 5 → close |
| **~5 min** | Full demo + Swagger + seller isolation mention |
