# CodeSenseiSearch API Documentation - Phase 4

**API Version**: v1  
**Base URL**: `http://localhost:3001/api`  
**Documentation Generated**: November 3, 2025  
**Phase**: 4 (Hybrid Search System)

---

## 🚀 Quick Start

### Development Server
```bash
# Start the API server
cd apps/api
npm install
npm run dev

# Server will start on http://localhost:3001
# API endpoints available at http://localhost:3001/api
```

### Health Check
```bash
curl http://localhost:3001/api/health
# Response: { "status": "ok", "timestamp": "2025-11-03T..." }
```

---

## 🔍 Search Endpoints

### Hybrid Search
**Endpoint**: `GET /api/test/search/hybrid`  
**Description**: Performs comprehensive hybrid search combining vector similarity, full-text search, filtering, and LLM reranking.

**Query Parameters**:
```typescript
{
  q: string;                    // Search query (required)
  limit?: number;               // Max results (default: 20)
  vectorThreshold?: number;     // Vector similarity threshold (default: 0.7)
  vectorWeight?: number;        // Vector search weight (default: 0.6)
  textWeight?: number;          // Text search weight (default: 0.4)
  source?: string;              // 'repository' | 'question' | 'all' (default: 'all')
  language?: string;            // Filter by programming language
  contentType?: string;         // Filter by content type
  repository?: string;          // Filter by repository name
  repositoryId?: string;        // Filter by repository ID
  
  // Filter Parameters
  languages?: string[];         // Multiple languages
  repositories?: string[];      // Multiple repositories
  fileTypes?: string[];         // File extensions
  minScore?: number;            // Minimum relevance score
  maxScore?: number;            // Maximum relevance score
  dateFrom?: string;            // ISO date string
  dateTo?: string;              // ISO date string
  sources?: string[];           // Content sources
}
```

**Example Request**:
```bash
curl -G "http://localhost:3001/api/test/search/hybrid" \
  --data-urlencode "q=TypeScript interfaces" \
  --data-urlencode "limit=10" \
  --data-urlencode "language=typescript" \
  --data-urlencode "vectorThreshold=0.8"
```

**Response Format**:
```typescript
{
  query: string;
  results: HybridSearchResult[];
  totalResults: number;
  searchTime: number;           // milliseconds
  searchMethod: 'hybrid';
  metadata: {
    embeddingGenerated: boolean;
    vectorSearchUsed: boolean;
    textSearchUsed: boolean;
    vectorResults: number;
    textResults: number;
    mergedResults: number;
  };
  filterInfo?: AppliedFilters;  // if filters applied
}

interface HybridSearchResult {
  id: string;
  content: string;
  title: string;
  score: number;                // Combined relevance score
  vectorSimilarity?: number;    // Vector similarity score
  textRank?: number;           // Full-text search rank
  combinedRank: number;        // Final ranking position
  searchMethod: 'vector' | 'text' | 'hybrid';
  metadata: {
    language?: string;
    contentType?: string;
    repositoryName?: string;
    repositoryId?: string;
    questionId?: string;
    source: 'repository' | 'question';
  };
}
```

### Vector Search
**Endpoint**: `GET /api/test/search/vector`  
**Description**: Performs pure vector similarity search using embeddings.

**Query Parameters**:
```typescript
{
  q: string;                    // Search query (required)
  limit?: number;               // Max results (default: 10)
  threshold?: number;           // Similarity threshold (default: 0.7)
  contentType?: string;         // Filter by content type
  language?: string;            // Filter by language
  repositoryId?: string;        // Filter by repository
}
```

**Example Request**:
```bash
curl -G "http://localhost:3001/api/test/search/vector" \
  --data-urlencode "q=async await patterns" \
  --data-urlencode "limit=5" \
  --data-urlencode "threshold=0.8"
```

### Full-Text Search
**Endpoint**: `GET /api/test/search/fulltext`  
**Description**: Performs PostgreSQL full-text search with ranking.

**Query Parameters**:
```typescript
{
  q: string;                    // Search query (required)
  limit?: number;               // Max results (default: 10)
  language?: string;            // Filter by language
  contentType?: string;         // Filter by content type
  repository?: string;          // Filter by repository
}
```

**Example Request**:
```bash
curl -G "http://localhost:3001/api/test/search/fulltext" \
  --data-urlencode "q=React hooks useState" \
  --data-urlencode "limit=10" \
  --data-urlencode "language=javascript"
```

### Search Suggestions
**Endpoint**: `GET /api/test/search/hybrid/suggestions`  
**Description**: Get search suggestions based on query input.

**Query Parameters**:
```typescript
{
  q: string;                    // Partial query (required)
  limit?: number;               // Max suggestions (default: 5)
}
```

