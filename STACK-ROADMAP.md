# TastyFood — Roadmap (Node v2)

> **Stack decision (locked):** Node.js + Express + Prisma + React.  
> An earlier Java/Spring/Thymeleaf draft lived here; ignore it. See `TECH-STACK.md` and `README.md`.

**Goal:** Placement-round portfolio project. Baseline audit: **2.5/10** on the PHP app (`ab65a26`).

---

## Architecture

```
Browser (React + Vite)
        │  /api proxy
Express (routes → controllers → services → Prisma)
        │
   PostgreSQL 16  (+ Redis optional)
        │
   [later] FastAPI ML   [later] Claude assistant
```

---

## Tier 1 — Core (ship this)

| Phase | Item                                                            | Status |
| ----- | --------------------------------------------------------------- | ------ |
| 1     | Scaffold, Prisma schema, migration + exclusion constraint, seed | Done   |
| 2     | Auth — JWT + refresh cookie + bcrypt + Zod + rate limits        | Done   |
| 3     | Reservations — `FOR UPDATE` + best-fit + conflict handling      | Done   |
| 4     | React UI — CSS port, hamburger, auth-aware nav, toasts          | Done   |
| 5     | Menu from DB + admin bookings + menu CRUD UI                    | Done   |
| —     | Vitest unit tests (slots + best-fit)                            | Done   |
| —     | README rewrite                                                  | Done   |

## Tier 2 — Differentiators (later)

| Phase | Item                                               | Status      |
| ----- | -------------------------------------------------- | ----------- |
| 6     | JS logistic regression no-show → overbooking EV + waitlist assign | **Shipped** |
| 7     | OpenAI RAG concierge                                           | **Shipped** |
| 8     | Email confirmations, SSE slots, CI, ADRs, deploy               | Partial (email exists) |

---

## Interview talking points

1. Why pessimistic locking for booking vs optimistic `@version` for admin status edits
2. Why allergen filtering is SQL, not an LLM judgment
3. Why refresh tokens are hashed and rotated
4. Audit → rebuild story (SQLi, XSS, split DB)

**Rule:** if you cannot explain a line, do not claim it in the interview.
