/**
 * seed-demo-corpus.ts
 *
 * Populates the production DB with a curated corpus so the deployed
 * search actually returns results for typical queries. The corpus is
 * hand-written Q&A — not scraped from Stack Overflow — so we don't
 * need to carry an attribution / CC-BY-SA footnote per item.
 *
 * Each item is chunked into a single ContentChunk (items are small
 * enough to fit under Gemini's token limits), then embedded via
 * text-embedding-004 and written to content_chunks.embedding.
 *
 * Run once against production:
 *   cd apps/api
 *   bash scripts/migrate-prod.sh .env.prod     # ensure schema is current
 *   set -a; source .env.prod; set +a
 *   pnpm exec tsx scripts/seed-demo-corpus.ts
 *
 * Idempotent: uses contentHash / chunkHash for upserts. Re-running
 * against an already-seeded DB is a no-op (it skips items whose hash
 * already exists).
 */

import { createHash } from 'node:crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient();

interface SeedItem {
  title: string;
  body: string;
  language?: string;
  tags: string[];
  url: string;
  score: number;
}

const CORPUS: SeedItem[] = [
  {
    title: 'How do React useEffect cleanup functions work?',
    body: `A useEffect cleanup runs on two occasions: before the effect fires again on the next render, and when the component unmounts. The pattern is:

useEffect(() => {
  const handler = () => console.log('resize');
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}, []);

The function you return is the cleanup. React calls it to tear down whatever the effect set up — timers, subscriptions, event listeners, aborted fetch controllers. Forgetting a cleanup is the #1 source of memory leaks in React apps: a component mounts, subscribes, unmounts, subscribes again, and the first subscription keeps firing into a DOM node that no longer exists.

When the dependency array changes, React runs cleanup for the previous effect BEFORE running the new effect. That's why a typical data-fetch pattern uses an AbortController — cleanup aborts the in-flight request so stale results don't overwrite the new state.`,
    language: 'javascript',
    tags: ['react', 'react-hooks', 'useeffect', 'memory-leak'],
    url: 'https://react.dev/reference/react/useEffect',
    score: 342,
  },
  {
    title: 'Difference between async/await and Promise.then',
    body: `They compile to the same thing. async/await is syntactic sugar over .then — the JavaScript engine desugars \`await foo()\` into \`foo().then(result => ...)\`. What actually differs is readability and error handling.

With .then chains you pass callbacks:
fetchUser()
  .then(user => fetchPosts(user.id))
  .then(posts => render(posts))
  .catch(err => showError(err));

With async/await the same flow reads top-to-bottom:
try {
  const user = await fetchUser();
  const posts = await fetchPosts(user.id);
  render(posts);
} catch (err) {
  showError(err);
}

Async/await composes better with conditionals, loops, and early returns. .then chains force callback nesting whenever control flow isn't strictly linear. Prefer async/await everywhere except inside libraries where bundle size of the helper runtime matters.

One subtle pitfall: Promise.all vs sequential awaits. \`const [a, b] = await Promise.all([getA(), getB()])\` runs in parallel; \`const a = await getA(); const b = await getB()\` runs sequentially. This turns into latency bugs in code reviews.`,
    language: 'javascript',
    tags: ['async-await', 'promises', 'javascript'],
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function',
    score: 521,
  },
  {
    title: 'TypeScript generic constraints with extends',
    body: `A generic constraint pins a type parameter to a supertype. Without a constraint, \`T\` is \`unknown\` — you can't do anything with it. With \`T extends { id: string }\`, TypeScript knows every T has a string id.

function findById<T extends { id: string }>(items: T[], id: string): T | undefined {
  return items.find(item => item.id === id);
}

findById([{ id: '1', name: 'Ada' }], '1'); // ok, T inferred as { id: string, name: string }
findById([{ name: 'Ada' }], '1');          // error: missing id

Constraints also drive conditional types. \`T extends string ? A : B\` is how type-level if/else is written. Combined with \`infer\` you can extract parts of a type: \`T extends Promise<infer U> ? U : never\` gives you the value inside a Promise.

Advanced pattern: default type parameters. \`<T extends object = Record<string, unknown>>\` means callers can skip T and get the default. Useful for library APIs where the inner shape is optional.`,
    language: 'typescript',
    tags: ['typescript', 'generics', 'type-constraints'],
    url: 'https://www.typescriptlang.org/docs/handbook/2/generics.html',
    score: 198,
  },
  {
    title: 'Python asyncio: when to use gather vs TaskGroup',
    body: `asyncio.gather was the standard way to run coroutines concurrently, but it has a nasty error-handling default: if one coroutine raises, gather returns the exception alongside the other results unless you pass return_exceptions=True, and the other coroutines keep running to completion. You end up with half-finished work and a confusing partial state.

asyncio.TaskGroup (Python 3.11+) fixes this. It uses structured concurrency: if any task in the group raises, the rest are cancelled, and all exceptions are collected into an ExceptionGroup the caller can handle with except*.

async with asyncio.TaskGroup() as tg:
    t1 = tg.create_task(fetch_user(1))
    t2 = tg.create_task(fetch_user(2))
# By here t1 and t2 are both done, or we raised ExceptionGroup

Use TaskGroup for new code targeting 3.11+. Stick with gather(..., return_exceptions=True) only when you genuinely want partial results — e.g. fan-out metrics collection where one failing endpoint shouldn't block the others.`,
    language: 'python',
    tags: ['python', 'asyncio', 'concurrency', 'python-3.11'],
    url: 'https://docs.python.org/3/library/asyncio-task.html#task-groups',
    score: 287,
  },
  {
    title: 'Go: channels vs sync.Mutex for shared state',
    body: `"Don't communicate by sharing memory; share memory by communicating" is the Go adage, but both tools have their place.

Use a channel when the data flows. A goroutine produces work items and a worker pool consumes them — channel. A pipeline of stages each transforming a value — channel. The channel encodes the handoff protocol.

Use sync.Mutex when you have static shared state that many goroutines read and mutate in place. A counter, a cache, a connection pool's internal bookkeeping — Mutex. Trying to force this through a channel creates an "actor" goroutine that serializes access, and now every read is a round-trip through the scheduler.

Rule of thumb: if the data has a clear producer and consumer, channel. If many goroutines are banging on the same bookkeeping, Mutex. When in doubt, start with Mutex — it's 20 lines shorter and a profiler will tell you if contention becomes a problem.`,
    language: 'go',
    tags: ['go', 'concurrency', 'channels', 'mutex'],
    url: 'https://go.dev/doc/effective_go#concurrency',
    score: 412,
  },
  {
    title: 'Why does my JWT refresh token rotation keep logging users out?',
    body: `Refresh-token rotation means every time you use a refresh token to get a new access token, you also get a new refresh token and the old one is invalidated. The classic bug: the client loses its in-flight request's rotation because two tabs hit /refresh simultaneously.

Symptom: user opens two tabs, one quietly rotates the refresh token, the other sends the old one and the server rejects it as "already used" — which (correctly) triggers "suspicious activity, revoke all sessions" and logs them out.

Fixes, in order of preference:
1. Serialize refresh calls in the client. A single singleton refresh Promise per page — any caller awaits it. SDKs like @auth0/auth0-spa-js do this.
2. Accept a short grace window on the server. A just-used refresh token stays valid for, say, 10 seconds to allow concurrent tabs to retry. Rotate the response either way.
3. BroadcastChannel sync across tabs. The first tab to rotate broadcasts the new token; the other tab picks it up instead of making its own request.

Don't drop rotation — it's the only mitigation against stolen refresh tokens.`,
    language: 'javascript',
    tags: ['jwt', 'authentication', 'refresh-tokens', 'security'],
    url: 'https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation',
    score: 156,
  },
  {
    title: 'Postgres pgvector: IVFFlat vs HNSW index tradeoffs',
    body: `Both indexes speed up approximate nearest-neighbor (ANN) search in pgvector. The tradeoff is build time vs query speed vs recall.

IVFFlat partitions vectors into lists (clusters). Queries scan a subset of lists (probes). It's cheap to build (minutes for a few million vectors), cheap to update incrementally, and query recall drops as the dataset skews. Good for datasets that change daily.

HNSW builds a hierarchical graph of neighbors. Queries walk the graph from coarse to fine. It's expensive to build (hours for millions of vectors) and expensive to update (each insert walks the graph), but query latency is 3-10x lower than IVFFlat at the same recall.

Rule of thumb: HNSW for read-heavy workloads with infrequent bulk inserts (search engines, recommendation). IVFFlat for workloads with frequent updates (feeds, logs). Always benchmark with your actual data — recall vs latency curves are dataset-specific.

Build with a reasonable m/ef_construction for HNSW (default m=16, ef_construction=64 is fine), then tune ef_search per query to trade recall for speed without rebuilding.`,
    language: 'sql',
    tags: ['postgres', 'pgvector', 'vector-search', 'indexing'],
    url: 'https://github.com/pgvector/pgvector',
    score: 234,
  },
  {
    title: 'Rust: When to use Rc vs Arc vs Box',
    body: `All three are heap-allocation smart pointers but their ownership models differ.

Box<T> is single-ownership. It just heap-allocates one T and gives you a pointer. Use when you need to own a dynamically-sized type (trait object, recursive enum) or move a large value without copying.

Rc<T> is single-threaded reference counting. Multiple Rc handles point at the same T; the value drops when the last handle drops. Use for tree/DAG structures where a node is shared by many parents within one thread. Rc::clone is cheap (just an atomic-free counter bump).

Arc<T> is Rc's thread-safe cousin. The counter uses atomic ops, which is measurably slower than Rc. Use when a value is shared across threads (e.g. passed into tokio::spawn, std::thread::spawn).

The pattern you'll reach for most in real code is Arc<Mutex<T>> — shared mutable state across threads, with the mutex providing the synchronization. Arc alone only gives you shared read access; you need RefCell (single-thread) or Mutex/RwLock (threads) to mutate.

Don't reach for Rc/Arc reflexively. Prefer &T borrows where possible — the borrow checker exists so you don't need runtime reference counting for stack-lifetime data.`,
    language: 'rust',
    tags: ['rust', 'smart-pointers', 'concurrency', 'memory'],
    url: 'https://doc.rust-lang.org/book/ch15-00-smart-pointers.html',
    score: 189,
  },
  {
    title: 'Kubernetes: readinessProbe vs livenessProbe — what fails when',
    body: `Both are health probes, but they change DIFFERENT things.

livenessProbe: "is this container alive?" If it fails, Kubernetes kills the container and restarts it. Use for deadlock detection — a process is stuck in a loop, unresponsive. DO NOT use for slow dependencies (DB being down). If liveness fails while your DB is recovering, every pod restarts, making recovery slower.

readinessProbe: "is this container ready to serve traffic?" If it fails, the pod is removed from Service endpoints but NOT restarted. Use for "cold start" grace (app booting) and "dependency missing" (DB unreachable — better to drain than to serve errors).

Standard pattern for a stateful API:
- readinessProbe: GET /health that checks DB connectivity. Slow start during deploys, drains on DB issues.
- livenessProbe: GET /alive that does NOT check dependencies, only process liveness (can the event loop respond?).

startupProbe covers slow-starting apps (e.g. JVM warmup). While it's running, liveness/readiness are ignored. Without startupProbe, a slow-starting app might hit its initial liveness check, fail, and die.`,
    language: 'yaml',
    tags: ['kubernetes', 'health-checks', 'devops', 'reliability'],
    url: 'https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/',
    score: 298,
  },
  {
    title: 'Why is my Next.js App Router page stuck in "use client"?',
    body: `App Router prefers server components by default — they run on the server, stream HTML, and never ship JS for their own logic. Adding "use client" makes a component render on the client, ship its JS, and lose server-only capabilities (direct DB access, cookies() with the server API).

Common reasons a page has to be "use client":
- useState/useEffect/useRef or any other React hook
- Event handlers (onClick, onChange) — these need JS on the client
- Browser APIs (localStorage, window, navigator)
- Context providers (must be rendered on the client to be useful)
- Third-party components that use hooks internally (framer-motion, swr, most UI libraries)

Keep "use client" as low in the tree as possible. A Page can stay a server component and import a client InteractiveForm; only the form ships to the browser. Don't slap "use client" on the page to fix a child — push the boundary down.

One gotcha: framer-motion in a server component crashes the build with "Element type is invalid". Pull the motion component into a separate "use client" file and re-export. This costs nothing at runtime (the server component composes the client wrapper) but unblocks SSR.`,
    language: 'typescript',
    tags: ['nextjs', 'react-server-components', 'app-router'],
    url: 'https://nextjs.org/docs/app/building-your-application/rendering/server-components',
    score: 267,
  },
  {
    title: 'Redis: SET with NX + EX vs SETNX + EXPIRE — race condition',
    body: `The old way: SETNX key value; EXPIRE key 60. Two round-trips. If your process dies between them you have a key that never expires — a lock leak that silently wedges whatever code holds that key.

The right way: SET key value NX EX 60. Single atomic command. Either the key is set with a 60s TTL, or neither.

For distributed locks use the Redlock variant: SET lock_key uuid NX EX 30, where uuid is unique to your lock attempt. When releasing, use a Lua script that compares the value before deleting:
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end

Why the compare-and-delete? Your TTL could expire mid-critical-section; another client acquires the same lock; if you just DEL unconditionally at the end of your work, you'd release their lock. The uuid check ensures you only release your own lock.

For stricter guarantees (quorum across Redis nodes), use the Redlock algorithm or a library like ioredis-lock. But for single-Redis deployments, SET NX EX + Lua-scripted release is sufficient.`,
    language: 'sql',
    tags: ['redis', 'distributed-locks', 'concurrency', 'race-condition'],
    url: 'https://redis.io/docs/latest/develop/use/patterns/distributed-locks/',
    score: 321,
  },
  {
    title: 'Docker: difference between ENTRYPOINT and CMD',
    body: `Both declare what the container runs. The difference is whether args are replaced or appended.

CMD sets default args. \`docker run myimage\` runs the CMD. \`docker run myimage /bin/bash\` REPLACES the CMD with /bin/bash.

ENTRYPOINT is the "the thing this image exists to run." \`docker run myimage foo\` APPENDS foo to the entrypoint.

Combined pattern (most production Dockerfiles):
ENTRYPOINT ["node", "server.js"]
CMD ["--port", "3000"]

\`docker run myimage\` runs node server.js --port 3000.
\`docker run myimage --port 4000\` runs node server.js --port 4000. (CMD overridden, ENTRYPOINT preserved.)

Shell form vs exec form matters too. \`CMD node server.js\` runs under /bin/sh -c, which means signals aren't delivered to node (Docker sends SIGTERM to the shell). \`CMD ["node", "server.js"]\` runs node as PID 1 directly, signals land correctly, graceful shutdown works.

Always use exec form (JSON array) unless you need shell features like variable expansion.`,
    language: 'bash',
    tags: ['docker', 'containers', 'devops'],
    url: 'https://docs.docker.com/reference/dockerfile/#cmd',
    score: 176,
  },
  {
    title: 'CSS container queries: when to use over media queries',
    body: `Media queries ask "how big is the viewport?" Container queries ask "how big is THIS container?" — which is almost always what you actually want for components.

@container (min-width: 400px) {
  .card { grid-template-columns: 1fr 1fr; }
}

Now the .card lays out side-by-side whenever ITS parent container is ≥ 400px, regardless of viewport. Drop the card into a sidebar and it stays vertical; drop it into the main content and it goes horizontal.

To make container queries work, set container-type on the parent:
.card-grid { container-type: inline-size; }

Browser support landed universally in 2023 (Chrome 105, Safari 16, Firefox 110). If you need to ship to older browsers use @supports (container-type: inline-size) { ... } with a media-query fallback inside the @supports not branch.

Common gotcha: container-type: inline-size DOES contain layout — children can't measure the container's height via auto layout in quite the same way. Usually not a problem; occasionally you need container-type: size or to restructure slightly.`,
    language: 'css',
    tags: ['css', 'container-queries', 'responsive-design'],
    url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries',
    score: 143,
  },
  {
    title: 'SQL window functions: ROW_NUMBER vs RANK vs DENSE_RANK',
    body: `All three assign ordinal numbers within a partition — they differ in how they handle ties.

ROW_NUMBER: every row gets a unique number. Ties broken arbitrarily (or by the ORDER BY's later columns). 1, 2, 3, 4.

RANK: tied rows get the SAME rank, and the next rank skips. 1, 2, 2, 4.

DENSE_RANK: tied rows get the same rank, and the next rank is consecutive. 1, 2, 2, 3.

Classic use case: "top 3 salespeople per region."
SELECT *
FROM (
  SELECT *, RANK() OVER (PARTITION BY region ORDER BY sales DESC) as rnk
  FROM salespeople
) ranked
WHERE rnk <= 3;

With RANK, if two people tie for 2nd place, you return 4 rows (1, 2, 2, 4 — wait, you exclude the 4th). With DENSE_RANK, you'd return all 4 of rank ≤ 3 (1, 2, 2, 3).

Use ROW_NUMBER when you need exactly N per partition (pagination, dedup — keep-one-per-group). Use RANK for competition-style rankings where you want gaps. Use DENSE_RANK for "top N tiers" where you don't want gaps.`,
    language: 'sql',
    tags: ['sql', 'window-functions', 'postgres'],
    url: 'https://www.postgresql.org/docs/current/tutorial-window.html',
    score: 312,
  },
  {
    title: 'Git: interactive rebase vs squash merge',
    body: `Both collapse commits, but at different points in the workflow.

Interactive rebase (git rebase -i HEAD~5) rewrites YOUR local branch's history before you push. You can reorder, squash, fixup, edit, drop, and reword commits. The result is what ends up on the remote branch and subsequently in the PR.

Squash merge (GitHub's "Squash and merge" button) combines all PR commits into one commit on the base branch at merge time. The individual PR commits are preserved on the feature branch, but main sees a single commit.

Workflow implications:
- Interactive rebase lets you keep logical units of work as separate commits on main. Your reviewer sees a clean 5-commit PR where each commit is a coherent step. Good for large changes where reviewers benefit from commit-by-commit diff.
- Squash merge flattens everything. Main's history has one commit per PR — tidy, but you lose the story of how the change evolved. Good for small PRs where the individual commits are "wip", "typo", "fix review feedback" noise.

Most teams settle on: use interactive rebase to produce a clean commit history IF the PR has more than one logical step; use squash merge for single-concept PRs. Squash merging a carefully-rebased PR discards your work.`,
    language: 'bash',
    tags: ['git', 'version-control', 'workflow'],
    url: 'https://git-scm.com/book/en/v2/Git-Tools-Rewriting-History',
    score: 278,
  },
];

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