**Example Request**:
```bash
curl -G "http://localhost:3001/api/test/search/hybrid/suggestions" \
  --data-urlencode "q=Type" \
  --data-urlencode "limit=5"
```

**Response Format**:
```typescript
{
  suggestions: string[];        // Array of suggestion strings
  query: string;                // Original query
  count: number;                // Number of suggestions
}
```

---

## 🔧 Service Health Endpoints

### Hybrid Search Health
**Endpoint**: `GET /api/test/search/hybrid/health`  
**Description**: Check health status of hybrid search components.

**Response Format**:
```typescript
{
  available: boolean;
  components: {
    gemini: boolean;            // Gemini AI service status
    vector: boolean;            // Vector search service status
    fulltext: boolean;          // Full-text search service status
  };
  errors?: string[];            // Error messages if any
}
```

### Reranker Service Health
**Endpoint**: `GET /api/test/search/reranker/health`  
**Description**: Check health status of LLM reranking service.

**Response Format**:
```typescript
{
  available: boolean;
  geminiAvailable: boolean;     // Gemini AI availability
  statisticalFallback: boolean; // Statistical fallback status
}
```

### Filter Service Health
**Endpoint**: `GET /api/test/search/filter/health`  
**Description**: Check health status of search filter service.

**Response Format**:
```typescript
{
  available: boolean;
  databaseConnected: boolean;   // Database connection status
  filterOptionsCount: number;   // Number of available filter options
}
```

### Full-Text Search Health
**Endpoint**: `GET /api/test/search/fulltext/health`  
**Description**: Check health status of full-text search service.

**Response Format**:
```typescript
{
  available: boolean;
  indexesExist: boolean;        // Database indexes status
  sampleQuery: boolean;         // Sample query execution status
}
```

---

## 🎯 Filter Management Endpoints

### Get Filter Options
**Endpoint**: `GET /api/test/search/filter/options`  
**Description**: Get available filter options for search refinement.

**Response Format**:
```typescript
{
  availableLanguages: string[];
  availableRepositories: Repository[];
  availableFileTypes: string[];
  availableExtensions: string[];
  availableContentTypes: string[];
  availableSources: string[];
  availableTags: string[];
  
  languageCounts: Record<string, number>;
  repositoryCounts: Record<string, number>;
  fileTypeCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  
  dateRange: {
    min: Date;
    max: Date;
  };
  sizeRange: {
    min: number;
    max: number;
  };
}
```

### Validate Filter Combination
**Endpoint**: `POST /api/test/search/filter/validate`  
**Description**: Validate a filter combination before applying to search.

**Request Body**:
```typescript
{
  languages?: string[];
  repositories?: string[];
  repositoryOwners?: string[];
  fileTypes?: string[];
  extensions?: string[];
  contentTypes?: string[];
  sources?: string[];
  tags?: string[];
  minScore?: number;
  maxScore?: number;
  dateFrom?: string;            // ISO date string
  dateTo?: string;              // ISO date string
}
```

**Response Format**:
```typescript
{
  isValid: boolean;
  errors: string[];             // Validation errors
  warnings: string[];           // Validation warnings
  sanitizedFilters: SearchFilters; // Cleaned filter object
}
```

---

## 🤖 Reranking Endpoints

### Rerank Search Results
**Endpoint**: `POST /api/test/search/reranker/rerank`  
**Description**: Rerank search results using LLM for improved relevance.

**Request Body**:
```typescript
{
  query: string;                // Original search query
  results: SearchResult[];      // Results to rerank
  options?: {
    maxResults?: number;        // Max results to process
    includeReasoning?: boolean; // Include reranking explanation
  };
}
```

**Response Format**:
```typescript
{
  results: RerankedResult[];
  rerankerUsed: boolean;        // Whether LLM reranking was used
  rerankerTime: number;         // Processing time in milliseconds
  originalResultsCount: number;
  rerankedResultsCount: number;
}

interface RerankedResult extends HybridSearchResult {
  originalRank: number;         // Original position
  rerankedRank: number;         // New position after reranking
  rerankerScore?: number;       // LLM relevance score
  rerankerReasoning?: string;   // Explanation (if requested)
}
```

---

## 📊 Error Handling

### Standard Error Response
All API endpoints follow a consistent error response format:

```typescript
{
  error: {
    message: string;            // Human-readable error message
    code: string;               // Error code for programmatic handling
    details?: any;              // Additional error details
    timestamp: string;          // ISO timestamp
    path: string;               // API endpoint path
  };
  statusCode: number;           // HTTP status code
}
```

### Common Error Codes
- `400 Bad Request`: Invalid query parameters or request body
- `404 Not Found`: Endpoint not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Service temporarily unavailable

