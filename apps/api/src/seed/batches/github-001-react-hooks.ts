/**
 * Batch github-001-react-hooks
 *
 * 30 React-ecosystem hook + state-management patterns. Each entry is
 * attributed to a real, popular MIT/Apache-2-licensed OSS repo. The
 * `url` always resolves to the repo root or a verifiable docs page.
 *
 * Authoring rules (see CORPUS-PLAN.md):
 * - Real attribution; no fabricated URLs
 * - Real patterns the project actually uses
 * - 200–600 word body
 * - One topic per entry
 */

import type { SeedItem } from '../types';

const repo = (owner: string, name: string) => ({ owner, name });

export const BATCH: SeedItem[] = [
  {
    title: 'useState: lazy initial state for expensive computations',
    body: `useState accepts either a value or a function. Pass a function when computing the initial state is expensive — it runs once on mount instead of on every render.

\`\`\`ts
// Bad: parseHugeJson runs every render even though only the first value is used
const [tree, setTree] = useState(parseHugeJson(input));

// Good: parseHugeJson runs only on the first render
const [tree, setTree] = useState(() => parseHugeJson(input));
\`\`\`

Same trick applies to setState callbacks. \`setCount(c => c + 1)\` is the safe pattern for any update that depends on the previous value — React batches state updates, so reading from the closure variable can give stale results.

The lazy-init function form is a common pattern in facebook/react's own examples and is documented in the React useState reference. Forgetting it doesn't break anything visibly, but it shows up as a CPU hot spot in renders that mount many components quickly (lists, virtualized tables).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'react-hooks', 'usestate', 'performance'],
    repository: repo('facebook', 'react'),
    filePath: 'packages/react/src/ReactHooks.js',
    url: 'https://github.com/facebook/react/blob/main/packages/react/src/ReactHooks.js',
  },
  {
    title: 'useEffect: cleanup function runs on every dep change, not just unmount',
    body: `The function you return from useEffect runs in two situations: when the component unmounts, AND before the effect re-runs because a dependency changed.

\`\`\`ts
useEffect(() => {
  const controller = new AbortController();
  fetch(\`/api/users/\${userId}\`, { signal: controller.signal })
    .then(r => r.json())
    .then(setUser);
  return () => controller.abort();
}, [userId]);
\`\`\`

When userId changes from "ada" to "lin", the cleanup aborts the in-flight request for "ada" BEFORE the new fetch for "lin" is started. Without the cleanup, both requests race; whichever finishes second wins, regardless of which one the user is currently looking at.

The pattern is everywhere in production React code — TanStack Query, SWR, the React docs. Forgetting it is the #1 cause of "stale data" bugs in dashboards.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'react-hooks', 'useeffect', 'abortcontroller'],
    repository: repo('facebook', 'react'),
    filePath: 'packages/react-reconciler/src/ReactFiberHooks.js',
    url: 'https://react.dev/reference/react/useEffect#fetching-data-with-effects',
  },
  {
    title: 'useMemo: when it actually helps and when it costs more than it saves',
    body: `useMemo memoises a value across renders. It's only worth using when (a) the computation is genuinely expensive, OR (b) the value is passed as a prop / dep where referential equality matters.

\`\`\`ts
// Worth it: filtering 10K items
const visible = useMemo(
  () => items.filter(i => i.matches(query)),
  [items, query],
);

// Not worth it: just an object literal
const style = useMemo(() => ({ color: 'red' }), []); // overkill
\`\`\`

The trap: every useMemo adds a comparison cost on every render — equal or not, React still walks the deps array. If the inner computation is cheap (a sort of 5 items, an object literal, a string concat), the memo overhead exceeds the saved work.

Profile first. React DevTools' "Why did this render?" or the Profiler tab shows whether a child re-rendered because its prop changed identity. If yes and the prop is computed inline, useMemo (or useCallback for a function) helps. If the parent re-renders 10 times a second from a setInterval, memoizing the props doesn't help — the parent itself is the problem.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'react-hooks', 'usememo', 'performance'],
    repository: repo('facebook', 'react'),
    filePath: 'packages/react-reconciler/src/ReactFiberHooks.js',
    url: 'https://react.dev/reference/react/useMemo',
  },
  {
    title: 'useCallback: only useful when the function is a dep or a memoized child prop',
    body: `useCallback exists to keep a function's identity stable across renders. That only matters if something downstream depends on referential equality — typically a memoized child component or an effect dependency.

\`\`\`ts
const onSubmit = useCallback((data) => {
  api.save(data);
}, []);

return <ExpensiveForm onSubmit={onSubmit} />; // memoised child
\`\`\`

If \`ExpensiveForm\` is wrapped in React.memo, a stable onSubmit lets it skip re-renders. Without React.memo on the child, useCallback does NOTHING useful — the child re-renders on every parent render anyway.

Common over-use: wrapping every event handler in useCallback because it "feels like an optimisation." It isn't — you're paying memo bookkeeping for no benefit. Reserve useCallback for the actual tight spots: handlers passed to virtualised lists, drag-and-drop libraries, and effect dependency arrays where stability matters.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'react-hooks', 'usecallback', 'performance'],
    repository: repo('facebook', 'react'),
    filePath: 'packages/react/src/ReactHooks.js',
    url: 'https://react.dev/reference/react/useCallback',
  },
  {
    title: 'useReducer: when state has multiple independent fields that update together',
    body: `Reach for useReducer when several pieces of state always change in lockstep, OR when the next state depends on the previous in a non-trivial way (form wizards, undo stacks, async-loading state machines).

\`\`\`ts
type State = { status: 'idle' | 'loading' | 'success' | 'error'; data?: User; error?: string };
type Action =
  | { type: 'fetch' }
  | { type: 'success'; data: User }
  | { type: 'error'; message: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'fetch':   return { status: 'loading' };
    case 'success': return { status: 'success', data: action.data };
    case 'error':   return { status: 'error', error: action.message };
  }
}

const [state, dispatch] = useReducer(reducer, { status: 'idle' });
\`\`\`

Compare to managing four useState calls separately — every transition has to remember to clear the old fields, and bugs creep in when one of them gets forgotten. The reducer encodes the state machine in one place; impossible states (status=success AND error=set) become impossible to express.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'react-hooks', 'usereducer', 'state-machine'],
    repository: repo('facebook', 'react'),
    filePath: 'packages/react/src/ReactHooks.js',
    url: 'https://react.dev/reference/react/useReducer',
  },
  {
    title: 'useRef: DOM refs vs the mutable-value escape hatch',
    body: `useRef has two completely different jobs. Recognising which one you're using saves a lot of debugging.

Job 1 — get a handle to a DOM node:
\`\`\`ts
const inputRef = useRef<HTMLInputElement>(null);
useEffect(() => { inputRef.current?.focus(); }, []);
return <input ref={inputRef} />;
\`\`\`

Job 2 — store a mutable value that survives across renders WITHOUT triggering re-renders when it changes:
\`\`\`ts
const renderCount = useRef(0);
useEffect(() => { renderCount.current += 1; });
\`\`\`

The thing to internalise: changing \`ref.current\` is invisible to React. The render function does NOT re-run. That's exactly what you want for instance variables (timer ids, websocket handles, the previous value of a prop) and exactly what you DO NOT want for derived display state.

Anti-pattern: storing a value the UI displays in a ref and then trying to remember to setState alongside it. If the UI shows it, it's state. Use useState.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'react-hooks', 'useref', 'dom-refs'],
    repository: repo('facebook', 'react'),
    filePath: 'packages/react/src/ReactHooks.js',
    url: 'https://react.dev/reference/react/useRef',
  },
  {
    title: 'useContext: the re-render trap and how shadcn/ui sidesteps it',
    body: `Every consumer of a context re-renders when the context value changes. If your context holds an object and you spread/recreate it on every parent render, EVERY consumer re-renders on every parent render — a silent perf disaster.

\`\`\`ts
// Bad: new object identity on every render
<MyContext.Provider value={{ user, theme }}>

// Better: stable identity
const value = useMemo(() => ({ user, theme }), [user, theme]);
<MyContext.Provider value={value}>
\`\`\`

For state that changes frequently and is consumed by many components (like a current selection in a dropdown), splitting into multiple contexts — one for read-only static config, another for the changing state — limits which consumers re-render.

shadcn/ui's primitives (Dialog, Select, Tabs) follow this pattern: a stable provider with the open/close API and a separate, narrowly-scoped state context. That's why dropping a Tabs in a frequently-rendering parent doesn't kill performance.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'react-hooks', 'usecontext', 'performance'],
    repository: repo('shadcn-ui', 'ui'),
    filePath: 'apps/www/registry/default/ui/tabs.tsx',
    url: 'https://github.com/shadcn-ui/ui/blob/main/apps/www/registry/default/ui/tabs.tsx',
  },
  {
    title: 'useLayoutEffect vs useEffect: when the timing matters',
    body: `useEffect fires AFTER the browser paints. useLayoutEffect fires BEFORE the browser paints — synchronously after DOM mutations.

99% of the time you want useEffect. The browser paints the new state, the user sees it, then your effect runs (subscriptions, fetches, logging).

Reach for useLayoutEffect ONLY when you need to read or write the DOM AND have it reflected in the same paint frame. Classic case: measuring an element's size and using that to position a tooltip:

\`\`\`ts
useLayoutEffect(() => {
  const rect = anchorRef.current!.getBoundingClientRect();
  setTooltipTop(rect.bottom + 8);
}, [open]);
\`\`\`

If you used useEffect here, the user would see the tooltip render at (0, 0) for a single frame before jumping to its computed position. With useLayoutEffect, the position is computed before paint, so the user only ever sees the final placement.

The cost: useLayoutEffect blocks the browser's paint until your effect finishes. Don't put network requests or anything slow in there.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'react-hooks', 'uselayouteffect', 'rendering'],
    repository: repo('facebook', 'react'),
    filePath: 'packages/react/src/ReactHooks.js',
    url: 'https://react.dev/reference/react/useLayoutEffect',
  },
  {
    title: 'useTransition: keep the UI responsive during expensive state updates',
    body: `useTransition marks a state update as "non-urgent." React keeps the previous UI interactive while the slow update renders in the background, then swaps in the new tree atomically.

\`\`\`ts
const [isPending, startTransition] = useTransition();
const [filter, setFilter] = useState('');

return (
  <input
    value={filter}
    onChange={(e) => {
      // Urgent: keep the input responsive
      const v = e.target.value;
      // Non-urgent: filter a 50K-row table
      startTransition(() => setFilter(v));
    }}
  />
);
\`\`\`

The input updates instantly because React doesn't wait for the (slow) re-render of the filtered list. \`isPending\` lets you show a subtle loading indicator without blocking input.

Without useTransition, typing into the input would feel laggy — every keystroke would trigger a synchronous re-render of the entire filtered list. With it, only the input update is urgent; the list update yields to incoming events.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'react-hooks', 'usetransition', 'concurrent'],
    repository: repo('facebook', 'react'),
    filePath: 'packages/react/src/ReactHooks.js',
    url: 'https://react.dev/reference/react/useTransition',
  },
  {
    title: 'useDeferredValue: stale-while-revalidate for derived UI',
    body: `useDeferredValue takes a value and returns a possibly-stale version of it that React updates "when there's time." It's the read-side complement to useTransition — instead of marking the WRITE as non-urgent, you mark the READ as deferrable.

\`\`\`ts
const [query, setQuery] = useState('');
const deferredQuery = useDeferredValue(query);

return (
  <>
    <input value={query} onChange={(e) => setQuery(e.target.value)} />
    {/* Heavy child renders against deferredQuery, not query */}
    <SearchResults query={deferredQuery} />
  </>
);
\`\`\`

The user types fast, the input stays responsive, and the SearchResults component lags one render behind. Crucially, the OLD results stay on screen while the new ones compute — no flash of empty state.

This pattern shows up in production at Vercel + Linear, and the React docs ship it as the canonical pattern for incremental search UIs.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'react-hooks', 'usedeferredvalue', 'concurrent'],
    repository: repo('facebook', 'react'),
    filePath: 'packages/react/src/ReactHooks.js',
    url: 'https://react.dev/reference/react/useDeferredValue',
  },
  {
    title: 'useSyncExternalStore: the React 18+ way to bind external stores',
    body: `Before React 18, libraries like Redux and Zustand used "tearing-prone" subscription patterns to integrate with React. useSyncExternalStore is the official, concurrent-safe API for it.

\`\`\`ts
function useWindowWidth() {
  return useSyncExternalStore(
    (callback) => {
      window.addEventListener('resize', callback);
      return () => window.removeEventListener('resize', callback);
    },
    () => window.innerWidth,         // client snapshot
    () => 0,                         // server snapshot (SSR)
  );
}
\`\`\`

Three args: subscribe (return an unsubscribe), getSnapshot (current value), getServerSnapshot (for SSR — must be deterministic).

Zustand's React adapter uses this internally. The reason it matters: under concurrent rendering, React can interrupt and restart a render. Without useSyncExternalStore, two children reading from the same external store could see different values within a single commit (tearing). The hook guarantees they see a consistent snapshot.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'react-hooks', 'usesyncexternalstore', 'state-management'],
    repository: repo('pmndrs', 'zustand'),
    filePath: 'src/react.ts',
    url: 'https://github.com/pmndrs/zustand/blob/main/src/react.ts',
  },
  {
    title: 'useId: stable form labels in SSR-rendered components',
    body: `useId generates an id that's stable across server and client. Use it for form-label associations and aria-labelledby links — anywhere you'd otherwise hand-roll a unique string.

\`\`\`ts
function PasswordField() {
  const id = useId();
  return (
    <>
      <label htmlFor={id}>Password</label>
      <input id={id} type="password" />
    </>
  );
}
\`\`\`

Multiple instances on the same page get distinct ids. SSR + hydration produces matching ids on both sides — no "id mismatch" hydration warning.

Don't use useId for keys in a list (it's per-component, not per-item — every item would get the same id). And don't use it for css selectors (the format is intentionally opaque).

Radix UI's primitives use useId everywhere internally — that's how Dialog, Tooltip, and Popover wire up their aria-* references without callers having to provide ids.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'react-hooks', 'useid', 'accessibility', 'ssr'],
    repository: repo('radix-ui', 'primitives'),
    filePath: 'packages/react/id/src/id.tsx',
    url: 'https://github.com/radix-ui/primitives/blob/main/packages/react/id/src/id.tsx',
  },
  {
    title: 'useImperativeHandle: the escape hatch for forwarding methods',
    body: `useImperativeHandle lets a parent component call methods on a child via a ref. It's the React equivalent of jQuery's \`$('#input').focus()\` — useful, but a sign that data flow has been inverted.

\`\`\`ts
type FormHandle = { reset(): void; submit(): Promise<void> };

const Form = forwardRef<FormHandle, Props>((props, ref) => {
  useImperativeHandle(ref, () => ({
    reset: () => setValues(initial),
    submit: async () => { /* ... */ },
  }), [initial]);
  // ... render ...
});

// Parent
const formRef = useRef<FormHandle>(null);
return <button onClick={() => formRef.current?.reset()}>Reset</button>;
\`\`\`

Reach for it ONLY when the child has imperative side effects the parent needs to trigger — focusing an input, opening a modal, scrolling a virtualised list. For everything else, lift the state up; declarative props are easier to reason about.

react-hook-form uses this pattern for the imperative \`reset()\` and \`setFocus()\` methods on the form ref.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'react-hooks', 'useimperativehandle', 'refs'],
    repository: repo('react-hook-form', 'react-hook-form'),
    filePath: 'src/useForm.ts',
    url: 'https://github.com/react-hook-form/react-hook-form/blob/master/src/useForm.ts',
  },
  {
    title: 'use(): the React 19 hook for unwrapping promises in render',
    body: `React 19 added \`use()\` — a hook that suspends the render until a promise resolves, then returns the resolved value. It works with Suspense out of the box.

\`\`\`ts
import { use, Suspense } from 'react';

function UserProfile({ userPromise }: { userPromise: Promise<User> }) {
  const user = use(userPromise);
  return <div>{user.name}</div>;
}

// Parent passes the promise; doesn't await it
<Suspense fallback={<Spinner />}>
  <UserProfile userPromise={fetchUser(id)} />
</Suspense>
\`\`\`

Unlike other hooks, \`use\` can be called inside conditionals and loops. It's the bridge between React Server Components (which return promises directly) and the rendering pipeline.

Important constraint: the promise needs to be referentially stable across renders, otherwise you'll start a fresh request on every commit. Wrap it in a cache (React.cache for RSC, or a memoised constructor in client components).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'react-hooks', 'use', 'react-19', 'suspense'],
    repository: repo('facebook', 'react'),
    filePath: 'packages/react/src/ReactHooks.js',
    url: 'https://react.dev/reference/react/use',
  },
  {
    title: 'useDebugValue: label custom hooks in React DevTools',
    body: `useDebugValue surfaces a value next to a custom hook's name in React DevTools. Pure dev-only — has zero effect on production behaviour.

\`\`\`ts
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  useDebugValue(isOnline ? 'Online' : 'Offline');
  return isOnline;
}
\`\`\`

In DevTools the hook now reads "OnlineStatus: Online" instead of just "OnlineStatus." For one-line hooks this is overkill, but for hooks that wrap complex state (TanStack Query's useQuery, react-hook-form's useForm), it makes the inspection panel useful.

Optional second arg is a formatter — useful when the value itself is expensive to compute and you only want the cost paid when DevTools is actually open.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'react-hooks', 'usedebugvalue', 'devtools'],
    repository: repo('facebook', 'react'),
    filePath: 'packages/react/src/ReactHooks.js',
    url: 'https://react.dev/reference/react/useDebugValue',
  },
  {
    title: 'SWR: useSWR for data fetching with built-in cache + revalidation',
    body: `SWR ("stale-while-revalidate") returns cached data immediately, then refetches in the background and updates the UI when the new data arrives. The key shape is intentionally simple: \`useSWR(key, fetcher)\`.

\`\`\`ts
import useSWR from 'swr';

function Profile() {
  const { data, error, isLoading } = useSWR(
    \`/api/user/\${id}\`,
    (url) => fetch(url).then(r => r.json()),
  );
  if (error) return <ErrorBox />;
  if (isLoading) return <Skeleton />;
  return <div>{data.name}</div>;
}
\`\`\`

The cache is keyed by the first arg — pass null to skip the request entirely (handy for "wait until id is known"). Multiple components calling useSWR with the same key share one request and one cache entry.

Built-in revalidation triggers: window focus, network reconnect, configurable intervals. Manual: \`mutate()\` (global) or the \`mutate\` returned by the hook (scoped to this key).

SWR is by Vercel, used in next.js's own dashboard. The competing library is TanStack Query — more features, bigger surface area, slightly steeper learning curve.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'swr', 'data-fetching', 'caching'],
    repository: repo('vercel', 'swr'),
    filePath: 'src/index/use-swr.ts',
    url: 'https://github.com/vercel/swr/blob/main/src/index/use-swr.ts',
  },
  {
    title: 'SWR mutate: optimistic updates with rollback on error',
    body: `mutate is SWR's escape hatch for changing the cache without a refetch. The "optimistic UI" pattern: update the cache, fire the mutation, roll back if it fails.

\`\`\`ts
const { data, mutate } = useSWR(\`/api/posts/\${id}\`, fetcher);

async function likePost() {
  // Optimistically bump the like count
  await mutate(
    async (current) => {
      await fetch(\`/api/posts/\${id}/like\`, { method: 'POST' });
      return { ...current, likes: current.likes + 1 };
    },
    {
      optimisticData: { ...data, likes: data.likes + 1 },
      rollbackOnError: true,
      revalidate: false,
    },
  );
}
\`\`\`

The UI updates instantly to the optimistic value; if the POST fails, SWR rolls back to the previous cache state automatically. \`revalidate: false\` skips the implicit refetch (since the mutation function returned the new value).

This is the same pattern Linear and Vercel's own dashboard use for instant-feeling UI on slow networks.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'swr', 'optimistic-update', 'mutation'],
    repository: repo('vercel', 'swr'),
    filePath: 'src/_internal/utils/mutate.ts',
    url: 'https://github.com/vercel/swr/blob/main/src/_internal/utils/mutate.ts',
  },
  {
    title: 'TanStack Query: useQuery basics — cache key, fetcher, stale time',
    body: `TanStack Query (formerly react-query) uses a queryKey + queryFn pair. The key is what the cache is keyed by; the fn is how to fetch.

\`\`\`ts
import { useQuery } from '@tanstack/react-query';

const { data, isLoading, error } = useQuery({
  queryKey: ['user', userId],
  queryFn: () => fetch(\`/api/users/\${userId}\`).then(r => r.json()),
  staleTime: 60_000,            // consider data fresh for 60s
  gcTime: 5 * 60_000,           // keep in cache 5min after last unmount
});
\`\`\`

The queryKey can be any serializable value. Arrays are conventional because they sort/match deterministically: \`['posts']\`, \`['posts', { status: 'published' }]\`, \`['posts', postId]\`.

staleTime defaults to 0 — every observer change refetches immediately. Bumping it to 60s avoids hammering the server when the user toggles between tabs that read the same data.

Compared to SWR: bigger API surface (queries, mutations, infinite queries, suspense, hydration helpers), explicit query keys (vs SWR's URL-as-key default), and a devtools panel.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'tanstack-query', 'data-fetching', 'caching'],
    repository: repo('TanStack', 'query'),
    filePath: 'packages/react-query/src/useQuery.ts',
    url: 'https://github.com/TanStack/query/blob/main/packages/react-query/src/useQuery.ts',
  },
  {
    title: 'TanStack Query: invalidateQueries vs setQueryData',
    body: `Two ways to push fresh data into the cache after a mutation. Pick based on whether you trust the mutation response.

invalidateQueries marks every cached entry whose key matches the prefix as "stale" — TanStack Query refetches them on next render or focus.

\`\`\`ts
queryClient.invalidateQueries({ queryKey: ['posts'] });
\`\`\`

setQueryData writes the value directly into the cache, no network round-trip. Use when your mutation response is the new authoritative value.

\`\`\`ts
queryClient.setQueryData(['post', postId], updatedPost);
\`\`\`

Common pattern: setQueryData for the single entity the user just edited (snappy), invalidateQueries(['posts']) for the list view (refresh in background). User sees the new entity instantly; the list catches up on its next render.

For optimistic updates, combine the two: setQueryData on mutate, then invalidateQueries on settle (success or error) to reconcile with the server's view.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'tanstack-query', 'cache-invalidation', 'mutation'],
    repository: repo('TanStack', 'query'),
    filePath: 'packages/query-core/src/queryClient.ts',
    url: 'https://github.com/TanStack/query/blob/main/packages/query-core/src/queryClient.ts',
  },
  {
    title: 'TanStack Query: optimistic update pattern with onMutate / onError / onSettled',
    body: `The full optimistic-update lifecycle in TanStack Query has three callbacks: snapshot before, write through, reconcile after.

\`\`\`ts
useMutation({
  mutationFn: toggleLike,
  onMutate: async (vars) => {
    await queryClient.cancelQueries({ queryKey: ['post', vars.id] });
    const prev = queryClient.getQueryData(['post', vars.id]);
    queryClient.setQueryData(['post', vars.id], (old: Post) => ({
      ...old,
      liked: !old.liked,
      likes: old.liked ? old.likes - 1 : old.likes + 1,
    }));
    return { prev };
  },
  onError: (_err, vars, ctx) => {
    queryClient.setQueryData(['post', vars.id], ctx?.prev);
  },
  onSettled: (_data, _err, vars) => {
    queryClient.invalidateQueries({ queryKey: ['post', vars.id] });
  },
});
\`\`\`

Why cancelQueries first: an in-flight refetch could land AFTER your optimistic write and overwrite it with stale data. Cancelling avoids the race.

The snapshot in onMutate goes into the context object, which onError can use to roll back. onSettled fires for both success and error — that's where you re-sync with the server.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'tanstack-query', 'optimistic-update', 'race-condition'],
    repository: repo('TanStack', 'query'),
    filePath: 'packages/react-query/src/useMutation.ts',
    url: 'https://github.com/TanStack/query/blob/main/packages/react-query/src/useMutation.ts',
  },
  {
    title: 'Zustand: create() store and selector subscriptions',
    body: `Zustand is a 1KB state store. The whole API is \`create()\` plus selector hooks.

\`\`\`ts
import { create } from 'zustand';

type State = { count: number; inc: () => void };

const useCount = create<State>((set) => ({
  count: 0,
  inc: () => set((s) => ({ count: s.count + 1 })),
}));

function Counter() {
  // Subscribe to the slice you care about — re-renders only when count changes
  const count = useCount((s) => s.count);
  const inc = useCount((s) => s.inc);
  return <button onClick={inc}>{count}</button>;
}
\`\`\`

The selector function is the secret. Zustand re-renders the component only when the selected slice changes (default comparison is Object.is). Components selecting different slices of the same store don't fight each other for renders.

For object slices, pass an explicit equality fn (e.g. \`shallow\` from zustand/shallow) to avoid re-rendering when the object identity changes but the contents don't.

Compared to Redux: no providers, no actions, no boilerplate. Compared to Context: built-in selector subscriptions instead of "every consumer re-renders on any change."`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'zustand', 'state-management'],
    repository: repo('pmndrs', 'zustand'),
    filePath: 'src/vanilla.ts',
    url: 'https://github.com/pmndrs/zustand/blob/main/src/vanilla.ts',
  },
  {
    title: 'Zustand persist middleware: localStorage hydration with version migrations',
    body: `Persist middleware mirrors a Zustand store into localStorage (or any storage interface). Restored automatically on next page load.

\`\`\`ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useSettings = create(
  persist<Settings>(
    (set) => ({ theme: 'system', density: 'comfortable', setTheme: ... }),
    {
      name: 'app-settings',          // localStorage key
      version: 2,                    // bump when shape changes
      migrate: (persisted, version) => {
        if (version < 2) {
          // upgrade from v1 → v2
          return { ...persisted, density: 'comfortable' };
        }
        return persisted as Settings;
      },
    },
  ),
);
\`\`\`

The version + migrate combo matters once you ship: existing users have an old serialised shape in their localStorage. Without migrate, your selector accesses missing fields and crashes; with migrate, you transform the old shape into the new one.

For SSR (Next.js), use \`onRehydrateStorage\` to defer reads until after hydration — otherwise the server-rendered HTML and the localStorage-derived client state mismatch and React throws a hydration warning.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'zustand', 'persistence', 'localstorage'],
    repository: repo('pmndrs', 'zustand'),
    filePath: 'src/middleware/persist.ts',
    url: 'https://github.com/pmndrs/zustand/blob/main/src/middleware/persist.ts',
  },
  {
    title: 'Jotai: atom() for primitive state, atom-with-derive for computed values',
    body: `Jotai breaks state into atoms — small, independently-subscribable units. Components read the atoms they care about; React re-renders only those readers.

\`\`\`ts
import { atom, useAtom } from 'jotai';

const countAtom = atom(0);
const doubledAtom = atom((get) => get(countAtom) * 2);

function Counter() {
  const [count, setCount] = useAtom(countAtom);
  const [doubled] = useAtom(doubledAtom);
  return (
    <>
      <button onClick={() => setCount((c) => c + 1)}>{count}</button>
      <span>doubled: {doubled}</span>
    </>
  );
}
\`\`\`

Atoms compose. A derived atom's getter receives a \`get\` function — call it on other atoms to read them; the derived atom recomputes whenever any of its dependencies change.

vs Zustand: Jotai is bottom-up (many small atoms, composed) where Zustand is top-down (one store, many slices). Jotai shines for fine-grained, locally-scoped state (form fields, tabs, hover states). Zustand shines for app-wide stores that many components share.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'jotai', 'state-management', 'atoms'],
    repository: repo('pmndrs', 'jotai'),
    filePath: 'src/vanilla/atom.ts',
    url: 'https://github.com/pmndrs/jotai/blob/main/src/vanilla/atom.ts',
  },
  {
    title: 'react-hook-form: useForm + register vs Controller',
    body: `react-hook-form has two ways to bind inputs: \`register\` for native inputs, \`Controller\` for controlled third-party components.

register is uncontrolled — it attaches a ref + change listener to the input directly:
\`\`\`ts
const { register, handleSubmit } = useForm<Form>();
return (
  <form onSubmit={handleSubmit(onSubmit)}>
    <input {...register('email', { required: true })} />
  </form>
);
\`\`\`

The hook stores values in a ref, NOT in React state, so typing into a 20-field form doesn't trigger 20 component re-renders.

Controller wraps a component that needs a controlled \`value\` + \`onChange\` (most UI library inputs):
\`\`\`ts
<Controller
  name="country"
  control={control}
  render={({ field }) => <Select {...field} options={countries} />}
/>
\`\`\`

Use register first; fall back to Controller only when the input library can't accept a ref directly. The performance difference matters: a 50-field form with Controller everywhere re-renders meaningfully more than the same form with register.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'react-hook-form', 'forms', 'performance'],
    repository: repo('react-hook-form', 'react-hook-form'),
    filePath: 'src/useForm.ts',
    url: 'https://github.com/react-hook-form/react-hook-form/blob/master/src/useForm.ts',
  },
  {
    title: 'Next.js App Router: server components by default, client components opt-in',
    body: `Every component in app/ is a React Server Component unless it (or an ancestor in the same render tree) declares "use client". Server components run on the server only — they can read files, query a database, fetch with credentials — and ship zero JS for their own logic.

\`\`\`ts
// app/dashboard/page.tsx — Server Component (default)
import { db } from '@/lib/db';

export default async function DashboardPage() {
  const stats = await db.dashboard.findMany();
  return <DashboardView stats={stats} />;
}

// components/DashboardView.tsx — Client Component
'use client';
export function DashboardView({ stats }: { stats: Stat[] }) {
  const [filter, setFilter] = useState('');
  return /* interactive UI */;
}
\`\`\`

Push the "use client" boundary as low as possible. A page can stay a server component and import a client InteractiveForm; only the form ships JS to the browser. The classic anti-pattern is slapping "use client" on the page to fix a child — that pulls every server-only ancestor's data fetching into the client.

Important constraint: server components can't use hooks (useState, useEffect, useContext) or browser APIs. The compiler flags violations.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'react-server-components', 'app-router'],
    repository: repo('vercel', 'next.js'),
    filePath: 'packages/next/src/server/app-render/app-render.tsx',
    url: 'https://nextjs.org/docs/app/building-your-application/rendering/server-components',
  },
  {
    title: 'Next.js: revalidatePath vs revalidateTag for cache invalidation',
    body: `Both invalidate cached fetches in Next.js's data layer; they differ in scope.

revalidatePath('/posts/123') invalidates every cached fetch made while rendering that exact path. Use after a mutation that affects one route.

\`\`\`ts
'use server';
export async function publishPost(id: string) {
  await db.post.update({ where: { id }, data: { status: 'published' } });
  revalidatePath(\`/posts/\${id}\`);
}
\`\`\`

revalidateTag('posts') invalidates every cached fetch tagged with that string. Tag the fetches when you call them:

\`\`\`ts
const posts = await fetch('https://api.example.com/posts', {
  next: { tags: ['posts'] },
}).then(r => r.json());
\`\`\`

Then:
\`\`\`ts
revalidateTag('posts');
\`\`\`

Tags are the better default for content that's read across many pages — invalidating one tag refreshes every page that used the tagged fetch, regardless of where they live in the route tree. revalidatePath is sharper when you know exactly which page changed.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'cache', 'revalidate', 'app-router'],
    repository: repo('vercel', 'next.js'),
    filePath: 'packages/next/src/server/web/spec-extension/revalidate-path.ts',
    url: 'https://nextjs.org/docs/app/api-reference/functions/revalidatePath',
  },
  {
    title: 'Next.js Server Actions: progressive enhancement for forms',
    body: `Server actions let a form submit handler run on the server with zero client JS — the form works even if React hasn't hydrated yet.

\`\`\`ts
// app/posts/new/page.tsx
import { db } from '@/lib/db';

async function createPost(formData: FormData) {
  'use server';
  await db.post.create({
    data: {
      title: formData.get('title') as string,
      body: formData.get('body') as string,
    },
  });
  redirect('/posts');
}

export default function NewPost() {
  return (
    <form action={createPost}>
      <input name="title" required />
      <textarea name="body" required />
      <button type="submit">Publish</button>
    </form>
  );
}
\`\`\`

The "use server" directive marks the function as a server action. Next.js compiles it into an RPC endpoint; the form's action attribute points at that endpoint. If JS hasn't loaded, the browser does a regular form POST — graceful degradation built in.

Add useFormStatus to display a pending state while the action runs, useActionState for inline validation feedback. Both are React 19 hooks designed specifically for the server-action pattern.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'server-actions', 'forms', 'progressive-enhancement'],
    repository: repo('vercel', 'next.js'),
    filePath: 'packages/next/src/server/app-render/use-cache.ts',
    url: 'https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations',
  },
  {
    title: 'shadcn/ui cn() utility: tailwind-merge + clsx for conditional classes',
    body: `Every shadcn/ui component uses a one-liner \`cn()\` helper to merge Tailwind classes. Two libraries combined: clsx for conditional logic, tailwind-merge for resolving conflicts.

\`\`\`ts
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
\`\`\`

Why both? clsx alone joins arrays of conditional class names. But Tailwind has many classes that conflict (\`p-2\` and \`p-4\`, \`text-sm\` and \`text-lg\`) — joining them produces broken output. tailwind-merge knows the conflict groups and keeps only the LAST occurrence of each, which is what you want when an override prop comes in last.

\`\`\`ts
<Button className={cn(
  'h-10 px-4 text-sm',
  isPrimary && 'bg-primary text-primary-foreground',
  className,                     // caller's override wins
)} />
\`\`\`

Without tailwind-merge, a caller passing \`className="px-6"\` would render with both \`px-4\` and \`px-6\` — and the cascade would pick whichever appeared later in the stylesheet, not the one passed in. With it, \`px-6\` always wins.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'tailwind', 'shadcn', 'utility'],
    repository: repo('shadcn-ui', 'ui'),
    filePath: 'apps/www/lib/utils.ts',
    url: 'https://github.com/shadcn-ui/ui/blob/main/apps/www/lib/utils.ts',
  },
  {
    title: 'React.memo: shallow prop comparison + the children gotcha',
    body: `React.memo wraps a component so it only re-renders when its props change (shallow comparison by default). Useful for expensive children that re-render too often because their parent renders frequently.

\`\`\`ts
const ExpensiveTable = React.memo(function ExpensiveTable({ rows }: { rows: Row[] }) {
  return /* ... */;
});
\`\`\`

The trap: \`children\` is a prop. If a parent passes JSX literals as children, the children's identity changes on every parent render, defeating the memo:

\`\`\`ts
// Defeats memo — new <span> identity every render
<ExpensiveTable>
  <span>Header</span>
</ExpensiveTable>
\`\`\`

Two ways out: (a) don't pass children to a memoised component, (b) memoise the children too at the call site.

Same trap with inline functions and inline objects. \`onClick={() => doThing()}\` and \`style={{ color: 'red' }}\` produce new identities every render. Wrap them in useCallback/useMemo, or move them out of the component if they don't depend on state.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'react-memo', 'performance', 'rendering'],
    repository: repo('facebook', 'react'),
    filePath: 'packages/react/src/ReactMemo.js',
    url: 'https://react.dev/reference/react/memo',
  },
  {
    title: 'Suspense + ErrorBoundary: the two halves of declarative loading/error UI',
    body: `Suspense handles components that "throw" promises (typically data-fetching components or React.lazy chunks). ErrorBoundary handles components that throw errors. They compose into a single declarative loading/error pipeline.

\`\`\`tsx
<ErrorBoundary fallback={<ErrorPanel />}>
  <Suspense fallback={<Skeleton />}>
    <UserDashboard userId={id} />
  </Suspense>
</ErrorBoundary>
\`\`\`

While UserDashboard is fetching: Skeleton shows. If the fetch resolves: UserDashboard renders. If the fetch (or any synchronous render code) throws: ErrorBoundary's fallback shows.

ErrorBoundary itself isn't built into React — you write a class component with componentDidCatch + getDerivedStateFromError, OR use react-error-boundary's <ErrorBoundary> + useErrorBoundary().

The win is that loading and error states aren't sprinkled through every leaf component. The whole subtree gets one Suspense wrapper, one ErrorBoundary wrapper, and the leaves can stay focused on their happy path.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'suspense', 'error-boundary', 'react-19'],
    repository: repo('bvaughn', 'react-error-boundary'),
    filePath: 'src/ErrorBoundary.ts',
    url: 'https://github.com/bvaughn/react-error-boundary/blob/master/src/ErrorBoundary.ts',
  },
];
