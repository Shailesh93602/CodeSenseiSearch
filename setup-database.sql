-- Simple database setup for CodeSenseiSearch Phase 2
-- This script creates the basic tables needed for testing

-- Clean up existing tables if any
DROP TABLE IF EXISTS "ContentChunk" CASCADE;
DROP TABLE IF EXISTS "Content" CASCADE;
DROP TABLE IF EXISTS "Question" CASCADE;
DROP TABLE IF EXISTS "Repository" CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Note: pgvector extension to be installed separately

-- User table (simplified for Phase 2)
CREATE TABLE "User" (
    "id" SERIAL PRIMARY KEY,
    "githubId" TEXT UNIQUE,
    "username" TEXT NOT NULL UNIQUE,
    "email" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Repository table for GitHub repositories
CREATE TABLE "Repository" (
    "id" SERIAL PRIMARY KEY,
    "githubId" INTEGER NOT NULL UNIQUE,
    "fullName" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT,
    "starCount" INTEGER NOT NULL DEFAULT 0,
    "forkCount" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT NOT NULL,
    "cloneUrl" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "ingestionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "ingestionStartedAt" TIMESTAMP(3),
    "ingestionCompletedAt" TIMESTAMP(3),
    "lastCommitSha" TEXT,
    "lastCommitDate" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Question table for StackOverflow questions
CREATE TABLE "Question" (
    "id" SERIAL PRIMARY KEY,
    "stackOverflowId" INTEGER NOT NULL UNIQUE,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT '{}',
    "score" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "answerCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "creationDate" TIMESTAMP(3) NOT NULL,
    "lastActivityDate" TIMESTAMP(3),
    "lastEditDate" TIMESTAMP(3),
    "owner" JSONB,
    "acceptedAnswerId" INTEGER,
    "answers" JSONB,
    "ingestionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "ingestionStartedAt" TIMESTAMP(3),
    "ingestionCompletedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Content table for unified content storage
CREATE TABLE "Content" (
    "id" SERIAL PRIMARY KEY,
    "contentType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "repositoryId" INTEGER REFERENCES "Repository"("id") ON DELETE CASCADE,
    "questionId" INTEGER REFERENCES "Question"("id") ON DELETE CASCADE,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "filePath" TEXT,
    "language" TEXT,
    "fileSize" INTEGER,
    "lineCount" INTEGER,
    "author" TEXT,
    "lastModified" TIMESTAMP(3),
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ContentChunk table for chunked content
CREATE TABLE "ContentChunk" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "repositoryId" INTEGER REFERENCES "Repository"("id") ON DELETE CASCADE,
    "questionId" INTEGER REFERENCES "Question"("id") ON DELETE CASCADE,
    "content" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "chunkSize" INTEGER NOT NULL,
    "tokenCount" INTEGER,
    "startOffset" INTEGER NOT NULL DEFAULT 0,
    "endOffset" INTEGER NOT NULL DEFAULT 0,
    "chunkType" TEXT NOT NULL DEFAULT 'TEXT',
    "language" TEXT,
    "embedding" TEXT, -- JSON array of floats (will be vector when pgvector is available)
    "embeddingModel" TEXT,
    "embeddingGeneratedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX "Repository_language_idx" ON "Repository"("language");
CREATE INDEX "Repository_starCount_idx" ON "Repository"("starCount");
CREATE INDEX "Repository_ingestionStatus_idx" ON "Repository"("ingestionStatus");

CREATE INDEX "Question_tags_idx" ON "Question" USING GIN("tags");
CREATE INDEX "Question_score_idx" ON "Question"("score");
CREATE INDEX "Question_ingestionStatus_idx" ON "Question"("ingestionStatus");

CREATE INDEX "Content_contentType_idx" ON "Content"("contentType");
CREATE INDEX "Content_sourceType_idx" ON "Content"("sourceType");
CREATE INDEX "Content_language_idx" ON "Content"("language");
CREATE INDEX "Content_isProcessed_idx" ON "Content"("isProcessed");

CREATE INDEX "ContentChunk_repositoryId_idx" ON "ContentChunk"("repositoryId");
CREATE INDEX "ContentChunk_questionId_idx" ON "ContentChunk"("questionId");
CREATE INDEX "ContentChunk_chunkIndex_idx" ON "ContentChunk"("chunkIndex");
CREATE INDEX "ContentChunk_language_idx" ON "ContentChunk"("language");
-- Vector index will be created when pgvector is available

-- Add constraints
ALTER TABLE "ContentChunk" ADD CONSTRAINT "ContentChunk_repositoryId_chunkIndex_key" UNIQUE ("repositoryId", "chunkIndex");
ALTER TABLE "ContentChunk" ADD CONSTRAINT "ContentChunk_questionId_chunkIndex_key" UNIQUE ("questionId", "chunkIndex");
ALTER TABLE "ContentChunk" ADD CONSTRAINT "ContentChunk_single_reference" CHECK (
    (("repositoryId" IS NOT NULL)::integer + ("questionId" IS NOT NULL)::integer) = 1
);

-- Grant permissions to the user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO codesenseisearch;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO codesenseisearch;