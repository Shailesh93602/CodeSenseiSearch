/**
 * Batch github-009-portfolio-next
 *
 * 25 patterns extracted from Shailesh Chaudhari's personal portfolio
 * (Next.js 16 App Router, MDX blog, Resend contact form, statistics page
 * with GitHub + LeetCode upstreams). Every entry is attributed to a real
 * file in the repo and the URL points at the file on GitHub `main`.
 */

import type { SeedItem } from '../types';

const repo = { owner: 'Shailesh93602', name: 'portfolio_next' };
const blob = (path: string) =>
  `https://github.com/Shailesh93602/portfolio_next/blob/main/${path}`;

export const BATCH: SeedItem[] = [
  {
    title: 'In-memory per-IP rate limit on a Next.js Route Handler (5/hr)',
    body: `The contact form sits behind a serverless route, but a personal site is a magnet for cheap form-spam bots. The fix here doesn't reach for Redis or Upstash — it just keeps a Map keyed by IP inside the module scope. Cold starts wipe the map (which is fine; a single attacker would have to coordinate cold-start timing to abuse it), and warm lambdas share the bucket across requests on the same instance.

\`\`\`ts
const buckets = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip: string): { ok: boolean; remaining: number } {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: LIMIT - 1 };
  }
  if (bucket.count >= LIMIT) return { ok: false, remaining: 0 };
  bucket.count += 1;
  return { ok: true, remaining: LIMIT - bucket.count };
}
\`\`\`

The IP comes from \`x-forwarded-for\` (first hop), falling back to \`x-real-ip\`, then "unknown" — Vercel's edge sets both, so most prod traffic resolves cleanly. The "unknown" bucket effectively rate-limits the union of clients behind broken proxies, which is acceptable on a contact form.

Returning \`{ remaining }\` in the success body lets the client display "4 messages left this hour" without a separate quota endpoint. The limit returns 429 with a friendly message — the front-end maps that to a banner ("you've sent several messages in a short window") instead of a generic error toast.

The trade-off this design makes explicit: in-memory state is not multi-region. If two Vercel regions warm up concurrently, an attacker gets 5 sends per region. For a portfolio that's fine; if this were SaaS sign-up traffic, swap the Map for an Upstash Redis SETNX with TTL.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'app-router', 'rate-limiting', 'route-handler', 'contact-form'],
    repository: repo,
    filePath: 'app/api/contact/route.ts',
    url: blob('app/api/contact/route.ts'),
  },
  {
    title: 'Graceful 503 + mailto fallback when Resend is not configured',
    body: `The contact route prefers a real Resend send, but production hasn't always had \`RESEND_API_KEY\` wired up — and silently dropping a recruiter's message is the worst possible failure mode. The route returns a structured 503 that the client recognises and uses to open a \`mailto:\` instead.

\`\`\`ts
if (!apiKey) {
  return NextResponse.json(
    {
      ok: false,
      fallback: "mailto",
      error:
        "Email service not configured. Opening your mail client instead.",
    },
    { status: 503 }
  );
}
\`\`\`

The client side (\`app/contact/ContactContent.tsx\`) checks for that exact shape:

\`\`\`ts
if (res.status === 503) {
  const payload = await res.json().catch(() => ({}));
  if (payload?.fallback === "mailto") {
    openMailtoFallback(data);
    setSubmitStatus("success-fallback");
    reset();
    return;
  }
}
\`\`\`

\`openMailtoFallback\` URI-encodes the form data into a \`mailto:\` link with the same subject prefix the server would have used (\`[Portfolio Contact] ...\`) so any reply chain stays consistent regardless of which path delivered the message.

This pattern — server returns a structured error with a \`fallback\` discriminator, client switches transport — is worth copying any time you have an optional integration. The alternatives (a) hide the failure (bad UX, recruiter never reaches you), (b) show a generic "try again later" (also bad — the user can't do anything), or (c) do client-side env detection (impossible, the secret is server-side). The 503-with-shape pattern degrades the UX one notch (mail client opens) instead of breaking it.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'resend', 'graceful-degradation', 'mailto', 'contact-form'],
    repository: repo,
    filePath: 'app/api/contact/route.ts',
    url: blob('app/api/contact/route.ts'),
  },
  {
    title: 'Promise timeout wrapper for upstream APIs (statistics route)',
    body: `The /statistics page calls GitHub GraphQL + LeetCode GraphQL on every request. Both are public APIs without SLAs; either can hang, and Vercel's serverless function timeout would make the whole page 500. The route wraps each upstream call in a \`withTimeout\` helper that races the promise against a setTimeout-backed rejection.

\`\`\`ts
const UPSTREAM_TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(\`\${label} timed out after \${ms}ms\`)),
      ms
    );
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
\`\`\`

The label parameter is the small touch that makes log triage easy — instead of "fetch timed out" you get "GitHub stats fetch timed out after 10000ms". When recruiters open /statistics during peak hours and one upstream is flaky, the logs immediately point at which one.

Crucially, the timeout doesn't kill the request — it falls through to a committed \`statistics-snapshot.json\` that ships with the repo. So the page always renders real numbers from the last successful fetch, never a "Loading..." spinner that hangs forever.

Two implementation details worth noting: (1) \`clearTimeout\` runs on both branches so a fast resolution doesn't leak a setTimeout into the event loop. (2) The label is captured by closure in the rejection error, so you can grep logs by upstream name. AbortController would be a slightly cleaner version of this pattern when the underlying fetch supports signal-based cancellation, but the timeout-wrapper works for any thenable.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'timeout', 'promise', 'fault-tolerance', 'route-handler'],
    repository: repo,
    filePath: 'app/api/statistics/route.ts',
    url: blob('app/api/statistics/route.ts'),
  },
  {
    title: 'Last-known-good snapshot fallback for flaky third-party APIs',
    body: `When GitHub or LeetCode is slow, the statistics route times out at 10s and serves a snapshot. The snapshot is a plain JSON file checked into the repo and read once per cold start, with the result cached at module scope.

\`\`\`ts
let cached: StatisticsPayload | null = null;

export function getStatisticsSnapshot(): StatisticsPayload {
  if (cached) return cached;
  try {
    const filePath = join(process.cwd(), "data", "statistics-snapshot.json");
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<StatisticsPayload> &
      Record<string, unknown>;
    cached = {
      github: parsed.github as StatisticsPayload["github"],
      leetcode: parsed.leetcode as StatisticsPayload["leetcode"],
    };
    return cached;
  } catch (error) {
    console.error("Failed to load statistics snapshot:", error);
    // Minimal fallback — keeps shape consistent so consumers don't crash.
    const emptyStreak = { count: 0, startDate: "", endDate: "" };
    cached = { github: { /* zeroed */ }, leetcode: { /* zeroed */ } };
    return cached;
  }
}
\`\`\`

Two design decisions are doing real work. First, the snapshot is also passed as \`initialData\` to the React Query hook on the client — so the SSR HTML for /statistics already contains real GitHub contribution counts, not a "Loading..." spinner. The client-side \`useQuery\` then re-fetches and overrides on hydration. Crawlers and slow connections both win.

Second, the empty-shape fallback in the catch isn't dead code. \`statistics-snapshot.json\` is in \`.prettierignore\` because it's a generated artifact; if a contributor accidentally deletes it during a rebase, the page degrades to zeros instead of throwing a 500. Same shape, missing data, no crash.

The snapshot is regenerated periodically by hitting the route locally, copying the response body, and committing it. A nice future improvement would be a GitHub Actions cron that does this automatically — but the manual loop is a lot of resilience for one JSON file.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'snapshot', 'fallback', 'ssr', 'caching'],
    repository: repo,
    filePath: 'lib/statistics-snapshot.ts',
    url: blob('lib/statistics-snapshot.ts'),
  },
  {
    title: 'GitHub contribution streaks: counting from local timezone, not UTC',
    body: `Streak calculations are timezone-sensitive in a way that's easy to miss. GitHub returns contribution timestamps in UTC; if you're in IST (UTC+5:30) and committed at 23:00 IST = 17:30 UTC, naively bucketing by UTC date gives the wrong day for half your evening commits, breaking the streak count for users near the date line.

The github-service helper normalises to IST before bucketing:

\`\`\`ts
export function getLocalDate(date = new Date()): string {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60 * 1000;
  const istTime = new Date(utcTime + istOffset);
  return istTime.toISOString().split("T")[0];
}
\`\`\`

Then the streak loop walks backwards from today, hopping one local day at a time:

\`\`\`ts
if (contributionsByDate[today] > 0) {
  currentStreak.count = 1;
  currentStreak.startDate = today;
  currentStreak.endDate = today;
  let checkDate = yesterday;
  while (contributionsByDate[checkDate] > 0) {
    currentStreak.count++;
    currentStreak.startDate = checkDate;
    checkDate = getLocalDate(
      new Date(new Date(checkDate).getTime() - 86400000)
    );
  }
}
\`\`\`

The "what if today has no contribution yet?" edge case is handled by also checking yesterday — otherwise opening the page at 8am IST would show streak=0 every morning until you committed, which is wrong (the streak isn't broken until midnight passes without a commit).

The hardcoded IST offset is a portfolio-author shortcut. Generalising means accepting the user's IANA timezone (\`Intl.DateTimeFormat().resolvedOptions().timeZone\`) and using \`Intl.DateTimeFormat\` to format with it; the rest of the algorithm stays the same.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-api', 'timezone', 'streaks', 'datetime', 'ist'],
    repository: repo,
    filePath: 'lib/github-service.ts',
    url: blob('lib/github-service.ts'),
  },
  {
    title: 'GitHub GraphQL: paginating contributions across multi-year windows',
    body: `GitHub's \`contributionsCollection\` accepts a \`from\`/\`to\` window but caps it at exactly one year. If you ask for "all contributions since 2024-01-01" in a single query, the API silently truncates. The fix is to walk the window in 1-year chunks and merge results.

\`\`\`ts
const oneYearInMs = 365 * 24 * 60 * 60 * 1000;

if (endTime - startTime > oneYearInMs) {
  let currentStartDate = new Date(startDate);
  while (currentStartDate.getTime() < now.getTime()) {
    const currentEndDate = new Date(
      Math.min(
        currentStartDate.getTime() + oneYearInMs - 1000,
        now.getTime()
      )
    );
    const periodData = await fetchGitHubContributionPeriod(
      username,
      currentStartDate.toISOString(),
      currentEndDate.toISOString()
    );
    if (periodData) {
      contributionData.totalContributions += periodData.totalContributions;
      contributionData.weeks.push(...periodData.weeks);
      contributionData.totalCommitContributions +=
        periodData.totalCommitContributions;
      // ...other counters
    }
    currentStartDate = new Date(currentEndDate.getTime() + 1000);
  }
}
\`\`\`

Two details worth copying: (1) The window end is \`-1000\` ms (one second short of one year) and the next iteration starts \`+1000\` ms after the previous end — that prevents the same midnight boundary from showing up in both buckets and double-counting whatever happened that day. (2) \`Math.min(..., now)\` clamps the final iteration so you never query a window that ends in the future (GitHub returns 0s for those, which would be merged-in noise).

The serial loop is intentional. GitHub's GraphQL endpoint rate-limits aggressively per token, and the contributionsCollection query is "expensive" by their own scoring. Going parallel with \`Promise.all\` here would burn the rate budget and force a longer cooldown — the latency win isn't worth it on a page that's cached at the edge anyway.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-api', 'graphql', 'pagination', 'contributions'],
    repository: repo,
    filePath: 'lib/github-service.ts',
    url: blob('lib/github-service.ts'),
  },
  {
    title: 'LeetCode submission calendar: merging multi-year payloads + direct fallback',
    body: `LeetCode's GraphQL only returns one year of \`submissionCalendar\` per call. To compute a multi-year longest streak, the service fans out one query per year, then merges the timestamp-keyed maps:

\`\`\`ts
const mergedCalendar: Record<string, number> = {};
let hasCalendarData = false;

for (const yearData of validYearsData) {
  if (yearData?.matchedUser?.submissionCalendar) {
    hasCalendarData = true;
    try {
      const cal = JSON.parse(yearData.matchedUser.submissionCalendar);
      Object.entries(cal).forEach(([ts, count]) => {
        mergedCalendar[ts] = (mergedCalendar[ts] ?? 0) + (count as number);
      });
    } catch (error) {
      console.error("Error parsing submission calendar:", error);
    }
  }
}

// Fallback: try direct calendar endpoint if calendar is sparse
if (!hasCalendarData || Object.keys(mergedCalendar).length < 366) {
  const res = await axios.get(
    \`https://leetcode.com/api/user_submission_calendar/\${username}/\`,
    { headers: BROWSER_HEADERS }
  );
  if (res.data) {
    const directCal = JSON.parse(res.data);
    Object.entries(directCal).forEach(([ts, count]) => {
      mergedCalendar[ts] = (mergedCalendar[ts] ?? 0) + (count as number);
    });
  }
}
\`\`\`

A few things make this resilient. First, the per-year fan-out uses \`Promise.all\` with each year wrapped in its own try/catch — one bad year doesn't poison the rest. Second, \`submissionCalendar\` is a JSON-stringified field inside a JSON response (LeetCode quirk), so it gets a defensive \`JSON.parse\` with a catch. Third, the "< 366" sparse-data check kicks in when LeetCode's GraphQL returns a stripped-down calendar (which it does intermittently) and falls through to the legacy direct-calendar endpoint as a backup data source.

The \`BROWSER_HEADERS\` constant (User-Agent, Referer) is required because LeetCode's GraphQL gateway 403s requests without them, treating bare-fetch traffic as scraping.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['leetcode', 'graphql', 'streaks', 'fallback', 'web-scraping'],
    repository: repo,
    filePath: 'lib/leetcode-service.ts',
    url: blob('lib/leetcode-service.ts'),
  },
  {
    title: 'Edge runtime OG image generation with @vercel/og',
    body: `Every blog post and project detail page needs a unique social-card image. Pre-generating 21 PNG files (one per post) and committing them is brittle — every title edit needs an image regen. Instead, the route generates the image on demand at the edge using \`next/og\` (which is just \`@vercel/og\` re-exported under the App Router).

\`\`\`ts
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title") ?? "Shailesh Chaudhari";
  const type = searchParams.get("type") ?? "blog";
  const description = searchParams.get("description") ?? "";

  const truncatedTitle = title.length > 70 ? title.slice(0, 67) + "..." : title;
  // ...

  return new ImageResponse(
    <div style={{ /* JSX with inline styles only */ }}>
      {/* type label, title, description, footer */}
    </div>,
    { width: 1200, height: 630 }
  );
}
\`\`\`

Three constraints make this work at edge: (1) \`runtime = "edge"\` is mandatory — \`@vercel/og\` uses Satori, which only ships in the edge runtime. (2) Only inline \`style\` props are allowed, no Tailwind classes — Satori doesn't run a CSS engine, it walks the React tree converting style objects into SVG attributes. (3) Layout uses \`display: "flex"\` everywhere with explicit flex direction; default block layout breaks Satori in subtle ways (most often: text overflowing the box silently).

The blog post metadata then references it as a query-string URL: \`/api/og?title=...&type=blog\`. Twitter and LinkedIn fetch this URL when they unfurl a link, so the dynamic image is what shows up in social previews. The 1200×630 dimensions are the sweet spot for both Twitter summary cards and LinkedIn link unfurls.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'edge-runtime', 'og-image', 'satori', 'social-cards'],
    repository: repo,
    filePath: 'app/api/og/route.tsx',
    url: blob('app/api/og/route.tsx'),
  },
  {
    title: 'Anti-FOUC dark-mode script in App Router root layout',
    body: `next-themes handles theming nicely under the Pages router, but App Router's RSC-first rendering pipeline means the client-side theme detection runs after the first paint — which produces a "flash of light content" before dark mode kicks in. The fix is a synchronous inline script in the layout's \`<head>\` that runs before React hydration:

\`\`\`tsx
<script
  dangerouslySetInnerHTML={{
    __html: \`(function(){try{var t=localStorage.getItem('theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&m)||(t==='system'&&m)){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}else{document.documentElement.style.colorScheme='light';}}catch(e){}})();\`,
  }}
/>
\`\`\`

The IIFE structure is deliberate — no top-level \`var\` leaks into the global scope, and the entire thing is wrapped in try/catch so a localStorage exception (private browsing in some Safari versions) doesn't blank the page. The two-step decision is: (1) explicit user preference wins, (2) no preference + OS dark = dark, (3) anything else = light.

Setting \`colorScheme\` on the documentElement is the often-forgotten second half. Without it, native form controls (scrollbars, date pickers, system menus) render in light mode even when the body is dark, producing visible white scrollbar tracks that flash during scroll.

The script must be inline (not src=) and synchronous (not defer/async) — async loading defeats the whole point. The cost is roughly 400 bytes of HTML, which is well worth zero theme flash. \`next-themes\`' \`<ThemeProvider>\` still mounts on the body and takes over once React hydrates, so toggle-button reactivity continues to work.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'app-router', 'dark-mode', 'fouc', 'next-themes'],
    repository: repo,
    filePath: 'app/layout.tsx',
    url: blob('app/layout.tsx'),
  },
  {
    title: 'Person + WebSite JSON-LD schema for Knowledge Graph entry',
    body: `Recruiters search "Shailesh Chaudhari" on Google. Without structured data, Google guesses what entity you are; with a Person schema, you get a Knowledge Graph card with a photo, job title, employer, and links to all your profiles. The portfolio's root layout emits two JSON-LD blobs:

\`\`\`tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Person",
      "@id": \`\${SITE_URL}/#person\`,
      name: BLOG_AUTHOR.name,
      alternateName: ["Shaileshbhai Chaudhari", PROFILE.name.preferred],
      jobTitle: PROFILE.role.title,
      url: SITE_URL,
      sameAs: [
        BLOG_AUTHOR.social.github,
        BLOG_AUTHOR.social.linkedin,
        BLOG_AUTHOR.social.twitter,
        "https://leetcode.com/u/Shaileshbhai/",
        // ... more profile URLs
      ],
      worksFor: {
        "@type": "Organization",
        name: "ContextQA",
        url: "https://contextqa.com",
      },
      // ...
    }),
  }}
/>
\`\`\`

The \`@id\` field is the load-bearing piece — \`{SITE_URL}/#person\` becomes a stable identifier that other schemas on the same page (BlogPosting, WebPage) can reference with \`{ "@id": "..." }\` to form a graph instead of a flat list. The \`sameAs\` array is what gives Google the cross-platform identity confirmation it needs to merge LinkedIn + GitHub + LeetCode profiles into one entity.

The second blob is a WebSite schema with a SearchAction \`potentialAction\`:

\`\`\`ts
potentialAction: {
  "@type": "SearchAction",
  target: {
    "@type": "EntryPoint",
    urlTemplate: \`\${SITE_URL}/blogs?search={search_term_string}\`,
  },
  "query-input": "required name=search_term_string",
}
\`\`\`

That unlocks the Sitelinks Searchbox in Google's site result — a search field embedded directly under your entry, which Google routes to /blogs?search=foo. Costs nothing, only works if the schema is present.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['seo', 'jsonld', 'schema-org', 'knowledge-graph', 'nextjs'],
    repository: repo,
    filePath: 'app/layout.tsx',
    url: blob('app/layout.tsx'),
  },
  {
    title: 'next/dynamic with ssr:false to lazy-load recharts',
    body: `recharts pulls in d3 internals and a non-trivial amount of D3 plumbing — bundling it on every page would inflate the shared chunk for routes that never render a chart. The statistics page is the only consumer, and it imports the component dynamically with SSR disabled:

\`\`\`tsx
const StatsCharts = dynamic(
  () => import("@/components/stats-charts").then((mod) => mod.StatsCharts),
  { ssr: false }
);
\`\`\`

Two effects worth understanding. First, the import is code-split — recharts only downloads when /statistics actually renders, not on the home page. Second, \`ssr: false\` means the chart never tries to render server-side. recharts uses ResponsiveContainer, which queries DOM dimensions; on the server those are 0, producing 0×0 charts that hydrate awkwardly. Skipping SSR sidesteps the whole problem and lets the chart measure its container correctly on first client render.

The Vercel Speed Insights script is wrapped in the same pattern (\`components/speed-insights-client.tsx\`):

\`\`\`tsx
const SpeedInsights = dynamic(
  () => import("@vercel/speed-insights/next").then((mod) => mod.SpeedInsights),
  { ssr: false }
);
\`\`\`

Telemetry packages benefit from \`ssr: false\` because they hook into \`window.performance\` APIs that don't exist server-side. Wrapping in a thin client component (the parent layout is server-rendered) lets the rest of the layout stay RSC.

A subtle gotcha: \`next/dynamic\` with \`ssr: false\` inside a Server Component is forbidden in Next.js 14+. The parent must be a "use client" boundary or a "use client" wrapper file (which is exactly what \`speed-insights-client.tsx\` is). The portfolio's CLAUDE.md flags this trap because the Turbopack SSG build crashes with a misleading "Element type is invalid" error when the rule is broken.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'code-splitting', 'dynamic-import', 'recharts', 'performance'],
    repository: repo,
    filePath: 'components/stats-charts.tsx',
    url: blob('components/stats-charts.tsx'),
  },
  {
    title: '"use client" gotcha for framer-motion in loading.tsx skeletons',
    body: `Next.js App Router supports a sibling \`loading.tsx\` file that renders during route transitions. The portfolio uses one for /portfolio, with a framer-motion staggered skeleton. The directive at the top is load-bearing:

\`\`\`tsx
"use client";

import React from "react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { staggerContainer, fadeIn } from "@/lib/animations";

export function PortfolioSkeleton() {
  return (
    <div className="container py-24">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer(0.1)}
        className="mb-16 space-y-4 text-center"
      >
        {/* ... */}
      </motion.div>
    </div>
  );
}
\`\`\`

If you remove the \`"use client"\`, the production build of /portfolio crashes with: \`Error: Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined.\` The error message blames the parent component; the actual culprit is \`motion.div\` resolving to undefined during SSG because framer-motion's main entry is client-only.

The portfolio's CLAUDE.md calls this out as a documented gotcha because the team wasted hours debugging it. The rule is simple: any file that imports from \`framer-motion\` (even just for \`motion.div\`) must be a client component, full stop. Server Components cannot render motion primitives, even if the parent is a client component — the import resolution happens at module load.

The same rule applies to the Showcase components (\`ArchitectureDiagram\`, \`KeyMetrics\`, \`ThemeComparison\`, \`StripeCaseStudy\`). All four start with \`"use client"\` for exactly this reason.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'app-router', 'framer-motion', 'use-client', 'loading-ui'],
    repository: repo,
    filePath: 'app/portfolio/PortfolioSkeleton.tsx',
    url: blob('app/portfolio/PortfolioSkeleton.tsx'),
  },
  {
    title: 'Daily URL health check that parses projects.ts directly',
    body: `Recruiters open every link on a portfolio. A live demo URL that 404s because Vercel sunset a deploy, or a GitHub link that points at a renamed repo, is a credibility hit you don't see until someone tells you. The health-check script reads URLs straight from \`constants/projects.ts\` so it never drifts:

\`\`\`js
function parseProjectUrls() {
  const src = readFileSync(PROJECTS_TS, "utf8");
  const lines = src.split("\\n");

  const urls = [];
  let currentId = null;

  for (const line of lines) {
    const idMatch = line.match(/^\\s*id:\\s*"([^"]+)"/);
    if (idMatch) currentId = idMatch[1];

    const liveMatch = line.match(/^\\s*live:\\s*"(https?:\\/\\/[^"]+)"/);
    if (liveMatch && currentId) {
      urls.push({ name: \`\${currentId} (live)\`, url: liveMatch[1], kind: "live" });
    }

    const githubMatch = line.match(/^\\s*github:\\s*"(https?:\\/\\/[^"]+)"/);
    if (githubMatch && currentId) {
      urls.push({ name: \`\${currentId} (github)\`, url: githubMatch[1], kind: "github" });
    }
  }
  // ...
}
\`\`\`

The trade-off is interesting: parsing the TS file with regex avoids needing ts-node or a build step, but couples the script to the source layout. The decision was line-regex-over-AST because the projects.ts file is small (~6 projects) and the URL patterns are stable.

A \`KNOWN_PRIVATE\` allowlist handles the in-flight case where a project repo is still private (so its GitHub URL 404s) — it's allowed to fail without breaking the script, with a comment that "leaving an entry here for too long defeats the purpose of the check, so treat this as a 7-day maximum." That's the pattern: every escape hatch is documented with its own expiry.

The whole thing runs daily as a GitHub Actions cron (\`.github/workflows/url-health-check.yml\`) at 10:00 UTC — one hour after the per-project Vercel keep-alive crons fire at 09:00, so any project that's going to wake up has had a chance to do so before the check runs.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['ci', 'github-actions', 'url-health', 'monitoring', 'portfolio'],
    repository: repo,
    filePath: 'scripts/check-live-urls.mjs',
    url: blob('scripts/check-live-urls.mjs'),
  },
  {
    title: 'GitHub Actions cron for portfolio URL health (daily 10:00 UTC)',
    body: `The companion workflow to the URL-health script. It runs daily, sends GitHub email notifications on failure, and writes a structured \`$GITHUB_STEP_SUMMARY\` block so the failure appears in the GitHub UI without diving into raw logs.

\`\`\`yaml
name: URL Health Check

on:
  schedule:
    # Daily at 10:00 UTC — one hour after the Vercel keep-alive crons
    # (0 9 * * *) so if a project is going to wake up, it already has.
    - cron: "0 10 * * *"
  workflow_dispatch: {}

permissions:
  contents: read

jobs:
  check:
    name: Check live project URLs
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Ping every live URL
        run: node scripts/check-live-urls.mjs
      - name: Summary
        if: always()
        run: |
          echo "### URL Health Check" >> $GITHUB_STEP_SUMMARY
          if [ "\${{ job.status }}" = "success" ]; then
            echo "All live URLs returned 2xx." >> $GITHUB_STEP_SUMMARY
          else
            echo "One or more URLs failed — see job logs." >> $GITHUB_STEP_SUMMARY
            echo "Common causes:" >> $GITHUB_STEP_SUMMARY
            echo "- Supabase free-tier auto-paused" >> $GITHUB_STEP_SUMMARY
            echo "- Vercel deploy regression" >> $GITHUB_STEP_SUMMARY
            echo "- DNS / upstream outage" >> $GITHUB_STEP_SUMMARY
          fi
\`\`\`

Three pieces of craft here. First, \`if: always()\` on the Summary step means the diagnostic guidance shows up on failures, not just successes — exactly when you need it. Second, the cron timing is documented in a comment relative to other crons in the system; future-you reading this in six months knows why 10:00 UTC and not midnight. Third, \`workflow_dispatch: {}\` lets you trigger the check manually from the Actions tab when you want to verify a fresh deploy without waiting for the schedule.

\`permissions: contents: read\` is the minimum surface — the job only reads checked-out files, doesn't push or comment, so locking it down means a compromised dependency can't escalate.`,
    contentType: 'REPOSITORY_FILE',
    language: 'yaml',
    tags: ['github-actions', 'cron', 'monitoring', 'workflow', 'ci'],
    repository: repo,
    filePath: '.github/workflows/url-health-check.yml',
    url: blob('.github/workflows/url-health-check.yml'),
  },
  {
    title: 'Playwright screenshot generator: theme + viewport matrix in nested loops',
    body: `Marketing screenshots for the portfolio README + recruiter Slack pings need to be regenerable on demand, in light + dark, across mobile and desktop. The Playwright spec generates them all (7 pages × 5 viewports × 2 themes = 70 PNGs) by nesting three loops inside a \`test()\` factory:

\`\`\`ts
const pages = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "portfolio", path: "/portfolio" },
  // ...
];

const viewports = [
  { label: "desktop-xl", width: 1920, height: 1080 },
  { label: "desktop", width: 1440, height: 900 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "mobile", width: 390, height: 844 },
  { label: "mobile-sm", width: 320, height: 568 },
];

const themes: Array<"light" | "dark"> = ["light", "dark"];

for (const { name, path: pagePath } of pages) {
  for (const { label, width, height } of viewports) {
    for (const theme of themes) {
      test(\`screenshot: \${name} (\${label}, \${theme})\`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.goto(pagePath, { waitUntil: "networkidle" });
        await setTheme(page, theme);
        await disableAnimations(page);
        await page.waitForTimeout(300);
        await page.screenshot({
          path: node_path.join(screenshotDir, \`\${name}-\${label}-\${theme}.png\`),
          fullPage: true,
        });
      });
    }
  }
}
\`\`\`

The two helpers carry the design weight. \`setTheme\` writes \`localStorage.theme\` then reloads — that's how next-themes gets the value before first paint. Naively setting the theme after load means the first paint is wrong-themed, which the screenshot captures.

\`disableAnimations\` injects a stylesheet that drops every transition and animation duration to 0.001ms, then walks any inline styles and resets opacity-0 / translateY transforms. Without this, framer-motion's enter animations are mid-flight when the screenshot fires, producing half-faded hero text.

Including \`mobile-sm\` (320×568, iPhone SE class) is deliberate — it catches tight-column overflow that 390 hides. \`desktop-xl\` (1920) catches gutter and hero-strand-limit issues that 1440 hides.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['playwright', 'screenshots', 'visual-regression', 'theme', 'responsive'],
    repository: repo,
    filePath: 'e2e/screenshots.spec.ts',
    url: blob('e2e/screenshots.spec.ts'),
  },
  {
    title: 'Console-error + broken-link gate for production routes',
    body: `One red-underlined 404 in a recruiter's DevTools is a credibility hit. This Playwright spec walks every route, listens for console errors and bad responses, and fails CI if anything internal returns 4xx/5xx or logs an error.

\`\`\`ts
const benignMsgPatterns = [
  /google-analytics/i,
  /googletagmanager/i,
  /vitals\\.vercel/i,
  /vercel-insights/i,
  /_vercel\\/insights/i,
  /clarity\\.ms/i,
  /sentry/i,
  /doubleclick/i,
  /NotAllowedError/i, // audio autoplay blocked
];

page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  const text = msg.text();
  if (benignMsgPatterns.some((p) => p.test(text))) return;
  if (/Failed to load resource/i.test(text)) return;
  consoleErrors.push(text);
});

page.on("response", (response) => {
  const url = response.url();
  if (!isInternal(url, base)) return;
  if (benignUrlPatterns.some((p) => p.test(url))) return;
  const status = response.status();
  if (status >= 400) {
    badResponses.push(\`\${status} \${url}\`);
  }
});
\`\`\`

The whitelist is the realistic part. Vercel Insights / Speed Insights scripts only resolve on the real deploy; against a local \`next start\` they 404, and that's not a code bug. Same for GA + Sentry beacons. Filtering by URL pattern (rather than ignoring all 4xx) keeps the gate strict for everything that matters.

\`expect.soft\` for both arrays surfaces all failures at once instead of stopping at the first one — the dev sees the full picture per route in one CI run, not "fix this, push, see the next problem, fix that, push again."

The "Failed to load resource" filter is interesting: when a sub-resource 404s, Chrome logs both a console error and a response event. Skipping the console line and trusting the response listener prevents double-counting the same failure.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['playwright', 'console-errors', 'broken-links', 'ci-gate', 'e2e'],
    repository: repo,
    filePath: 'e2e/console-and-links.spec.ts',
    url: blob('e2e/console-and-links.spec.ts'),
  },
  {
    title: 'Build-time blog manifest generator (postbuild script)',
    body: `Blog posts live as MDX files in \`content/blog/\`. \`next-sitemap\` and other downstream tooling need slug + date pairs without parsing MDX themselves. A small Node script runs as \`postbuild\` and emits \`data/blog-manifest.json\`:

\`\`\`js
import fs from "fs";
import path from "path";
import matter from "gray-matter";

const repoRoot = path.resolve(new URL(".", import.meta.url).pathname, "..");
const contentDir = path.join(repoRoot, "content", "blog");
const outDir = path.join(repoRoot, "data");
const outFile = path.join(outDir, "blog-manifest.json");

async function main() {
  try {
    const files = fs.readdirSync(contentDir).filter((f) => f.endsWith(".mdx"));

    const results = files
      .map((file) => {
        const slug = file.replace(/\\.mdx$/, "");
        const raw = fs.readFileSync(path.join(contentDir, file), "utf8");
        const { data } = matter(raw);
        return { slug, date: data.date ?? "" };
      })
      .sort((a, b) => a.slug.localeCompare(b.slug));

    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(results, null, 2), "utf8");

    console.log(\`Generated blog-manifest.json with \${results.length} entries\`);
  } catch (err) {
    console.error("Failed to generate blog manifest:", err);
    process.exit(1);
  }
}

main();
\`\`\`

The pattern: filesystem walk → \`gray-matter\` to extract frontmatter → JSON dump to \`data/\`. The output is sorted alphabetically (not by date) so the file is diff-stable across builds — adding one new post produces a one-line git diff instead of a re-shuffle.

\`process.exit(1)\` on error is non-negotiable because this runs in CI; a silent failure means deploys ship a stale manifest. \`mkdirSync\` with \`recursive: true\` is the idiomatic "create-or-pass" pattern in Node since 10.

The companion concern: \`data/blog-manifest.json\` is in \`.prettierignore\`. Every CI build regenerates it, but Prettier's \`format:check\` step would flag the regenerated file if its formatting drifted from the previous run. Listing it in the ignore file decouples those two concerns.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['mdx', 'blog', 'gray-matter', 'build-script', 'sitemap'],
    repository: repo,
    filePath: 'scripts/generate-blog-manifest.mjs',
    url: blob('scripts/generate-blog-manifest.mjs'),
  },
  {
    title: 'MDX blog: explicit slug allowlist instead of filesystem auto-discovery',
    body: `The blog could enumerate every \`.mdx\` file in \`content/blog/\` and treat it as a post — that's the trendy pattern. Instead this codebase keeps an explicit \`BLOG_SLUGS\` array and any file not in it is invisible:

\`\`\`ts
export const BLOG_SLUGS: string[] = [
  "introduction-to-nestjs-for-backend-development",
  "how-to-use-nextjs-for-seo-friendly-web-apps",
  // ... 15 more shipped slugs
  // DRAFTS — uncomment each slug after filling in [FILL IN:] placeholders
  // "eduscale-redis-distributed-locks-real-time",
  // "postgres-rbac-eduscale-permissions",
  // "khatago-webhook-deduplication-receipt-pipeline",
];

function loadPost(slug: string): BlogPost | null {
  try {
    const filePath = join(process.cwd(), "content", "blog", \`\${slug}.mdx\`);
    const raw = readFileSync(filePath, "utf8");
    const { data, content } = matter(raw);
    return { slug, title: data.title ?? "", /* ... */ };
  } catch {
    return null;
  }
}

export const blogPosts: BlogPost[] = BLOG_SLUGS.map(loadPost).filter(
  Boolean
) as BlogPost[];
\`\`\`

Why allowlist over auto-discovery? Three reasons. (1) Drafts can sit in \`content/blog/\` half-finished without accidentally publishing — the file exists, the slug is commented out, no sitemap entry is generated, no RSS item appears. (2) Publication order is editor-controlled, not date-controlled — useful when you want to backfill an "about EduScale" post but not jump it to the top of the feed. (3) Renaming a file by accident doesn't 404 a live URL — the slug list is the contract, not the filename.

The trade-off is one line of bookkeeping per post. Worth it for the predictability.

The downstream consumer \`getRelatedPosts(slug, limit = 3)\` walks the loaded array and matches by tag overlap; \`getPostsByTag\`, \`getAllTags\`, and \`getFeaturedPosts\` are all simple filters over the same list. Loading happens once at module init (server-side only — \`fs\` is intentional), so subsequent reads are zero-cost.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['mdx', 'blog', 'gray-matter', 'allowlist', 'nextjs'],
    repository: repo,
    filePath: 'lib/blog-data.ts',
    url: blob('lib/blog-data.ts'),
  },
  {
    title: 'Hand-rolled RSS feed via App Router route handler',
    body: `RSS doesn't need a library. The portfolio's \`/feed.xml\` is a server route that serializes \`blogPosts\` (loaded from MDX) into RSS 2.0 with proper XML escaping and HTTP caching headers:

\`\`\`ts
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const sorted = [...blogPosts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const items = sorted
    .map((post) => {
      const pubDate = new Date(post.date).toUTCString();
      const link = \`\${BASE_URL}/blog/\${post.slug}\`;
      return \`
    <item>
      <title>\${escapeXml(post.title)}</title>
      <link>\${link}</link>
      <guid isPermaLink="true">\${link}</guid>
      <description>\${escapeXml(post.description)}</description>
      <pubDate>\${pubDate}</pubDate>
      <author>\${escapeXml(AUTHOR)}</author>
      \${post.tags.map((t) => \`<category>\${escapeXml(t)}</category>\`).join("\\n      ")}
    </item>\`;
    })
    .join("");

  const xml = \`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>\${escapeXml(AUTHOR)} — Blog</title>
    <link>\${BASE_URL}/blogs</link>
    <atom:link href="\${BASE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>\${new Date().toUTCString()}</lastBuildDate>
    \${items}
  </channel>
</rss>\`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
\`\`\`

Three details readers reuse RSS readers care about: (1) \`<guid isPermaLink="true">\` matches the link, so feed readers de-duplicate correctly when the title is edited. (2) \`<atom:link rel="self">\` is what RSS validators want to see for "this feed's canonical URL" — without it the feed flags as malformed in some readers. (3) \`pubDate\` uses RFC-822 (\`toUTCString\`), not ISO-8601 — RSS spec is strict about this.

The 1-hour cache header is conservative for a blog that updates a few times a year.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['rss', 'nextjs', 'route-handler', 'xml', 'blog'],
    repository: repo,
    filePath: 'app/feed.xml/route.ts',
    url: blob('app/feed.xml/route.ts'),
  },
  {
    title: 'Reading progress bar via scroll listener + scaleX transform',
    body: `Long-form blog posts get a thin gradient bar at the top of the viewport that fills as you scroll. Implemented in 30 lines, no IntersectionObserver, no library:

\`\`\`tsx
"use client";

import { useEffect, useState } from "react";

export function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const scrollY = window.scrollY;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docHeight > 0 ? (scrollY / docHeight) * 100 : 0);
    };

    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <div
      role="progressbar"
      aria-label="Reading progress"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="fixed left-0 top-0 z-50 h-1 w-full bg-transparent"
    >
      <div
        className="h-full bg-gradient-to-r from-[hsl(var(--hero-gradient-from))] to-[hsl(var(--hero-gradient-to))] transition-none"
        style={{
          transform: \`scaleX(\${progress / 100})\`,
          transformOrigin: "left",
        }}
      />
    </div>
  );
}
\`\`\`

Three small pieces matter. First, \`{ passive: true }\` on the scroll listener — required for smooth scrolling on mobile, because non-passive listeners block the compositor thread. Second, \`update()\` runs once on mount so the bar reflects the current scroll position when you navigate to a deep-link URL (otherwise it starts at 0% even when you've already scrolled halfway). Third, \`scaleX\` instead of width animation — scale runs on the GPU compositor and never triggers layout, so it stays at 60fps even on cheap phones. \`width: X%\` would force a paint on every scroll tick.

The proper ARIA attributes (\`role="progressbar"\`, \`aria-valuenow\`, min/max) make it discoverable to screen readers as a non-interactive progress indicator. Setting \`aria-label\` once on the wrapper is enough — no per-update SR announcements, which would be noise.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'scroll-listener', 'a11y', 'gpu-transform', 'blog'],
    repository: repo,
    filePath: 'components/ReadingProgressBar.tsx',
    url: blob('components/ReadingProgressBar.tsx'),
  },
  {
    title: 'Mobile menu with body-scroll lock + inert for a11y',
    body: `Sliding a full-screen mobile drawer over the main content has two non-obvious responsibilities: lock scroll on the underlying body, and remove the closed drawer from the focus order so screen readers don't tab into invisible links.

\`\`\`tsx
useEffect(() => {
  if (menuOpen) {
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "unset";
  }
  return () => {
    document.body.style.overflow = "unset";
  };
}, [menuOpen]);

// ...

<div
  className={\`fixed inset-0 z-[999] flex h-[100vh] transform flex-col border-l border-border/40 bg-background/95 backdrop-blur-sm transition-transform duration-300 ease-out md:hidden \${
    menuOpen
      ? "translate-x-0 opacity-100"
      : "pointer-events-none translate-x-full opacity-0"
  }\`}
  aria-hidden={!menuOpen}
  inert={!menuOpen}
>
\`\`\`

The body-scroll lock is the obvious one — without it, scrolling inside the drawer also scrolls the page underneath. The cleanup function (\`return () => ...\`) handles the corner case where the menu is open and the user navigates away (router transition unmounts the navbar, body would stay locked forever).

The \`inert\` attribute is the underrated piece. \`aria-hidden\` alone hides the drawer from the accessibility tree but doesn't remove its links from the keyboard tab order — meaning a user pressing Tab on the home page would land inside the closed mobile menu and have no way to escape. \`inert\` (a fairly recent platform feature) removes the entire subtree from the focus order *and* makes pointer events pass through. The portfolio's CLAUDE.md notes that this exact pattern fixed an axe \`aria-hidden-focus\` violation that had been flagged in earlier audits.

Animating with CSS transforms (\`translate-x-full\` → \`translate-x-0\`) instead of framer-motion is also intentional here — it avoids bundling the framer-motion runtime on the navbar, which renders on every page.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'a11y', 'inert', 'mobile-menu', 'scroll-lock'],
    repository: repo,
    filePath: 'components/navbar/index.tsx',
    url: blob('components/navbar/index.tsx'),
  },
  {
    title: 'Showcase ThemeComparison: light/dark image toggle for project screenshots',
    body: `On project detail pages, you want to show recruiters that you actually styled the app for both themes. ThemeComparison is a small client component that swaps between two pre-rendered screenshots with a framer-motion crossfade:

\`\`\`tsx
"use client";

export default function ThemeComparison({
  lightImage, darkImage, title,
}: Props) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  return (
    <div className="space-y-4">
      <div className="flex rounded-full border border-border/50 bg-muted p-1">
        <button
          onClick={() => setTheme("dark")}
          aria-label="Show dark-mode preview"
          aria-pressed={theme === "dark"}
          className={\`rounded-full p-2 \${theme === "dark" ? "bg-background text-primary shadow-sm" : "text-muted-foreground"}\`}
        >
          <MoonIcon aria-hidden="true" className="h-4 w-4" />
        </button>
        <button onClick={() => setTheme("light")} aria-label="Show light-mode preview" aria-pressed={theme === "light"}>
          <SunIcon aria-hidden="true" />
        </button>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border/50 bg-black/5 shadow-2xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={theme}
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="absolute inset-0"
          >
            <Image
              src={theme === "dark" ? darkImage : lightImage}
              alt={\`\${title} in \${theme} mode\`}
              fill className="object-cover"
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
\`\`\`

Two craft points. \`AnimatePresence mode="wait"\` makes the exit animation finish before the enter starts — without it, you get a jarring overlap. The \`key={theme}\` is what tells React (and AnimatePresence) that this is a new component to mount/unmount, not a prop change.

\`aria-pressed\` on the toggle buttons is the right semantics for a stateful toggle pair (vs. \`aria-checked\` which is for radios). Decorative icons get \`aria-hidden\`; the button itself carries the accessible label. The image alt-text is interpolated to include the current theme so the SR user knows which preview is showing.

The screenshots themselves are generated by the Playwright spec at \`e2e/screenshots.spec.ts\` — closing the loop between visual regression capture and recruiter-facing showcase.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'framer-motion', 'theme', 'a11y', 'showcase'],
    repository: repo,
    filePath: 'components/Showcase/ThemeComparison.tsx',
    url: blob('components/Showcase/ThemeComparison.tsx'),
  },
  {
    title: 'GitHub heatmap: weekly buckets + level-based Tailwind opacity',
    body: `The /statistics page renders a 365-day GitHub-style contribution heatmap. The reactive part is bucketing flat \`{ date, count, level }\` arrays into 7-day weekly columns and mapping the level (0–4) to a Tailwind opacity class:

\`\`\`tsx
// Group contributions by week
const weeks: ContributionDay[][] = [];
let currentWeek: ContributionDay[] = [];

contributionData.forEach((day, index) => {
  currentWeek.push(day);
  if (currentWeek.length === 7 || index === contributionData.length - 1) {
    weeks.push([...currentWeek]);
    currentWeek = [];
  }
});

const getColorByLevel = (level: number) => {
  switch (level) {
    case 0: return "bg-primary/10 dark:bg-primary/5";
    case 1: return "bg-primary/30 dark:bg-primary/25";
    case 2: return "bg-primary/50 dark:bg-primary/45";
    case 3: return "bg-primary/70 dark:bg-primary/65";
    case 4: return "bg-primary/90 dark:bg-primary/85";
    default: return "bg-primary/10 dark:bg-primary/5";
  }
};
\`\`\`

The opacity-class trick avoids a \`getComputedStyle\` call or a \`<style>\` injection. Tailwind's \`/N\` modifier sets background opacity inline at compile time, so each color is a pre-generated class — meaning the heatmap can render 365 cells without inflating the runtime CSS.

Dark mode uses lower opacities (5/25/45/65/85 vs 10/30/50/70/90) because pure-color cells against a dark background read as more saturated than the same opacity against a light background. The eyeballed difference matches what GitHub itself does on github.com.

Each cell is wrapped in a \`<Tooltip>\` showing the date + contribution count on hover, and a 365-day total is rendered above the grid:

\`\`\`tsx
<p className="text-sm text-muted-foreground">
  Last 365 days · Total:{" "}
  <span className="font-medium text-foreground">
    {contributionData.reduce((a, d) => a + d.count, 0).toLocaleString("en-US")}
  </span>{" "}
  contributions
</p>
\`\`\`

That total reconciles the heatmap against the stat cards above it — recruiters who scan the page get visual proof that the heatmap is the same data as the headline number, not hardcoded.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'github', 'heatmap', 'tailwind', 'visualization'],
    repository: repo,
    filePath: 'components/github-contribution-heatmap.tsx',
    url: blob('components/github-contribution-heatmap.tsx'),
  },
  {
    title: 'Per-post OG image URL in generateMetadata (dynamic social cards)',
    body: `Each blog post wants a unique social-share card. Pre-rendering 21 PNGs is wasteful and brittle when titles change. The pattern: use Next.js's \`generateMetadata\` to point Open Graph + Twitter at the dynamic /api/og endpoint, with the post's title encoded into the query string.

\`\`\`ts
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = (await params)?.slug;
  const post = await getPostData(slug);
  if (!post) return {};

  const title = \`\${post.title} | Shailesh Chaudhari's Blog\`;
  const description = \`\${post.description} Written by Shailesh Chaudhari, Full-Stack Developer and Software Engineer.\`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      publishedTime: post.date,
      authors: ["Shailesh Chaudhari"],
      tags: post.tags,
      images: [
        {
          url: \`/api/og?title=\${encodeURIComponent(post.title)}&type=blog\`,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      creator: META_DEFAULTS.twitterHandle,
      images: [post.image],
    },
    alternates: {
      canonical: \`\${SITE_URL}/blog/\${slug}\`,
    },
  };
}
\`\`\`

A few details worth absorbing. First, \`params\` is a Promise in Next.js 15+ (App Router) — \`await params\` is the new contract, and forgetting it produces a runtime warning that is easy to miss. Second, the OG image URL is a relative path — Next.js resolves it against \`metadataBase\` (set in the root layout) when emitting the actual \`<meta>\` tag, so you don't have to interpolate the site URL by hand. Third, \`type: "article"\` plus \`publishedTime\` plus \`authors\` plus \`tags\` is what makes Twitter show the rich article card with timestamp + byline instead of the plain summary card.

The Twitter card uses \`post.image\` (a static file) instead of the dynamic /api/og endpoint as a deliberate fallback — Twitter's image fetcher is sometimes finicky with edge-rendered images, and a static file is less likely to misbehave during link unfurling. Open Graph (LinkedIn, Slack, iMessage) gets the dynamic version, where the unique-per-post styling matters more.

\`alternates.canonical\` is the SEO no-brainer that's easy to forget on dynamic routes — without it, www.shaileshchaudhari.vercel.app/blog/foo and shaileshchaudhari.vercel.app/blog/foo can both rank, splitting link equity.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'metadata', 'og-image', 'seo', 'app-router'],
    repository: repo,
    filePath: 'app/blog/[slug]/page.tsx',
    url: blob('app/blog/[slug]/page.tsx'),
  },
  {
    title: 'Stripe webhook idempotency: SVG sequence diagram of SETNX dedup',
    body: `The portfolio's Stripe demo project deep-dive renders a hand-drawn SVG sequence diagram explaining how Redis SETNX prevents duplicate event processing when Stripe retries a webhook. The diagram is data-driven — two arrays (LEFT_LANE, RIGHT_LANE) describe each step's y-coordinate and source/target columns, and a render function emits the lines + arrowheads:

\`\`\`tsx
const LEFT_LANE: Step[] = [
  { y: 110, from: 80, to: 240, label: "POST evt_abc123", sub: "Stripe-Signature header" },
  { y: 170, from: 240, to: 400, label: "constructEvent() HMAC", sub: "verify signature" },
  { y: 230, from: 240, to: 400, label: "SETNX stripe:event:evt_abc123", sub: "returns 1 (set)" },
  { y: 290, from: 240, to: 400, label: "run handler", sub: "fulfill order, send email" },
  { y: 350, from: 400, to: 240, label: "ok", sub: "handler success" },
  { y: 410, from: 240, to: 80, label: "200 OK", sub: "ack delivery" },
];

const RIGHT_LANE: Step[] = [
  { y: 110, from: 560, to: 720, label: "POST evt_abc123", sub: "same event id, new attempt" },
  { y: 170, from: 720, to: 880, label: "constructEvent() HMAC", sub: "verify signature" },
  { y: 230, from: 720, to: 880, label: "SETNX stripe:event:evt_abc123", sub: "returns 0 (exists)" },
  { y: 290, from: 720, to: 880, label: "skip handler", sub: "no side effects", muted: true },
  { y: 410, from: 720, to: 560, label: "200 OK", sub: "ack duplicate, quietly" },
];

const COLS = [
  { x: 80, label: "Stripe" },
  { x: 240, label: "Edge /webhook" },
  { x: 400, label: "Redis + Handler" },
  // ... right side mirrors
];
\`\`\`

The data-driven approach pays off because the diagram needs to support theme switching: the \`stroke\` color is computed per step from \`hsl(var(--primary))\` so light/dark themes Just Work without re-exporting an asset. The \`muted: true\` flag on the "skip handler" step renders that arrow in muted-foreground color to visually signal "no side effects happened here" — which is the entire point of the dedup pattern.

The design teaches the SETNX-as-dedup-key idiom in one screen: first attempt SETNX returns 1 → handler runs; second attempt SETNX returns 0 → handler skipped, 200 returned to ack the duplicate so Stripe stops retrying. Documented case studies like this on a portfolio outperform "I know Stripe" bullet-points because they show you understand the failure modes.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['stripe', 'webhooks', 'idempotency', 'redis', 'svg-diagram'],
    repository: repo,
    filePath: 'components/Showcase/StripeCaseStudy.tsx',
    url: blob('components/Showcase/StripeCaseStudy.tsx'),
  },
];
