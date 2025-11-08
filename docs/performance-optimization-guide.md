# Performance Optimization and Load Testing Guide

## Overview

This comprehensive performance optimization suite provides tools and configurations for monitoring, testing, and optimizing the CodeSenseiSearch application performance. The implementation includes load testing, database optimization, caching strategies, CDN configuration, and automated regression detection.

## Components

### 1. Load Testing with k6

#### Test Scripts

**API Load Test** (`performance/k6/api-load-test.js`)
- Comprehensive API endpoint testing
- Configurable load patterns with multiple stages
- Custom metrics for search operations
- Authentication support
- Performance thresholds: 95% < 500ms, error rate < 5%

**Frontend Load Test** (`performance/k6/frontend-load-test.js`)
- Web application user journey testing
- Homepage, search flow, and navigation testing
- Static asset performance monitoring
- Mobile/desktop user agent simulation
- Performance thresholds: 95% < 2s, error rate < 2%

**Spike Test** (`performance/k6/spike-test.js`)
- Sudden traffic surge simulation
- Mixed request type testing during spikes
- Rate limiting validation
- Service degradation analysis
- Spike tolerance: 95% < 1s, error rate < 10%

#### Running Tests

```bash
# Run all performance tests
./scripts/performance-test.sh

# Run specific test types
./scripts/performance-test.sh api
./scripts/performance-test.sh frontend
./scripts/performance-test.sh spike

# Extended stress testing
DURATION=10m ./scripts/performance-test.sh stress

# Custom environment testing
API_URL=https://api.prod.com WEB_URL=https://prod.com ./scripts/performance-test.sh
```

### 2. Database Performance Optimization

#### Optimization Queries (`performance/database/optimization-queries.sql`)

**Index Analysis and Recommendations**
- Missing index detection for high-cardinality columns
- Unused index identification
- Composite index suggestions for filtered searches
- Vector similarity search optimization

**Search Performance Optimizations**
- GIN indexes for full-text search
- Composite indexes for filtered searches  
- IVFFlat indexes for embedding similarity
- Partial indexes for recent content

**Monitoring and Maintenance**
- Slow query identification
- Table bloat analysis
- Connection and lock monitoring
- Vacuum and maintenance recommendations

#### Database Analysis Script

```bash
# Run comprehensive database analysis
PGPASSWORD=yourpass ./scripts/db-performance-analysis.sh

# Specific analysis types
PGPASSWORD=yourpass ./scripts/db-performance-analysis.sh --queries
PGPASSWORD=yourpass ./scripts/db-performance-analysis.sh --indexes
PGPASSWORD=yourpass ./scripts/db-performance-analysis.sh --maintenance

# Production database analysis
DB_HOST=prod-db PGPASSWORD=yourpass ./scripts/db-performance-analysis.sh
```

### 3. Caching Strategy

#### Redis Cache Service (`packages/shared/src/cache.service.ts`)

**Features**
- Multi-level caching with configurable TTL
- Search result caching with intelligent cache keys
- Content and embedding caching
- User session management
- Rate limiting support
- Comprehensive cache statistics

**Cache Layers**
- **Search Results**: 30-minute TTL with query+filter-based keys
- **Content**: 2-hour TTL for individual content items
- **Embeddings**: 7-day TTL for expensive ML computations
- **User Sessions**: 24-hour TTL for authentication data
- **Rate Limiting**: Sliding window rate limiting

**Usage Examples**

```typescript
// Search result caching
await cacheService.cacheSearchResults(query, filters, results, 1800);
const cachedResults = await cacheService.getCachedSearchResults(query, filters);

// Content caching
await cacheService.cacheContent(contentId, content);
const content = await cacheService.getCachedContent(contentId);

// Rate limiting
const limit = await cacheService.incrementRateLimit(userId, 3600, 100);
```

### 4. CDN Configuration

#### Multi-Provider CDN Setup (`performance/cdn/configurations.md`)

**Cloudflare Workers**
- Intelligent caching based on content type
- Cache key optimization with parameter filtering
- Mobile/desktop-aware caching
- Stale-while-revalidate patterns

**Nginx CDN Proxy**
- Gzip and Brotli compression
- Static asset optimization
- API response caching
- Security header injection

**AWS CloudFront**
- Global content distribution
- Optimized cache behaviors by path pattern
- SSL/TLS termination
- Security headers policy

**Cache Policies**
- Static assets: 1 year cache with immutable headers
- API responses: 5 minutes with stale-while-revalidate
- HTML pages: 30 minutes with conditional revalidation

### 5. Automated Regression Detection

#### Performance Regression Detection (`scripts/performance-regression-detection.sh`)

