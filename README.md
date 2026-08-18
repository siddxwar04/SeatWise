# SeatWise

**Every table in the city, one search — plus the yield layer that keeps those tables from going empty.**

[![CI](https://github.com/siddxwar04/SeatWise/actions/workflows/ci.yml/badge.svg)](https://github.com/siddxwar04/SeatWise/actions/workflows/ci.yml)
![Stack](https://img.shields.io/badge/Stack-React%20%7C%20Express%20%7C%20Prisma%20%7C%20PostgreSQL-blue)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

SeatWise is a **multi-city restaurant reservation marketplace** with a **restaurant-owner console**. Diners search, filter, book, and join a waitlist. Owners get no-show risk scores, expected-value overbooking, floor assignment, and analytics.

---

## Two ways to run it

| Mode | What you get | Backend required? |
| --- | --- | --- |
| **Web demo (default)** | Full diner + owner UI on generated data | No |
| **Live API** | Real Postgres bookings, JWT, RAG chat | Yes |

Screens call **service functions**, not fixtures. With `VITE_LIVE_API` off (default), those services use demo data so the whole product is clickable without Postgres. Set `VITE_LIVE_API=true` to hit Express.

---

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18, Vite 6, React Router 6 |
| API | Node.js 20+, Express 4 |
| ORM | Prisma 6 |
| Database | PostgreSQL 16 (`pgvector` image) |
| Cache / limits | Redis 7 (optional — API degrades if Redis is down) |
| Auth | JWT access token (memory) + httpOnly refresh cookie + bcrypt |
| Validation | Zod on every request body/query |
| Security | Helmet, express-rate-limit, `SameSite=strict` refresh cookie |
| AI concierge | OpenAI `text-embedding-3-small` + pgvector + `gpt-4o-mini` |
| Tests | Vitest (unit) + concurrency suite against real Postgres |
| CI | GitHub Actions (format, migrate, unit, concurrency, web build) |

Layering: **routes → controllers → services → Prisma**.

---

## Product

### Diner marketplace

- 34 restaurants across 6 cities (Pune, Mumbai, Bengaluru, Hyderabad, Chennai, Delhi NCR)
- Search, cuisine / area / price filters, “available tonight”, party size, time
- Venue page with slots, hold timer, confirm booking, waitlist
- My bookings (login required)
- Dark / light / system theme

### Owner console (`/console`)

Sign in as the demo owner. Tabs:

1. **Tonight’s book** — confirm, seat, no-show, cancel
2. **Risk queue** — highest predicted no-show first, with feature-level reasons
3. **Overbooking** — extra covers from the no-show distribution, not a flat %
4. **Floor & waitlist** — occupancy, waitlist, tightest-fit seating vs first-fit
5. **Analytics** — 30-day occupancy, heatmap, lead time / party size slices

### For restaurants (`/for-restaurants`)

Live **no-show cost calculator** and a walkthrough of how the risk score is built.

### Yield layer

| Module | What it does |
| --- | --- |
| Logistic no-show (`apps/web/src/lib/risk.js`, `apps/api/src/modules/risk`) | `P(no-show) = sigmoid(bias + w · x)` using lead time (log days), party size, confirmation, prior no-shows/visits, first-time guest, weekend, prime time, prepaid/deposit. Coefficients are published so a host can see why a booking is high-risk. Scoring is in-process JS (not a separately trained Python service). |
| Overbooking (web console) | Exact **Poisson-binomial** PMF over per-booking probabilities, then the largest extra covers that keep `P(turning someone away) < 5%`. |
| Overbooking (API) | `floor(Σ P(no-show))` extra covers per slot, cached ~20s, dropped on write. |
| Table assignment | Largest-party-first, tightest single fit, same-zone table combining, swap improvement pass. Zones are a hard constraint. |

### AI concierge (RAG)

```
Guest question
    → OpenAI text-embedding-3-small  (1536-d query vector)
    → pgvector cosine search on restaurant_embeddings  (top 5)
    → gpt-4o-mini  (recommend ONLY from retrieved context)
    → { reply, restaurant cards }
```

The model never sees the full catalogue and cannot invent venues. If the embedding index is empty, the API tells you to generate embeddings instead of guessing.

Needs `OPENAI_API_KEY`. Optional for everything else.

---

## Repo layout

```
apps/web             React SPA — marketplace + owner console
apps/api             Express API, Prisma schema, migrations, seed
scripts/             embeddings, photo download, test-Postgres wait
docker-compose.yml   Postgres (pgvector) + Redis + api + web
.github/workflows/ci.yml
```

---

## Quick start — UI only (no Docker, no Postgres)

```bash
git clone https://github.com/siddxwar04/SeatWise.git
cd SeatWise
npm install
npm run dev:web
```

Open **http://localhost:5173**

| Role | Email | Password |
| --- | --- | --- |
| Diner | `diner@seatwise.app` | `demo1234` |
| Restaurant owner | `owner@seatwise.app` | `demo1234` |

`/console` is owner-only. A diner hitting `/console` is sent home. Logged-out `/bookings` and `/console` go to `/login`.

---

## Quick start — full stack (API + Postgres)

### 1. Prerequisites

- Node.js **20+** (22 recommended)
- PostgreSQL 16 — Neon (free), Docker, or local install
- Redis optional

### 2. Install

```bash
git clone https://github.com/siddxwar04/SeatWise.git
cd SeatWise
npm install
cp .env.example .env
```

Set in `.env`:

- `DATABASE_URL` — Neon: append `?sslmode=require` if needed
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — 32+ random characters each

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Datastores via Docker:

```bash
docker compose up -d postgres redis
```

Default URL (matches `.env.example`):

```
postgresql://tastyfood:tastyfood@localhost:5432/tastyfood?schema=public
```

### 3. Migrate and seed

```bash
npm run db:migrate
npm run db:seed
```

| Role | Email | Default password |
| --- | --- | --- |
| Admin | `admin@tastyfood.local` | `Admin@12345` |
| Guest | `guest@tastyfood.local` | `Guest@12345` |

Override with `SEED_ADMIN_PASSWORD` / `SEED_USER_PASSWORD` in `.env`.

### 4. Run API + web

```bash
npm run dev
```

| Service | URL |
| --- | --- |
| Web | http://localhost:5173 |
| API | http://localhost:4000 |
| Liveness | http://localhost:4000/health/live |
| Readiness | http://localhost:4000/health/ready |

Vite proxies `/api` and `/health` to port 4000 so the refresh cookie stays first-party.

To use the live API from the SPA:

```
VITE_LIVE_API=true
VITE_API_URL=http://localhost:4000
```

Restart `npm run dev:web` after changing these.

### 5. RAG concierge (optional)

```bash
# .env
OPENAI_API_KEY=sk-...

npm run embeddings:generate
```

`npm run embeddings:generate:force` rebuilds all vectors. Re-run after seed or menu changes that should affect recommendations.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API + web in parallel |
| `npm run dev:web` | Vite only |
| `npm run dev:api` | Express only (`node --watch`) |
| `npm run build` | Production Vite build |
| `npm test` | API unit tests (no Postgres) |
| `npm run test:concurrency` | 20-way booking race against test DB |
| `npm run db:migrate` | Prisma migrate (uses root `.env`) |
| `npm run db:seed` | Seed users / restaurants / menus |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | Reset DB (destructive) |
| `npm run db:test` | Start test Postgres on **5433** + migrate |
| `npm run embeddings:generate` | Build pgvector index |
| `npm run format` / `format:check` | Prettier |

---

## API

| Prefix | Purpose |
| --- | --- |
| `GET /health/live` | Process up (no dependency checks) |
| `GET /health/ready` | Postgres required; Redis missing → `degraded`, not `down` |
| `/api/auth` | Register, login, refresh, logout |
| `/api/discovery` | Search / browse |
| `/api/restaurants` | Venues + `mine` for owners |
| `/api/menu` | Menu CRUD |
| `/api/reservations` | Book / list / cancel |
| `/api/waitlist` | Waitlist + assign |
| `/api/admin` | Host actions, risk badges, overbooking |
| `/api/dashboard` | Owner analytics |
| `/api/reviews` | Reviews |
| `/api/chat` | RAG concierge |

---

## Web routes

| Path | Access |
| --- | --- |
| `/` | Landing (once per tab), then Discover |
| `/r/:slug` | Venue + booking sheet |
| `/bookings` | My bookings — login required |
| `/bookings/:reference` | Confirmation |
| `/console` | Owner console — login + owner/admin |
| `/for-restaurants` | Calculator + model explainer |
| `/login` `/register` | Auth |

---

## Concurrency-safe booking

Two guests cannot take the same table for the same window:

1. Transaction + `SELECT … FOR UPDATE` on candidate `restaurant_tables`
2. Overlap check in the booking service
3. Postgres **exclusion constraint** (`btree_gist`) as the last backstop
4. Locks scoped by `restaurant_id` — two venues, same wall-clock slot, both succeed

```bash
npm run db:test          # Docker Postgres on :5433 (separate from dev :5432)
npm run test:concurrency
```

CI runs the same path.

| Assertion | Meaning |
| --- | --- |
| Exactly **1** of 20 `createReservation()` calls fulfills | Lock + conflict path work under contention |
| Other **19** reject with `ConflictError` | Losers are clean **HTTP 409**s |
| `reservations` has **exactly 1** row for that table/window | Proof is in Postgres, not Promise counts |
| Overlapping `19:00` / `20:00` → one winner | Interval overlap, not only identical timestamps |
| Two restaurants, same slot → **2** successes | No cross-tenant lock leak |

---

## Tests & CI

```bash
npm test              # unit (booking, risk, overbooking, assignment, slots, menu)
npm run build
npm run format:check
```

GitHub Actions: Prettier → Prisma migrate on pgvector Postgres → unit tests → concurrency tests → web build.

---

## Environment

Copy `.env.example` → `.env`. Required for the API:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | API will not start without it |
| `JWT_ACCESS_SECRET` | 32+ chars |
| `WEB_ORIGIN` | Default `http://localhost:5173` (CORS) |
| `REDIS_URL` | Optional |
| `OPENAI_API_KEY` | Only for chat + embeddings |
| `RESEND_API_KEY` | Optional email; blank = log and skip |

Concurrency tests use `.env.test`. Do not point that file at a shared or production database.

---

## Docker

```bash
docker compose up -d postgres redis    # datastores
docker compose up                      # full stack (api + web + datastores)
docker compose --profile test up -d postgres-test
```

Image: `pgvector/pgvector:pg16`.

---

## Demo walkthrough

1. Discover → city, filter, search → venue → book → confirmation code
2. Sign in as diner → `/bookings`. Sign out → `/bookings` redirects to login
3. Sign in as owner → `/console` (risk, overbooking, floor, analytics)
4. `/for-restaurants#calculator` — change covers, watch lost revenue
5. With the API up: two clients, one slot — second request is **409**
6. With embeddings generated: Ask AI → venue cards from retrieved context

---

## License

MIT
