# Performance Testing and Optimization Guide

## Overview
This document outlines performance testing strategies, optimization techniques, and benchmarking procedures for CodeSenseiSearch.

## Performance Testing Strategy

### 1. Load Testing with K6

#### Installation and Setup
```bash
# Install k6
brew install k6  # macOS
# or
sudo apt-get install k6  # Ubuntu

# Verify installation
k6 version
```

#### Basic Load Test Configuration
```javascript
// k6-load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 },   // Ramp up to 10 users
    { duration: '5m', target: 10 },   // Stay at 10 users
    { duration: '2m', target: 20 },   // Ramp up to 20 users
    { duration: '5m', target: 20 },   // Stay at 20 users
    { duration: '2m', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.1'],    // Error rate under 10%
    errors: ['rate<0.1'],             // Custom error rate under 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.codesenseisearch.com';

export default function () {
  // Test homepage
  const homeResponse = http.get(`${BASE_URL}/`);
  check(homeResponse, {
    'homepage status is 200': (r) => r.status === 200,
    'homepage response time < 500ms': (r) => r.timings.duration < 500,
  });

  // Test search endpoint
  const searchResponse = http.get(`${BASE_URL}/api/search?q=javascript`);
  check(searchResponse, {
    'search status is 200': (r) => r.status === 200,
    'search response time < 1000ms': (r) => r.timings.duration < 1000,
    'search returns results': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.results && body.results.length > 0;
      } catch (e) {
        return false;
      }
    },
  });

  // Test API health endpoint
  const healthResponse = http.get(`${BASE_URL}/health`);
  check(healthResponse, {
    'health status is 200': (r) => r.status === 200,
  });

  // Record errors
  errorRate.add(homeResponse.status !== 200);
  errorRate.add(searchResponse.status !== 200);
  errorRate.add(healthResponse.status !== 200);

  sleep(1); // Wait 1 second between iterations
}
```

#### Stress Testing Configuration
```javascript
// k6-stress-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '3m', target: 50 },   // Stay at 50 users  
    { duration: '1m', target: 100 },  // Ramp up to 100 users
    { duration: '3m', target: 100 },  // Stay at 100 users
    { duration: '1m', target: 200 },  // Ramp up to 200 users
    { duration: '3m', target: 200 },  // Stay at 200 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% under 2s during stress
    http_req_failed: ['rate<0.2'],     // 20% error rate acceptable in stress
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.codesenseisearch.com';

export default function () {
  // Simulate real user behavior
  const scenarios = [
    () => searchTest(),
    () => authTest(),
    () => browseTest(),
  ];

  // Randomly choose a scenario
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  scenario();

  sleep(Math.random() * 3 + 1); // Random sleep 1-4 seconds
}

function searchTest() {
  const queries = ['javascript', 'python', 'react', 'node.js', 'docker'];
  const query = queries[Math.floor(Math.random() * queries.length)];
  
  const response = http.get(`${BASE_URL}/api/search?q=${query}`);
  check(response, {
    'search successful': (r) => r.status === 200,
  });
}

function authTest() {
  // Test authentication flow
  const loginResponse = http.post(`${BASE_URL}/api/auth/github/callback`);
  check(loginResponse, {
    'auth endpoint accessible': (r) => r.status !== 404,
  });
}

function browseTest() {
  // Test browsing behavior
  const response = http.get(`${BASE_URL}/api/content/trending`);
  check(response, {
    'browse successful': (r) => r.status === 200,
  });
}
```

### 2. Database Performance Testing

