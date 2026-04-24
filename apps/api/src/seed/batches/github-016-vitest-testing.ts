/**
 * Batch github-016-vitest-testing
 *
 * 25 Vitest + modern JS testing patterns drawn from the actual source
 * of vitest-dev/vitest (v5.0.0-beta.1). Each entry is attributed to a
 * real file in the repo. The `url` always resolves to the canonical
 * file on main.
 *
 * Authoring rules (see CORPUS-PLAN.md):
 * - Real attribution; no fabricated URLs
 * - Real patterns the project actually implements
 * - 250-450 word body
 * - One topic per entry
 * - WHAT + HOW (real code) + WHY + non-obvious gotcha
 */

import type { SeedItem } from '../types';

const repo = { owner: 'vitest-dev', name: 'vitest' };
const baseUrl = 'https://github.com/vitest-dev/vitest/blob/main';

export const BATCH: SeedItem[] = [
  {
    title: 'configDefaults: every default Vitest applies before reading your vitest.config.ts',
    body: `Vitest's runtime defaults are exported as a frozen object from \`packages/vitest/src/defaults.ts\`. Anything you don't set in \`vitest.config.ts\` falls back to one of these values, so reading this file once tells you exactly what an empty config gives you.

\`\`\`ts
export const configDefaults = Object.freeze({
  allowOnly: !isCI,
  isolate: true,
  watch: !isCI && process.stdin.isTTY && !isAgent,
  globals: false,
  environment: 'node',
  clearMocks: false,
  restoreMocks: false,
  mockReset: false,
  include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
  exclude: ['**/node_modules/**', '**/.git/**'],
  teardownTimeout: 10000,
  forceRerunTriggers: ['**/package.json/**', '**/{vitest,vite}.config.*/**'],
  reporters: [],
  maxConcurrency: 5,
  slowTestThreshold: 300,
  fakeTimers: { loopLimit: 10_000, shouldClearNativeTimers: true },
  // ...
})
\`\`\`

Things people get wrong because they don't read this:

\`globals: false\` — \`describe\`/\`it\`/\`expect\` are NOT on the global by default. You either import them from \`'vitest'\` or set \`globals: true\` and add \`"types": ["vitest/globals"]\` to tsconfig. The Jest-style "just write \`it()\`" only works in the latter case.

\`environment: 'node'\` — JSDOM is opt-in (\`environment: 'jsdom'\`) per file via \`// @vitest-environment jsdom\` or globally in config. Forgetting this and then calling \`document.createElement\` is the #1 confused-newcomer error.

\`watch\` is \`true\` in TTY locally and \`false\` in CI — Vitest detects \`process.env.CI\`. So \`vitest\` runs in watch on your laptop and one-shot in GitHub Actions, no flag needed.

\`clearMocks: false\` and \`restoreMocks: false\` — mock state persists across tests by default. Either flip these globally or call \`vi.clearAllMocks()\`/\`vi.restoreAllMocks()\` in \`beforeEach\` yourself. The difference matters: \`clear\` resets call history but keeps implementations; \`restore\` puts the original (pre-spy) function back; \`reset\` wipes implementations to \`() => undefined\`.

\`maxConcurrency: 5\` — only relevant when you mark tests \`.concurrent\`. Within a file, concurrent tests are batched 5 at a time.

\`forceRerunTriggers\` includes \`vitest.config.*\` and \`package.json\` — touching either invalidates the in-memory test graph and reruns everything. Useful to know if you're debugging "why did all my watch-mode tests just rerun".`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'config', 'defaults', 'environment', 'globals'],
    repository: repo,
    filePath: 'packages/vitest/src/defaults.ts',
    url: `${baseUrl}/packages/vitest/src/defaults.ts`,
  },
  {
    title: 'globals: true wires describe/it/expect onto globalThis via registerApiGlobally',
    body: `Setting \`globals: true\` in \`vitest.config.ts\` doesn't magically inject anything; it tells the runtime to call \`registerApiGlobally()\` before your test files load. The list of names that get assigned is hard-coded in \`packages/vitest/src/constants.ts\`.

\`\`\`ts
// packages/vitest/src/integrations/globals.ts
export function registerApiGlobally(): void {
  globalApis.forEach((api) => {
    globalThis[api] = index[api]
  })
}

// packages/vitest/src/constants.ts
export const globalApis: string[] = [
  'suite', 'test', 'describe', 'it',
  'chai', 'expect', 'assert',
  'expectTypeOf', 'assertType',
  'vitest', 'vi',
  'beforeAll', 'afterAll', 'beforeEach', 'afterEach',
  'onTestFinished', 'onTestFailed',
  'aroundEach', 'aroundAll',
]
\`\`\`

So \`globals: true\` is a literal \`globalThis['describe'] = describe\` for each name above. Anything not in that list — \`vitest\`'s \`expectTypeOf\`, \`bench\`, custom matchers — still requires an import.

Two practical consequences:

1. **TypeScript needs help.** Globals exist at runtime but TS doesn't know about them. Add \`"types": ["vitest/globals"]\` (note: NOT \`vitest\`) to your tsconfig's \`compilerOptions.types\`. Without that, every \`describe\` is a red squiggle even though tests run fine.

2. **Migration from Jest is two changes, not one.** Set \`globals: true\` AND configure aliasing if you're calling \`jest.fn()\` anywhere — Vitest's name is \`vi\`, not \`jest\`. There is no \`jest\` global even with \`globals: true\`. Either find/replace \`jest\` → \`vi\`, or shim it: \`globalThis.jest = vi\` in a setup file.

The \`onTestFinished\` and \`onTestFailed\` entries are easy to miss — these are per-test cleanup hooks that you call inside a test (or \`beforeEach\`) to register a callback that runs when the test ends. Use them for resource cleanup that's specific to one test, instead of polluting an outer \`afterEach\`.

If you prefer explicit imports (better for refactor tools and tree-shake reasoning), leave \`globals: false\` and write \`import { describe, it, expect } from 'vitest'\` at the top of every spec file. Both styles ship the same code; \`globals: true\` is only ergonomic sugar.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'globals', 'jest-compat', 'configuration'],
    repository: repo,
    filePath: 'packages/vitest/src/integrations/globals.ts',
    url: `${baseUrl}/packages/vitest/src/integrations/globals.ts`,
  },
  {
    title: 'beforeAll runs in registration order; afterAll runs in REVERSE registration order',
    body: `A subtle hook-ordering rule lives in the JSDoc on \`beforeAll\`/\`afterAll\` in \`packages/runner/src/hooks.ts\`. They are not symmetric.

\`\`\`ts
/**
 * Note: The \`beforeAll\` hooks are executed in the order they are defined
 * one after another. You can configure this by changing the
 * \`sequence.hooks\` option in the config file.
 */
export function beforeAll(fn, timeout = getDefaultHookTimeout()): void {
  // ...
  return getCurrentSuite().on('beforeAll', /* hook */)
}

/**
 * Note: The \`afterAll\` hooks are running in reverse order of their registration.
 */
export function afterAll(fn, timeout = getDefaultHookTimeout()): void {
  // ...
  return getCurrentSuite().on('afterAll', /* hook */)
}
\`\`\`

This LIFO pattern for \`afterAll\` matches what you want for resource cleanup: if A starts, then B starts (which depends on A), teardown should be B-then-A. Same applies to \`afterEach\` vs \`beforeEach\`.

The non-obvious gotcha: if you return a cleanup function from \`beforeAll\`, that cleanup runs at the SAME time as registered \`afterAll\` hooks but with the same LIFO order. The runner inspects the return value (\`getBeforeHookCleanupCallback\` at the top of the file) and treats a returned function as an implicit \`afterAll\`:

\`\`\`ts
beforeAll(async () => {
  const server = await startServer()
  return () => server.close()  // implicit afterAll
})
\`\`\`

This is cleaner than splitting setup and teardown across two hooks because the closure keeps the resource handle local — no \`let server\` at module scope.

You can flip the order globally with \`sequence.hooks: 'list'\` (parent first for both before AND after) or \`'parallel'\` (run all hooks at the same level concurrently). Default is \`'stack'\` — what's described above.

If a \`beforeAll\` throws, the rest of the suite's tests are marked failed but the registered \`afterAll\` hooks STILL run, in reverse order. This means cleanup is safe even when setup partially fails — but only for resources allocated before the throw. Allocate carefully and your teardown stays simple.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'hooks', 'beforeAll', 'afterAll', 'lifecycle'],
    repository: repo,
    filePath: 'packages/runner/src/hooks.ts',
    url: `${baseUrl}/packages/runner/src/hooks.ts`,
  },
  {
    title: 'test.concurrent vs sequential: how the runner resolves the inheritance',
    body: `A test or describe can be marked \`.concurrent\` (run in parallel within its parent) or \`.sequential\` (force serial even if the parent is concurrent). The resolution logic in \`packages/runner/src/suite.ts\` is more nuanced than people expect.

\`\`\`ts
// inside the describe collector
const isConcurrentSpecified =
  options.concurrent || this.concurrent || options.sequential === false
const isSequentialSpecified =
  options.sequential || this.sequential || options.concurrent === false

// inherit concurrent / sequential from suite
const isConcurrent = isConcurrentSpecified || (options.concurrent && !isSequentialSpecified)
const isSequential = isSequentialSpecified || (options.sequential && !isConcurrentSpecified)
if (isConcurrent != null) {
  options.concurrent = isConcurrent && !isSequential
}
if (isSequential != null) {
  options.sequential = isSequential && !isConcurrent
}
\`\`\`

Three things to extract from this:

1. **\`describe.concurrent\` propagates to children.** If you mark the outer describe concurrent, every \`it\` inside is concurrent unless it carries \`.sequential\`. So you usually only need to mark concurrency once at the top of the file.

2. **\`.sequential\` always wins.** The phrase \`isSequential && !isConcurrent\` (and its inverse) means a child's explicit \`.sequential\` overrides a parent's \`.concurrent\`. Use this when one test inside a concurrent suite touches shared state — DB row, in-memory cache — and can't safely race.

3. **Within a file, \`maxConcurrency\` (default 5) caps how many concurrent tests run at the same time.** It's not unbounded. If you have 50 \`.concurrent\` tests in one file, they run in waves of 5. To raise the cap, set \`test.maxConcurrency\` in config.

The non-obvious gotcha: \`.concurrent\` does NOT mean concurrent across files. File parallelism is controlled separately by \`fileParallelism: true\` (the default) plus the pool. \`.concurrent\` is purely an intra-file knob. Two different test files always run in separate workers (unless you set \`fileParallelism: false\` or pool to \`'forks'\` with \`singleFork: true\`), so adding \`.concurrent\` doesn't help across-file throughput.

Marking everything \`.concurrent\` blindly causes flakes when tests share modules with module-level state — vi.mock state especially. Default to sequential, opt into concurrent only when the test is genuinely independent.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'concurrent', 'sequential', 'parallelism', 'describe'],
    repository: repo,
    filePath: 'packages/runner/src/suite.ts',
    url: `${baseUrl}/packages/runner/src/suite.ts`,
  },
  {
    title: 'vi.fn() vs vi.spyOn(): different defaults for mockReset',
    body: `Both create a mock, but the way \`mockReset()\` behaves on each is different — and that difference is wired in at construction time, not at reset time.

\`\`\`ts
// packages/spy/src/index.ts
export function fn<T>(originalImplementation?: T): Mock<T> {
  if (originalImplementation != null && isMockFunction(originalImplementation)) {
    return originalImplementation as Mock<T>
  }
  return createMockInstance({
    mockImplementation: originalImplementation,
    // special case so that .mockReset() resets the value to
    // the originalImplementation instead of () => undefined
    resetToMockImplementation: true,
  }) as Mock<T>
}

export function spyOn(object, key, accessor) {
  // ...
  const mock = createMockInstance({
    restore,        // restores the original property descriptor
    originalImplementation,
    resetToMockName: true,  // keep the spied-on name in logs
  })
}
\`\`\`

So:

- \`vi.fn(() => 'a').mockReset()\` → mock returns \`'a'\` again (reset = back to the function you passed to \`fn()\`).
- \`vi.spyOn(obj, 'method').mockImplementation(() => 'a').mockReset()\` → mock now returns undefined (reset wipes the implementation; the original is recovered only via \`mockRestore()\`).

This is intentional. \`vi.fn()\` exists to BE the implementation, so reset means "go back to what I declared". \`vi.spyOn\` exists to OBSERVE an existing implementation, so reset means "stop pretending; behave as if no implementation was ever set".

The full ladder of cleanup methods, in order of how much they undo:

| Method | Calls | Implementation | Original |
|---|---|---|---|
| \`mockClear()\` | wiped | kept | n/a |
| \`mockReset()\` | wiped | wiped (or back to fn() arg) | n/a |
| \`mockRestore()\` | wiped | wiped | restored (spyOn only) |

\`mockRestore\` is a no-op on plain \`vi.fn()\` because there's no original to restore.

The non-obvious gotcha: \`vi.spyOn\` on a getter/setter requires the third arg \`'get'\` or \`'set'\`. Without it, Vitest tries to read the value — which calls the getter — and then refuses with "vi.spyOn() can only spy on a function." Pattern: \`vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(800)\`. The signature also enforces this in TypeScript via overloads, so the type error tells you before runtime does.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'vi.fn', 'vi.spyOn', 'mocks', 'mockReset', 'mockRestore'],
    repository: repo,
    filePath: 'packages/spy/src/index.ts',
    url: `${baseUrl}/packages/spy/src/index.ts`,
  },
  {
    title: 'vi.spyOn ESM module gotcha: "Cannot redefine property" and how Vitest reframes it',
    body: `When you try to spy on an ESM module export — \`vi.spyOn(import('./mod'), 'foo')\` — the runtime might throw \`Cannot redefine property\`. ESM module namespaces are non-configurable by spec. Vitest catches this specific TypeError and rewrites the message so you know what to do.

\`\`\`ts
// packages/spy/src/index.ts
try {
  reassign(ssr ? () => mock : mock)
}
catch (error) {
  if (
    error instanceof TypeError
    && Symbol.toStringTag
    && (object as any)[Symbol.toStringTag] === 'Module'
    && (error.message.includes('Cannot redefine property')
      || error.message.includes('Cannot replace module namespace')
      || error.message.includes("can't redefine non-configurable property"))
  ) {
    throw new TypeError(
      \`Cannot spy on export "\${String(key)}". Module namespace is not configurable in ESM. See: https://vitest.dev/guide/browser/#limitations\`,
      { cause: error },
    )
  }
  throw error
}
\`\`\`

Three different runtime engines produce three different stock messages; Vitest unifies them into one actionable error. The original is preserved as \`error.cause\` so debuggers still surface it.

Why does this happen at all? In ESM, \`import * as mod from './x'\` returns a frozen Module Namespace Object. \`Object.defineProperty(mod, 'foo', ...)\` throws because the spec says namespace properties have \`configurable: false\`. CJS doesn't have this — the require result is a plain object, defineProperty works fine — which is why people who never wrote pure-ESM code don't hit it.

The fix Vitest documents: use \`vi.mock('./mod', async (importOriginal) => { const actual = await importOriginal(); return { ...actual, foo: vi.fn() } })\`. This works because \`vi.mock\` doesn't mutate the namespace; it replaces the entire module with a fresh object whose properties ARE configurable.

Workarounds that DO work for spying without full \`vi.mock\`:

1. **Spy on the prototype.** If \`foo\` is a method on a class, \`vi.spyOn(MyClass.prototype, 'foo')\` works because the prototype is a regular object.
2. **Spy on the importing module's local binding.** Vitest's Vite plugin transforms ESM imports into a special wrapper that DOES allow re-assignment, but only for code that goes through Vite's transform. Spying on \`./fs.ts\` from a test that imports it directly works; spying on \`node:fs\` doesn't (built-in modules are real ESM namespaces).

The "ssr" branch in the code (\`accessType = 'get'\` when value is null but getter exists) is Vite SSR's trick: it stores values inside getters so descriptors stay configurable. Vitest piggybacks on this for the same reason.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'vi.spyOn', 'esm', 'modules', 'gotcha'],
    repository: repo,
    filePath: 'packages/spy/src/index.ts',
    url: `${baseUrl}/packages/spy/src/index.ts`,
  },
  {
    title: 'vi.mock is hoisted to the top of the file by a Babel-style transform',
    body: `\`vi.mock\` calls are not run in source order. Vitest's hoist plugin walks the AST and lifts every \`vi.mock(...)\` call to the top of the file, ABOVE all imports. The implementation lives in \`packages/mocker/src/node/hoistMocks.ts\`.

\`\`\`ts
// packages/mocker/src/node/hoistMocks.ts
const regexpHoistable
  = /\\b(?:vi|vitest)\\s*\\.\\s*(?:mock|unmock|hoisted|doMock|doUnmock)\\s*\\(/

// from the HoistMocksOptions interface:
hoistableMockMethodNames?: string[]      // default: ["mock", "unmock"]
dynamicImportMockMethodNames?: string[]  // default: ["mock", "unmock", "doMock", "doUnmock"]
hoistedMethodNames?: string[]            // default: ["hoisted"]
\`\`\`

The plugin (\`hoistMocksPlugin\` in \`packages/vitest/src/node/plugins/mocks.ts\`) runs as a Vite transform. It rewrites:

\`\`\`ts
import { fetchUser } from './api'
vi.mock('./api')
test('uses mocked fetchUser', () => {})
\`\`\`

into roughly:

\`\`\`ts
vi.mock('./api')                  // hoisted to top
import { fetchUser } from './api' // import sees the mock
test('uses mocked fetchUser', () => {})
\`\`\`

This is what makes \`vi.mock\` "magically" work despite ES modules being live and immutable bindings. Without hoisting, the import would resolve to the real module before \`vi.mock\` runs.

The non-obvious gotcha: the hoister scans for the literal pattern \`vi.mock(\` (or \`vitest.mock(\`). If you alias \`const m = vi.mock; m('./api')\`, hoisting is skipped — the regex doesn't match. Same if you call it inside a function or conditional. To call mock inside a non-hoisted scope, use \`vi.doMock\` (also in the dynamicImport list) which is intentionally NOT hoisted; it takes effect for the next \`import()\`.

\`vi.hoisted(() => ({ ... }))\` is the escape hatch: it hoists arbitrary code (typically test fixtures or helpers used inside a mock factory) to run BEFORE imports. Pattern:

\`\`\`ts
const mocks = vi.hoisted(() => ({ fetchUser: vi.fn() }))
vi.mock('./api', () => ({ fetchUser: mocks.fetchUser }))
import { fetchUser } from './api'

test('reads from hoisted mock', () => {
  mocks.fetchUser.mockResolvedValue({ id: 1 })
  // ...
})
\`\`\`

Without \`vi.hoisted\`, you can't reference any module-scope variable from inside the \`vi.mock\` factory because the factory runs before that variable is initialized. The error reads "Cannot access 'mocks' before initialization" and is one of the most-asked Vitest questions on Stack Overflow.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'vi.mock', 'hoisting', 'esm', 'transform'],
    repository: repo,
    filePath: 'packages/mocker/src/node/hoistMocks.ts',
    url: `${baseUrl}/packages/mocker/src/node/hoistMocks.ts`,
  },
  {
    title: 'vi.mock partial mocking with importOriginal — and the helpful error if you forget an export',
    body: `When a test imports something that wasn't returned from a \`vi.mock\` factory, Vitest doesn't silently return undefined. It throws with a code-frame-quality error message and an example you can copy into your test.

\`\`\`ts
// packages/vitest/src/runtime/moduleRunner/moduleMocker.ts
const moduleExports = new Proxy(exports, {
  get: (target, prop) => {
    if (prop === 'then') { /* ... preserve thenable shape ... */ }
    else if (!(prop in target)) {
      if (this.filterPublicKeys.includes(prop)) return undefined
      throw this.createError(
        \`[vitest] No "\${String(prop)}" export is defined on the "\${mock.raw}" mock. \` +
        'Did you forget to return it from "vi.mock"?' +
        '\\nIf you need to partially mock a module, you can use "importOriginal" helper inside:\\n',
        \`vi.mock(import("\${mock.raw}"), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    // your mocked methods
  }
})\`,
      )
    }
    return val
  },
})
\`\`\`

The mocked module is wrapped in a Proxy. Reads of properties that exist pass through; reads of properties that don't trigger this throw. The error itself is a working code template — you can paste it into the test and just fill in the methods you want to mock.

The \`importOriginal\` pattern is the canonical solution: get the actual module, spread it, override only what the test cares about. The factory must be \`async\` because \`importOriginal()\` returns a Promise.

\`\`\`ts
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    fetchUser: vi.fn(),  // only this is mocked
  }
})
\`\`\`

The non-obvious gotcha: \`importOriginal()\` does NOT return a "fresh" module. It returns the module from the regular ESM cache. If the original module has top-level side effects (e.g., creating a shared client at import time), those side effects already ran. Use a factory that doesn't call \`importOriginal\` if you need a clean slate.

The \`mock.raw\` in the error is the import specifier as written in your test — \`'./api'\`, not the resolved absolute path. That makes the error point at code you control instead of node_modules paths. Small touch but it's the kind of thing that disambiguates "is the path wrong" vs "is the export missing" at a glance.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'vi.mock', 'importOriginal', 'partial-mock', 'errors'],
    repository: repo,
    filePath: 'packages/vitest/src/runtime/moduleRunner/moduleMocker.ts',
    url: `${baseUrl}/packages/vitest/src/runtime/moduleRunner/moduleMocker.ts`,
  },
  {
    title: 'vi.useFakeTimers wraps @sinonjs/fake-timers and skips nextTick + queueMicrotask by default',
    body: `The \`FakeTimers\` class in \`packages/vitest/src/integrations/mock/timers.ts\` is a thin wrapper over @sinonjs/fake-timers' \`withGlobal()\`. The interesting bit is which timers it actually fakes by default.

\`\`\`ts
useFakeTimers(): void {
  const fakeDate = this._fakingDate || Date.now()
  // ...
  const toFake = Object.keys(this._fakeTimers.timers)
    // Do not mock timers internally used by node by default. It can still be mocked through userConfig.
    .filter(timer => timer !== 'nextTick' && timer !== 'queueMicrotask')

  if (this._userConfig?.toFake?.includes('nextTick') && isChildProcess()) {
    throw new Error('process.nextTick cannot be mocked inside child_process')
  }

  this._clock = this._fakeTimers.install({
    now: fakeDate,
    ...this._userConfig,
    toFake: this._userConfig?.toFake || toFake,
    ignoreMissingTimers: true,
  })
  this._fakingTime = true
}
\`\`\`

Why exclude nextTick and queueMicrotask? Faking them breaks Node's own internals — the IPC channel between the worker and the main process uses both. If you mock them globally, the worker stops talking to Vitest, the test hangs, and you get no useful error. The class throws explicitly when you try to fake nextTick in a child_process pool.

To opt back in, use \`vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'queueMicrotask'] })\`. The \`toFake\` config replaces the default list; it's not additive. So passing \`['queueMicrotask']\` mocks ONLY queueMicrotask, not setTimeout. To get the default plus an extra, you have to spell out the full list.

The default \`fakeTimers\` config in defaults.ts is \`{ loopLimit: 10_000, shouldClearNativeTimers: true }\`. \`loopLimit\` matters for \`vi.runAllTimers()\`: if a timer schedules another timer (a "drift" pattern, or any \`setInterval\`), the loop will iterate until empty OR until 10,000 iterations — then throw. Otherwise an infinite recursion would hang the test forever.

The non-obvious gotcha: \`Date.now()\` is faked too. If your test uses \`Date.now()\` for cache TTL or rate limit logic, the clock is frozen until you advance it. \`vi.advanceTimersByTime(1000)\` advances the clock AND fires any timers due in that window. \`vi.setSystemTime(Date)\` jumps the clock without firing timers — useful for testing "what does the code do at midnight UTC" without triggering scheduled work.

When you're done: \`vi.useRealTimers()\` in afterEach. The class's \`useRealTimers\` calls \`this._clock.uninstall()\` to put the original \`setTimeout\` etc. back. Forgetting this leaks fake timers into the next test in the same file.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'vi.useFakeTimers', 'sinon', 'timers', 'date'],
    repository: repo,
    filePath: 'packages/vitest/src/integrations/mock/timers.ts',
    url: `${baseUrl}/packages/vitest/src/integrations/mock/timers.ts`,
  },
  {
    title: 'forks vs threads vs vmThreads: how Vitest pools test files',
    body: `Pool selection in \`packages/vitest/src/node/pool.ts\` decides how Vitest spawns isolation boundaries. The list of built-ins is short:

\`\`\`ts
export const builtinPools: BuiltinPool[] = [
  'forks',        // child_process.fork — default
  'threads',      // worker_threads
  'browser',      // puppeteer/playwright/webdriverio
  'vmThreads',    // worker_threads + node:vm context per file
  'vmForks',      // child_process + node:vm context per file
  'typescript',   // tsc-based type-only typecheck
]
\`\`\`

Default is \`'forks'\` since v1.4 (originally \`'threads'\`). The reason for the change is honest: too many libraries have native bindings that crash in worker_threads (e.g., \`better-sqlite3\`, parts of \`node-canvas\`). \`child_process.fork\` runs each worker in a real OS process so native code is happy.

Trade-offs:

| Pool | Spawn cost | Isolation | Native modules |
|---|---|---|---|
| \`forks\` | ~50ms | OS process | works |
| \`threads\` | ~5ms | V8 isolate | sometimes crashes |
| \`vmThreads\` | ~5ms + per-file vm context | very strong | mostly works |
| \`vmForks\` | ~50ms + per-file vm context | strongest | works |

\`isolate: true\` (the default) means each test FILE gets a fresh module graph. With \`forks\` or \`threads\`, Vitest reuses the worker but resets module state between files. With \`vmThreads\`/\`vmForks\`, isolation is enforced by spinning a fresh \`node:vm\` Context per file — slower but bulletproof.

The fileParallelism flag interacts with pool choice: \`fileParallelism: false\` overrides \`maxWorkers\` to 1, so only one file runs at a time. Useful when tests share a port or a file system path that can't be sharded.

The non-obvious gotcha: \`vmThreads\` does NOT honor \`isolate: false\`. The \`isolate\` config only affects \`threads\`/\`forks\` (where it skips the module-graph reset). With vm-based pools, isolation is the whole point and you can't turn it off.

For benchmarking your test suite's pool choice: run with \`--reporter=verbose --pool=forks\` and again with \`--pool=threads\`. Threads is faster on small test files (cheap spawn) but the gap closes as test work itself dominates. If your suite is dominated by setup-heavy tests (Prisma client init, JSDOM teardown), \`forks\` with \`poolOptions.forks.singleFork: true\` (one worker, all files) often beats both — you pay process spawn once.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'pool', 'forks', 'threads', 'isolation', 'workers'],
    repository: repo,
    filePath: 'packages/vitest/src/node/pool.ts',
    url: `${baseUrl}/packages/vitest/src/node/pool.ts`,
  },
  {
    title: 'expect().resolves and .rejects use a Proxy to defer assertion until the promise settles',
    body: `The \`.resolves\` chain in \`packages/expect/src/jest-expect.ts\` is a Proxy that intercepts every chained matcher and wraps it in a Promise. This is what lets you write \`await expect(p).resolves.toBe(42)\` instead of \`expect(await p).toBe(42)\`.

\`\`\`ts
utils.addProperty(chai.Assertion.prototype, 'resolves', function () {
  const error = new Error('resolves')
  utils.flag(this, 'promise', 'resolves')
  utils.flag(this, 'error', error)
  const obj = utils.flag(this, 'object')

  if (typeof obj?.then !== 'function') {
    throw new TypeError(\`You must provide a Promise to expect() when using .resolves\`)
  }

  const proxy = new Proxy(this, {
    get: (target, key) => {
      const result = Reflect.get(target, key)
      if (typeof result !== 'function') return result
      return (...args) => {
        utils.flag(this, '_name', key)
        const promise = Promise.resolve(obj).then(
          (value) => {
            utils.flag(this, 'object', value)
            return result.call(this, ...args)
          },
          (err) => {
            const _error = new AssertionError(
              \`promise rejected "\${utils.inspect(err)}" instead of resolving\`,
            )
            _error.cause = err
            throw _error
          },
        )
        return recordAsyncExpect(test, promise, ...)
      }
    },
  })
  return proxy
})
\`\`\`

Three things this gets you that a manual await doesn't:

1. **Stack trace points at the assertion line, not the await site.** The \`new Error('resolves')\` at entry captures the call site; if the matcher fails inside the .then, the rejection is rewritten to use that captured stack.

2. **Wrong assertion vs wrong promise are different errors.** If the promise rejects when you expected resolve, you get "promise rejected ... instead of resolving" with the original rejection as \`error.cause\`. If the promise resolves but to the wrong value, you get the normal toBe diff.

3. **\`recordAsyncExpect\`** registers the pending assertion with the test runner so the test won't pass until ALL chained assertions settle. Without it, \`expect(p).resolves.toBe(1)\` without an await would silently pass.

The non-obvious gotcha: \`.rejects\` accepts both a Promise AND a thrown function for jest-compat: \`const wrapper = typeof obj === 'function' ? obj() : obj\`. So \`expect(() => fn()).rejects.toThrow()\` works even though \`() => fn()\` isn't a Promise — Vitest invokes it and uses the result. This works for \`.rejects\` but NOT for \`.resolves\`. The asymmetry exists because Jest historically only supported function-style for rejection assertions.

You cannot combine \`.resolves\`/\`.rejects\` with \`expect.poll(...)\` — the implementation throws \`expect.poll() is not supported in combination with .resolves\`. Use \`vi.waitFor\` for the poll-and-assert pattern instead.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'expect', 'resolves', 'rejects', 'async-assertions'],
    repository: repo,
    filePath: 'packages/expect/src/jest-expect.ts',
    url: `${baseUrl}/packages/expect/src/jest-expect.ts`,
  },
  {
    title: 'vi.waitFor: polling assertion with proper fake-timers integration',
    body: `\`vi.waitFor\` retries a callback on an interval until it returns truthy or throws nothing — useful for "wait until this DOM node appears" or "wait until this state machine reaches X". The implementation in \`packages/vitest/src/integrations/wait.ts\` is short and worth reading.

\`\`\`ts
export function waitFor<T>(callback, options = {}) {
  const { setTimeout, setInterval, clearTimeout, clearInterval } = getSafeTimers()
  const { interval = 50, timeout = 1000 } =
    typeof options === 'number' ? { timeout: options } : options
  const STACK_TRACE_ERROR = new Error('STACK_TRACE_ERROR')

  return new Promise<T>((resolve, reject) => {
    let lastError: unknown
    let promiseStatus: 'idle' | 'pending' | 'resolved' | 'rejected' = 'idle'

    const checkCallback = () => {
      if (vi.isFakeTimers()) {
        vi.advanceTimersByTime(interval)
      }
      if (promiseStatus === 'pending') return

      try {
        const result = callback()
        if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
          promiseStatus = 'pending'
          result.then(
            (val) => { promiseStatus = 'resolved'; onResolve(val) },
            (err) => { promiseStatus = 'rejected'; lastError = err },
          )
        }
        else {
          onResolve(result as T)
          return true
        }
      }
      catch (error) { lastError = error }
    }

    if (checkCallback() === true) return
    timeoutId = setTimeout(handleTimeout, timeout)
    intervalId = setInterval(checkCallback, interval)
  })
}
\`\`\`

Three details that matter in real use:

1. **Defaults are interval=50ms, timeout=1000ms.** Twenty checks before failure. If you pass a number instead of an object — \`vi.waitFor(fn, 5000)\` — it sets timeout to that, interval stays 50.

2. **getSafeTimers** captures the REAL setTimeout/setInterval before fake timers can intercept. Without this, calling waitFor inside a test that did \`vi.useFakeTimers()\` would deadlock — the polling timer would never fire because time isn't advancing.

3. **When fake timers ARE on, waitFor advances them automatically** by \`interval\` ms each tick. So the pattern \`vi.useFakeTimers(); await vi.waitFor(() => state === 'ready')\` works even though the user never called advanceTimersByTime — waitFor does it for you.

\`waitUntil\` (same file) is the truthy-only sibling: it doesn't catch errors from the callback (an error rejects the wait), and it only resolves when the result is truthy. \`waitFor\` resolves on any non-throwing return; \`waitUntil\` resolves only on truthy.

The non-obvious gotcha: if your callback returns a Promise and that Promise takes longer than \`interval\` to resolve, \`promiseStatus === 'pending'\` causes the next tick to skip. So a 200ms async callback with the default 50ms interval effectively polls at 200ms, not 50ms. To really hammer the assertion, use a synchronous callback that reads cached state.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'vi.waitFor', 'vi.waitUntil', 'async', 'polling'],
    repository: repo,
    filePath: 'packages/vitest/src/integrations/wait.ts',
    url: `${baseUrl}/packages/vitest/src/integrations/wait.ts`,
  },
  {
    title: 'expect.extend: how custom matchers plug into Chai under the hood',
    body: `\`expect.extend({ toBeFoo() { ... } })\` looks Jest-flavored on the outside but underneath is a Chai plugin install. The implementation in \`packages/expect/src/jest-extend.ts\` builds a wrapper for each matcher and registers it with Chai's prototype.

\`\`\`ts
function JestExtendPlugin(c, expect, matchers): ChaiPlugin {
  return (_, utils) => {
    Object.entries(matchers).forEach(([name, matcherFn]) => {
      function __VITEST_EXTEND_ASSERTION__(this, ...args) {
        const { state, isNot, obj, customMessage } = getMatcherState(this, expect)
        const result = matcherFn.call(state, obj, ...args)

        if (result && typeof result.then === 'function') {
          // async matcher path
          return result.then(({ pass, message, actual, expected, meta }) => {
            if ((pass && isNot) || (!pass && !isNot)) {
              const errorMessage = (customMessage ? \`\${customMessage}: \` : '') + message()
              throw new JestExtendError(errorMessage, actual, expected,
                { assertionName: name, meta })
            }
          })
        }

        // sync matcher path
        const { pass, message, actual, expected } = result
        if ((pass && isNot) || (!pass && !isNot)) { /* throw */ }
      }
    })
  }
}
\`\`\`

The matcher receives \`this = MatcherState\` (which carries \`isNot\`, \`equals\`, the test name, custom equality testers, and Jest-style \`utils\` like \`stringify\` and \`diff\`) and must return \`{ pass: boolean, message: () => string }\` — synchronously OR as a Promise. Async matchers are first-class.

A real custom matcher:

\`\`\`ts
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling
    return {
      pass,
      message: () =>
        \`expected \${received} \${pass ? 'not ' : ''}to be within \${floor}..\${ceiling}\`,
      actual: received,
      expected: { floor, ceiling },
    }
  },
})

expect(7).toBeWithinRange(1, 10) // passes
expect(7).not.toBeWithinRange(20, 30) // also passes
\`\`\`

The \`(pass && isNot) || (!pass && !isNot)\` check is the entire \`.not\` semantics — the same matcher serves both directions. You don't write a separate "not" branch.

For TypeScript, declaration merging is required:

\`\`\`ts
interface CustomMatchers<R = unknown> {
  toBeWithinRange(floor: number, ceiling: number): R
}
declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
\`\`\`

The non-obvious gotcha: matcher \`message\` is a thunk (function returning string), not a string. This is so the diff/stringify cost is paid only on failure. Returning a string directly works (Chai will call .toString) but you lose laziness — important if message construction reads large objects. The Jest docs sometimes show string returns; Vitest lets it slide for compatibility but the function form is the documented and faster path.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'expect.extend', 'custom-matchers', 'chai'],
    repository: repo,
    filePath: 'packages/expect/src/jest-extend.ts',
    url: `${baseUrl}/packages/expect/src/jest-extend.ts`,
  },
  {
    title: 'Snapshot client: file vs inline snapshots share the same toMatchSnapshotImpl',
    body: `\`toMatchSnapshot\` and \`toMatchInlineSnapshot\` are both registered in the same Chai plugin (\`packages/vitest/src/integrations/snapshot/chai.ts\`) and both delegate to a single internal \`toMatchSnapshotImpl\`. The difference is one boolean.

\`\`\`ts
for (const key of ['matchSnapshot', 'toMatchSnapshot']) {
  utils.addMethod(chai.Assertion.prototype, key, wrapAssertion(utils, key,
    function (propertiesOrHint, hint) {
      const result = toMatchSnapshotImpl({
        assertion: this,
        received: utils.flag(this, 'object'),
        ...normalizeArguments(propertiesOrHint, hint),
      })
      return assertMatchResult(result, chai.util.flag(this, 'message'))
    },
  ))
}

utils.addMethod(chai.Assertion.prototype, 'toMatchInlineSnapshot',
  wrapAssertion(utils, 'toMatchInlineSnapshot', function __INLINE_SNAPSHOT_OFFSET_3__(...) {
    const result = toMatchSnapshotImpl({
      // isInline: true under the hood
    })
  }),
)
\`\`\`

The \`__INLINE_SNAPSHOT_OFFSET_3__\` name on the function isn't decorative — Vitest reads its own stack frame name to find the source file and column where the inline snapshot literal lives. That's how it knows where to write the updated string when you run \`vitest -u\`. Renaming the function would break update mode.

File snapshots resolve to \`__snapshots__/<spec-basename>.snap\` next to the test file. The path is configurable via \`SnapshotManager.resolvePath\`:

\`\`\`ts
// packages/snapshot/src/manager.ts
resolvePath(testPath, context) {
  const resolver = this.options.resolveSnapshotPath || (() => {
    return join(join(dirname(testPath), '__snapshots__'),
      \`\${basename(testPath)}\${this.extension}\`)
  })
  return resolver(testPath, this.extension, context)
}
\`\`\`

Pass \`resolveSnapshotPath\` in vitest.config.ts to colocate snapshots with source instead of in a sibling folder.

\`vitest -u\` (or \`--update\`) accepts \`'all' | 'new' | 'none'\`. Default \`true\` means \`'all'\` — every mismatch is overwritten. \`'new'\` only writes snapshots that don't yet exist (good for CI as a safety net), \`'none'\` blocks all writes (use in CI to fail rather than silently write).

Practical guidance: inline snapshots are best for small assertions ("does this function output exactly X") because the expected value lives next to the test and reviewers see drift in PR diffs. File snapshots are better for large outputs (HTML, JSON dumps) because they keep the test file readable.

The non-obvious gotcha: object snapshots use \`pretty-format\` (Vitest re-exports a fork). Date objects serialize as \`Date(2024-01-01T00:00:00.000Z)\` not the raw ISO string. If you snapshot a date that comes from the system clock, the test is non-deterministic. Wrap with \`vi.setSystemTime\` first or strip dates with custom serializers (\`expect.addSnapshotSerializer\`).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'snapshot', 'toMatchSnapshot', 'inline-snapshot', 'update'],
    repository: repo,
    filePath: 'packages/vitest/src/integrations/snapshot/chai.ts',
    url: `${baseUrl}/packages/vitest/src/integrations/snapshot/chai.ts`,
  },
  {
    title: 'Test sharding: hash-stable distribution across shards via SHA1 of the file path',
    body: `\`vitest --shard 1/4\` splits test files across 4 shards and runs only the first. The implementation in \`packages/vitest/src/node/sequencers/BaseSequencer.ts\` uses a content-independent hash so the same file lands in the same shard across CI runs.

\`\`\`ts
public async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
  const { config } = this.ctx
  const { index, count } = config.shard!
  const [shardStart, shardEnd] = this.calculateShardRange(files.length, index, count)
  return [...files]
    .map((spec) => {
      const fullPath = resolve(slash(config.root), slash(spec.moduleId))
      const specPath = fullPath?.slice(config.root.length)
      return { spec, hash: hash('sha1', specPath, 'hex') }
    })
    .sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0))
    .slice(shardStart, shardEnd)
    .map(({ spec }) => spec)
}

private calculateShardRange(filesCount, index, count): [number, number] {
  const baseShardSize = Math.floor(filesCount / count)
  const remainderTestFilesCount = filesCount % count
  if (remainderTestFilesCount >= index) {
    const shardSize = baseShardSize + 1
    return [shardSize * (index - 1), shardSize * index]
  }
  const shardStart = remainderTestFilesCount * (baseShardSize + 1)
    + (index - remainderTestFilesCount - 1) * baseShardSize
  return [shardStart, shardStart + baseShardSize]
}
\`\`\`

Three properties of this implementation:

1. **Stable across runs.** SHA1 of the relative path produces the same shard mapping every time. Add a new test file and only one shard's set changes; the rest are untouched. This is what makes shard-based caching work — failing shard 3 reruns the same files on retry.

2. **Balanced when uneven.** \`calculateShardRange\` distributes the remainder across the first \`remainderTestFilesCount\` shards. 10 files / 3 shards = shards of size 4, 3, 3 — no shard gets 2x another's load.

3. **Path is relative.** \`fullPath?.slice(config.root.length)\` strips the project root before hashing, so the shard mapping is portable across machines (your laptop and CI's runner produce the same hashes).

GitHub Actions matrix pattern:

\`\`\`yaml
strategy:
  matrix:
    shard: [1, 2, 3, 4]
steps:
  - run: vitest --shard \${{ matrix.shard }}/4 --reporter=blob
  # collect blob reports and merge
  - run: vitest --merge-reports=.vitest-reports
\`\`\`

The non-obvious gotcha: sharding splits FILES, not tests. If you have one giant 500-test file and 50 small ones, the giant file lands in exactly one shard and that shard takes 10x longer than the others. Either split the file, or accept that "4 shards" really means "shard 3 is the bottleneck and the other three idle for 60% of the run". Vitest doesn't move tests between files.

\`--reporter=blob\` produces a serialized result file per shard; \`--merge-reports\` combines them so the final summary includes everything from all shards. Without it, each shard reports its own subset and you have to grep across logs.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'sharding', 'ci', 'parallelism', 'sequencer'],
    repository: repo,
    filePath: 'packages/vitest/src/node/sequencers/BaseSequencer.ts',
    url: `${baseUrl}/packages/vitest/src/node/sequencers/BaseSequencer.ts`,
  },
  {
    title: 'test.extend: dependency-injected fixtures with scope: test|file|worker',
    body: `\`test.extend\` takes a fixtures object and returns a NEW \`test\` function whose context includes the fixture values. The setup runs lazily (only if the test destructures it) and teardown runs after \`use()\` resolves. Implementation lives in \`packages/runner/src/fixture.ts\`.

\`\`\`ts
extend(runner: VitestRunner, userFixtures: UserFixtures): TestFixtures {
  const { suite } = getCurrentSuite()
  const isTopLevel = !suite || suite.file === suite
  const registrations = this.parseUserFixtures(runner, userFixtures, isTopLevel)
  return new TestFixtures(registrations)
}

private static _builtinFixtures: string[] = [
  'task', 'signal', 'onTestFailed', 'onTestFinished', 'skip', 'annotate',
] satisfies (keyof TestContext)[]

private static _fixtureScopes: string[] = ['test', 'file', 'worker']
\`\`\`

A real fixture chain (from the runner type docs):

\`\`\`ts
const myTest = test
  .extend('config', { scope: 'worker' }, async ({}, use) => {
    const cfg = await loadConfig()
    await use(cfg)
    // teardown after worker ends
  })
  .extend('db', { scope: 'file' }, async ({ config }, use, { onCleanup }) => {
    const db = await connect(config.url)
    onCleanup(() => db.close())
    await use(db)
  })
  .extend('user', async ({ db }, use) => {
    const user = await db.users.create()
    await use(user)
    await db.users.delete(user.id)
  })

myTest('reads user', async ({ user }) => {
  expect(user.id).toBeDefined()
})
\`\`\`

Three things to extract:

1. **Lazy setup.** \`db\` is only created if a test destructures it. The destructuring pattern in the test signature \`({ user })\` is statically analyzed by Vitest to build a dependency graph. A test that never asks for \`db\` never opens a connection.

2. **Three scopes.** \`'worker'\` is created once per Vitest worker (lasts entire test run for that pool); \`'file'\` is once per test file; \`'test'\` (default) is per test invocation. Combine scopes for layered setup: expensive things (DB connection) at worker, mid-cost things (transaction) at file, per-test things (fresh row) at test.

3. **\`use()\` is the teardown signal.** Code BEFORE \`await use(value)\` is setup; code AFTER is teardown. If you forget to call \`use\`, Vitest throws \`Fixture "<name>" returned without calling "use". Make sure to call "use" in every code path of the fixture function.\`

The non-obvious gotcha: the destructuring pattern is parsed via the function source string, so renaming via \`({ user: u }) => ...\` still works (Vitest reads the property key, not the local name). BUT \`(ctx) => ctx.user\` does NOT work — Vitest can't see \`user\` is needed and \`ctx.user\` is undefined at runtime. Always destructure explicitly.

\`auto: true\` on a fixture forces it to run for every test even without destructuring — useful for "set up env, no return value" patterns. \`injected: true\` makes it overridable from \`vitest.config.ts\` via \`provide()\`, useful for varying the fixture's value across projects.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'test.extend', 'fixtures', 'dependency-injection', 'scope'],
    repository: repo,
    filePath: 'packages/runner/src/fixture.ts',
    url: `${baseUrl}/packages/runner/src/fixture.ts`,
  },
  {
    title: 'bench(): benchmark mode is gated and measured by tinybench',
    body: `\`bench()\` is a separate API from \`test()\`. It only runs in benchmark mode (\`vitest bench\`) and throws in regular test runs. Implementation in \`packages/vitest/src/runtime/benchmark.ts\`:

\`\`\`ts
const benchFns = new WeakMap<Test, BenchFunction>()
const benchOptsMap = new WeakMap()

export const bench: BenchmarkAPI = createBenchmark(function (name, fn = noop, options = {}) {
  if (getWorkerState().config.mode !== 'benchmark') {
    throw new Error('\`bench()\` is only available in benchmark mode.')
  }

  const task = getCurrentSuite().task(formatName(name), {
    ...this,
    meta: { benchmark: true },
  })
  benchFns.set(task, fn)
  benchOptsMap.set(task, options)
  if (!this.todo && task.mode === 'todo') {
    task.mode = 'run'
  }
})
\`\`\`

The function and options are stored in WeakMaps keyed by the task object — the runner reads them when it actually executes the bench. tinybench (Vitest's underlying benchmark library) handles warmup, statistics (mean, p99, RME), and outlier detection.

A real benchmark file (\`*.bench.ts\` per defaults):

\`\`\`ts
import { bench, describe } from 'vitest'

describe('array sort', () => {
  bench('Array.prototype.sort', () => {
    const arr = Array.from({ length: 1000 }, () => Math.random())
    arr.sort()
  }, { time: 500 })  // run for ~500ms

  bench('Array.prototype.sort with comparator', () => {
    const arr = Array.from({ length: 1000 }, () => Math.random())
    arr.sort((a, b) => a - b)
  }, { time: 500 })
})
\`\`\`

The default include glob in benchmark config is \`['**/*.{bench,benchmark}.?(c|m)[jt]s?(x)']\` — separate from the test glob, so benches don't run during \`vitest\`.

\`benchmark.includeSamples: false\` (default) means raw per-run samples are dropped from the report — only summary stats survive. Set to true if you want to ship the data to a graphing tool.

The non-obvious gotcha: bench benchmarks variance, not absolute speed. The reporter shows ops/sec relative to the fastest run. Your "10% slower" result is meaningful; your "300_000 ops/sec" number is sensitive to your machine, the wind direction, etc. Don't compare across machines — compare across commits on the same machine.

\`--compare\` flag lets you snapshot a baseline (\`vitest bench --outputJson=baseline.json\`) then compare against it (\`vitest bench --compare=baseline.json\`). Useful in CI to flag regressions: gate on \`--compare ./baseline.json --reporter=verbose\` and a script that fails if any bench is >X% slower.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'bench', 'benchmark', 'tinybench', 'performance'],
    repository: repo,
    filePath: 'packages/vitest/src/runtime/benchmark.ts',
    url: `${baseUrl}/packages/vitest/src/runtime/benchmark.ts`,
  },
  {
    title: '--testNamePattern (-t) filters by full test name across describe nesting',
    body: `The CLI flag definition in \`packages/vitest/src/node/cli/cli-config.ts\`:

\`\`\`ts
testNamePattern: {
  description: 'Run tests with full names matching the specified regexp pattern',
  argument: '<pattern>',
  shorthand: 't',
},
\`\`\`

The pattern is a regex (matched, not anchored) against the FULL test name — including all parent \`describe\` blocks joined with \` > \`. So:

\`\`\`ts
describe('user', () => {
  describe('signup', () => {
    test('rejects duplicate email', () => {})
  })
})
\`\`\`

The full name is \`user > signup > rejects duplicate email\`. To match it:

\`\`\`bash
vitest -t 'duplicate email'         # substring regex, matches
vitest -t '^user > signup'           # anchored prefix
vitest -t 'duplicate|invalid'        # OR pattern
vitest -t 'rejects.*email'           # regex with .*
\`\`\`

The pattern is passed straight to \`new RegExp(pattern)\` — meaning regex special characters need escaping. To match a literal parenthesis, escape: \`vitest -t 'foo\\\\(bar\\\\)'\`. The double backslash is shell-required.

This is different from the positional file filter:

\`\`\`bash
vitest auth                # only files whose path matches "auth"
vitest -t 'login'          # only tests whose name matches "login"
vitest auth -t 'login'     # only tests named "login" inside auth files
\`\`\`

Inside watch mode, press \`p\` to enter file pattern mode, \`t\` to enter test name pattern mode. Both update the filter live without restarting Vitest.

The non-obvious gotcha: \`testNamePattern\` filters AT RUN TIME, not collection time. Vitest still loads every file matching \`include\`, runs every \`describe\` block (because \`describe\` callbacks build the test tree), and executes \`beforeAll\` hooks for any suite that has at least one matched test. So \`-t\` is great for re-running a failure but does NOT skip the cost of importing slow modules.

To genuinely skip files, combine with a positional file filter (\`vitest auth -t 'login'\`) or use \`test.skipIf\` / \`describe.skipIf\` based on a runtime condition. \`test.only\` and \`describe.only\` are the idiomatic way to focus during development; CI should fail if \`only\` is left in (default \`allowOnly: !isCI\` enforces this).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'cli', 'testNamePattern', 'filter', 'watch'],
    repository: repo,
    filePath: 'packages/vitest/src/node/cli/cli-config.ts',
    url: `${baseUrl}/packages/vitest/src/node/cli/cli-config.ts`,
  },
  {
    title: 'Coverage v8 vs istanbul: V8 is the default and uses native instrumentation',
    body: `\`coverageConfigDefaults\` in \`packages/vitest/src/defaults.ts\` sets \`provider: 'v8'\`. The v8 provider in \`packages/coverage-v8/src/provider.ts\` collects coverage via Node's \`node:inspector\` and converts it to Istanbul's report format using \`ast-v8-to-istanbul\`.

\`\`\`ts
// packages/coverage-v8/src/provider.ts
export class V8CoverageProvider extends BaseCoverageProvider implements CoverageProvider {
  name = 'v8' as const

  async generateCoverage({ allTestsRun }) {
    const coverageMap = this.createCoverageMap()
    let merged: RawCoverage = { result: [] }

    await this.readCoverageFiles({
      onFileRead(coverage) {
        merged = mergeProcessCovs([merged, coverage])
        // mergeProcessCovs sometimes loses startOffset, e.g. in vue
        merged.result.forEach((result) => {
          if (!result.startOffset) {
            const original = coverage.result.find(r => r.url === result.url)
            result.startOffset = original?.startOffset || 0
          }
        })
      },
    })
    // ... convert v8 → istanbul, generate reports
  }
}
\`\`\`

The two providers in one table:

| Aspect | v8 (default) | istanbul |
|---|---|---|
| Instrumentation | none — V8 reports natively | Babel transform inlines counters |
| Build cost | zero | ~30% slower test runs |
| Branch coverage accuracy | improving but imperfect | precise |
| Sourcemaps | needs ast-v8-to-istanbul | native |
| Setup | none beyond \`enabled: true\` | \`@vitest/coverage-istanbul\` package |

Why v8 became the default: zero instrumentation cost means \`vitest --coverage\` is roughly the same speed as \`vitest\`. Istanbul slows tests by ~30% because every branch gets a counter inlined.

Why anyone still uses istanbul: branch coverage (especially \`?:\` ternaries inside complex expressions) is more accurate. v8 sometimes reports a branch as fully covered when only one side ran, because V8 reports at the function/block level and the AST converter has to re-derive branches. For "we must have 100% real branch coverage" requirements, istanbul is the safer call.

Default config worth knowing:

\`\`\`ts
{
  provider: 'v8',
  enabled: false,                   // opt in via --coverage
  clean: true,                      // wipe coverage/ before each run
  cleanOnRerun: true,               // wipe in watch-mode reruns too
  reportsDirectory: './coverage',
  reporter: ['text', 'html', 'clover', 'json'],
  reportOnFailure: false,           // skip report if tests failed
  watermarks: { statements: [50, 80], functions: [50, 80], ... },
}
\`\`\`

The non-obvious gotcha: \`reportOnFailure: false\` means coverage reports are NOT written if any test failed. In CI this is usually wrong — you want the report to debug WHY coverage dropped. Flip to \`true\` for CI configs.

\`exclude\` in coverage config supplements the global one — it doesn't replace. To drop generated files entirely, list them in BOTH \`exclude\` AND \`coverage.exclude\`. The "is it counted but not run" vs "not counted at all" distinction matters: \`include\` in coverage config controls which files COULD be reported; \`exclude\` removes from both denominator and numerator.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'coverage', 'v8', 'istanbul', 'configuration'],
    repository: repo,
    filePath: 'packages/coverage-v8/src/provider.ts',
    url: `${baseUrl}/packages/coverage-v8/src/provider.ts`,
  },
  {
    title: 'detectAsyncLeaks uses node:async_hooks to find resources outliving a test file',
    body: `Set \`detectAsyncLeaks: true\` in vitest.config.ts and Vitest tracks every async resource created by a test file using \`node:async_hooks\`. Resources still active after the file finishes are reported as leaks. Implementation in \`packages/vitest/src/runtime/detect-async-leaks.ts\`:

\`\`\`ts
const IGNORED_TYPES = new Set([
  'DNSCHANNEL', 'ELDHISTOGRAM', 'PerformanceObserver',
  'RANDOMBYTESREQUEST', 'SIGNREQUEST', 'STREAM_END_OF_STREAM',
  'TCPWRAP', 'TIMERWRAP', 'TLSWRAP', 'ZLIB',
])

export function detectAsyncLeaks(testFile, projectName) {
  const resources = new Map<number, PossibleLeak>()

  const hook = createHook({
    init(asyncId, type, triggerAsyncId, resource) {
      if (IGNORED_TYPES.has(type)) return
      let stack = ''
      try {
        Error.stackTraceLimit = 100
        stack = new Error('VITEST_DETECT_ASYNC_LEAKS').stack || ''
      } finally {
        Error.stackTraceLimit = limit
      }

      if (!stack.includes(testFile)) {
        const trigger = resources.get(triggerAsyncId)
        if (!trigger) return
        stack = trigger.stack
      }

      let isActive = isActiveDefault
      if ('hasRef' in resource) {
        const ref = new WeakRef(resource as { hasRef: () => boolean })
        isActive = () => ref.deref()?.hasRef() ?? false
      }
      resources.set(asyncId, { type, stack, projectName, filename: testFile, isActive })
    },
    destroy(asyncId) {
      if (resources.get(asyncId)?.type !== 'PROMISE') resources.delete(asyncId)
    },
    promiseResolve(asyncId) { resources.delete(asyncId) },
  })
  hook.enable()

  return async function collect() { /* ... */ }
}
\`\`\`

What this catches: forgotten setIntervals, open sockets, file descriptors, child processes — any async resource that hasRef() and wasn't unrefed/closed.

What it doesn't catch (intentionally): the IGNORED_TYPES set excludes resources Node creates internally — TCPWRAP and TIMERWRAP fire constantly during normal test execution. Reporting them would drown signal in noise.

The trick with \`stack.includes(testFile)\` is how Vitest attributes a leak to a specific file: it captures a stack at hook init, and only reports the resource if the test file appears in the stack. If a leak was triggered by a chain (your test → axios → http.Agent), Vitest follows the triggerAsyncId chain to find a parent that DID originate in your test, and uses that parent's stack as the report.

\`WeakRef\` for the resource means the leak detector itself doesn't keep the resource alive. \`isActive()\` reads through the WeakRef, so if GC reclaimed the resource between checks, it correctly reports inactive (= not actually a leak).

The non-obvious gotcha: \`detectAsyncLeaks\` is OFF by default and noticeably slows tests because async_hooks fires for every Promise. Turn it on when investigating "why is my CI worker not exiting" or "why does \`vitest --watch\` keep hanging" — then turn it back off. Don't leave it on in everyday CI.

Common leak: \`setInterval(fn, 1000)\` in a module that's imported but never \`clearInterval\`d. Pattern fix: store the handle and \`clearInterval\` it in an \`afterAll\`, or use \`.unref()\` so it doesn't block process exit.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'leak-detection', 'async_hooks', 'memory', 'debugging'],
    repository: repo,
    filePath: 'packages/vitest/src/runtime/detect-async-leaks.ts',
    url: `${baseUrl}/packages/vitest/src/runtime/detect-async-leaks.ts`,
  },
  {
    title: 'In-source testing: includeSource lets you write tests next to the function they test',
    body: `Vitest supports tests inside source files via \`includeSource\` config — useful for util functions where keeping the test next to the impl beats jumping to a sibling \`*.spec.ts\`. The mechanic is in \`packages/vitest/src/node/project.ts\`:

\`\`\`ts
async typecheck(filters: string[] = []): Promise<void> {
  const { include, exclude, includeSource } = this.config
  // ...
  const files = await this.globAllTestFiles(include, exclude, includeSource, dir)
}

private async globAllTestFiles(include, exclude, includeSource, cwd) {
  // ...
  if (includeSource?.length) {
    const files = await this.globFiles(includeSource, exclude, cwd)
    // these files are scanned for \`if (import.meta.vitest)\` blocks
  }
}

// in test runner
this.config.includeSource?.length
  && pm.isMatch(relativeId, this.config.includeSource)
\`\`\`

To enable, in vitest.config.ts:

\`\`\`ts
export default defineConfig({
  test: {
    includeSource: ['src/**/*.{js,ts}'],
  },
  define: {
    'import.meta.vitest': 'undefined',  // strip in production builds
  },
})
\`\`\`

Then in your source file:

\`\`\`ts
// src/math.ts
export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it('clamps within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
}
\`\`\`

The \`import.meta.vitest\` global is injected by Vitest at test time — it's a reference to \`{ it, test, describe, expect, vi, ... }\` so you don't need a separate import (which would also ship to production).

The \`define: { 'import.meta.vitest': 'undefined' }\` in vite.config.ts (NOT the test config) tells Vite at build time to inline \`undefined\` for that expression. The dead-code-elimination pass then strips the entire \`if\` block from the production bundle. Without this define, the test code ships to your users — bug, not feature.

Three places this pattern shines:

1. **Pure utility functions.** No external dependencies, simple inputs/outputs. The test serves as documentation right at the function definition.
2. **Type-narrowing functions.** Tests that show "this returns a Date" or "this throws on null" are easier to verify when colocated.
3. **Doctest replacement.** Languages like Python, Rust, Go support tests inside the source. JavaScript got there last and through the side door.

The non-obvious gotcha: the entire file is loaded as an ESM module by both the test runner and your app. Imports at the top of the file run in production. So you can't \`import { describe } from 'vitest'\` at module scope — that would ship vitest to prod. Stick to \`import.meta.vitest\` for runtime access; helpers go inside the \`if\` block.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'in-source-testing', 'includeSource', 'import.meta.vitest'],
    repository: repo,
    filePath: 'packages/vitest/src/node/project.ts',
    url: `${baseUrl}/packages/vitest/src/node/project.ts`,
  },
  {
    title: 'Watch mode: forceRerunTriggers + watchTriggerPatterns control what re-runs what',
    body: `Watch mode rebuilds and re-runs tests on file changes. Two config knobs decide how aggressively: \`forceRerunTriggers\` (rerun ALL tests when these change) and \`watchTriggerPatterns\` (rerun specific tests when matching files change).

From \`packages/vitest/src/defaults.ts\`:

\`\`\`ts
forceRerunTriggers: ['**/package.json/**', '**/{vitest,vite}.config.*/**'],
\`\`\`

Any change to package.json or vitest/vite config triggers a full rerun because their effect can be global (a new dependency, a new alias, a changed environment).

\`watchTriggerPatterns\` (from \`packages/vitest/src/node/watcher.ts\`) is more targeted:

\`\`\`ts
if (!this.vitest.config.watchTriggerPatterns) {
  return
}
this.vitest.config.watchTriggerPatterns.forEach((definition) => {
  // when a file matches definition.pattern, run definition.testsToRun(filePath)
})
\`\`\`

Configure it like:

\`\`\`ts
test: {
  watchTriggerPatterns: [
    {
      pattern: /^src\\/api\\/(.+)\\.ts$/,
      testsToRun: (file, match) => \`tests/api/\${match[1]}.spec.ts\`,
    },
  ],
}
\`\`\`

When \`src/api/users.ts\` changes, Vitest reruns \`tests/api/users.spec.ts\` even though dependency tracking might not have linked them (e.g., test imports via dynamic path).

By default, watch mode uses Vite's module graph: changing a file reruns every test file that depends on it (transitively). That covers 95% of cases. The pattern matchers are escape hatches for the 5% — generated files, schema-driven tests, integration suites that test "the whole project".

\`vitest --changed\` (and \`--changed=HEAD~3\`) is the related "only run tests affected by recent commits" flag. It uses git to find changed files, then walks the dependency graph forward to find affected tests. Useful for PR pre-commit hooks: \`vitest --changed=origin/main --run\`.

Watch keybinds (printed when watch starts):

| Key | Action |
|---|---|
| \`a\` | rerun all |
| \`f\` | rerun only failed |
| \`u\` | update snapshots |
| \`p\` | filter by file pattern |
| \`t\` | filter by test name |
| \`q\` | quit |
| \`b\` | toggle browser mode |

The non-obvious gotcha: watch mode ignores files matching \`exclude\` for the trigger calculation, but Vite's module graph might still pull them in for HMR. So changing a file in node_modules doesn't trigger Vitest reruns even if some test imports it — by design, because node_modules churn during install would constantly rerun your tests. If you genuinely need to rerun on a node_modules change (a linked package during development), add it to \`forceRerunTriggers\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'watch', 'forceRerunTriggers', 'watchTriggerPatterns', '--changed'],
    repository: repo,
    filePath: 'packages/vitest/src/node/watcher.ts',
    url: `${baseUrl}/packages/vitest/src/node/watcher.ts`,
  },
  {
    title: 'Vitest UI: a sidecar Vite app that talks to the runner over /__vitest_api__',
    body: `The UI is a separate package (\`packages/ui\`) that mounts on the same Vite dev server Vitest already runs. It connects to the runner via a WebSocket on \`API_PATH = '/__vitest_api__'\` (constant in \`packages/vitest/src/constants.ts\`).

\`\`\`ts
// packages/vitest/src/constants.ts
export const defaultPort = 51204
export const API_PATH = '/__vitest_api__'

export const globalApis: string[] = ['suite', 'test', 'describe', 'it', /* ... */]
\`\`\`

Enable with \`vitest --ui\` (or \`ui: true\` in config). It opens a browser to \`localhost:51204/__vitest__/\` (path is \`uiBase: '/__vitest__/'\` in defaults).

What you get over the CLI:

| Feature | CLI | UI |
|---|---|---|
| Test list | text | tree with collapse |
| Re-run single test | \`-t\` flag | one click |
| Diff view | terminal | side-by-side syntax-highlighted |
| Console output per test | inline | per-test panel |
| Module graph | n/a | interactive dependency graph |
| Coverage | \`coverage/index.html\` | embedded report |

The UI is read-mostly — you can't write/edit tests from it. Trigger reruns via the run buttons, change the test name filter via the search box, but file changes still happen in your editor.

\`api: false\` in defaults means the API server is OFF unless you turn on UI or remote-control needs. If you want to script Vitest from outside (a custom dashboard, a CI bot), set \`api: true\` (or \`api: { port: 51204 }\`) and connect to \`ws://localhost:51204/__vitest_api__\`.

The CLI itself is the main interface for CI — UI doesn't ship in headless environments. The reporter is what controls CI output:

\`\`\`bash
vitest --reporter=default      # local dev
vitest --reporter=verbose      # CI debugging
vitest --reporter=junit        # CI test reports
vitest --reporter=github-actions  # auto when GITHUB_ACTIONS=true
vitest --reporter=blob         # serialized for shard merging
vitest --reporter=hanging-process  # shows what's keeping process alive
\`\`\`

Default reporter switches to \`['default', 'github-actions']\` automatically when \`process.env.GITHUB_ACTIONS === 'true'\` — the docs reference this in the configDefaults type comment. So you usually don't need to set anything for GH Actions; the annotations on failed lines just appear.

The non-obvious gotcha: UI mode uses the same Vite server as your app's dev mode if you have one configured. They can collide on port 5173 (Vite's default) — Vitest's UI port is 51204 to avoid this. If you've explicitly set \`server.port\` in vite.config.ts to something Vitest also wants, you'll get a port-already-in-use error. Solution: configure \`api.port\` in test config to a different port.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'ui', 'cli', 'reporter', 'api'],
    repository: repo,
    filePath: 'packages/vitest/src/constants.ts',
    url: `${baseUrl}/packages/vitest/src/constants.ts`,
  },
  {
    title: 'TypeScript-aware mock types: MockInstance, Mock<T>, and importing them from vitest',
    body: `Vitest exports rich types so spy/mock objects type-check end-to-end. The relevant exports are at the top of \`packages/vitest/src/integrations/vi.ts\`:

\`\`\`ts
import type {
  MaybeMocked,
  MaybeMockedDeep,
  MaybePartiallyMocked,
  MaybePartiallyMockedDeep,
  MockInstance,
} from '@vitest/spy'
import { clearAllMocks, fn, isMockFunction, resetAllMocks,
         restoreAllMocks, spyOn } from '@vitest/spy'
\`\`\`

The names you import from \`vitest\`:

\`\`\`ts
import type { Mock, MockInstance, Mocked, MockedFunction } from 'vitest'

// Mock<T> — full mock typed as the function it mocks
const fetchUser: Mock<(id: string) => Promise<User>> = vi.fn()
fetchUser.mockResolvedValue({ id: '1', name: 'A' }) // typed!
fetchUser('123')                                     // typed!

// MockInstance — what spyOn returns
const spy: MockInstance<typeof fs.readFile> = vi.spyOn(fs, 'readFile')

// Mocked<T> — for vi.mock('module') — every method is a mock
import * as api from './api'
vi.mock('./api')
const mockedApi = api as Mocked<typeof api>
mockedApi.fetchUser.mockResolvedValue(...) // .fetchUser is now a Mock

// MockedFunction — narrows a single function
const fn = api.fetchUser as MockedFunction<typeof api.fetchUser>
\`\`\`

The pattern that breaks newcomers: after \`vi.mock('./api')\`, TypeScript still sees the original module type — it doesn't know the export was replaced with mocks. You need a cast:

\`\`\`ts
vi.mock('./api')
import { fetchUser } from './api'

// fetchUser is typed as the original (id: string) => Promise<User>,
// but at runtime it's vi.fn(). To call .mockResolvedValue you need:
vi.mocked(fetchUser).mockResolvedValue({ id: '1' })
\`\`\`

\`vi.mocked()\` is a no-op runtime helper but a TypeScript narrowing function — it asserts to TS that the value is a Mock. Strongly recommend always going through it instead of \`as MockedFunction<>\` casts.

\`Mocked<T>\` (deep) walks an entire module's exports and types each as Mock. \`MaybeMocked<T>\` (in @vitest/spy) is the type before \`vi.mocked\` narrows it.

The non-obvious gotcha: \`Mock<T>\` in v1+ takes ONE generic — the function signature — not two. Older docs (pre-v1) showed \`Mock<Args[], Return>\`. Migrating: \`Mock<[string], Promise<User>>\` becomes \`Mock<(id: string) => Promise<User>>\`. The conversion is mechanical but easy to miss because the old form still type-checks (TypeScript ignores extra generics on some declarations).

For \`vi.fn()\` without a generic, you get \`Mock<() => undefined>\` — the implementation is "no-op returning undefined". Always pass either a generic or an implementation: \`vi.fn<typeof realFn>()\` or \`vi.fn(realFn)\`. Otherwise tests pass with bogus types because every call typed as \`undefined\` doesn't surface mismatches.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'typescript', 'Mock', 'MockInstance', 'vi.mocked', 'types'],
    repository: repo,
    filePath: 'packages/vitest/src/integrations/vi.ts',
    url: `${baseUrl}/packages/vitest/src/integrations/vi.ts`,
  },
  {
    title: 'jest-compat: name your aliases right and most Jest tests run unchanged',
    body: `Vitest is API-compatible with most Jest matchers but the runner namespace is \`vi\` instead of \`jest\`. The full list of compat surfaces lives across two files: globals (\`packages/vitest/src/constants.ts\`) and matchers (\`packages/expect/src/jest-expect.ts\`).

The compat layer:

\`\`\`ts
// packages/vitest/src/constants.ts — globals when globals: true
export const globalApis: string[] = [
  'suite', 'test', 'describe', 'it',     // Jest also has these
  'chai', 'expect', 'assert',
  'expectTypeOf', 'assertType',           // Vitest-only (typecheck)
  'vitest', 'vi',                         // 'vi' replaces 'jest'
  'beforeAll', 'afterAll', 'beforeEach', 'afterEach',
  'onTestFinished', 'onTestFailed',       // Vitest-specific cleanup hooks
]
\`\`\`

What works without changes when migrating from Jest:

- \`describe\`, \`it\`, \`test\`, \`expect\` — identical
- \`beforeAll\`, \`afterAll\`, \`beforeEach\`, \`afterEach\` — identical (with the ordering rules covered earlier)
- All matchers: \`toBe\`, \`toEqual\`, \`toMatchObject\`, \`toThrow\`, \`toHaveBeenCalled\`, etc. The implementations live in \`jest-expect.ts\` and are ports of Jest's
- \`expect.extend\`, \`expect.any\`, \`expect.objectContaining\` — identical
- \`toMatchSnapshot\` and \`toMatchInlineSnapshot\` — identical
- Async \`expect(promise).resolves\` / \`.rejects\` — identical

What needs find-replace:

| Jest | Vitest |
|---|---|
| \`jest.fn\` | \`vi.fn\` |
| \`jest.mock\` | \`vi.mock\` |
| \`jest.spyOn\` | \`vi.spyOn\` |
| \`jest.useFakeTimers\` | \`vi.useFakeTimers\` |
| \`jest.advanceTimersByTime\` | \`vi.advanceTimersByTime\` |
| \`jest.requireActual\` | \`(await vi.importActual('./mod'))\` |
| \`jest.resetModules\` | \`vi.resetModules\` |

What's different even after rename:

- \`vi.mock\` factory must be \`async\` if it calls \`importOriginal\` (Jest's was sync because Jest used commonjs). Vitest is ESM-first.
- \`vi.mock\` is hoisted by AST transform, not by being a "magic builtin" — patterns that obfuscate the call (aliasing, conditional) skip hoisting. Use \`vi.doMock\` for non-hoisted needs.
- \`jest.config.js\` becomes \`vitest.config.ts\` with a \`test\` block. Most options have direct equivalents (\`testEnvironment\` → \`environment\`, \`setupFiles\` → \`setupFiles\`, \`testMatch\` → \`include\`).
- ESM modules can't be spied on directly (covered in another entry). Use \`vi.mock\` with importOriginal instead.

For drop-in compat there's also an automated codemod: \`npx jest-codemods\` (community-maintained) handles 80% of the renames and flags the rest.

The non-obvious gotcha: \`globals: true\` does NOT inject \`jest\`. To make tests with \`jest.fn()\` work without changing source, add \`globalThis.jest = vi\` in a setup file. This is the smallest possible compat shim — most tests will then run unchanged.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['vitest', 'jest', 'compatibility', 'migration', 'globals'],
    repository: repo,
    filePath: 'packages/vitest/src/constants.ts',
    url: `${baseUrl}/packages/vitest/src/constants.ts`,
  },
];
