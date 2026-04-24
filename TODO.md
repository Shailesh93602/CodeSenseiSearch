# CodeSenseiSearch — Portfolio polish tracker

Last updated: 2026-04-24 (post design-system pass).

State: backend + frontend deployed end-to-end on Vercel. Hybrid search
(Gemini embeddings + pgvector + Postgres FTS) returns real results
from a 15-item curated corpus. The infrastructure is solid; what
follows is the gap between "it works" and "this looks like a
2.5-year engineer built it on purpose."

The bar is intentionally hard. This list is what separates a college
project from a portfolio piece a recruiter at Stripe / Vercel /
Supabase pauses on.

> **Priority:**
> 🔴 = visible bug or visible polish gap (do first)
> 🟡 = design / consistency (do next)
> 🟢 = depth / observability / edge cases (signals seniority)

---

## A. Visible bugs

- [x] 🔴 ~~Filters on /search are ornamental.~~ Filters now reach the
  API: `api-client.ts` posts `{query, options:{}}` (matching the
  controller signature) and maps FE labels to the API enum. Verified
  end-to-end: `source: repository` returns 0, `source: documentation`
  returns 1, `language: rust` returns 0. Sort + date are still passed
  through but the server hasn't implemented them — see TODO E.7.
- [x] 🔴 ~~Filter state isn't in the URL.~~ `search-content.tsx` now
  syncs every filter change to `router.replace(...)`. Reload + share
  preserve filters; legacy `?source=repository` URLs are translated
  back to FE labels.
- [x] 🔴 ~~Result count initially "results for X" before count loads.~~
  Loading state now renders 3 skeleton cards matching result-card
  shape; the count-line waits.
- [x] 🔴 ~~No custom 404.~~ `app/not-found.tsx` ships the styled "404 —
  that page isn't in the index" page with Home + Search CTAs.
- [x] 🔴 ~~No error boundary.~~ `app/error.tsx` renders a friendly
  retry + GitHub-issue link; logs error+digest for tracing.
- [x] 🟡 ~~Header reimplemented per page.~~ `Navbar` component
  mounted globally via `app/layout.tsx`. Per-page headers gone.
- [x] 🟡 ~~No footer anywhere.~~ `Footer` mounted in layout. Tiny
  but consistent: nav links + "built by Shailesh / view source / MIT".
- [x] 🟡 ~~Search bar placeholder too long for mobile.~~ Shortened to
  "Search snippets, docs, examples…" — fits iPhone 14 Pro width.

---

## B. Design system inconsistency

- [x] 🟡 ~~Adopt house style.~~ Inter font, class-based dark mode,
  HSL design tokens (light + dark), sticky blurred navbar with
  theme toggle, rounded-lg cards, consistent spacing scale,
  indigo primary. All landed.
- [x] 🟡 ~~No dark mode.~~ next-themes wired with FOUC-prevention
  inline script. Verified light + dark on home / search / docs /
  404 — see screenshots in /tmp.
- [x] 🟡 ~~Hardcoded color primitives.~~ Every component now uses
  design tokens (`bg-card`, `text-muted-foreground`, `border-border`,
  `bg-primary/10`, etc). One exception: Stack Overflow brand color
  in result badges intentionally uses `orange-` so the badge reads
  as the SO brand even in dark mode.
- [x] 🟡 ~~Buttons inconsistent.~~ Hero, search, filters all use the
  shadcn Button size system (`size="lg"|"sm"|"icon"`).
- [x] 🟡 ~~Card aesthetic mixed.~~ All cards use the same border /
  hover-lift pattern via the Card primitive + token classes.
- [ ] 🟡 **Heading hierarchy not codified.** Still per-page; not a
  blocker since the design pass tightened sizes within each page.
  A `@tailwindcss/typography`-based prose pass would be the right
  long-term fix.
- [ ] 🟡 **Favicon is still the Next.js default.** Need a real
  favicon set (16/32/180/512 px) themed to the indigo accent.

