-- Database Performance Optimization Scripts
-- Run these to optimize query performance and add necessary indexes

\timing on

-- =============================================
-- Index Creation for Performance
-- =============================================

-- Text search index for content
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_text_gin 
ON content USING gin(to_tsvector('english', content_text));

-- Composite index for filtered searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_type_language_created 
ON content(content_type, language, created_at DESC);

-- Vector similarity index (already exists but ensuring optimal settings)
DROP INDEX IF EXISTS idx_embeddings_vector_cosine;
CREATE INDEX CONCURRENTLY idx_embeddings_vector_cosine 
ON content_embeddings USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- User activity indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_searches_user_created
ON user_searches(user_id, created_at DESC);

-- Repository and content relationship index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_repository_created
ON content(repository_id, created_at DESC) WHERE repository_id IS NOT NULL;

-- =============================================
-- Performance Analysis Queries
-- =============================================

-- Analyze search query performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT c.*, ts_rank(to_tsvector('english', c.content_text), plainto_tsquery('javascript')) as rank
FROM content c
WHERE to_tsvector('english', c.content_text) @@ plainto_tsquery('javascript')
ORDER BY rank DESC
LIMIT 20;

-- Test vector search performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT c.*, 1 - (ce.embedding <=> '[0.1,0.2,0.3]'::vector) as similarity
FROM content c
JOIN content_embeddings ce ON c.id = ce.content_id
ORDER BY ce.embedding <=> '[0.1,0.2,0.3]'::vector
LIMIT 10;

-- Test hybrid search performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
WITH text_search AS (
  SELECT c.id, c.title, c.content_text,
         ts_rank(to_tsvector('english', c.content_text), plainto_tsquery('react hooks')) as text_score
  FROM content c
  WHERE to_tsvector('english', c.content_text) @@ plainto_tsquery('react hooks')
  ORDER BY text_score DESC
  LIMIT 50
),
vector_search AS (
  SELECT c.id, c.title, c.content_text,
         1 - (ce.embedding <=> '[0.1,0.2,0.3]'::vector) as vector_score
  FROM content c
  JOIN content_embeddings ce ON c.id = ce.content_id
  ORDER BY ce.embedding <=> '[0.1,0.2,0.3]'::vector
  LIMIT 50
)
SELECT COALESCE(t.id, v.id) as id,
       COALESCE(t.title, v.title) as title,
       COALESCE(t.content_text, v.content_text) as content_text,
       COALESCE(t.text_score, 0) as text_score,
       COALESCE(v.vector_score, 0) as vector_score,
       (COALESCE(t.text_score, 0) * 0.3 + COALESCE(v.vector_score, 0) * 0.7) as combined_score
FROM text_search t
FULL OUTER JOIN vector_search v ON t.id = v.id
ORDER BY combined_score DESC
LIMIT 20;

-- =============================================
-- Table Statistics Update
-- =============================================

ANALYZE content;
ANALYZE content_embeddings;
ANALYZE repositories;
ANALYZE users;
ANALYZE user_searches;

-- =============================================
-- Performance Monitoring Queries
-- =============================================

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

-- Check slow queries (if pg_stat_statements is enabled)
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  rows
FROM pg_stat_statements
WHERE query LIKE '%content%'
ORDER BY mean_time DESC
LIMIT 10;

-- Check table sizes
SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size(tablename::regclass)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(tablename::regclass) DESC;

-- =============================================
-- Connection and Performance Settings
-- =============================================

-- Show current settings
SELECT name, setting, unit, context, boot_val, reset_val
FROM pg_settings
WHERE name IN (
  'shared_buffers',
  'effective_cache_size',
  'maintenance_work_mem',
  'checkpoint_completion_target',
  'wal_buffers',
  'default_statistics_target',
  'random_page_cost',
  'effective_io_concurrency',
  'max_connections'
);

-- Performance recommendations (run as superuser if needed)
-- ALTER SYSTEM SET shared_buffers = '256MB';
-- ALTER SYSTEM SET effective_cache_size = '1GB';
-- ALTER SYSTEM SET maintenance_work_mem = '64MB';
-- ALTER SYSTEM SET checkpoint_completion_target = 0.9;
-- ALTER SYSTEM SET wal_buffers = '16MB';
-- ALTER SYSTEM SET default_statistics_target = 100;
-- ALTER SYSTEM SET random_page_cost = 1.1;
-- ALTER SYSTEM SET effective_io_concurrency = 200;

\timing off

-- Performance test results summary
SELECT 'Database optimization complete. Monitor query performance and adjust indexes as needed.' as status;