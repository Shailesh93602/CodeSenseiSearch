-- Production Database Initialization Script
-- This script sets up the production database with optimizations and monitoring

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create application schema
CREATE SCHEMA IF NOT EXISTS app;

-- Set up connection pooling optimization
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.7;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_io_concurrency = 200;

-- Performance monitoring
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET pg_stat_statements.max = 10000;
ALTER SYSTEM SET pg_stat_statements.track = 'all';

-- Logging configuration for production
ALTER SYSTEM SET log_destination = 'stderr';
ALTER SYSTEM SET logging_collector = on;
ALTER SYSTEM SET log_directory = '/var/log/postgresql';
ALTER SYSTEM SET log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log';
ALTER SYSTEM SET log_rotation_age = '1d';
ALTER SYSTEM SET log_rotation_size = '100MB';
ALTER SYSTEM SET log_truncate_on_rotation = on;
ALTER SYSTEM SET log_min_duration_statement = 1000;
ALTER SYSTEM SET log_checkpoints = on;
ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;
ALTER SYSTEM SET log_lock_waits = on;
ALTER SYSTEM SET log_temp_files = 10240;

-- Security settings
ALTER SYSTEM SET ssl = on;
ALTER SYSTEM SET password_encryption = 'scram-sha-256';

-- Create monitoring user for health checks
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'monitoring') THEN
        CREATE ROLE monitoring WITH LOGIN PASSWORD 'monitoring_password_change_me';
    END IF;
END
$$;

-- Grant minimal permissions to monitoring user
GRANT CONNECT ON DATABASE codesenseisearch TO monitoring;
GRANT USAGE ON SCHEMA public TO monitoring;
GRANT SELECT ON pg_stat_database TO monitoring;
GRANT SELECT ON pg_stat_user_tables TO monitoring;
GRANT SELECT ON pg_stat_user_indexes TO monitoring;

-- Create replication user for read replicas
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'replicator') THEN
        CREATE ROLE replicator WITH LOGIN REPLICATION PASSWORD 'replication_password_change_me';
    END IF;
END
$$;

-- Create application database user with restricted permissions
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'codesenseisearch_app') THEN
        CREATE ROLE codesenseisearch_app WITH LOGIN PASSWORD 'app_password_change_me';
    END IF;
END
$$;

-- Grant application permissions
GRANT CONNECT ON DATABASE codesenseisearch TO codesenseisearch_app;
GRANT USAGE, CREATE ON SCHEMA public TO codesenseisearch_app;
GRANT USAGE, CREATE ON SCHEMA app TO codesenseisearch_app;

-- Create read-only user for reporting/analytics
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'codesenseisearch_readonly') THEN
        CREATE ROLE codesenseisearch_readonly WITH LOGIN PASSWORD 'readonly_password_change_me';
    END IF;
END
$$;

-- Grant read-only permissions
GRANT CONNECT ON DATABASE codesenseisearch TO codesenseisearch_readonly;
GRANT USAGE ON SCHEMA public TO codesenseisearch_readonly;
GRANT USAGE ON SCHEMA app TO codesenseisearch_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO codesenseisearch_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO codesenseisearch_readonly;

-- Set default permissions for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO codesenseisearch_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT ON TABLES TO codesenseisearch_readonly;

-- Create backup user
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'backup_user') THEN
        CREATE ROLE backup_user WITH LOGIN PASSWORD 'backup_password_change_me';
    END IF;
END
$$;

-- Grant backup permissions
GRANT CONNECT ON DATABASE codesenseisearch TO backup_user;
GRANT USAGE ON SCHEMA public TO backup_user;
GRANT USAGE ON SCHEMA app TO backup_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_user;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO backup_user;

