/**
 * Batch github-026-hono-edge
 *
 * 25 Hono patterns drawn from the actual source of honojs/hono.
 * Each entry is attributed to a real file in the repo. The `url`
 * always resolves to the canonical file on `main`.
 *
 * Authoring rules (see CORPUS-PLAN.md):
 * - Real attribution; no fabricated URLs
 * - Real patterns the project actually implements
 * - 250-450 word body
 * - One topic per entry
 * - WHAT + HOW (real code) + WHY + non-obvious gotcha
 */

import type { SeedItem } from '../types';

const hono = { owner: 'honojs', name: 'hono' };
const baseUrl = 'https://github.com/honojs/hono/blob/main';

export const BATCH: SeedItem[] = [
  {
    title: 'Hono constructor wires SmartRouter over RegExpRouter + TrieRouter by default',
    body: `\`new Hono()\` (the user-facing class) extends \`HonoBase\` and, if you don't pass a custom router, instantiates a \`SmartRouter\` initialized with two child routers in priority order.

\`\`\`ts
// src/hono.ts
constructor(options: HonoOptions<E> = {}) {
  super(options)
  this.router =
    options.router ??
    new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()],
    })
}
\`\`\`

\`HonoBase\` itself is router-agnostic — its inline doc literally says "this class is like an abstract class and does not have a router. To use it, inherit the class and implement router in the constructor." That separation is why \`hono/tiny\` (preset) can extend the same base and swap in \`PatternRouter\` for a smaller bundle without copying the routing code.

The SmartRouter strategy is "try the best router for these specific routes, fall back to the next." \`RegExpRouter\` is the fastest matcher in the suite (single pre-compiled regexp at build time, O(1) match) but it can't express every routing pattern. When it sees something it can't compile (back-references, certain optional-parameter combinations), it throws \`UnsupportedPathError\`, and SmartRouter quietly retries with TrieRouter, which is slower but supports the full grammar.

Non-obvious gotcha 1: SmartRouter only decides on the first \`match()\` call, not at \`add()\` time. So the very first request after boot pays the build cost for both routers (it tries RegExpRouter first, and if that throws it builds TrieRouter too). If your boot path needs deterministic latency for the first request, warm the router with \`app.request('/__warm')\` before going live.

Non-obvious gotcha 2: once SmartRouter picks a child router, it rebinds its own \`match\` method to that child via \`this.match = router.match.bind(router)\` and discards the others — so adding routes after the first request hits the "matcher is already built" guard and throws. Define all routes before the first incoming request.

Non-obvious gotcha 3: if you pass \`router: new RegExpRouter()\` explicitly to bypass SmartRouter, you give up the TrieRouter fallback — any unsupported pattern will now hard-throw at build time, which is what you want in tests but probably not what you want in production.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'router', 'smart-router', 'reg-exp-router', 'trie-router'],
    repository: hono,
    filePath: 'src/hono.ts',
    url: `${baseUrl}/src/hono.ts`,
  },
  {
    title: 'app.get / .post / .all are method-chained at construction by iterating METHODS',
    body: `Hono doesn't define each verb as its own method declaration. \`HonoBase\`'s constructor walks \`[...METHODS, METHOD_NAME_ALL_LOWERCASE]\` and assigns a closure to each one on the instance.

\`\`\`ts
// src/hono-base.ts
const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE]
allMethods.forEach((method) => {
  this[method] = (args1: string | H, ...args: H[]) => {
    if (typeof args1 === 'string') {
      this.#path = args1
    } else {
      this.#addRoute(method, this.#path, args1)
    }
    args.forEach((handler) => {
      this.#addRoute(method, this.#path, handler)
    })
    return this as any
  }
})
\`\`\`

This is what enables the chainable RPC ergonomics — each \`.get()/.post()\` call returns \`this\`, so types accumulate into the schema generic. The handler signatures are typed via the \`HandlerInterface\` overloads declared on the class, but at runtime everything dispatches through the same closure.

Two things that look like bugs but aren't: (1) if you call \`app.get(handler)\` without a path (string-or-handler first arg), Hono uses the previously set \`#path\` — this is the chainable form \`app.get('/users').get(handler1).get(handler2)\` where you only specify the path once. (2) Multiple handlers per call (\`app.get('/x', mw, mw2, finalHandler)\`) are added as separate router entries, all under the same path — they get composed by \`compose()\` only when more than one matches at request time.

Gotcha: the handler is assigned via \`this[method]\` (a normal property), not on the prototype. That means when you do \`app.get = somethingElse\` it shadows the constructor-assigned closure cleanly, but it also means every Hono instance allocates ~10 closures (one per HTTP verb) at construction. For most apps this is invisible; if you're spawning thousands of sub-apps per request (rare), it shows up. Just reuse the same Hono instance per route group instead.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'routing', 'http-methods', 'chainable'],
    repository: hono,
    filePath: 'src/hono-base.ts',
    url: `${baseUrl}/src/hono-base.ts`,
  },
  {
    title: 'c.req.json() / c.req.text() share a single bodyCache to allow multi-format reads',
    body: `HonoRequest stores parsed body forms in a \`bodyCache: { json?, text?, formData?, ... }\`. Each parser checks the cache first; if any other parser has already read the body, it serializes from that cached value rather than touching the now-locked underlying \`Request\` stream.

\`\`\`ts
// src/request.ts
#cachedBody = (key: keyof Body) => {
  const { bodyCache, raw } = this
  const cachedBody = bodyCache[key]
  if (cachedBody) return cachedBody

  const anyCachedKey = Object.keys(bodyCache)[0]
  if (anyCachedKey) {
    return (bodyCache[anyCachedKey as keyof Body] as Promise<BodyInit>).then((body) => {
      if (anyCachedKey === 'json') {
        body = JSON.stringify(body)
      }
      return new Response(body)[key]()
    })
  }
  return (bodyCache[key] = raw[key]())
}

json<T = any>(): Promise<T> { return this.#cachedBody('text').then((text) => JSON.parse(text)) }
text(): Promise<string>      { return this.#cachedBody('text') }
formData(): Promise<FormData> { return this.#cachedBody('formData') }
\`\`\`

Note that \`json()\` is implemented in terms of \`text()\` — it caches the raw text and re-parses, so calling \`c.req.text()\` after \`c.req.json()\` is free (it returns the cached string, not a re-read of the stream).

Why this matters: a fetch \`Request\` body is a one-shot \`ReadableStream\`. Without the cache, your validation middleware reading \`c.req.json()\` would lock the stream and your handler reading it again would get \`TypeError: body has already been used\`. Hono solves this transparently by keeping the parsed result in memory.

Non-obvious gotcha: the cross-format conversion path (\`anyCachedKey\` branch) builds a \`new Response(body)\` and re-parses — that works for converting cached \`text\` → \`arrayBuffer\`, but going from \`formData\` → \`text\` will give you the multipart-encoded string with boundaries, not the original raw body. If you need the raw bytes, read \`c.req.arrayBuffer()\` first or grab \`c.req.raw.body\` before any other parser runs. This is also why webhook signature verification (Stripe, GitHub) must be the very first thing you do — you need the unparsed raw bytes to recompute the HMAC.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'request', 'body-parsing', 'json', 'cache'],
    repository: hono,
    filePath: 'src/request.ts',
    url: `${baseUrl}/src/request.ts`,
  },
  {
    title: 'c.json() / c.text() / c.html() set Content-Type only when not already set',
    body: `Each response helper on \`Context\` builds a \`Response\` via the private \`#newResponse\`, which merges any pre-set headers from \`c.header()\` and \`c.status()\` calls earlier in the request lifecycle.

\`\`\`ts
// src/context.ts
text: TextRespond = (text, arg, headers) => {
  return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized
    ? (new Response(text) as ReturnType<TextRespond>)
    : (this.#newResponse(text, arg, setDefaultContentType(TEXT_PLAIN, headers)) as ReturnType<TextRespond>)
}

json: JSONRespond = (object, arg, headers) => {
  return this.#newResponse(
    JSON.stringify(object),
    arg,
    setDefaultContentType('application/json', headers)
  ) as any
}

html: HTMLRespond = (html, arg, headers) => {
  const res = (html: string) =>
    this.#newResponse(html, arg, setDefaultContentType('text/html; charset=UTF-8', headers))
  return typeof html === 'object'
    ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res)
    : res(html)
}
\`\`\`

The \`text()\` fast path is interesting: if you haven't set any headers, status, or response args (the common \`return c.text('hello')\` case), Hono skips the entire \`#newResponse\` machinery and just returns \`new Response(text)\` directly. That's a measurable win for hot paths returning small responses — the framework genuinely costs ~zero overhead vs raw fetch handlers in that scenario.

\`c.html()\` accepts \`string | Promise<string>\` because Hono's JSX support returns promises (HTML escape callbacks run async). It calls \`resolveCallback\` to flush any pending async escapes before serializing. That's why you can \`return c.html(<MyComponent />)\` and still safely render data fetched inside the JSX tree.

Gotcha: \`setDefaultContentType\` only sets the header if you didn't pass one in \`headers\`. So \`c.json(obj, 200, { 'Content-Type': 'application/vnd.api+json' })\` works — your custom JSON content type wins. But \`c.json(obj, 200, { 'content-type': '...' })\` (lowercase) might not, depending on the headers normalization — always use the canonical-case form to be safe across runtimes.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'context', 'response', 'json', 'text', 'html'],
    repository: hono,
    filePath: 'src/context.ts',
    url: `${baseUrl}/src/context.ts`,
  },
  {
    title: 'Route params and wildcard (*) live in TrieRouter; access via c.req.param(key)',
    body: `Path patterns like \`/users/:id\` and \`/files/*\` are split by \`splitRoutingPath\` and inserted into a tree where each segment is either a literal, a named param (\`:id\`), or a wildcard (\`*\`).

\`\`\`ts
// src/router/trie-router/node.ts
insert(method: string, path: string, handler: T): Node<T> {
  this.#order = ++this.#order
  let curNode: Node<T> = this
  const parts = splitRoutingPath(path)
  const possibleKeys: string[] = []

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    const nextP = parts[i + 1]
    const pattern = getPattern(p, nextP)  // detects :name, :name{regex}, *
    const key = Array.isArray(pattern) ? pattern[0] : p
    // ... walk or create child node, collect possibleKeys
  }
  curNode.#methods.push({ [method]: { handler, possibleKeys: ..., score: this.#order } })
}
\`\`\`

At match time, \`Node.search()\` returns \`[[T, Params][]]\` — a list of matched handlers each with their own params record. \`HonoRequest.param()\` then pulls them out:

\`\`\`ts
// src/request.ts
param(key?: string): unknown {
  return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams()
}
\`\`\`

Wildcard (\`*\`) is treated as a special pattern in \`getPattern\`. \`/files/*\` matches \`/files/a\` and \`/files/a/b/c.txt\`, but the captured rest is not exposed via \`c.req.param('*')\` — there's no special wildcard key. If you want the rest path, use \`c.req.path\` and slice it manually, or use a named regex param like \`/files/:rest{.+}\` to capture the tail explicitly.

Hono also supports inline regex constraints: \`/posts/:id{[0-9]+}\` matches only digits. The brace syntax compiles to a sub-pattern that RegExpRouter can express directly; if your regex contains backreferences or conflicts with another route's pattern, RegExpRouter throws and SmartRouter silently downgrades to TrieRouter.

Non-obvious gotcha: param values are URL-decoded lazily — \`#getDecodedParam\` only calls \`tryDecodeURIComponent\` if the value contains \`%\`. So if your route is \`/u/:name\` and the request is \`/u/foo%2Fbar\`, you get \`'foo/bar'\`. But if your handler then re-decodes (because it expected a raw value), you'll double-decode and corrupt the data. Trust Hono's decoding; treat \`c.req.param()\` as already decoded.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'routing', 'params', 'wildcard', 'trie-router'],
    repository: hono,
    filePath: 'src/router/trie-router/node.ts',
    url: `${baseUrl}/src/router/trie-router/node.ts`,
  },
  {
    title: 'SmartRouter picks the fastest router that supports your routes, on first request',
    body: `\`SmartRouter\` accumulates all \`add()\` calls in a temporary \`#routes\` array and only commits to a real router on the first \`match()\` call.

\`\`\`ts
// src/router/smart-router/router.ts
match(method: string, path: string): Result<T> {
  const routers = this.#routers
  const routes = this.#routes!

  for (let i = 0; i < routers.length; i++) {
    const router = routers[i]
    try {
      for (let j = 0; j < routes.length; j++) {
        router.add(...routes[j])
      }
      const res = router.match(method, path)
      this.match = router.match.bind(router)  // rebind future match() calls
      this.#routers = [router]
      this.#routes = undefined
      return res
    } catch (e) {
      if (e instanceof UnsupportedPathError) continue
      throw e
    }
  }
  throw new Error('Fatal error')
}
\`\`\`

The order is fixed by the constructor in \`hono.ts\`: \`[new RegExpRouter(), new TrieRouter()]\`. RegExpRouter is tried first because it's faster (single mega-regex match), and TrieRouter is the fallback because it accepts every path pattern Hono supports.

Why the lazy commit? At \`add()\` time, SmartRouter doesn't know which routers can handle the full set. It needs to know all routes before deciding, because RegExpRouter compiles them into one giant pattern at build time. So SmartRouter buffers until the first match, then attempts to build each router in order until one succeeds.

Gotcha 1: after the first request, \`this.#routes = undefined\`. If you call \`app.get('/late', handler)\` after a request has been served, the underlying router will throw \`MESSAGE_MATCHER_IS_ALREADY_BUILT\` ("matcher is already built"). All routes must be defined before serving traffic — this is fine for normal apps but bites you if you're trying to lazy-register routes from dynamic config.

Gotcha 2: the \`name\` property updates to e.g. \`"SmartRouter + RegExpRouter"\` only after the first match — useful for debugging which router actually handles your traffic. If you see \`"SmartRouter + TrieRouter"\` in production, something in your routes is incompatible with RegExpRouter and you're paying the slower fallback cost; check for back-references or unusual optional-parameter combinations.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'router', 'smart-router', 'performance'],
    repository: hono,
    filePath: 'src/router/smart-router/router.ts',
    url: `${baseUrl}/src/router/smart-router/router.ts`,
  },
  {
    title: 'app.use(path, mw) registers middleware as METHOD_NAME_ALL routes',
    body: `Middleware in Hono isn't a separate concept from routes — it's just a route registered under the special \`METHOD_NAME_ALL\` (\`'ALL'\`) method.

\`\`\`ts
// src/hono-base.ts
this.use = (arg1: string | MiddlewareHandler<any>, ...handlers: MiddlewareHandler<any>[]) => {
  if (typeof arg1 === 'string') {
    this.#path = arg1
  } else {
    this.#path = '*'
    handlers.unshift(arg1)
  }
  handlers.forEach((handler) => {
    this.#addRoute(METHOD_NAME_ALL, this.#path, handler)
  })
  return this as any
}
\`\`\`

So \`app.use(logger())\` is exactly equivalent to \`app.on('ALL', '*', logger())\`. \`app.use('/api/*', cors())\` scopes the middleware to anything matching that wildcard prefix.

The handler signature is the same as a route handler but takes \`next\`: \`async (c, next) => { ... await next(); ... }\`. The actual chaining is done by \`compose()\` (\`src/compose.ts\`) — a koa-style dispatcher that calls each handler with a \`next\` function, where \`next\` calls the next handler. Returning without calling \`next()\` short-circuits the chain (useful in auth middleware that returns 401 directly).

Non-obvious gotcha 1: ordering matters. Middleware runs in registration order, and route handlers are middleware too. If you \`app.get('/x', handler)\` before \`app.use('*', cors())\`, the GET handler runs before CORS — meaning the response leaves without CORS headers. The convention is to register all global middleware first, then routes.

Non-obvious gotcha 2: \`app.use('*', mw)\` and \`app.use(mw)\` are equivalent (the path-less form auto-fills \`'*'\`). But \`app.use('/api', mw)\` matches *only* the exact path \`/api\` — not \`/api/anything\`. You almost always want \`app.use('/api/*', mw)\` for prefix middleware. This trips up people coming from Express where path prefixes match by prefix; in Hono the routing language is uniform across routes and middleware.

Non-obvious gotcha 3: a middleware that returns a Response *and* calls \`next()\` will see \`next()\`'s response overwritten by its own returned value (compose only assigns \`context.res = res\` if not finalized). Either return early to short-circuit, or call \`next()\` and don't return a value — pick one model.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'middleware', 'use', 'compose'],
    repository: hono,
    filePath: 'src/hono-base.ts',
    url: `${baseUrl}/src/hono-base.ts`,
  },
  {
    title: 'c.set / c.get / c.var: typed context variables shared across middleware',
    body: `Hono stores per-request mutable state in \`#var\`, a \`Map<string, unknown>\` lazily initialized on first \`set()\`.

\`\`\`ts
// src/context.ts
set: Set<...> = (key: string, value: unknown) => {
  this.#var ??= new Map()
  this.#var.set(key, value)
}

get: Get<...> = (key: string) => {
  return this.#var ? this.#var.get(key) : undefined
}

get var(): Readonly<...> {
  if (!this.#var) return {} as any
  return Object.fromEntries(this.#var)
}
\`\`\`

The \`E['Variables']\` generic on \`Hono<E>\` is what gives you typed \`c.set('user', user)\` / \`c.get('user')\` calls. Define your env type once:

\`\`\`ts
type AppEnv = { Variables: { user: User; reqId: string } }
const app = new Hono<AppEnv>()

app.use(async (c, next) => {
  c.set('reqId', crypto.randomUUID())
  await next()
})

app.get('/me', (c) => {
  const user = c.get('user') // type: User
  return c.json({ user, reqId: c.var.reqId })
})
\`\`\`

\`c.var.foo\` is the same as \`c.get('foo')\` but as a property accessor — convenient for use inside JSX or template strings. Note that \`c.var\` runs \`Object.fromEntries(this.#var)\` on every access, so don't loop over it in a hot path; cache to a local variable.

Non-obvious gotcha 1: variables are per-request — Hono creates a new \`Context\` per \`fetch()\` call. There's no leakage between requests, which is what you want, but it also means setting a variable in middleware doesn't persist for the next request. For cross-request shared state, use a module-scoped variable, c.env, or external storage (KV/Redis).

Non-obvious gotcha 2: there's also a \`ContextVariableMap\` interface in module-level \`declare module\` blocks — middleware like \`jwt\` augments this so \`c.get('jwtPayload')\` is typed without requiring you to add it to your \`Variables\` type. If you build your own middleware that sets a variable, add a \`declare module 'hono'\` augmentation if you want it auto-typed across the whole app.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'context', 'variables', 'typescript'],
    repository: hono,
    filePath: 'src/context.ts',
    url: `${baseUrl}/src/context.ts`,
  },
  {
    title: 'c.executionCtx.waitUntil: extend request lifetime on Cloudflare Workers',
    body: `\`ExecutionContext\` mirrors the Cloudflare Workers spec — \`waitUntil(promise)\` extends the worker invocation lifetime until the promise settles, even after the response has been returned to the client.

\`\`\`ts
// src/context.ts
export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
  props: any
  exports?: any
}
\`\`\`

In a Hono handler:

\`\`\`ts
app.post('/track', async (c) => {
  const event = await c.req.json()
  // Fire-and-forget: respond immediately, log to analytics in background.
  c.executionCtx.waitUntil(
    fetch('https://analytics.example.com/ingest', {
      method: 'POST',
      body: JSON.stringify(event),
    })
  )
  return c.json({ ok: true })
})
\`\`\`

Without \`waitUntil\`, Cloudflare can terminate the isolate the moment the response stream finishes — your background fetch gets cancelled mid-flight. Cache middleware uses it: \`c.executionCtx.waitUntil(cache.put(key, res))\` lets the response go out immediately while the cache write completes in the background.

Source confirms this is exactly the cache middleware's pattern:

\`\`\`ts
// src/middleware/cache/index.ts
if (options.wait) {
  await cache.put(key, res)
} else {
  c.executionCtx.waitUntil(cache.put(key, res))
}
\`\`\`

Non-obvious gotcha 1: \`c.executionCtx\` is *not* present on every runtime. On Node (\`@hono/node-server\`), Bun, and Deno, accessing it throws "This context has no ExecutionContext". The cache middleware's \`wait: true\` option exists specifically for runtimes without executionCtx (the docstring calls out Deno). Always either guard with try/catch or set \`wait: true\` if your code might run outside CF Workers.

Non-obvious gotcha 2: \`waitUntil\` has a hard ceiling — Cloudflare currently allows up to 30 seconds of additional CPU time after the response. Long background tasks (DB writes that take 10s) work fine; minute-long jobs do not. For those, use Queues or Durable Objects instead of waitUntil.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'cloudflare-workers', 'execution-context', 'wait-until'],
    repository: hono,
    filePath: 'src/context.ts',
    url: `${baseUrl}/src/context.ts`,
  },
  {
    title: 'hc<typeof app>(baseUrl): RPC client built from a Proxy with type inference from the server',
    body: `\`hc()\` returns a \`Proxy\` that translates property access into URL paths and method calls into fetch calls. The TypeScript magic is the \`<typeof app>\` generic — the client's call signatures are derived from the server's accumulated route schema.

\`\`\`ts
// src/client/client.ts
export const hc = <T extends Hono<any, any, any>, Prefix extends string = string>(
  baseUrl: Prefix,
  options?: ClientRequestOptions
) =>
  createProxy(function proxyCallback(opts) {
    // opts.path = ['users', ':id', '$get']  (built up from prop accesses)
    // opts.args = [{ param: { id: '1' } }, requestInit]
    let method = ''
    if (/^\\$/.test(lastParts[0] as string)) {
      const last = parts.pop()
      method = last!.replace(/^\\$/, '')  // strip leading $
    }
    const path = parts.join('/')
    const url = mergePath(baseUrl, path)
    // ... build ClientRequestImpl, fetch
  }, []) as UnionToIntersection<Client<T, Prefix>>
\`\`\`

Usage:

\`\`\`ts
// server
const route = app.get('/users/:id', (c) => c.json({ id: c.req.param('id') }))
export type AppType = typeof route

// client
import { hc } from 'hono/client'
const client = hc<AppType>('https://api.example.com')
const res = await client.users[':id'].$get({ param: { id: '1' } })
const data = await res.json() // type: { id: string }
\`\`\`

Each segment becomes a property access on the proxy; the trailing \`$get\` / \`$post\` / \`$put\` selects the HTTP method (the \`$\` prefix is the convention to disambiguate methods from path segments). \`$url\` and \`$ws\` are special: \`$url\` returns the URL without making a request, \`$ws\` opens a WebSocket.

Non-obvious gotcha 1: types only flow if you export the *return value* of the chained route definitions (\`typeof route\`), not \`typeof app\`. \`app.get('/x', ...)\` returns \`this\` typed as \`Hono<E, S | NewRoute, ...>\`. If you do \`const app = new Hono(); app.get(...)\` and export \`typeof app\`, the new route isn't in the type — you need \`const app = new Hono().get(...)\` chained or \`export type AppType = typeof app\` after all routes are added in declaration order.

Non-obvious gotcha 2: the proxy intentionally returns \`undefined\` for the special key \`'then'\` (\`if (typeof key !== 'string' || key === 'then') return undefined\`). This is what prevents \`await client.users\` from being treated as a thenable and silently auto-resolving to the proxy itself. If you accidentally \`await\` an intermediate path you get the proxy back, not a Promise.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'client', 'rpc', 'proxy', 'typescript'],
    repository: hono,
    filePath: 'src/client/client.ts',
    url: `${baseUrl}/src/client/client.ts`,
  },
  {
    title: 'validator(target, fn): typed input validation that auto-detects content-type',
    body: `The base \`validator\` in \`hono/validator\` is content-type aware: when target is \`'json'\` it requires \`application/json\`, for \`'form'\` it requires \`multipart/form-data\` or \`application/x-www-form-urlencoded\`, otherwise it pulls from query/header/cookie/param.

\`\`\`ts
// src/validator/validator.ts
const jsonRegex = /^application\\/([a-z-\\.]+\\+)?json(;\\s*[a-zA-Z0-9\\-]+\\=([^;]+))*$/
const multipartRegex = /^multipart\\/form-data(;\\s?boundary=[a-zA-Z0-9'"()+_,\\-./:=?]+)?$/
const urlencodedRegex = /^application\\/x-www-form-urlencoded(;\\s*[a-zA-Z0-9\\-]+\\=([^;]+))*$/

export const validator = <...>(target: U, validationFunc: VF): MiddlewareHandler<...> => {
  return async (c, next) => {
    let value = {}
    const contentType = c.req.header('Content-Type')
    switch (target) {
      case 'json':
        if (!contentType || !jsonRegex.test(contentType)) break
        try { value = await c.req.json() } catch { /* validation handles error */ }
        break
      // ... form, query, header, cookie, param
    }
    const res = await validationFunc(value, c)
    if (res instanceof Response) return res
    c.req.addValidatedData(target, res as {})
    await next()
  }
}
\`\`\`

The companion package \`@hono/zod-validator\` wraps this with Zod parsing. In handlers, validated data is accessible via \`c.req.valid(target)\` — typed by the validator's output schema:

\`\`\`ts
import { zValidator } from '@hono/zod-validator'
const schema = z.object({ email: z.string().email() })
app.post('/signup', zValidator('json', schema), (c) => {
  const { email } = c.req.valid('json') // typed as { email: string }
  return c.json({ ok: true })
})
\`\`\`

Non-obvious gotcha 1: if the request's content-type doesn't match the target, the validator gets an empty object \`{}\` rather than throwing — your validation function must handle missing fields. With Zod this surfaces as a normal validation failure, but with a custom function you might silently accept missing data.

Non-obvious gotcha 2: returning a \`Response\` from your validation function (e.g., a 422) short-circuits the middleware chain — the handler never runs. Returning anything else is treated as the validated value and stored. This dual return convention is convenient but means a typo where you return \`new Response(...)\` accidentally also short-circuits, even on success — always return the parsed object on the happy path, never wrap it in a Response.

Non-obvious gotcha 3: the JSON regex accepts \`application/vnd.api+json\` (the \`+json\` variant) but rejects \`text/json\` — if your client sends the latter, validation gets \`{}\`. Most modern clients use \`application/json\`, but ancient HTTP libraries sometimes don't.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'validator', 'zod', 'validation', 'typescript'],
    repository: hono,
    filePath: 'src/validator/validator.ts',
    url: `${baseUrl}/src/validator/validator.ts`,
  },
  {
    title: 'jwt({ secret, alg }): verifies token from header or cookie, sets c.var.jwtPayload',
    body: `The JWT middleware enforces both options up front (no defaults for security-critical config), then attempts to extract the token from \`Authorization\` (or a custom header) and falls back to a cookie if configured.

\`\`\`ts
// src/middleware/jwt/jwt.ts
export const jwt = (options: {
  secret: SignatureKey
  cookie?: string | { key: string; secret?: ...; prefixOptions?: ... }
  alg: SignatureAlgorithm
  headerName?: string
  verification?: VerifyOptions
}): MiddlewareHandler => {
  if (!options || !options.secret) throw new Error('JWT auth middleware requires options for "secret"')
  if (!options.alg)                throw new Error('JWT auth middleware requires options for "alg"')

  return async function jwt(ctx, next) {
    const credentials = ctx.req.raw.headers.get(options.headerName || 'Authorization')
    let token
    if (credentials) {
      const parts = credentials.split(/\\s+/)  // 'Bearer eyJ...'
      if (parts.length !== 2) throw new HTTPException(401, { ... })
      token = parts[1]
    } else if (options.cookie) {
      // getCookie / getSignedCookie path
    }
    if (!token) throw new HTTPException(401, { ... })

    const payload = await Jwt.verify(token, options.secret, { alg: options.alg, ...verifyOpts })
    if (!payload) throw new HTTPException(401, { ... })

    ctx.set('jwtPayload', payload)
    await next()
  }
}
\`\`\`

The 401 responses include an OAuth-style \`WWW-Authenticate\` header with structured error fields (\`error="invalid_request"\`, \`error="invalid_token"\`) so clients can distinguish between "no token sent" and "token invalid".

The middleware augments \`ContextVariableMap\` (in \`src/middleware/jwt/index.ts\`) so \`c.get('jwtPayload')\` and \`c.var.jwtPayload\` are typed automatically across your app — no manual generic plumbing needed.

Non-obvious gotcha 1: \`alg\` is required and there's no fallback. This is intentional — accepting "any algorithm in the JWT header" is the classic alg-confusion vulnerability (none-alg attack, HS256-with-RSA-public-key-as-secret). By requiring you to specify the algorithm, Hono prevents you from accidentally accepting a token signed with a weaker or attacker-controlled algorithm.

Non-obvious gotcha 2: the constructor checks \`crypto.subtle.importKey\` exists and throws if not. WebCrypto is present in Workers, Bun, Deno, modern Node. If you're on Node < 19 without polyfills, the middleware refuses to load. There is no synchronous fallback — Hono is web-standards-only by design.

Non-obvious gotcha 3: cookie-based JWT is supported but if the cookie has a \`secret\` set, it's signed (HMAC), not encrypted. Anyone who reads the cookie can read the JWT payload. For real session secrets, use a separate encrypted session store and put only an opaque ID in the cookie.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'jwt', 'auth', 'middleware'],
    repository: hono,
    filePath: 'src/middleware/jwt/jwt.ts',
    url: `${baseUrl}/src/middleware/jwt/jwt.ts`,
  },
  {
    title: 'basicAuth uses timingSafeEqual for both username and password',
    body: `Basic Auth in Hono compares both the username AND password using \`timingSafeEqual\` — preventing timing attacks even on the username (which many implementations forget).

\`\`\`ts
// src/middleware/basic-auth/index.ts
return async function basicAuth(ctx, next) {
  const requestUser = auth(ctx.req.raw)  // parses Authorization: Basic <base64>
  if (requestUser) {
    if (verifyUserInOptions) {
      if (await options.verifyUser(requestUser.username, requestUser.password, ctx)) {
        if (options.onAuthSuccess) await options.onAuthSuccess(ctx, requestUser.username)
        await next()
        return
      }
    } else {
      for (const user of users) {
        const [usernameEqual, passwordEqual] = await Promise.all([
          timingSafeEqual(user.username, requestUser.username, options.hashFunction),
          timingSafeEqual(user.password, requestUser.password, options.hashFunction),
        ])
        if (usernameEqual && passwordEqual) {
          if (options.onAuthSuccess) await options.onAuthSuccess(ctx, requestUser.username)
          await next()
          return
        }
      }
    }
  }
  // 401 + WWW-Authenticate: Basic realm="Secure Area"
  throw new HTTPException(401, { res })
}
\`\`\`

The middleware accepts either the \`{ username, password }\` shape (single user) or \`{ verifyUser(u, p, c) }\` (custom lookup, e.g., DB query). For the static-credentials form, it loops through registered users and runs both comparisons with \`Promise.all\` so they execute concurrently.

Non-obvious gotcha 1: when using \`verifyUser\`, *you* are responsible for timing-safe comparison inside your callback. Hono can't help — your callback receives the raw plaintext credentials. A naive \`if (user.password === input)\` reintroduces the timing attack. Use \`timingSafeEqual\` from \`hono/utils/buffer\` or your platform's crypto API.

Non-obvious gotcha 2: the realm in the \`WWW-Authenticate\` header has its quotes escaped (\`replace(/"/g, '\\\\"')\`) but not its commas or backslashes — if you put weird characters in the realm name, browsers may render the auth dialog oddly. Stick to plain ASCII.

Non-obvious gotcha 3: \`onAuthSuccess\` runs *before* \`next()\`. If it throws, the request 500s — but the user technically authenticated successfully. Wrap onAuthSuccess work that might fail (logging, audit insert) in a try/catch and decide whether the failure is fatal to the request or just a side-effect to swallow.

Non-obvious gotcha 4: Basic Auth credentials are sent on every request as a base64-encoded header. They're plaintext over the wire to anyone without TLS. Always pair with HTTPS; never use Basic Auth over plain HTTP.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'basic-auth', 'auth', 'middleware', 'security'],
    repository: hono,
    filePath: 'src/middleware/basic-auth/index.ts',
    url: `${baseUrl}/src/middleware/basic-auth/index.ts`,
  },
  {
    title: 'cors() reflects request origin when credentials:true and origin is "*"',
    body: `CORS in Hono handles the spec edge case where \`Access-Control-Allow-Origin: *\` is forbidden when credentials are enabled — browsers reject responses that combine the two.

\`\`\`ts
// src/middleware/cors/index.ts
const findAllowOrigin = ((optsOrigin) => {
  if (typeof optsOrigin === 'string') {
    if (optsOrigin === '*') {
      // When credentials is true, the spec forbids Access-Control-Allow-Origin: *.
      // Reflect the request origin instead so browsers accept the response.
      if (opts.credentials) {
        return (origin: string) => origin || null
      }
      return () => optsOrigin
    } else {
      return (origin: string) => (optsOrigin === origin ? origin : null)
    }
  } else if (typeof optsOrigin === 'function') {
    return optsOrigin
  } else {
    return (origin: string) => (optsOrigin.includes(origin) ? origin : null)
  }
})(opts.origin)
\`\`\`

So \`cors({ origin: '*', credentials: true })\` doesn't actually emit \`*\` — it reflects whatever Origin the client sent. This is functionally equivalent to "allow all origins" for credentialed requests, except it satisfies the browser's strict check.

Preflight handling (OPTIONS) sets \`Access-Control-Allow-Methods\`, \`Allow-Headers\`, \`Max-Age\`, then short-circuits with a 204:

\`\`\`ts
if (c.req.method === 'OPTIONS') {
  // ... set headers ...
  c.res.headers.delete('Content-Length')
  c.res.headers.delete('Content-Type')
  return new Response(null, { headers: c.res.headers, status: 204, statusText: 'No Content' })
}
await next()
\`\`\`

For non-preflight requests, \`Vary: Origin\` is appended after \`next()\` if origin isn't \`*\` or credentials is on — required by the spec so caches don't serve a different origin's response.

Non-obvious gotcha 1: reflecting any origin with credentials is a security choice, not a security feature. \`cors({ origin: '*', credentials: true })\` is effectively "allow any site to make authenticated requests to me" — usually a misconfiguration. Specify allowed origins explicitly: \`origin: ['https://app.example.com', 'http://localhost:3000']\` or use the function form for dynamic checks.

Non-obvious gotcha 2: \`allowHeaders: []\` (default) reflects the browser's \`Access-Control-Request-Headers\` back as \`Access-Control-Allow-Headers\`. This is permissive — fine for trusted internal APIs, dangerous for public APIs where you should explicitly enumerate allowed headers.

Non-obvious gotcha 3: the OPTIONS short-circuit deletes Content-Type but doesn't clear other custom headers your earlier middleware might have set. If you set headers in a global middleware that runs before \`cors()\`, they leak into the preflight response. Run \`cors()\` first.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'cors', 'middleware', 'security'],
    repository: hono,
    filePath: 'src/middleware/cors/index.ts',
    url: `${baseUrl}/src/middleware/cors/index.ts`,
  },
  {
    title: 'logger(): incoming/outgoing log lines with colorized status codes',
    body: `The Hono logger is intentionally minimal — incoming line, await next(), outgoing line with status + duration.

\`\`\`ts
// src/middleware/logger/index.ts
enum LogPrefix {
  Outgoing = '-->',
  Incoming = '<--',
  Error = 'xxx',
}

export const logger = (fn: PrintFunc = console.log): MiddlewareHandler => {
  return async function logger(c, next) {
    const { method, url } = c.req
    const path = url.slice(url.indexOf('/', 8))  // skip 'http(s)://host'
    await log(fn, LogPrefix.Incoming, method, path)
    const start = Date.now()
    await next()
    await log(fn, LogPrefix.Outgoing, method, path, c.res.status, time(start))
  }
}

const colorStatus = async (status: number) => {
  const colorEnabled = await getColorEnabledAsync()
  if (colorEnabled) {
    switch ((status / 100) | 0) {
      case 5: return \`\\x1b[31m\${status}\\x1b[0m\`  // red
      case 4: return \`\\x1b[33m\${status}\\x1b[0m\`  // yellow
      case 3: return \`\\x1b[36m\${status}\\x1b[0m\`  // cyan
      case 2: return \`\\x1b[32m\${status}\\x1b[0m\`  // green
    }
  }
  return \`\${status}\`
}
\`\`\`

Output looks like \`<-- GET /users\` then \`--> GET /users 200 4ms\`. Colors are auto-detected via \`getColorEnabledAsync\` (checks NO_COLOR, FORCE_COLOR, TTY). Times under 1s render as \`123ms\`, over 1s as rounded seconds.

The path-extraction trick \`url.slice(url.indexOf('/', 8))\` finds the first \`/\` after position 8 (past \`https://\` or \`http://\`) — cheaper than constructing a URL object just to read the pathname.

Non-obvious gotcha 1: the logger has no concept of request ID, user ID, or any structured fields. For production observability you typically want JSON logs with correlation IDs — write your own middleware (or use \`@hono/request-id\` plus a custom logger). The built-in is dev-friendly only.

Non-obvious gotcha 2: the duration includes time spent in *all subsequent middleware*, including downstream logger middleware, response serialization, and any middleware running after yours via await next(). It's wall-clock for "everything I waited on", not strictly handler-only time. Move the logger as close to the route handlers as possible (after auth/CORS) for accurate handler-time numbers.

Non-obvious gotcha 3: \`time()\` formats with thousand-separators using a comma delimiter and period separator (\`humanize\`). On numbers that small it's invisible; if you ever log very large numbers via this helper, the formatting may surprise you — \`1234ms\` becomes \`1,234ms\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'logger', 'middleware', 'observability'],
    repository: hono,
    filePath: 'src/middleware/logger/index.ts',
    url: `${baseUrl}/src/middleware/logger/index.ts`,
  },
  {
    title: 'etag(): SHA-1 of response body, compared with If-None-Match for 304',
    body: `The etag middleware runs *after* \`next()\`, hashes the response body with \`crypto.subtle.digest('SHA-1')\`, and either sets \`ETag\` or returns 304 if the request's \`If-None-Match\` matches.

\`\`\`ts
// src/middleware/etag/index.ts
export const RETAINED_304_HEADERS = ['cache-control','content-location','date','etag','expires','vary']

return async function etag(c, next) {
  const ifNoneMatch = c.req.header('If-None-Match') ?? null
  await next()
  const res = c.res as Response
  let etag = res.headers.get('ETag')
  if (!etag) {
    if (!generator) return
    const hash = await generateDigest(res.clone().body as ReadableStream<...>, generator)
    if (hash === null) return
    etag = weak ? \`W/"\${hash}"\` : \`"\${hash}"\`
  }
  if (etagMatches(etag, ifNoneMatch)) {
    c.res = new Response(null, {
      status: 304,
      statusText: 'Not Modified',
      headers: { ETag: etag },
    })
    c.res.headers.forEach((_, key) => {
      if (retainedHeaders.indexOf(key.toLowerCase()) === -1) c.res.headers.delete(key)
    })
  } else {
    c.res.headers.set('ETag', etag)
  }
}
\`\`\`

The 304 response strips all headers except those in \`RETAINED_304_HEADERS\` (the spec-mandated set: cache-control, content-location, date, etag, expires, vary). This prevents accidentally leaking auth-bearing headers (Set-Cookie, Authorization) from the original response into the cached 304.

\`etagMatches\` is weak-aware — it strips the \`W/\` prefix from both candidate and stored tags before comparison, so a strong ETag matches a request asking for the weak version of the same content.

Non-obvious gotcha 1: \`res.clone()\` is required because reading the body to hash it consumes the stream. Cloning means Hono buffers the entire response in memory to compute the digest. For huge responses (file downloads), this defeats streaming entirely. Either skip etag for those routes (\`app.use('/api/*', etag())\` then \`app.get('/download/:id', ...)\` outside the prefix) or compute your own ETag from a stable identifier (file mtime, version) and set it in the response so etag middleware skips its own hashing.

Non-obvious gotcha 2: SHA-1 uses \`crypto.subtle\` — present in CF Workers, Bun, Deno, modern Node. On older Node without subtle crypto, the middleware silently does nothing (\`if (!generator) return\`). Verify it's actually working in your runtime.

Non-obvious gotcha 3: if you set your own \`ETag\` header in the handler, etag middleware uses your value directly and skips the body hash — much faster, recommended for content with a stable version (DB row updated_at, content hash, etc.).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'etag', 'caching', 'middleware'],
    repository: hono,
    filePath: 'src/middleware/etag/index.ts',
    url: `${baseUrl}/src/middleware/etag/index.ts`,
  },
  {
    title: 'compress(): gzip/deflate via CompressionStream, weakens ETag automatically',
    body: `The compress middleware uses the standard \`CompressionStream\` Web API to gzip or deflate the response body — works in any runtime that ships the WHATWG Compression Streams API (CF Workers, Deno, Bun, Node 18+).

\`\`\`ts
// src/middleware/compress/index.ts
return async function compress(ctx, next) {
  await next()
  const contentLength = ctx.res.headers.get('Content-Length')
  if (
    ctx.res.headers.has('Content-Encoding') ||      // already encoded
    ctx.res.headers.has('Transfer-Encoding') ||     // already chunked
    ctx.req.method === 'HEAD' ||
    (contentLength && Number(contentLength) < threshold) ||
    !shouldCompress(ctx.res) ||                     // not a compressible content type
    !shouldTransform(ctx.res)                       // Cache-Control: no-transform
  ) return

  const accepted = ctx.req.header('Accept-Encoding')
  const encoding = options?.encoding ?? ENCODING_TYPES.find((e) => accepted?.includes(e))
  if (!encoding || !ctx.res.body) return

  const stream = new CompressionStream(encoding)
  ctx.res = new Response(ctx.res.body.pipeThrough(stream), ctx.res)
  ctx.res.headers.delete('Content-Length')
  ctx.res.headers.set('Content-Encoding', encoding)

  // Convert strong ETag to weak ETag since compressed content is not byte-identical
  const etag = ctx.res.headers.get('ETag')
  if (etag && !etag.startsWith('W/')) {
    ctx.res.headers.set('ETag', \`W/\${etag}\`)
  }
}
\`\`\`

Default threshold is 1024 bytes — small responses skip compression because the gzip header overhead dwarfs any savings. \`shouldCompress\` checks the Content-Type against \`COMPRESSIBLE_CONTENT_TYPE_REGEX\` (text/*, application/json, application/xml, etc. — never images or video).

The \`Cache-Control: no-transform\` check is RFC 7234 compliance — if the origin says "do not transform this response", caches and proxies must not modify it, including compression.

Non-obvious gotcha 1: the strong-to-weak ETag conversion is critical for correctness. Compressed gzip output is not byte-stable across versions of zlib, compression levels, or even runs (timestamp in gzip header). Two runs that produce semantically identical content produce different bytes — so the strong ETag from the uncompressed body is no longer valid for the compressed body. Demoting it to weak preserves the etag's purpose (semantic equivalence) without lying about byte-identity.

Non-obvious gotcha 2: \`Content-Length\` is deleted because the compressed length is unknown until the stream finishes. Clients that need a length will see chunked transfer-encoding instead. Some HTTP/1.0 clients can't handle that — not a real issue in 2025, but worth knowing if you support legacy.

Non-obvious gotcha 3: the middleware checks \`Content-Length\` *before* compression but doesn't have access to the actual byte size for streamed responses. If your handler returns a stream, the Content-Length check passes (no header to compare against) and compression always runs — even for tiny responses. Set the threshold check yourself or set Content-Length explicitly.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'compress', 'gzip', 'middleware', 'compression-stream'],
    repository: hono,
    filePath: 'src/middleware/compress/index.ts',
    url: `${baseUrl}/src/middleware/compress/index.ts`,
  },
  {
    title: 'cache() backed by globalThis.caches (CF Workers / Deno), waitUntil for write',
    body: `Hono's cache middleware is a thin wrapper over the WHATWG Cache API (\`globalThis.caches\`) — present on Cloudflare Workers and Deno, absent on Node and Bun.

\`\`\`ts
// src/middleware/cache/index.ts
export const cache = (options: {
  cacheName: string | ((c: Context) => Promise<string> | string)
  wait?: boolean
  cacheControl?: string
  vary?: string | string[]
  keyGenerator?: (c: Context) => Promise<string> | string
  cacheableStatusCodes?: StatusCode[]
  onCacheNotAvailable?: (() => void) | false
}): MiddlewareHandler => {
  if (!globalThis.caches) {
    if (options.onCacheNotAvailable === false) { /* suppress */ }
    else if (options.onCacheNotAvailable) options.onCacheNotAvailable()
    else console.log('Cache Middleware is not enabled because caches is not defined.')
    return async (_c, next) => await next()
  }
  // ...
  return async function cache(c, next) {
    let key = c.req.url
    if (options.keyGenerator) key = await options.keyGenerator(c)
    const cacheName = typeof options.cacheName === 'function' ? await options.cacheName(c) : options.cacheName
    const cache = await caches.open(cacheName)
    const response = await cache.match(key)
    if (response) return new Response(response.body, response)
    await next()
    if (!cacheableStatusCodes.has(c.res.status)) return
    addHeader(c)
    if (shouldSkipCache(c.res)) return
    const res = c.res.clone()
    if (options.wait) await cache.put(key, res)
    else c.executionCtx.waitUntil(cache.put(key, res))
  }
}
\`\`\`

\`shouldSkipCache\` rejects responses with \`Vary: *\`, \`Cache-Control: private/no-store/no-cache\`, or any \`Set-Cookie\` — exactly the responses you'd never want shared across users.

Default cacheable status codes: \`[200]\`. So 301/304 redirects and 404s are NOT cached unless you opt in with \`cacheableStatusCodes: [200, 301, 404]\`.

Non-obvious gotcha 1: on runtimes without \`globalThis.caches\` (Node, Bun by default), the middleware logs once and then becomes a no-op pass-through. There's no fallback to in-memory caching — if you want that, install \`hono-cache\` or write your own with an LRU map.

Non-obvious gotcha 2: \`wait: true\` blocks the response on the cache write. The default (\`wait: false\`) relies on \`c.executionCtx.waitUntil\` — but that only exists on Cloudflare Workers. On Deno (which has \`caches\` but not \`executionCtx\`), the default crashes. The docstring explicitly notes "Required to be true for the Deno environment."

Non-obvious gotcha 3: the cache key defaults to \`c.req.url\` — including query strings. If you want path-only keys, supply a \`keyGenerator\` that returns \`new URL(c.req.url).pathname\`. Otherwise \`?utm_source=email\` makes every campaign URL its own cache entry.

Non-obvious gotcha 4: only \`GET\` requests are cached implicitly because the Cache API only stores GET responses. POSTs hit the cache check (which returns nothing), run the handler, then attempt to put — and \`cache.put()\` throws on non-GET requests. Either gate cache to GET routes or filter inside \`keyGenerator\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'cache', 'middleware', 'cloudflare-workers', 'deno'],
    repository: hono,
    filePath: 'src/middleware/cache/index.ts',
    url: `${baseUrl}/src/middleware/cache/index.ts`,
  },
  {
    title: 'bodyLimit({ maxSize }): trusts Content-Length, otherwise wraps body in a counting stream',
    body: `Body size enforcement in Hono follows RFC 7230 — Content-Length is trusted only when Transfer-Encoding is absent.

\`\`\`ts
// src/middleware/body-limit/index.ts
return async function bodyLimit(c, next) {
  if (!c.req.raw.body) return next()  // GET/HEAD

  const hasTransferEncoding = c.req.raw.headers.has('transfer-encoding')
  const hasContentLength = c.req.raw.headers.has('content-length')

  if (hasContentLength && !hasTransferEncoding) {
    const contentLength = parseInt(c.req.raw.headers.get('content-length') || '0', 10)
    return contentLength > maxSize ? onError(c) : next()
  }

  // Transfer-Encoding present (chunked) or no length headers
  let size = 0
  const rawReader = c.req.raw.body.getReader()
  const reader = new ReadableStream({
    async start(controller) {
      try {
        for (;;) {
          const { done, value } = await rawReader.read()
          if (done) break
          size += value.length
          if (size > maxSize) {
            controller.error(new BodyLimitError(ERROR_MESSAGE))
            break
          }
          controller.enqueue(value)
        }
      } finally { controller.close() }
    },
  })

  const requestInit: RequestInit & { duplex: 'half' } = { body: reader, duplex: 'half' }
  c.req.raw = new Request(c.req.raw, requestInit as RequestInit)
  await next()
  if (c.error instanceof BodyLimitError) c.res = await onError(c)
}
\`\`\`

For Content-Length-only requests, Hono short-circuits with a 413 before reading any body bytes — saves you from accepting and parsing a malicious 10GB upload. For chunked requests (no advance length), it wraps the body in a counting ReadableStream and errors mid-stream if the running total exceeds maxSize.

The replacement \`new Request(c.req.raw, { body: reader, duplex: 'half' })\` requires the \`duplex: 'half'\` flag — required by the Fetch spec for Request bodies that are streams. Without it, modern runtimes throw "RequestInit: duplex option is required".

Default error: throws \`HTTPException(413)\` with \`Payload Too Large\` body. You can customize via \`onError\` to return a JSON body, log, etc.

Non-obvious gotcha 1: an attacker can send Content-Length: 1 and then chunked-encode 10GB. The RFC 7230 comment in the source notes "If both Transfer-Encoding and Content-Length are present, Transfer-Encoding takes precedence and Content-Length should be ignored... This might indicate request smuggling attempt." Hono follows the spec, but you should also reject requests with both headers at the edge (CDN/load balancer) for defense in depth.

Non-obvious gotcha 2: the size error happens *during* body consumption inside your handler. If your handler does \`await c.req.json()\` and the body is too large, the json() call throws BodyLimitError mid-parse, the request errors out, and \`c.error\` is set. The middleware then replaces the response with the 413 in the post-next() check. So a partial JSON parse error you see in logs from this middleware really means "body was too big."

Non-obvious gotcha 3: \`maxSize\` is in bytes, not KB. \`maxSize: 50 * 1024\` = 50KB. Comments in the source confirm.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'body-limit', 'middleware', 'security'],
    repository: hono,
    filePath: 'src/middleware/body-limit/index.ts',
    url: `${baseUrl}/src/middleware/body-limit/index.ts`,
  },
  {
    title: 'app.route(path, subApp) flattens routes with cross-app error handler isolation',
    body: `\`route()\` is how you compose multiple Hono instances together. The implementation walks the sub-app's routes and re-registers each one under the parent with a base path.

\`\`\`ts
// src/hono-base.ts
route(path, app) {
  const subApp = this.basePath(path)
  app.routes.map((r) => {
    let handler
    if (app.errorHandler === errorHandler) {
      // sub-app uses default error handler — pass handler through directly
      handler = r.handler
    } else {
      // sub-app has custom errorHandler — wrap so its error handler runs in scope
      handler = async (c: Context, next: Next) =>
        (await compose([], app.errorHandler)(c, () => r.handler(c, next))).res
      ;(handler as any)[COMPOSED_HANDLER] = r.handler
    }
    subApp.#addRoute(r.method, r.path, handler)
  })
  return this
}
\`\`\`

This is more sophisticated than a naive "merge two route tables." If the sub-app has its own \`onError\` handler, errors thrown in its routes need to be caught by *that* handler, not the parent's. So Hono wraps each sub-app handler in a tiny compose chain that routes errors through the sub-app's onError before propagating.

Usage:

\`\`\`ts
const api = new Hono()
api.onError((err, c) => c.json({ error: err.message }, 500))  // API errors → JSON
api.get('/users', (c) => c.json([]))

const web = new Hono()
web.onError((err, c) => c.html(<ErrorPage err={err} />, 500))  // Web errors → HTML

const app = new Hono()
app.route('/api', api)  // /api/users → JSON errors
app.route('/', web)     // / → HTML errors
\`\`\`

The \`COMPOSED_HANDLER\` symbol stashes the original handler reference — used by RPC type inference so the client can still see through the wrapper to the underlying typed schema.

Non-obvious gotcha 1: the routes are *copied* at the time of \`app.route()\` call, not aliased. If you add more routes to \`api\` after \`app.route('/api', api)\`, those new routes won't appear under \`/api\` in the parent app. Define all sub-app routes before mounting.

Non-obvious gotcha 2: the parent's \`notFound\` handler is the only one that runs — sub-apps' notFound handlers are ignored when mounted via \`route()\`. If you want path-scoped 404s, register a wildcard catch-all at the end of each sub-app: \`api.all('*', (c) => c.json({ error: 'Not found' }, 404))\`.

Non-obvious gotcha 3: middleware on the sub-app is included in the route copy — \`api.use(authMw); api.get('/x', ...)\` then \`app.route('/api', api)\` correctly applies authMw to /api/x. But middleware on the *parent* registered before \`app.route\` only runs if it matches the merged path; convention is to register parent middleware on prefixes (\`app.use('/api/*', ...)\`).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'route', 'sub-app', 'composition', 'error-handling'],
    repository: hono,
    filePath: 'src/hono-base.ts',
    url: `${baseUrl}/src/hono-base.ts`,
  },
  {
    title: 'app.mount(path, otherFrameworkHandler): host Express/Itty/etc inside Hono',
    body: `\`mount\` is for embedding a non-Hono web framework — anything with a fetch-style \`(request, ...args) => Response\` signature — under a path prefix in your Hono app.

\`\`\`ts
// src/hono-base.ts
mount(path, applicationHandler, options?) {
  let replaceRequest: MountReplaceRequest | undefined
  let optionHandler: MountOptionHandler | undefined
  // ... parse options ...

  const getOptions: (c: Context) => unknown[] = optionHandler
    ? (c) => { const o = optionHandler!(c); return Array.isArray(o) ? o : [o] }
    : (c) => {
        let executionContext: ExecutionContext | undefined = undefined
        try { executionContext = c.executionCtx } catch {}
        return [c.env, executionContext]
      }

  replaceRequest ||= (() => {
    const mergedPath = mergePath(this._basePath, path)
    const pathPrefixLength = mergedPath === '/' ? 0 : mergedPath.length
    return (request) => {
      const url = new URL(request.url)
      url.pathname = url.pathname.slice(pathPrefixLength) || '/'
      return new Request(url, request)
    }
  })()

  const handler: MiddlewareHandler = async (c, next) => {
    const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c))
    if (res) return res
    await next()
  }
  this.#addRoute(METHOD_NAME_ALL, mergePath(path, '*'), handler)
  return this
}
\`\`\`

By default, the request URL is rewritten to strip the mount prefix before calling the foreign handler — so an itty-router mounted at \`/itty\` sees \`/hello\` not \`/itty/hello\`. Override with \`replaceRequest: false\` (pass through unmodified) or a custom function.

The default \`getOptions\` passes \`[c.env, c.executionCtx]\` — matches the Cloudflare Workers signature. Frameworks with different signatures need a custom \`optionHandler\`.

Use case: gradual migration from another framework. Mount your existing Express/Hapi/itty app inside a new Hono app, route new endpoints natively, slowly migrate the old ones.

Non-obvious gotcha 1: if the mounted handler returns \`undefined\` (or \`null\`), Hono falls through to \`next()\` — meaning the next route in the parent app gets a chance to handle the request. This is intentional for "try this handler, fall through if not matched" patterns. Foreign frameworks that always return a Response (even 404) won't trigger this.

Non-obvious gotcha 2: mount uses METHOD_NAME_ALL on \`{path}/*\`, so it matches every method and every sub-path under the mount point. There's no way to mount only certain methods — your foreign handler is responsible for method-checking.

Non-obvious gotcha 3: the URL rewrite slices by string length, not by parsing path segments. If your mount path is \`/api\` and the request comes in as \`/api2/foo\`, you get \`/2/foo\` after the slice — broken. Mount paths should always end before a path boundary in practice (Hono's wildcard match \`/api/*\` won't match \`/api2/foo\` so this is mostly theoretical, but worth knowing).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'mount', 'composition', 'migration'],
    repository: hono,
    filePath: 'src/hono-base.ts',
    url: `${baseUrl}/src/hono-base.ts`,
  },
  {
    title: 'streamSSE(c, cb): Server-Sent Events with Bun-version workaround for AbortSignal',
    body: `SSE in Hono uses a TransformStream wrapped in an \`SSEStreamingApi\` that knows how to format \`data:\`, \`event:\`, \`id:\`, \`retry:\` lines per the SSE spec.

\`\`\`ts
// src/helper/streaming/sse.ts
async writeSSE(message: SSEMessage) {
  const data = await resolveCallback(message.data, HtmlEscapedCallbackPhase.Stringify, false, {})
  const dataLines = (data as string)
    .split(/\\r\\n|\\r|\\n/)
    .map((line) => \`data: \${line}\`)
    .join('\\n')

  for (const key of ['event', 'id', 'retry'] as (keyof SSEMessage)[]) {
    if (message[key] && /[\\r\\n]/.test(message[key] as string)) {
      throw new Error(\`\${key} must not contain "\\\\r" or "\\\\n"\`)
    }
  }

  const sseData = [
    message.event && \`event: \${message.event}\`,
    dataLines,
    message.id && \`id: \${message.id}\`,
    message.retry && \`retry: \${message.retry}\`,
  ].filter(Boolean).join('\\n') + '\\n\\n'
  await this.write(sseData)
}

export const streamSSE = (c: Context, cb, onError?): Response => {
  const { readable, writable } = new TransformStream()
  const stream = new SSEStreamingApi(writable, readable)

  if (isOldBunVersion()) {
    c.req.raw.signal.addEventListener('abort', () => {
      if (!stream.closed) stream.abort()
    })
  }
  contextStash.set(stream.responseReadable, c)
  c.header('Transfer-Encoding', 'chunked')
  c.header('Content-Type', 'text/event-stream')
  c.header('Cache-Control', 'no-cache')
  c.header('Connection', 'keep-alive')
  run(stream, cb, onError)
  return c.newResponse(stream.responseReadable)
}
\`\`\`

Each event becomes a multi-line block separated by \`\\n\\n\`. Multi-line data is split and each line gets its own \`data:\` prefix (per spec). The validator on event/id/retry rejects newlines because they'd corrupt the framing.

The \`isOldBunVersion()\` check is a real workaround: Bun before 1.1.27 didn't call \`cancel()\` on the response's ReadableStream when the client disconnected, so Hono manually wires \`req.signal.abort\` → \`stream.abort\` on those versions to detect client disconnect. Modern Bun handles this correctly.

The \`contextStash\` WeakMap holds a reference to the Context until the stream is GC'd — comment says "in bun, c is destroyed when the request is returned, so hold it until the end of streaming." Without this, accessing \`c.env\` from inside the streaming callback after returning crashes on Bun.

Non-obvious gotcha 1: SSE responses use \`Transfer-Encoding: chunked\`. They never compress (compress middleware skips them via the same header check). Don't try to gzip an SSE response — it breaks browser EventSource parsing.

Non-obvious gotcha 2: \`run()\` always calls \`stream.close()\` in finally. If your callback throws and \`onError\` is provided, an extra \`event: error\\ndata: <message>\\n\\n\` frame is sent before close — useful for client-side error handling, but be aware it's an SSE-spec event and clients need to subscribe to \`'error'\` events to see it (it's NOT the EventSource onerror handler, which fires on transport errors).

Non-obvious gotcha 3: the SSE keepalive comment isn't here — Hono itself doesn't send periodic keepalive frames. If your proxy (nginx, ALB) closes idle connections after 60s, your SSE clients reconnect every minute. Send a comment line (\`: keepalive\\n\\n\`) every 30s in your callback to keep the connection alive.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'sse', 'streaming', 'server-sent-events'],
    repository: hono,
    filePath: 'src/helper/streaming/sse.ts',
    url: `${baseUrl}/src/helper/streaming/sse.ts`,
  },
  {
    title: 'HTTPException: throw to short-circuit with a structured response',
    body: `\`HTTPException\` is the canonical way to abort a request with a specific status code. The default error handler unwraps it via \`getResponse()\`.

\`\`\`ts
// src/http-exception.ts
export class HTTPException extends Error {
  readonly res?: Response
  readonly status: ContentfulStatusCode

  constructor(status: ContentfulStatusCode = 500, options?: HTTPExceptionOptions) {
    super(options?.message, { cause: options?.cause })
    this.res = options?.res
    this.status = status
  }

  getResponse(): Response {
    if (this.res) {
      const newResponse = new Response(this.res.body, {
        status: this.status,
        headers: this.res.headers,
      })
      return newResponse
    }
    return new Response(this.message, { status: this.status })
  }
}
\`\`\`

The default error handler in \`hono-base.ts\` checks for the \`getResponse\` method:

\`\`\`ts
const errorHandler: ErrorHandler = (err, c) => {
  if ('getResponse' in err) {
    const res = err.getResponse()
    return c.newResponse(res.body, res)
  }
  console.error(err)
  return c.text('Internal Server Error', 500)
}
\`\`\`

So thrown \`HTTPException\` instances get their custom response back; any other Error gets a generic 500 (and logs to console). Use it like:

\`\`\`ts
import { HTTPException } from 'hono/http-exception'

app.get('/users/:id', async (c) => {
  const user = await db.user.findUnique({ where: { id: c.req.param('id') } })
  if (!user) {
    throw new HTTPException(404, {
      message: 'User not found',
      res: new Response(JSON.stringify({ error: 'not_found' }), {
        headers: { 'content-type': 'application/json' },
      }),
    })
  }
  return c.json(user)
})
\`\`\`

The \`message\` is what gets thrown (and logged); the optional \`res\` is the actual HTTP response shape. JWT, basic-auth, and body-limit middleware all throw HTTPException internally.

Non-obvious gotcha 1: \`getResponse()\` rebuilds the Response with the exception's status — meaning if you pass a \`res\` with status 200 but throw \`new HTTPException(401, { res })\`, the final response is 401 with the body and headers from your res. Status comes from the exception, body and headers come from the res. This is intentional but surprising.

Non-obvious gotcha 2: \`HTTPException\` extends \`Error\`, so its stack trace points to where you constructed it (not where you threw it). For better stack traces, throw at the construction site rather than building it earlier and throwing later.

Non-obvious gotcha 3: if you want the error to *not* be caught by the framework (let it propagate to your platform's unhandled-error handler), throw a plain Error and don't define an onError handler — the default handler will log+500, but Sentry/runtime crash reporters will see it. With HTTPException, the error is "expected" and won't trip exception monitors.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'http-exception', 'error-handling'],
    repository: hono,
    filePath: 'src/http-exception.ts',
    url: `${baseUrl}/src/http-exception.ts`,
  },
  {
    title: 'handle(app) for AWS Lambda: API Gateway v1/v2, ALB, Lattice all in one adapter',
    body: `The Lambda adapter ships a single \`handle()\` that auto-detects which AWS event type is incoming (API Gateway REST, HTTP API, ALB, VPC Lattice) and dispatches to the matching processor.

\`\`\`ts
// src/adapter/aws-lambda/handler.ts
export const handle = (app, { isContentTypeBinary } = {}) => {
  return async (event, lambdaContext?) => {
    const processor = getProcessor(event)  // sniffs event shape

    let req, requestContext
    try {
      req = processor.createRequest(event)
      requestContext = getRequestContext(event)
    } catch (error) {
      console.error('Error processing request:', error)
      const errorResponse = error instanceof TypeError
        ? new Response('Invalid request', { status: 400 })
        : new Response('Internal Server Error', { status: 500 })
      return processor.createResult(event, errorResponse, { isContentTypeBinary })
    }

    const res = await app.fetch(req, { event, requestContext, lambdaContext })
    return processor.createResult(event, res, { isContentTypeBinary })
  }
}
\`\`\`

The \`event\`, \`requestContext\`, and \`lambdaContext\` are passed as \`env\` to your Hono app — accessible via \`c.env.event\`, \`c.env.lambdaContext\`, etc. Useful when you need the raw Lambda context (function name, request ID, time remaining).

Each processor (\`APIGatewayProxyEventProcessor\`, \`APIGatewayProxyEventV2Processor\`, \`ALBProxyEventProcessor\`, \`LatticeProxyV2EventProcessor\`) implements \`createRequest(event) → Request\` and \`createResult(event, response, opts) → APIGatewayProxyResult\` — translating between the AWS-specific event/response shapes and the standard Web Request/Response.

The \`isContentTypeBinary\` option controls whether the response body is base64-encoded. Default heuristic checks Content-Type against a list of known binary types (image/*, application/pdf, etc.). Override for custom binary types:

\`\`\`ts
import { handle, defaultIsContentTypeBinary } from 'hono/aws-lambda'
export const handler = handle(app, {
  isContentTypeBinary: (ct) => defaultIsContentTypeBinary(ct) || ct.startsWith('image/'),
})
\`\`\`

Non-obvious gotcha 1: API Gateway v1 and v2 have *different* event shapes — v1 uses \`httpMethod\` + \`path\` + \`multiValueHeaders\`, v2 uses \`requestContext.http.method\` + \`rawPath\` + flat \`headers\`. The processor sniffs based on which fields exist. If you have both v1 and v2 endpoints pointing at the same Lambda (rare but possible), both work transparently.

Non-obvious gotcha 2: ALB events look similar to API Gateway v1 but have different field semantics around multi-value headers — ALB *always* sends multiValueHeaders if the listener is configured for it. The processor handles this, but if you serve the same Lambda behind both ALB and API Gateway, test both paths.

Non-obvious gotcha 3: header values containing non-ASCII characters get \`encodeURIComponent\`-encoded by \`sanitizeHeaderValue\` because API Gateway rejects non-ASCII headers. Your client may need to decode them. If you're returning UTF-8 in custom headers (\`X-User-Name: 日本語\`), the client sees \`%E6%97%A5%E6%9C%AC%E8%AA%9E\` and must decode it.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'aws-lambda', 'adapter', 'edge-runtime'],
    repository: hono,
    filePath: 'src/adapter/aws-lambda/handler.ts',
    url: `${baseUrl}/src/adapter/aws-lambda/handler.ts`,
  },
  {
    title: 'Cloudflare Workers WebSocket via WebSocketPair + 101 Switching Protocols',
    body: `WebSocket upgrade in Cloudflare Workers uses the platform-specific \`WebSocketPair\` global — Hono wraps it in the same \`upgradeWebSocket(events)\` helper signature used by every other adapter.

\`\`\`ts
// src/adapter/cloudflare-workers/websocket.ts
export const upgradeWebSocket = defineWebSocketHelper(async (c, events) => {
  const upgradeHeader = c.req.header('Upgrade')
  if (upgradeHeader !== 'websocket') return

  const webSocketPair = new WebSocketPair()
  const client: WebSocket = webSocketPair[0]
  const server: WebSocket = webSocketPair[1]

  const wsContext = new WSContext<WebSocket>({
    close: (code, reason) => server.close(code, reason),
    get protocol() { return server.protocol },
    raw: server,
    get readyState() { return server.readyState as WSReadyState },
    url: server.url ? new URL(server.url) : null,
    send: (source) => server.send(source),
  })

  // note: cloudflare workers doesn't support 'open' event
  if (events.onClose)   server.addEventListener('close',   (evt) => events.onClose?.(evt, wsContext))
  if (events.onMessage) server.addEventListener('message', (evt) => events.onMessage?.(evt, wsContext))
  if (events.onError)   server.addEventListener('error',   (evt) => events.onError?.(evt, wsContext))

  server.accept?.()
  return new Response(null, {
    status: 101,
    webSocket: client,  // CF-specific Response init field
  } as any)
})
\`\`\`

\`WebSocketPair\` returns \`[client, server]\` — return the client to the requesting browser, keep the server side to send/receive in the worker. The 101 Switching Protocols response carries the client socket via the non-standard \`webSocket\` init field that CF runtime consumes.

Usage from your Hono app is identical across runtimes:

\`\`\`ts
app.get('/ws', upgradeWebSocket((c) => ({
  onMessage(evt, ws) { ws.send(\`echo: \${evt.data}\`) },
  onClose() { console.log('client disconnected') },
})))
\`\`\`

Non-obvious gotcha 1: Cloudflare Workers WebSockets *do not fire 'open'* — the comment in the source says so explicitly. By the time your handler returns the 101 response, the connection is already established. Don't put initialization logic in onOpen; do it inline before returning the response or in onMessage on the first frame.

Non-obvious gotcha 2: this is the "client-facing" WebSocket (called from a browser). For Workers acting as a *client* connecting to another WebSocket server, use \`new WebSocket(url)\` directly — the \`upgradeWebSocket\` helper is for accepting incoming upgrade requests only.

Non-obvious gotcha 3: each Cloudflare Worker invocation has memory and CPU limits — long-lived WebSocket connections *don't* keep the worker alive indefinitely. If you need stateful long-lived connections, use Durable Objects (or the new Hibernation API for WebSockets) instead. Plain Workers WebSockets are fine for short-lived RPC-style streaming.

Non-obvious gotcha 4: Bun, Deno, and Node have totally different WebSocket APIs (Bun uses its own \`websocket\` handler config, Node needs \`@hono/node-ws\`). The \`upgradeWebSocket\` interface is uniform but the import path is per-adapter — \`hono/cloudflare-workers\`, \`hono/bun\`, \`hono/deno\`, etc.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['hono', 'websocket', 'cloudflare-workers', 'adapter'],
    repository: hono,
    filePath: 'src/adapter/cloudflare-workers/websocket.ts',
    url: `${baseUrl}/src/adapter/cloudflare-workers/websocket.ts`,
  },
];