### Service-Specific Errors
- `SEARCH_QUERY_EMPTY`: Search query is required
- `SEARCH_QUERY_TOO_LONG`: Search query exceeds maximum length
- `VECTOR_SERVICE_UNAVAILABLE`: Vector search service not available
- `GEMINI_API_ERROR`: Gemini AI service error
- `DATABASE_CONNECTION_ERROR`: Database connection failed
- `FILTER_VALIDATION_ERROR`: Invalid filter parameters

---

## 🚀 Performance Guidelines

### Response Times (Target)
- **Hybrid Search**: 200-300ms
- **Vector Search**: 50-100ms
- **Full-Text Search**: 30-80ms
- **Reranking**: 100-200ms
- **Health Checks**: <50ms

### Rate Limiting
- **Development**: No rate limiting
- **Production**: 1000 requests/hour per IP (future implementation)

### Optimization Tips
1. **Use appropriate limits**: Don't request more results than needed
2. **Apply filters**: Use language/repository filters to narrow search
3. **Vector thresholds**: Higher thresholds return fewer, more relevant results
4. **Caching**: Results are cached based on query parameters

---

## 🔐 Security Considerations

### Input Validation
- All query parameters are validated and sanitized
- SQL injection protection through parameterized queries
- XSS prevention through input encoding

### API Security
- CORS enabled for allowed origins
- Request size limits to prevent abuse
- Error messages don't expose internal details

### Data Privacy
- No personal data collection in current phase
- Search queries are not logged permanently
- Anonymous usage by default

---

## 🧪 Testing the API

### Using curl
```bash
# Basic hybrid search
curl -G "http://localhost:3001/api/test/search/hybrid" \
  --data-urlencode "q=TypeScript"

# Search with filters
curl -G "http://localhost:3001/api/test/search/hybrid" \
  --data-urlencode "q=React hooks" \
  --data-urlencode "language=javascript" \
  --data-urlencode "limit=5"

# Health check
curl "http://localhost:3001/api/test/search/hybrid/health"
```

### Using JavaScript/Fetch
```javascript
// Hybrid search example
const searchQuery = async (query, options = {}) => {
  const params = new URLSearchParams({
    q: query,
    ...options
  });
  
  const response = await fetch(
    `http://localhost:3001/api/test/search/hybrid?${params}`
  );
  
  if (!response.ok) {
    throw new Error(`Search failed: ${response.statusText}`);
  }
  
  return response.json();
};

// Usage
const results = await searchQuery('TypeScript interfaces', {
  limit: 10,
  language: 'typescript'
});
```

### Using Python/Requests
```python
import requests

def hybrid_search(query, **options):
    params = {'q': query, **options}
    response = requests.get(
        'http://localhost:3001/api/test/search/hybrid',
        params=params
    )
    response.raise_for_status()
    return response.json()

# Usage
results = hybrid_search(
    'async await patterns',
    limit=10,
    language='javascript'
)
```

---

## 📚 Integration Examples

### Frontend Integration
```typescript
// TypeScript example for React/Vue/Angular
interface SearchService {
  async hybridSearch(
    query: string,
    options?: SearchOptions
  ): Promise<HybridSearchResponse> {
    const params = new URLSearchParams({
      q: query,
      ...Object.fromEntries(
        Object.entries(options || {})
          .filter(([_, value]) => value !== undefined)
          .map(([key, value]) => [key, String(value)])
      )
    });

    const response = await fetch(
      `${API_BASE_URL}/api/test/search/hybrid?${params}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    return response.json();
  }
}
```

### Backend Integration
```typescript
// Node.js service integration
class CodeSenseiSearchClient {
  constructor(private baseUrl: string) {}

  async search(query: string, options: SearchOptions = {}) {
    const url = new URL('/api/test/search/hybrid', this.baseUrl);
    
    Object.entries({ q: query, ...options }).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });

    const response = await fetch(url.toString());
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}
```

---

## 📝 API Changelog

### Phase 4 (November 3, 2025)
- ✅ Initial hybrid search API implementation
- ✅ Vector and full-text search endpoints
- ✅ Comprehensive filtering system
- ✅ LLM reranking capabilities
- ✅ Health monitoring endpoints
- ✅ Search suggestions API

### Future Phases
- **Phase 5**: Authentication endpoints and user management
- **Phase 6**: Production optimizations and monitoring
- **Phase 7**: Advanced features and public API

---

## 🤝 Support & Contributing

### Getting Help
- **Issues**: Report bugs via GitHub issues
- **Questions**: Check documentation or create discussion
- **Features**: Submit feature requests with use cases

### API Versioning
- Current version: `v1` (Phase 4)
- Backward compatibility guaranteed within major versions
- Breaking changes will increment major version

---

*API Documentation - Phase 4*  
*Last Updated: November 3, 2025*  
*Next Update: Phase 5 (Authentication & Personalization)*