-- Database Performance Optimization Queries
-- CodeSenseiSearch Performance Monitoring and Optimization

-- ============================================
-- INDEX ANALYSIS AND RECOMMENDATIONS
-- ============================================

-- Check for missing indexes on frequently queried columns
SELECT 
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation,
    (n_distinct * correlation) as priority_score
FROM pg_stats 
WHERE schemaname = 'public'
    AND n_distinct > 100  -- High cardinality columns
    AND correlation < 0.1 -- Low correlation with physical storage
ORDER BY priority_score DESC;

-- Identify unused indexes
SELECT 
    i.indexrelid,
    i.indrelid,
    n.nspname as schema_name,
    ci.relname as index_name,
    ct.relname as table_name,
    pg_size_pretty(pg_relation_size(i.indexrelid)) as index_size,
    s.idx_scan,
    s.idx_tup_read,
    s.idx_tup_fetch
FROM pg_index i
JOIN pg_class ci ON ci.oid = i.indexrelid
JOIN pg_class ct ON ct.oid = i.indrelid
JOIN pg_namespace n ON n.oid = ci.relnamespace
LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.indexrelid
WHERE n.nspname = 'public'
    AND NOT i.indisunique
    AND (s.idx_scan < 10 OR s.idx_scan IS NULL)
ORDER BY pg_relation_size(i.indexrelid) DESC;

-- ============================================
-- SEARCH PERFORMANCE OPTIMIZATION
-- ============================================

-- Optimize content search queries
-- Create GIN index for full-text search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_fts 
ON "Content" USING gin(to_tsvector('english', title || ' ' || content));

-- Create composite index for filtered searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_search_filters 
ON "Content" (language, source, "createdAt") 
WHERE "isActive" = true;

-- Create index for embedding similarity searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_embedding_cosine 
ON "Content" USING ivfflat (embedding vector_cosine_ops);

-- Create partial index for recent content
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_recent 
ON "Content" ("createdAt" DESC) 
WHERE "createdAt" > NOW() - INTERVAL '30 days';

-- ============================================
-- USER AND FAVORITES OPTIMIZATION
-- ============================================

-- Optimize user favorites queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_favorites_user_content 
ON "UserFavorite" ("userId", "contentId", "createdAt");

-- Create index for user search history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_history_user_time 
ON "SearchHistory" ("userId", "searchedAt" DESC);

-- ============================================
-- PERFORMANCE MONITORING QUERIES
-- ============================================

-- Query to find slow queries
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    stddev_time,
    rows,
    100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements 
WHERE mean_time > 100  -- Queries taking more than 100ms on average
ORDER BY total_time DESC
LIMIT 20;

-- Table bloat analysis
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size,
    n_tup_ins + n_tup_upd + n_tup_del as total_writes,
    n_tup_upd + n_tup_del as modifications,
    CASE 
        WHEN n_tup_ins + n_tup_upd + n_tup_del > 0 
        THEN round((n_tup_upd + n_tup_del)::numeric / (n_tup_ins + n_tup_upd + n_tup_del)::numeric * 100, 2)
        ELSE 0 
    END as modification_percent
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Connection and lock monitoring
SELECT 
    datname,
    count(*) as connections,
    count(*) FILTER (WHERE state = 'active') as active,
    count(*) FILTER (WHERE state = 'idle') as idle,
    count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
FROM pg_stat_activity 
WHERE datname IS NOT NULL
GROUP BY datname;

-- ============================================
-- VACUUM AND MAINTENANCE OPTIMIZATION
-- ============================================

-- Identify tables that need vacuuming
SELECT 
    schemaname,
    tablename,
    n_tup_ins,
    n_tup_upd,
    n_tup_del,
    n_dead_tup,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze,
    CASE 
        WHEN n_dead_tup > 0 AND (n_tup_ins + n_tup_upd + n_tup_del) > 0
        THEN round(n_dead_tup::numeric / (n_tup_ins + n_tup_upd + n_tup_del)::numeric * 100, 2)
        ELSE 0
    END as dead_tuple_percent
FROM pg_stat_user_tables
WHERE schemaname = 'public'
    AND n_dead_tup > 1000  -- Tables with significant dead tuples
ORDER BY n_dead_tup DESC;

-- ============================================
-- SEARCH-SPECIFIC OPTIMIZATIONS
-- ============================================

-- Optimize embedding similarity search
-- This query should be used as a template for the application
WITH similar_content AS (
    SELECT 
        id,
        title,
        content,
        language,
        source,
        embedding <-> $1::vector as distance
    FROM "Content"
    WHERE "isActive" = true
        AND ($2::text IS NULL OR language = $2)
        AND ($3::text IS NULL OR source = $3)
    ORDER BY embedding <-> $1::vector
    LIMIT 50
),
text_search AS (
    SELECT 
        id,
        title,
        content,
        language,
        source,
        ts_rank_cd(to_tsvector('english', title || ' ' || content), plainto_tsquery('english', $4)) as text_rank
    FROM "Content"
    WHERE "isActive" = true
        AND to_tsvector('english', title || ' ' || content) @@ plainto_tsquery('english', $4)
        AND ($2::text IS NULL OR language = $2)
        AND ($3::text IS NULL OR source = $3)
    ORDER BY text_rank DESC
    LIMIT 50
)
-- Combine results with weighted scoring
SELECT 
    COALESCE(s.id, t.id) as id,
    COALESCE(s.title, t.title) as title,
    COALESCE(s.content, t.content) as content,
    COALESCE(s.language, t.language) as language,
    COALESCE(s.source, t.source) as source,
    COALESCE(1.0 - s.distance, 0) * 0.6 + COALESCE(t.text_rank, 0) * 0.4 as combined_score
FROM similar_content s
FULL OUTER JOIN text_search t ON s.id = t.id
ORDER BY combined_score DESC
LIMIT 20;

-- ============================================
-- MATERIALIZED VIEWS FOR PERFORMANCE
-- ============================================

-- Create materialized view for content statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS content_stats_mv AS
SELECT 
    language,
    source,
    COUNT(*) as total_content,
    COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '7 days') as recent_content,
    AVG(LENGTH(content)) as avg_content_length,
    MAX("createdAt") as latest_content_date
FROM "Content"
WHERE "isActive" = true
GROUP BY language, source;

-- Create unique index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_stats_mv_pk 
ON content_stats_mv (language, source);

-- Create materialized view for popular searches
CREATE MATERIALIZED VIEW IF NOT EXISTS popular_searches_mv AS
SELECT 
    query,
    COUNT(*) as search_count,
    COUNT(DISTINCT "userId") as unique_users,
    MAX("searchedAt") as last_searched,
    AVG(EXTRACT(EPOCH FROM ("searchedAt" - LAG("searchedAt") OVER (PARTITION BY "userId" ORDER BY "searchedAt")))) as avg_time_between_searches
FROM "SearchHistory"
WHERE "searchedAt" > NOW() - INTERVAL '30 days'
GROUP BY query
HAVING COUNT(*) > 5
ORDER BY search_count DESC;

-- Refresh commands for materialized views (to be run periodically)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY content_stats_mv;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY popular_searches_mv;