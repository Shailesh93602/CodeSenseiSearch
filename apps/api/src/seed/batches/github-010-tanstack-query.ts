/**
 * Batch github-010-tanstack-query
 *
 * 30 patterns drawn directly from the TanStack Query v5 source
 * (https://github.com/TanStack/query). Every entry references a real
 * file that exists in the repo, with quoted code from that file and a
 * production-grade gotcha attached.
 */

import type { SeedItem } from '../types';

const repo = { owner: 'TanStack', name: 'query' } as const;
const url = (path: string) =>
  `https://github.com/TanStack/query/blob/main/${path}`;

export const BATCH: SeedItem[] = [
  {
    title: 'queryClient.invalidateQueries: marks stale, then refetches active observers',
    body: `\`invalidateQueries\` doesn't just nuke cached data — it does two things in sequence: dispatch \`invalidate\` on every matching query (so they're flagged stale) and then call \`refetchQueries\` on the subset that has active observers.

\`\`\`ts
invalidateQueries(filters, options) {
  return notifyManager.batch(() => {
    this.#queryCache.findAll(filters).forEach((query) => {
      query.invalidate()
    })
    if (filters?.refetchType === 'none') {
      return Promise.resolve()
    }
    return this.refetchQueries(
      { ...filters, type: filters?.refetchType ?? filters?.type ?? 'active' },
      options,
    )
  })
}
\`\`\`

The default \`refetchType\` is \`'active'\` — meaning queries with at least one mounted \`useQuery\` will refetch immediately, while inactive (cached but unmounted) queries are merely flagged. They'll fetch the next time a component subscribes. This is usually what you want; a SPA that has invalidated 200 list-detail queries shouldn't burn 200 network requests for components no one is looking at.

The other branch — \`refetchType: 'none'\` — invalidates without triggering any refetch. Useful when you want the next mount to revalidate but don't want to flood the network during a multi-step wizard.

The whole thing is wrapped in \`notifyManager.batch(...)\` so the React render that processes all the resulting state changes happens once, not once per query.

**Gotcha:** If you call \`invalidateQueries({ queryKey: ['todos'] })\` immediately after \`mutateAsync\`, await the returned promise. Otherwise your follow-up code runs while the refetch is still in flight and \`getQueryData\` still returns the pre-mutation cache. People hit this when chaining \`router.push\` after a mutation — the next page reads stale data because the \`await\` was missing on the invalidate call. Bonus subtlety: \`Promise.all(promises).then(noop)\` at the end of \`refetchQueries\` swallows individual fetch errors by default unless you pass \`{ throwOnError: true }\`, so an invalidate-after-mutation pattern silently hides API failures during the refetch.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'react-query', 'invalidate-queries', 'cache'],
    repository: repo,
    filePath: 'packages/query-core/src/queryClient.ts',
    url: url('packages/query-core/src/queryClient.ts'),
  },
  {
    title: 'queryClient.setQueryData: synchronous cache write with functional updater',
    body: `\`setQueryData\` is the imperative path for writing into the cache — used by optimistic updates, websocket pushes, and any "I already have the data, don't re-fetch" scenario.

\`\`\`ts
setQueryData(queryKey, updater, options) {
  const defaultedOptions = this.defaultQueryOptions({ queryKey })
  const query = this.#queryCache.get(defaultedOptions.queryHash)
  const prevData = query?.state.data
  const data = functionalUpdate(updater, prevData)

  if (data === undefined) {
    return undefined
  }

  return this.#queryCache
    .build(this, defaultedOptions)
    .setData(data, { ...options, manual: true })
}
\`\`\`

Three subtleties shake out of this implementation:

1. **\`undefined\` is a no-op.** If your updater returns \`undefined\`, the function bails out without touching the cache. This is intentional — it means you can write \`setQueryData(['todo', id], (prev) => prev && { ...prev, done: true })\` and the call silently does nothing if the cache entry doesn't exist yet. No crash, no accidental overwrite.

2. **It's a build, not just a get.** \`queryCache.build\` creates a new Query entry if one doesn't exist. So you can prime the cache for a key that no \`useQuery\` has ever subscribed to.

3. **\`manual: true\` flag.** The \`success\` action records this so the query knows the data didn't come from \`queryFn\`. The \`#revertState\` is preserved for cancellation — if a real fetch was in flight, the cancel-with-revert path will roll back to your manual update, not to the pre-fetch value.

**Gotcha:** \`setQueryData\` doesn't trigger a refetch and doesn't reset \`isStale\`. The new data inherits the old \`dataUpdatedAt\` semantics — actually, it sets \`dataUpdatedAt\` to \`Date.now()\` (via the \`success\` action), so the cache thinks the data was just fetched. This means \`staleTime\` resets too, which is usually desired but bites people who use \`setQueryData\` to rehydrate from a websocket and then wonder why their query never refetches. Pair it with \`invalidateQueries\` if you want subsequent observers to revalidate, or pass \`{ updatedAt: someOlderTimestamp }\` in the options to mark the data as old.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'set-query-data', 'optimistic-updates', 'cache'],
    repository: repo,
    filePath: 'packages/query-core/src/queryClient.ts',
    url: url('packages/query-core/src/queryClient.ts'),
  },
  {
    title: 'ensureQueryData: cache-first, fetch-only-if-missing primitive',
    body: `\`ensureQueryData\` is the loader-pattern building block — used by Remix loaders, Next.js Server Components, React Router \`loader\`, and anywhere you want "give me data, fetch if you have to."

\`\`\`ts
ensureQueryData(options) {
  const defaultedOptions = this.defaultQueryOptions(options)
  const query = this.#queryCache.build(this, defaultedOptions)
  const cachedData = query.state.data

  if (cachedData === undefined) {
    return this.fetchQuery(options)
  }

  if (
    options.revalidateIfStale &&
    query.isStaleByTime(resolveStaleTime(defaultedOptions.staleTime, query))
  ) {
    void this.prefetchQuery(defaultedOptions)
  }

  return Promise.resolve(cachedData)
}
\`\`\`

Compare to its siblings:

- \`fetchQuery\`: always returns a fresh fetch unless the data is non-stale.
- \`prefetchQuery\`: a fire-and-forget \`fetchQuery().then(noop).catch(noop)\` — never throws, never returns the data.
- \`ensureQueryData\`: returns immediately if cached (even if stale), with optional background revalidation.

The \`revalidateIfStale\` branch is the part that surprises people. It triggers a \`void this.prefetchQuery(...)\` — a fire-and-forget refetch — while still returning the cached value synchronously. So the user sees the stale data immediately and gets the fresh data on the next render.

Note that \`prefetchQuery\` is implemented in three lines as \`fetchQuery(options).then(noop).catch(noop)\` — it's just \`fetchQuery\` with errors swallowed and the data discarded. So calling \`prefetchQuery\` from a layout while the same key is awaited in a child component means the network request happens once (the child's \`useQuery\` reuses the in-flight promise), not twice.

**Gotcha:** \`fetchQuery\` defaults \`retry\` to \`false\` (\`if (defaultedOptions.retry === undefined) defaultedOptions.retry = false\`). \`useQuery\` defaults to 3 retries. So loaders are far more likely to throw on a network blip than a normal mounted component. Wrap loader calls in a \`try/catch\` or set \`retry: 3\` explicitly if you depend on retry behavior in SSR/loaders.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'ensure-query-data', 'loader', 'ssr'],
    repository: repo,
    filePath: 'packages/query-core/src/queryClient.ts',
    url: url('packages/query-core/src/queryClient.ts'),
  },
  {
    title: 'Mutation.execute: the canonical onMutate → mutationFn → onSuccess/onError → onSettled lifecycle',
    body: `Every \`useMutation\` lifecycle callback is dispatched in a precise order inside one async function. Read this once and you'll never wonder when \`onSettled\` runs again.

\`\`\`ts
async execute(variables: TVariables): Promise<TData> {
  // ... pending dispatch + cache-level onMutate ...
  const context = await this.options.onMutate?.(variables, mutationFnContext)
  // ... retryer.start runs mutationFn (with retries) ...
  const data = await this.#retryer.start()

  await this.#mutationCache.config.onSuccess?.(...)
  await this.options.onSuccess?.(data, variables, this.state.context!, mutationFnContext)
  await this.#mutationCache.config.onSettled?.(...)
  await this.options.onSettled?.(data, null, variables, this.state.context, mutationFnContext)
  this.#dispatch({ type: 'success', data })
  return data
} catch (error) {
  // mirrors the success path but with onError → onSettled
  await this.options.onError?.(...)
  await this.options.onSettled?.(undefined, error as TError, variables, ...)
  this.#dispatch({ type: 'error', error: error as TError })
  throw error
}
\`\`\`

Two things people misremember:

1. **\`onMutate\` is awaited before \`mutationFn\` runs.** That's why you can do \`await queryClient.cancelQueries\` and \`snapshot = queryClient.getQueryData(...)\` inside \`onMutate\` and trust the snapshot is taken before the server call begins. The context you return becomes the third argument to \`onError\` for rollback.

2. **\`onSettled\` runs AFTER \`onSuccess\`/\`onError\`** — and after both the cache-level callback and the per-mutation one. Use \`onSettled\` for "always do this" cleanup (invalidating queries) so it runs whether the mutation succeeded or failed.

**Gotcha:** Errors thrown inside \`onSuccess\`/\`onError\`/\`onSettled\` are caught with a \`void Promise.reject(e)\` — they propagate as unhandled rejections, not as the mutation's error. Don't put critical recovery logic in those callbacks expecting them to surface in \`mutate\`'s return value; the mutation's error is whatever \`mutationFn\` threw, period. Second gotcha: the per-mutation \`onSuccess\` is called with \`this.state.context!\` (non-null assertion) — but the cache-level \`onSuccess\` receives \`this.state.context\` (possibly undefined). If your global handler reads context blindly it'll crash for any mutation that didn't define an \`onMutate\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'mutation', 'on-mutate', 'on-settled', 'lifecycle'],
    repository: repo,
    filePath: 'packages/query-core/src/mutation.ts',
    url: url('packages/query-core/src/mutation.ts'),
  },
  {
    title: 'Optimistic updates: onMutate snapshot, onError rollback via context',
    body: `\`useMutation\`'s rollback pattern is built on the fact that \`onMutate\`'s return value is passed back as the third argument to \`onError\`. The Mutation class wires this up explicitly.

\`\`\`ts
const context = await this.options.onMutate?.(variables, mutationFnContext)
if (context !== this.state.context) {
  this.#dispatch({ type: 'pending', context, variables, isPaused })
}
\`\`\`

Then on error:

\`\`\`ts
await this.options.onError?.(error as TError, variables, this.state.context, mutationFnContext)
\`\`\`

Note \`this.state.context\` — the dispatched context, not what was returned. So even if onMutate is async and dispatch happens later, onError gets the same value.

The conventional rollback recipe:

\`\`\`ts
useMutation({
  mutationFn: updateTodo,
  onMutate: async (newTodo) => {
    await queryClient.cancelQueries({ queryKey: ['todos'] })
    const previousTodos = queryClient.getQueryData(['todos'])
    queryClient.setQueryData(['todos'], (old) => [...old, newTodo])
    return { previousTodos } // becomes context
  },
  onError: (err, newTodo, context) => {
    queryClient.setQueryData(['todos'], context.previousTodos)
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] })
  },
})
\`\`\`

The \`cancelQueries\` call is non-negotiable. Without it, an in-flight refetch can resolve after your optimistic update and overwrite it. \`cancelQueries\` calls \`query.cancel({ revert: true })\` (see queryClient.ts line 282) which uses the retryer's CancelledError mechanism to abort the in-flight request without rolling back state.

The \`onSettled\` invalidation is the safety net. After a successful mutation your optimistic data probably matches the server's, but server-side computation (e.g., a normalized \`updatedAt\` timestamp, a derived field, a denormalized aggregate) can disagree. The invalidate triggers a refetch that produces the canonical truth.

**Gotcha:** If \`onMutate\` itself throws, \`onError\` still runs but with \`context = undefined\`. Always defensively check \`context?.previousTodos\` in your rollback. The classic bug is \`context.previousTodos\` crashing when \`onMutate\` failed before it could capture the snapshot.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'optimistic-updates', 'rollback', 'mutation'],
    repository: repo,
    filePath: 'packages/query-core/src/mutation.ts',
    url: url('packages/query-core/src/mutation.ts'),
  },
  {
    title: 'cancelQueries: the AbortSignal lives on the QueryFunctionContext',
    body: `Every \`queryFn\` receives an \`AbortSignal\` it can wire into \`fetch\` for free cancellation. But the signal is added lazily — it's a getter on the context object, and only marking it as "consumed" enables the abort path.

\`\`\`ts
const abortController = new AbortController()

const addSignalProperty = (object: unknown) => {
  Object.defineProperty(object, 'signal', {
    enumerable: true,
    get: () => {
      this.#abortSignalConsumed = true
      return abortController.signal
    },
  })
}
\`\`\`

Inside the retryer's onCancel:

\`\`\`ts
onCancel: (error) => {
  if (error instanceof CancelledError && error.revert) {
    this.setState({ ...this.#revertState, fetchStatus: 'idle' as const })
  }
  abortController.abort()
},
\`\`\`

So the abort fires regardless of whether your queryFn actually used the signal. But the \`#abortSignalConsumed\` flag changes other behavior — for example, on focus-refetch it'll skip aborting in-flight requests if no signal was consumed (avoids breaking apps that don't pass it through).

The recipe in user code:

\`\`\`ts
useQuery({
  queryKey: ['user', id],
  queryFn: async ({ signal }) => {
    const res = await fetch(\`/api/users/\${id}\`, { signal })
    if (!res.ok) throw new Error('failed')
    return res.json()
  },
})
\`\`\`

When the component unmounts or the query key changes, the previous request is aborted at the network layer.

**Gotcha:** Many ORMs and SDK clients (axios pre-v1, GraphQL clients, Supabase) don't accept \`AbortSignal\`. In that case the \`#abortSignalConsumed\` flag stays false and you don't get cancellation — you only get state-level cancellation (the result is discarded), but the network request finishes anyway, wasting bandwidth and possibly racing your next mutation. Either polyfill the signal handling or accept that "cancellation" means "ignored result," not "stopped request."`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'cancel-queries', 'abort-signal', 'query-fn'],
    repository: repo,
    filePath: 'packages/query-core/src/query.ts',
    url: url('packages/query-core/src/query.ts'),
  },
  {
    title: 'Retry exponential backoff: 1s → 2s → 4s, capped at 30s',
    body: `When you don't pass a \`retryDelay\`, retries follow a hardcoded exponential schedule with a cap.

\`\`\`ts
function defaultRetryDelay(failureCount: number) {
  return Math.min(1000 * 2 ** failureCount, 30000)
}
\`\`\`

So failure 1 → 1000ms, failure 2 → 2000ms, failure 3 → 4000ms, … failure 6+ → 30000ms.

Combined with the default \`retry\` count of 3 (or \`0\` on the server, see \`environmentManager.isServer()\`), a worst-case useQuery failure means roughly 7 seconds of retries before the user sees the error. The full retryer logic:

\`\`\`ts
const retry = config.retry ?? (environmentManager.isServer() ? 0 : 3)
const retryDelay = config.retryDelay ?? defaultRetryDelay
const delay =
  typeof retryDelay === 'function'
    ? retryDelay(failureCount, error)
    : retryDelay
const shouldRetry =
  retry === true ||
  (typeof retry === 'number' && failureCount < retry) ||
  (typeof retry === 'function' && retry(failureCount, error))
\`\`\`

Two override patterns worth knowing:

- **Don't retry 4xx**: \`retry: (failureCount, error) => error.status >= 500 && failureCount < 3\`
- **Custom backoff**: \`retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000) + Math.random() * 1000\` (adds jitter so a thundering herd doesn't all retry at the same millisecond)

**Gotcha:** Server-side default is \`retry: 0\`, not 3. If you call \`queryClient.fetchQuery\` inside a Next.js Server Component or RSC loader, a 502 from your upstream API will bubble straight to the user with no retries. This is intentional (you don't want a slow server holding the request hot for 30s) but surprises people who tested locally where the retries silently masked flakiness. Set \`retry\` explicitly for fetches you depend on.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'retry', 'exponential-backoff', 'retryer'],
    repository: repo,
    filePath: 'packages/query-core/src/retryer.ts',
    url: url('packages/query-core/src/retryer.ts'),
  },
  {
    title: 'networkMode: how online/offlineFirst/always actually decide whether to fetch',
    body: `\`networkMode\` is a single source of truth implemented in two helper functions inside the retryer.

\`\`\`ts
export function canFetch(networkMode: NetworkMode | undefined): boolean {
  return (networkMode ?? 'online') === 'online'
    ? onlineManager.isOnline()
    : true
}

const canContinue = () =>
  focusManager.isFocused() &&
  (config.networkMode === 'always' || onlineManager.isOnline()) &&
  config.canRun()
\`\`\`

The three modes:

- **\`'online'\`** (default): Won't even start a fetch when \`onlineManager.isOnline()\` is false. Mid-flight retries pause until the browser comes back online.
- **\`'offlineFirst'\`**: Starts the fetch attempt regardless of online state — useful for service-worker-cached responses where the network query might still resolve from cache. But mid-retry pauses respect the online state. Auto-applied when you set \`persister\` (see queryClient.ts line 612).
- **\`'always'\`**: No network state checks at all. Use for in-memory or async-storage queries where there's no actual network involved.

When a query can't fetch, it enters \`fetchStatus: 'paused'\`. The \`pause()\` function in retryer.ts holds the promise open with a \`continueResolve\` capture; \`onlineManager.subscribe\` calls \`resumePausedMutations\` and the cache's \`onOnline\` flushes them. The result is a query whose \`isPaused\` flag is true, no data, no error, no fetching — the UI can show "you're offline" instead of a confusing "loading" state.

The \`fetchStatus\` (idle/fetching/paused) is intentionally separate from \`status\` (pending/error/success). A query that has data but is being refetched is \`{ status: 'success', fetchStatus: 'fetching' }\`. A query waiting for the network is \`{ status: 'pending', fetchStatus: 'paused' }\`. This is why the v5 boolean helpers were renamed (\`isLoading\` now means "no data AND fetching" rather than the v4 "no data, possibly paused").

**Gotcha:** On React Native there's no built-in online detection — \`onlineManager\` defaults to \`#online = true\` and never fires unless you wire \`@react-native-community/netinfo\` via \`onlineManager.setEventListener\`. So a default React Native app behaves like \`networkMode: 'always'\` even if you set \`'online'\`. Symptom: fetches don't pause when airplane mode is on, you get hung promises and AbortErrors instead of nice paused states.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'network-mode', 'offline', 'online-manager'],
    repository: repo,
    filePath: 'packages/query-core/src/retryer.ts',
    url: url('packages/query-core/src/retryer.ts'),
  },
  {
    title: 'gcTime (formerly cacheTime): the 5-minute Removable timer',
    body: `In v5, \`cacheTime\` was renamed to \`gcTime\` to reflect what it actually does — schedule the inactive query for garbage collection. The implementation lives in the abstract \`Removable\` class shared by Query and Mutation.

\`\`\`ts
export abstract class Removable {
  gcTime!: number
  #gcTimeout?: ManagedTimerId

  protected scheduleGc(): void {
    this.clearGcTimeout()
    if (isValidTimeout(this.gcTime)) {
      this.#gcTimeout = timeoutManager.setTimeout(() => {
        this.optionalRemove()
      }, this.gcTime)
    }
  }

  protected updateGcTime(newGcTime: number | undefined): void {
    // Default to 5 minutes (Infinity for server-side) if no gcTime is set
    this.gcTime = Math.max(
      this.gcTime || 0,
      newGcTime ?? (environmentManager.isServer() ? Infinity : 5 * 60 * 1000),
    )
  }
}
\`\`\`

A few non-obvious things:

1. **\`updateGcTime\` only ever increases** — \`Math.max(this.gcTime || 0, newGcTime)\`. Once a query has had a 30-minute gcTime, you can't shrink it back. Different observers can have different \`gcTime\` settings on the same query; the longest one wins.
2. **\`gcTime\` defaults to \`Infinity\` on the server.** This matters for SSR — your dehydrated payload contains every query that was ever fetched during render, regardless of when it was fetched, because nothing has been GC'd.
3. **The timer only starts when the last observer unsubscribes** — see \`Mutation.removeObserver\` calling \`scheduleGc()\`. While any \`useQuery\` is mounted, \`clearGcTimeout()\` keeps the entry alive.

\`staleTime\` and \`gcTime\` answer different questions: \`staleTime\` says "is the data fresh enough to skip a background refetch?" \`gcTime\` says "how long should the cache hold this entry after no one's using it?"

**Gotcha:** \`gcTime: 0\` doesn't mean "delete immediately" — it means "delete on the next \`setTimeout(0)\` after the last observer leaves." If you remount the same query within the same tick (typical of route-transition components), the timer never fires and the cache survives. If you actually want to drop the entry, use \`queryClient.removeQueries({ queryKey })\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'gc-time', 'cache-time', 'garbage-collection'],
    repository: repo,
    filePath: 'packages/query-core/src/removable.ts',
    url: url('packages/query-core/src/removable.ts'),
  },
  {
    title: 'notifyManager.batch: how 50 setQueryData calls turn into one React render',
    body: `The notify manager is the layer that prevents render storms. Every dispatch in TanStack Query is queued through it, and \`batch\` lets you wrap N updates into a single flush.

\`\`\`ts
export function createNotifyManager() {
  let queue: Array<NotifyCallback> = []
  let transactions = 0
  // ...
  return {
    batch: <T>(callback: () => T): T => {
      let result
      transactions++
      try {
        result = callback()
      } finally {
        transactions--
        if (!transactions) {
          flush()
        }
      }
      return result
    },
    // ...
  }
}
\`\`\`

The \`schedule\` function checks if we're inside a transaction; if so, it pushes to the queue instead of running immediately. When the outermost \`batch\` exits, \`flush\` runs all the queued callbacks inside a single \`batchNotifyFn\` call (which by default is \`ReactDOM.unstable_batchedUpdates\` in older React, identity in React 18+).

This is why \`queryClient.setQueriesData(filters, updater)\` (which can match dozens of cache entries) doesn't cause one render per match:

\`\`\`ts
setQueriesData(filters, updater, options) {
  return notifyManager.batch(() =>
    this.#queryCache
      .findAll(filters)
      .map(({ queryKey }) => [queryKey, this.setQueryData(queryKey, updater, options)]),
  )
}
\`\`\`

The whole \`map\` runs inside the \`batch\` so observers receive a single notification at the end.

**Gotcha:** If your code reaches into \`queryClient\` from inside a websocket handler or \`setTimeout\` and calls \`setQueryData\` 50 times in a tight loop, it'll cause 50 schedules — each delivered on the next microtask via \`systemSetTimeoutZero\`. Wrap your loop in \`notifyManager.batch(() => { ... })\` (it's exported from \`@tanstack/react-query\`) to collapse them. The visible symptom is jank during a burst of server-pushed updates. Second tip: if you're integrating with a framework that needs custom batching (React Native pre-0.74, custom renderers), call \`notifyManager.setBatchNotifyFunction(yourBatcher)\` once at app boot — TanStack Query itself doesn't import \`react-dom/client\`, so without setting this you fall back to no batching even on the web in some bundler setups.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'notify-manager', 'batching', 'performance'],
    repository: repo,
    filePath: 'packages/query-core/src/notifyManager.ts',
    url: url('packages/query-core/src/notifyManager.ts'),
  },
  {
    title: 'useBaseQuery: the useSyncExternalStore + observer engine behind every hook',
    body: `\`useQuery\`, \`useSuspenseQuery\`, and \`useInfiniteQuery\` are all thin wrappers around \`useBaseQuery\`. The whole reactive machinery is one \`useSyncExternalStore\` call.

\`\`\`ts
const [observer] = React.useState(
  () => new Observer(client, defaultedOptions),
)

const result = observer.getOptimisticResult(defaultedOptions)

const shouldSubscribe = !isRestoring && options.subscribed !== false
React.useSyncExternalStore(
  React.useCallback(
    (onStoreChange) => {
      const unsubscribe = shouldSubscribe
        ? observer.subscribe(notifyManager.batchCalls(onStoreChange))
        : noop
      // Update result to make sure we did not miss any query updates
      // between creating the observer and subscribing to it.
      observer.updateResult()
      return unsubscribe
    },
    [observer, shouldSubscribe],
  ),
  () => observer.getCurrentResult(),
  () => observer.getCurrentResult(),
)
\`\`\`

A few things to notice:

1. **The observer is held in \`useState(() => new Observer(...))\`** — created once per mount, lives until unmount. Re-renders never recreate it; \`React.useEffect(() => observer.setOptions(defaultedOptions))\` pushes new options into the existing observer.
2. **\`observer.getOptimisticResult\` runs in render** before subscription. This is what gives you data on the first render even if no fetch has completed (placeholderData, initialData, prior cache hits all flow through here).
3. **\`onStoreChange\` is wrapped in \`notifyManager.batchCalls\`** so a burst of updates from the cache only triggers one React render.

**Gotcha:** If you destructure \`{ data }\` from \`useQuery\`, the observer's proxy (see \`trackResult\` in queryObserver.ts) only marks \`data\` as tracked. A change to \`isFetching\` won't re-render your component — that's the \`notifyOnChangeProps\` optimization. But it means \`if (status === 'pending')\` in render won't react to status flips unless you also touch \`status\` in the same component. The fix is usually to actually use the property (\`useQuery(...).status\`), or set \`notifyOnChangeProps: 'all'\` if you've stripped it out via \`...rest\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'use-query', 'use-sync-external-store', 'observer'],
    repository: repo,
    filePath: 'packages/react-query/src/useBaseQuery.ts',
    url: url('packages/react-query/src/useBaseQuery.ts'),
  },
  {
    title: 'select option: derived data with referential equality',
    body: `\`select\` lets you transform query data without re-running the queryFn. Crucially, it's memoized so \`useQuery({ select: (data) => data.user.name })\` doesn't re-render when \`data.user.email\` changes.

\`\`\`ts
if (options.select && data !== undefined && !skipSelect) {
  // Memoize select result
  if (
    prevResult &&
    data === prevResultState?.data &&
    options.select === this.#selectFn
  ) {
    data = this.#selectResult
  } else {
    try {
      this.#selectFn = options.select
      data = options.select(data as any)
      data = replaceData(prevResult?.data, data, options)
      this.#selectResult = data
      this.#selectError = null
    } catch (selectError) {
      this.#selectError = selectError as TError
    }
  }
}
\`\`\`

Two memoization layers stack:

1. **Reference cache:** if both raw \`data\` and the \`select\` function reference are unchanged, return the previous select result without calling the function.
2. **Structural sharing via \`replaceData\`** (calls \`replaceEqualDeep\`): if the new selected output is deeply equal to the prior one, return the prior reference. So \`select: (todos) => todos.filter(t => !t.done)\` returns the same array reference across re-runs as long as the filtered result is equal.

This is the single most underused performance feature in React Query. Two components subscribed to the same \`['user']\` cache key but with different \`select\` functions only re-render when their slice changes.

**Gotcha:** The reference-cache check uses \`options.select === this.#selectFn\` — strict equality on the function. If you pass an inline arrow \`select: (data) => data.user\` it changes identity every render, breaking the cache and forcing the select to re-run (and structural sharing to recompute). Define it outside the component, use \`useCallback\`, or use the \`queryOptions\` helper which freezes the options object identity.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'select', 'derived-data', 'memoization'],
    repository: repo,
    filePath: 'packages/query-core/src/queryObserver.ts',
    url: url('packages/query-core/src/queryObserver.ts'),
  },
  {
    title: 'placeholderData vs initialData: which one becomes "real" cache state',
    body: `Both options give you data on the first render, but they live in completely different places.

\`initialData\` writes to the actual query state inside \`getDefaultState\`:

\`\`\`ts
const data =
  typeof options.initialData === 'function'
    ? (options.initialData as InitialDataFunction<TData>)()
    : options.initialData

const hasData = data !== undefined
const initialDataUpdatedAt = hasData
  ? typeof options.initialDataUpdatedAt === 'function'
    ? options.initialDataUpdatedAt()
    : options.initialDataUpdatedAt
  : 0
\`\`\`

Once written, \`initialData\` is indistinguishable from a real fetch result — it has a \`dataUpdatedAt\` timestamp, it's eligible for staleTime checks, and other components reading the same key see it.

\`placeholderData\` lives only on the observer result, never in the cache:

\`\`\`ts
if (placeholderData !== undefined) {
  status = 'success'
  data = replaceData(prevResult?.data, placeholderData as unknown, options) as TData
  isPlaceholderData = true
}
\`\`\`

It only kicks in when \`data === undefined && status === 'pending'\`. The \`isPlaceholderData: true\` flag tells the UI it's not real data yet. As soon as the real fetch resolves, the placeholder is discarded.

**Practical consequence:** Use \`initialData\` for "I already have this exact data from another source" (e.g., a list page passing a row to the detail page so detail loads with the row pre-rendered, with \`initialDataUpdatedAt: list.dataUpdatedAt\`). Use \`placeholderData\` for "show me the previous page's data while the next page loads" (\`placeholderData: keepPreviousData\` — the famous pagination trick).

**Gotcha:** \`initialData\` with no \`initialDataUpdatedAt\` is treated as fetched at \`Date.now()\`, which means it's immediately considered fresh and your queryFn won't run on mount. People hit this pre-loading data from server props and wonder why the client never refetches. Either set \`initialDataUpdatedAt: 0\` to mark it stale, or use \`placeholderData\` instead.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'placeholder-data', 'initial-data', 'cache'],
    repository: repo,
    filePath: 'packages/query-core/src/queryObserver.ts',
    url: url('packages/query-core/src/queryObserver.ts'),
  },
  {
    title: 'useSuspenseQuery: throws the promise, clamps staleTime to 1s minimum',
    body: `\`useSuspenseQuery\` is a thin wrapper that flips three options and forwards to \`useBaseQuery\`.

\`\`\`ts
return useBaseQuery(
  {
    ...options,
    enabled: true,
    suspense: true,
    throwOnError: defaultThrowOnError,
    placeholderData: undefined,
  },
  QueryObserver,
  queryClient,
)
\`\`\`

\`enabled\` is forced to true (you can't conditionally disable a suspense query — it'd suspend forever). \`placeholderData\` is forced to undefined (you can't show a placeholder while suspending; React's Suspense boundary owns the loading UI). \`throwOnError: defaultThrowOnError\` means errors propagate to the nearest error boundary instead of \`{ error, isError }\`.

The actual suspend-throwing happens inside \`useBaseQuery\`:

\`\`\`ts
if (shouldSuspend(defaultedOptions, result)) {
  throw fetchOptimistic(defaultedOptions, observer, errorResetBoundary)
}
\`\`\`

That \`fetchOptimistic\` returns a promise — React's Suspense catches the throw, awaits the promise, and re-renders.

The hidden but critical detail is in \`ensureSuspenseTimers\`:

\`\`\`ts
const MIN_SUSPENSE_TIME_MS = 1000

const clamp = (value: number | 'static' | undefined) =>
  value === 'static'
    ? value
    : Math.max(value ?? MIN_SUSPENSE_TIME_MS, MIN_SUSPENSE_TIME_MS)

defaultedOptions.staleTime = ...clamp(originalStaleTime)
if (typeof defaultedOptions.gcTime === 'number') {
  defaultedOptions.gcTime = Math.max(defaultedOptions.gcTime, MIN_SUSPENSE_TIME_MS)
}
\`\`\`

Suspense queries get a forced 1-second minimum staleTime. Without this, a child component that suspends and remounts (which Suspense does as part of its retry semantics) would re-fetch immediately and re-suspend, creating a render loop.

The \`gcTime\` clamp follows the same logic — if your suspense query had \`gcTime: 0\`, the cache entry would be evicted between the throw-suspend cycle and the re-render after the promise resolves, so the suspended component would never see its own data.

**Gotcha:** This forced minimum means \`useSuspenseQuery({ staleTime: 0 })\` actually behaves as \`staleTime: 1000\`. If you really want zero, you have to call refetch() manually after the initial render, or use the regular \`useQuery\` with manual loading UI. Also: useSuspenseQuery doesn't accept \`enabled: false\` (the wrapper hardcodes \`enabled: true\`), so for conditional queries you must conditionally render the component itself, not pass an enabled flag. The useSuspenseQuery hook also doesn't accept \`skipToken\` as a queryFn — the source explicitly errors in dev: \`if ((options.queryFn as any) === skipToken) console.error('skipToken is not allowed for useSuspenseQuery')\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'suspense', 'use-suspense-query', 'react-19'],
    repository: repo,
    filePath: 'packages/react-query/src/useSuspenseQuery.ts',
    url: url('packages/react-query/src/useSuspenseQuery.ts'),
  },
  {
    title: 'useInfiniteQuery: pages array, getNextPageParam, and the fetchMore direction',
    body: `\`useInfiniteQuery\` is implemented as a custom \`QueryBehavior\` (\`infiniteQueryBehavior\`) that wraps your \`queryFn\` to manage a pages array.

\`\`\`ts
if (direction && oldPages.length) {
  const previous = direction === 'backward'
  const pageParamFn = previous ? getPreviousPageParam : getNextPageParam
  const oldData = { pages: oldPages, pageParams: oldPageParams }
  const param = pageParamFn(options, oldData)
  result = await fetchPage(oldData, param, previous)
} else {
  // refetch path: re-fetch every existing page in order
  const remainingPages = pages ?? oldPages.length
  do {
    const param =
      currentPage === 0
        ? (oldPageParams[0] ?? options.initialPageParam)
        : getNextPageParam(options, result)
    if (currentPage > 0 && param == null) break
    result = await fetchPage(result, param)
    currentPage++
  } while (currentPage < remainingPages)
}
\`\`\`

The two paths are very different:

1. **\`fetchNextPage()\` / \`fetchPreviousPage()\`** sets a \`fetchMeta.fetchMore.direction\` flag. The behavior reads that flag, computes one new \`pageParam\` via \`getNextPageParam(lastPage, allPages, lastPageParam, allPageParams)\`, fetches one page, and appends.
2. **A normal refetch** (e.g., from \`invalidateQueries\`) re-fetches every page sequentially in a loop, walking forward via \`getNextPageParam\` from the original initialPageParam. This is N requests for N pages, all serialized.

That second behavior is the one that bites people. \`maxPages\` (passed to \`addToEnd\`/\`addToStart\`) caps how many pages stay in the cache window — without it, a 50-page-deep infinite scroll re-fetches all 50 pages on every invalidate.

**Gotcha:** \`getNextPageParam\` returning \`undefined\` or \`null\` means "no more pages" (sets \`hasNextPage: false\`). Returning \`0\`, \`false\`, or \`""\` does NOT — those are valid pageParams. If your API returns \`{ next: null }\` when done, return \`lastPage.next ?? undefined\`, not \`lastPage.next || undefined\` (the latter would also stop on \`""\` or \`0\`, breaking pagination over numeric cursors that legitimately start at 0).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'use-infinite-query', 'pagination', 'page-param'],
    repository: repo,
    filePath: 'packages/query-core/src/infiniteQueryBehavior.ts',
    url: url('packages/query-core/src/infiniteQueryBehavior.ts'),
  },
  {
    title: 'HydrationBoundary: how SSR queries skip the client refetch on first render',
    body: `\`HydrationBoundary\` wraps your tree on the client and walks the dehydrated state, comparing each query against the existing cache.

\`\`\`ts
const newQueries: DehydratedState['queries'] = []
const existingQueries: DehydratedState['queries'] = []
for (const dehydratedQuery of queries) {
  const existingQuery = queryCache.get(dehydratedQuery.queryHash)
  if (!existingQuery) {
    newQueries.push(dehydratedQuery)
  } else {
    const hydrationIsNewer =
      dehydratedQuery.state.dataUpdatedAt > existingQuery.state.dataUpdatedAt ||
      (dehydratedQuery.promise && /* ... */)
    if (hydrationIsNewer) {
      existingQueries.push(dehydratedQuery)
    }
  }
}

if (newQueries.length > 0) {
  hydrate(client, { queries: newQueries }, optionsRef.current)
}
if (existingQueries.length > 0) {
  return existingQueries
}
\`\`\`

The split is deliberate: **new queries are hydrated synchronously during render** (so child components don't see an empty cache and trigger a fetch). **Existing queries are deferred to a useEffect** so an in-progress transition doesn't have its data overwritten before commit.

The standard Next.js App Router setup:

\`\`\`tsx
// page.tsx (server component)
const queryClient = new QueryClient()
await queryClient.prefetchQuery({ queryKey: ['user'], queryFn })
return (
  <HydrationBoundary state={dehydrate(queryClient)}>
    <ClientComponent />
  </HydrationBoundary>
)
\`\`\`

\`dehydrate\` walks the cache and produces a serializable payload; \`HydrationBoundary\` rehydrates it. The client \`useQuery({ queryKey: ['user'], queryFn })\` reads the hydrated cache and skips the fetch (as long as the data isn't stale).

**Gotcha:** Each request needs its own \`QueryClient\` on the server. If you create one at module scope, requests will leak each other's cache (and you'll dehydrate other users' data). Always do \`new QueryClient()\` inside the request handler / page function — the docs hammer this but the bug pattern keeps reappearing in production code, especially with React Server Components where module scope is process-wide.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'hydration', 'ssr', 'next-js'],
    repository: repo,
    filePath: 'packages/react-query/src/HydrationBoundary.tsx',
    url: url('packages/react-query/src/HydrationBoundary.tsx'),
  },
  {
    title: 'dehydrate: defaults to dehydrating only successful queries',
    body: `\`dehydrate\` is more selective than people realize. By default it only includes queries in \`success\` state and mutations that are paused.

\`\`\`ts
export function defaultShouldDehydrateMutation(mutation: Mutation) {
  return mutation.state.isPaused
}

export function defaultShouldDehydrateQuery(query: Query) {
  return query.state.status === 'success'
}
\`\`\`

So a query that's still pending (no data yet), or in error state, won't appear in the dehydrated payload. The full function:

\`\`\`ts
const queries = client
  .getQueryCache()
  .getAll()
  .flatMap((query) =>
    filterQuery(query)
      ? [dehydrateQuery(query, serializeData, shouldRedactErrors)]
      : [],
  )
\`\`\`

A subtle but important branch: when a query IS in \`pending\` state, dehydrating includes its in-flight \`promise\`:

\`\`\`ts
return {
  dehydratedAt: Date.now(),
  state: { ...query.state, ...(query.state.data !== undefined && { data: serializeData(query.state.data) }) },
  queryKey: query.queryKey,
  queryHash: query.queryHash,
  ...(query.state.status === 'pending' && {
    promise: dehydratePromise(),
  }),
  ...(query.meta && { meta: query.meta }),
}
\`\`\`

This is how Next.js streaming SSR works — you can dehydrate a pending query, ship the promise as part of the RSC payload, and the client picks up where the server left off without re-issuing the request.

**Gotcha:** Errors thrown by pending dehydrated queries are redacted in production by default:

\`\`\`ts
const promise = query.promise?.then(serializeData).catch((error) => {
  if (!shouldRedactErrors(error)) return Promise.reject(error)
  return Promise.reject(new Error('redacted'))
})
\`\`\`

This prevents leaking server-only error messages (stack traces, DB errors) to the client. But if you depend on error message content client-side (e.g., showing "user not found" vs "server error"), pass \`shouldRedactErrors: () => false\` and use a typed error code in the body instead.

To dehydrate errors at all you also need to override \`shouldDehydrateQuery\` — the default returns true only for \`'success'\`, so failed queries are silently dropped from the payload. The combo for "ship error states to the client" is \`{ shouldDehydrateQuery: (q) => q.state.status !== 'pending', shouldRedactErrors: () => false }\`. Use sparingly — most apps want the client to re-attempt the failed fetch fresh anyway.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'dehydrate', 'ssr', 'streaming'],
    repository: repo,
    filePath: 'packages/query-core/src/hydration.ts',
    url: url('packages/query-core/src/hydration.ts'),
  },
  {
    title: 'queryOptions helper: one definition, type-safe everywhere',
    body: `\`queryOptions\` is the smallest function in the codebase but the highest-leverage one for type safety:

\`\`\`ts
export function queryOptions(options: unknown) {
  return options
}
\`\`\`

The runtime is identity. The magic is in the overloads, which return a \`DataTag<TQueryKey, TQueryFnData, TError>\`:

\`\`\`ts
export function queryOptions<...>(
  options: UnusedSkipTokenOptions<TQueryFnData, TError, TData, TQueryKey>,
): UnusedSkipTokenOptions<...> & {
  queryKey: DataTag<TQueryKey, TQueryFnData, TError>
}
\`\`\`

The \`DataTag\` brand attaches the inferred data and error types to the queryKey. So when you later do \`queryClient.getQueryData(userOptions.queryKey)\`, TypeScript infers the return type from the tag — no manual generic, no \`as User\`.

The shape that pays off:

\`\`\`ts
// shared module
export const userQuery = (id: string) =>
  queryOptions({
    queryKey: ['user', id] as const,
    queryFn: () => api.getUser(id),
    staleTime: 30_000,
  })

// component
const { data } = useQuery(userQuery(userId)) // data: User | undefined
const cached = queryClient.getQueryData(userQuery(id).queryKey) // User | undefined
queryClient.setQueryData(userQuery(id).queryKey, (prev) => prev) // prev: User | undefined
\`\`\`

You define the queryFn once and the entire app — \`useQuery\`, \`prefetchQuery\`, \`getQueryData\`, \`setQueryData\`, \`invalidateQueries\` — gets inferred types for free.

**Gotcha:** \`invalidateQueries({ queryKey: ['user'] })\` with a plain string array invalidates everything starting with \`['user']\`. Use \`queryOptions(...).queryKey\` — the DataTag type — to get fully-typed key matching, but be aware that for partial-prefix matches you need a key without the variable parts. Pattern: define a key factory that exposes both \`all: () => ['user'] as const\` (for invalidation) and \`detail: (id) => queryOptions({ queryKey: ['user', id] as const, ... })\` (for queries). The TkDodo "query key factories" pattern.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'query-options', 'typescript', 'data-tag'],
    repository: repo,
    filePath: 'packages/react-query/src/queryOptions.ts',
    url: url('packages/react-query/src/queryOptions.ts'),
  },
  {
    title: 'useIsFetching: global "spinner" state via the cache subscription',
    body: `\`useIsFetching\` is the textbook \`useSyncExternalStore\` over the QueryCache — a count of how many queries are currently fetching, updated reactively.

\`\`\`ts
export function useIsFetching(filters, queryClient): number {
  const client = useQueryClient(queryClient)
  const queryCache = client.getQueryCache()

  return React.useSyncExternalStore(
    React.useCallback(
      (onStoreChange) =>
        queryCache.subscribe(notifyManager.batchCalls(onStoreChange)),
      [queryCache],
    ),
    () => client.isFetching(filters),
    () => client.isFetching(filters),
  )
}
\`\`\`

\`client.isFetching\` is implemented as:

\`\`\`ts
isFetching(filters) {
  return this.#queryCache.findAll({ ...filters, fetchStatus: 'fetching' }).length
}
\`\`\`

So every call walks all queries in the cache. The \`useSyncExternalStore\` re-runs the snapshot on every cache event, but \`shallowEqualObjects\` would short-circuit identical numbers — actually it just returns a primitive, so React's bailout handles it.

The real-world use:

\`\`\`tsx
function GlobalSpinner() {
  const isFetching = useIsFetching()
  return isFetching > 0 ? <TopBarLoader /> : null
}
\`\`\`

Or scoped:

\`\`\`tsx
const isFetchingTodos = useIsFetching({ queryKey: ['todos'] })
\`\`\`

The companion \`useIsMutating\` lives in \`useMutationState.ts\`:

\`\`\`ts
export function useIsMutating(filters, queryClient): number {
  const client = useQueryClient(queryClient)
  return useMutationState({ filters: { ...filters, status: 'pending' } }, client).length
}
\`\`\`

**Gotcha:** \`useIsFetching\` re-runs on every cache event (added, removed, updated, observerAdded, observerRemoved, observerOptionsUpdated, observerResultsUpdated). On apps with hundreds of queries, that's hundreds of \`findAll\` calls per second during a burst. If you only care about a specific scope, always pass the \`filters\` argument so the predicate matches less. And keep this hook in a leaf component, not in your top-level layout, so React's reconciler can skip it when the count doesn't change. Also note: a query that's \`fetchStatus: 'paused'\` (offline) is NOT counted as fetching — \`useIsFetching\` returns 0 even though those queries are stuck waiting. To show a "queries waiting for network" indicator, subscribe to the cache directly and count by both \`fetchStatus: 'fetching'\` and \`fetchStatus: 'paused'\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'use-is-fetching', 'global-state', 'spinner'],
    repository: repo,
    filePath: 'packages/react-query/src/useIsFetching.ts',
    url: url('packages/react-query/src/useIsFetching.ts'),
  },
  {
    title: 'refetchOnWindowFocus: how the focusManager wakes up stale queries',
    body: `\`refetchOnWindowFocus\` (default \`true\`) is wired through the \`focusManager\` singleton. The QueryClient subscribes on \`mount()\`:

\`\`\`ts
this.#unsubscribeFocus = focusManager.subscribe(async (focused) => {
  if (focused) {
    await this.resumePausedMutations()
    this.#queryCache.onFocus()
  }
})
\`\`\`

The \`FocusManager\` itself listens to \`visibilitychange\` (not \`focus\`/\`blur\` — visibility is more reliable across iframes and mobile browsers):

\`\`\`ts
this.#setup = (onFocus) => {
  if (typeof window !== 'undefined' && window.addEventListener) {
    const listener = () => onFocus()
    window.addEventListener('visibilitychange', listener, false)
    return () => window.removeEventListener('visibilitychange', listener)
  }
  return
}
\`\`\`

\`isFocused\` checks \`document.visibilityState !== 'hidden'\`. So the moment the user tabs back to your app, every active query re-evaluates whether to fetch.

The decision is per-observer in \`shouldFetchOn\` — refetchOnWindowFocus is consulted, and if the query is stale, a refetch is dispatched. The whole thing is inside \`notifyManager.batch(...)\` so 100 queries flushing focus refetches don't cause 100 renders.

The option accepts \`true\`, \`false\`, \`'always'\`, or a function \`(query) => boolean\`. \`'always'\` skips the staleTime check — the query refetches on every focus regardless of freshness. The function form is the escape hatch for "refetch this query on focus only if the user has scrolled past row 100" type rules.

**Gotcha:** "Focus refetch fires too often during dev" is a top complaint. Devs alt-tab between editor and browser constantly, and every flip refetches. Two real fixes: (1) bump \`staleTime\` so the queries aren't stale by the time you tab back (\`staleTime: 30_000\` covers most dev iteration); (2) for queries that genuinely shouldn't refetch on focus (websocket-pushed data, real-time feeds), set \`refetchOnWindowFocus: false\` per query. Disabling globally (\`defaultOptions.queries.refetchOnWindowFocus = false\`) is usually a step too far — you lose the "user came back, show fresh data" behavior production users rely on.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'focus-manager', 'refetch-on-window-focus', 'visibility'],
    repository: repo,
    filePath: 'packages/query-core/src/focusManager.ts',
    url: url('packages/query-core/src/focusManager.ts'),
  },
  {
    title: 'OnlineManager: defaults to true, never auto-refetches without listener wiring',
    body: `\`OnlineManager\` is a Subscribable that defaults its state to true and only learns about offline transitions if something wires up a listener.

\`\`\`ts
export class OnlineManager extends Subscribable<Listener> {
  #online = true
  // ...
  this.#setup = (onOnline) => {
    if (typeof window !== 'undefined' && window.addEventListener) {
      const onlineListener = () => onOnline(true)
      const offlineListener = () => onOnline(false)
      window.addEventListener('online', onlineListener, false)
      window.addEventListener('offline', offlineListener, false)
      return () => { /* unregister */ }
    }
    return
  }
\`\`\`

The browser \`online\`/\`offline\` events are notoriously unreliable — they fire when the OS network interface changes, not when actual connectivity changes. A captive-portal Wi-Fi connection still reports "online" even when DNS is broken. Even with the listener wired, you can't trust \`onlineManager.isOnline()\` to mean "the API is reachable."

The QueryClient wires both online and focus on \`mount()\`:

\`\`\`ts
this.#unsubscribeOnline = onlineManager.subscribe(async (online) => {
  if (online) {
    await this.resumePausedMutations()
    this.#queryCache.onOnline()
  }
})
\`\`\`

So when the browser reports back-online, all paused mutations are resumed (in the order they were paused, with mutation scope ensuring serialization) and queries that paused during fetch are continued.

For React Native there's no built-in equivalent; the recommended setup is:

\`\`\`ts
import NetInfo from '@react-native-community/netinfo'
import { onlineManager } from '@tanstack/react-query'

onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected)
  })
})
\`\`\`

**Gotcha:** Because \`#online\` defaults to \`true\`, an app loaded while offline (the dreaded "open the laptop on a plane" scenario) will still try to fetch every query on mount — because no offline event has fired yet, only the \`online\` event ever fires. The fetches will fail with TypeError, retry per the schedule, and only then enter \`fetchStatus: 'paused'\`. To behave correctly from boot, hydrate \`onlineManager\` from \`navigator.onLine\` early: \`onlineManager.setOnline(navigator.onLine)\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'online-manager', 'offline', 'react-native'],
    repository: repo,
    filePath: 'packages/query-core/src/onlineManager.ts',
    url: url('packages/query-core/src/onlineManager.ts'),
  },
  {
    title: 'persistQueryClient: cache survival across page reloads via storage',
    body: `\`persistQueryClient\` returns a tuple — \`[unsubscribe, restorePromise]\` — and wires up both restore-on-mount and save-on-cache-event.

\`\`\`ts
export function persistQueryClient(props): [() => void, Promise<void>] {
  let hasUnsubscribed = false
  let persistQueryClientUnsubscribe: (() => void) | undefined
  const unsubscribe = () => {
    hasUnsubscribed = true
    persistQueryClientUnsubscribe?.()
  }
  const restorePromise = persistQueryClientRestore(props).then(() => {
    if (!hasUnsubscribed) {
      persistQueryClientUnsubscribe = persistQueryClientSubscribe(props)
    }
  })
  return [unsubscribe, restorePromise]
}
\`\`\`

The save subscription only triggers on cache mutations, not observer churn:

\`\`\`ts
const cacheEventTypes: Array<NotifyEventType> = ['added', 'removed', 'updated']
function isCacheEventType(eventType: NotifyEventType) {
  return cacheEventTypes.includes(eventType)
}
\`\`\`

So mounting a component that consumes existing data doesn't re-write to localStorage; only an actual data change does.

Restore handles three failure modes via the \`maxAge\` and \`buster\`:

\`\`\`ts
const expired = Date.now() - persistedClient.timestamp > maxAge
const busted = persistedClient.buster !== buster
if (expired || busted) {
  return persister.removeClient()
} else {
  hydrate(queryClient, persistedClient.clientState, hydrateOptions)
}
\`\`\`

\`maxAge\` defaults to 24h. \`buster\` is your app version string — bump it on a deploy that changes API response shapes and every user's cache is invalidated cleanly.

**Gotcha:** \`createSyncStoragePersister\` writes synchronously inside a 1-second throttle (\`throttleTime = 1000\`). On a page with a large cache (think 50KB+ JSON), that synchronous \`localStorage.setItem\` blocks the main thread on every tick. For anything beyond a small cache, use \`createAsyncStoragePersister\` with IndexedDB via \`idb-keyval\` — it serializes off the main thread and won't cause input-latency complaints. The sync version is even marked \`@deprecated\` in v5 source for this reason.

Also note: \`persistQueryClient\` returns immediately and starts the restore in parallel. If your app reads from the cache during the first render (e.g., a server-rendered list expects hydrated data), you'll see an empty cache for a frame. Use \`PersistQueryClientProvider\` instead — it gates rendering on \`isRestoring\` so child queries don't fire during the restore window.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'persist', 'local-storage', 'hydrate'],
    repository: repo,
    filePath: 'packages/query-persist-client-core/src/persist.ts',
    url: url('packages/query-persist-client-core/src/persist.ts'),
  },
  {
    title: 'createSyncStoragePersister: throttled writes with retry-on-failure',
    body: `The sync storage persister wraps \`localStorage.setItem\` in a throttle and a retry loop for quota errors.

\`\`\`ts
return {
  persistClient: throttle((persistedClient) => {
    let client: PersistedClient | undefined = persistedClient
    let error = trySave(client)
    let errorCount = 0
    while (error && client) {
      errorCount++
      client = retry?.({ persistedClient: client, error, errorCount })
      if (client) {
        error = trySave(client)
      }
    }
  }, throttleTime),
  // ...
}
\`\`\`

The \`retry\` callback gets a chance to shrink the payload (drop old queries, prune mutations, switch to a smaller serialization) and return a smaller PersistedClient. The loop keeps trying until either save succeeds or the retry returns undefined.

The throttle is a hand-rolled trailing-edge implementation:

\`\`\`ts
function throttle<TArgs extends Array<any>>(func, wait = 100) {
  let timer: ManagedTimerId | null = null
  let params: TArgs
  return function (...args: TArgs) {
    params = args
    if (timer === null) {
      timer = timeoutManager.setTimeout(() => {
        func(...params)
        timer = null
      }, wait)
    }
  }
}
\`\`\`

So during a burst of cache updates, only the LAST snapshot in each window is written. \`throttleTime\` defaults to 1000ms.

The shipped retry strategy lives in \`@tanstack/query-persist-client-core/src/retryStrategies.ts\`: \`removeOldestQuery\` evicts the oldest cache entry on quota error.

**Gotcha:** \`localStorage\` has a ~5MB quota in most browsers, less in Safari iOS (private mode is sometimes 0). The persister doesn't enforce any pre-write size budget — your first \`QuotaExceededError\` is a runtime surprise. Either set \`dehydrateOptions.shouldDehydrateQuery\` to filter aggressively, or supply \`retry: removeOldestQuery\`. And note that \`storage\` can be \`null\` in Android WebViews — the source explicitly handles that case with a no-op persister, so guard your bootstrap code accordingly.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'persister', 'local-storage', 'throttle'],
    repository: repo,
    filePath: 'packages/query-sync-storage-persister/src/index.ts',
    url: url('packages/query-sync-storage-persister/src/index.ts'),
  },
  {
    title: 'PersistQueryClientProvider: the IsRestoring context that gates rendering',
    body: `\`PersistQueryClientProvider\` wraps \`QueryClientProvider\` with an \`IsRestoringProvider\` so child queries know to stay paused while the cache is being read off disk.

\`\`\`tsx
export const PersistQueryClientProvider = ({ children, persistOptions, onSuccess, onError, ...props }) => {
  const [isRestoring, setIsRestoring] = React.useState(true)
  // ...
  React.useEffect(() => {
    const options = { ...refs.current.persistOptions, queryClient: props.client }
    if (!didRestore.current) {
      didRestore.current = true
      persistQueryClientRestore(options)
        .then(() => refs.current.onSuccess?.())
        .catch(() => refs.current.onError?.())
        .finally(() => { setIsRestoring(false) })
    }
    return isRestoring ? undefined : persistQueryClientSubscribe(options)
  }, [props.client, isRestoring])

  return (
    <QueryClientProvider {...props}>
      <IsRestoringProvider value={isRestoring}>{children}</IsRestoringProvider>
    </QueryClientProvider>
  )
}
\`\`\`

The \`isRestoring\` value flows down through context. Inside \`useBaseQuery\`:

\`\`\`ts
const isRestoring = useIsRestoring()
// ...
defaultedOptions._optimisticResults = isRestoring ? 'isRestoring' : 'optimistic'

const shouldSubscribe = !isRestoring && options.subscribed !== false
\`\`\`

When restoring is true, queries don't subscribe to the cache — they hold an "isRestoring" optimistic result, suspending if necessary. As soon as the persisted state is hydrated and \`setIsRestoring(false)\` runs, all queries subscribe in a single render pass with the cache already populated. No flash of empty state, no double-fetch.

\`didRestore\` is a ref guard so a re-render or strict-mode double-mount doesn't kick off a second restore.

**Gotcha:** If \`persistQueryClientRestore\` throws (corrupted localStorage JSON, deserialization error), the persister calls \`removeClient\` to wipe the bad state, but \`onError\` runs and \`setIsRestoring(false)\` still fires. So the app boots with an empty cache, not a broken one. If you want a different recovery strategy (e.g., navigate to a re-login screen), do it inside \`onError\` — once \`isRestoring\` flips, the queries fire normally and you've already lost the chance to intercept.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'persist-query-client', 'is-restoring', 'context'],
    repository: repo,
    filePath: 'packages/react-query-persist-client/src/PersistQueryClientProvider.tsx',
    url: url('packages/react-query-persist-client/src/PersistQueryClientProvider.tsx'),
  },
  {
    title: 'Mutation scope: serialize mutations with the same scope.id',
    body: `Mutations are normally fire-and-forget concurrent. \`scope.id\` lets you opt into FIFO serialization — useful when concurrent writes to the same resource would race.

\`\`\`ts
add(mutation: Mutation<any, any, any, any>): void {
  this.#mutations.add(mutation)
  const scope = scopeFor(mutation)
  if (typeof scope === 'string') {
    const scopedMutations = this.#scopes.get(scope)
    if (scopedMutations) {
      scopedMutations.push(mutation)
    } else {
      this.#scopes.set(scope, [mutation])
    }
  }
  this.notify({ type: 'added', mutation })
}

canRun(mutation: Mutation<any, any, any, any>): boolean {
  const scope = scopeFor(mutation)
  if (typeof scope === 'string') {
    const mutationsWithSameScope = this.#scopes.get(scope)
    const firstPendingMutation = mutationsWithSameScope?.find(
      (m) => m.state.status === 'pending',
    )
    return !firstPendingMutation || firstPendingMutation === mutation
  } else {
    return true
  }
}
\`\`\`

The \`runNext\` mechanism kicks the next paused-in-scope mutation when the current one settles:

\`\`\`ts
runNext(mutation): Promise<unknown> {
  const scope = scopeFor(mutation)
  if (typeof scope === 'string') {
    const foundMutation = this.#scopes.get(scope)?.find((m) => m !== mutation && m.state.isPaused)
    return foundMutation?.continue() ?? Promise.resolve()
  }
  return Promise.resolve()
}
\`\`\`

In Mutation.execute, the \`finally\` block calls \`this.#mutationCache.runNext(this)\` so the chain advances on success or failure.

The user-side recipe:

\`\`\`ts
useMutation({
  mutationFn: updateProfile,
  scope: { id: 'profile' }, // every profile mutation queues
})
\`\`\`

Without scope, two rapid calls to \`mutate({ name: 'A' })\` and \`mutate({ name: 'B' })\` race; the slower one might land last and win. With scope, B always runs after A completes — and crucially, \`onMutate\` for B doesn't run until A is done, so B's optimistic snapshot reflects A's update.

**Gotcha:** Scopes don't work across different \`useMutation\` instances unless they share the same \`scope.id\`. So a "save name" mutation in component X and a "save email" mutation in component Y both with \`scope: { id: 'profile' }\` will serialize together — exactly what you want for the same record. But forget the scope on one of them and you get out-of-order writes again.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'mutation-scope', 'serialization', 'queueing'],
    repository: repo,
    filePath: 'packages/query-core/src/mutationCache.ts',
    url: url('packages/query-core/src/mutationCache.ts'),
  },
  {
    title: 'mutationCache.subscribe: global mutation events for toasts and logging',
    body: `\`mutationCache.subscribe\` is the canonical place to attach global behaviors that should fire for every mutation — toast notifications, analytics, error logging — without polluting every \`useMutation\` call site.

The cache notifies on five event types:

\`\`\`ts
export type MutationCacheNotifyEvent =
  | NotifyEventMutationAdded
  | NotifyEventMutationRemoved
  | NotifyEventMutationObserverAdded
  | NotifyEventMutationObserverRemoved
  | NotifyEventMutationObserverOptionsUpdated
  | NotifyEventMutationUpdated
\`\`\`

The pattern most apps want is a global \`onSuccess\`/\`onError\` via the cache config:

\`\`\`ts
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, variables, context, mutation) => {
      toast.error(error.message)
    },
    onSuccess: (data, variables, context, mutation) => {
      if (mutation.options.meta?.invalidates) {
        queryClient.invalidateQueries({ queryKey: mutation.options.meta.invalidates })
      }
    },
  }),
})
\`\`\`

The \`meta.invalidates\` trick means each mutation can declare what to invalidate without duplicating \`onSuccess\` logic everywhere:

\`\`\`ts
useMutation({
  mutationFn: updateUser,
  meta: { invalidates: ['users'] },
})
\`\`\`

You can also use \`subscribe\` directly for cross-cutting concerns:

\`\`\`ts
queryClient.getMutationCache().subscribe((event) => {
  if (event.type === 'updated' && event.action.type === 'success') {
    analytics.track('mutation_succeeded', {
      key: event.mutation.options.mutationKey,
    })
  }
})
\`\`\`

**Gotcha:** Cache-level \`onError\` runs BEFORE the per-mutation \`onError\` (see Mutation.execute), and both are awaited. If your global handler throws or returns a rejected promise, it doesn't cancel the per-mutation one, but the rejection becomes an unhandled promise rejection (\`void Promise.reject(e)\`). Don't put \`await fetch()\` in the cache-level callback unless you handle errors yourself — it's tempting to do "send error to logging service" there, but a flaky logging endpoint will spam your console with unhandled rejections.

Second subtlety: the cache-level \`onSuccess\` is awaited before the per-mutation \`onSuccess\` runs, so if your global handler does \`await queryClient.invalidateQueries(...)\`, the per-mutation \`onSuccess\` will see the post-invalidation cache. This is rarely what people want — they expect their local handler to fire first. Use \`mutation.options.meta\` to declare intent in the cache handler (as shown above with \`meta.invalidates\`) instead of putting cross-cutting awaits in the global path.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'mutation-cache', 'global-handlers', 'subscribe'],
    repository: repo,
    filePath: 'packages/query-core/src/mutationCache.ts',
    url: url('packages/query-core/src/mutationCache.ts'),
  },
  {
    title: 'QueryClient.mount/unmount: refcount-based focus and online subscription',
    body: `\`QueryClientProvider\` calls \`mount()\` once and \`unmount()\` on cleanup. The QueryClient uses an internal \`#mountCount\` so multiple providers (e.g., during React 18 Strict Mode double-mounts) don't double-subscribe to focus and online events.

\`\`\`ts
mount(): void {
  this.#mountCount++
  if (this.#mountCount !== 1) return

  this.#unsubscribeFocus = focusManager.subscribe(async (focused) => {
    if (focused) {
      await this.resumePausedMutations()
      this.#queryCache.onFocus()
    }
  })
  this.#unsubscribeOnline = onlineManager.subscribe(async (online) => {
    if (online) {
      await this.resumePausedMutations()
      this.#queryCache.onOnline()
    }
  })
}

unmount(): void {
  this.#mountCount--
  if (this.#mountCount !== 0) return

  this.#unsubscribeFocus?.()
  this.#unsubscribeFocus = undefined
  this.#unsubscribeOnline?.()
  this.#unsubscribeOnline = undefined
}
\`\`\`

The provider:

\`\`\`tsx
React.useEffect(() => {
  client.mount()
  return () => {
    client.unmount()
  }
}, [client])
\`\`\`

In React Strict Mode (dev only), every effect runs mount → unmount → mount. Without the \`#mountCount\` refcount, the focus listener would be re-registered, and the cleanup would fire on the wrong subscription. The refcount makes the second mount a no-op and the first unmount a no-op.

This also enables nested QueryClientProviders (uncommon but legal — e.g., a sub-app embedding a separate cache for an isolated feature). Each \`mount()\` call increments the same client's count, and the listeners stay attached as long as at least one provider is rendered.

**Gotcha:** If you call \`new QueryClient()\` inside a render function instead of \`useState(() => new QueryClient())\` or module scope, every render creates a new instance, the provider's \`useEffect\` re-runs because \`client\` changed, you mount/unmount the new one, and the OLD client (which all your queries are still attached to) keeps living without focus/online listeners. Symptom: window-focus refetch stops working but useQuery keeps returning data. Always: \`const [client] = useState(() => new QueryClient())\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'query-client', 'mount', 'react-strict-mode'],
    repository: repo,
    filePath: 'packages/react-query/src/QueryClientProvider.tsx',
    url: url('packages/react-query/src/QueryClientProvider.tsx'),
  },
  {
    title: 'streamedQuery: AsyncIterable into useQuery without a custom Observer',
    body: `\`streamedQuery\` is a helper that turns any \`AsyncIterable\` (think OpenAI streaming completions, server-sent events, gRPC streams) into a \`queryFn\` whose chunks accumulate into the cache.

\`\`\`ts
return async (context) => {
  // ...
  let result = initialValue
  let cancelled: boolean = false as boolean
  // wire context.signal so cancellation aborts the stream
  const stream = await streamFn(streamFnContext)
  const isReplaceRefetch = isRefetch && refetchMode === 'replace'

  for await (const chunk of stream) {
    if (cancelled) break

    if (isReplaceRefetch) {
      result = reducer(result, chunk)
    } else {
      context.client.setQueryData<TData>(context.queryKey, (prev) =>
        reducer(prev === undefined ? initialValue : prev, chunk),
      )
    }
  }

  if (isReplaceRefetch && !cancelled) {
    context.client.setQueryData<TData>(context.queryKey, result)
  }
  return context.client.getQueryData(context.queryKey) ?? initialValue
}
\`\`\`

Three refetch modes pick how a re-fetch interacts with existing data:

- **\`'reset'\`** (default): clear the data on refetch start — the UI flashes empty before the stream begins to fill.
- **\`'append'\`**: keep the existing data and append new chunks. Useful for infinite chat logs.
- **\`'replace'\`**: build the new data invisibly in a local \`result\`, only \`setQueryData\` once the stream completes. Smoothest UX but you lose the streaming-as-it-arrives feel.

The \`setQueryData\` per chunk is what makes this magic — every \`useQuery\` reading the same key sees the data grow in real time. The \`fetchStatus\` stays \`'fetching'\` until the stream ends, so a global \`useIsFetching\` spinner reflects the stream's lifetime.

\`\`\`ts
useQuery({
  queryKey: ['chat', threadId],
  queryFn: streamedQuery({
    streamFn: ({ signal }) => api.streamChat(threadId, { signal }),
    refetchMode: 'append',
  }),
})
\`\`\`

**Gotcha:** The \`isRefetch\` check uses \`!!query && query.isFetched()\` — so the very first stream is treated as initial fetch, not refetch. If you want the "reset" behavior on the initial run too, you have to manually \`queryClient.removeQueries\` first. And if your stream throws partway through, \`setQueryData\` already wrote the partial data — there's no automatic rollback. Wrap the iteration in your own try/catch if partial data is invalid.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'streamed-query', 'async-iterable', 'streaming'],
    repository: repo,
    filePath: 'packages/query-core/src/streamedQuery.ts',
    url: url('packages/query-core/src/streamedQuery.ts'),
  },
  {
    title: 'QueryErrorResetBoundary: pairing react-error-boundary with throwOnError',
    body: `When a query has \`throwOnError: true\` (or \`suspense: true\`), an error in queryFn propagates to the nearest React Error Boundary. \`QueryErrorResetBoundary\` is the bridge that lets the boundary's "Try Again" button actually re-trigger the fetch.

\`\`\`ts
function createValue(): QueryErrorResetBoundaryValue {
  let isReset = false
  return {
    clearReset: () => { isReset = false },
    reset: () => { isReset = true },
    isReset: () => { return isReset },
  }
}
\`\`\`

The flag is read inside \`errorBoundaryUtils.ts\`:

\`\`\`ts
export const ensurePreventErrorBoundaryRetry = (options, errorResetBoundary, query) => {
  // ...
  if (options.suspense || options.experimental_prefetchInRender || throwOnError) {
    if (!errorResetBoundary.isReset()) {
      options.retryOnMount = false
    }
  }
}
\`\`\`

Without the boundary's \`reset()\` being called, \`retryOnMount\` is forced to \`false\` — the failed query won't retry just because a child component remounted (which would otherwise cause infinite error → remount → error loops inside \`<Suspense>\`).

The user-side wiring:

\`\`\`tsx
<QueryErrorResetBoundary>
  {({ reset }) => (
    <ErrorBoundary
      onReset={reset}
      fallbackRender={({ resetErrorBoundary }) => (
        <button onClick={resetErrorBoundary}>Try again</button>
      )}
    >
      <ChildWithSuspenseQuery />
    </ErrorBoundary>
  )}
</QueryErrorResetBoundary>
\`\`\`

When the user clicks "Try again," \`react-error-boundary\` calls the \`onReset\` you passed (which calls \`reset()\` on the QueryErrorResetBoundary value), then the ErrorBoundary unmounts the fallback and remounts the children. This time \`isReset()\` is true, \`retryOnMount\` is allowed, and the query refetches.

\`useClearResetErrorBoundary\` runs in a useEffect on every successful mount to flip \`isReset\` back to false:

\`\`\`ts
React.useEffect(() => {
  errorResetBoundary.clearReset()
}, [errorResetBoundary])
\`\`\`

**Gotcha:** Forgetting the \`onReset={reset}\` wiring is the #1 reason "Try Again" buttons silently do nothing in suspense apps. The query thinks the boundary hasn't been reset, so it doesn't retry on the remount, so the children re-throw the same cached error, so the boundary shows the fallback again. Always pair \`<ErrorBoundary onReset={reset}>\` when using \`<QueryErrorResetBoundary>\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'error-boundary', 'suspense', 'reset'],
    repository: repo,
    filePath: 'packages/react-query/src/QueryErrorResetBoundary.tsx',
    url: url('packages/react-query/src/QueryErrorResetBoundary.tsx'),
  },
  {
    title: 'ReactQueryDevtools: lazy-mounted component, separate package, prod-safe',
    body: `\`ReactQueryDevtools\` is a thin React wrapper around the framework-agnostic \`@tanstack/query-devtools\` core. The devtools instance is created once in \`useState\` and mounted into a ref'd div via an imperative API.

\`\`\`tsx
const [devtools] = React.useState(
  new TanstackQueryDevtools({
    client: queryClient,
    queryFlavor: 'React Query',
    version: '5',
    onlineManager,
    buttonPosition,
    position,
    initialIsOpen,
    errorTypes,
    styleNonce,
    shadowDOMTarget,
    hideDisabledQueries,
    theme,
  }),
)

React.useEffect(() => {
  if (ref.current) {
    devtools.mount(ref.current)
  }
  return () => {
    devtools.unmount()
  }
}, [devtools])

return <div dir="ltr" className="tsqd-parent-container" ref={ref}></div>
\`\`\`

A separate \`./production\` entry point exists so you can opt into devtools in production with a feature flag without bundling them by default. The standard pattern is:

\`\`\`tsx
const ReactQueryDevtoolsProduction = React.lazy(() =>
  import('@tanstack/react-query-devtools/build/modern/production.js').then(d => ({
    default: d.ReactQueryDevtools,
  }))
)

{showDevtools && <Suspense><ReactQueryDevtoolsProduction /></Suspense>}
\`\`\`

This keeps the devtools out of your main bundle (~50KB minified) and only loads them when an internal user toggles them on.

The devtools instance subscribes to your QueryClient and re-renders its internal UI as the cache changes — it doesn't use React internals, it has its own DOM rendering. That's why it works identically across React, Solid, Vue, Svelte: the framework-specific package is just 100 lines wrapping the same core.

**Gotcha:** \`ReactQueryDevtools\` is tree-shaken when \`process.env.NODE_ENV === 'production'\` — the production entry of the package literally exports a \`null\`-returning component:

\`\`\`ts
// Excerpt from package readme:
// In production, this component returns null, so it has no impact.
\`\`\`

So you can leave \`<ReactQueryDevtools />\` in your tree and it'll be a no-op in prod. But the import itself still adds bundle bytes — minified to a tiny stub but the dependency graph is still touched. For tightest bundles, use \`process.env.NODE_ENV === 'development' && <ReactQueryDevtools />\` and let your bundler dead-code-eliminate the whole branch.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['tanstack-query', 'devtools', 'react-query-devtools', 'lazy-load'],
    repository: repo,
    filePath: 'packages/react-query-devtools/src/ReactQueryDevtools.tsx',
    url: url('packages/react-query-devtools/src/ReactQueryDevtools.tsx'),
  },
];
