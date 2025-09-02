# Enhanced Database Schema for Content Ingestion

**Task**: Design Content Ingestion Database Schema  
**Status**: ✅ Complete  
**Date**: November 2, 2025

## 🎯 Schema Enhancement Overview

This document outlines the enhanced database schema for Phase 2 content ingestion, building upon the existing Prisma schema with GitHub and StackOverflow specific enhancements.

## 📊 Current Schema Analysis

**Existing Models**:
- ✅ `User` - User management and preferences
- ✅ `Content` - Basic content storage with hashing
- ✅ `ContentChunk` - Text chunks with vector embeddings
- ✅ `Search` - Search queries and analytics
- ✅ `Favorite` - User favorites system
- ✅ `IngestionJob` - Basic job tracking

**Gaps for Phase 2**:
- ❌ GitHub repository metadata
- ❌ StackOverflow question/answer structure
- ❌ File-level metadata and attribution
- ❌ Content source tracking and licensing
- ❌ Enhanced job queue integration

## 🚀 Enhanced Schema Design

### 1. GitHub Repository Model
```prisma
model GitHubRepository {
  id              String   @id @default(cuid())
  githubId        BigInt   @unique // GitHub repository ID
  owner           String   // Repository owner/organization
  name            String   // Repository name
  fullName        String   @unique // owner/name format
  description     String?  @db.Text
  htmlUrl         String   // GitHub repository URL
  cloneUrl        String   // Git clone URL
  sshUrl          String   // SSH clone URL
  homepage        String?  // Project homepage
  
  // Repository Stats
  stargazerCount  Int      @default(0)
  watchersCount   Int      @default(0)
  forksCount      Int      @default(0)
  openIssuesCount Int      @default(0)
  size            Int      @default(0) // Size in KB
  
  // Repository Info
  primaryLanguage String?  // Primary programming language
  language        String?  // Detected language for filtering
  topics          String[] @default([]) // Repository topics/tags
  defaultBranch   String   @default("main")
  license         String?  // License identifier (MIT, Apache-2.0, etc.)
  isPrivate       Boolean  @default(false)
  isFork          Boolean  @default(false)
  isArchived      Boolean  @default(false)
  isDisabled      Boolean  @default(false)
  
  // Ingestion Tracking
  ingestionStatus String   @default("pending") // pending, processing, completed, failed, skipped
  lastIngested    DateTime?
  ingestedFiles   Int      @default(0)
  ingestedChunks  Int      @default(0)
  ingestionError  String?  @db.Text
  
  // Timestamps
  githubCreatedAt DateTime
  githubUpdatedAt DateTime
  githubPushedAt  DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // Relations
  files           GitHubFile[]
  contents        Content[]
  ingestionJobs   IngestionJob[]
  
  @@index([ingestionStatus])
  @@index([primaryLanguage])
  @@index([stargazerCount(sort: Desc)])
  @@index([githubUpdatedAt(sort: Desc)])
  @@index([owner, name])
  @@map("github_repositories")
}
```

### 2. GitHub File Model
```prisma
model GitHubFile {
  id           String   @id @default(cuid())
  repositoryId String
  
  // File Path Info
  path         String   // Full file path
  name         String   // File name with extension
  extension    String?  // File extension (.js, .py, etc.)
  directory    String   // Parent directory path
  
  // File Content Info
  sha          String   // Git SHA hash of file content
  size         Int      // File size in bytes
  downloadUrl  String?  // GitHub raw content URL
  htmlUrl      String   // GitHub file page URL
  
  // File Metadata
  language     String?  // Detected programming language
  encoding     String   @default("utf-8") // File encoding
  isBinary     Boolean  @default(false)
  isGenerated  Boolean  @default(false) // Auto-generated files
  
  // Processing Status
  status       String   @default("pending") // pending, processing, completed, failed, skipped
  processedAt  DateTime?
  chunkCount   Int      @default(0)
  tokenCount   Int      @default(0)
  error        String?  @db.Text
  
  // Attribution
  lastCommitSha String?
  lastCommitAuthor String?
  lastCommitDate DateTime?
  
  // Timestamps
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  
  // Relations
  repository   GitHubRepository @relation(fields: [repositoryId], references: [id], onDelete: Cascade)
  chunks       ContentChunk[]
  content      Content?
  
  @@unique([repositoryId, path])
  @@index([repositoryId, language])
  @@index([extension])
  @@index([status])
  @@index([processedAt])
  @@map("github_files")
}
```

