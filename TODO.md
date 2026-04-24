# CodeSenseiSearch — TODO

Only **open** items live here. Completed work is archived in
[DONE.md](./DONE.md). Corpus expansion strategy + batch playbook is
in [CORPUS-PLAN.md](./CORPUS-PLAN.md).

> **Priority key**
> 🔴 = visible bug or visible polish gap
> 🟡 = quality / consistency
> 🟢 = depth / observability / "shipped engineer" signal

---

## A. Corpus expansion (the active work)

Current totals: **45/2600 chunks** (15 docs + 30 GitHub).

| Source         | Target | Have | Next                                    |
| -------------- | ------ | ---- | --------------------------------------- |
| GitHub         | 1000   |  30  | personal-project batches (002–009)      |
| Stack Overflow | 1000   |   0  | start after GitHub crosses ~200         |
| Documentation  |  500   |  15  | extend gradually from owner-authored Q&A |
| Blog           |  100   |   0  | quarterly cadence, link to portfolio blog |

- [ ] 🔴 **Personal-project batches (002–009).** One batch per
  personal repo, attributed to the real GitHub URL. Drafted in
  parallel by sub-agents this session; integrated, deployed, seeded.
  Repos: KhataGO, EduScale (DevScale), DevTrack, CareerGlyph,
  redis-battle-demo, stripe-payments-demo, razorpay-patterns-demo,
  portfolio_next. Target: ~25 entries each → +200 GitHub chunks.
- [ ] 🟡 **OSS popular-repo batches (010–034).** Resume the
  CORPUS-PLAN roadmap (TypeScript types, Next.js routing, Prisma,
  Postgres, BullMQ, testing, Rust, Go, Python, etc.). 25 batches
  × 30 entries = 750. Combined with personal projects this hits the
  GitHub 1000 target.
- [ ] 🟡 **Stack Overflow batches (so-001 onwards).** Real
  questions under CC-BY-SA, with proper attribution (author +
  question id). Target 1000 across ~33 batches.
- [ ] 🟢 **Documentation expansion.** Extend the 15 owner-authored
  entries with 30 more per session targeting common queries.

---

## B. UX polish (still pending)

- [ ] 🟡 **Syntax highlighting on code blocks.** `prismjs` is in
  `package.json` but unused; switch to shiki + lazy-load per
  language. Result `<pre>` body should colorise when the chunk
  language is recognised.
- [ ] 🟡 **Copy-to-clipboard toast.** Button text flips to "Copied"
  for ~2s; a toast feels more deliberate.
- [ ] 🟡 **Focus management on search submit.** After search,
  focus the first result heading; after clearing, return to the
  input.
- [ ] 🟡 **Heading hierarchy codified.** Define a typography scale
  (probably `@tailwindcss/typography`-based prose) and enforce it
  per page.
- [ ] 🟡 **Real favicon set** (16/32/180/512 px) themed to the
  indigo accent.
- [ ] 🟢 **Keyboard navigation through results.** ↓/↑ between
  cards, Enter to copy.
- [ ] 🟢 **Result-card permalink.** Click → `/search/result/{id}`
  with the chunk isolated and shareable.

---

## D. Result-card depth

- [ ] 🟡 **Source metadata on the card.** Source URL link, repo
  breadcrumb (for GitHub entries), file path, "last updated"
  date. Algolia/DocSearch raise the bar — match it.
- [ ] 🟡 **Truncate long bodies with fade + Expand.** Current
  `<pre>` shows the whole 800-word answer inline.
- [ ] 🟡 **Per-source visual differentiation.** GitHub gets the
  GH icon + repo path; Stack Overflow gets SO orange + score;
  Docs gets the doc icon + section path. Today only the badge
  varies.

---

## E. Observability + edge cases (seniority signal)

- [ ] 🟢 **Vercel Analytics + Speed Insights.** One-line add per
  app; replaces the dead `lib/analytics.ts` skeleton.
- [ ] 🟢 **Sentry init in API.** `@sentry/node` is installed
  but never initialised. Wire it; forward `error.tsx` errors too.
- [ ] 🟢 **Sentry on the web side.** `@sentry/nextjs` setup.
- [ ] 🟢 **429 feedback on the FE.** Detect rate-limit responses,
  show "Slow down — 60 req/min" with a countdown instead of a
  generic "Search failed".
- [ ] 🟢 **Cold-start retry banner.** When the API health check
  is slow (cold function), show "Backend is waking up — retrying
  in 5s" with auto-retry.
- [ ] 🟢 **OpenTelemetry traces on the API.** Hybrid search is
  fan-out (vector + fulltext + rerank). Tracing makes the
  architecture diagram demonstrable.
- [ ] 🟢 **Honest perf numbers in `/docs/api`.** Current response
  examples have synthetic round numbers. Replace with measured
  P50 / P95 latency.

---

## F. Demo / story-telling

- [ ] 🟡 **3-minute Loom.** home → click pill → result → switch
  filter → keyboard shortcut → /docs.
- [ ] 🟡 **README rewrite, lead with demo.** One-line pitch, live
  demo link, animated GIF, tech-stack badges. Setup instructions
  go below.
- [ ] 🟡 **`/architecture` page.** Diagram + the "what happens
  when you press Search" sequence the features section already
  teases. One scrollable narrative.
- [ ] 🟢 **Blog post: "How I built it."** ~1500 words, link from
  README + portfolio card.

---

## G. Tech debt

- [ ] 🟢 **Drop dead analytics code** in `lib/analytics.ts` (or
  wire to Vercel Analytics — see E.1).
- [ ] 🟢 **Reconcile two search-service implementations.**
  `services/search.service.ts` and
  `search/services/hybrid-search.service.ts` overlap; only one is
  on the request path. Delete the unused one.
- [ ] 🟢 **Strict TypeScript everywhere.** A few `as any` /
  `as unknown as` casts remain — fix or annotate why.

---

## How to use this list

- This file = **pending only**. As each item closes, move its line
  to `DONE.md` (don't strike-through here — it just grows).
- New work goes in the section it logically belongs to with a fresh
  priority emoji.
- The **Corpus** section (A) is the one that needs the most
  consistent forward motion right now. Aim for one batch per session
  until each source target is met.
