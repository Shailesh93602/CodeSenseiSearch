-- Phase 2 Migration Rollback Script
-- This script safely rolls back the Phase 2 enhanced schema
-- WARNING: This will delete all Phase 2 data!

-- Drop Phase 2 tables in correct order (respecting foreign key constraints)
DROP TABLE IF EXISTS "embeddings" CASCADE;
DROP TABLE IF EXISTS "content_chunks" CASCADE;
DROP TABLE IF EXISTS "contents" CASCADE;
DROP TABLE IF EXISTS "ingestion_jobs" CASCADE;
DROP TABLE IF EXISTS "questions" CASCADE;
DROP TABLE IF EXISTS "repositories" CASCADE;
DROP TABLE IF EXISTS "sources" CASCADE;

-- Drop Phase 2 enums
DROP TYPE IF EXISTS "IngestionJobType";
DROP TYPE IF EXISTS "JobStatus";
DROP TYPE IF EXISTS "EmbeddingStatus";
DROP TYPE IF EXISTS "IngestionStatus";
DROP TYPE IF EXISTS "ContentType";
DROP TYPE IF EXISTS "SourceType";

-- Restore legacy tables to original names
ALTER TABLE IF EXISTS "content_legacy" RENAME TO "content";
ALTER TABLE IF EXISTS "content_chunks_legacy" RENAME TO "content_chunks";
ALTER TABLE IF EXISTS "ingestion_jobs_legacy" RENAME TO "ingestion_jobs";

-- Clean up legacy tables if they exist but we're not rolling back
-- (These would be cleaned up after successful migration validation)
-- DROP TABLE IF EXISTS "content_legacy" CASCADE;
-- DROP TABLE IF EXISTS "content_chunks_legacy" CASCADE;
-- DROP TABLE IF EXISTS "ingestion_jobs_legacy" CASCADE;

-- Note: User, Search, and Favorite tables remain unchanged
-- They are backward compatible and don't need rollback