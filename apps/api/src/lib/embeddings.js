/**
 * Shared helpers for building and embedding restaurant documents.
 * Used by the chat RAG path and by scripts/generate-embeddings.js.
 */
import crypto from 'node:crypto';
import OpenAI from 'openai';
import { env } from '../config/env.js';
import { ServiceUnavailableError } from '../errors/AppError.js';
import { prisma } from './prisma.js';

export const EMBEDDING_DIMENSIONS = 1536;

export function getEmbeddingModel() {
  return env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
}

/** Formats paise as a rupee string for the LLM context document. */
function formatRupees(paise) {
  return `₹${Math.round(paise / 100)}`;
}

/**
 * Builds the plain-text document we embed for a venue.
 * Derives cuisine/price/tags from menu + seating zones — the Restaurant row
 * itself has no cuisine column today.
 */
export function buildRestaurantDocument(restaurant) {
  const zones = [...new Set((restaurant.tables ?? []).map((t) => t.zone))];
  const menu = restaurant.menuItems ?? [];
  const prices = menu.map((m) => m.priceInPaise);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;
  const avgPrice = prices.length
    ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    : null;

  const tags = [
    ...new Set(menu.flatMap((m) => [...(m.dietaryTags ?? []), ...(m.allergens ?? [])])),
  ];

  const dishLines = menu
    .slice(0, 24)
    .map(
      (m) =>
        `- ${m.name} (${m.category}, ${formatRupees(m.priceInPaise)}): ${m.description}` +
        (m.dietaryTags?.length ? ` [${m.dietaryTags.join(', ')}]` : ''),
    )
    .join('\n');

  const parts = [
    `Restaurant: ${restaurant.name}`,
    `Slug: ${restaurant.slug}`,
    `Address: ${restaurant.address}`,
    `Phone: ${restaurant.phone}`,
    zones.length ? `Seating zones: ${zones.join(', ').toLowerCase()}` : null,
    zones.includes('OUTDOOR') ? 'Has outdoor seating / patio.' : null,
    zones.includes('PRIVATE') ? 'Has private dining.' : null,
    zones.includes('BAR') ? 'Has a bar area.' : null,
    minPrice != null
      ? `Menu price range: ${formatRupees(minPrice)} – ${formatRupees(maxPrice)} (avg ~${formatRupees(avgPrice)})`
      : null,
    tags.length ? `Tags: ${tags.join(', ').toLowerCase()}` : null,
    dishLines ? `Menu highlights:\n${dishLines}` : 'Menu: (empty)',
  ];

  return parts.filter(Boolean).join('\n');
}

export function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function requireOpenAI() {
  if (!env.OPENAI_API_KEY) {
    throw new ServiceUnavailableError(
      'OPENAI_API_KEY is required for embeddings. Add it to .env and restart the API.',
    );
  }
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

/** Embed one or more strings with OpenAI text-embedding-3-small. */
export async function embedTexts(texts) {
  const client = requireOpenAI();
  const response = await client.embeddings.create({
    model: getEmbeddingModel(),
    input: texts,
  });
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((row) => row.embedding);
}

export async function embedText(text) {
  const [vector] = await embedTexts([text]);
  return vector;
}

/** pgvector literal: '[0.1,0.2,...]' */
export function toVectorLiteral(embedding) {
  return `[${embedding.join(',')}]`;
}

/**
 * Upsert a restaurant embedding row via raw SQL (Prisma cannot write vector).
 */
export async function upsertRestaurantEmbedding({ restaurantId, content, embedding, model }) {
  const contentHash = hashContent(content);
  const vector = toVectorLiteral(embedding);

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO restaurant_embeddings
      (id, restaurant_id, content, content_hash, embedding, model, created_at, updated_at)
    VALUES
      (gen_random_uuid(), $1::uuid, $2, $3, $4::vector, $5, NOW(), NOW())
    ON CONFLICT (restaurant_id) DO UPDATE SET
      content = EXCLUDED.content,
      content_hash = EXCLUDED.content_hash,
      embedding = EXCLUDED.embedding,
      model = EXCLUDED.model,
      updated_at = NOW()
    `,
    restaurantId,
    content,
    contentHash,
    vector,
    model,
  );

  return { restaurantId, contentHash };
}

/**
 * Cosine-similarity search — lower distance = closer match.
 * Returns top-k restaurant ids with distance + stored content snippet.
 */
export async function searchSimilarRestaurants(queryEmbedding, { limit = 5 } = {}) {
  const vector = toVectorLiteral(queryEmbedding);
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      re.restaurant_id AS "restaurantId",
      re.content,
      (re.embedding <=> $1::vector) AS distance
    FROM restaurant_embeddings re
    INNER JOIN restaurants r ON r.id = re.restaurant_id
    WHERE r.is_active = true
    ORDER BY re.embedding <=> $1::vector
    LIMIT $2
    `,
    vector,
    limit,
  );

  return rows.map((row) => ({
    restaurantId: row.restaurantId,
    content: row.content,
    distance: Number(row.distance),
  }));
}

/** Load every active restaurant with the relations needed for documents. */
export async function loadRestaurantsForEmbedding() {
  return prisma.restaurant.findMany({
    where: { isActive: true },
    include: {
      tables: { where: { isActive: true }, select: { zone: true } },
      menuItems: {
        where: { isAvailable: true },
        select: {
          name: true,
          description: true,
          category: true,
          priceInPaise: true,
          dietaryTags: true,
          allergens: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      },
      embedding: { select: { contentHash: true } },
    },
    orderBy: { name: 'asc' },
  });
}
