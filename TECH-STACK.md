# TastyFood — Final Tech Stack (v2)

Definitive list for the **Node rebuild**. An earlier draft targeted Java/Spring/Thymeleaf; that path was abandoned in favour of the stack already implemented under `apps/`.

---

## One-line answer

**Frontend:** React 18 + Vite + the existing CSS design system  
**Backend:** Node.js + Express + Prisma  
**Data:** PostgreSQL 16 (+ pgvector when Phase 7 lands), Redis 7 optional  
**Infra:** Docker Compose, GitHub Actions (planned), Railway/Render  

---

## Frontend

| Technology | Purpose |
|---|---|
| React 18 | SPA — auth state, live availability, admin |
| Vite 6 | Dev server + build; proxies `/api` to Express |
| React Router 6 | Pages + `ProtectedRoute` |
| Ported `style.css` | Original visual language kept nearly verbatim |
| WebP images | Homepage payload cut from ~14 MB to well under 1 MB |

No EJS/Thymeleaf. Client-side state (session restore, slot grid, admin actions) is real here.

---

## Backend

| Technology | Purpose |
|---|---|
| Express 4 | HTTP API |
| Prisma 6 | Schema, migrations, typed queries |
| Zod | Request validation |
| bcryptjs | Password hashing |
| jsonwebtoken | Short-lived access tokens |
| cookie-parser | httpOnly refresh cookie |
| helmet | Security headers |
| express-rate-limit | Auth / write / general ceilings |
| pino | Structured logging |
| ioredis | Optional cache + distributed rate-limit store |

**Layering:** `routes` → `controllers` → `services` → `prisma`.  
**CSRF:** access tokens are Bearer (not cookie-auth for mutations); refresh cookie is `SameSite=strict` + path-scoped to `/api/auth`.

---

## Data

| Technology | Purpose |
|---|---|
| PostgreSQL 16 | Single schema: users, refresh_tokens, restaurant_tables, reservations, menu_items |
| btree_gist exclusion constraint | DB-level no-overlap backstop on active reservations |
| Redis 7 | Menu/availability cache + rate-limit counters (optional) |

---

## Testing & deploy

| Technology | Purpose |
|---|---|
| Vitest | Unit tests (booking best-fit, slot math) |
| Supertest | Ready for HTTP integration tests |
| Docker Compose | postgres (pgvector image) + redis + api + web |
| Railway / Render | Production target |

---

## Explicitly later (Tier 2)

- FastAPI + scikit-learn no-show model → overbooking rule  
- `@anthropic-ai/sdk` NL booking (extract only) + allergen RAG with hard SQL filter  
- Confirmation email, SSE live slots, CI load numbers  

---

## What we are not using (and why)

| Not using | Why |
|---|---|
| Passport / server sessions | JWT + refresh rows are enough and easier to reason about |
| `csurf` package | Mutations use Bearer tokens; refresh is SameSite=strict |
| Kafka / K8s / Mongo | Wrong scale and wrong data model for this problem |
| Ordering / payments | Out of scope for a reservation-first portfolio story |
