# TastyFood — AI-assisted restaurant reservation platform

![Status](https://img.shields.io/badge/Status-Tier%201%20Core-brightgreen)
![Stack](https://img.shields.io/badge/Stack-React%20%7C%20Express%20%7C%20Prisma%20%7C%20PostgreSQL-blue)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

Rebuilt from a legacy PHP/MySQL marketing site (audit score **2.5/10**) into a layered Node.js platform with real auth, transactional booking, and an admin dashboard — aimed at fresher SDE placement interviews.

The old critical defects this rewrite closes by design:

| Legacy defect | How v2 prevents it |
|---|---|
| SQL injection in register | Prisma parameterized queries only — no string-concatenated SQL |
| Stored XSS via username in `alert()` | React escapes by default; no `alert()` feedback path |
| Two disconnected MySQL databases | One Postgres schema; `reservations.user_id` → `users.id` FK |
| No double-booking protection | `SELECT … FOR UPDATE` + Postgres exclusion constraint |
| Sessions set but never read | JWT + refresh cookie; navbar and protected routes reflect auth |

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite (CSS ported from the original `style.css`) |
| API | Node.js + Express |
| ORM | Prisma |
| Database | PostgreSQL 16 (Neon free tier or Docker/`pgvector` image) |
| Auth | JWT access token (memory) + httpOnly refresh cookie + bcrypt |
| Validation | Zod on every request body/query |
| Security | helmet, express-rate-limit, SameSite=strict refresh cookie |
| Tests | Vitest (+ Supertest ready for integration tests) |
| Deploy | Docker Compose → Railway / Render |

> **Architecture rule:** Routes → Controllers → Services → Prisma. No business logic in route handlers.

Later phases (not required for Tier 1): FastAPI no-show model + overbooking rule; Claude NL booking + allergen RAG (`pgvector`).

---

## Monorepo layout

```
apps/api     Express API, Prisma schema, migrations, seed
apps/web     React SPA (Vite)
docker-compose.yml   Postgres + Redis + api + web (+ optional ml profile)
```

Legacy PHP handlers have been removed from the working tree. Keep git tag `v1-php` (or commit `ab65a26`) as the “before” story for interviews.

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
cd TastyFood
npm install
cp .env.example .env
```

Edit `.env`:

- Set `DATABASE_URL` to your Postgres URL (Neon: append `?sslmode=require`)
- Keep or regenerate `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (32+ random chars)

Redis is optional — the API degrades to in-memory rate limits / no cache if Redis is down.

### 3. Migrate & seed

```bash
npm run db:migrate
npm run db:seed
```

Seed accounts (override passwords via `SEED_ADMIN_PASSWORD` / `SEED_USER_PASSWORD`):

| Role | Email | Default password |
|---|---|---|
| Admin | `admin@tastyfood.local` | `Admin@12345` |
| Guest | `guest@tastyfood.local` | `Guest@12345` |

### 4. Run

```bash
npm run dev
```

- Web: http://localhost:5173  
- API: http://localhost:4000  
- Health: http://localhost:4000/health/live  

### 5. Tests

```bash
npm test
```

---

## What to demo in an interview

1. **Register / login / logout** — navbar changes; `/my-reservations` is gated.
2. **Book a table** — live availability slots; confirmation shows a `TF-…` reference.
3. **Double-booking** — fill a slot from two clients; second request gets a conflict.
4. **Admin** (`/admin`) — confirm / seat / no-show; menu CRUD (add, 86, edit, delete).
5. **Whiteboard** — walk through `booking.service.js`: lock tables → overlap check → best-fit → insert.

---

## Phase status

| Phase | Status |
|---|---|
| 1 Schema + migrations + seed | Done |
| 2 Auth (JWT + bcrypt + route guards) | Done |
| 3 Reservations + row locking | Done |
| 4 React UI (CSS port) | Done |
| 5 Menu from DB + admin dashboard | Done |
| 6 FastAPI no-show + overbooking | Later |
| 7 Claude NL booking + allergen RAG | Later |

See `TECH-STACK.md` for the definitive Node stack notes (the older Spring/Thymeleaf draft in git history is obsolete).