### 3. StackOverflow Models
```prisma
model StackOverflowQuestion {
  id             String   @id @default(cuid())
  stackId        BigInt   @unique // StackOverflow question ID
  title          String   @db.Text
  body           String   @db.Text
  bodyMarkdown   String   @db.Text
  
  // Question Stats
  score          Int      @default(0)
  viewCount      Int      @default(0)
  answerCount    Int      @default(0)
  favoriteCount  Int      @default(0)
  commentCount   Int      @default(0)
  
  // Question Info
  tags           String[] @default([]) // Programming language tags
  isAnswered     Boolean  @default(false)
  hasAcceptedAnswer Boolean @default(false)
  language       String?  // Primary language tag
  difficulty     String?  // Inferred difficulty level
  
  // Author Info
  authorId       BigInt?  // StackOverflow user ID
  authorName     String?  // Display name
  authorReputation Int?   // User reputation
  
  // URLs and Attribution
  link           String   // StackOverflow question URL
  shareLink      String?  // Shortened share URL
  
  // Timestamps
  stackCreatedAt DateTime
  stackUpdatedAt DateTime?
  lastActivityAt DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  
  // Relations
  answers        StackOverflowAnswer[]
  contents       Content[]
  
  @@index([stackCreatedAt(sort: Desc)])
  @@index([score(sort: Desc)])
  @@index([language])
  @@index([isAnswered, hasAcceptedAnswer])
  @@map("stackoverflow_questions")
}

model StackOverflowAnswer {
  id             String   @id @default(cuid())
  questionId     String
  stackId        BigInt   @unique // StackOverflow answer ID
  body           String   @db.Text
  bodyMarkdown   String   @db.Text
  
  // Answer Stats
  score          Int      @default(0)
  commentCount   Int      @default(0)
  
  // Answer Info
  isAccepted     Boolean  @default(false)
  language       String?  // Programming language from question
  codeSnippets   Int      @default(0) // Number of code blocks
  
  // Author Info
  authorId       BigInt?  // StackOverflow user ID
  authorName     String?  // Display name
  authorReputation Int?   // User reputation
  
  // URLs and Attribution
  link           String   // StackOverflow answer URL
  shareLink      String?  // Shortened share URL
  
  // Timestamps
  stackCreatedAt DateTime
  stackUpdatedAt DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  
  // Relations
  question       StackOverflowQuestion @relation(fields: [questionId], references: [id], onDelete: Cascade)
  contents       Content[]
  
  @@index([questionId])
  @@index([score(sort: Desc)])
  @@index([isAccepted])
  @@index([stackCreatedAt(sort: Desc)])
  @@map("stackoverflow_answers")
}
```

