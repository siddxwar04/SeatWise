-- AI concierge RAG: pgvector extension + restaurant embedding rows.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "restaurant_embeddings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "model" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "restaurant_embeddings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "restaurant_embeddings_restaurant_id_key" ON "restaurant_embeddings"("restaurant_id");

-- HNSW works well even with a small venue catalogue; cosine distance matches
-- OpenAI text-embedding-3-small normalised vectors.
CREATE INDEX "restaurant_embeddings_embedding_hnsw_idx"
  ON "restaurant_embeddings"
  USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "restaurant_embeddings"
  ADD CONSTRAINT "restaurant_embeddings_restaurant_id_fkey"
  FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
