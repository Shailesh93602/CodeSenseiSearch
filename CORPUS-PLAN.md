# Corpus expansion plan

The deployed search needs real data behind every source filter so a
visitor typing a common term like `react` gets useful hits — not an
empty state. This document is the playbook for getting there.

---

## Targets

| Source             | contentType                | Target | Status     |
| ------------------ | -------------------------- | ------ | ---------- |
| GitHub             | `REPOSITORY_FILE`          | 1000   | 525/1000   |
| Stack Overflow     | `STACKOVERFLOW_*`          | 1000   | 0/1000     |
| Documentation      | `DOCUMENTATION_PAGE`       |  500   | 15/500     |
| Blog               | `BLOG_POST`                |  100   | 0/100      |
| **Total**          |                            | 2600   | 540/2600   |

Done in **batches of ~30**, one or two batches per session. ~85 total
batches → ~10–15 working sessions to first milestone (1000 GitHub).

---

## Authoring rules

These are the standards every batch must meet. They exist so that
when a recruiter actually searches the corpus, what they find reads
as something a real engineer assembled — not as AI slop.

1. **Real attribution.** Every entry maps to a real, identifiable
   source — a real GitHub repo, a real Stack Overflow question, a
   real documentation page. The `htmlUrl` field MUST resolve. No
   fabricated URLs.

2. **Real patterns, not invented code.** The body shows how the
   pattern actually appears in the wild. For GitHub entries, the
   code can be reconstructed from common knowledge of how the
   project is written — but the pattern itself must be one the
   project actually uses, not a fiction.

