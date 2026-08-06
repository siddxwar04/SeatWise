/**
 * Embed all active restaurants into pgvector.
 *
 * Usage (from repo root):
 *   npm run embeddings:generate
 *
 * Requires OPENAI_API_KEY and a migrated DATABASE_URL with the pgvector extension.
 * Skips venues whose content hash has not changed (cheap re-runs after menu edits).
 *
 * Pass --force to re-embed everything.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(here, '../.env') });
loadDotenv({ path: path.resolve(here, '../../.env') });

const force = process.argv.includes('--force');

async function main() {
  // Dynamic import after dotenv so env.js sees OPENAI_API_KEY.
  const { disconnectPrisma } = await import('../apps/api/src/lib/prisma.js');
  const {
    buildRestaurantDocument,
    embedTexts,
    getEmbeddingModel,
    hashContent,
    loadRestaurantsForEmbedding,
    upsertRestaurantEmbedding,
  } = await import('../apps/api/src/lib/embeddings.js');

  const restaurants = await loadRestaurantsForEmbedding();
  if (restaurants.length === 0) {
    console.log('No active restaurants found. Run `npm run db:seed` first.');
    await disconnectPrisma();
    return;
  }

  const model = getEmbeddingModel();
  const pending = [];

  for (const restaurant of restaurants) {
    const content = buildRestaurantDocument(restaurant);
    const contentHash = hashContent(content);
    if (!force && restaurant.embedding?.contentHash === contentHash) {
      console.log(`  skip  ${restaurant.slug} (unchanged)`);
      continue;
    }
    pending.push({ restaurant, content, contentHash });
  }

  if (pending.length === 0) {
    console.log('All embeddings are up to date.');
    await disconnectPrisma();
    return;
  }

  console.log(`Embedding ${pending.length} restaurant(s) with ${model}…`);

  // Batch in chunks of 20 to stay under embedding input limits.
  const chunkSize = 20;
  for (let i = 0; i < pending.length; i += chunkSize) {
    const chunk = pending.slice(i, i + chunkSize);
    const vectors = await embedTexts(chunk.map((row) => row.content));

    for (let j = 0; j < chunk.length; j += 1) {
      const row = chunk[j];
      await upsertRestaurantEmbedding({
        restaurantId: row.restaurant.id,
        content: row.content,
        embedding: vectors[j],
        model,
      });
      console.log(`  ok    ${row.restaurant.slug}`);
    }
  }

  console.log('Done.');
  await disconnectPrisma();
}

main().catch(async (err) => {
  console.error('Embedding generation failed:', err.message ?? err);
  process.exitCode = 1;
  try {
    const { disconnectPrisma } = await import('../apps/api/src/lib/prisma.js');
    await disconnectPrisma();
  } catch {
    /* ignore */
  }
});
