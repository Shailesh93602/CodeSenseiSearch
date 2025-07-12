# CodeSenseiSearch - AI Agent Instructions

## Project Overview
This is an AI-powered semantic search engine for developer content, built with a TypeScript-first stack following a phased delivery approach. The system ingests developer content (GitHub repos, StackOverflow), creates embeddings, and provides hybrid search with reranking.

## Architecture & Key Components

### Monorepo Structure (Planned)
```
apps/
├── web/          # Next.js frontend (App Router + Tailwind + shadcn UI)
└── api/          # NestJS backend (REST/GraphQL endpoints)
packages/         # Shared utilities and types
```

### Tech Stack
- **Frontend**: Next.js (App Router), React, Tailwind, shadcn UI, Monaco Editor
- **Backend**: NestJS with TypeScript, REST/GraphQL endpoints
- **Database**: PostgreSQL + pgvector extension (or Qdrant for vectors)
- **ORM**: Prisma (preferred for DX) or TypeORM
- **Workers**: BullMQ + Redis for async ingestion and embedding jobs
- **Embeddings**: OpenAI text-embedding-3 (cached by SHA256)
- **Search**: Hybrid approach (BM25 + vector similarity + LLM reranking)

## Development Workflow

### Phase-Based Development
Follow the 8-phase delivery plan with **production-ready iterations**:
1. **Phase 0**: Project scaffolding + monorepo setup
2. **Phase 1**: Landing page + search UI with mocked results
3. **Phase 2**: Content ingestion pipeline (GitHub repos + StackOverflow)
4. **Phase 3**: Vector embeddings + basic semantic search
5. **Phase 4**: Hybrid search + reranking + filters
6. **Phase 5**: Authentication + personalization
7. **Phase 6**: Production deployment + monitoring
8. **Phase 7**: SEO content + documentation

### Todo Management System
- **Master Tracker**: `todos/master-tracker.md` - Overall project progress and phase status
- **Phase Todos**: `todos/phase-X.md` - Detailed tasks, acceptance criteria, and estimates
- **Templates**: `todos/templates/` - Consistent todo structure for new phases
- **Update Rule**: After each iteration, update todos and master tracker before proceeding

### Iteration Strategy
1. **Ship Early**: Each phase produces deployable, functional increment
2. **Measure**: Collect metrics and user feedback after deployment
3. **Iterate**: Update todos based on learnings before advancing
4. **Quality Gates**: Meet production readiness criteria before next phase

### Key Commands (When Implemented)
- `pnpm dev` - Start all services locally
- `pnpm build` - Build frontend + backend
- `pnpm db:migrate` - Run Prisma migrations
- `docker-compose up` - Local dev environment (Postgres + Redis + vector DB)
- `cat todos/phase-X.md` - View current phase tasks
- `grep -E "✅|🚧|⏳" todos/master-tracker.md` - Check project status

## Project-Specific Patterns

### Search Architecture
- **Ingestion**: Async workers chunk content → generate embeddings → store in vector DB
- **Retrieval**: Hybrid search combines BM25 (Postgres full-text) + vector similarity
- **Reranking**: LLM or learned model reorders top results for relevance
- **Caching**: Redis cache for common queries, SHA256-based embedding cache

### Content Processing
- **Chunking**: Token/line-based with overlap for optimal embedding retrieval
- **Metadata**: Track repo, path, language, timestamp for filtering
- **Parsing**: Extract text + code blocks from `.md`, `.js`, `.py`, etc.

### Data Flow
```
GitHub/SO APIs → Ingestion Worker → Parser/Chunker → Embedding Worker → Vector DB
                                                                    ↓
User Query → Hybrid Search (BM25 + Vector) → Reranker → Results UI
```

## Integration Points

### External APIs
- **GitHub API**: Repository content ingestion
- **StackOverflow API**: Q&A content by tags
- **OpenAI API**: Text embeddings + optional reranking
- **Vector DB**: pgvector (Postgres) or Qdrant client

### Authentication Flow
- OAuth with GitHub for user sign-in
- JWT session management
- User favorites and personalization stored in Postgres

## Cost & Performance Considerations

### Optimization Strategies
- **Embedding Caching**: Cache by content SHA256 to avoid re-computation
- **Batch Processing**: Group embedding calls to reduce API costs
- **Query Caching**: Redis cache for frequent search queries
- **Rate Limiting**: Control embedding API usage and user requests

### Monitoring Points
- Embedding API costs and latency
- Search response times (target: <300ms for vector retrieval)
- Ingestion job success rates
- User query patterns and click-through rates

## Quality Standards

### Production-Ready Iterations
Each phase must meet these criteria before proceeding:
- **Functional**: All features work end-to-end with proper error handling
- **Tested**: Unit + integration tests passing with >80% coverage
- **Documented**: README/docs updated with new features and APIs
- **Deployed**: Staging environment accessible and functional
- **Monitored**: Basic observability (logs, metrics, health checks)
- **Secure**: Security review completed, no exposed secrets

### Testing Strategy
- Unit tests (Jest) for business logic
- Integration tests for ingestion pipeline (mocked external APIs)
- E2E tests (Playwright) for search user flows
- Load testing for production readiness
- Smoke tests for deployment validation

### Code Quality
- ESLint + Prettier with commit hooks (Husky)
- Strict TypeScript configuration
- PR-based workflow with automated CI checks
- Todo updates after each iteration

## Security & Privacy

### Content Handling
- Scrub API keys and secrets from ingested content
- Provide user deletion endpoints for private content
- Environment-based secret management with rotation

### Data Protection
- User data stored in Postgres with proper access controls
- Embedding vectors can be anonymized while preserving search utility

## Current Status
Project is in **Phase 0** - requirements documented, ready for scaffolding and initial implementation.

**Active Todo**: Complete Phase 0 monorepo setup (see `todos/phase-0.md`)
**Next Milestone**: Functional Next.js + NestJS foundation with Docker Compose

## Quick Start (When Implemented)
1. Clone repo and install dependencies: `pnpm install`
2. Set up local services: `docker-compose up -d`
3. Run database migrations: `pnpm db:migrate`
4. Start development servers: `pnpm dev`
5. Access frontend at `http://localhost:3000`, API at `http://localhost:3001`

## Todo Management Commands
```bash
# Check current phase progress
cat todos/phase-0.md

# View overall project status
cat todos/master-tracker.md

# Update todos after completing work
git add todos/ && git commit -m "Update todos: Phase X progress"

# Check completion status across phases
grep -E "✅|🚧|⏳" todos/master-tracker.md
```