-- Create function for database health check
CREATE OR REPLACE FUNCTION public.health_check()
RETURNS TABLE(
    component text,
    status text,
    details jsonb
) AS $$
BEGIN
    -- Check database connection
    RETURN QUERY SELECT 
        'database'::text,
        'healthy'::text,
        jsonb_build_object(
            'timestamp', now(),
            'version', version(),
            'uptime', current_timestamp - pg_postmaster_start_time()
        );
    
    -- Check extensions
    RETURN QUERY SELECT 
        'extensions'::text,
        CASE 
            WHEN COUNT(*) >= 6 THEN 'healthy'::text
            ELSE 'warning'::text
        END,
        jsonb_build_object(
            'installed_extensions', jsonb_agg(extname),
            'count', COUNT(*)
        )
    FROM pg_extension 
    WHERE extname IN ('vector', 'pg_stat_statements', 'pg_trgm', 'btree_gin', 'btree_gist', 'uuid-ossp');
    
    -- Check replication status
    RETURN QUERY SELECT 
        'replication'::text,
        CASE 
            WHEN COUNT(*) > 0 THEN 'active'::text
            ELSE 'none'::text
        END,
        jsonb_build_object(
            'active_replicas', COUNT(*),
            'replicas', jsonb_agg(
                jsonb_build_object(
                    'client_addr', client_addr,
                    'state', state,
                    'sync_state', sync_state
                )
            )
        )
    FROM pg_stat_replication;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on health check function
GRANT EXECUTE ON FUNCTION public.health_check() TO monitoring;
GRANT EXECUTE ON FUNCTION public.health_check() TO codesenseisearch_app;

-- Create function for performance monitoring
CREATE OR REPLACE FUNCTION public.performance_stats()
RETURNS TABLE(
    metric text,
    value numeric,
    unit text,
    description text
) AS $$
BEGIN
    -- Database size
    RETURN QUERY SELECT 
        'database_size'::text,
        pg_database_size(current_database())::numeric / (1024*1024*1024),
        'GB'::text,
        'Total database size'::text;
    
    -- Connection count
    RETURN QUERY SELECT 
        'active_connections'::text,
        COUNT(*)::numeric,
        'connections'::text,
        'Active database connections'::text
    FROM pg_stat_activity 
    WHERE state = 'active';
    
    -- Cache hit ratio
    RETURN QUERY SELECT 
        'cache_hit_ratio'::text,
        ROUND(
            100 * sum(blks_hit) / NULLIF(sum(blks_hit) + sum(blks_read), 0),
            2
        ),
        'percent'::text,
        'Buffer cache hit ratio'::text
    FROM pg_stat_database;
    
    -- Slow query count (queries > 1 second)
    RETURN QUERY SELECT 
        'slow_queries'::text,
        COUNT(*)::numeric,
        'queries'::text,
        'Number of slow queries (>1s) in the last hour'::text
    FROM pg_stat_statements 
    WHERE mean_exec_time > 1000
    AND last_exec > now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on performance stats function
GRANT EXECUTE ON FUNCTION public.performance_stats() TO monitoring;

-- Create indexes for common query patterns
-- Note: These will be created by Prisma migrations, but we define them here for reference

-- Full-text search indexes
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_content_fts 
--     ON documents USING gin(to_tsvector('english', content));

-- Vector similarity indexes
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_embedding_cosine 
--     ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_embedding_l2 
--     ON documents USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);

-- Common query indexes
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_created_at 
--     ON documents (created_at DESC);

-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_repository_id 
--     ON documents (repository_id);

-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_language 
--     ON documents (language);

-- Composite indexes for complex queries
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_repo_lang_created 
--     ON documents (repository_id, language, created_at DESC);

-- Partial indexes for active records
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_active 
--     ON documents (id) WHERE deleted_at IS NULL;

-- Create maintenance functions
CREATE OR REPLACE FUNCTION public.maintenance_vacuum_analyze()
RETURNS void AS $$
BEGIN
    -- Perform maintenance on all user tables
    FOR r IN (SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('public', 'app'))
    LOOP
        EXECUTE format('VACUUM ANALYZE %I.%I', r.schemaname, r.tablename);
    END LOOP;
    
    RAISE NOTICE 'Maintenance vacuum and analyze completed at %', now();
END;
$$ LANGUAGE plpgsql;

