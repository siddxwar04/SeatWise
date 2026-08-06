# TastyFood — AI-assisted restaurant reservation platform

[![CI](https://github.com/siddxwar04/TastyFood.in/actions/workflows/ci.yml/badge.svg)](https://github.com/siddxwar04/TastyFood.in/actions/workflows/ci.yml)
![Status](https://img.shields.io/badge/Status-Tier%201%20Core-brightgreen)
![Stack](https://img.shields.io/badge/Stack-React%20%7C%20Express%20%7C%20Prisma%20%7C%20PostgreSQL-blue)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

Rebuilt from a legacy PHP/MySQL marketing site (audit score **2.5/10**) into a layered Node.js platform with real auth, transactional booking, and an admin dashboard — aimed at fresher SDE placement interviews.

The old critical defects this rewrite closes by design:

| Legacy defect                        | How v2 prevents it                                             |
| ------------------------------------ | -------------------------------------------------------------- |
| SQL injection in register            | Prisma parameterized queries only — no string-concatenated SQL |
| Stored XSS via username in `alert()` | React escapes by default; no `alert()` feedback path           |
| Two disconnected MySQL databases     | One Postgres schema; `reservations.user_id` → `users.id` FK    |
| No double-booking protection         | `SELECT … FOR UPDATE` + Postgres exclusion constraint          |
| Sessions set but never read          | JWT + refresh cookie; navbar and protected routes reflect auth |

---

## Stack

| Layer      | Choice                                                       |
| ---------- | ------------------------------------------------------------ |
| Frontend   | React 18 + Vite (CSS ported from the original `style.css`)   |
| API        | Node.js + Express                                            |
| ORM        | Prisma                                                       |
| Database   | PostgreSQL 16 (Neon free tier or Docker/`pgvector` image)    |
| Auth       | JWT access token (memory) + httpOnly refresh cookie + bcrypt |
| Validation | Zod on every request body/query                              |
| Security   | helmet, express-rate-limit, SameSite=strict refresh cookie   |
| Tests      | Vitest (+ concurrency suite against real Postgres)           |
| Deploy     | Docker Compose → Railway / Render                            |

> **Architecture rule:** Routes → Controllers → Services → Prisma. No business logic in route handlers.

---

## Shipped vs reserved (read this before demos)

**Shipped (Tier 1 — works today):** multi-restaurant schema, JWT auth, transactional bookings with row locks, availability grid, admin dashboard, menu CRUD from Postgres, OpenAI RAG concierge (`POST /api/chat` + floating chat widget), unit tests, concurrency proof.

**Schema reserved, not implemented (Tier 2):**

| Reserved in schema / env                         | Status                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `noShowRisk`, `riskModelVersion`, `isOverbooked` | Columns exist; FastAPI ML + overbooking rule **not** wired         |
| `BookingChannel.AI_ASSISTANT`                    | Enum value exists; only `WEB` (and seed channels) used in app code |
| `ML_SERVICE_URL`                                 | Configured for a future FastAPI service; booking does not call it  |

Admin UI may show a no-show risk column when null — that is display plumbing for Phase 6/7, not a live model.

---

## AI concierge (RAG pipeline)

Interview-ready explanation of how restaurant recommendations stay grounded in **our** Postgres data:

```
User question
    ↓
OpenAI text-embedding-3-small  →  query vector (1536 dims)
    ↓
pgvector cosine search on restaurant_embeddings  →  top 5 venue docs
    ↓
gpt-4o-mini + system prompt ("recommend ONLY from retrieved context")
    ↓
{ reply, recommendedRestaurantIds, restaurants[] }  →  chat widget cards
```

1. **Index time** — `npm run embeddings:generate` loads each active restaurant with menu items and seating zones, builds a plain-text document (name, address, outdoor/indoor, price range, dish highlights/tags), embeds it with `text-embedding-3-small`, and upserts into `restaurant_embeddings` (pgvector). Content is hashed so unchanged venues are skipped; use `--force` to rebuild all.

2. **Query time** — `POST /api/chat` embeds the guest message the same way, runs `ORDER BY embedding <=> query LIMIT 5`, then asks **gpt-4o-mini** to answer using only that retrieved context. The model is instructed to append `RECOMMENDED_IDS: …`; the API strips that line and returns UUIDs plus card payloads for the UI.

3. **Why this is RAG, not “just ChatGPT”** — the LLM never sees the full catalogue and is forbidden from inventing venues. If embeddings are empty, the API tells you to run the generate script instead of hallucinating.

**Setup**

```bash
# .env
OPENAI_API_KEY=sk-...

npm run db:migrate          # enables pgvector + restaurant_embeddings
npm run embeddings:generate # needs OPENAI_API_KEY
npm run dev                 # Ask AI button (bottom-right)
```

Re-run `embeddings:generate` after seed changes or menu CRUD that should affect recommendations (manual trigger for now).

---

## Monorepo layout

```
apps/api       Express API, Prisma schema, migrations, seed
apps/web       React SPA (Vite)
legacy/        Pre-rebuild PHP-era HTML/CSS/images (audit “before” evidence; not served)
docker-compose.yml   Postgres + Redis + api + web (+ optional ml / test profiles)
```

`legacy/` is the original static frontend moved out of the repo root so it cannot be mistaken for the running app. Keep git tag `v1-php` (or commit `ab65a26`) as the full PHP “before” story for interviews.

---

## Quick start

### 1. Prerequisites

- Node.js **20+** (22 recommended)
- A PostgreSQL database — either:
  - **Neon** (free): create a project → copy the connection string, or
  - **Docker**: `docker compose up -d postgres redis`

### 2. Install & configure

```bash
git clone https://github.com/siddxwar04/TastyFood.in.git
cd TastyFood.in
npm install
cp .env.example .env
```

Edit `.env`:

- Set `DATABASE_URL` to your Postgres URL (Neon: append `?sslmode=require`)
- Replace `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` with long random strings (32+ chars)

Redis is optional — the API degrades to in-memory rate limits / no cache if Redis is down.

### 3. Migrate & seed

```bash
npm run db:migrate
npm run db:seed
```

Seed accounts (override passwords via `SEED_ADMIN_PASSWORD` / `SEED_USER_PASSWORD`):

| Role  | Email                   | Default password |
| ----- | ----------------------- | ---------------- |
| Admin | `admin@tastyfood.local` | `Admin@12345`    |
| Guest | `guest@tastyfood.local` | `Guest@12345`    |

### 4. Run

```bash
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:4000
- Health: http://localhost:4000/health/live

### 5. Tests & build

```bash
npm test          # unit tests (no Postgres required)
npm run build     # Vite production build
```

Concurrency proof needs Docker — see below.

---

## Verifying the concurrency fix

The legacy app had no capacity check: two guests could book the same table for the same time and both inserts succeeded. v2 prevents that with `SELECT … FOR UPDATE` plus a Postgres exclusion constraint.

Sequential unit tests cannot prove that. This suite opens **20 real concurrent transactions** against a dedicated test database and asserts the database — not just the Promise results — ends with a single row. It also covers overlapping (non-identical) windows and multi-restaurant isolation (two venues, same wall-clock slot, both succeed).

### Run it

```bash
# Needs Docker. Starts Postgres on port 5433 (separate from dev :5432).
npm run db:test

# Fires the concurrency suite only (uses .env.test → tastyfood_test).
npm run test:concurrency
```

CI runs the same path via `.github/workflows/ci.yml`.

### What pass / fail means

| Assertion                                                  | Meaning                                                                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Exactly **1** of 20 `createReservation()` calls fulfills   | Application-level lock + conflict path works under contention                                   |
| The other **19** reject with `ConflictError`               | Losers are clean 409s, not timeouts or 500s                                                     |
| `reservations` has **exactly 1** row for that table/window | Proof is in Postgres — a silent double-write would fail here even if Promise counts looked fine |
| Overlapping windows `19:00` and `20:00` → one winner       | Interval overlap (not only identical timestamps) is enforced                                    |
| Two restaurants, same slot → **2** successes               | Locks / exclusion are scoped per venue (no cross-tenant contention)                             |

If you see pool timeouts or non-`ConflictError` rejections under load, that is a test-environment / connection-limit issue to investigate — do not “fix” it by weakening the booking service.

`booking.service.js` is intentionally untouched by this harness; the harness exists to prove the code that is already there.

---

## What to demo in an interview

1. **Register / login / logout** — navbar changes; `/my-reservations` is gated.
2. **Book a table** — live availability slots; confirmation shows a `TF-…` reference.
3. **Double-booking** — fill a slot from two clients; second request gets a conflict.
4. **Admin** (`/admin`) — confirm / seat / no-show; menu CRUD (add, 86, edit, delete).
5. **AI concierge** — Ask AI → natural-language venue recommend → Book a table card.
6. **Whiteboard** — walk through `booking.service.js`: lock tables → overlap check → best-fit → insert.
7. **Before/after** — open `legacy/` (or tag `v1-php`) next to the React app.

---

## Phase status

| Phase                                             | Status                                      |
| ------------------------------------------------- | ------------------------------------------- |
| 1 Schema + migrations + seed                      | **Shipped**                                 |
| 2 Auth (JWT + bcrypt + route guards)              | **Shipped**                                 |
| 3 Reservations + row locking (+ multi-restaurant) | **Shipped**                                 |
| 4 React UI (CSS port)                             | **Shipped**                                 |
| 5 Menu from DB + admin dashboard                  | **Shipped**                                 |
| 6 FastAPI no-show + overbooking                   | **Schema reserved** — not implemented       |
| 7 OpenAI NL concierge + pgvector RAG          | **Shipped** (`POST /api/chat`, chat widget) |

See `TECH-STACK.md` for the definitive Node stack notes (the older Spring/Thymeleaf draft in git history is obsolete).
