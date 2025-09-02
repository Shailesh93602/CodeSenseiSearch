# Phase 2: Content Ingestion Pipeline

**Status**: 🚧 Ready to Start  
**Target**: Week 3-4  
**Priority**: P1 (Critical Path)

## Phase 2 Overview

Phase 2 focuses on building a robust content ingestion pipeline that can automatically collect, process, and store developer content from GitHub repositories and StackOverflow. This phase establishes the foundation for real data that will replace our mock data system.

## 🎯 Phase 2 Goals

### Primary Objectives
1. **GitHub API Integration** - Ingest repository content with proper rate limiting
2. **StackOverflow API Integration** - Collect Q&A content with attribution
3. **Database Schema** - Design PostgreSQL + pgvector storage for content
4. **Worker System** - Implement BullMQ job queue for async processing
5. **Content Processing** - Parse, chunk, and prepare content for embeddings
6. **Admin Dashboard** - Monitor ingestion progress and queue health

### Success Criteria
- [x] **Functional**: GitHub repos ingested successfully with metadata
- [x] **Functional**: StackOverflow Q&A content processed and stored
- [x] **Performance**: Handle 1000+ files without memory issues
- [x] **Reliability**: Error handling and retry mechanisms working
- [x] **Monitoring**: Admin dashboard showing ingestion progress
- [x] **Quality**: Content properly parsed and chunked for search

## 📋 Detailed Task Breakdown

### Task 1: GitHub API Integration Research 
**Priority**: P0 | **Estimate**: 1 day | **Status**: ⏳ Not Started

**Description**: Research GitHub API v4 (GraphQL) for repository content ingestion, understand rate limits, authentication, and optimal query patterns for code files

**Acceptance Criteria**:
- [ ] Document GitHub API rate limits and authentication methods
- [ ] Design GraphQL queries for repository content retrieval
- [ ] Test API access with personal access token
- [ ] Plan pagination and rate limiting strategies
- [ ] Identify optimal file types and size limits for ingestion

**Technical Notes**:
- GitHub API v4 uses GraphQL with 5000 points/hour rate limit
- Need to handle large repositories with selective file ingestion
- Focus on code files (.js, .ts, .py, .rs, .go, .java, .md)
- Implement exponential backoff for rate limiting

---

### Task 2: Design Content Ingestion Database Schema
**Priority**: P0 | **Estimate**: 1 day | **Status**: ⏳ Not Started

**Description**: Design PostgreSQL schema with pgvector for storing repository content, file metadata, and embeddings with proper indexing

**Acceptance Criteria**:
- [ ] Create Prisma schema for repositories, files, and content chunks
- [ ] Design pgvector integration for embedding storage
- [ ] Plan indexing strategy for optimal query performance
- [ ] Include metadata fields for source attribution and timestamps
- [ ] Design schema for StackOverflow questions and answers

**Technical Notes**:
```sql
-- Repository table with metadata
CREATE TABLE repositories (
  id UUID PRIMARY KEY,
  github_id INTEGER UNIQUE,
  name VARCHAR NOT NULL,
  full_name VARCHAR NOT NULL,
  description TEXT,
  language VARCHAR,
  stars INTEGER,
  last_updated TIMESTAMP,
  ingestion_status VARCHAR DEFAULT 'pending'
);

-- File content with chunking
CREATE TABLE file_chunks (
  id UUID PRIMARY KEY,
  repository_id UUID REFERENCES repositories(id),
  file_path VARCHAR NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  language VARCHAR,
  embedding vector(1536), -- OpenAI embedding size
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_file_chunks_embedding ON file_chunks USING ivfflat (embedding vector_cosine_ops);
```

---

### Task 3: Implement BullMQ Worker System
**Priority**: P0 | **Estimate**: 2 days | **Status**: ⏳ Not Started

**Description**: Set up BullMQ job queue with Redis for async processing of repository content and embedding generation

**Acceptance Criteria**:
- [ ] Configure BullMQ with Redis connection
- [ ] Create job types for GitHub ingestion, StackOverflow ingestion, embedding generation
- [ ] Implement worker processes with proper error handling
- [ ] Add job progress tracking and status updates
- [ ] Create admin interface for queue monitoring

**Technical Implementation**:
```typescript
// Job Types
export enum JobType {
  GITHUB_REPO_INGESTION = 'github-repo-ingestion',
  STACKOVERFLOW_INGESTION = 'stackoverflow-ingestion',
  GENERATE_EMBEDDINGS = 'generate-embeddings',
  PROCESS_FILE_CHUNK = 'process-file-chunk'
}

// Queue Configuration
export const queueConfig = {
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
};
```

---

### Task 4: Build GitHub Content Ingestion Workers
**Priority**: P1 | **Estimate**: 3 days | **Status**: ⏳ Not Started

**Description**: Create ingestion workers for processing GitHub repositories - file parsing, chunking, and metadata extraction

**Acceptance Criteria**:
- [ ] GitHub API client with authentication and rate limiting
- [ ] Repository discovery and selection logic
- [ ] File content retrieval with type filtering
- [ ] Content chunking algorithm for optimal embedding size
- [ ] Metadata extraction (author, timestamp, language detection)
- [ ] Error handling for large files and API limits

