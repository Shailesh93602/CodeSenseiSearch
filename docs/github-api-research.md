# GitHub API Integration Research Summary

**Task**: Phase 2 GitHub API Integration Research  
**Status**: ✅ Complete  
**Date**: November 2, 2025

## 🎯 Research Overview

This document summarizes the research findings for integrating GitHub's GraphQL API v4 for repository content ingestion in CodeSenseiSearch Phase 2.

## 🔑 Key Findings

### Rate Limits & Authentication
- **Primary Rate Limit**: 5,000 points per hour for personal access tokens
- **Points Calculation**: Complex queries can cost 50+ points
- **Secondary Rate Limits**: Max 100 concurrent requests, 2,000 points/minute for GraphQL
- **Authentication**: Personal Access Token (PAT) required

### Rate Limit Details
```typescript
// Rate Limit Headers
interface RateLimitHeaders {
  'x-ratelimit-limit': number;        // 5000 points/hour
  'x-ratelimit-remaining': number;    // Points remaining
  'x-ratelimit-used': number;         // Points used
  'x-ratelimit-reset': number;        // Reset time (UTC epoch)
  'x-ratelimit-resource': 'graphql';  // Always 'graphql'
}

// Rate Limit Query
const rateLimitQuery = `
  query {
    rateLimit {
      limit
      remaining
      used
      resetAt
      cost
    }
  }
`;
```

### Node Limits & Query Optimization
- **Node Limit**: Maximum 500,000 total nodes per query
- **Pagination**: `first` or `last` must be 1-100
- **Timeout**: 10 seconds max per request
- **Optimization**: Request only required fields, use smaller pagination

## 🛠️ Recommended Implementation Strategy

### 1. GraphQL Query Design for Repository Content

```graphql
query GetRepositoryFiles($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    id
    name
    description
    stargazerCount
    primaryLanguage {
      name
    }
    defaultBranchRef {
      target {
        ... on Commit {
          tree {
            entries {
              name
              path
              type
              object {
                ... on Blob {
                  text
                  byteSize
                }
              }
            }
          }
        }
      }
    }
  }
  rateLimit {
    remaining
    resetAt
    cost
  }
}
```

### 2. File Type Filtering Strategy
Focus on these file extensions for maximum value:
- **JavaScript**: `.js`, `.jsx`, `.ts`, `.tsx`
- **Python**: `.py`, `.pyx`, `.pyi`
- **Documentation**: `.md`, `.rst`, `.txt`
- **Configuration**: `.json`, `.yaml`, `.yml`
- **Other Languages**: `.rs`, `.go`, `.java`, `.cpp`, `.c`

### 3. Rate Limiting Implementation
```typescript
interface RateLimiter {
  points: number;
  resetAt: Date;
  delayMs: number;
}

class GitHubAPIClient {
  private rateLimit: RateLimiter = {
    points: 5000,
    resetAt: new Date(),
    delayMs: 0
  };

  async makeRequest(query: string, variables: any) {
    // Check rate limit before request
    if (this.rateLimit.points < 10) {
      const waitTime = this.rateLimit.resetAt.getTime() - Date.now();
      if (waitTime > 0) {
        await this.delay(waitTime);
      }
    }

    const response = await this.graphqlRequest(query, variables);
    
    // Update rate limit from headers
    this.updateRateLimit(response.headers);
    
    return response.data;
  }

  private updateRateLimit(headers: Headers) {
    this.rateLimit.points = parseInt(headers.get('x-ratelimit-remaining') || '0');
    this.rateLimit.resetAt = new Date(
      parseInt(headers.get('x-ratelimit-reset') || '0') * 1000
    );
  }
}
```

## 📊 Content Ingestion Strategy

### Repository Selection Criteria
1. **Popular Repositories**: 1000+ stars for quality content
2. **Active Repositories**: Updated within last 6 months
3. **Language Focus**: JavaScript, Python, TypeScript, React, Node.js
4. **Size Limits**: Skip repositories > 100MB to avoid timeout issues

### File Processing Pipeline
```typescript
interface FileProcessingPipeline {
  1: 'Repository Discovery';      // Find popular repos by language
  2: 'Metadata Extraction';       // Get repo info (stars, language, description)
  3: 'File Tree Traversal';       // Get file structure with filtering
  4: 'Content Retrieval';         // Fetch file content in batches
  5: 'Content Chunking';          // Split large files for embedding
  6: 'Database Storage';          // Store with metadata and attribution
}
```

