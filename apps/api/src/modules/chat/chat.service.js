import OpenAI from 'openai';
import { env } from '../../config/env.js';
import { BadRequestError, ServiceUnavailableError } from '../../errors/AppError.js';
import { embedText, searchSimilarRestaurants } from '../../lib/embeddings.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';

const SYSTEM_PROMPT = `You are TastyFood's friendly dining concierge for Bengaluru.
You help guests pick a restaurant and book a table.

STRICT RULES:
1. Recommend ONLY from the restaurants provided in the RETRIEVED CONTEXT block.
2. Never invent venues, dishes, prices, or amenities that are not in the context.
3. If nothing in the context fits the request, say so honestly and suggest adjusting the query.
4. Be warm, concise, and conversational (2–4 short paragraphs max).
5. When you recommend venues, end your message with a machine-readable line exactly like:
   RECOMMENDED_IDS: id1,id2
   using the UUID ids from the context (comma-separated, no spaces around commas is fine).
6. Prefer outdoor seating when the guest asks for patio / terrace / al fresco.
7. Prefer venues whose menu price range fits a budget mentioned in rupees (₹).
8. Do not mention embeddings, RAG, or that you are an AI system prompt.`;

function assertConfigured() {
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new ServiceUnavailableError(
      'Chat needs OPENAI_API_KEY. Add it to .env (see .env.example) and restart the API.',
    );
  }
}

function parseRecommendedIds(reply, allowedIds) {
  const allowed = new Set(allowedIds.map((id) => id.toLowerCase()));
  const match = reply.match(/RECOMMENDED_IDS:\s*([0-9a-fA-F,-]+)/i);
  if (!match) return [];

  return match[1]
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter((id) => allowed.has(id))
    .map((id) => allowedIds.find((a) => a.toLowerCase() === id) ?? id);
}

function stripRecommendedLine(reply) {
  return reply.replace(/\n*RECOMMENDED_IDS:\s*[0-9a-fA-F,-]+\s*$/i, '').trim();
}

async function generateReply(history, userMessage, contextBlock) {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    {
      role: 'user',
      content: `${contextBlock}\n\nGuest question: ${userMessage}`,
    },
  ];

  const response = await client.chat.completions.create({
    model: env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
    temperature: 0.4,
    max_tokens: 700,
    messages,
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new ServiceUnavailableError('The concierge returned an empty reply.');
  return text;
}

/**
 * RAG concierge: embed (text-embedding-3-small) → pgvector top-5 → gpt-4o-mini.
 */
export async function chat({ message, history = [] }) {
  assertConfigured();

  const queryEmbedding = await embedText(message);
  const matches = await searchSimilarRestaurants(queryEmbedding, { limit: 5 });

  if (matches.length === 0) {
    return {
      reply:
        'I do not have restaurant embeddings loaded yet. Ask the team to run `npm run embeddings:generate`, then try again.',
      recommendedRestaurantIds: [],
      restaurants: [],
    };
  }

  const restaurantIds = matches.map((m) => m.restaurantId);
  const restaurants = await prisma.restaurant.findMany({
    where: { id: { in: restaurantIds }, isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      address: true,
      phone: true,
      tables: {
        where: { isActive: true },
        select: { zone: true },
      },
      menuItems: {
        where: { isAvailable: true },
        select: { priceInPaise: true },
      },
    },
  });

  const byId = new Map(restaurants.map((r) => [r.id, r]));
  const ordered = restaurantIds.map((id) => byId.get(id)).filter(Boolean);

  const contextBlock = [
    'RETRIEVED CONTEXT (recommend only from these):',
    ...matches.map((m, i) => {
      const r = byId.get(m.restaurantId);
      return [
        `--- Match ${i + 1} (distance=${m.distance.toFixed(4)}) ---`,
        `id: ${m.restaurantId}`,
        r ? `name: ${r.name}` : null,
        r ? `slug: ${r.slug}` : null,
        m.content,
      ]
        .filter(Boolean)
        .join('\n');
    }),
  ].join('\n\n');

  let rawReply;
  try {
    rawReply = await generateReply(history, message, contextBlock);
  } catch (err) {
    logger.error({ err }, 'concierge LLM failed');
    throw new ServiceUnavailableError(
      'The concierge is temporarily unavailable. Please try again in a moment.',
    );
  }

  let recommendedIds = parseRecommendedIds(rawReply, restaurantIds);
  if (recommendedIds.length === 0) {
    recommendedIds = restaurantIds.slice(0, Math.min(3, restaurantIds.length));
  }

  const reply = stripRecommendedLine(rawReply);
  if (!reply) {
    throw new BadRequestError('Could not form a helpful reply. Please rephrase your question.');
  }

  const recommendedSet = new Set(recommendedIds);
  const cardRestaurants = ordered
    .filter((r) => recommendedSet.has(r.id))
    .map((r) => {
      const prices = r.menuItems.map((m) => m.priceInPaise);
      const zones = [...new Set(r.tables.map((t) => t.zone))];
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        address: r.address,
        phone: r.phone,
        zones,
        priceRange:
          prices.length === 0
            ? null
            : {
                minInPaise: Math.min(...prices),
                maxInPaise: Math.max(...prices),
              },
      };
    });

  return {
    reply,
    recommendedRestaurantIds: recommendedIds,
    restaurants: cardRestaurants,
  };
}
