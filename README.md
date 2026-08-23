# SeatWise

**Every table in the city, one search — plus the yield layer that keeps those tables from going empty.**

[![CI](https://github.com/siddxwar04/SeatWise/actions/workflows/ci.yml/badge.svg)](https://github.com/siddxwar04/SeatWise/actions/workflows/ci.yml)
![Stack](https://img.shields.io/badge/Stack-React%20%7C%20Express%20%7C%20Prisma%20%7C%20PostgreSQL-blue)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

SeatWise is a **multi-city restaurant reservation marketplace** with a **restaurant-owner console**. Diners search, filter, book, and join a waitlist. Owners get no-show risk scores, expected-value overbooking, floor assignment, and analytics.

---

## Two ways to run it

| Mode                   | What you get                            | Backend required? |
| ---------------------- | --------------------------------------- | ----------------- |
| **Web demo (default)** | Full diner + owner UI on generated data | No                |
| **Live API**           | Real Postgres bookings, JWT, RAG chat   | Yes               |

Screens call **service functions**, not fixtures. With `VITE_LIVE_API` off (default), those services use demo data so the whole product is clickable without Postgres. Set `VITE_LIVE_API=true` to hit Express.

---

## Stack

| Layer          | Choice                                                         |
| -------------- | -------------------------------------------------------------- |
| Frontend       | React 18, Vite 6, React Router 6                               |
| API            | Node.js 20+, Express 4                                         |
| ORM            | Prisma 6                                                       |
| Database       | PostgreSQL 16 (`pgvector` image)                               |
| Cache / limits | Redis 7 (optional — API degrades if Redis is down)             |
| Auth           | JWT access token (memory) + httpOnly refresh cookie + bcrypt   |
| Validation     | Zod on every request body/query                                |
| Security       | Helmet, express-rate-limit, `SameSite=strict` refresh cookie   |
| AI concierge   | OpenAI `text-embedding-3-small` + pgvector + `gpt-4o-mini`     |
| Tests          | Vitest (unit) + concurrency suite against real Postgres        |
| CI             | GitHub Actions (format, migrate, unit, concurrency, web build) |

Layering: **routes → controllers → services → Prisma**.

---

## Architecture

Request path: **browser → `/api` proxy → Express (routes → controllers → services → Prisma) → PostgreSQL (pgvector)**, with Redis optional and OpenAI used only for embeddings + `gpt-4o-mini`.

![SeatWise architecture: React/Vite browser, Vite /api proxy, Express layered API, PostgreSQL with pgvector, optional Redis, and OpenAI](docs/architecture.svg)

A rendered copy lives at `docs/architecture.svg`. GitHub also draws the diagram below from this Mermaid source:

```mermaid
flowchart LR
  browser["Browser<br/>React + Vite"]
  proxy["Vite /api proxy"]
  express["Express API<br/>routes → controllers → services → Prisma"]
  pg["PostgreSQL 16<br/>pgvector"]
  redis["Redis<br/>optional"]
  openai["OpenAI<br/>embeddings + gpt-4o-mini"]

  browser --> proxy --> express
  express --> pg
  express --> redis
  express --> openai
```

---

## Product

### Diner marketplace

- 34 restaurants across 6 cities (Pune, Mumbai, Bengaluru, Hyderabad, Chennai, Delhi NCR)
- Search, cuisine / area / price filters, “available tonight”, party size, time

<!-- SCREENSHOT: diner search results page -->
<!-- alt: SeatWise diner search showing filtered restaurant cards, cuisine and area chips, and tonight’s availability in Pune -->
<!-- caption: Discover — city, filters, and honest availability -->

- Venue page with slots, hold timer, confirm booking, waitlist

<!-- SCREENSHOT: diner booking confirmation -->
<!-- alt: SeatWise booking sheet after a successful reservation, with confirmation code and hold that has converted into a booking -->
<!-- caption: Booking confirmed — reference, time, and party size -->

- My bookings (login required)
- Dark / light / system theme

### Owner console (`/console`)

Sign in as the demo owner. Tabs:

1. **Tonight’s book** — confirm, seat, no-show, cancel
2. **Risk queue** — highest predicted no-show first, with feature-level reasons

<!-- SCREENSHOT: owner console risk queue -->
<!-- alt: SeatWise owner console risk queue ranking tonight’s bookings by predicted no-show probability with feature-level reasons and call/remind actions -->
<!-- caption: Owner console — risk queue with the why, not just the score -->

3. **Overbooking** — extra covers from the no-show distribution, not a flat %
4. **Floor & waitlist** — occupancy, waitlist, tightest-fit seating vs first-fit
5. **Analytics** — 30-day occupancy, heatmap, lead time / party size slices

### For restaurants (`/for-restaurants`)

Live **no-show cost calculator** and a walkthrough of how the risk score is built.

### Yield layer

| Module                                                                     | What it does                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logistic no-show (`apps/web/src/lib/risk.js`, `apps/api/src/modules/risk`) | `P(no-show) = sigmoid(bias + w · x)` using lead time (log days), party size, confirmation, prior no-shows/visits, first-time guest, weekend, prime time, prepaid/deposit. Coefficients are published so a host can see why a booking is high-risk. Scoring is in-process JS (not a separately trained Python service). |
| Overbooking (web console)                                                  | Exact **Poisson-binomial** PMF over per-booking probabilities, then the largest extra covers that keep `P(turning someone away) < 5%`.                                                                                                                                                                                 |
| Overbooking (API)                                                          | `floor(Σ P(no-show))` extra covers per slot, cached ~20s, dropped on write.                                                                                                                                                                                                                                            |
| Table assignment                                                           | Largest-party-first, tightest single fit, same-zone table combining, swap improvement pass. Zones are a hard constraint.                                                                                                                                                                                               |

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

| Role             | Email                | Password   |
| ---------------- | -------------------- | ---------- |
| Diner            | `diner@seatwise.app` | `demo1234` |
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
postgresql://seatwise:seatwise@localhost:5432/seatwise?schema=public
```

### 3. Migrate and seed

```bash
npm run db:migrate
npm run db:seed
```

| Role  | Email                  | Default password |
| ----- | ---------------------- | ---------------- |
| Admin | `admin@seatwise.local` | `Admin@12345`    |
| Guest | `guest@seatwise.local` | `Guest@12345`    |

Override with `SEED_ADMIN_PASSWORD` / `SEED_USER_PASSWORD` in `.env`.

### 4. Run API + web

```bash
npm run dev
```

| Service   | URL                                |
| --------- | ---------------------------------- |
| Web       | http://localhost:5173              |
| API       | http://localhost:4000              |
| Liveness  | http://localhost:4000/health/live  |
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

| Command                           | What it does                              |
| --------------------------------- | ----------------------------------------- |
| `npm run dev`                     | API + web in parallel                     |
| `npm run dev:web`                 | Vite only                                 |
| `npm run dev:api`                 | Express only (`node --watch`)             |
| `npm run build`                   | Production Vite build                     |
| `npm test`                        | API unit tests (no Postgres)              |
| `npm run test:web`                | Frontend Vitest + Testing Library tests   |
| `npm run test:concurrency`        | 20-way booking race against test DB       |
| `npm run db:migrate`              | Prisma migrate (uses root `.env`)         |
| `npm run db:seed`                 | Seed users / restaurants / menus          |
| `npm run db:studio`               | Prisma Studio                             |
| `npm run db:reset`                | Reset DB (destructive)                    |
| `npm run db:test`                 | Start test Postgres on **5433** + migrate |
| `npm run embeddings:generate`     | Build pgvector index                      |
| `npm run format` / `format:check` | Prettier                                  |

---

## API

| Prefix              | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| `GET /health/live`  | Process up (no dependency checks)                         |
| `GET /health/ready` | Postgres required; Redis missing → `degraded`, not `down` |
| `/api/auth`         | Register, login, refresh, logout                          |
| `/api/discovery`    | Search / browse                                           |
| `/api/restaurants`  | Venues + `mine` for owners                                |
| `/api/menu`         | Menu CRUD                                                 |
| `/api/reservations` | Book / list / cancel                                      |
| `/api/waitlist`     | Waitlist + assign                                         |
| `/api/admin`        | Host actions, risk badges, overbooking                    |
| `/api/dashboard`    | Owner analytics                                           |
| `/api/reviews`      | Reviews                                                   |
| `/api/chat`         | RAG concierge                                             |

---

## Web routes

| Path                   | Access                                |
| ---------------------- | ------------------------------------- |
| `/`                    | Landing (once per tab), then Discover |
| `/r/:slug`             | Venue + booking sheet                 |
| `/bookings`            | My bookings — login required          |
| `/bookings/:reference` | Confirmation                          |
| `/console`             | Owner console — login + owner/admin   |
| `/for-restaurants`     | Calculator + model explainer          |
| `/login` `/register`   | Auth                                  |

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

| Assertion                                                  | Meaning                                         |
| ---------------------------------------------------------- | ----------------------------------------------- |
| Exactly **1** of 20 `createReservation()` calls fulfills   | Lock + conflict path work under contention      |
| Other **19** reject with `ConflictError`                   | Losers are clean **HTTP 409**s                  |
| `reservations` has **exactly 1** row for that table/window | Proof is in Postgres, not Promise counts        |
| Overlapping `19:00` / `20:00` → one winner                 | Interval overlap, not only identical timestamps |
| Two restaurants, same slot → **2** successes               | No cross-tenant lock leak                       |

---

## Tests & CI

```bash
npm test              # API unit (booking, risk, overbooking, assignment, slots, menu)
npm run test:web      # frontend search, booking, risk queue, auth redirects
npm run build
npm run format:check
```

GitHub Actions: Prettier → Prisma migrate on pgvector Postgres → unit tests → **web tests** → concurrency tests → web build.

---

## Environment

Copy `.env.example` → `.env`. Required for the API:

| Variable            | Notes                                  |
| ------------------- | -------------------------------------- |
| `DATABASE_URL`      | API will not start without it          |
| `JWT_ACCESS_SECRET` | 32+ chars                              |
| `WEB_ORIGIN`        | Default `http://localhost:5173` (CORS) |
| `REDIS_URL`         | Optional                               |
| `OPENAI_API_KEY`    | Only for chat + embeddings             |
| `RESEND_API_KEY`    | Optional email; blank = log and skip   |

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

<!-- SCREENSHOT: RAG concierge recommending venues -->
<!-- alt: SeatWise Ask AI panel returning venue cards from retrieved catalogue context rather than a free-form LLM guess -->
<!-- caption: Concierge — recommendations grounded in pgvector retrieval -->

---

## Design decisions

SeatWise is a rebuild, not a restyle. The PHP prototype scored **2.5/10** in audit: SQL injection, XSS, and a split database that could not join a diner to a reservation. The Node stack exists so those classes of bug are structurally hard to reintroduce.

**Locking.** A double-book is a product failure, so creating a reservation takes a pessimistic `SELECT … FOR UPDATE` on candidate tables inside a transaction, then an overlap check, then a Postgres exclusion constraint as the last backstop. Host status edits (seated, no-show, cancelled) are different: two hosts tapping the same row is an accident, not a race for a scarce seat, so those updates are optimistic (`UPDATE … WHERE version = $n`). Mixing the two on purpose is the interview answer — not “we used transactions”.

**Allergen filtering is SQL.** A diner who says “no peanuts” is stating a constraint, not asking for a vibe. The menu query excludes dishes whose allergen tags overlap the request. An LLM does not get a vote: it is the wrong tool for a binary safety filter, and it is slower and non-deterministic besides. The concierge may _talk_ about dietary notes; it does not decide them.

**Refresh tokens are hashed and rotated.** The access token is a short-lived JWT held in memory. The refresh token is an opaque random string stored only as a hash, set as `httpOnly` + `SameSite=strict`, and rotated on every use. Logout deletes the row, so the session actually ends. The legacy app had no logout that meant anything.

---

## Known limitations

These are the next five things I would ship, in this order:

1. **No-show coefficients are published, not fitted.** The logistic form is real; the weights are calibrated to the research-brief scenarios, not trained on production history. The swap is a data problem, not a rewrite: replace the constants in `risk.js` / the API risk module.
2. **Observability is logs, not a product.** There is no error tracker, no request tracing, no product analytics. A host cannot see “the risk queue is empty because scoring failed”.
3. **The RAG concierge is request-path, not queued.** Embeddings and `gpt-4o-mini` run in-process. Under load that will time out rather than shed. A small job queue (and a tighter hourly cap) is the fix.
4. **Cross-venue availability is still fixture-side.** Diner search does not yet ask Postgres “who can seat 4 at 20:00 tonight?” across the city. Booking a specific venue does.
5. **Owner console writes are demo-complete, API-partial.** Risk, overbooking, and assignment run in the browser against a generated book. The live API covers reservations, waitlist, and host status; the yield panels are the next backend slice.

---

## License

MIT