-- Create function to update table statistics
CREATE OR REPLACE FUNCTION public.update_statistics()
RETURNS void AS $$
BEGIN
    ANALYZE;
    RAISE NOTICE 'Statistics updated at %', now();
END;
$$ LANGUAGE plpgsql;

-- Create monitoring views
CREATE OR REPLACE VIEW public.v_database_size AS
SELECT 
    pg_size_pretty(pg_database_size(current_database())) as database_size,
    pg_database_size(current_database()) as database_size_bytes;

CREATE OR REPLACE VIEW public.v_table_sizes AS
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
FROM pg_tables 
WHERE schemaname IN ('public', 'app')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

CREATE OR REPLACE VIEW public.v_index_usage AS
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan,
    CASE 
        WHEN idx_scan = 0 THEN 'Unused'
        WHEN idx_scan < 50 THEN 'Low usage'
        ELSE 'Active'
    END as usage_status
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Grant access to monitoring views
GRANT SELECT ON public.v_database_size TO monitoring;
GRANT SELECT ON public.v_table_sizes TO monitoring;
GRANT SELECT ON public.v_index_usage TO monitoring;

-- Create admin functions (restricted access)
CREATE OR REPLACE FUNCTION admin.kill_long_running_queries(max_duration interval DEFAULT '1 hour')
RETURNS TABLE(killed_pid integer, query_start timestamp, query text) AS $$
DECLARE
    r record;
BEGIN
    FOR r IN 
        SELECT pid, query_start, query 
        FROM pg_stat_activity 
        WHERE state = 'active'
        AND query_start < now() - max_duration
        AND pid != pg_backend_pid()
        AND query NOT LIKE '%pg_stat_activity%'
    LOOP
        PERFORM pg_terminate_backend(r.pid);
        killed_pid := r.pid;
        query_start := r.query_start;
        query := r.query;
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create admin schema for administrative functions
CREATE SCHEMA IF NOT EXISTS admin;

-- Move admin function to admin schema
DROP FUNCTION IF EXISTS admin.kill_long_running_queries(interval);
CREATE OR REPLACE FUNCTION admin.kill_long_running_queries(max_duration interval DEFAULT '1 hour')
RETURNS TABLE(killed_pid integer, query_start timestamp, query text) AS $$
DECLARE
    r record;
BEGIN
    FOR r IN 
        SELECT pid, query_start, query 
        FROM pg_stat_activity 
        WHERE state = 'active'
        AND query_start < now() - max_duration
        AND pid != pg_backend_pid()
        AND query NOT LIKE '%pg_stat_activity%'
    LOOP
        PERFORM pg_terminate_backend(r.pid);
        killed_pid := r.pid;
        query_start := r.query_start;
        query := r.query;
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only superuser can execute admin functions
REVOKE ALL ON SCHEMA admin FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA admin FROM PUBLIC;

-- Create notification for monitoring
CREATE OR REPLACE FUNCTION notify_monitoring(message text, level text DEFAULT 'info')
RETURNS void AS $$
BEGIN
    PERFORM pg_notify('db_monitoring', json_build_object(
        'timestamp', extract(epoch from now()),
        'level', level,
        'message', message,
        'database', current_database()
    )::text);
END;
$$ LANGUAGE plpgsql;

-- Set up automatic statistics collection
DO $$
BEGIN
    -- This would typically be done via cron or pg_cron extension
    -- For now, we just create the necessary infrastructure
    
    -- Log completion
    PERFORM notify_monitoring('Production database initialization completed', 'info');
END
$$;

-- Configuration reminder
DO $$
BEGIN
    RAISE NOTICE 'Production database initialization completed';
    RAISE NOTICE 'Remember to:';
    RAISE NOTICE '1. Change all default passwords';
    RAISE NOTICE '2. Configure SSL certificates';
    RAISE NOTICE '3. Set up proper backup schedule';
    RAISE NOTICE '4. Configure monitoring alerts';
    RAISE NOTICE '5. Run VACUUM ANALYZE after data load';
END
$$;