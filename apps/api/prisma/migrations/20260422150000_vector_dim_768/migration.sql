-- Shift all pgvector columns from 1536 dimensions (OpenAI text-embedding-3-small era)
-- to 768 dimensions (Gemini text-embedding-004, current model).
--
-- Safe because the EmbeddingGenerationWorker was a TODO stub until this release,
-- so no 1536-dim vectors were ever written. We DROP + re-ADD the columns rather
-- than ALTER TYPE because pg_vector doesn't support in-place dimension changes.
-- If you have any hand-seeded 1536-dim data you care about, re-embed it after
-- this migration runs.

-- content_chunks.embedding
ALTER TABLE "content_chunks" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "content_chunks" ADD COLUMN "embedding" vector(768);

-- embeddings.vector + dimensions
ALTER TABLE "embeddings" DROP COLUMN IF EXISTS "vector";
ALTER TABLE "embeddings" ADD COLUMN "vector" vector(768) NOT NULL;
ALTER TABLE "embeddings" ALTER COLUMN "dimensions" SET DEFAULT 768;