---

## C. UX polish

- [x] 🟡 ~~Loading skeletons.~~ 3 shimmer-skeleton cards while the
  search request is in flight, matching the result-card silhouette.
- [x] 🟡 ~~Better empty state.~~ "No results — the seeded corpus is
  small (15 hand-curated entries). Try one of the topics it covers"
  + clickable example pills.
- [x] 🟡 ~~Cmd+K / Ctrl+K to focus search.~~ Global handler in
  `Navbar` finds `[data-search-input]` and focuses + selects.
- [x] 🟡 ~~`/` to focus search.~~ Same handler.
- [x] 🟡 ~~`Esc` clears + closes.~~ Already in `search-bar.tsx`,
  verified.
- [ ] 🟡 **Syntax highlighting on code blocks.** `prismjs` is still
  in package.json but unused. Wire shiki for the result body when
  the chunk language is a recognized one. The current monospace
  `<pre>` is readable but not branded.
- [ ] 🟡 **Copy-to-clipboard toast.** Button text flips to "Copied"
  for ~2s; a toast ("Copied snippet to clipboard") would feel more
  deliberate.
- [x] 🟡 ~~Hover + focus-visible states.~~ Global `:focus-visible`
  rule in `globals.css` puts a ring on every focusable element.
- [ ] 🟡 **Focus management on search submit.** After search, focus
  should jump to the first result heading; after clearing, back to
  the input.
- [ ] 🟢 **Keyboard navigation through result cards.** ↓ / ↑ between
  results, Enter to copy.
- [ ] 🟢 **Result-card click → permalink.** Click → `/search/result/{id}`
  with the chunk isolated and shareable.

---

## D. Result-card quality (the thing recruiters actually see)

- [ ] 🟡 **Add real source metadata to the card.** Currently we
  show similarity / score / language. Real search UIs (Algolia,
  DocSearch) also show: source URL, breadcrumb of where it lives,
  "last updated" date.
- [x] 🟡 ~~Match-term highlighting in the snippet.~~ `<mark.search-mark>`
  highlights every query token (≥2 chars) in the title + body, in
  both light and dark mode.

- [ ] 🟡 **Truncate-with-fade for long results.** Current `<pre>`
  shows the whole 800-word answer inline. Better: show first ~10
  lines with a fade gradient and "Expand" button.

- [ ] 🟡 **Per-source visual differentiation.** GitHub results get a
  GitHub icon + repo path; Stack Overflow gets the SO orange + score;
  Documentation gets the doc icon + section path. Right now they
  look identical except for one badge.

---

## E. Observability + edge cases (the seniority signal)

- [ ] 🟢 **Wire the Web Vitals reporter to a real sink.**
  `lib/analytics.ts` defines `trackCoreWebVitals()` and
  `WebVitalsReporter.tsx` exists but neither is imported anywhere.
  Either wire to Vercel Analytics + Speed Insights (one-line add) or
  delete the dead code.

- [ ] 🟢 **Sentry SDK initialization in API.** `nestjs-pino` +
  `@sentry/node` are installed but Sentry is never actually
  initialized. A real engineer ships error reporting on day one.

- [ ] 🟢 **Real rate-limit feedback on the FE.** Currently a 429
  shows as a generic "Search failed". Detect 429, show a friendly
  "Slow down — 60 req/min" message with a countdown.

- [ ] 🟢 **Network-error retry button.** When the API is cold-starting,
  show "Backend is waking up, try again in a moment" with auto-retry
  after 5s.

- [ ] 🟢 **Sentry for the FE too.** Same reason as the API.

- [ ] 🟢 **OpenTelemetry traces on the API.** Hybrid search path is
  fan-out (vector + fulltext in parallel + rerank). Tracing makes
  the architecture diagram credible.

