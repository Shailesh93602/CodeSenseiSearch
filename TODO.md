# CodeSenseiSearch — Roadmap & Open TODOs

Last updated: 2026-04-23.

State as of last commit: backend + frontend hardening complete, 140
unit / integration tests passing across 15 suites, type-check + lint
clean, Playwright E2E green. The repo is in industry-standard shape on
the **code** side. What's left below is the path from "good code in a
private repo" to "live, demo-able portfolio piece a recruiter can
actually try."

> **Conventions for items below:**
> 🔴 = blocks the public/demo flip
> 🟡 = high impact, do soon
> 🟢 = nice to have, polish

---

## A. Things only you can do (need accounts / decisions)

- [ ] 🔴 **Flip the GitHub repo public.** Currently
  `github.com/Shailesh93602/CodeSenseiSearch` returns 404. The portfolio
  card has it allow-listed in
  [scripts/check-live-urls.mjs](../portfolio_next/scripts/check-live-urls.mjs)
  `KNOWN_PRIVATE` so the daily cron doesn't spam — remove that entry
  once flipped.

- [ ] 🔴 **Hosted demo deployment.** Pick a stack:
  - **Frontend:** Vercel (`apps/web` → port 3010 in dev, but Vercel
    auto-detects). Set `NEXT_PUBLIC_API_URL` to the live API URL.
  - **API:** Railway, Fly.io, or Render. Dockerfile is already
    multi-stage and slim (~150MB image). Build cmd:
    `docker build -f apps/api/Dockerfile -t codesensei-api .`
  - **Postgres + pgvector:** Neon, Supabase, or Railway Postgres
    add-on. All three support `CREATE EXTENSION vector`.
  - **Redis:** Upstash (serverless, generous free tier) or Railway
    Redis.
  - Required env (see [apps/api/src/config/env.ts](apps/api/src/config/env.ts)):
    `DATABASE_URL`, `JWT_SECRET` (≥32 chars,
    `openssl rand -hex 32`), `REDIS_HOST` + `REDIS_PORT` (or
    `REDIS_URL` — TODO add support), `GEMINI_API_KEY`. Optional:
    `SENTRY_DSN`, `SWAGGER_ENABLED=true` if you want public docs.

- [ ] 🟡 **Bundle a demo corpus.** Pre-embed a small popular repo
  (suggest `sindresorhus/type-fest` — 200ish .ts files, all
  function/class declarations, perfect for the AST chunker showcase)
  and commit the resulting SQL dump under
  `apps/api/prisma/seed/demo-corpus.sql.gz`. Add a `pnpm demo` script
  that does `docker-compose up -d`, restores the dump, and starts
  both apps. Recruiter can clone-and-go without a Gemini key.

- [ ] 🟢 **30-second Loom or screencap.** Embed in README under the
  "What actually works today" table. Show: typing a natural-language
  query → ranked file/line results.

---

## B. Code work I can pick up next

### B1 — Real-Postgres integration test 🟡

The current
[`pipeline-integration.spec.ts`](apps/api/src/workers/__tests__/pipeline-integration.spec.ts)
runs the chunker → worker chain in-process with a Map standing in for
Postgres. That catches the contract bugs that matter, but doesn't
exercise the actual `vector(768)` column or the cosine-similarity
search. Plan:

- Add `@testcontainers/postgresql` as a devDependency
- Spin up `postgres:16-alpine` with `CREATE EXTENSION vector` in a
  pre-test hook
- Real Prisma client against the testcontainer
- Mock GeminiService with deterministic vectors (e.g. one-hot per
  input keyword) so search ranking is verifiable
- Assert: a query for "function add" ranks the chunk containing the
  `add` declaration first

Estimated 2–3 hours including the Prisma migrate-on-test plumbing.

### B2 — Replace ContentChunkingWorker's remaining inline helpers 🟢

After commit `19a87f0` four pure helpers are shared, but
`chunkMarkdown`, `chunkCode`, `chunkCodeBlock`, `chunkByParagraphs`,
and `splitByCodeBlocks` are still inline in
[`content-chunking.worker.ts`](apps/api/src/workers/content-chunking.worker.ts).
They're not duplicated elsewhere right now (so there's no audit
warning), but lifting them would make them unit-testable in
isolation. Defer until there's a second caller.

### B3 — Wire request-id propagation to outgoing calls 🟢

