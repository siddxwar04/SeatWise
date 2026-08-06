import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));

// Look for .env in apps/api first, then fall back to the repo root so a single
// root .env can drive the whole stack during local development.
loadDotenv({ path: path.resolve(here, '../../.env') });
loadDotenv({ path: path.resolve(here, '../../../../.env') });

/** Accepts "15m" / "7d" / "3600s" style durations used by jsonwebtoken. */
const duration = z.string().regex(/^\d+[smhd]$/, 'expected a duration like 15m, 24h or 7d');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: z.string().url().default('http://localhost:5173'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().default('redis://localhost:6379'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    /**
     * Reserved for a future signed-refresh design. Refresh tokens today are
     * opaque random strings hashed in Postgres, so this secret is unused —
     * keep it optional so local setups are not blocked by a dead requirement.
     */
    JWT_REFRESH_SECRET: z.string().min(32).optional(),
    ACCESS_TOKEN_TTL: duration.default('15m'),
    REFRESH_TOKEN_TTL: duration.default('7d'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

    RESTAURANT_OPEN_HOUR: z.coerce.number().int().min(0).max(23).default(11),
    RESTAURANT_CLOSE_HOUR: z.coerce.number().int().min(1).max(24).default(23),
    SLOT_MINUTES: z.coerce.number().int().positive().default(30),
    DINING_DURATION_MINUTES: z.coerce.number().int().positive().default(90),
    MAX_ADVANCE_BOOKING_DAYS: z.coerce.number().int().positive().default(90),
    MIN_LEAD_TIME_MINUTES: z.coerce.number().int().nonnegative().default(60),
    MAX_PARTY_SIZE: z.coerce.number().int().positive().default(10),
    /**
     * Minutes east of UTC for the restaurant's wall clock. 330 = IST.
     * A fixed offset is correct here because India observes no DST; a region
     * that did would need a real timezone database instead.
     */
    RESTAURANT_UTC_OFFSET_MINUTES: z.coerce.number().int().min(-720).max(840).default(330),

    ML_SERVICE_URL: z.string().url().default('http://localhost:8000'),
    ML_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),

    AI_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(20),

    /** Required for the AI concierge (embeddings + gpt-4o-mini). */
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_CHAT_MODEL: z.string().default('gpt-4o-mini'),
    OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

    RESEND_API_KEY: z.string().optional(),

    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default('TastyFood <no-reply@tastyfood.local>'),
  })
  .refine((e) => e.RESTAURANT_CLOSE_HOUR > e.RESTAURANT_OPEN_HOUR, {
    message: 'RESTAURANT_CLOSE_HOUR must be after RESTAURANT_OPEN_HOUR',
    path: ['RESTAURANT_CLOSE_HOUR'],
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast and loudly. A server that boots with a missing JWT secret and
  // discovers it on the first login request is strictly worse than one that
  // refuses to start.
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  console.error(`\nInvalid environment configuration:\n${issues}\n`);
  console.error('Copy .env.example to .env and fill in the missing values.\n');
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