**Features**
- Automated baseline comparison
- Configurable regression thresholds
- Multi-metric analysis (response time, error rate, throughput)
- Comprehensive reporting
- CI/CD integration support

**Metrics Monitored**
- **Response Time**: P95/P99 percentiles with 20% regression threshold
- **Error Rate**: Maximum 5% with 2% regression threshold  
- **Throughput**: Minimum 50 RPS with 15% regression threshold
- **Resource Usage**: Memory and CPU utilization tracking

**Usage**

```bash
# Run regression detection
./scripts/performance-regression-detection.sh

# Update baselines after verified improvements
./scripts/performance-regression-detection.sh --update-baseline

# Test specific components
./scripts/performance-regression-detection.sh --test=api
```

## Performance Monitoring

### Key Metrics Dashboard

**Response Time Metrics**
- Average, P95, P99 response times
- Request rate and throughput
- Error rates by endpoint
- Database query performance

**Resource Utilization**
- CPU and memory usage
- Database connection pools
- Cache hit/miss ratios
- Network I/O patterns

**Business Metrics**
- Search query performance
- User engagement patterns
- Content ingestion rates
- API usage patterns

### Alerting Thresholds

**Critical Alerts**
- P95 response time > 1 second
- Error rate > 5%
- Database connection pool > 80%
- Cache hit rate < 70%

**Warning Alerts**
- P95 response time > 500ms
- Error rate > 2%
- Memory usage > 80%
- Disk usage > 85%

## Optimization Recommendations

### Application-Level Optimizations

**Database Queries**
- Implement query result caching
- Use prepared statements
- Optimize N+1 query patterns
- Implement connection pooling

**API Performance**
- Implement response compression
- Use efficient serialization
- Implement request/response caching
- Optimize payload sizes

**Frontend Performance**
- Implement code splitting
- Optimize bundle sizes
- Use lazy loading for components
- Implement service worker caching

### Infrastructure Optimizations

**Database Tuning**
- Optimize PostgreSQL configuration
- Implement read replicas for scaling
- Use connection pooling (PgBouncer)
- Regular maintenance scheduling

**Caching Strategy**
- Multi-layer caching architecture
- Cache invalidation strategies
- Preemptive cache warming
- Cache compression for large objects

**CDN Implementation**
- Global content distribution
- Optimized cache policies
- Image and asset optimization
- Edge computing capabilities

## Deployment and CI/CD Integration

### Performance Testing in CI/CD

```yaml
# GitHub Actions example
- name: Performance Tests
  run: |
    ./scripts/performance-test.sh api
    ./scripts/performance-regression-detection.sh
  env:
    API_URL: ${{ env.STAGING_API_URL }}
    WEB_URL: ${{ env.STAGING_WEB_URL }}
```

### Production Monitoring

**Continuous Monitoring**
- Real-time performance dashboards
- Automated alert notifications
- Performance trend analysis
- Capacity planning metrics

**Regular Maintenance**
- Weekly performance reviews
- Monthly baseline updates
- Quarterly optimization sprints
- Annual architecture reviews

## Troubleshooting Guide

### Common Performance Issues

**High Response Times**
1. Check database query performance
2. Verify cache hit rates
3. Analyze resource utilization
4. Review recent deployments

**High Error Rates**
1. Check application logs
2. Verify database connectivity
3. Analyze third-party service dependencies
4. Review rate limiting configurations

**Low Throughput**
1. Check connection pool settings
2. Verify resource limits
3. Analyze bottlenecks in the request pipeline
4. Review load balancer configurations

### Performance Debugging

**Tools and Commands**
```bash
# Real-time performance monitoring
htop
iotop
nethogs

# Database performance analysis
PGPASSWORD=pass ./scripts/db-performance-analysis.sh

# Cache performance analysis
redis-cli info memory
redis-cli info stats

# Application profiling
node --inspect apps/api/dist/main.js
```

## Best Practices

### Development Guidelines

**Code Review Checklist**
- Database query efficiency
- Cache implementation
- Error handling performance
- Resource cleanup

**Performance Testing**
- Test with realistic data volumes
- Include performance tests in PR validation
- Regular baseline updates
- Load testing before major releases

### Operations Guidelines

**Monitoring Setup**
- Comprehensive metrics collection
- Automated alerting
- Performance trend analysis
- Capacity planning

**Incident Response**
- Performance degradation playbooks
- Rollback procedures
- Communication protocols
- Post-incident analysis

## Conclusion

This performance optimization suite provides a comprehensive foundation for ensuring CodeSenseiSearch maintains optimal performance under various load conditions. Regular use of these tools and adherence to the guidelines will help maintain high application performance and user satisfaction.

For questions or support, refer to the individual component documentation or contact the development team.