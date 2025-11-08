-- Database Index Creation and Optimization Script
-- This script creates optimized indexes for CodeSenseiSearch production workloads

-- ==============================================
-- Performance Indexes for Search Operations
-- ==============================================

-- Full-text search indexes for content
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_content_gin 
    ON documents USING gin(to_tsvector('english', content));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_title_gin 
    ON documents USING gin(to_tsvector('english', title));

-- Combined title and content search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_title_content_gin 
    ON documents USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')));

-- ==============================================
-- Vector Similarity Indexes
-- ==============================================

-- Cosine similarity index for vector search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_embedding_cosine 
    ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- L2 distance index for vector search  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_embedding_l2 
    ON documents USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);

-- Inner product index for vector search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_embedding_inner_product 
    ON documents USING ivfflat (embedding vector_ip_ops) WITH (lists = 100);

-- ==============================================
-- Query Performance Indexes
-- ==============================================

-- Primary query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_created_at_desc 
    ON documents (created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_updated_at_desc 
    ON documents (updated_at DESC) WHERE deleted_at IS NULL;

-- Repository-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_repository_id 
    ON documents (repository_id) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_repo_created 
    ON documents (repository_id, created_at DESC) WHERE deleted_at IS NULL;

-- Language-based filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_language 
    ON documents (language) WHERE deleted_at IS NULL AND language IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_lang_created 
    ON documents (language, created_at DESC) WHERE deleted_at IS NULL AND language IS NOT NULL;

-- File type filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_file_type 
    ON documents (file_type) WHERE deleted_at IS NULL AND file_type IS NOT NULL;

-- Content type and source filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_content_type 
    ON documents (content_type) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_source_type 
    ON documents (source_type) WHERE deleted_at IS NULL;

-- ==============================================
-- Composite Indexes for Complex Queries
-- ==============================================

-- Multi-dimensional filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_repo_lang_type_created 
    ON documents (repository_id, language, content_type, created_at DESC) 
    WHERE deleted_at IS NULL;

-- Search with filters
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_lang_type_created 
    ON documents (language, content_type, created_at DESC) 
    WHERE deleted_at IS NULL;

-- Popular content queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_popularity_created 
    ON documents (popularity_score DESC, created_at DESC) 
    WHERE deleted_at IS NULL AND popularity_score > 0;

-- ==============================================
-- Repository Table Indexes
-- ==============================================

-- Repository queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_name_gin 
    ON repositories USING gin(to_tsvector('english', name));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_description_gin 
    ON repositories USING gin(to_tsvector('english', description))
    WHERE description IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_language 
    ON repositories (primary_language) WHERE primary_language IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_stars_desc 
    ON repositories (stars_count DESC) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_updated_desc 
    ON repositories (updated_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_active 
    ON repositories (is_active, updated_at DESC) WHERE deleted_at IS NULL;

-- GitHub-specific indexes
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_github_unique 
    ON repositories (github_id) WHERE source_type = 'github' AND deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_owner_name 
    ON repositories (owner, name) WHERE deleted_at IS NULL;

-- ==============================================
-- User and Authentication Indexes
-- ==============================================

-- User table indexes
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_unique 
    ON users (email) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_github_id_unique 
    ON users (github_id) WHERE github_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_at 
    ON users (created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_last_login 
    ON users (last_login_at DESC) WHERE deleted_at IS NULL;

-- Session indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_user_id 
    ON sessions (user_id) WHERE expires_at > now();

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_expires_at 
    ON sessions (expires_at);

-- ==============================================
-- Search History and Analytics Indexes
-- ==============================================

-- Search queries tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_queries_created_at 
    ON search_queries (created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_queries_user_id 
    ON search_queries (user_id, created_at DESC) WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_queries_query_gin 
    ON search_queries USING gin(to_tsvector('english', query));

-- Popular searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_queries_frequency 
    ON search_queries (query, created_at DESC);

-- Click tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_click_events_document_id 
    ON click_events (document_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_click_events_user_id 
    ON click_events (user_id, created_at DESC) WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_click_events_search_query_id 
    ON click_events (search_query_id) WHERE search_query_id IS NOT NULL;

-- ==============================================
-- Background Job and Queue Indexes
-- ==============================================

-- Job processing indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_status_created 
    ON jobs (status, created_at) WHERE status IN ('pending', 'running');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_type_status 
    ON jobs (job_type, status) WHERE status != 'completed';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_scheduled_at 
    ON jobs (scheduled_at) WHERE scheduled_at IS NOT NULL AND status = 'pending';

-- Failed job analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_failed_created 
    ON jobs (created_at DESC) WHERE status = 'failed';

-- ==============================================
-- Embedding and AI Model Indexes
-- ==============================================

-- Embedding metadata
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_model_version 
    ON embeddings (model, version, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_document_id 
    ON embeddings (document_id);

-- Content hash for deduplication
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_content_hash 
    ON embeddings (content_hash) WHERE content_hash IS NOT NULL;

-- ==============================================
-- Performance Monitoring Indexes
-- ==============================================

-- API metrics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_metrics_endpoint_timestamp 
    ON api_metrics (endpoint, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_metrics_response_time 
    ON api_metrics (response_time DESC, timestamp DESC) WHERE response_time > 1000;

-- Error tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_error_logs_created_at 
    ON error_logs (created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_error_logs_level_created 
    ON error_logs (level, created_at DESC) WHERE level IN ('error', 'critical');

-- ==============================================
-- Partial Indexes for Efficiency
-- ==============================================

-- Active content only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_active_created 
    ON documents (created_at DESC) 
    WHERE deleted_at IS NULL AND is_active = true;

-- Public repositories only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_public_stars 
    ON repositories (stars_count DESC) 
    WHERE is_private = false AND deleted_at IS NULL;

-- Recent content (last 30 days)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_recent 
    ON documents (created_at DESC) 
    WHERE created_at > (now() - interval '30 days') AND deleted_at IS NULL;

-- High-quality content
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_high_quality 
    ON documents (popularity_score DESC, created_at DESC) 
    WHERE popularity_score > 10 AND deleted_at IS NULL;

-- ==============================================
-- Specialized Search Indexes
-- ==============================================

-- Code-specific searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_code_content 
    ON documents USING gin(to_tsvector('simple', content))
    WHERE content_type = 'code';

-- Documentation searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_docs_title_content 
    ON documents USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')))
    WHERE content_type IN ('markdown', 'documentation');

-- ==============================================
-- Foreign Key Constraint Indexes
-- ==============================================

-- These are automatically created by PostgreSQL for foreign keys,
-- but we explicitly define them for clarity and optimization

-- Document relationships
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_repository_id_fk 
    ON documents (repository_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_user_id_fk 
    ON documents (created_by) WHERE created_by IS NOT NULL;

-- Repository relationships
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_user_id_fk 
    ON repositories (owner_id) WHERE owner_id IS NOT NULL;

-- Search relationships
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_queries_user_id_fk 
    ON search_queries (user_id) WHERE user_id IS NOT NULL;

-- Click event relationships
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_click_events_document_id_fk 
    ON click_events (document_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_click_events_user_id_fk 
    ON click_events (user_id) WHERE user_id IS NOT NULL;

-- ==============================================
-- Index Maintenance Functions
-- ==============================================

-- Function to analyze index usage
CREATE OR REPLACE FUNCTION analyze_index_usage()
RETURNS TABLE(
    schema_name text,
    table_name text,
    index_name text,
    scans bigint,
    tuples_read bigint,
    tuples_fetched bigint,
    size_mb numeric,
    usage_status text
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.schemaname::text,
        s.tablename::text,
        s.indexrelname::text,
        s.idx_scan,
        s.idx_tup_read,
        s.idx_tup_fetch,
        ROUND(pg_relation_size(s.indexrelid) / 1024.0 / 1024.0, 2) as size_mb,
        CASE 
            WHEN s.idx_scan = 0 THEN 'UNUSED'
            WHEN s.idx_scan < 100 THEN 'LOW_USAGE'
            WHEN s.idx_scan < 1000 THEN 'MODERATE_USAGE'
            ELSE 'HIGH_USAGE'
        END::text as usage_status
    FROM pg_stat_user_indexes s
    JOIN pg_index i ON s.indexrelid = i.indexrelid
    WHERE NOT i.indisunique  -- Exclude unique indexes (usually necessary)
    ORDER BY s.idx_scan ASC, pg_relation_size(s.indexrelid) DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to find duplicate indexes
CREATE OR REPLACE FUNCTION find_duplicate_indexes()
RETURNS TABLE(
    schema_name text,
    table_name text,
    duplicate_indexes text[]
) AS $$
BEGIN
    RETURN QUERY
    WITH index_definitions AS (
        SELECT 
            schemaname,
            tablename,
            indexname,
            string_agg(attname, ',' ORDER BY attnum) as columns
        FROM pg_index i
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_class idx ON idx.oid = i.indexrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
        WHERE n.nspname NOT IN ('information_schema', 'pg_catalog')
        GROUP BY schemaname, tablename, indexname
    )
    SELECT 
        id1.schemaname::text,
        id1.tablename::text,
        array_agg(id1.indexname)::text[]
    FROM index_definitions id1
    JOIN index_definitions id2 ON (
        id1.schemaname = id2.schemaname 
        AND id1.tablename = id2.tablename 
        AND id1.columns = id2.columns 
        AND id1.indexname < id2.indexname
    )
    GROUP BY id1.schemaname, id1.tablename, id1.columns
    HAVING count(*) > 1;
END;
$$ LANGUAGE plpgsql;

-- Function to recommend missing indexes
CREATE OR REPLACE FUNCTION recommend_indexes()
RETURNS TABLE(
    table_name text,
    column_name text,
    recommendation text,
    estimated_benefit text
) AS $$
BEGIN
    -- This is a simplified version - in practice, you'd analyze pg_stat_statements
    RETURN QUERY
    SELECT 
        'documents'::text,
        'content'::text,
        'Consider GIN index for full-text search'::text,
        'High - if doing text searches'::text
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'documents' 
        AND indexdef LIKE '%gin%' 
        AND indexdef LIKE '%content%'
    );
END;
$$ LANGUAGE plpgsql;

-- ==============================================
-- Index Statistics and Monitoring
-- ==============================================

-- Create view for index monitoring
CREATE OR REPLACE VIEW v_index_stats AS
SELECT 
    schemaname,
    tablename,
    indexrelname as index_name,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched,
    pg_size_pretty(pg_relation_size(indexrelid)) as size,
    CASE 
        WHEN idx_scan = 0 THEN 'Never used'
        WHEN idx_scan < 50 THEN 'Rarely used'
        WHEN idx_scan < 500 THEN 'Moderately used'
        ELSE 'Frequently used'
    END as usage_frequency
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Grant permissions for monitoring
GRANT SELECT ON v_index_stats TO monitoring;
GRANT EXECUTE ON FUNCTION analyze_index_usage() TO monitoring;
GRANT EXECUTE ON FUNCTION find_duplicate_indexes() TO monitoring;
GRANT EXECUTE ON FUNCTION recommend_indexes() TO monitoring;

-- ==============================================
-- Completion Notice
-- ==============================================

DO $$
BEGIN
    RAISE NOTICE 'Index creation script completed';
    RAISE NOTICE 'Created % indexes for optimal query performance', 
        (SELECT count(*) FROM pg_indexes WHERE schemaname NOT IN ('information_schema', 'pg_catalog'));
    RAISE NOTICE 'Run ANALYZE after data load to update statistics';
    RAISE NOTICE 'Use analyze_index_usage() function to monitor index effectiveness';
END
$$;