#### Database Load Testing
```sql
-- PostgreSQL performance testing queries

-- Test search query performance
EXPLAIN ANALYZE 
SELECT c.*, ce.embedding
FROM content c
LEFT JOIN content_embeddings ce ON c.id = ce.content_id
WHERE c.content_text ILIKE '%javascript%'
ORDER BY c.created_at DESC
LIMIT 20;

-- Test vector similarity search performance
EXPLAIN ANALYZE
SELECT c.*, 1 - (ce.embedding <=> $1::vector) as similarity
FROM content c
JOIN content_embeddings ce ON c.id = ce.content_id
ORDER BY ce.embedding <=> $1::vector
LIMIT 10;

-- Test complex search with filters
EXPLAIN ANALYZE
SELECT c.*, ce.similarity_score
FROM content c
JOIN content_embeddings ce ON c.id = ce.content_id
WHERE c.content_type = 'code'
  AND c.language = 'javascript'
  AND c.created_at > NOW() - INTERVAL '30 days'
ORDER BY ce.similarity_score DESC
LIMIT 20;
```

#### Database Optimization Queries
```sql
-- Create performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_text_gin 
ON content USING gin(to_tsvector('english', content_text));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_type_language 
ON content(content_type, language);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_created_at 
ON content(created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_vector_cosine 
ON content_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Update table statistics
ANALYZE content;
ANALYZE content_embeddings;

-- Check index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

### 3. Application Performance Monitoring

#### API Performance Metrics
```typescript
// performance.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { createPrometheusMetrics } from './metrics';

@Injectable()
export class PerformanceMiddleware implements NestMiddleware {
  private metrics = createPrometheusMetrics();

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const route = req.route?.path || req.path;
      const method = req.method;
      const statusCode = res.statusCode;

      // Record metrics
      this.metrics.httpRequestDuration
        .labels(method, route, statusCode.toString())
        .observe(duration / 1000);

      this.metrics.httpRequestTotal
        .labels(method, route, statusCode.toString())
        .inc();

      // Log slow requests
      if (duration > 1000) {
        console.warn(`Slow request: ${method} ${route} took ${duration}ms`);
      }
    });

    next();
  }
}
```

## Performance Optimization Strategies

### 1. Database Optimization

#### Query Optimization
```typescript
// Optimized search service
@Injectable()
export class OptimizedSearchService {
  async hybridSearch(query: string, limit = 20) {
    // Use connection pooling
    const pool = this.databaseService.getPool();
    
    // Batch operations
    const [textResults, vectorResults] = await Promise.all([
      this.fullTextSearch(query, limit),
      this.vectorSearch(query, limit)
    ]);

    // Combine and rank results
    return this.combineResults(textResults, vectorResults);
  }

  private async fullTextSearch(query: string, limit: number) {
    // Use prepared statement
    return this.prisma.$queryRaw`
      SELECT c.*, ts_rank(to_tsvector('english', c.content_text), plainto_tsquery(${query})) as rank
      FROM content c
      WHERE to_tsvector('english', c.content_text) @@ plainto_tsquery(${query})
      ORDER BY rank DESC
      LIMIT ${limit}
    `;
  }