**Technical Implementation**:
```typescript
export class GitHubIngestionWorker {
  async processRepository(repoUrl: string) {
    // 1. Fetch repository metadata
    // 2. Get file tree with filtering
    // 3. Process files in batches
    // 4. Chunk content for embeddings
    // 5. Store in database with metadata
  }

  async chunkContent(content: string, language: string): Promise<Chunk[]> {
    // Intelligent chunking based on:
    // - Language syntax (functions, classes)
    // - Token limits (1000-2000 tokens per chunk)
    // - Overlap for context preservation
  }
}
```

---

### Task 5: StackOverflow API Integration Research
**Priority**: P1 | **Estimate**: 1 day | **Status**: ⏳ Not Started

**Description**: Research StackOverflow API for Q&A content ingestion, understand data structure and filtering options

**Acceptance Criteria**:
- [ ] Document StackOverflow API endpoints and rate limits
- [ ] Design queries for popular questions by programming language tags
- [ ] Plan content filtering by votes, answers, and dates
- [ ] Test API access and response formats
- [ ] Design attribution and content licensing compliance

**Technical Notes**:
- StackOverflow API v2.3 with 10,000 requests/day limit
- Focus on highly voted questions with accepted answers
- Include code snippets and explanations
- Proper attribution with user names and links
- Filter by tags: javascript, python, react, typescript, etc.

---

### Task 6: Build StackOverflow Content Workers
**Priority**: P1 | **Estimate**: 2 days | **Status**: ⏳ Not Started

**Description**: Implement StackOverflow ingestion workers for questions, answers, and code snippets with proper attribution

**Acceptance Criteria**:
- [ ] StackOverflow API client with rate limiting
- [ ] Question and answer content retrieval
- [ ] Code snippet extraction and language detection
- [ ] Content chunking optimized for Q&A format
- [ ] Attribution metadata preservation
- [ ] Content quality filtering (votes, acceptance)

**Database Schema Addition**:
```sql
CREATE TABLE stackoverflow_questions (
  id UUID PRIMARY KEY,
  stackoverflow_id INTEGER UNIQUE,
  title VARCHAR NOT NULL,
  body TEXT NOT NULL,
  tags VARCHAR[],
  score INTEGER,
  view_count INTEGER,
  answer_count INTEGER,
  created_at TIMESTAMP,
  author_name VARCHAR,
  author_reputation INTEGER
);

CREATE TABLE stackoverflow_answers (
  id UUID PRIMARY KEY,
  question_id UUID REFERENCES stackoverflow_questions(id),
  stackoverflow_id INTEGER UNIQUE,
  body TEXT NOT NULL,
  score INTEGER,
  is_accepted BOOLEAN,
  created_at TIMESTAMP,
  author_name VARCHAR
);
```

---

### Task 7: Database Migration for Content Storage
**Priority**: P0 | **Estimate**: 1 day | **Status**: ⏳ Not Started

**Description**: Create database migration scripts and update Prisma schema for content storage and metadata

**Acceptance Criteria**:
- [ ] Create Prisma migration for new content tables
- [ ] Set up pgvector extension if not already configured
- [ ] Create database indexes for performance
- [ ] Test migration rollback procedures
- [ ] Update Prisma client generation

**Migration Command**:
```bash
pnpm prisma migrate dev --name "add-content-ingestion-schema"
```

---

### Task 8: Create Ingestion Monitoring Dashboard
**Priority**: P2 | **Estimate**: 2 days | **Status**: ⏳ Not Started

**Description**: Build admin interface for monitoring ingestion progress, queue status, and content statistics

**Acceptance Criteria**:
- [ ] Dashboard showing ingestion job status and progress
- [ ] Queue health monitoring with retry and failure counts
- [ ] Content statistics (repositories, files, chunks ingested)
- [ ] Real-time updates using WebSocket or polling
- [ ] Admin controls for pausing/resuming ingestion jobs

**Dashboard Features**:
- Job queue status with pending/active/completed/failed counts
- Repository ingestion progress with ETA
- Content statistics and growth charts
- Error logs and retry mechanisms
- Manual job triggering for specific repositories

## 🚀 Phase 2 Success Metrics

### Functional Targets
- **Repositories**: Successfully ingest 50+ popular GitHub repositories
- **Content**: Process 10,000+ code files with proper chunking
- **StackOverflow**: Ingest 1,000+ high-quality Q&A pairs
- **Performance**: Handle ingestion without memory leaks or crashes
- **Reliability**: 95%+ job success rate with proper error handling

### Technical Quality
- **Database**: Optimal query performance with proper indexing
- **Worker System**: Scalable job processing with monitoring
- **API Integration**: Respect rate limits without service interruption
- **Content Quality**: Properly parsed and attributed content
- **Error Handling**: Graceful degradation and recovery mechanisms

## 🔄 Phase 2 to Phase 3 Transition

### Ready for Phase 3 When:
- [x] Content ingestion pipeline is stable and monitored
- [x] Database contains substantial real developer content
- [x] Worker system handles load without issues
- [x] Admin dashboard provides visibility into system health
- [x] Content quality meets standards for search relevance

### Phase 3 Preparation:
- Replace mock data with real ingested content
- Prepare for OpenAI API integration for embeddings
- Plan vector search implementation with pgvector
- Design search ranking and relevance algorithms

---

**Phase 2 Target**: Complete robust content ingestion pipeline ready for embedding generation and vector search in Phase 3.

*Created: November 2, 2025 | Target Completion: Week 3-4*