-- Initialize PostgreSQL with required extensions for CodeSenseiSearch
-- This script will be executed when the PostgreSQL container starts

-- Enable pgvector extension (will be installed manually if needed)
-- For Phase 2, we don't actually need pgvector yet, but preparing for Phase 3
-- CREATE EXTENSION IF NOT EXISTS vector;

-- Enable other useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create indexes for better text search performance
-- These will be useful for our content search functionality

-- Note: pgvector extension will be added in Phase 3 when we implement embeddings