  private async vectorSearch(query: string, limit: number) {
    const embedding = await this.embeddingService.generateEmbedding(query);
    
    return this.prisma.$queryRaw`
      SELECT c.*, 1 - (ce.embedding <=> ${embedding}::vector) as similarity
      FROM content c
      JOIN content_embeddings ce ON c.id = ce.content_id
      ORDER BY ce.embedding <=> ${embedding}::vector
      LIMIT ${limit}
    `;
  }
}
```

#### Connection Pooling Configuration
```typescript
// database.config.ts
export const databaseConfig = {
  connectionString: process.env.DATABASE_URL,
  pool: {
    min: 5,
    max: 20,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
  },
  query_timeout: 10000,
  statement_timeout: 15000,
};
```

### 2. Caching Strategy

#### Redis Caching Implementation
```typescript
// cache.service.ts
@Injectable()
export class CacheService {
  constructor(private redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async set(key: string, value: any, ttl = 3600): Promise<void> {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  // Cache search results
  async cacheSearchResults(query: string, results: any[]): Promise<void> {
    const key = `search:${this.hashQuery(query)}`;
    await this.set(key, results, 1800); // 30 minutes
  }

  private hashQuery(query: string): string {
    return crypto.createHash('md5').update(query.toLowerCase()).digest('hex');
  }
}
```

#### Application-Level Caching
```typescript
// search.service.ts with caching
@Injectable()
export class SearchService {
  constructor(
    private cacheService: CacheService,
    private searchRepository: SearchRepository
  ) {}

  async search(query: string, filters?: SearchFilters) {
    const cacheKey = this.generateCacheKey(query, filters);
    
    // Try cache first
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Execute search
    const results = await this.executeSearch(query, filters);
    
    // Cache results
    await this.cacheService.set(cacheKey, results, 1800);
    
    return results;
  }

  private generateCacheKey(query: string, filters?: SearchFilters): string {
    return `search:${Buffer.from(JSON.stringify({ query, filters })).toString('base64')}`;
  }
}
```

### 3. Frontend Optimization

#### Next.js Performance Configuration
```javascript
// next.config.js
module.exports = {
  experimental: {
    serverComponents: true,
    appDir: true,
  },
  images: {
    domains: ['github.com', 'avatars.githubusercontent.com'],
    formats: ['image/webp', 'image/avif'],
  },
  compress: true,
  poweredByHeader: false,
  generateEtags: false,
  
  // Webpack optimizations
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      // Production optimizations
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
        },
      };
    }
    return config;
  },

  // Headers for performance
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ];
  },
};
```

## Performance Benchmarking

### Running Performance Tests

#### Complete Performance Test Suite
```bash
#!/bin/bash
# run-performance-tests.sh

echo "🚀 Starting performance testing suite..."

# 1. Basic load test
echo "📊 Running basic load test..."
k6 run --env BASE_URL=https://staging.codesenseisearch.com \
  tests/performance/k6-load-test.js

# 2. Stress test
echo "💪 Running stress test..."
k6 run --env BASE_URL=https://staging.codesenseisearch.com \
  tests/performance/k6-stress-test.js

# 3. Database performance test
echo "🗄️ Testing database performance..."
psql $DATABASE_URL -f tests/performance/db-performance-test.sql

# 4. API endpoint benchmarking
echo "🌐 Benchmarking API endpoints..."
./tests/performance/api-benchmark.sh

echo "✅ Performance testing complete!"
```

#### API Benchmarking Script
```bash
#!/bin/bash
# api-benchmark.sh

BASE_URL="https://staging.codesenseisearch.com"

echo "Testing search endpoint performance..."
ab -n 1000 -c 10 "${BASE_URL}/api/search?q=javascript"

echo "Testing health endpoint performance..."
ab -n 1000 -c 20 "${BASE_URL}/health"

echo "Testing authentication endpoint performance..."
ab -n 500 -c 5 "${BASE_URL}/api/auth/me"

echo "Benchmarking complete!"
```

### Performance Metrics and Targets

#### Target Performance Metrics
- **API Response Time**: P95 < 500ms, P99 < 1000ms
- **Search Response Time**: P95 < 800ms, P99 < 1500ms
- **Database Query Time**: < 100ms for simple queries, < 500ms for complex
- **Cache Hit Rate**: > 80% for search queries
- **Throughput**: > 100 requests/second per instance
- **Error Rate**: < 1% under normal load, < 5% under stress

#### Monitoring Performance in Production
```typescript
// metrics collection
export const performanceMetrics = {
  // Response time histogram
  httpDuration: new prometheus.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
  }),

  // Database query metrics
  dbQueryDuration: new prometheus.Histogram({
    name: 'db_query_duration_seconds',
    help: 'Duration of database queries in seconds',
    labelNames: ['query_type', 'table'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  }),

  // Cache metrics
  cacheHitRate: new prometheus.Counter({
    name: 'cache_hits_total',
    help: 'Total cache hits',
    labelNames: ['cache_type'],
  }),

  cacheMissRate: new prometheus.Counter({
    name: 'cache_misses_total',
    help: 'Total cache misses',
    labelNames: ['cache_type'],
  }),
};
```

This comprehensive performance testing and optimization guide ensures your application can handle production loads efficiently.