async function embed(
  genAI: GoogleGenerativeAI,
  text: string,
): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

async function main() {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.error('✖  GEMINI_API_KEY not set — cannot generate embeddings.');
    process.exit(1);
  }
  const genAI = new GoogleGenerativeAI(geminiKey);

  console.log(`→ Seeding ${CORPUS.length} curated items…`);

  // Ensure the "documentation" source row exists (the curated content
  // doesn't map to GitHub or Stack Overflow — it's owner-authored).
  const source = await prisma.source.upsert({
    where: { name: 'documentation' },
    update: {},
    create: {
      name: 'documentation',
      displayName: 'Curated Documentation',
      type: 'DOCUMENTATION',
      isActive: true,
      config: { seed: 'demo-corpus-v1' },
    },
  });

  let created = 0;
  let skipped = 0;
  let embedded = 0;

  for (const item of CORPUS) {
    const fullText = `${item.title}\n\n${item.body}`;
    const contentHash = sha256(fullText);

    const existing = await prisma.content.findUnique({
      where: { contentHash },
      include: { chunks: true },
    });

    let content = existing;
    if (!content) {
      content = await prisma.content.create({
        data: {
          title: item.title,
          content: fullText,
          contentType: 'DOCUMENTATION_PAGE',
          language: item.language,
          contentHash,
          processedAt: new Date(),
        },
        include: { chunks: true },
      });
      created++;
    } else {
      skipped++;
    }

    // One chunk per item — the corpus entries are small enough to fit
    // comfortably inside Gemini's input window. Skip if the chunk
    // already exists AND already has an embedding.
    const chunkHash = sha256(`${contentHash}:0`);
    let chunk = content.chunks.find((c) => c.chunkHash === chunkHash);
    if (!chunk) {
      chunk = await prisma.contentChunk.create({
        data: {
          contentId: content.id,
          chunkText: fullText,
          chunkHash,
          sequence: 0,
          tokenCount: Math.ceil(fullText.length / 4),
        },
      });
    }

    // Check embedding status via raw SQL because Prisma doesn't expose
    // the Unsupported("vector") column.
    const [row] = await prisma.$queryRaw<
      Array<{ has_embedding: boolean }>
    >`SELECT (embedding IS NOT NULL) as has_embedding FROM content_chunks WHERE id = ${chunk.id}`;

    if (row?.has_embedding) {
      continue;
    }

    try {
      const vec = await embed(genAI, fullText);
      const vectorLiteral = `[${vec.join(',')}]`;
      await prisma.$executeRaw`
        UPDATE content_chunks
        SET embedding = ${vectorLiteral}::vector,
            "embeddingStatus" = 'COMPLETED',
            "embeddedAt" = NOW()
        WHERE id = ${chunk.id}
      `;
      embedded++;
      process.stdout.write('.');
    } catch (err) {
      console.error(
        `\n✖  embed failed for ${item.title.slice(0, 40)}…:`,
        err instanceof Error ? err.message : err,
      );
      await prisma.contentChunk.update({
        where: { id: chunk.id },
        data: {
          embeddingStatus: 'FAILED',
          embeddingError:
            err instanceof Error ? err.message : 'unknown embedding error',
        },
      });
    }
  }

  console.log(
    `\n✓  done. source=${source.name} created=${created} skipped=${skipped} embedded=${embedded}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