`nestjs-pino` attaches a `req.id` to every incoming request log line.
That id should also flow on outbound calls (`fetch` to Gemini, GitHub
API, etc.) as an `x-request-id` header so a Sentry trace can be
linked to the upstream call that triggered it. Use
[AsyncLocalStorage](https://nodejs.org/api/async_context.html) to
carry the id through the call stack.

### B4 — Move `/test/*` controller endpoints into proper modules 🟢

[`apps/api/src/test/test.controller.ts`](apps/api/src/test/test.controller.ts)
is 1460 LOC of "experimental" routes mounted at `/test/...`. Some of
them duplicate the real `SearchController`. Audit which ones are
called from anywhere (frontend, scripts) and either:
- Move the live ones into proper modules (`/admin/*` if admin-gated,
  `/search/*` if part of the search surface)
- Delete the rest

### B5 — Add `@Throttle` decorators to ingestion endpoints 🟢

The global throttler covers everything at 60/min. Ingestion (any
route that triggers `addGitHubIngestionJob` /
`addStackOverflowIngestionJob`) should be capped tighter — those
spend GitHub API quota and Gemini tokens. Suggest 5/min per IP.

### B6 — Switch `User.preferences` Json bag → real `UserAuth` model 🟢

Pre-existing tech debt:
[`auth.service.ts`](apps/api/src/auth/auth.service.ts) reads the
password hash out of `User.preferences.passwordHash` (a JSON bag) as
a temporary bridge. The `UserAuth` model in
[`prisma/schema.prisma`](apps/api/prisma/schema.prisma) is the proper
target — has dedicated `passwordHash`, `emailVerified`,
`emailVerificationToken`, `role`, etc. fields. Migration is real
work: 8 service call sites, a data backfill from `User.preferences`
to `UserAuth`, and probably a foreign-key constraint linking the two
tables. Estimated 4–6 hours.

### B7 — Frontend a11y + Lighthouse passes 🟢

The web workspace has zero accessibility tests right now. Add
`@axe-core/playwright` to the existing E2E suite + run Lighthouse
against `/` and `/search` in CI (`@lhci/cli`, the same approach the
portfolio uses). Target ≥90 for a11y + perf + best-practices + SEO.

### B8 — npm audit follow-up 🟢

Cross-repo sweep flagged transitive vulns in tooling deps
(`react-syntax-highlighter`, picomatch). `pnpm audit` regularly. Pin
or bump as needed; not blocking.

---

## C. Nice-to-have observability + docs

- [ ] 🟢 **Prometheus `/metrics` endpoint.** `prom-client` is not
  installed yet; add it + expose `/metrics` (gated behind an
  `Authorization: Bearer ${METRICS_TOKEN}` so it's not public).
  Capture: HTTP request duration histogram, active BullMQ job count
  per queue, embedding latency, Gemini retry count.

- [ ] 🟢 **Grafana / Loki dashboard.** Once metrics are exposed.

- [ ] 🟢 **Bull dashboard.** `@bull-board/api` + `@bull-board/express`
  to inspect queues at `/api/admin/queues`. Auth-guarded.

- [ ] 🟢 **Architecture diagram in README as a real SVG** (currently
  ASCII art — fine but Mermaid would render in GitHub).

- [ ] 🟢 **Example queries in README** with actual response snippets.
  Easier to land once the demo corpus is bundled (B2 above).

---

## D. Operational

- [ ] 🟢 **Graceful shutdown.** Add `app.enableShutdownHooks()` in
  [main.ts](apps/api/src/main.ts) so SIGTERM closes BullMQ workers
  cleanly (currently they may leave jobs in-flight).

- [ ] 🟢 **DB connection pooling.** Tune Prisma's connection pool
  for whatever Postgres host you pick — Supabase pgbouncer mode
  needs `?pgbouncer=true` in the connection string.

- [ ] 🟢 **Request body size limit.** Currently unbounded. `express`
  default is 100KB; explicitly cap to something like 1MB via
  `app.use(express.json({ limit: '1mb' }))`.

- [ ] 🟢 **CORS allowlist instead of single origin.** Today
  `FRONTEND_URL` is a single string. If you deploy preview branches
  on Vercel, each gets a unique URL and gets CORS-blocked. Switch to
  an env-driven array or a regex.

---

## Done in this session (for posterity)

24 commits between 4/22 evening and 4/23 morning. Major themes:

- **Worked features:** Implemented `EmbeddingGenerationWorker` (was a
  TODO stub), AST-aware code chunker via TS compiler API, fixed
  `pgvector` dim 1536 → 768, added `JwtAuthGuard` to admin, added
  `@Throttle` to auth, `@nestjs/swagger`, Zod env validation, real
  health endpoint, structured logging via `nestjs-pino`, Sentry
  exception filter, helmet security headers, GitHub Actions CI,
  multi-stage Dockerfile.
- **Test surface:** 28 → 140 tests across 15 suites. Added unit tests
  for chunker, embedding worker, content chunker, chunking helpers,
  retry/backoff, env validation, health endpoint, search controller,
  auth controller (integration with throttler), pipeline integration,
  Sentry filter, frontend components (vitest + RTL), and frontend E2E
  (Playwright).
- **Bugs found via tests:** Two `chunkPlainText` infinite-loop /
  unbounded-output bugs in the original code, both fixed.
- **Code organization:** Split `base.worker.ts` (1669 LOC monolith)
  into 7 dedicated worker files + a 20-line re-export shim.
  Consolidated 4 duplicated chunker helpers into
  `chunking-helpers.ts`.
- **Honesty pass:** Rewrote README to match what's actually shipped;
  deleted 8 stale "Phase 2 complete" docs that contradicted the code.
- **Repo hygiene:** Removed 891-line dead `mock-data.ts`, deleted
  `openai.service.ts.backup`, gitignored Playwright artifacts and
  `quality.md`.

See `git log --oneline 4c508d0..main` for the full history.
