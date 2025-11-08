-- Database initialization script for production
-- This script sets up the database with required extensions and initial configuration

-- Enable necessary PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Set up database configuration for optimal performance
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_io_concurrency = 200;

-- Create application user with limited privileges (if not using Docker env user)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'codesenseisearch_app') THEN
        CREATE ROLE codesenseisearch_app WITH LOGIN PASSWORD 'change_me_in_production';
        GRANT CONNECT ON DATABASE codesenseisearch TO codesenseisearch_app;
        GRANT USAGE ON SCHEMA public TO codesenseisearch_app;
        GRANT CREATE ON SCHEMA public TO codesenseisearch_app;
    END IF;
END
$$;

-- Log successful initialization
INSERT INTO pg_stat_user_tables (schemaname, relname) 
VALUES ('public', 'initialization_log') 
ON CONFLICT DO NOTHING;