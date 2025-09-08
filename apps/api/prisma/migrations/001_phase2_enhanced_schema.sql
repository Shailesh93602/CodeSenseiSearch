-- Phase 2 Database Migration: Enhanced Content Ingestion Schema
-- This migration adds comprehensive tables for GitHub and StackOverflow content ingestion

-- Add new enums for Phase 2
CREATE TYPE "SourceType" AS ENUM ('GITHUB', 'STACKOVERFLOW', 'DOCUMENTATION', 'BLOG');
CREATE TYPE "ContentType" AS ENUM ('REPOSITORY_FILE', 'STACKOVERFLOW_QUESTION', 'STACKOVERFLOW_ANSWER', 'DOCUMENTATION_PAGE', 'BLOG_POST');
CREATE TYPE "IngestionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SKIPPED');
CREATE TYPE "EmbeddingStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED', 'RETRYING');
CREATE TYPE "IngestionJobType" AS ENUM ('GITHUB_DISCOVER_REPOSITORIES', 'GITHUB_INGEST_REPOSITORY', 'GITHUB_PROCESS_CONTENT', 'STACKOVERFLOW_DISCOVER_QUESTIONS', 'STACKOVERFLOW_INGEST_QUESTION', 'GENERATE_EMBEDDINGS', 'CHUNK_CONTENT');

-- Sources table for GitHub, StackOverflow, etc.
CREATE TABLE "sources" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT (gen_random_uuid()),
    "name" TEXT NOT NULL UNIQUE,
    "displayName" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "baseUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "rateLimit" INTEGER,
    "rateLimitWindow" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Repositories table for GitHub content
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT (gen_random_uuid()),
    "sourceId" TEXT NOT NULL,
    "githubId" INTEGER NOT NULL UNIQUE,
    "fullName" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "description" TEXT,
    "starCount" INTEGER NOT NULL DEFAULT 0,
    "forkCount" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT,
    "size" INTEGER NOT NULL DEFAULT 0,
    "htmlUrl" TEXT NOT NULL,
    "cloneUrl" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "lastIngestionAt" TIMESTAMP(3),
    "ingestionStatus" "IngestionStatus" NOT NULL DEFAULT 'PENDING',
    "ingestionError" TEXT,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "contentCount" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "embeddingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Questions table for StackOverflow content
CREATE TABLE "questions" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT (gen_random_uuid()),
    "sourceId" TEXT NOT NULL,
    "questionId" INTEGER NOT NULL UNIQUE,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "score" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "answerCount" INTEGER NOT NULL DEFAULT 0,
    "isAnswered" BOOLEAN NOT NULL DEFAULT false,
    "hasAcceptedAnswer" BOOLEAN NOT NULL DEFAULT false,
    "lastIngestionAt" TIMESTAMP(3),
    "ingestionStatus" "IngestionStatus" NOT NULL DEFAULT 'PENDING',
    "ingestionError" TEXT,
    "htmlUrl" TEXT NOT NULL,
    "contentCount" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "embeddingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Enhanced content table (rename existing and migrate data)
ALTER TABLE "content" RENAME TO "content_legacy";

CREATE TABLE "contents" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT (gen_random_uuid()),
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "language" TEXT,
    "filePath" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "downloadUrl" TEXT,
    "isAnswer" BOOLEAN NOT NULL DEFAULT false,
    "isAccepted" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER,
    "contentHash" TEXT NOT NULL UNIQUE,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "embeddingCount" INTEGER NOT NULL DEFAULT 0,
    "repositoryId" TEXT,
    "questionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Enhanced content chunks (rename existing and create new)
ALTER TABLE "content_chunks" RENAME TO "content_chunks_legacy";

CREATE TABLE "content_chunks" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT (gen_random_uuid()),
    "contentId" TEXT NOT NULL,
    "chunkText" TEXT NOT NULL,
    "chunkHash" TEXT NOT NULL UNIQUE,
    "sequence" INTEGER NOT NULL,
    "startLine" INTEGER,
    "endLine" INTEGER,
    "startChar" INTEGER,
    "endChar" INTEGER,
    "embeddingStatus" "EmbeddingStatus" NOT NULL DEFAULT 'PENDING',
    "embeddingError" TEXT,
    "embeddedAt" TIMESTAMP(3),
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Embeddings table for vector storage
CREATE TABLE "embeddings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT (gen_random_uuid()),
    "vector" vector(1536) NOT NULL,  -- Using pgvector extension
    "dimensions" INTEGER NOT NULL DEFAULT 1536,
    "model" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "cost" DECIMAL(10,8),
    "contentId" TEXT,
    "contentChunkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("contentChunkId") REFERENCES "content_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Enhanced ingestion jobs (rename existing and create new)