3. **Honest framing.** When an entry summarises rather than quotes
   verbatim, the title or body says so ("typical usage in
   facebook/react", "pattern from the codebase", etc.). No claims
   of "exact code at line 47" unless we've verified.

4. **Body length 200–600 words.** Long enough to embed meaningfully
   and to teach something; short enough to fit Gemini's token
   budget without truncation.

5. **One topic per entry.** A useEffect cleanup entry doesn't also
   try to teach React Server Components. If both are needed, write
   two entries.

6. **Code blocks fenced** even though we don't yet syntax-highlight
   — keeps the structure portable.

7. **License compatibility for code samples.**
   - GitHub code: only from MIT / Apache-2.0 / BSD repos. Always
     include the source URL so attribution requirements are met.
   - Stack Overflow content: CC BY-SA — quote sparingly,
     paraphrase + link, attribute author + question id.

---

## Batch structure

Each batch lives in its own file under
`apps/api/src/seed/batches/`:

```
batches/
  github-001-react-hooks.ts          ← 30 entries: React hook patterns
  github-002-react-state.ts          ← 30 entries: state management
  github-003-nextjs-routing.ts       ← 30 entries: Next.js patterns
  ...
  stackoverflow-001-async-await.ts   ← 30 entries: async/await Q&A
  ...
```

Each batch file exports:

```ts
export const BATCH: SeedItem[] = [...]
```

Where `SeedItem` is the shared shape declared in
`apps/api/src/seed/types.ts`:

```ts
interface SeedItem {
  title: string;
  body: string;
  contentType: ContentType;
  language?: string;
  url: string;                    // resolvable html URL
  // GitHub-specific:
  repository?: { owner: string; name: string };
  filePath?: string;
  // SO-specific:
  questionId?: number;
  score?: number;
  isAnswered?: boolean;
}
```

The seed runner walks every `batches/*.ts` file at import time,
deduplicates by `sha256(title+body)`, creates the right rows
(`Source`, `Repository`, `Question` as needed), and embeds only
items whose chunks don't already have a vector. Re-running a session
is idempotent and cheap.

---

## Per-session playbook

1. **Pick a topic.** Look at what's missing — `pnpm --filter api
   exec tsx scripts/corpus-stats.ts` prints counts per category.
   Pick the smallest one with the highest expected query traffic.

2. **Pick a batch size.** 30 entries × ~1.2s/embedding = ~36s.
   Stay under the Gemini free tier daily cap (1000 RPD), so up to
   ~30 batches per day if you really wanted.

3. **Author the batch.** Open or create
   `batches/{source}-{NNN}-{topic}.ts`, fill in entries that meet
   the authoring rules above.

4. **Run the seeder.** `curl -X POST $API/api/seed/demo -H
   "x-seed-secret: $SECRET"` — picks up new batches automatically.

5. **Smoke test.** Hit `/api/search/hybrid` with a few terms from
   the batch, confirm hits show up with the right source label.

6. **Update the table at the top of this doc** — bump the count.

---

## Roadmap (first 10 GitHub batches)

| #   | File                                  | Theme                                     | Status   |
| --- | ------------------------------------- | ----------------------------------------- | -------- |
| 001 | github-001-react-hooks.ts             | React hooks + state libs (Zustand, Jotai, SWR, Query, RHF, Next.js, shadcn) — popular OSS | ✅ shipped (30) |
| 002 | github-002-khatago-patterns.ts        | Personal: WhatsApp/Meta integration, Gemini agent, Razorpay webhook, Tally XML, Prisma | ✅ shipped (25) |
| 003 | github-003-eduscale-patterns.ts       | Personal: Socket.io Redis adapter, Redlock, opossum CB, Bull DLQ, Supabase JWT, prom-client | ✅ shipped (25) |
| 004 | github-004-devtrack-patterns.ts       | Personal: Supabase Realtime, RLS policies, rule engines, P2002→409, Vercel cron | ✅ shipped (25) |
| 005 | github-005-careerglyph-patterns.ts    | Personal: NestJS auth (bcrypt+JWT), ownership-check 404, axios interceptor pair | ✅ shipped (25) |
| 006 | github-006-redis-battle.ts            | Personal: Socket.io pub/sub, Redlock retry-0, lock-TTL invariants, Prom observability | ✅ shipped (20) |
| 007 | github-007-stripe-payments.ts         | Personal: SETNX webhook idempotency, raw-body HMAC, exp backoff bypass-4xx, lazy SDK | ✅ shipped (20) |
| 008 | github-008-razorpay-patterns.ts       | Personal: hand-rolled createHmac+timingSafeEqual, entity-id idempotency, Razorpay deltas | ✅ shipped (20) |
| 009 | github-009-portfolio-next.ts          | Personal: rate-limit + mailto fallback, snapshot fallback, OG image, Playwright matrix | ✅ shipped (25) |
| 010 | github-010-tanstack-query.ts          | TanStack Query internals (invalidate, mutation lifecycle, gcTime, suspense, infinite, hydration, persist) | ✅ shipped (30) |
| 011 | github-011-nextjs-app-router.ts       | Next.js App Router (RSC, server actions, revalidate, fetch cache, headers/cookies/draftMode, edge, streaming) | ✅ shipped (30) |
| 012 | github-012-prisma-patterns.ts         | Prisma (DataLoader batching, $transaction itx, $queryRaw safety, $extends, migrate dev/deploy/resolve, driver adapters, Postgres extensions) | ✅ shipped (30) |
| 013 | github-013-bullmq-patterns.ts         | BullMQ (workers, queue.add options, sandboxed processors, FlowProducer, rate limit, stalled detection, atomic Lua scripts) | ✅ shipped (25) |
| 014 | github-014-zod-typescript.ts          | Zod (object cached shape, infer/input/output, refine vs superRefine, brand, lazy, transform/coerce, ZodEffects, errorMap precedence) | ✅ shipped (30) |
| 015 | github-015-async-patterns.ts          | p-queue concurrency/priority/rate-limit, AbortSignal, Promise.all/allSettled/race/any, withResolvers, async iterators, scheduler ordering | ✅ shipped (25) |
| 016 | github-016-vitest-testing.ts          | Vitest (config inheritance, vi.mock hoisting, fake-timers + sinon, fork/thread/vmThreads pools, sharding, test.extend fixtures) | ✅ shipped (25) |
| 017 | github-017-radix-primitives.ts        | Radix UI (Dialog focus trap, Popper @floating-ui, Toast region, Slot prop merging, useControllableState, useFocusGuards, composeRefs) | ✅ shipped (25) |
| 018 | github-018-tokio-rust.ts              | Tokio (spawn+JoinHandle abort, select! biased fairness, oneshot/mpsc/broadcast/watch/Notify, MissedTickBehavior, JoinSet, spawn_blocking) | ✅ shipped (25) |
| 019 | github-019-gin-go.ts                  | Gin (middleware ordering + abortIndex, Recovery EPIPE, BasicAuth crypto/subtle, Hijack websocket, radix tree internals) | ✅ shipped (20) |
| 020 | github-020-fastapi-python.ts          | FastAPI (Depends sub-deps, yield-deps + AsyncExitStack, async vs def threadpool, OAuth2PasswordBearer, lifespan, pydantic v2 bridge) | ✅ shipped (25) |
| 021 | github-021-pgvector-postgres.ts       | pgvector (vector storage layout, distance ops + COMMUTATOR, opclasses, halfvec F16C, sparsevec, HNSW build phases, Reciprocal Rank Fusion) | ✅ shipped (20) |
| 022 | github-022-github-actions.ts          | Composite actions, matrix builds, caching, OIDC, reusable workflows | pending |
| 023 | github-023-drizzle-orm.ts             | Drizzle (schema-first, prepared statements, relational queries, migrations) | pending |
| 024 | github-024-sentry-otel.ts             | Sentry SDK + OpenTelemetry (instrumentation, sampling, baggage, error fingerprinting) | pending |
| 025 | github-025-jose-jwt.ts                | jose JWT (sign/verify, JWKS, key rotation, RFC compliance edge cases) | pending |
| ... | (more batches for k8s, security, build tooling) | toward 1000 GitHub                  | pending |

That's 300 entries to start — covers the most-likely "react",
"nextjs", "typescript", "async", "database", "redis" queries.

After GitHub hits 1000, switch to Stack Overflow batches (same
structure, different `contentType`).

---

## What this doc is NOT

- An ETA. Time is "as long as it takes to write good entries."
- A justification to ship slop. If a batch reads like AI marketing
  copy or invents URLs, throw it out and rewrite.
- A substitute for real ingestion. Long-term, we want
  `apps/api/src/services/github-api.service.ts` actually crawling
  popular repos. This curated corpus is the demo content that ships
  TODAY; real ingestion is the differentiator that ships LATER.
