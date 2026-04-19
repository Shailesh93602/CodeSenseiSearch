# CLAUDE.md — CodeSensei Search

## Project overview

AI-powered semantic code search engine. Natural-language queries return ranked file+line results from indexed repositories. Uses pgvector for similarity search + OpenAI embeddings.

Monorepo (pnpm workspaces): `apps/api` (NestJS backend with pgvector) + `apps/web` (frontend).

**Requires pnpm** — `npm install` will not work. If pnpm is not installed globally: `npx pnpm install`.

## Stack

- **API:** NestJS 10, Prisma 6, PostgreSQL + pgvector extension, OpenAI embeddings API, JWT auth, GitHub OAuth strategy
- **Web:** Next.js (React), Tailwind
- **Shared:** `packages/{types,utils,shared}`

## Key commands

```bash
# From monorepo root (requires pnpm):
pnpm install             # installs all workspaces
pnpm dev                 # runs api + web concurrently
pnpm build
pnpm test
pnpm lint

# Per-app:
cd apps/api && pnpm dev
cd apps/api && pnpm test:coverage
cd apps/api && pnpm type-check    # PASSING as of 2026-04-19 (4 stale @ts-expect-error comments removed)
cd apps/api && pnpm format
```

## Architecture

### API (`apps/api/src/`)

```
auth/            # JWT + GitHub OAuth strategies, rate-limited endpoints
                 # NOTE: password-hash is stored temporarily in user.preferences until a proper auth-tables migration lands.
                 # Historical @ts-expect-error comments for this pattern were removed 2026-04-19 — the types resolve now.
search/          # pgvector similarity-search implementation + full-text fallback
common/          # shared NestJS utilities (cache, logger)
indexer/         # Worker that pulls a repo, chunks functions, generates embeddings, stores in pgvector
```

### Web (`apps/web/src/`)

Standard Next.js App Router frontend. Search input + results UI.

## Environment variables

### API
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres with pgvector extension enabled |
| `OPENAI_API_KEY` | Embeddings |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | OAuth |
| `JWT_SECRET` | Auth tokens |

### Web
| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | API URL |

## Testing

- **API:** Jest — search tests cover fulltext + pgvector paths. `pnpm --filter api test:coverage` for numbers.
- **Web:** minimal tests currently.
- **Lint passes** with 21 warnings (mostly `prefer-nullish-coalescing` — low priority).

## Owner context

- **Not yet deployed** — owner has to add a live URL + screenshot to portfolio card. Currently uses placeholder image (see portfolio `MANUAL.md` one-offs section for the 15-min task).
- Target: **Supabase** application — pgvector expertise is a direct filter-match for Supabase hiring.
- Future demo candidates: a 3-query live search widget embedded in the portfolio project card (TODO 3G).

## Conventions

- Uses `pnpm` workspaces — **don't** run `npm install` at root (will corrupt node_modules).
- NestJS module boundaries; every feature has its own `*.module.ts`.
- `@Global()` DatabaseModule pattern (shared with CareerGlyph).

## Known gotchas

- Fresh clone needs `npx pnpm install`; apps/api had a corrupt node_modules that only `pnpm install --filter @codesenseisearch/api` repaired.
- `@ts-expect-error` directives in `auth.service.ts` were removed 2026-04-19 — if you see new TypeScript errors around `preferences: { passwordHash }`, the temporary workaround has been deleted; proper auth-tables migration is the fix.

## Related

- Parent portfolio: `/Users/shaileshchaudhari/Desktop/Coding/portfolio_next/CLAUDE.md`
- Portfolio card: `constants/projects.ts` id = `codesensei-search`