ALTER TABLE "ingestion_jobs" RENAME TO "ingestion_jobs_legacy";

CREATE TABLE "ingestion_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT (gen_random_uuid()),
    "jobType" "IngestionJobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "jobData" JSONB NOT NULL,
    "config" JSONB,
    "totalItems" INTEGER,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "sourceId" TEXT,
    "repositoryId" TEXT,
    "questionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Create indexes for optimal query performance

-- Sources indexes
CREATE INDEX "sources_type_idx" ON "sources"("type");
CREATE INDEX "sources_isActive_idx" ON "sources"("isActive");

-- Repositories indexes
CREATE INDEX "repositories_sourceId_idx" ON "repositories"("sourceId");
CREATE INDEX "repositories_language_idx" ON "repositories"("language");
CREATE INDEX "repositories_starCount_idx" ON "repositories"("starCount");
CREATE INDEX "repositories_ingestionStatus_idx" ON "repositories"("ingestionStatus");
CREATE INDEX "repositories_lastIngestionAt_idx" ON "repositories"("lastIngestionAt");

-- Questions indexes
CREATE INDEX "questions_sourceId_idx" ON "questions"("sourceId");
CREATE INDEX "questions_tags_idx" ON "questions" USING GIN("tags");
CREATE INDEX "questions_score_idx" ON "questions"("score");
CREATE INDEX "questions_isAnswered_idx" ON "questions"("isAnswered");
CREATE INDEX "questions_ingestionStatus_idx" ON "questions"("ingestionStatus");
CREATE INDEX "questions_lastIngestionAt_idx" ON "questions"("lastIngestionAt");

-- Contents indexes
CREATE INDEX "contents_contentType_idx" ON "contents"("contentType");
CREATE INDEX "contents_language_idx" ON "contents"("language");
CREATE INDEX "contents_repositoryId_idx" ON "contents"("repositoryId");
CREATE INDEX "contents_questionId_idx" ON "contents"("questionId");
CREATE INDEX "contents_processedAt_idx" ON "contents"("processedAt");

-- Content chunks indexes
CREATE INDEX "content_chunks_contentId_idx" ON "content_chunks"("contentId");
CREATE INDEX "content_chunks_sequence_idx" ON "content_chunks"("sequence");
CREATE INDEX "content_chunks_embeddingStatus_idx" ON "content_chunks"("embeddingStatus");

-- Embeddings indexes
CREATE INDEX "embeddings_contentId_idx" ON "embeddings"("contentId");
CREATE INDEX "embeddings_contentChunkId_idx" ON "embeddings"("contentChunkId");
CREATE INDEX "embeddings_model_idx" ON "embeddings"("model");
CREATE INDEX "embeddings_dimensions_idx" ON "embeddings"("dimensions");

-- Vector similarity search index (cosine distance)
CREATE INDEX "embeddings_vector_cosine_idx" ON "embeddings" USING ivfflat ("vector" vector_cosine_ops) WITH (lists = 100);

-- Ingestion jobs indexes
CREATE INDEX "ingestion_jobs_jobType_idx" ON "ingestion_jobs"("jobType");
CREATE INDEX "ingestion_jobs_status_idx" ON "ingestion_jobs"("status");
CREATE INDEX "ingestion_jobs_priority_idx" ON "ingestion_jobs"("priority");
CREATE INDEX "ingestion_jobs_sourceId_idx" ON "ingestion_jobs"("sourceId");
CREATE INDEX "ingestion_jobs_repositoryId_idx" ON "ingestion_jobs"("repositoryId");
CREATE INDEX "ingestion_jobs_questionId_idx" ON "ingestion_jobs"("questionId");
CREATE INDEX "ingestion_jobs_createdAt_idx" ON "ingestion_jobs"("createdAt");

-- Insert default sources
INSERT INTO "sources" ("name", "displayName", "type", "baseUrl", "rateLimit", "rateLimitWindow") VALUES
('github', 'GitHub', 'GITHUB', 'https://api.github.com', 5000, 3600),
('stackoverflow', 'Stack Overflow', 'STACKOVERFLOW', 'https://api.stackexchange.com', 300, 86400);

-- Migration complete
-- Next step: Update application code to use new schema
-- Legacy tables can be dropped after data migration is verified