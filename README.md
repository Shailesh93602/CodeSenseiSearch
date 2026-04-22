# CodeSenseiSearch

Semantic code-search monorepo. A Next.js frontend + NestJS backend pair
that (will) index GitHub repositories and StackOverflow Q&A, chunk each
source file at function/class boundaries, embed every chunk with Google
Gemini, store vectors in PostgreSQL via pgvector, and serve a
hybrid (vector + full-text) search API.

> **Status — honest version.** This is a work-in-progress portfolio
> piece. Phase 1 (landing page + search UI with mock data) and enough
> Phase 2 plumbing to run the ingestion → chunk → embed pipeline
> against a seed corpus are in place. What is **not** yet wired: the
> frontend talking to the real API (still reads `mock-data.ts`), a
> live hosted demo, and an integration test that exercises the full
> pipeline against a real Postgres. See the [Roadmap](#roadmap).

## What actually works today

| Feature | State |
|---|---|
| Next.js landing + search UI (against mock dataset) | ✅ Shipped |
| NestJS backend scaffolding (auth, workers, services) | ✅ Shipped |
| Prisma schema with pgvector column (768-dim for Gemini) | ✅ Shipped |
| AST-aware chunker for TypeScript / JavaScript / JSX / TSX | ✅ Shipped |
| `ContentChunkingWorker` (routes code to AST, rest to char-based) | ✅ Shipped |
| `EmbeddingGenerationWorker` (Gemini + pgvector + retry backoff) | ✅ Shipped |
| Auth (JWT + GitHub OAuth), JwtAuthGuard on admin routes | ✅ Shipped |
| Global rate limiting via `@nestjs/throttler` (60/min default) | ✅ Shipped |
| Tests: 54 unit, 7 suites passing | ✅ Shipped |
| Frontend → real API wiring | 🚧 Next |
| End-to-end integration test (real Postgres) | 🚧 Next |
| Live hosted demo with bundled corpus | 🚧 Next |
| Swagger / OpenAPI docs | 🚧 Next |

## Architecture

```
  GitHub repos / StackOverflow Q&A
            │
            ▼
  ┌──────────────────────────┐
  │  Ingestion workers       │  BullMQ queues on Redis
  │  (GitHub / SO discovery  │
  │   + ingestion)           │
  └──────────┬───────────────┘
             │
             ▼
  ┌──────────────────────────┐
  │  ContentChunkingWorker   │  AST-aware for .ts/.tsx/.js/.jsx
  │                          │  char-based fallback otherwise
  └──────────┬───────────────┘
             │  chunks (PENDING)
             ▼
  ┌──────────────────────────┐
  │  EmbeddingGeneration     │  Gemini text-embedding-004 (768d)
  │  Worker                  │  Exponential backoff on 5xx/429
  └──────────┬───────────────┘
             │  embeddings
             ▼
  ┌──────────────────────────┐
  │  Postgres + pgvector     │  vector(768) on content_chunks
  └──────────┬───────────────┘
             │
             ▼
  ┌──────────────────────────┐       ┌──────────────┐
  │  Hybrid search service   │  ◄──  │  Next.js UI  │
  │  (vector + full-text +   │       │  search page │
  │   reranker)              │       └──────────────┘
  └──────────────────────────┘
```

The vector column is `vector(768)` to match Gemini's
`text-embedding-004` output. Swap models → update the schema column,
`Embedding.dimensions` default, and `GeminiService.embeddingModel` in
one migration.

## Key design choices worth flagging

- **AST-aware chunking.** Code files get walked with the TypeScript
  compiler API; each top-level function / method / class / typed
  callable becomes one chunk with preserved `startLine` / `endLine`.
  Fixed-size chunks tore function bodies in half and produced
  embeddings that didn't cluster usefully. See
  [`code-chunker.ts`](apps/api/src/workers/code-chunker.ts).
- **Idempotent embedding pipeline.** Re-running a generate-embeddings
  job on the same chunk IDs is a no-op — only `PENDING`/`FAILED`
  chunks are picked up, and the batch is flagged `IN_PROGRESS` up
  front so concurrent workers can't race. See
  [`embedding-generation.worker.ts`](apps/api/src/workers/embedding-generation.worker.ts).
- **Exponential backoff on transient Gemini errors.** 500ms →
  1000ms → 2000ms for rate-limit / timeout / 5xx responses; bail
  immediately on 4xx shape errors (no point retrying those).
- **Rate limiting is global.** `ThrottlerGuard` registered as
  `APP_GUARD`; every endpoint is capped at 60 req/min per IP unless
  it opts in to a tighter local `@Throttle`. `/auth/login` is 10/min,
  `/auth/register` is 5/min.

## Local development

### Prerequisites

- Node.js 18+
- pnpm 8+
- Docker + Docker Compose
- A Google Gemini API key (free tier is plenty for local dev) — https://aistudio.google.com/app/apikey

### One-time setup

```bash
git clone https://github.com/Shailesh93602/CodeSenseiSearch.git
cd CodeSenseiSearch
pnpm install

# Start Postgres + Redis + pgAdmin
docker-compose up -d

# Backend env
cp apps/api/.env.example apps/api/.env
# Fill in GEMINI_API_KEY, JWT_SECRET (openssl rand -hex 32), DATABASE_URL

# Apply DB schema (pgvector extension + tables + vector dims)
pnpm --filter @codesenseisearch/api db:migrate
```

### Run everything

```bash
pnpm dev
```

Opens:

- Frontend — http://localhost:3000
- API — http://localhost:3001/api
- pgAdmin (if `--profile admin` was used) — http://localhost:5050

### Tests

```bash
pnpm --filter @codesenseisearch/api test
```

Currently 54 tests across 7 suites (AST chunker, embedding worker,
search services, controllers).

## Roadmap

Active Phase 2 items, in the order they unblock each other:

1. **End-to-end integration test.** Spin up Postgres in a testcontainer,
   seed a tiny source corpus, run ingest → chunk → embed → search, assert
   the top result is the expected file range. Real DB, real Gemini.
2. **Frontend → real API.** Replace `apps/web/src/lib/mock-data.ts` with
   `api-client.ts` calls. Loading + empty + error states already exist
   in the UI.
3. **Bundled demo corpus.** Pre-embed a small popular repo and commit
   the resulting SQL dump. `pnpm demo` then restores the dump and lands
   on a working `/search` page without any API key.
4. **Hosted demo.** Vercel for the frontend, Railway or Fly.io for the
   API, Neon or Supabase for Postgres + pgvector, Upstash for Redis.
5. **Swagger / OpenAPI.** `@nestjs/swagger` + `@ApiOperation` across
   the search + auth controllers.
6. **Split the monolithic workers file.** `base.worker.ts` is still
   ~1650 lines after the partial extract. Split the remaining 5
   GitHub/SO workers into individual files for testability and easier
   diff review.

## What this project is not

- Not "production-ready" — it's an in-progress portfolio exploration.
  The backend pipeline is wired but not deployed, and the frontend is
  still reading mock data.
- Not a drop-in for GitHub Code Search. Different goals, different
  index strategy, and no scale story for >10k repos.
- Not multi-tenant yet. Single-user flows only.

## License

MIT.
