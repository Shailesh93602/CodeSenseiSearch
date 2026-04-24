# Corpus expansion plan

The deployed search needs real data behind every source filter so a
visitor typing a common term like `react` gets useful hits — not an
empty state. This document is the playbook for getting there.

---

## Targets

| Source             | contentType                | Target | Status   |
| ------------------ | -------------------------- | ------ | -------- |
| GitHub             | `REPOSITORY_FILE`          | 1000   | 30/1000  |
| Stack Overflow     | `STACKOVERFLOW_*`          | 1000   | 0/1000   |
| Documentation      | `DOCUMENTATION_PAGE`       |  500   | 15/500   |
| Blog               | `BLOG_POST`                |  100   | 0/100    |
| **Total**          |                            | 2600   | 45/2600  |

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
| 001 | github-001-react-hooks.ts             | React hooks + state libs (Zustand, Jotai, SWR, Query, RHF, Next.js, shadcn) | ✅ shipped (30) |
| 002 | github-002-typescript-types.ts        | Pick/Omit/infer, mapped types, template literal types, satisfies, branded types | pending |
| 003 | github-003-nextjs-app-router.ts       | Layouts, parallel routes, intercepts, middleware, fetch caching, Suspense in RSC | pending |
| 004 | github-004-async-patterns.ts          | AbortController, Promise.all/allSettled, p-queue, retry/backoff, debounce | pending |
| 005 | github-005-node-streams.ts            | Readable/Writable streams, pipelines, backpressure, stream.pipeline vs pipe | pending |
| 006 | github-006-prisma-patterns.ts         | findUnique vs findFirst, transactions, raw SQL, JSON queries, pagination | pending |
| 007 | github-007-postgres-patterns.ts       | Indexes (BTree/GIN/HNSW), EXPLAIN ANALYZE, JSONB, full-text, window functions | pending |
| 008 | github-008-bullmq-redis.ts            | Workers, queues, retry, DLQ, repeatable jobs, Redis SET NX EX, Redlock | pending |
| 009 | github-009-testing-patterns.ts        | Jest setup, Vitest, MSW handlers, Playwright fixtures, supertest | pending |
| 010 | github-010-rust-patterns.ts           | Rc/Arc/Box, traits, async/await tokio, error handling with `?`, lifetimes | pending |
| ... | (future batches for python, go, devops, etc.) |                                | pending |

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
