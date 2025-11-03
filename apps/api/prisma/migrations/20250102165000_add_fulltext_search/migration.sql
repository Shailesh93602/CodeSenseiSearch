-- Full-text search enhancement for CodeSenseiSearch
-- This migration adds PostgreSQL full-text search capabilities to content tables

-- Add full-text search columns to Content table
ALTER TABLE "contents" ADD COLUMN "search_vector" tsvector;
ALTER TABLE "contents" ADD COLUMN "title_vector" tsvector;

-- Add full-text search column to ContentChunk table  
ALTER TABLE "content_chunks" ADD COLUMN "search_vector" tsvector;

-- Create function to update search vectors for Content
CREATE OR REPLACE FUNCTION update_content_search_vector() RETURNS trigger AS $$
BEGIN
  -- Combine title and content for full search vector
  NEW.search_vector := 
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B');
  
  -- Title-only search vector for title-specific searches
  NEW.title_vector := to_tsvector('english', coalesce(NEW.title, ''));
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function to update search vectors for ContentChunk
CREATE OR REPLACE FUNCTION update_chunk_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW."chunkText", ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to automatically update search vectors
CREATE TRIGGER update_content_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, content
  ON "contents"
  FOR EACH ROW
  EXECUTE FUNCTION update_content_search_vector();

CREATE TRIGGER update_chunk_search_vector_trigger
  BEFORE INSERT OR UPDATE OF "chunkText"
  ON "content_chunks" 
  FOR EACH ROW
  EXECUTE FUNCTION update_chunk_search_vector();

-- Create GIN indexes for fast full-text search
CREATE INDEX idx_contents_search_vector ON "contents" USING GIN(search_vector);
CREATE INDEX idx_contents_title_vector ON "contents" USING GIN(title_vector);
CREATE INDEX idx_content_chunks_search_vector ON "content_chunks" USING GIN(search_vector);

-- Create composite indexes for filtered searches
CREATE INDEX idx_contents_language_search ON "contents" USING GIN(language, search_vector);
CREATE INDEX idx_contents_type_search ON "contents" USING GIN("contentType", search_vector);

-- Update existing records to populate search vectors
UPDATE "contents" SET 
  search_vector = 
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B'),
  title_vector = to_tsvector('english', coalesce(title, ''));

UPDATE "content_chunks" SET 
  search_vector = to_tsvector('english', coalesce("chunkText", ''));

-- Create helper function for ranking search results
CREATE OR REPLACE FUNCTION search_rank(
  query_text text,
  search_vector tsvector,
  title_vector tsvector DEFAULT NULL
) RETURNS real AS $$
DECLARE
  query tsquery;
  title_boost real := 2.0;
  content_boost real := 1.0;
BEGIN
  -- Parse the query text into tsquery
  query := plainto_tsquery('english', query_text);
  
  -- Calculate weighted rank
  IF title_vector IS NOT NULL THEN
    RETURN 
      (ts_rank(title_vector, query) * title_boost) +
      (ts_rank(search_vector, query) * content_boost);
  ELSE
    RETURN ts_rank(search_vector, query);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create function for hybrid search combining BM25-like scoring with filters
CREATE OR REPLACE FUNCTION search_content(
  query_text text,
  language_filter text DEFAULT NULL,
  content_type_filter text DEFAULT NULL,
  repository_filter text DEFAULT NULL,
  limit_count integer DEFAULT 50,
  offset_count integer DEFAULT 0
) RETURNS TABLE (
  id text,
  title text,
  content text,
  language text,
  content_type text,
  repository_name text,
  rank real
) AS $$
DECLARE
  query tsquery;
BEGIN
  query := plainto_tsquery('english', query_text);
  
  RETURN QUERY
  SELECT 
    c.id,
    c.title,
    LEFT(c.content, 500) as content, -- Truncate for performance
    c.language,
    c."contentType"::text as content_type,
    r."fullName" as repository_name,
    search_rank(query_text, c.search_vector, c.title_vector) as rank
  FROM "contents" c
  LEFT JOIN "repositories" r ON c."repositoryId" = r.id
  WHERE 
    c.search_vector @@ query
    AND (language_filter IS NULL OR c.language = language_filter)
    AND (content_type_filter IS NULL OR c."contentType"::text = content_type_filter)
    AND (repository_filter IS NULL OR r."fullName" = repository_filter)
  ORDER BY rank DESC, c."createdAt" DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$ LANGUAGE plpgsql;