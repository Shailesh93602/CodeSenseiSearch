# CodeSenseiSearch — Portfolio polish tracker

Last updated: 2026-04-24.

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

- [ ] 🔴 **Filters on /search are ornamental.** Source / Language /
  Sort filters mutate state but don't change what's shown. The state
  is wired into `apiFilters` in `apps/web/src/components/search-results.tsx:91-104`,
  but: (1) the API `searchType: 'hybrid'` ignores the `source` /
  `sortBy` / `dateRange` keys, and (2) the FE never validates the
  user actually saw the change. Either pass the filters to the
  controller AND have the controller honor them in the SQL
  WHERE clause, or hide the filters until they work.

- [ ] 🔴 **Filter state isn't in the URL.** Reload or share loses
  every filter. The `q` query param is read at
  `apps/web/src/app/search/search-content.tsx:16` but `source`,
  `language`, `sortBy`, `dateRange` are pure component state. Every
  filter change should `router.replace` with the encoded state.

- [ ] 🔴 **Result count is initially "results for X"** before the
  count loads. The render shouldn't show that header until
  `totalResults` is set, or it should show a skeleton.

- [ ] 🔴 **No custom 404.** Hitting any non-existent route shows
  Next.js's bare default. Need `apps/web/src/app/not-found.tsx`
  matching site styling.

- [ ] 🔴 **No error boundary.** A thrown render error shows the bare
  Next dev page. Need `apps/web/src/app/error.tsx` with a friendly
  retry + GitHub-issue link.

- [ ] 🟡 **Header reimplemented per page.** `/search/search-content.tsx`
  has its own header, `/docs/page.tsx` has a different gradient
  header, home uses `<Hero>` with no nav. A single `<Navbar>`
  component should render on every route via `app/layout.tsx`.

- [ ] 🟡 **No footer anywhere.** Every page just ends. A footer with
  GitHub link, "Built by Shailesh Chaudhari", privacy / about links
  is the bare minimum.

- [ ] 🟡 **Search bar placeholder is too long for mobile.**
  `apps/web/src/components/search-bar.tsx:136` placeholder gets
  truncated to mush on iPhone. Shorten or show different copy below
  sm breakpoint.

---

## B. Design system inconsistency

The audit catalogued 60+ small things; the pattern is the same:
no shared design tokens, every component invents its own padding /
shadow / radius / color.

- [ ] 🟡 **Adopt the "house style" used across the owner's other
  projects.** Five sibling repos (portfolio_next, EduScale, KhataGO,
  devtrack, CareerGlyph) consistently use:
  - **Font:** Inter (currently we use Geist — switch).
  - **Dark mode:** `class` strategy via next-themes, with FOUC-prevention
    inline script in `<head>`.
  - **Navbar:** sticky, blurred backdrop, `z-50`, logo-left, nav-right,
    theme toggle in top-right.
  - **Cards:** `rounded-lg` (8-12px), subtle border, hover lift.
  - **Spacing:** consistent 4 / 6 / 8 scale, no random `gap-3` mixed
    with `gap-5`.
  - **Primary accent:** purple/blue. Pick one and use a CSS variable.

- [ ] 🟡 **No dark mode at all.** `globals.css` defines `.dark` tokens
  but no component uses `dark:` classes and there's no toggle.
  Sibling projects all support it. Implement.

- [ ] 🟡 **Color tokens, not Tailwind primitives, in custom code.**
  Ban `bg-blue-100 text-blue-700` from JSX — those should be design
  tokens like `bg-accent text-accent-foreground` defined once in
  `tailwind.config.ts`. Currently scattered across:
  - `search-filters.tsx:68`
  - `search-results.tsx:73-92`
  - `features.tsx:25-65`

- [ ] 🟡 **Buttons are inconsistent.** Hero uses `size="lg" h-14`,
  search uses `size="sm" h-10`, filters use `size="sm"`. Define a
  size system in the Button component and use it.

- [ ] 🟡 **Card aesthetic is mixed.** Same hierarchy renders with
  different shadows (`hover:shadow-lg` vs `hover:shadow-md` vs
  `shadow-sm`) across `features.tsx`, `search-results.tsx`,
  `docs/page.tsx`. Pick one.

- [ ] 🟡 **Heading hierarchy not codified.** `h1`, `h2`, `h3` use
  different sizes on different pages. Define a typography scale in
  `globals.css` (or use `@tailwindcss/typography` properly).

- [ ] 🟡 **Favicon is the Next.js default.** Replace with a real
  favicon set (16/32/180/512 px), apple-touch-icon, manifest.json
  themed properly.

---

## C. UX polish

- [ ] 🟡 **Loading skeletons that match the result card shape.**
  Currently a generic spinner appears in dead center. Sibling
  projects use shimmer-skeleton cards.

- [ ] 🟡 **Empty state for "no corpus matches your query" needs a
  helpful nudge.** Right now it just says "no results, try different
  keywords." Better: list the 5 example pills as clickable chips, or
  show stats (e.g. "indexed 15 documents — try one of these topics").

- [ ] 🟡 **Cmd+K / Ctrl+K to focus search input.** Industry-standard
  shortcut. Easy win — wire a global keydown listener in `<Navbar>`.

- [ ] 🟡 **`/` to focus search.** Same wire, just an alternate key
  binding. GitHub uses this; users will try it.

- [ ] 🟡 **`Esc` to clear query and close suggestions.** Already
  partially wired in search-bar; verify across the page.

- [ ] 🟡 **Syntax highlighting on code blocks in results.**
  Prism.js is in `package.json` but unused. Pick shiki or
  prismjs and wire into the result-card body when the chunk is
  recognized as code. The current `<pre>` looks like `cat foo.js`.

- [ ] 🟡 **Copy-to-clipboard toast.** Currently the button text
  flips to "Copied" for ~2s with no other feedback. A small toast
  ("Copied snippet to clipboard") feels more deliberate.

- [ ] 🟡 **Hover states on every interactive element.** Filter
  buttons in `search-filters.tsx` have `hover:bg-slate-100` but no
  `focus-visible` ring. Define a global `focus-visible` style.

- [ ] 🟡 **Focus management.** After a search submits, focus should
  go to the first result heading. After clearing, back to the input.

- [ ] 🟢 **Keyboard navigation through result cards.** ↓ / ↑ to move
  between results, Enter to copy. Industry-standard for search UIs.

- [ ] 🟢 **Result-card click → permalink.** Right now the card is
  a static block. Click → `/search/result/{id}` with the chunk
  isolated, shareable URL, "expand context" button.

---

## D. Result-card quality (the thing recruiters actually see)

- [ ] 🟡 **Add real source metadata to the card.** Currently we
  show similarity / score / language. Real search UIs (Algolia,
  DocSearch) also show: source URL, breadcrumb of where it lives,
  excerpt with the matched-term highlighted, "last updated" date.

- [ ] 🟡 **Match-term highlighting in the snippet.** Bold the query
  terms in the result body using `<mark>`. This is a 30-line
  function but visually screams "production-grade search."

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