### 4. Enhanced Content Model
```prisma
// Enhanced existing Content model
model Content {
  id             String   @id @default(cuid())
  title          String
  content        String   @db.Text
  contentHash    String   @unique // SHA256 for deduplication
  
  // Source Information
  sourceType     String   // github, stackoverflow, documentation
  sourceId       String?  // Reference to source model ID
  sourceUrl      String?  // Original source URL
  
  // GitHub-specific fields
  repo           String?
  path           String?
  branch         String?  @default("main")
  githubFileId   String?  // Reference to GitHubFile
  
  // StackOverflow-specific fields
  stackQuestionId String? // Reference to StackOverflowQuestion
  stackAnswerId   String? // Reference to StackOverflowAnswer
  
  // Content Metadata
  language       String
  fileExtension  String?
  size           Int      // Content size in bytes
  tokenCount     Int?     // Estimated token count
  
  // Attribution
  author         String?
  authorUrl      String?
  license        String?
  attribution    String?  @db.Text // Full attribution text
  
  // Content Classification
  contentType    String   @default("file") // file, question, answer, snippet, documentation
  tags           String[] @default([])
  difficulty     String?  // beginner, intermediate, advanced
  quality        Float?   // Quality score 0-1
  
  // Processing Status
  status         String   @default("processed") // pending, processing, processed, failed
  processedAt    DateTime @default(now())
  
  // Timestamps
  originalDate   DateTime? // Original creation date from source
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  
  // Relations
  chunks         ContentChunk[]
  favorites      Favorite[]
  githubFile     GitHubFile? @relation(fields: [githubFileId], references: [id])
  stackQuestion  StackOverflowQuestion? @relation(fields: [stackQuestionId], references: [id])
  stackAnswer    StackOverflowAnswer? @relation(fields: [stackAnswerId], references: [id])
  
  // Updated indexes
  @@unique([repo, path, branch])
  @@index([sourceType, language])
  @@index([contentType, language])
  @@index([quality(sort: Desc)])
  @@index([originalDate(sort: Desc)])
  @@index([githubFileId])
  @@index([stackQuestionId])
  @@index([stackAnswerId])
  @@map("content")
}
```

### 5. Enhanced ContentChunk Model
```prisma
// Enhanced existing ContentChunk model
model ContentChunk {
  id            String   @id @default(cuid())
  contentId     String
  
  // Chunk Content
  text          String   @db.Text
  textHash      String   // SHA256 of chunk text for deduplication
  
  // Chunk Position
  startIndex    Int      // Character start position
  endIndex      Int      // Character end position
  startLine     Int?     // Line start position (for code files)
  endLine       Int?     // Line end position (for code files)
  chunkIndex    Int      // Sequential chunk number
  
  // Chunk Metadata
  tokens        Int      // Token count for this chunk
  language      String?  // Programming language
  chunkType     String   @default("text") // text, code, comment, documentation
  
  // Vector Embedding
  embedding     Unsupported("vector(1536)")? // OpenAI text-embedding-3-small
  embeddingModel String? @default("text-embedding-3-small")
  embeddedAt    DateTime?
  
  // Processing Status
  status        String   @default("pending") // pending, embedded, failed
  error         String?  @db.Text
  
  // Context Information
  context       String?  @db.Text // Surrounding context for better search
  summary       String?  @db.Text // AI-generated summary
  keywords      String[] @default([]) // Extracted keywords
  
  // Timestamps
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  // Relations
  content       Content @relation(fields: [contentId], references: [id], onDelete: Cascade)
  githubFile    GitHubFile? @relation(fields: [contentId], references: [id])
  
  // Enhanced indexes
  @@unique([contentId, chunkIndex])
  @@index([contentId])
  @@index([language])
  @@index([chunkType])
  @@index([status])
  @@index([embeddedAt])
  @@index([textHash])
  @@map("content_chunks")
}
```

