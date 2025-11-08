-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('GITHUB', 'STACKOVERFLOW', 'DOCUMENTATION', 'BLOG');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('REPOSITORY_FILE', 'STACKOVERFLOW_QUESTION', 'STACKOVERFLOW_ANSWER', 'DOCUMENTATION_PAGE', 'BLOG_POST');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "EmbeddingStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED', 'RETRYING');

-- CreateEnum
CREATE TYPE "IngestionJobType" AS ENUM ('GITHUB_DISCOVER_REPOSITORIES', 'GITHUB_INGEST_REPOSITORY', 'GITHUB_PROCESS_CONTENT', 'STACKOVERFLOW_DISCOVER_QUESTIONS', 'STACKOVERFLOW_INGEST_QUESTION', 'GENERATE_EMBEDDINGS', 'CHUNK_CONTENT');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'PREMIUM', 'ADMIN', 'MODERATOR');

-- CreateEnum
CREATE TYPE "RateLimitTier" AS ENUM ('FREE', 'PREMIUM', 'UNLIMITED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "githubId" TEXT,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "preferredLanguages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredRepos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "theme" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "baseUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "rateLimit" INTEGER,
    "rateLimitWindow" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "githubId" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "questionId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[],
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contents" (
    "id" TEXT NOT NULL,
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
    "contentHash" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "embeddingCount" INTEGER NOT NULL DEFAULT 0,
    "repositoryId" TEXT,
    "questionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_chunks" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "chunkText" TEXT NOT NULL,
    "chunkHash" TEXT NOT NULL,
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embeddings" (
    "id" TEXT NOT NULL,
    "vector" vector(1536) NOT NULL,
    "dimensions" INTEGER NOT NULL DEFAULT 1536,
    "model" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "cost" DECIMAL(65,30),
    "contentId" TEXT,
    "contentChunkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_jobs" (
    "id" TEXT NOT NULL,
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "searches" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "query" TEXT NOT NULL,
    "filters" JSONB,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "took" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_auth" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "passwordHash" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationToken" TEXT,
    "githubId" TEXT,
    "githubUsername" TEXT,
    "githubAccessToken" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "user_auth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessTokenHash" TEXT,
    "jwtId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "deviceInfo" JSONB,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "searchMethod" TEXT NOT NULL,
    "resultsCount" INTEGER NOT NULL,
    "searchTime" INTEGER NOT NULL,
    "clickedResults" JSONB NOT NULL DEFAULT '[]',
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_favorites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentId" TEXT,
    "resultData" JSONB NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "originalQuery" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "userId" TEXT NOT NULL,
    "preferredLanguages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredSources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultSearchMethod" TEXT NOT NULL DEFAULT 'hybrid',
    "theme" TEXT NOT NULL DEFAULT 'system',
    "resultsPerPage" INTEGER NOT NULL DEFAULT 20,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "searchSuggestions" BOOLEAN NOT NULL DEFAULT true,
    "trackSearchHistory" BOOLEAN NOT NULL DEFAULT true,
    "publicProfile" BOOLEAN NOT NULL DEFAULT false,
    "shareStatistics" BOOLEAN NOT NULL DEFAULT false,
    "searchSettings" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "user_rate_limits" (
    "userId" TEXT NOT NULL,
    "dailySearches" INTEGER NOT NULL DEFAULT 0,
    "monthlySearches" INTEGER NOT NULL DEFAULT 0,
    "lastSearchDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSearchMonth" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rateLimitTier" "RateLimitTier" NOT NULL DEFAULT 'FREE',
    "dailyLimit" INTEGER NOT NULL DEFAULT 100,
    "monthlyLimit" INTEGER NOT NULL DEFAULT 1000,
    "isThrottled" BOOLEAN NOT NULL DEFAULT false,
    "throttledUntil" TIMESTAMP(3),
    "violationCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_rate_limits_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_githubId_key" ON "users"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "sources_name_key" ON "sources"("name");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_githubId_key" ON "repositories"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_fullName_key" ON "repositories"("fullName");

-- CreateIndex
CREATE INDEX "repositories_sourceId_idx" ON "repositories"("sourceId");

-- CreateIndex
CREATE INDEX "repositories_language_idx" ON "repositories"("language");

-- CreateIndex
CREATE INDEX "repositories_starCount_idx" ON "repositories"("starCount");

-- CreateIndex
CREATE INDEX "repositories_ingestionStatus_idx" ON "repositories"("ingestionStatus");

-- CreateIndex
CREATE INDEX "repositories_lastIngestionAt_idx" ON "repositories"("lastIngestionAt");

-- CreateIndex
CREATE UNIQUE INDEX "questions_questionId_key" ON "questions"("questionId");

-- CreateIndex
CREATE INDEX "questions_sourceId_idx" ON "questions"("sourceId");

-- CreateIndex
CREATE INDEX "questions_tags_idx" ON "questions"("tags");

-- CreateIndex
CREATE INDEX "questions_score_idx" ON "questions"("score");

-- CreateIndex
CREATE INDEX "questions_isAnswered_idx" ON "questions"("isAnswered");

-- CreateIndex
CREATE INDEX "questions_ingestionStatus_idx" ON "questions"("ingestionStatus");

-- CreateIndex
CREATE INDEX "questions_lastIngestionAt_idx" ON "questions"("lastIngestionAt");

-- CreateIndex
CREATE UNIQUE INDEX "contents_contentHash_key" ON "contents"("contentHash");

-- CreateIndex
CREATE INDEX "contents_contentType_idx" ON "contents"("contentType");

-- CreateIndex
CREATE INDEX "contents_language_idx" ON "contents"("language");

-- CreateIndex
CREATE INDEX "contents_contentHash_idx" ON "contents"("contentHash");

-- CreateIndex
CREATE INDEX "contents_repositoryId_idx" ON "contents"("repositoryId");

-- CreateIndex
CREATE INDEX "contents_questionId_idx" ON "contents"("questionId");

-- CreateIndex
CREATE INDEX "contents_processedAt_idx" ON "contents"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "content_chunks_chunkHash_key" ON "content_chunks"("chunkHash");

-- CreateIndex
CREATE INDEX "content_chunks_contentId_idx" ON "content_chunks"("contentId");

-- CreateIndex
CREATE INDEX "content_chunks_chunkHash_idx" ON "content_chunks"("chunkHash");

-- CreateIndex
CREATE INDEX "content_chunks_embeddingStatus_idx" ON "content_chunks"("embeddingStatus");

-- CreateIndex
CREATE INDEX "content_chunks_sequence_idx" ON "content_chunks"("sequence");

-- CreateIndex
CREATE INDEX "embeddings_contentId_idx" ON "embeddings"("contentId");

-- CreateIndex
CREATE INDEX "embeddings_contentChunkId_idx" ON "embeddings"("contentChunkId");

-- CreateIndex
CREATE INDEX "embeddings_model_idx" ON "embeddings"("model");

-- CreateIndex
CREATE INDEX "embeddings_dimensions_idx" ON "embeddings"("dimensions");

-- CreateIndex
CREATE INDEX "ingestion_jobs_jobType_idx" ON "ingestion_jobs"("jobType");

-- CreateIndex
CREATE INDEX "ingestion_jobs_status_idx" ON "ingestion_jobs"("status");

-- CreateIndex
CREATE INDEX "ingestion_jobs_priority_idx" ON "ingestion_jobs"("priority");

-- CreateIndex
CREATE INDEX "ingestion_jobs_sourceId_idx" ON "ingestion_jobs"("sourceId");

-- CreateIndex
CREATE INDEX "ingestion_jobs_repositoryId_idx" ON "ingestion_jobs"("repositoryId");

-- CreateIndex
CREATE INDEX "ingestion_jobs_questionId_idx" ON "ingestion_jobs"("questionId");

-- CreateIndex
CREATE INDEX "ingestion_jobs_createdAt_idx" ON "ingestion_jobs"("createdAt");

-- CreateIndex
CREATE INDEX "searches_userId_idx" ON "searches"("userId");

-- CreateIndex
CREATE INDEX "searches_createdAt_idx" ON "searches"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_userId_contentId_key" ON "favorites"("userId", "contentId");

-- CreateIndex
CREATE UNIQUE INDEX "user_auth_email_key" ON "user_auth"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_auth_username_key" ON "user_auth"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_auth_emailVerificationToken_key" ON "user_auth"("emailVerificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "user_auth_githubId_key" ON "user_auth"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refreshToken_key" ON "user_sessions"("refreshToken");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_jwtId_key" ON "user_sessions"("jwtId");

-- CreateIndex
CREATE INDEX "user_sessions_userId_expiresAt_idx" ON "user_sessions"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "user_sessions_refreshToken_idx" ON "user_sessions"("refreshToken");

-- CreateIndex
CREATE INDEX "user_sessions_accessTokenHash_idx" ON "user_sessions"("accessTokenHash");

-- CreateIndex
CREATE INDEX "search_history_userId_createdAt_idx" ON "search_history"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "search_history_query_idx" ON "search_history"("query");

-- CreateIndex
CREATE INDEX "search_history_createdAt_idx" ON "search_history"("createdAt");

-- CreateIndex
CREATE INDEX "user_favorites_userId_createdAt_idx" ON "user_favorites"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "user_favorites_userId_tags_idx" ON "user_favorites"("userId", "tags");

-- CreateIndex
CREATE UNIQUE INDEX "user_favorites_userId_contentId_key" ON "user_favorites"("userId", "contentId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_email_idx" ON "password_reset_tokens"("email");

-- CreateIndex
CREATE INDEX "password_reset_tokens_token_idx" ON "password_reset_tokens"("token");

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contents" ADD CONSTRAINT "contents_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contents" ADD CONSTRAINT "contents_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_chunks" ADD CONSTRAINT "content_chunks_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_contentChunkId_fkey" FOREIGN KEY ("contentChunkId") REFERENCES "content_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "searches" ADD CONSTRAINT "searches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_history" ADD CONSTRAINT "search_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_rate_limits" ADD CONSTRAINT "user_rate_limits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

