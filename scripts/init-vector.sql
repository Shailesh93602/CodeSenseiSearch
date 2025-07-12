-- Initialize pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create a function to calculate cosine similarity (useful for semantic search)
CREATE OR REPLACE FUNCTION cosine_similarity(a vector, b vector)
RETURNS float AS $$
BEGIN
    RETURN 1 - (a <=> b);
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE;

-- Create indexes for better performance (will be applied after migrations)
-- These are here for reference, actual indexes created via Prisma migrations