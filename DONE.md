# DONE — completed work archive

Items move here from `TODO.md` as they ship. Most-recent at the top.

---

## 2026-04-24 — Corpus expansion: 8 personal-project batches (185 entries)

- 4 sub-agents drafted batches 002–009 in parallel, each scanning
  a real personal repo on the user's machine and extracting
  attributable patterns. **185/185 file paths verified to exist
  in source** before integration (zero fabrication).
- Repos: KhataGO, EduScale (DevScale), DevTrack, CareerGlyph,
  redis-battle-demo, stripe-payments-demo, razorpay-patterns-demo,
  portfolio_next. All public on github.com/Shailesh93602/.
- `SeedService` now accepts `?limit=N` so a 200-item batch can be
  chunked under Vercel's 60s function ceiling. Operator calls the
  endpoint in a loop until `{embedded: 0}`.
- Fixed: synthetic `githubId` hash overflowed Postgres INT4
  (`-4_200_397_917` ∉ ±2.1B). Clamped to `[0, 2_147_483_647]`,
  then negated; final ids land in `[-2_147_483_647, -1]`.
- Seed run: 230/230 chunks embedded across 6 chunked invocations
  (~36s total Gemini wall time, well within free-tier RPD).
- Verified live: 9 sample queries each return targeted hits
  attributed to the right personal repo (WhatsApp HMAC, Redlock,
  Supabase RLS, Stripe SETNX, Razorpay signature, etc.).

## 2026-04-24 — Corpus expansion: rails + first batch

- Corpus expansion plan ([CORPUS-PLAN.md](./CORPUS-PLAN.md)):
  targets per source (1000 GH / 1000 SO / 500 Docs / 100 Blog),
  authoring rules (real attribution, no fabricated URLs, 200–600
  word bodies, one topic per entry), and the next 10 GitHub batch
  themes mapped out.
- `apps/api/src/seed/types.ts` — shared `SeedItem` shape supporting
  REPOSITORY_FILE, STACKOVERFLOW_QUESTION/ANSWER, DOCUMENTATION_PAGE,
  BLOG_POST.
- `apps/api/src/seed/batches/index.ts` — aggregator. New batch =
  one TS file + one import line.
- `SeedService` refactor: walks `DEMO_CORPUS + ALL_BATCH_ITEMS`,
  auto-upserts `Source('github')` + `Repository` rows for
  REPOSITORY_FILE entries (synthetic negative-range `githubId` so
  re-runs don't collide with future real ingestion); same for SO.
  Caches upserts within a run. Returns `byContentType` summary.
- `github-001-react-hooks.ts` — first batch, 30 entries on React
  hooks + state libs (Zustand, Jotai, SWR, Query, RHF, Next.js,
  shadcn). Each attributed to a real public OSS repo.
- Seed run: 30 chunks embedded in 8.9 s, 0 failures. Verified
  live: `source: github` returns 14 hits for "react", 9 hits for
  "useState" with vector similarity 0.72.

## 2026-04-24 — Filters bug + visible polish (post audit-2)

- Three independent bugs collaborated on the
  "I clicked GitHub but Stack Overflow showed up" failure:
  1. `textSearch` + `vectorSearch` filtered on the wrong column
     alias (`cc."repositoryId"` instead of `c."repositoryId"`) —
     filter parsed but matched nothing, so everything fell through.
  2. `textSearch` labeled documentation chunks as `'question'`
     because of a hardcoded `repositoryId ? 'repository' : 'question'`
     inference that ignored the actual `contentType` enum.
  3. `useSearch` hook seeded internal filter state from
     `initialFilters` once at mount and never re-synced — so
     subsequent filter changes never reached the network request.
- Filter chip uses friendly labels (`Source: GitHub` not
  `Source: repository`); empty state branches by reason ("no
  GitHub seeded yet" vs "no corpus match").
- `SearchOptions` / `VectorSearchOptions` types widened to accept
  `'documentation'`. `gemini-retry.spec.ts` updated to the new
  model name (`gemini-embedding-001`).

## 2026-04-24 — Design system pass

- Inter font, class-based dark mode (next-themes + FOUC-prevention
  inline script), HSL design tokens (light + dark), sticky blurred
  navbar with theme toggle, footer, rounded-lg cards.
- Removed all hardcoded `bg-blue-100 text-blue-700` etc; every
  component now uses tokens (`bg-card`, `text-muted-foreground`,
  `border-border`, `bg-primary/10`).
- Custom `not-found.tsx` + `error.tsx` with retry + GitHub-issue
  link.
- Loading skeletons matching the result-card silhouette; honest
  empty states with clickable example pills.
- Cmd+K / `/` to focus search, Esc to clear.
- Match-term highlighting (`<mark.search-mark>`) in result titles
  + bodies, light + dark mode.
- Removed unused Monaco editor + `/javascript /python /react
  /languages /resources` fake SEO pages; trimmed sitemap.
- WebVitalsReporter / apple-touch-icon / grid.svg 404s cleaned up.
- Hero / Features / CTA rewritten with honest content.

## 2026-04-23 — Filter wiring (initial pass)

- `api-client.ts` now posts `{query, options:{...}}` (matching the
  NestJS controller signature). FE source labels (`github`,
  `stackoverflow`, `docs`) mapped to API enum values
  (`repository`, `question`, `documentation`).
- Filter state synced to URL via `router.replace`; reload + share
  preserve filters; legacy alias URLs handled.
- Source labels now correct: `metadata.source = 'documentation'`
  instead of the wrong `'question'`.
- Result count + search time render correctly (FE was reading
  `total` / `took` but API returns `totalResults` / `searchTime`).

## 2026-04-23 — End-to-end deploy live

- Hybrid search returns real hits with similarity 0.77–0.83.
- Switched retired Gemini `text-embedding-004` →
  `gemini-embedding-001` with `outputDimensionality: 768`.
- Result renderer rewritten to consume the actual chunk shape
  (was crashing on `result.tags.map`).

## 2026-04-23 — Migration history + ops

- Renamed broken `20251108084050_add_embedding_to_content_chunks`
  to `20251108092000_…` so it runs after baseline. Without this,
  every first-deploy migration died with `relation
  "content_chunks" does not exist`.
- `migrate-prod.sh` parses dotenv files robustly (handles
  unquoted multi-word values, `export ` prefix, trailing
  whitespace, Windows CRs) and accepts pass-through subcommand
  args (`bash scripts/migrate-prod.sh .env.prod resolve …`).
- `GitHubStrategy` no longer crashes the API on cold start when
  `GITHUB_CLIENT_ID` is unset — passes a placeholder so DI
  resolves; OAuth itself still fails cleanly when invoked.
- CSP allows the configured API origin (was hardcoded to a
  placeholder `api.codesenseisearch.com`).
- Keepalive GitHub Action wired with `API_HEALTH_URL` secret;
  daily cron pings `/api/health`.

## Earlier

- All initial deploy work (Vercel project setup, env vars, Prisma
  client + binary targets, Express handler instead of
  serverless-express adapter, Octokit downgrade for CommonJS,
  Redis TLS for Upstash) lives in the git log under commits before
  2026-04-23.