### 6. Enhanced IngestionJob Model
```prisma
// Enhanced existing IngestionJob model
model IngestionJob {
  id              String   @id @default(cuid())
  
  // Job Identification
  type            String   // github_repo, github_discover, stackoverflow_tags, stackoverflow_questions
  source          String   // Repository URL, tag name, or query
  priority        Int      @default(1) // 1 (low) to 10 (high)
  
  // Job Configuration
  config          Json?    // Job-specific configuration
  filters         Json?    // Content filters (languages, file types, etc.)
  limits          Json?    // Processing limits (max files, max size, etc.)
  
  // Job Status
  status          String   @default("pending") // pending, queued, running, completed, failed, cancelled
  progress        Int      @default(0) // 0-100
  currentStep     String?  // Current processing step
  
  // Job Metrics
  itemsTotal      Int      @default(0)
  itemsDone       Int      @default(0)
  itemsSkipped    Int      @default(0)
  itemsFailed     Int      @default(0)
  bytesProcessed  BigInt   @default(0)
  tokensProcessed BigInt   @default(0)
  
  // Job Results
  repositoriesFound  Int?  // For discovery jobs
  filesProcessed     Int?  // For repository ingestion
  questionsIngested  Int?  // For StackOverflow jobs
  answersIngested    Int?  // For StackOverflow jobs
  chunksCreated      Int?  // Total chunks created
  embeddingsGenerated Int? // Total embeddings generated
  
  // Error Handling
  error           String?  @db.Text
  retryCount      Int      @default(0)
  maxRetries      Int      @default(3)
  
  // Resource Usage
  memoryUsed      BigInt?  // Peak memory usage in bytes
  cpuTime         Int?     // CPU time in milliseconds
  duration        Int?     // Total job duration in milliseconds
  
  // Worker Information
  workerId        String?  // Worker process ID
  workerHost      String?  // Worker host/container
  queueName       String?  // BullMQ queue name
  
  // Dependencies
  parentJobId     String?  // Parent job (for sub-jobs)
  dependsOnJobIds String[] @default([]) // Jobs this depends on
  
  // Timestamps
  scheduledAt     DateTime @default(now())
  queuedAt        DateTime?
  startedAt       DateTime?
  completedAt     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // Relations
  parentJob       IngestionJob? @relation("JobDependency", fields: [parentJobId], references: [id])
  childJobs       IngestionJob[] @relation("JobDependency")
  githubRepos     GitHubRepository[]
  
  // Enhanced indexes
  @@index([type, status])
  @@index([status, priority])
  @@index([scheduledAt])
  @@index([parentJobId])
  @@index([workerId])
  @@map("ingestion_jobs")
}
```

## 🎯 Migration Strategy

### Phase 2.1: Core Models
1. Add GitHubRepository model
2. Add GitHubFile model
3. Enhance Content model with source tracking
4. Update IngestionJob model

### Phase 2.2: StackOverflow Models
1. Add StackOverflowQuestion model
2. Add StackOverflowAnswer model
3. Update Content relations

### Phase 2.3: Enhanced Features
1. Update ContentChunk with advanced features
2. Add performance indexes
3. Set up pgvector extensions

### Migration Commands
```bash
# Create migration for GitHub models
pnpm prisma migrate dev --name "add-github-models"

# Create migration for StackOverflow models  
pnpm prisma migrate dev --name "add-stackoverflow-models"

# Create migration for enhanced features
pnpm prisma migrate dev --name "enhance-content-models"

# Generate Prisma client
pnpm prisma generate
```

## 📊 Performance Considerations

### Indexing Strategy
- **Primary keys**: All models use cuid() for distributed systems
- **Foreign keys**: Proper indexing on all relation fields
- **Search indexes**: Language, content type, and date-based queries
- **Vector indexes**: ivfflat index for embedding similarity search
- **Composite indexes**: Multi-column indexes for common query patterns

### Storage Optimization
- **Content deduplication**: SHA256 hashing prevents duplicate storage
- **Chunk optimization**: Optimal chunk sizes for embedding performance
- **Binary handling**: Skip binary files to save storage
- **Compression**: Use PostgreSQL compression for large text fields

### Query Performance
- **Pagination**: Cursor-based pagination for large datasets
- **Filtering**: Pre-indexed filtering by language, type, and date
- **Aggregation**: Optimized counts and statistics queries
- **Caching**: Redis caching for frequently accessed data

## ✅ Schema Design Complete

This enhanced schema provides:
- ✅ **GitHub Integration**: Complete repository and file tracking
- ✅ **StackOverflow Integration**: Question and answer modeling
- ✅ **Content Attribution**: Proper source tracking and licensing
- ✅ **Job Management**: Advanced ingestion job tracking
- ✅ **Performance**: Optimized indexes and storage
- ✅ **Scalability**: Designed for large-scale content ingestion

**Next Steps**: Implement Prisma migrations and update the schema file.

---

**Schema design completed**: November 2, 2025  
**Next task**: Create database migration scripts  
**Implementation ready**: ✅ Yes