### Chunking Algorithm
```typescript
interface ContentChunk {
  id: string;
  repositoryId: string;
  filePath: string;
  chunkIndex: number;
  content: string;
  language: string;
  startLine: number;
  endLine: number;
  byteSize: number;
}

class ContentChunker {
  chunkFile(content: string, language: string, maxTokens = 1500): ContentChunk[] {
    // Language-aware chunking:
    // 1. Split by functions/classes for code files
    // 2. Split by headers for markdown
    // 3. Split by logical breaks for other files
    // 4. Ensure overlap for context preservation
  }
}
```

## 🎯 Next Steps Implementation Plan

### Phase 2.1: GitHub API Client Setup
```typescript
// apps/api/src/services/github-api.service.ts
@Injectable()
export class GitHubAPIService {
  private readonly client: GraphQLClient;
  
  constructor() {
    this.client = new GraphQLClient('https://api.github.com/graphql', {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'User-Agent': 'CodeSenseiSearch/1.0',
      },
    });
  }

  async getRepository(owner: string, name: string) {
    // Implementation with rate limiting
  }

  async getRepositoryFiles(owner: string, name: string, path = '') {
    // Implementation with pagination
  }
}
```

### Phase 2.2: Job Queue Integration
```typescript
// Ingestion jobs with BullMQ
export enum GitHubJobType {
  DISCOVER_REPOSITORIES = 'github:discover-repos',
  INGEST_REPOSITORY = 'github:ingest-repo', 
  PROCESS_FILE = 'github:process-file',
  CHUNK_CONTENT = 'github:chunk-content'
}

// Job data interfaces
interface IngestRepositoryJob {
  owner: string;
  name: string;
  priority: number;
}

interface ProcessFileJob {
  repositoryId: string;
  filePath: string;
  content: string;
  language: string;
}
```

### Phase 2.3: Database Schema
```sql
-- Repository metadata
CREATE TABLE github_repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id BIGINT UNIQUE NOT NULL,
  owner VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  full_name VARCHAR(512) NOT NULL,
  description TEXT,
  primary_language VARCHAR(100),
  stargazer_count INTEGER DEFAULT 0,
  size_kb INTEGER DEFAULT 0,
  default_branch VARCHAR(255) DEFAULT 'main',
  ingestion_status VARCHAR(50) DEFAULT 'pending',
  ingested_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_github_repos_status (ingestion_status),
  INDEX idx_github_repos_language (primary_language),
  INDEX idx_github_repos_stars (stargazer_count DESC)
);

-- File content chunks
CREATE TABLE github_file_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES github_repositories(id) ON DELETE CASCADE,
  file_path VARCHAR(1024) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_extension VARCHAR(20),
  chunk_index INTEGER NOT NULL,
  chunk_content TEXT NOT NULL,
  language VARCHAR(100),
  start_line INTEGER,
  end_line INTEGER,
  byte_size INTEGER,
  token_count INTEGER,
  embedding vector(1536), -- OpenAI embedding size
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_github_chunks_repo (repository_id),
  INDEX idx_github_chunks_path (file_path),
  INDEX idx_github_chunks_language (language),
  INDEX idx_github_chunks_embedding ON github_file_chunks USING ivfflat (embedding vector_cosine_ops)
);
```

## 🚨 Important Considerations

### Security & Compliance
- **Token Security**: Store GitHub PAT in secure environment variables
- **Attribution**: Always include repository and author attribution
- **License Compliance**: Respect repository licenses and terms
- **Privacy**: Avoid ingesting private repositories without permission

### Performance Optimization
- **Caching**: Cache repository metadata to avoid repeated API calls
- **Batching**: Process files in batches to optimize API usage
- **Filtering**: Skip binary files, generated files, and large assets
- **Monitoring**: Track API usage and ingestion progress

### Error Handling
- **Rate Limit Recovery**: Automatic retry with exponential backoff
- **Timeout Handling**: Resume interrupted ingestion jobs
- **Data Validation**: Verify content integrity and encoding
- **Graceful Degradation**: Continue processing other repos if one fails

## ✅ Research Complete - Ready for Implementation

This research provides the foundation for implementing GitHub API integration in Phase 2. The next step is to begin building the database schema and API service implementation.

---

**Research completed**: November 2, 2025  
**Next task**: Design Content Ingestion Database Schema  
**Implementation ready**: ✅ Yes