- [ ] 🟢 **Honest performance numbers in the docs.** `/docs/api`
  currently uses synthetic round-numbers in the response examples.
  Replace with actual P50 / P95 latency from production measurements.

---

## F. Demo / story-telling

- [ ] 🟡 **A short Loom (3 min).** Walk: home → click pill → see
  result → switch filter → keyboard shortcut → /docs. Recruiters
  watch 30 seconds; design the first 30s carefully.

- [ ] 🟡 **README front-and-center summary.** Above the fold:
  one-line pitch, live demo link, animated GIF of the search flow,
  tech stack badges. Currently the README starts with monorepo
  setup notes.

- [ ] 🟡 **A "How it works" page** (`/architecture`) with the
  diagram + "what happens when you press Search" sequence the
  features section already teases. One scrollable narrative page is
  more compelling than a bulleted card grid.

- [ ] 🟢 **Blog post: "How I built it."** 1,500 words, published on
  the owner's portfolio blog. Links from this repo's README and
  from the portfolio card. Recruiters Google candidates — give them
  something substantive to find.

---

## G. Tech debt / dead code

- [ ] 🟢 **Drop `@monaco-editor/react`** from `package.json` — 2 MB
  bundle weight, never imported.

- [ ] 🟢 **Drop dead analytics code** — `lib/analytics.ts` exports
  `Analytics`, `useSearchTracking`, `trackCoreWebVitals` — none are
  imported. Either wire them or delete them.

- [ ] 🟢 **Reconcile two search-service implementations.**
  `apps/api/src/services/search.service.ts` and
  `apps/api/src/search/services/hybrid-search.service.ts` both
  exist; only one is used. The unused one is confusing for anyone
  reading the codebase.

- [ ] 🟢 **Strict TypeScript everywhere.** A few `as any` and `as
  unknown as` casts remain — search for them and either fix the
  type or annotate why the cast is necessary.

---

## H. Done (since this rewrite started)

- [x] Hybrid search returns real results for the example pills
  (similarity 0.77-0.83).
- [x] Switched retired Gemini `text-embedding-004` to
  `gemini-embedding-001` with `outputDimensionality: 768`.
- [x] Result renderer handles the actual chunk shape (no more
  "Cannot read properties of undefined").
- [x] Source label shows correctly (Documentation badge instead of
  the wrong "Stack Overflow").
- [x] Result count + search time render correctly.
- [x] Migration history fixed (renamed broken `084050` migration to
  run after baseline; documented in `migrate-prod.sh`).
- [x] `migrate-prod.sh` parses dotenv files robustly + accepts
  pass-through subcommand args.
- [x] `GITHUB_CLIENT_ID` not set no longer crashes the API on
  cold start.
- [x] CSP allows the configured API origin (was hardcoded to a
  placeholder domain).
- [x] WebVitalsReporter 404 + apple-touch-icon 404 + grid.svg 404
  cleaned up.
- [x] /javascript /python /react /languages /resources fake SEO
  pages deleted; sitemap trimmed to real routes.
- [x] Hero / Features / CTA rewritten with honest content (no fake
  metrics, no nonexistent SDK names, no "trusted by thousands of
  developers").
- [x] /docs, /docs/api, /docs/integration rewritten against the
  real API contract.
- [x] Sign-In button replaced with a GitHub link.
- [x] Keepalive GitHub Action wired with `API_HEALTH_URL`.

---

## How to read this list

Items in **A** are bugs a recruiter will hit on first click — fix
those today.

Items in **B** and **C** are what makes the difference between
"undergrad capstone" and "engineer who's shipped." Group them; do
them as one focused design pass over a single sitting, not piecemeal.

Items in **D**, **E**, **F** are the seniority signals — they're
what the candidate-vs-thousands-of-other-candidates differentiator
looks like. Pick a couple and go deep rather than touching all of
them shallowly.

Items in **G** are housekeeping. Do them last (or whenever you're
in the relevant file for another reason).
