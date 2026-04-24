/**
 * Batch github-011-nextjs-app-router
 *
 * 30 entries on Next.js App Router internals + canonical patterns,
 * sourced from the actual `vercel/next.js` repo (canary). Every
 * `filePath` was verified against a local clone before inclusion.
 *
 * Bar: 250–450 word body, real code from the file, one topic per
 * entry, plus a non-obvious gotcha per entry that you only learn by
 * shipping App Router code in production.
 */

import type { SeedItem } from '../types';

const repo = { owner: 'vercel', name: 'next.js' };

export const BATCH: SeedItem[] = [
  {
    title: 'redirect() in Next.js App Router throws a special error — never returns',
    body: `\`redirect(url)\` doesn't *return* a redirect — it **throws**. The thrown Error has a \`digest\` field that the React framework recognises and unwinds. The function's return type is literally \`never\`.

\`\`\`ts
export function redirect(url: string, type?: RedirectType): never {
  type ??= actionAsyncStorage?.getStore()?.isAction ? 'push' : 'replace'
  throw getRedirectError(url, type, RedirectStatusCode.TemporaryRedirect)
}

export function getRedirectError(url, type, statusCode) {
  const error = new Error(REDIRECT_ERROR_CODE) as RedirectError
  error.digest = \`\${REDIRECT_ERROR_CODE};\${type};\${url};\${statusCode};\`
  return error
}
\`\`\`

The digest is a semicolon-delimited string the renderer parses back out: \`code;type;url;statusCode;\`. In Server Components the renderer turns it into a \`<meta http-equiv="refresh">\` tag; in Route Handlers and Server Actions it becomes a real 307/303 HTTP response.

**Why throw?** Because Server Components don't have access to the response object — they only return JSX. A thrown error is the only mechanism that can short-circuit a server tree mid-render and still let the framework decide what HTTP response to send.

**The default \`type\` is context-aware.** Look at line 43: inside a Server Action it defaults to \`'push'\`, everywhere else \`'replace'\`. The call site is detected via the action async-storage ALS — Next.js doesn't ask you, it sniffs the surrounding context.

**Non-obvious gotcha:** Because \`redirect()\` throws, **never wrap it in a \`try/catch\` that swallows everything**. A pattern like:

\`\`\`ts
try {
  await doStuff();
  redirect('/done');     // THIS IS INSIDE THE TRY
} catch (e) {
  console.error(e);      // swallows the redirect!
  return 'Error';
}
\`\`\`

…will catch the redirect error and turn the redirect into a logged "error". Always either put \`redirect()\` *outside* the try, or re-throw if \`isRedirectError(e)\`. Same applies to \`notFound()\` (which throws an HTTP fallback error). Next.js exports \`unstable_rethrow()\` specifically to handle this — call it as the first line in any \`catch\` block inside a Server Component.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'app-router', 'redirect', 'server-components'],
    repository: repo,
    filePath: 'packages/next/src/client/components/redirect.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/client/components/redirect.ts',
  },
  {
    title: 'notFound() — throws a digest-tagged error caught by the nearest not-found.tsx',
    body: `\`notFound()\` is the simplest API in the App Router source — 28 lines, one job:

\`\`\`ts
const DIGEST = \`\${HTTP_ERROR_FALLBACK_ERROR_CODE};404\`

export function notFound(): never {
  const error = new Error(DIGEST) as HTTPAccessFallbackError
  ;(error as HTTPAccessFallbackError).digest = DIGEST
  throw error
}
\`\`\`

The digest is a constant string. When the renderer or route-handler runtime catches an error, it checks \`error.digest\` against the HTTP_ERROR_FALLBACK_ERROR_CODE prefix. If it matches, the framework:

1. Walks **up the segment tree** looking for the nearest \`not-found.tsx\` file (a "fallback boundary").
2. Renders that boundary in place of the segment that threw.
3. Sets the response status to \`404\`.

This is why \`not-found.tsx\` is **scoped per route segment** — each segment defines its own 404 UI. A 404 thrown inside \`/blog/[slug]/page.tsx\` will render \`/blog/[slug]/not-found.tsx\` if it exists, else \`/blog/not-found.tsx\`, else the root \`/not-found.tsx\`. The walk stops at the first match.

**Why a thrown error and not a return value?** Same answer as \`redirect()\`: Server Components can't talk to the response. The only way to abort a deeply-nested server render and still produce a meaningful HTTP response is to throw something the framework recognises.

**Gotcha #1: notFound() in a Server Action does NOT trigger the not-found UI.** It returns a 404 to the action caller, but the page doesn't switch to the not-found boundary. Use it for "the resource you're trying to mutate doesn't exist anymore" — not for "show the user a 404 page" inside an action.

**Gotcha #2: \`try/catch\` around \`notFound()\` swallows it** — exactly like \`redirect()\`. If you have a generic try/catch (e.g., wrapping a DB call), put your \`notFound()\` outside, or re-throw with \`isHTTPAccessFallbackError(e)\`. People burn a day on this when they wrap everything in defensive try/catch and wonder why their 404 page never shows up.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'app-router', 'not-found', 'error-handling'],
    repository: repo,
    filePath: 'packages/next/src/client/components/not-found.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/client/components/not-found.ts',
  },
  {
    title: 'revalidatePath vs revalidateTag — what each one actually does',
    body: `\`revalidatePath\` and \`revalidateTag\` look symmetric in the docs but they reach the same internal \`revalidate()\` function via different paths. Both live in the same file:

\`\`\`ts
export function revalidateTag(tag: string, profile: string | CacheLifeConfig) {
  return revalidate([tag], \`revalidateTag \${tag}\`, profile)
}

export function revalidatePath(originalPath: string, type?: 'layout' | 'page') {
  let normalizedPath = \`\${NEXT_CACHE_IMPLICIT_TAG_ID}\${removeTrailingSlash(originalPath)}\`
  if (type) {
    normalizedPath += \`\${normalizedPath.endsWith('/') ? '' : '/'}\${type}\`
  } else if (isDynamicRoute(originalPath)) {
    console.warn(\`Warning: a dynamic page path "\${originalPath}" was passed to "revalidatePath", but the "type" parameter is missing.\`)
  }
  const tags = [normalizedPath]
  return revalidate(tags, \`revalidatePath \${originalPath}\`)
}
\`\`\`

\`revalidatePath\` is just \`revalidateTag\` with an **implicit tag** derived from the path: \`NEXT_CACHE_IMPLICIT_TAG_ID + path\`. Every page in the app router is cached under this implicit tag automatically — that's how path-based revalidation works without you tagging anything.

**The dynamic-route warning is critical.** If you call \`revalidatePath('/blog/[slug]')\` without a \`type\`, **nothing gets revalidated** — Next.js just warns. You must either pass the concrete path (\`/blog/my-post\`) or pass \`type: 'page'\` / \`'layout'\` to revalidate every cached instance of that template. People forget this and ship "working" code that never invalidates anything in production.

**Gotcha #1: revalidate functions throw if called during render.** Look at the guard inside \`revalidate()\`:

\`\`\`ts
if (workUnitStore.phase === 'render') {
  throw new Error(\`Route \${store.route} used "\${expression}" during render which is unsupported.\`)
}
\`\`\`

You can only call them in Server Actions and Route Handlers — not from a Server Component during rendering, and not from \`generateStaticParams\` or inside a \`use cache\` function.

**Gotcha #2: revalidateTag without a profile is now deprecated.** As of recent canary builds, calling \`revalidateTag('users')\` without a second argument logs a deprecation warning. Pass \`'max'\` for the old behavior or use \`updateTag(tag)\` for immediate-expiration semantics inside Server Actions.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'app-router', 'caching', 'revalidate'],
    repository: repo,
    filePath: 'packages/next/src/server/web/spec-extension/revalidate.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/server/web/spec-extension/revalidate.ts',
  },
  {
    title: 'unstable_cache — how the App Router caches expensive function calls',
    body: `\`unstable_cache(fn, keyParts?, options)\` returns a wrapped function that memoises results in the **incremental cache** (the same cache that backs \`fetch\` caching). Source:

\`\`\`ts
export function unstable_cache<T extends Callback>(
  cb: T, keyParts?: string[],
  options: { revalidate?: number | false; tags?: string[] } = {}
): T {
  const fixedKey = \`\${cb.toString()}-\${Array.isArray(keyParts) && keyParts.join(',')}\`
  const cachedCb = async (...args: any[]) => {
    const invocationKey = \`\${fixedKey}-\${JSON.stringify(args)}\`
    const cacheKey = await incrementalCache.generateCacheKey(invocationKey)
    // ...try cache, on stale background-revalidate, on miss compute + store
  }
  return cachedCb as unknown as T
}
\`\`\`

The cache key is **\`cb.toString() + keyParts + JSON.stringify(args)\`**. Three subtle implications:

1. **\`cb.toString()\` is part of the key.** Change one character of the function body and the cache is invalidated. This is intentional but means hot-reload during dev rebuilds the cache constantly.
2. **\`JSON.stringify(args)\` is the entire argument fingerprint.** Pass a Date, a class instance, or anything with a custom \`toJSON\` and you'll get cache-key collisions you can't debug. Numbers and plain strings are safe; everything else, be careful.
3. **\`keyParts\` is required when args don't fully describe the call.** If your function reads from \`headers()\` or a request-bound state, you MUST pass that into \`keyParts\` — otherwise two different requests share a cache entry.

**Stale-while-revalidate behaviour:** when the cache entry is stale, the cached value is returned immediately AND a background revalidate kicks off. The background promise is stashed on \`workStore.pendingRevalidates[invocationKey]\` so it doesn't dangle.

**Gotcha #1: \`revalidate: 0\` throws.** From the source: \`Invariant revalidate: 0 can not be passed to unstable_cache(), must be "false" or "> 0"\`. Use \`false\` (cache forever) or a positive number of seconds.

**Gotcha #2: calling \`headers()\`/\`cookies()\` inside the wrapped function throws.** Dynamic data sources are not allowed inside cache scopes — you must read them outside and pass them in via \`keyParts\`.

**Gotcha #3: nested \`unstable_cache\` calls bypass cache.** The source explicitly tracks \`isNestedUnstableCache\` and behaves like \`force-no-store\` for inner calls.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'app-router', 'caching', 'unstable-cache'],
    repository: repo,
    filePath: 'packages/next/src/server/web/spec-extension/unstable-cache.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/server/web/spec-extension/unstable-cache.ts',
  },
  {
    title: 'fetch() patching — how Next.js intercepts native fetch for caching + tags',
    body: `Next.js patches the global \`fetch\` so that any \`fetch()\` call from a Server Component participates in the incremental cache. The patched fetcher reads two extra option groups:

\`\`\`ts
const getNextField = (field: 'revalidate' | 'tags') => {
  return typeof init?.next?.[field] !== 'undefined'
    ? init?.next?.[field]
    : isRequestInput ? (input as any).next?.[field] : undefined
}
const originalFetchRevalidate = getNextField('revalidate')
const tags: string[] = validateTags(getNextField('tags') || [], \`fetch \${input.toString()}\`)
\`\`\`

So all of these are first-class:

\`\`\`ts
fetch(url)                                           // default: cache (force-cache)
fetch(url, { cache: 'no-store' })                    // never cache, dynamic
fetch(url, { cache: 'force-cache' })                 // explicit cache
fetch(url, { next: { revalidate: 60 } })             // ISR: revalidate every 60s
fetch(url, { next: { tags: ['users'] } })            // tag for revalidateTag
fetch(url, { next: { revalidate: 60, tags: ['x'] }})// both
\`\`\`

**Conflict resolution:** the patcher actively rejects bad combinations. If you pass both \`cache: 'force-cache'\` and \`revalidate: 0\` it warns and unsets both:

\`\`\`ts
const isConflictingRevalidate =
  (currentFetchCacheConfig === 'force-cache' && currentFetchRevalidate === 0) ||
  (currentFetchCacheConfig === 'no-store' && (currentFetchRevalidate > 0 || currentFetchRevalidate === false))
if (isConflictingRevalidate) {
  cacheWarning = \`Specified "cache: \${currentFetchCacheConfig}" and "revalidate: \${currentFetchRevalidate}", only one should be specified.\`
  currentFetchCacheConfig = undefined
  currentFetchRevalidate = undefined
}
\`\`\`

**Tag validation is enforced at fetch time.** Tags must be strings ≤ \`NEXT_CACHE_TAG_MAX_LENGTH\` characters; invalid tags are silently dropped from the cache entry (you'll see them in the dev warning). Don't generate tags from arbitrary user input — sanitise first.

**Gotcha #1: \`force-dynamic\` overrides everything.** If \`export const dynamic = 'force-dynamic'\` is set on the segment, \`currentFetchRevalidate\` is forced to 0 even if you explicitly asked for \`force-cache\`. The page-level mode wins.

**Gotcha #2: \`unstable_cache\` callers see \`pageFetchCacheMode = 'force-no-store'\`** — meaning fetches inside an \`unstable_cache\` callback are never cached themselves (the \`unstable_cache\` wrapper is the only cache layer in that path).

**Gotcha #3: only the **default** fetch is patched.** If you import \`node-fetch\`, \`undici\`, or use \`got\`/\`axios\`, none of this works.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'app-router', 'fetch', 'caching'],
    repository: repo,
    filePath: 'packages/next/src/server/lib/patch-fetch.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/server/lib/patch-fetch.ts',
  },
  {
    title: 'headers() returns a Promise — and the dev-mode iterator throws to catch sync access',
    body: `Since Next.js 15, \`headers()\` is async. The function in the source signs as \`Promise<ReadonlyHeaders>\`:

\`\`\`ts
export function headers(): Promise<ReadonlyHeaders> {
  const callingExpression = 'headers'
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()
  // ...
  switch (workUnitStore.type) {
    case 'request':
      trackDynamicDataInDynamicRender(workUnitStore)
      if (process.env.NODE_ENV === 'development') {
        return makeUntrackedHeadersWithDevWarnings(...)
      }
      return makeUntrackedHeaders(workUnitStore.headers)
    // ...
  }
}
\`\`\`

So the canonical use is:

\`\`\`ts
import { headers } from 'next/headers';
export default async function Page() {
  const h = await headers();         // must await
  const ua = h.get('user-agent');
  return <p>UA: {ua}</p>;
}
\`\`\`

**The dev-mode trap.** In dev, the returned promise is decorated with property descriptors that throw on synchronous access:

\`\`\`ts
function instrumentHeadersPromiseWithDevWarnings(promise, route) {
  Object.defineProperties(promise, {
    [Symbol.iterator]: replaceableWarningDescriptorForSymbolIterator(promise, route),
    get: replaceableWarningDescriptor(promise, 'get', route),
    has: replaceableWarningDescriptor(promise, 'has', route),
    // ...
  })
  return promise
}
\`\`\`

Each descriptor logs an error like \`headers() returns a Promise and must be unwrapped with \\\`await\\\` or \\\`React.use()\\\` before accessing its properties.\` This catches the codemod-able pattern \`headers().get('x')\` — which "works" in some builds because of the descriptor fallback but is the wrong shape.

**Why a Promise?** Because \`headers()\` triggers dynamic rendering. Returning a Promise lets the renderer "hang" the call during prerender (PPR / cacheComponents) without bailing out the whole page — see \`makeHangingHeaders\`. The Suspense boundary above the consumer absorbs the wait, and the rest of the static page still ships.

**Gotcha:** calling \`headers()\` inside \`generateStaticParams\` throws. Calling it inside \`"use cache"\` or \`unstable_cache\` throws. The error message points to the docs; trust it. Read headers above the cache, pass them in.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'app-router', 'headers', 'dynamic-api'],
    repository: repo,
    filePath: 'packages/next/src/server/request/headers.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/server/request/headers.ts',
  },
  {
    title: 'cookies() — read AND mutate, but only in the right phase',
    body: `\`cookies()\` follows the same async-Promise shape as \`headers()\` but adds **mutability rules**: in a Server Action or Route Handler you can call \`.set()\` / \`.delete()\`, but in a Server Component you can only read. From the source guard chain:

\`\`\`ts
export function cookies(): Promise<ReadonlyRequestCookies> {
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()
  // ...
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'cache':
        const error = new Error(
          \`Route \${workStore.route} used \\\`cookies()\\\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported.\`
        )
        throw error
      case 'unstable-cache':
        throw new Error(\`...inside a function cached with unstable_cache()...\`)
      case 'generate-static-params':
        throw new Error(\`...inside generateStaticParams...\`)
      case 'prerender':
        return makeHangingCookies(workStore, workUnitStore)
      // ...
    }
  }
}
\`\`\`

The "mutable" check is gated on the rendering phase — \`areCookiesMutableInCurrentPhase()\` lets the adapter return either \`RequestCookies\` (read-only) or a mutable wrapper depending on whether the runtime is in \`'action'\` phase or \`'render'\` phase. This is why setting a cookie from a Server Component throws "Cookies can only be modified in a Server Action or Route Handler" at runtime — the wrapper has \`set()\` defined only in the action phase.

**Canonical patterns:**

\`\`\`ts
// Server Component (read only)
async function Header() {
  const c = await cookies();
  const session = c.get('session')?.value;
  return <p>{session}</p>;
}

// Server Action (read AND write)
'use server';
export async function login(formData: FormData) {
  const c = await cookies();
  c.set('session', token, { httpOnly: true, secure: true });
}
\`\`\`

**Gotcha #1: every \`cookies()\` call opts the route into dynamic rendering.** A page that calls \`cookies()\` cannot be statically generated — it always renders per-request. Don't call it speculatively at the top of every layout "just in case."

**Gotcha #2: setting a cookie in a Server Action does NOT update the current rendering pass.** The cookie is sent to the browser in the response, but the same request that called \`set()\` will not see it. \`refresh()\` or a client-side reload makes the next render pick it up.

**Gotcha #3: cookies set inside \`after()\` are silently dropped** — by the time \`after()\` runs the response headers are already flushed.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'app-router', 'cookies', 'server-actions'],
    repository: repo,
    filePath: 'packages/next/src/server/request/cookies.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/server/request/cookies.ts',
  },
  {
    title: 'draftMode() — the "preview mode" replacement for the App Router',
    body: `\`draftMode()\` is the App Router's equivalent of the Pages-Router \`preview\` API. It returns a small object with \`isEnabled\`, \`enable()\`, and \`disable()\`. Source:

\`\`\`ts
export function draftMode(): Promise<DraftMode> {
  const callingExpression = 'draftMode'
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (!workStore || !workUnitStore) {
    throwForMissingRequestStore(callingExpression)
  }
  switch (workUnitStore.type) {
    case 'request':
      return createOrGetCachedDraftMode(workUnitStore.draftMode, workStore)
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
      const draftModeProvider = getDraftModeProviderForCacheScope(workStore, workUnitStore)
      if (draftModeProvider) {
        return createOrGetCachedDraftMode(draftModeProvider, workStore)
      }
    case 'prerender':
    case 'prerender-ppr':
    case 'prerender-legacy':
      return createOrGetCachedDraftMode(null, workStore)
    // ...
  }
}
\`\`\`

The trick is the \`prerender-*\` cases all return an **empty draft-mode provider** (\`null\`). Meaning: at build time \`isEnabled\` is always \`false\`, so the static prerender shows the published content. At request time, when the user has a draft cookie set, the runtime path returns the real provider and \`isEnabled\` flips true — the page re-renders with draft data.

Canonical usage in a CMS-backed site:

\`\`\`ts
// app/api/draft/route.ts
import { draftMode } from 'next/headers';
export async function GET() {
  (await draftMode()).enable();
  redirect('/');
}

// app/blog/[slug]/page.tsx
const { isEnabled } = await draftMode();
const post = await fetch(
  isEnabled ? \`\${CMS}/api/preview/\${slug}\` : \`\${CMS}/api/posts/\${slug}\`,
  { cache: isEnabled ? 'no-store' : 'force-cache' }
);
\`\`\`

**Gotcha #1: enabling draft mode opts the entire route into dynamic rendering** — because the renderer can no longer know at build time whether to serve the cached or the preview branch.

**Gotcha #2: draftMode().isEnabled is gated by a signed cookie set by Next.js.** You can't fake-enable it client-side. The enable() call must happen in a Route Handler or Server Action that returns the \`Set-Cookie\` header.

**Gotcha #3: works inside cache scopes when the outer store is request-scoped** — note the explicit \`getDraftModeProviderForCacheScope\` lookup. So a cached function CAN branch on draft mode, but the cache key effectively splits per draft state.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'app-router', 'draft-mode', 'preview'],
    repository: repo,
    filePath: 'packages/next/src/server/request/draft-mode.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/server/request/draft-mode.ts',
  },
  {
    title: 'after() — schedule work to run after the response is sent',
    body: `\`after()\` is one of the smallest yet most useful App Router APIs. The whole implementation is 22 lines:

\`\`\`ts
import { workAsyncStorage } from '../app-render/work-async-storage.external'

export type AfterTask<T = unknown> = Promise<T> | AfterCallback<T>

export function after<T>(task: AfterTask<T>): void {
  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new Error('\`after\` was called outside a request scope.')
  }
  const { afterContext } = workStore
  return afterContext.after(task)
}
\`\`\`

You pass either a Promise or a callback; Next.js queues it and runs it **after the response stream finishes**. Use cases:

\`\`\`ts
import { after } from 'next/server';

export async function POST(req: Request) {
  const data = await req.json();
  const order = await createOrder(data);

  after(async () => {
    // user has already received the 200 OK at this point
    await sendOrderEmail(order);
    await trackOrderToAnalytics(order);
  });

  return Response.json({ orderId: order.id });
}
\`\`\`

This unblocks the request: the user gets their response in 30ms instead of waiting 500ms for an email API.

**Gotcha #1: cookies() and headers() don't work the same inside after().** From the source of \`headers()\`:

\`\`\`ts
if (workUnitStore.phase === 'after' && !isRequestAPICallableInsideAfter()) {
  throw new Error(\`Route \${workStore.route} used \\\`headers()\\\` inside \\\`after()\\\`. This is not supported.\`)
}
\`\`\`

You must read them *outside* and capture the values into the closure passed to \`after()\`.

**Gotcha #2: errors inside after() do NOT propagate to the user.** The response is already sent. Next.js logs them to the server console (and Sentry if installed) but the user has long-since seen a "success." Plan your error tracking accordingly.

**Gotcha #3: serverless platform timeouts still apply.** On Vercel, the function's \`maxDuration\` covers \`after()\` work too. If you stream a 200 OK in 50ms but the after() callback runs for 30s on a 10s function, the platform kills the worker mid-callback.

**Gotcha #4: not for everything.** For real durable background work (retries, dead-letter queues), use a queue (Inngest, QStash, BullMQ). \`after()\` is best-effort.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'app-router', 'after', 'background-tasks'],
    repository: repo,
    filePath: 'packages/next/src/server/after/after.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/server/after/after.ts',
  },
  {
    title: 'Route Segment Config — the schema that validates `dynamic`, `revalidate`, `runtime`',
    body: `Every page/layout/route can export config constants like \`export const dynamic = 'force-dynamic'\`. The full list of valid values lives in one Zod schema:

\`\`\`ts
const AppSegmentConfigSchema = z.object({
  revalidate: z.union([z.number().int().nonnegative(), z.literal(false)]).optional(),
  dynamicParams: z.boolean().optional(),
  dynamic: z.enum(['auto', 'error', 'force-static', 'force-dynamic']).optional(),
  fetchCache: z.enum([
    'auto', 'default-cache', 'only-cache', 'force-cache',
    'force-no-store', 'default-no-store', 'only-no-store',
  ]).optional(),
  preferredRegion: z.union([z.string(), z.array(z.string())]).optional(),
  runtime: z.enum(['edge', 'nodejs']).optional(),
  maxDuration: z.number().int().nonnegative().optional(),
})
\`\`\`

What each one actually does:

- **\`dynamic: 'force-static'\`** — page MUST be statically generated; calling \`headers()\`/\`cookies()\` becomes a no-op (returns empty), bailing out is forbidden.
- **\`dynamic: 'force-dynamic'\`** — opposite: never cache anything in this route, force per-request rendering, override individual fetch \`cache: 'force-cache'\` settings.
- **\`dynamic: 'error'\`** — the page must be statically generatable; if any \`headers()\`/\`cookies()\`/uncached fetch sneaks in, the **build fails**. Useful for marketing pages where a regression to dynamic rendering is a perf bug worth catching in CI.
- **\`revalidate: 60\`** — set the maximum revalidate window for the segment (in seconds). Wins over fetch-level revalidate if it's lower.
- **\`runtime: 'edge'\`** — ship this route as an Edge Function (V8 isolate, no Node APIs).
- **\`maxDuration: 30\`** — tells Vercel/serverless to allow up to 30 seconds for this route. Default on Hobby plan is 10s.

**Gotcha #1: these are exports, not function calls.** \`export const dynamic = 'force-dynamic'\` is parsed at *build time* by webpack/Turbopack — they cannot be computed (\`export const dynamic = process.env.X\` won't work as you'd hope).

**Gotcha #2: layout and page configs cascade.** A \`force-dynamic\` on the layout forces every page underneath to be dynamic. Don't put cache-killing config on the root layout unless you mean it.

**Gotcha #3: \`runtime\` on a layout doesn't propagate.** Each page can pick its own runtime. But if a page imports a Node-only module (\`fs\`, \`crypto\`) into a layout that's edge, the build fails before runtime.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'app-router', 'segment-config', 'runtime'],
    repository: repo,
    filePath: 'packages/next/src/build/segment-config/app/app-segment-config.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/build/segment-config/app/app-segment-config.ts',
  },
  {
    title: 'middleware.ts matcher config — globs, has/missing, and what runs on the edge',
    body: `Middleware (and the newer \`proxy.ts\` alias) lets you intercept every matching request. Configuration via \`export const config\` is validated by this Zod schema:

\`\`\`ts
const RouteHasSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.enum(['header', 'query', 'cookie']),
    key: z.string(),
    value: z.string().optional(),
  }).strict(),
  z.object({ type: z.literal('host'), value: z.string() }).strict(),
])

const MiddlewareMatcherInputSchema = z.object({
  locale: z.union([z.literal(false), z.undefined()]).optional(),
  has: z.array(RouteHasSchema).optional(),
  missing: z.array(RouteHasSchema).optional(),
  source: SourceSchema,
}).strict()

export const MiddlewareConfigInputSchema = z.object({
  matcher: MiddlewareConfigMatcherInputSchema.optional(),
  regions: z.union([z.string(), z.array(z.string())]).optional(),
  unstable_allowDynamic: z.union([GlobSchema, z.array(GlobSchema)]).optional(),
})
\`\`\`

So a middleware can be:

\`\`\`ts
// middleware.ts
import { NextResponse } from 'next/server';
export function middleware(request: Request) { /* ... */ }

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
    '/admin/:path*',
  ],
};
\`\`\`

The \`source\` is a path-to-regexp string (validated by \`tryToParsePath\`). The \`has\`/\`missing\` arrays let you scope by header/cookie/query/host — useful for "only run on non-prefetch requests" or "only when the bot cookie is absent."

**Gotcha #1: middleware ALWAYS runs on the Edge runtime.** No \`fs\`, no native modules, no \`pg\`. If you need full Node, do the gating in a Route Handler instead.

**Gotcha #2: the matcher runs at the routing layer, BEFORE middleware code executes.** If your matcher excludes a path, your middleware function is never even invoked. This is a cold-path optimisation — don't try to "enrich" the matcher logic at runtime.

**Gotcha #3: matcher patterns can't reference dynamic values.** \`source: \`/\${process.env.PREFIX}/:path\`\` works because it's evaluated at build, but \`source: '/[locale]/:path'\` does not — middleware operates on raw URLs, not parsed segments.

**Gotcha #4: the \`unstable_allowDynamic\` glob whitelists files that use \`eval\`/\`Function\` constructor** — the Edge runtime forbids them by default, but some compiled deps (lodash, certain crypto polyfills) need them.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'middleware', 'edge-runtime', 'matcher'],
    repository: repo,
    filePath: 'packages/next/src/build/segment-config/middleware/middleware-config.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/build/segment-config/middleware/middleware-config.ts',
  },
  {
    title: 'Edge runtime adapter — how Next.js wires NextRequest into the Web Fetch API',
    body: `When you write a middleware or an edge route handler, Next.js wraps your function with an *adapter* that builds a \`NextRequest\` and a \`NextFetchEvent\` from the platform's incoming \`RequestData\` shape. The adapter is the boundary between Vercel/Cloudflare's \`fetch\`-event model and the Next abstractions:

\`\`\`ts
export async function adapter(params: AdapterOptions): Promise<FetchEventResult> {
  ensureTestApisIntercepted()
  await ensureInstrumentationRegistered()
  // TODO-APP: use explicit marker for this
  const isEdgeRendering = typeof (globalThis as any).__BUILD_MANIFEST !== 'undefined'
  params.request.url = normalizeRscURL(params.request.url)
  // ...
}

export class NextRequestHint extends NextRequest {
  sourcePage: string
  fetchMetrics: FetchEventResult['fetchMetrics'] | undefined
  get request() { throw new PageSignatureError({ page: this.sourcePage }) }
  respondWith() { throw new PageSignatureError({ page: this.sourcePage }) }
  waitUntil() { throw new PageSignatureError({ page: this.sourcePage }) }
}
\`\`\`

The \`NextRequestHint\` is a \`NextRequest\` extended with \`sourcePage\` (which file in your app produced this handler) and tripwire getters: if you accidentally type \`request.respondWith()\` because you confused this with a Service Worker, you get a clear \`PageSignatureError\`.

**The propagator** (lines 86-92) wraps the request in OpenTelemetry context, lifting trace headers off the incoming request so distributed-tracing tools (Sentry, Honeycomb) get a connected span tree.

**Why two layers?** The same adapter is used by middleware AND by edge-runtime route handlers via \`EdgeRouteModuleWrapper\`. The wrapper builds an \`AppRouteRouteHandlerContext\`, calls into the route module's \`handle()\`, then converts the resulting \`Response\` back to a \`FetchEventResult\` the platform understands.

**Gotcha #1: \`req.body\` is a stream, single-consumer.** Calling \`req.json()\` consumes it; you can't then call \`req.text()\` on the same request. Stripe webhook signature checking trips on this constantly — use \`req.text()\` first if you need the raw bytes for HMAC, then \`JSON.parse\` yourself.

**Gotcha #2: globals are isolated per-request only on V8 isolate platforms.** On Node, top-level mutable state in a middleware file leaks across requests. Don't store auth state in module scope.

**Gotcha #3: \`NextResponse.next()\` continues to the route, but doesn't merge headers.** Use \`response.headers.set('x-custom', ...)\` after constructing the next-response, or use \`request.headers.set()\` to forward to the downstream handler.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'edge-runtime', 'middleware', 'adapter'],
    repository: repo,
    filePath: 'packages/next/src/server/web/adapter.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/server/web/adapter.ts',
  },
  {
    title: 'Intercepting routes — (..)photos, (.)photos, (...)photos explained from the parser',
    body: `The folder syntax \`(..)photos\` looks like soup until you read the parser. Markers are matched in order:

\`\`\`ts
export const INTERCEPTION_ROUTE_MARKERS = [
  '(..)(..)',  // two levels up
  '(.)',       // same level
  '(..)',      // one level up
  '(...)',     // root
] as const

export function extractInterceptionRouteInformation(path: string): InterceptionRouteInformation {
  let interceptingRoute, marker, interceptedRoute;
  for (const segment of path.split('/')) {
    marker = INTERCEPTION_ROUTE_MARKERS.find((m) => segment.startsWith(m))
    if (marker) {
      ;[interceptingRoute, interceptedRoute] = path.split(marker, 2)
      break
    }
  }
  switch (marker) {
    case '(.)':
      interceptedRoute = interceptingRoute === '/'
        ? \`/\${interceptedRoute}\`
        : interceptingRoute + '/' + interceptedRoute
      break
    case '(..)':
      if (interceptingRoute === '/') throw new Error('Cannot use (..) at root, use (.)')
      interceptedRoute = interceptingRoute.split('/').slice(0, -1)
        .concat(interceptedRoute).join('/')
      break
    case '(...)':
      interceptedRoute = '/' + interceptedRoute
      break
    case '(..)(..)':
      // remove last two segments
      interceptedRoute = splitInterceptingRoute.slice(0, -2)
        .concat(interceptedRoute).join('/')
      break
  }
}
\`\`\`

So:

- \`/feed/(.)photos/[id]/page.tsx\` intercepts \`/feed/photos/[id]\` (sibling).
- \`/feed/(..)photos/[id]/page.tsx\` intercepts \`/photos/[id]\` (one level up).
- \`/feed/(...)photos/[id]/page.tsx\` intercepts \`/photos/[id]\` from root (alias for "always go to /photos at root").
- \`/a/b/(..)(..)photos/page.tsx\` intercepts \`/photos\` (two levels up).

**The use case is "Instagram modals":** when the user is on \`/feed\` and clicks a photo, you want a modal overlay (intercepted route). When they refresh or share the URL, they should land on the full-page \`/photos/[id]\` view (the regular route). Both files exist; Next.js picks the intercepting one only on client-side soft navigations.

**Gotcha #1: intercepting routes ONLY work for client-side navigations via \`<Link>\` or \`router.push\`.** A direct GET to the URL renders the regular route. This is by design but always surprises new users — "my modal isn't showing on refresh!"

**Gotcha #2: the intercepting route must live in a parallel slot.** The Instagram pattern needs \`@modal/(..)photos/[id]/page.tsx\` plus a \`@modal\` slot in the layout. Without the parallel route, you get a full-page replacement, not an overlay.

**Gotcha #3: the parser explicitly rejects \`(..)\` at the root.** It throws "Cannot use (..) marker at the root level, use (.) instead." Read the error.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'app-router', 'intercepting-routes', 'parallel-routes'],
    repository: repo,
    filePath: 'packages/next/src/shared/lib/router/utils/interception-routes.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/shared/lib/router/utils/interception-routes.ts',
  },
  {
    title: 'next/dynamic — React.lazy with SSR control and loading states',
    body: `\`next/dynamic\` is Next.js's wrapper around a Loadable HOC that exposes React.lazy + Suspense + SSR toggling in one API. Implementation:

\`\`\`ts
export default function dynamic<P = {}>(
  dynamicOptions: DynamicOptions<P> | Loader<P>,
  options?: DynamicOptions<P>
): React.ComponentType<P> {
  let loadableFn = Loadable as LoadableFn<P>
  let loadableOptions: LoadableOptions<P> = {
    loading: ({ error, isLoading, pastDelay }) => {
      if (!pastDelay) return null
      // dev: render error stack; prod: render null
      return null
    },
  }
  if (dynamicOptions instanceof Promise) {
    loadableOptions.loader = () => dynamicOptions
  } else if (typeof dynamicOptions === 'function') {
    loadableOptions.loader = dynamicOptions
  } else if (typeof dynamicOptions === 'object') {
    loadableOptions = { ...loadableOptions, ...dynamicOptions }
  }
}
\`\`\`

Three usage forms:

\`\`\`ts
const Chart = dynamic(() => import('./chart'));         // basic
const Chart = dynamic(() => import('./chart'), {        // with loading
  loading: () => <Skeleton />,
});
const Chart = dynamic(() => import('./chart'), {        // client-only
  ssr: false,
  loading: () => null,
});
\`\`\`

**\`ssr: false\` is the killer feature** for Pages Router and Server Components alike: things like \`recharts\`, \`react-leaflet\`, anything that touches \`window\` on import, gets cleanly excluded from SSR.

**Gotcha #1: in the App Router, \`ssr: false\` is illegal inside a Server Component.** It only works inside a \`'use client'\` boundary. Trying to use it from a server component throws "ssr: false is not allowed with next/dynamic in Server Components." The fix is to put the dynamic() call in a child Client Component and import that from the server.

**Gotcha #2: the loading prop is a function, not a node.** Pass \`loading: () => <Spinner />\`, not \`loading: <Spinner />\`. The function form lets the framework pass \`{ isLoading, error, pastDelay }\` props.

**Gotcha #3: \`pastDelay\` defaults to ~200ms.** The default loading component returns \`null\` until then to avoid flash for fast-loading chunks. If you want the spinner immediately, replace the loading prop entirely.

**Gotcha #4: re-rendering the dynamic() call doesn't re-import.** The Loadable wrapper memoises the loader. If you compute the import path inside render (\`dynamic(() => import(\`./icons/\${name}\`))\`), every render returns a *new* dynamic component — your tree mounts/unmounts on every render. Hoist dynamic() to module scope.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'next-dynamic', 'code-splitting', 'ssr'],
    repository: repo,
    filePath: 'packages/next/src/shared/lib/dynamic.tsx',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/shared/lib/dynamic.tsx',
  },
  {
    title: 'next/image — priority, fill, and the LCP-vs-lazy tradeoff',
    body: `\`next/image\` does responsive sizing, format negotiation, and lazy loading by default. The prop validation lives in \`get-img-props.ts\`:

\`\`\`ts
export type ImageProps = ... & {
  fill?: boolean
  priority?: boolean
  loading?: LoadingValue   // 'eager' | 'lazy'
  // ...
}

// Validation:
if (fill) {
  // Images with fill always use position absolute, width 100%, height 100%
  if (style?.position) console.warn('"fill" cannot have style.position')
  if (style?.width)    console.warn('"fill" cannot have style.width')
  if (style?.height)   console.warn('"fill" cannot have style.height')
}
if (priority && loading === 'lazy') {
  console.warn('Image has both "priority" and "loading=lazy" — only one should be used.')
}
\`\`\`

The three modes you'll actually use:

\`\`\`tsx
// Hero image — block render, set fetchpriority=high
<Image src="/hero.jpg" alt="" width={1200} height={600} priority />

// Below-the-fold image — intersection-observer lazy load
<Image src="/avatar.jpg" alt="" width={48} height={48} />

// Container-driven sizing (parent must be position: relative)
<div className="relative aspect-video">
  <Image src="/card.jpg" alt="" fill style={{ objectFit: 'cover' }} />
</div>
\`\`\`

**Why \`priority\`?** It removes the lazy-load hook AND emits a \`<link rel="preload" as="image">\` in the document head. Use it on the LCP image — typically a hero, above the fold. Lighthouse's "Largest Contentful Paint image was lazily loaded" warning means you forgot to set \`priority\` on it.

**Gotcha #1: \`width\` and \`height\` are MANDATORY** unless you use \`fill\`. They're not "intrinsic"; they're the aspect-ratio reservation that prevents CLS (Cumulative Layout Shift). Setting them to \`100%\` doesn't compile — they're number props.

**Gotcha #2: the default loader hits \`/_next/image?url=...&w=...&q=...\`** which goes through Vercel's image-optimization service in production. On self-hosted setups this requires \`sharp\` to be installed and is CPU-bound. For static-export sites, configure \`images.unoptimized: true\` or supply a custom \`loader\`.

**Gotcha #3: \`fill\` requires \`position: relative\` (or absolute/fixed) on the parent.** Otherwise the image stretches to the viewport, not the container. The validator doesn't catch this — your design just breaks silently.

**Gotcha #4: external images need \`images.remotePatterns\` in next.config.** A pattern like \`{ protocol: 'https', hostname: 'cdn.example.com' }\`. Wildcards like \`'**'\` work but should be tightly scoped — without limits, you've made an open image proxy.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'next-image', 'performance', 'lcp'],
    repository: repo,
    filePath: 'packages/next/src/client/image-component.tsx',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/client/image-component.tsx',
  },
  {
    title: 'ImageResponse / @vercel/og — generate dynamic Open Graph images per request',
    body: `The \`ImageResponse\` class lets you write JSX + CSS and get a PNG response — perfect for OG images, Twitter cards, dynamic badges. The implementation is a thin streaming wrapper around \`@vercel/og\`:

\`\`\`ts
export class ImageResponse extends Response {
  constructor(...args: ConstructorParameters<OgModule['ImageResponse']>) {
    const readable = new ReadableStream({
      async start(controller) {
        const OGImageResponse = (await importModule()).ImageResponse
        const imageResponse = new OGImageResponse(...args) as Response
        if (!imageResponse.body) return controller.close()
        const reader = imageResponse.body!.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) return controller.close()
          controller.enqueue(value)
        }
      },
    })
    const headers = new Headers({
      'content-type': 'image/png',
      'cache-control': process.env.NODE_ENV === 'development'
        ? 'no-cache, no-store'
        : 'public, max-age=0, must-revalidate',
    })
    super(readable, { headers, ... })
  }
}
\`\`\`

Note the runtime split: the constructor lazy-imports \`@vercel/og\` at request time, picking the \`.edge.js\` build on the Edge runtime and \`.node.js\` on Node. This avoids loading the (non-trivial) WASM rasteriser at cold-start when the route isn't hit.

Canonical usage:

\`\`\`ts
// app/api/og/route.tsx
import { ImageResponse } from 'next/og';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get('title') ?? 'CodeSensei';
  return new ImageResponse(
    <div style={{ display: 'flex', fontSize: 60, background: '#0b0b0b', color: '#fff', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
      {title}
    </div>,
    { width: 1200, height: 630 }
  );
}
\`\`\`

**Gotcha #1: every JSX element MUST have \`display: 'flex'\` or \`display: 'none'\`.** Satori (the renderer behind \`@vercel/og\`) doesn't implement block layout. Forget this and you get the cryptic "Expected style.display to be flex" error.

**Gotcha #2: only a small subset of CSS is supported.** No grid, no float, no \`::before\`/\`::after\`, no transforms beyond translate/scale/rotate. Test in dev before relying on it.

**Gotcha #3: custom fonts need to be fetched and passed in.** Pass \`fonts: [{ name: 'Inter', data: await fetch(fontUrl).then(r => r.arrayBuffer()) }]\` — Satori has no system font fallback.

**Gotcha #4: cache-control defaults to \`max-age=0, must-revalidate\`.** That's a "revalidate every time but allow CDN" pattern; if you want hard caching, override \`headers\` in the second arg.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'image-response', 'og-image', 'edge-runtime'],
    repository: repo,
    filePath: 'packages/next/src/server/og/image-response.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/server/og/image-response.ts',
  },
  {
    title: 'EdgeRouteModuleWrapper — how a route.ts becomes an Edge Function',
    body: `When you set \`export const runtime = 'edge'\` on a route handler, the build pipeline wraps your module in \`EdgeRouteModuleWrapper\` which turns it into a function the Edge runtime can invoke:

\`\`\`ts
export class EdgeRouteModuleWrapper {
  private readonly matcher: RouteMatcher

  private constructor(
    private readonly routeModule: AppRouteRouteModule,
    private readonly cacheHandlers: Record<string, CacheHandler>
  ) {
    this.matcher = new RouteMatcher(routeModule.definition)
  }

  // wrapper invocation path: incoming Request -> NextRequest hint ->
  // routeModule.handle(req, context) -> Response
}
\`\`\`

The wrapper:

1. **Initialises cache handlers** from the build manifest (so \`fetch\` patching, \`unstable_cache\`, and \`revalidateTag\` work).
2. **Builds a matcher** for the route's URL pattern (so \`[id]\` parameters get parsed out).
3. **Calls into the route module's \`handle()\`** which dispatches to the correct HTTP method export (\`GET\`, \`POST\`, etc.) on your file.
4. **Wraps everything in OpenTelemetry context** so you can trace requests end-to-end.

The wrapper imports \`./globals\` first — that file polyfills crypto, sets up the \`globalThis.process.env\` shim, etc., to make Node-style code "mostly work" on the Edge.

**The runtime selection happens at build time**, not at request time. Setting \`export const runtime = 'edge'\` triggers Webpack/Turbopack to:

1. Compile your route with the \`edge-light\` browser-list (no Node APIs).
2. Bundle dependencies that have edge-specific export conditions.
3. Reject any module that imports \`fs\`, \`child_process\`, \`pg\`, etc.

**Gotcha #1: importing a Node-only module breaks the BUILD, not the runtime.** You'll see "Module not found: Can't resolve 'fs'" at \`next build\`. This is good — the alternative is your Edge function 500ing on cold start in production.

**Gotcha #2: edge function size limits are tight (1 MB on Vercel).** Big deps like \`marked\`, \`pdf-lib\`, ORM clients with full SQL grammar will push you over. Move heavyweight work to a Node route.

**Gotcha #3: \`process.env.MY_SECRET\` works on Edge, but \`process\` is a shim** — \`process.cwd()\`, \`process.argv\` don't. Use what's documented in the Edge runtime API list.

**Gotcha #4: \`incrementalCacheHandler\` is initialised per-request when running on Edge.** No persistent in-memory cache between invocations on cold-isolate platforms — use \`revalidateTag\`-backed external storage (Upstash, Vercel KV).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'edge-runtime', 'route-handlers', 'route-modules'],
    repository: repo,
    filePath: 'packages/next/src/server/web/edge-route-module-wrapper.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/server/web/edge-route-module-wrapper.ts',
  },
  {
    title: 'AppRouteRouteModule — the engine that runs your route.ts file',
    body: `Every \`route.ts\` is compiled into an \`AppRouteRouteModule\` instance. The module's job is to take an incoming \`NextRequest\`, set up async-storage (work store, request store, action storage), dispatch to your exported HTTP method, and post-process the response (cookie merging, cache headers, etc.).

\`\`\`ts
import { RouteModule, type RouteModuleOptions } from '../route-module'
import { createRequestStoreForAPI } from '../../async-storage/request-store'
import { createWorkStore } from '../../async-storage/work-store'
import { type HTTP_METHOD, HTTP_METHODS, isHTTPMethod } from '../../web/http'
import { patchFetch } from '../../lib/patch-fetch'
import { autoImplementMethods } from './helpers/auto-implement-methods'
\`\`\`

Key responsibilities visible from the imports:

- **\`createRequestStoreForAPI\`** — sets up the per-request ALS so \`headers()\`, \`cookies()\`, and \`fetch()\` patching all see consistent state.
- **\`patchFetch\`** — monkey-patches the global \`fetch\` for *this* request only, attaching the cache-key context.
- **\`autoImplementMethods\`** — fills in HEAD if you implement GET, fills in OPTIONS for CORS preflight, etc.
- **\`actionAsyncStorage\`** — separately tracks "is this currently inside a Server Action invocation?" so \`redirect()\` defaults can branch on it.
- **\`createServerParamsForRoute\`** — extracts dynamic segments from the URL into the \`params\` you receive.

Canonical handler shape:

\`\`\`ts
// app/api/users/[id]/route.ts
import { NextResponse } from 'next/server';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;            // params is async since v15
  const user = await db.users.findUnique({ where: { id } });
  if (!user) return new NextResponse(null, { status: 404 });
  return NextResponse.json(user);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const updated = await db.users.update({ where: { id }, data: body });
  return NextResponse.json(updated);
}
\`\`\`

**Gotcha #1: \`ctx.params\` is now a Promise.** Pre-v15 code that destructured \`{ params }\` synchronously breaks silently — \`params.id\` is \`undefined\`. The codemod \`npx @next/codemod@latest next-async-request-api .\` rewrites this.

**Gotcha #2: returning a non-Response throws.** You must return a \`Response\` (or \`NextResponse\` / \`Response.json(...)\`). Returning a plain object gets you a 500.

**Gotcha #3: only the HTTP-method exports are dispatched.** A function named \`handler\` or \`default\` is ignored. Method names are case-sensitive ALL CAPS — \`get\` (lowercase) won't be called.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'route-handlers', 'route-modules', 'app-router'],
    repository: repo,
    filePath: 'packages/next/src/server/route-modules/app-route/module.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/server/route-modules/app-route/module.ts',
  },
  {
    title: '"use cache" — the new directive that wraps a function or component in cache',
    body: `Next.js 15 introduced the \`"use cache"\` directive — sibling to \`'use client'\` and \`'use server'\` — that marks an entire function or component as cached. The implementation lives in \`use-cache-wrapper.ts\` and uses \`react-server-dom-webpack\` to serialize the function output:

\`\`\`ts
import { renderToReadableStream, decodeReply } from 'react-server-dom-webpack/server'
import { createFromReadableStream, encodeReply } from 'react-server-dom-webpack/client'
import { prerender } from 'react-server-dom-webpack/static'

import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { decryptActionBoundArgs } from '../app-render/encryption'
import { DYNAMIC_EXPIRE, RUNTIME_PREFETCH_DYNAMIC_STALE } from './constants'
\`\`\`

Usage:

\`\`\`ts
// At the top of a file → entire module is a cache scope
'use cache'
export async function getProducts() {
  return db.products.findMany();
}

// At the top of a function → just that function
async function getProduct(id: string) {
  'use cache'
  return db.products.findUnique({ where: { id } });
}

// At the top of a component → that subtree is cached
export default async function ProductCard({ id }) {
  'use cache'
  const p = await getProduct(id);
  return <article>{p.title}</article>;
}
\`\`\`

The cache key is derived from the function's identity AND its arguments AND its closed-over context (which is why it imports \`decryptActionBoundArgs\` — bound args are encrypted across the wire).

**Pair with \`cacheLife()\` and \`cacheTag()\` for control:**

\`\`\`ts
import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag } from 'next/cache';

async function getProduct(id: string) {
  'use cache'
  cacheLife('hours');   // or { stale: 300, revalidate: 3600, expire: 86400 }
  cacheTag(\`product:\${id}\`);
  return db.products.findUnique({ where: { id } });
}
\`\`\`

\`revalidateTag('product:123')\` later busts that single entry.

**Gotcha #1: this is gated by \`experimental.cacheComponents\` in next.config.js.** Without it, \`"use cache"\` is a no-op directive.

**Gotcha #2: arguments must be serialisable** — same rule as Server Actions. You can't pass a class instance, a function, or a circular object as an argument.

**Gotcha #3: dynamic APIs (cookies, headers, the request URL) throw inside a cache scope.** Read them outside and pass values in as args — the cache key will then include them.

**Gotcha #4: cached functions called from a non-cache context still re-render the *consumers*.** The cache memoises the function's *output*, not the rendering of components downstream. Don't expect cache hits to skip React reconciliation.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'use-cache', 'caching', 'app-router'],
    repository: repo,
    filePath: 'packages/next/src/server/use-cache/use-cache-wrapper.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/server/use-cache/use-cache-wrapper.ts',
  },
  {
    title: 'useSearchParams — the client hook, why it suspends, and the static-render gotcha',
    body: `\`useSearchParams\` is a Client Component hook that reads the current URL's query string. From the source:

\`\`\`ts
export function useSearchParams(): ReadonlyURLSearchParams {
  useDynamicSearchParams?.('useSearchParams()')
  const searchParams = useContext(SearchParamsContext)
  const readonlySearchParams = useMemo((): ReadonlyURLSearchParams => {
    if (!searchParams) {
      // When the router is not ready in pages, we won't have the search params
      // available.
      return null!
    }
    return new ReadonlyURLSearchParams(searchParams)
  }, [searchParams])
  // ...
}
\`\`\`

The \`useDynamicSearchParams\` import (on the server) is what marks a route as dynamic when this hook is used in an SSR context. That's why **a Client Component that calls \`useSearchParams\` causes the closest \`<Suspense>\` boundary above it to bail out of static rendering** during prerender.

Canonical pattern:

\`\`\`tsx
// app/search/page.tsx
import { Suspense } from 'react';
import SearchForm from './SearchForm';      // Client Component using useSearchParams

export default function Page() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <SearchForm />
    </Suspense>
  );
}
\`\`\`

Without the Suspense boundary, the entire \`/search\` page falls back to dynamic rendering. With the boundary, only the form re-renders client-side; the rest of the page stays static.

**The returned object is a ReadonlyURLSearchParams.** You can call \`.get('q')\`, \`.getAll('tag')\`, \`.has('page')\`, but not \`.set()\`/\`.delete()\` — those throw. To update the URL, build a new \`URLSearchParams\` and use \`router.push(\`?\${params.toString()}\`)\`.

**Gotcha #1: in the Pages Router, \`useSearchParams\` returns null on the first render.** That's the \`return null!\` branch above. App Router callers don't see this, but if you migrate code, the null check will look weird until you remove it.

**Gotcha #2: searchParams change does NOT remount the component.** The hook returns a new object on every change but the component instance stays the same — your useEffect deps need to include the actual values you care about, not the searchParams object identity (which is stable across re-renders sometimes).

**Gotcha #3: don't use this in a Server Component.** It's client-only. To read query params on the server, use the \`searchParams\` prop on \`page.tsx\`:

\`\`\`tsx
export default async function Page(
  { searchParams }: { searchParams: Promise<{ q?: string }> }
) {
  const { q } = await searchParams;       // also async since v15
  return <p>Searching for: {q}</p>;
}
\`\`\``,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'app-router', 'use-search-params', 'client-components'],
    repository: repo,
    filePath: 'packages/next/src/client/components/navigation.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/client/components/navigation.ts',
  },
  {
    title: '<Form> — progressive-enhancement form for client navigation',
    body: `\`next/form\` exports a \`<Form>\` component that wraps \`<form>\` with App-Router-native client navigation. Source:

\`\`\`ts
'use client'
import { type SubmitEvent, useContext, forwardRef } from 'react'
import { addBasePath } from './add-base-path'
import { RouterContext } from '../shared/lib/router-context.shared-runtime'
import {
  checkFormActionUrl,
  createFormSubmitDestinationUrl,
  DISALLOWED_FORM_PROPS,
  hasReactClientActionAttributes,
  hasUnsupportedSubmitterAttributes,
} from './form-shared'

const Form = forwardRef<HTMLFormElement, FormProps>(function FormComponent(
  { replace, scroll, prefetch: prefetchProp, ...props }, ref
) {
  const router = useContext(RouterContext)
  const actionProp = props.action
  const isNavigatingForm = typeof actionProp === 'string'
  // ...
})
\`\`\`

Two modes based on the \`action\` prop:

\`\`\`tsx
// 1. Navigation mode — action is a string URL
<Form action="/search">
  <input name="q" />
  <button>Search</button>
</Form>
// Submitting navigates to /search?q=... via router.push (no full reload)

// 2. Server Action mode — action is a function
<Form action={searchAction}>
  <input name="q" />
  <button>Search</button>
</Form>
\`\`\`

The killer feature of mode 1: **it works with JavaScript disabled**. Server-rendered, it's just a regular \`<form action="/search">\` — pressing Enter does a real full-page form submission. With JS, the same form intercepts submit and does a soft client navigation. Search forms, filter forms, login redirects all benefit.

**Built-in prefetching:** \`<Form>\` prefetches the destination route in the background while the user is typing, so the navigation feels instant.

**Gotcha #1: passing \`<Form action={fn}>\` (a function) disables \`replace\` and \`scroll\` props.** The source explicitly warns:

\`\`\`ts
if (!isNavigatingForm && (replace !== undefined || scroll !== undefined)) {
  console.error('Passing \`replace\` or \`scroll\` to a <Form> whose \`action\` is a function has no effect.')
}
\`\`\`

If you need them, do navigation manually inside the action via \`redirect()\`.

**Gotcha #2: don't put a \`<Form action="/x">\` inside a \`<Form action="/y">\`.** HTML doesn't allow nested forms, and the React tree mounts both submit handlers — clicking submit fires both.

**Gotcha #3: name attributes matter.** Form fields without a \`name\` are silently dropped from the navigation URL. Same as plain HTML — but easy to forget when destructuring controlled components.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'next-form', 'progressive-enhancement', 'client-navigation'],
    repository: repo,
    filePath: 'packages/next/src/client/form.tsx',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/client/form.tsx',
  },
  {
    title: 'next/headers, next/cookies — the public API surface that re-exports the server primitives',
    body: `The package entry \`next/headers\` is one line per export — it's a re-export shim for the actual implementations:

\`\`\`ts
// packages/next/src/api/headers.ts
export * from '../server/request/cookies'
export * from '../server/request/headers'
export * from '../server/request/draft-mode'
\`\`\`

That's the entire public surface for request-bound APIs. Three async functions: \`cookies()\`, \`headers()\`, \`draftMode()\`.

The pattern of "the public package is a tiny re-export of the internal source" is how Next.js keeps the API surface stable while shuffling internals around. The same pattern applies to:

- \`next/server\` → re-exports \`NextRequest\`, \`NextResponse\`, \`URLPattern\`, \`userAgent()\`, \`after()\`, \`unstable_cache\`, \`revalidatePath\`, \`revalidateTag\`.
- \`next/cache\` → re-exports cache helpers (\`unstable_cache\`, \`revalidatePath\`, \`revalidateTag\`, \`cacheLife\`, \`cacheTag\`).
- \`next/navigation\` → re-exports \`redirect\`, \`notFound\`, \`useRouter\`, \`useSearchParams\`, \`usePathname\`, \`useSelectedLayoutSegment\`.
- \`next/og\` → re-exports \`ImageResponse\`.

Canonical usage:

\`\`\`ts
import { cookies, headers, draftMode } from 'next/headers';
import { redirect, notFound, useRouter } from 'next/navigation';
import { revalidatePath, revalidateTag, after } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
\`\`\`

**Gotcha #1: \`next/headers\` is server-only.** The \`server-only\` package marker makes the build fail if you accidentally import it from a Client Component. The error: "You're importing a component that needs \`next/headers\`. That only works in a Server Component."

**Gotcha #2: \`next/navigation\` works in BOTH server and client** — but re-exports different functions per side. \`useRouter\` is client-only; \`redirect\` and \`notFound\` work everywhere; \`useSearchParams\` is client-only. The package internally splits into \`navigation.ts\` (client) and \`navigation.react-server.ts\` (server) and re-exports the right one based on the React Server condition.

**Gotcha #3: don't import from \`next/dist/...\` directly.** Those paths are unstable across versions. Always import from the published surface (\`next/headers\`, \`next/cache\`, etc.) — the re-export shim is the contract.

**Gotcha #4: TypeScript autoimport will sometimes pull from \`next/dist/server/...\`** — fix the import or add an ESLint rule to forbid it. You'll silently break across upgrades otherwise.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'public-api', 'package-exports'],
    repository: repo,
    filePath: 'packages/next/src/api/headers.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/api/headers.ts',
  },
  {
    title: 'next-font-loader — how next/font hosts and inlines fonts at build time',
    body: `\`next/font/google\` and \`next/font/local\` look like simple imports at the page level:

\`\`\`ts
import { Inter } from 'next/font/google';
const inter = Inter({ subsets: ['latin'], display: 'swap' });
export default function Layout({ children }) {
  return <html className={inter.className}><body>{children}</body></html>;
}
\`\`\`

Behind that is a Webpack/Turbopack loader (\`packages/next/src/build/webpack/loaders/next-font-loader\`) that runs at build time:

1. **Resolves the font files** from Google Fonts (or local disk for \`next/font/local\`).
2. **Downloads them once** and writes them into the static output directory under \`/_next/static/media/\`.
3. **Generates a CSS module** with \`@font-face\` declarations and a stable hashed class name.
4. **Returns that CSS module's exports** as the value of the \`Inter(...)\` call — that's how \`inter.className\` and \`inter.style.fontFamily\` become real values.

The PostCSS plugin (\`postcss-next-font.ts\`) handles the CSS rewriting. Net result: zero runtime requests to Google's CDN, zero CLS from late-loading fonts, fonts served from your own origin.

**Why does this matter?**

- **No external request to fonts.googleapis.com.** Your site doesn't leak user IPs to Google for the font load. GDPR-friendly.
- **Self-hosted CSS** with \`size-adjust\`, \`ascent-override\`, \`descent-override\` injected automatically to match the fallback font's metrics — eliminates layout shift when the web font swaps in.
- **Subset by language.** Only the glyph ranges you ask for ship in the WOFF2.

**Gotcha #1: every \`Inter({...})\` call must be at module scope.** Calling it inside a function body breaks the build — the loader walks the AST looking for top-level usage. Error: "Font loader values must be explicitly written literals."

**Gotcha #2: \`display: 'swap'\` is the right default.** \`'block'\` blocks render until the font loads (FOIT — flash of invisible text); \`'swap'\` shows the fallback first then swaps in (FOUT — flash of unstyled text). Optional/auto/fallback exist but each has a CLS or FOIT cost.

**Gotcha #3: variable fonts via \`weight: 'variable'\` ship a single file.** Specifying \`weight: ['400', '700']\` for a variable font like Inter wastes bytes. Check whether the font is variable on Google Fonts before pinning weights.

**Gotcha #4: \`next/font/local\` requires \`src\` to be a relative import-like path** (\`'./fonts/MyFont.woff2'\`), not an alias. The loader resolves at build time relative to the file calling it.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'next-font', 'fonts', 'performance'],
    repository: repo,
    filePath: 'packages/next/src/build/webpack/loaders/next-font-loader/index.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/build/webpack/loaders/next-font-loader/index.ts',
  },
  {
    title: 'generateStaticParams — runs at build, controls dynamic route prerendering',
    body: `For a dynamic route like \`/blog/[slug]/page.tsx\`, you tell Next.js which slugs to prerender at build time by exporting \`generateStaticParams\`:

\`\`\`ts
// app/blog/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await fetch('https://cms.example.com/posts').then(r => r.json());
  return posts.map((p: { slug: string }) => ({ slug: p.slug }));
}

export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // ...
}
\`\`\`

The build-side handling lives in \`packages/next/src/build/static-paths/app.ts\` and friends. The generated paths are prerendered to HTML/RSC and cached. At request time, paths in the generated set serve from cache; paths NOT in the set fall through to \`dynamicParams\`.

**\`dynamicParams\` controls the fall-through:**

\`\`\`ts
export const dynamicParams = true;   // default — render unknown slugs on demand
// or
export const dynamicParams = false;  // 404 anything not in generateStaticParams
\`\`\`

\`dynamicParams = false\` is "static-only" — pair it with \`generateStaticParams\` for a fully-static blog where you want a 404 for unknown URLs at the edge.

**Multi-segment dynamic routes** require returning all segments:

\`\`\`ts
// app/[category]/[product]/page.tsx
export async function generateStaticParams() {
  return products.map(p => ({ category: p.category, product: p.slug }));
}
\`\`\`

**Layouts can also export \`generateStaticParams\`** — the framework intersects the parent's params with each child's to compute the full prerender matrix.

**Gotcha #1: returning \`[]\` doesn't disable prerendering — it disables ALL prerendering.** With \`dynamicParams: true\` (default), every URL is rendered on first request and cached. With \`dynamicParams: false\` and \`[]\`, every URL is a 404. To disable static optimisation entirely, use \`export const dynamic = 'force-dynamic'\` instead.

**Gotcha #2: the function runs at \`next build\` time only.** Reading from a database means the database must be reachable from your CI environment. If your prod DB is behind a VPN, your CI either fails or generates an empty list (silently — no error).

**Gotcha #3: too many params → too long a build.** A site with 100K products that all prerender will take an hour to build and produce gigabytes of output. Use \`dynamicParams: true\` plus an empty \`generateStaticParams\` (or one returning the top-100 hottest slugs) and let ISR handle the long tail.

**Gotcha #4: it can't read \`headers()\` or \`cookies()\`.** It runs without a request — those throw "used inside generateStaticParams" with the docs link.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'app-router', 'static-generation', 'isr'],
    repository: repo,
    filePath: 'packages/next/src/build/static-paths/app.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/build/static-paths/app.ts',
  },
  {
    title: 'generateMetadata — async metadata, parent inheritance, streaming',
    body: `\`generateMetadata\` exports from \`page.tsx\` or \`layout.tsx\` and returns a \`Metadata\` object that Next.js merges into the document \`<head>\`:

\`\`\`ts
// app/blog/[slug]/page.tsx
import type { Metadata, ResolvingMetadata } from 'next';

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  const parentMeta = await parent;
  return {
    title: \`\${post.title} | \${parentMeta.title?.absolute ?? 'Site'}\`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      images: [\`/api/og?title=\${encodeURIComponent(post.title)}\`],
    },
  };
}
\`\`\`

The Metadata API source lives in \`packages/next/src/lib/metadata/metadata.tsx\`. Notable behaviors:

- **Layouts and pages can both export it.** Children's metadata merges over (and can read) the parent's via the second \`parent\` arg (a Promise so child metadata generation can start in parallel with the parent's).
- **Static metadata (\`export const metadata\`)** is faster than \`generateMetadata\` — Next can hoist it without running JS. Use the static form for layouts where the title doesn't depend on data.
- **\`metadataBase\`** sets the base URL for all relative paths in metadata (OG images, canonical URL). Setting it on the root layout once is the right move.
- **Streaming-aware:** when a page uses \`<Suspense>\`, the \`<head>\` ships with the initial chunk so the social-card crawlers (Twitterbot, Facebook) see the right OG image without waiting for the body to finish.

**Gotcha #1: generateMetadata runs in parallel with the page's data fetching.** Don't expect it to "see" data that the page component will fetch later — fetch it again here (the result will be deduped by the patched \`fetch\`).

**Gotcha #2: it must return a plain serialisable object.** No JSX, no class instances, no Date objects (use ISO strings).

**Gotcha #3: \`title\` can be a string, a template object, or absolute.** \`{ template: '%s | Site', default: 'Site' }\` on the layout, then \`{ title: 'Blog' }\` on a page renders \`Blog | Site\`. \`{ title: { absolute: 'Special' } }\` overrides the template.

**Gotcha #4: \`generateMetadata\` errors do NOT break the page.** They get logged and the page renders without that metadata. Useful for resilience but means you might silently ship pages without OG images. Add a Sentry breadcrumb in the function.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'metadata', 'seo', 'app-router'],
    repository: repo,
    filePath: 'packages/next/src/lib/metadata/metadata.tsx',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/lib/metadata/metadata.tsx',
  },
  {
    title: 'app-route module — auto-implementing HEAD and OPTIONS for free CORS preflight',
    body: `When you write \`export async function GET(req)\` in a route handler, Next.js automatically implements \`HEAD\` for you. Source from the route module:

\`\`\`ts
import { autoImplementMethods } from './helpers/auto-implement-methods'
import { type HTTP_METHOD, HTTP_METHODS, isHTTPMethod } from '../../web/http'
\`\`\`

\`autoImplementMethods\` walks your exported methods and:

- **HEAD = GET with body stripped.** If you implement GET, HEAD is auto-derived. The body is computed and then dropped (so cache-control, etag, last-modified all match GET — important for crawlers).
- **OPTIONS responds to CORS preflight.** Returns 204 with \`Allow:\` header listing your implemented methods, plus default \`Access-Control-Allow-*\` headers. You can override by exporting your own \`OPTIONS\`.

The HTTP method names are exact — uppercase only. The \`isHTTPMethod\` predicate validates against the spec list (\`GET\`, \`HEAD\`, \`POST\`, \`PUT\`, \`DELETE\`, \`PATCH\`, \`OPTIONS\`).

Canonical handler set:

\`\`\`ts
// app/api/widgets/[id]/route.ts
import { NextResponse } from 'next/server';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const widget = await db.widgets.findUnique({ where: { id } });
  return widget ? NextResponse.json(widget) : NextResponse.json({ error: 'not_found' }, { status: 404 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const updated = await db.widgets.update({ where: { id }, data: body });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.widgets.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}

// HEAD and OPTIONS are auto-implemented
\`\`\`

**Gotcha #1: \`OPTIONS\` auto-handler does NOT add CORS \`Access-Control-Allow-Origin\`.** It responds 204 but you still need to set the headers (or use middleware) for browsers to actually allow cross-origin requests.

**Gotcha #2: the auto-HEAD runs your GET handler, then strips the body** — meaning a 50ms GET handler also costs 50ms on HEAD. If HEAD is on a hot path, write a dedicated cheap version.

**Gotcha #3: route.ts and page.tsx in the same folder is a build error.** Conventions don't co-exist; pick one per route segment.

**Gotcha #4: methods you DON'T export return 405 Method Not Allowed.** Never silent-pass to a default. So a route with only GET returns 405 for POST without you doing anything — but your error pages still don't show up because route handlers don't have a not-found.tsx counterpart.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'route-handlers', 'http-methods', 'cors'],
    repository: repo,
    filePath: 'packages/next/src/server/route-modules/app-route/helpers/auto-implement-methods.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/server/route-modules/app-route/helpers/auto-implement-methods.ts',
  },
  {
    title: 'Server Actions — request metadata detection and the action handler dispatch',
    body: `Server Actions are functions you mark with \`'use server'\` that the framework can call from a client form or button. The dispatcher lives in \`packages/next/src/server/app-render/action-handler.ts\` and uses request metadata to detect that an incoming POST is an action invocation:

\`\`\`ts
import { getServerActionRequestMetadata } from '../lib/server-action-request-meta'
// ...
const {
  isFetchAction,
  isURLEncodedAction,
  isMultipartAction,
  isPossibleServerAction,
  // ...
} = getServerActionRequestMetadata(req)
\`\`\`

The dispatcher recognises three encoding flavors:

- **\`isFetchAction\`** — a JSON-encoded RPC call from \`next/link\`/React (\`Next-Action\` header is set).
- **\`isMultipartAction\`** — a \`<form action={action}>\` that includes file inputs (\`multipart/form-data\`).
- **\`isURLEncodedAction\`** — a plain HTML form submit (\`application/x-www-form-urlencoded\`).

The last two are progressive-enhancement pathways: even if JS doesn't load, the form still submits and the action runs server-side.

Canonical pattern:

\`\`\`tsx
// app/actions.ts
'use server';
import { revalidatePath } from 'next/cache';

export async function addTodo(formData: FormData) {
  const text = formData.get('text') as string;
  await db.todos.create({ data: { text } });
  revalidatePath('/todos');
}

// app/todos/page.tsx
import { addTodo } from '../actions';
export default function Page() {
  return (
    <form action={addTodo}>
      <input name="text" />
      <button>Add</button>
    </form>
  );
}
\`\`\`

**The client-side helpers:**

\`\`\`tsx
'use client';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';

function Submit() {
  const { pending } = useFormStatus();           // reads parent <form>'s state
  return <button disabled={pending}>{pending ? 'Adding…' : 'Add'}</button>;
}

function Form() {
  const [state, action, pending] = useActionState(addTodo, { error: null });
  // pass action= to the form, render state.error if present
}
\`\`\`

**Gotcha #1: Server Actions are HTTP POSTs to the SAME page URL** with a special \`Next-Action\` header. They're not a separate route. This means CSP and cookie scoping work as expected.

**Gotcha #2: 4 KB body limit by default in serverless deployments.** Configure \`experimental.serverActions.bodySizeLimit\` if you need larger uploads — but for files prefer presigned-URL uploads to S3 instead.

**Gotcha #3: imported-but-unused server-action exports still ship to the server bundle.** Tree-shaking respects the \`'use server'\` boundary because the framework needs every action discoverable for HMR.

**Gotcha #4: the server action ID is encrypted with a build-time key.** A change to that key (new build, different deploy) invalidates in-flight optimistic invocations. Stale tabs that submit forms after a deploy get the cryptic "Failed to find Server Action" error.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'server-actions', 'app-router', 'progressive-enhancement'],
    repository: repo,
    filePath: 'packages/next/src/server/app-render/action-handler.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/server/app-render/action-handler.ts',
  },
  {
    title: 'NextResponse — the augmented Response with cookies/redirect/rewrite helpers',
    body: `\`NextResponse\` extends the Web Fetch \`Response\` with framework-specific shortcuts (\`cookies\`, \`redirect\`, \`rewrite\`, \`next\`, \`json\`). It's the canonical return type for both middleware and route handlers:

\`\`\`ts
// packages/next/src/server/web/spec-extension/response.ts
import { Response } from 'next/dist/compiled/@edge-runtime/primitives'
import { ResponseCookies } from './cookies'

export class NextResponse<Body = unknown> extends Response {
  static json<JsonBody>(body: JsonBody, init?: ResponseInit): NextResponse<JsonBody> { /* ... */ }
  static redirect(url: string | URL, init?: number | ResponseInit): NextResponse { /* ... */ }
  static rewrite(destination: string | URL, init?: ResponseInit): NextResponse { /* ... */ }
  static next(init?: ResponseInit): NextResponse { /* ... */ }

  get cookies(): ResponseCookies { /* ... */ }
}
\`\`\`

Each helper has a specific use-case:

\`\`\`ts
// Route handler returning JSON
return NextResponse.json({ ok: true });

// Permanent redirect from middleware
return NextResponse.redirect(new URL('/login', request.url), 308);

// Internal rewrite — change the path without changing the URL the user sees
return NextResponse.rewrite(new URL('/maintenance', request.url));

// Continue to the route handler, but mutate headers
const response = NextResponse.next();
response.headers.set('x-custom', 'yes');
return response;

// Set a cookie on the response
const response = NextResponse.json({ ok: true });
response.cookies.set('session', token, { httpOnly: true });
return response;
\`\`\`

**The \`rewrite\` vs \`redirect\` distinction:** \`redirect\` sends a 30x to the browser and the URL changes. \`rewrite\` proxies internally — the URL bar stays \`/old-page\` but the user sees \`/new-page\`'s content. Useful for A/B testing and feature flags.

**\`NextResponse.next()\` is middleware-specific.** Returning it tells the router "I'm done, continue to the next layer." Returning a regular \`new Response(...)\` short-circuits and the route handler/page never runs.

**Gotcha #1: \`NextResponse.json()\` sets \`content-type: application/json\`** automatically. Don't override it via init unless you mean to.

**Gotcha #2: redirect URLs MUST be absolute.** \`NextResponse.redirect('/login')\` throws "URL is malformed." Always do \`new URL('/login', request.url)\`.

**Gotcha #3: cookies set on \`NextResponse.next()\` are forwarded to the response, not the next middleware.** If you want to pass data downstream, use \`request.headers.set('x-internal', value)\` and read it in the route handler — request-header mutations propagate.

**Gotcha #4: there's no \`waitUntil\` on response.** Use \`request.waitUntil()\` (in middleware) or \`after()\` (in route handlers) for fire-and-forget background work.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'next-response', 'middleware', 'route-handlers'],
    repository: repo,
    filePath: 'packages/next/src/server/web/spec-extension/response.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/server/web/spec-extension/response.ts',
  },
  {
    title: 'updateTag and refresh — the Server-Action-only revalidation primitives',
    body: `Alongside \`revalidateTag\` and \`revalidatePath\`, the App Router exposes two narrower invalidation APIs that ONLY work inside Server Actions:

\`\`\`ts
export function updateTag(tag: string) {
  const workStore = workAsyncStorage.getStore()
  if (!workStore || workStore.page.endsWith('/route')) {
    throw new Error(
      'updateTag can only be called from within a Server Action. ' +
      'To invalidate cache tags in Route Handlers or other contexts, use revalidateTag instead.'
    )
  }
  return revalidate([tag], \`updateTag \${tag}\`, undefined)
}

export function refresh() {
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (!workStore || workStore.page.endsWith('/route') || workUnitStore?.phase !== 'action') {
    throw new Error('refresh can only be called from within a Server Action.')
  }
  workStore.pathWasRevalidated = ActionDidRevalidateDynamicOnly
}
\`\`\`

Three subtly different APIs, three intents:

- **\`revalidateTag(tag, profile)\`** — fire-and-forget cache bust. Cached entries become stale; next request re-fetches. Works everywhere (Route Handlers, Server Actions). The action itself does NOT see the new data.
- **\`updateTag(tag)\`** — Server-Action-only. Bust the tag AND ensure the *current action's response* re-renders with fresh data. This is the "read your own writes" semantics — after \`db.products.update(...)\` you call \`updateTag('product:42')\` and the page re-renders with the new value before the user sees the response.
- **\`refresh()\`** — Server-Action-only. Doesn't touch the cache; just tells the client to re-fetch dynamic data on the next render. Useful when your action mutated something that's not cached but is still rendered (\`headers()\`-derived state, etc.).

**The phase check is what enforces "Server Action only."** \`workUnitStore.phase !== 'action'\` means the call site isn't an action — it's a render or an after() callback. The error message in the source is unusually clear about the intent.

**Gotcha #1: Route Handlers are not actions.** The check \`workStore.page.endsWith('/route')\` excludes \`route.ts\` files. Use \`revalidateTag\` from those.

**Gotcha #2: \`revalidateTag('x')\` without a profile now warns.** The deprecation message:

\`\`\`ts
'"revalidateTag" without the second argument is now deprecated, add second argument of "max" or use "updateTag".'
\`\`\`

For old-style "bust this forever" semantics, pass \`'max'\` as the profile.

**Gotcha #3: \`refresh()\` works only after a server action finished writing the response.** Calling it during render throws.

**Gotcha #4: read-your-own-writes is implementation-defined.** Two updateTag calls in the same action consolidate; the renderer waits for the cache writers to flush before continuing the render pass.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'server-actions', 'caching', 'revalidate'],
    repository: repo,
    filePath: 'packages/next/src/server/web/spec-extension/revalidate.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/server/web/spec-extension/revalidate.ts',
  },
  {
    title: 'NextRequest — the augmented Request with cookies, geo, and nextUrl',
    body: `\`NextRequest\` is the Web Fetch \`Request\` extended with framework-specific accessors. From the spec-extension source:

\`\`\`ts
// packages/next/src/server/web/spec-extension/request.ts
export class NextRequest extends Request {
  public readonly cookies: RequestCookies
  public readonly nextUrl: NextURL

  constructor(input: URL | RequestInfo, init: RequestInit = {}) {
    super(input, init)
    // ...
    this.nextUrl = new NextURL(typeof input !== 'string' && 'url' in input ? input.url : input.toString(), { headers: this.headers })
    this.cookies = new RequestCookies(this.headers)
  }
}
\`\`\`

Three things \`NextRequest\` adds beyond a plain \`Request\`:

1. **\`request.cookies\`** — a typed \`RequestCookies\` adapter so you can do \`request.cookies.get('session')?.value\` without manually parsing the \`Cookie\` header. Read-only on the request side; if you want to set cookies, do it on the response.

2. **\`request.nextUrl\`** — a \`NextURL\` (extends \`URL\`) that knows about the framework's locale, basePath, and trailing-slash config. \`request.nextUrl.pathname\` strips your basePath; \`request.nextUrl.searchParams\` is the parsed query.

3. **\`request.geo\` and \`request.ip\`** (deprecated; on Vercel, read from headers like \`x-vercel-ip-country\`). Earlier versions auto-populated these from platform headers.

Canonical use in middleware:

\`\`\`ts
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const session = request.cookies.get('session');
  if (!session && request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
\`\`\`

**\`request.nextUrl.clone()\` is the right way to derive a redirect URL** — preserves the host, protocol, and basePath. Building the URL by hand (\`new URL('/login', request.url)\`) usually works but breaks on rewrites and basePath setups.

**Gotcha #1: in route handlers (not middleware), the parameter type is plain \`Request\`.** Use \`NextRequest\` only when you explicitly need the augmented API:

\`\`\`ts
import { type NextRequest } from 'next/server';
export async function POST(req: NextRequest) {
  const session = req.cookies.get('session')?.value;
  // ...
}
\`\`\`

**Gotcha #2: \`request.nextUrl.searchParams\` is a live \`URLSearchParams\`.** Mutating it doesn't change the request; clone first.

**Gotcha #3: cookies are read-only on \`request.cookies\`.** \`set()\` does nothing. To send a cookie back, use \`response.cookies.set(...)\`.

**Gotcha #4: \`request.body\` is a single-consumer ReadableStream.** Calling \`request.json()\` once consumes it. For Stripe webhook signature verification, you need the raw text first — use \`await request.text()\` and \`JSON.parse\` it yourself.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'next-request', 'middleware', 'cookies'],
    repository: repo,
    filePath: 'packages/next/src/server/web/spec-extension/request.ts',
    url: 'https://github.com/vercel/next.js/blob/canary/packages/next/src/server/web/spec-extension/request.ts',
  },
];
