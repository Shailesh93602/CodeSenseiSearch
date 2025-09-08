# CodeSenseiSearch Phase 2 Database Migration Guide

This guide covers the enhanced database schema for Phase 2 content ingestion pipeline.

## Overview

Phase 2 introduces a comprehensive database schema designed for:
- Multi-source content ingestion (GitHub, StackOverflow)
- Vector embeddings storage for semantic search
- Job queue management for distributed processing
- Content chunking and deduplication
- Rate limiting and cost tracking

## Schema Architecture

### Core Entities

#### Sources (`sources`)
- Content sources like GitHub, StackOverflow
- Rate limiting configuration
- Source-specific settings

#### Repositories (`repositories`)
- GitHub repository metadata
- Ingestion status tracking
- Content statistics

#### Questions (`questions`)
- StackOverflow question metadata
- Tag-based categorization
- Answer statistics

#### Content (`contents`)
- Unified content storage
- File and Q&A support
- Deduplication via content hashing

#### ContentChunk (`content_chunks`)
- Text chunks optimized for embeddings
- Positional metadata
- Embedding status tracking

#### Embedding (`embeddings`)
- Vector embeddings using pgvector
- Cost and token tracking
- Model versioning

#### IngestionJob (`ingestion_jobs`)
- Distributed job processing
- Progress tracking
- Error handling and retries

## Migration Process

### 1. Backup Current Database
```bash
# Create backup
pg_dump $DATABASE_URL > backup_phase1.sql

# Or using Docker
docker exec -t postgres_container pg_dump -U username database_name > backup.sql
```

### 2. Run Phase 2 Migration
```bash
# Validate schema
cd apps/api
npx prisma validate

# Generate Prisma client
npx prisma generate

# Apply migration (when DATABASE_URL is configured)
npx prisma migrate dev --name phase2_enhanced_schema

# Or apply raw SQL migration
psql $DATABASE_URL < prisma/migrations/001_phase2_enhanced_schema.sql
```

### 3. Seed Development Data
```bash
# Run seed script
npm run db:seed

# Or manually
npx tsx prisma/seed.ts
```

### 4. Verify Migration
```bash
# Check database structure
npx prisma studio

# Verify tables created
psql $DATABASE_URL -c "\\dt"

# Check sample data
psql $DATABASE_URL -c "SELECT name, type FROM sources;"
```

## Schema Features

### Indexing Strategy
- **Performance**: Optimized indexes for search queries
- **Vector Search**: IVFFlat index for embedding similarity
- **Filtering**: Composite indexes for language, type, status

### Data Integrity
- **Foreign Keys**: Cascading deletes for data consistency
- **Constraints**: Unique constraints for deduplication
- **Validation**: Enum types for status fields

### Scalability
- **Partitioning Ready**: Large tables designed for future partitioning
- **Denormalization**: Content statistics for fast queries
- **Caching**: Hash-based deduplication

## Development Workflow

### Local Development
1. **Docker Setup**: Use provided docker-compose for PostgreSQL + pgvector
2. **Environment**: Configure DATABASE_URL in .env
3. **Migration**: Run `npm run db:migrate`
4. **Seeding**: Run `npm run db:seed`
5. **Studio**: Use `npm run db:studio` for GUI

### Testing
- **Unit Tests**: Mock Prisma client for service tests
- **Integration**: Use test database with seed data
- **E2E**: Full pipeline tests with Docker

## Performance Considerations

### Vector Operations
- **Embedding Dimensions**: 1536 (OpenAI text-embedding-3-small)
- **Index Type**: IVFFlat for similarity search
- **Batch Operations**: Bulk insert for better performance

### Query Optimization
- **Eager Loading**: Use Prisma includes for related data
- **Pagination**: Cursor-based for large result sets
- **Filtering**: Index-backed where clauses

### Cost Management
- **Token Tracking**: Monitor OpenAI API usage
- **Caching**: SHA256-based embedding cache
- **Rate Limiting**: Configurable per-source limits

## Rollback Procedure

If migration issues occur:

```bash
# 1. Stop application
pm2 stop codesenseisearch-api

# 2. Run rollback script
psql $DATABASE_URL < prisma/migrations/rollback_phase2.sql

# 3. Restore backup
psql $DATABASE_URL < backup_phase1.sql

# 4. Reset Prisma state
npx prisma migrate reset --force

# 5. Restart with Phase 1 schema
npm run start:prod
```

## Monitoring

### Migration Health Checks
```sql
-- Check table creation
SELECT schemaname, tablename, tableowner 
FROM pg_tables 
WHERE schemaname = 'public';

-- Verify constraints
SELECT conname, contype 
FROM pg_constraint 
WHERE connamespace = 'public'::regnamespace;

-- Check indexes
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public';
```

### Data Validation
```sql
-- Source configuration
SELECT name, type, "isActive", "rateLimit" FROM sources;

-- Sample repositories
SELECT "fullName", language, "starCount", "ingestionStatus" 
FROM repositories LIMIT 5;

-- Job queue status
SELECT "jobType", status, COUNT(*) 
FROM ingestion_jobs 
GROUP BY "jobType", status;
```

## Next Steps

After successful migration:

1. **GitHub API Integration**: Implement repository discovery
2. **StackOverflow API**: Question/answer ingestion
3. **Worker System**: Process ingestion jobs
4. **Embedding Pipeline**: Generate vector embeddings
5. **Search Enhancement**: Hybrid search with filters

## Troubleshooting

### Common Issues

#### Missing pgvector Extension
```sql
-- Install extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify installation
SELECT * FROM pg_extension WHERE extname = 'vector';
```

#### Permission Issues
```sql
-- Grant necessary permissions
GRANT ALL PRIVILEGES ON DATABASE your_db TO your_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO your_user;
```

#### Migration Conflicts
```bash
# Reset migration state
npx prisma migrate reset --force

# Apply specific migration
npx prisma migrate resolve --applied "migration_name"
```

### Performance Issues

#### Slow Vector Queries
```sql
-- Rebuild vector index
DROP INDEX IF EXISTS embeddings_vector_cosine_idx;
CREATE INDEX embeddings_vector_cosine_idx 
  ON embeddings USING ivfflat (vector vector_cosine_ops) 
  WITH (lists = 100);
```

#### Large Table Maintenance
```sql
-- Analyze statistics
ANALYZE repositories;
ANALYZE contents;
ANALYZE content_chunks;

-- Vacuum for performance
VACUUM ANALYZE;
```

## Support

For migration issues:
1. Check logs: `tail -f logs/migration.log`
2. Verify environment: `env | grep DATABASE`
3. Test connection: `psql $DATABASE_URL -c "SELECT version();"`
4. Review documentation: Phase 2 database design document

Remember to always test migrations in a development environment first!