/**
 * Batch github-015-async-patterns
 *
 * 25 entries covering JavaScript async + concurrency patterns. The
 * primary source is sindresorhus/p-queue (real source files in
 * source/ and test/), with a few cross-references to bullmq's
 * backoff implementation and tanstack-query's retryer where the
 * pattern is clearer there.
 *
 * Authoring rules (see CORPUS-PLAN.md):
 * - Real attribution; no fabricated URLs
 * - 250-450 word body
 * - WHAT + HOW (real code) + WHY + non-obvious gotcha
 * - One topic per entry
 */

import type { SeedItem } from '../types';

const pQueueRepo = { owner: 'sindresorhus', name: 'p-queue' };
const pQueueBase = 'https://github.com/sindresorhus/p-queue/blob/main';

const bullmqRepo = { owner: 'taskforcesh', name: 'bullmq' };
const bullmqBase = 'https://github.com/taskforcesh/bullmq/blob/master';

const tanstackRepo = { owner: 'TanStack', name: 'query' };
const tanstackBase = 'https://github.com/TanStack/query/blob/main';

export const BATCH: SeedItem[] = [
  {
    title: 'p-queue: concurrency limit gates pending count, not queue size',
    body: `\`concurrency\` in p-queue caps how many tasks may be \`pending\` (running) at once. The check lives in \`#doesConcurrentAllowAnother\` and is consulted on every \`#tryToStartAnother\` call:

\`\`\`ts
get #doesConcurrentAllowAnother(): boolean {
  return this.#pending < this.#concurrency;
}

#tryToStartAnother(): boolean {
  if (this.#queue.size === 0) { /* emit empty/idle */ return false; }
  if (!this.#isPaused) {
    if (this.#doesIntervalAllowAnother && this.#doesConcurrentAllowAnother) {
      const job = this.#queue.dequeue()!;
      this.emit('active');
      job();
      // ...
    }
  }
}
\`\`\`

Tasks added with \`queue.add(fn)\` are pushed into the underlying \`PriorityQueue\` and \`#tryToStartAnother\` is invoked synchronously. If a slot is free, the task starts immediately — \`add()\` resolves later with the task's result. The returned promise represents the task, not the enqueue.

The setter validates and re-runs the scheduler, so you can raise/lower concurrency at runtime without restarting the queue:

\`\`\`ts
set concurrency(newConcurrency: number) {
  if (!(typeof newConcurrency === 'number' && newConcurrency >= 1)) {
    throw new TypeError(/* ... */);
  }
  this.#concurrency = newConcurrency;
  this.#processQueue();
}
\`\`\`

\`#processQueue\` loops \`while (this.#tryToStartAnother()) {}\`, so increasing concurrency from 1 to 4 will fire three more jobs in the same tick — no \`setImmediate\` delay.

Non-obvious gotcha: ordering. The queue is a sorted insertion structure (priority queue), not a FIFO. With the default priority of 0 across all tasks, p-queue degrades to FIFO because \`PriorityQueue.enqueue\` short-circuits to \`push\` when the last element's priority is \`>=\` the new one. The moment you pass even one \`{priority: 1}\`, every later \`{priority: 0}\` insertion does an O(log n) \`lowerBound\` search and an O(n) \`splice\`. For a queue with thousands of waiting items, that's a measurable cost — consider a separate queue per priority class instead.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['p-queue', 'concurrency', 'queue', 'scheduler'],
    repository: pQueueRepo,
    filePath: 'source/index.ts',
    url: `${pQueueBase}/source/index.ts`,
  },
  {
    title: 'p-queue: priority queue uses binary search insertion (lower_bound)',
    body: `The default queue class is \`PriorityQueue\`. Higher priority numbers run first. Insertion is O(log n) compare + O(n) splice via a port of C++'s \`std::lower_bound\`:

\`\`\`ts
enqueue(run: RunFunction, options?: Partial<PriorityQueueOptions>): void {
  const {priority = 0, id} = options ?? {};
  const element = {priority, id, run};

  if (this.size === 0 || this.#queue[this.size - 1]!.priority! >= priority) {
    this.#queue.push(element);
    return;
  }

  const index = lowerBound(
    this.#queue,
    element,
    (a, b) => b.priority! - a.priority!,
  );
  this.#queue.splice(index, 0, element);
}
\`\`\`

The fast-path matters: when every task has the same priority (the default), \`enqueue\` is just an array push — O(1). The slow path only kicks in when priorities differ. The comparator \`(a, b) => b.priority - a.priority\` means \`lowerBound\` finds the first index whose priority is strictly less than the new element's priority, then splices in front of it. So among equal priorities, FIFO ordering is preserved.

The \`lower-bound.ts\` implementation is a textbook binary search:

\`\`\`ts
export default function lowerBound<T>(array, value, comparator): number {
  let first = 0;
  let count = array.length;
  while (count > 0) {
    const step = Math.trunc(count / 2);
    let it = first + step;
    if (comparator(array[it]!, value) <= 0) {
      first = ++it;
      count -= step + 1;
    } else {
      count = step;
    }
  }
  return first;
}
\`\`\`

Non-obvious gotcha: \`setPriority(id, newPriority)\` does a linear \`findIndex\` by id, splices the element out, and re-enqueues it. So updating priority of a queued task is O(n). For a 10k-item queue with frequent re-prioritization, this becomes the bottleneck — track priorities at the application level and re-add tasks instead, or maintain an id-to-index map outside the library.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['p-queue', 'priority-queue', 'binary-search', 'data-structures'],
    repository: pQueueRepo,
    filePath: 'source/priority-queue.ts',
    url: `${pQueueBase}/source/priority-queue.ts`,
  },
  {
    title: 'p-queue: per-task timeout starts when the task is dequeued, not added',
    body: `\`timeout\` (queue-wide or per-task) wraps the operation in \`p-timeout\`. The timer starts inside the \`run\` closure — i.e. when the scheduler actually invokes the task, not when you call \`add()\`:

\`\`\`ts
let operation = function_({signal: options.signal});

if (options.timeout) {
  operation = pTimeout(Promise.resolve(operation), {
    milliseconds: options.timeout,
    message: \`Task timed out after \${options.timeout}ms (queue has \${this.#pending} running, \${this.#queue.size} waiting)\`,
  });
}
\`\`\`

The error thrown is \`TimeoutError\` from \`p-timeout\`, re-exported from p-queue. Older versions had a \`throwOnTimeout: false\` option that would resolve to \`undefined\` instead of rejecting; that option was removed and the library now always throws on timeout.

The error message is genuinely useful: it includes the current pending and waiting counts at the moment of timeout, which makes triage easier ("we timed out because 50 things were ahead of me" vs "we timed out because the upstream is slow").

\`\`\`js
import PQueue, {TimeoutError} from 'p-queue';
const queue = new PQueue({timeout: 1000});
try {
  await queue.add(() => someTask());
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Task timed out');
  }
}
\`\`\`

Non-obvious gotcha: the timeout does NOT abort the underlying operation. \`pTimeout\` only races a timer against the user's promise — it cannot stop the work. If your task is a \`fetch\`, the request keeps running and its body keeps streaming until the network finishes or your code GCs the promise. To actually cancel work on timeout, wire your own \`AbortController\`:

\`\`\`js
const controller = new AbortController();
queue.add(({signal}) => fetch(url, {signal}), {timeout: 1000, signal: controller.signal});
\`\`\`

p-queue passes the queue's own signal into your task as the first argument; you can also pass an external one. Combining the two is the only way to make timeout-cancellation actually free up the network slot.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['p-queue', 'timeout', 'p-timeout', 'cancellation'],
    repository: pQueueRepo,
    filePath: 'source/index.ts',
    url: `${pQueueBase}/source/index.ts#L443`,
  },
  {
    title: 'p-queue: pause / start / clear semantics — what each one does to in-flight work',
    body: `Three lifecycle methods, three different effects on running tasks:

\`\`\`ts
start(): this {
  if (!this.#isPaused) return this;
  this.#isPaused = false;
  this.#processQueue();
  return this;
}

pause(): void {
  this.#isPaused = true;
}

clear(): void {
  for (const cleanupQueueAbortHandler of this.#queueAbortListenerCleanupFunctions) {
    cleanupQueueAbortHandler();
  }
  this.#queue = new this.#queueClass();
  this.#clearIntervalTimer();
  this.#updateRateLimitState();
  this.emit('empty');
  if (this.#pending === 0) {
    this.#clearTimeoutTimer();
    this.emit('idle');
  }
  this.emit('next');
}
\`\`\`

\`pause()\` flips a boolean. Already-running tasks (those whose \`#pending++\` has happened) keep going to completion. Only \`#tryToStartAnother\` checks \`#isPaused\` before dequeuing the next item. So \`pause()\` is "stop scheduling new work," not "stop everything."

\`start()\` flips the boolean back and immediately drains as many tasks as concurrency / interval allow, in one synchronous pass via \`#processQueue\`.

\`clear()\` replaces the underlying queue with a fresh instance. Anything queued is gone. Anything running is unaffected — the task's \`run\` closure still holds its captured state and will complete normally. Critically, the comment in the source notes: \`// Note: We preserve strict mode rate-limiting state (ticks and timeout) // because clear() only clears queued tasks, not rate limit history.\` So a strict-mode queue still counts the recent tick history toward future capacity even after a clear.

Non-obvious gotcha: \`clear()\` aborts all queued tasks via their registered abort handlers, which causes their \`add()\` promises to reject. If you have an unhandled rejection handler, you'll see those errors. The fix is the same as for any \`add()\`: \`.catch(() => {})\` at call site, or use \`addAll\` and \`await Promise.allSettled(promises)\` so unhandled rejections don't bubble to the process.

If you need "stop everything immediately," there's no built-in: pause + clear + iterate \`runningTasks\` and abort each one's signal yourself.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['p-queue', 'lifecycle', 'pause', 'clear', 'semantics'],
    repository: pQueueRepo,
    filePath: 'source/index.ts',
    url: `${pQueueBase}/source/index.ts#L595`,
  },
  {
    title: 'p-queue: lifecycle events (active / idle / empty / next / add / completed / error)',
    body: `\`PQueue\` extends \`EventEmitter\` (eventemitter3). Seven event names are documented; each fires at a specific scheduler phase:

\`\`\`ts
type EventName =
  | 'active' | 'idle' | 'empty' | 'add' | 'next'
  | 'completed' | 'error'
  | 'pendingZero' | 'rateLimit' | 'rateLimitCleared';
\`\`\`

The emit points are scattered through \`#tryToStartAnother\`, \`#next\`, \`add\`, and the run closure:

\`\`\`ts
// add() body
this.emit('add');
this.#tryToStartAnother();

// #tryToStartAnother — when queue is drained
if (this.#queue.size === 0) {
  this.emit('empty');
  if (this.#pending === 0) this.emit('idle');
  return false;
}
// — when a job actually starts
this.emit('active');
job();

// run closure on settle
this.emit('completed', result); // success
this.emit('error', error);      // failure

// #next — fires after every task settles
this.#pending--;
if (this.#pending === 0) this.emit('pendingZero');
this.emit('next');
\`\`\`

The distinction worth memorizing: \`empty\` fires the moment the WAIT queue hits zero (work may still be running). \`idle\` fires only when waiting AND pending are both zero. \`pendingZero\` fires when pending hits zero regardless of queue size — useful when you want to wait for in-flight work without caring about anything that's been re-added.

\`onIdle()\`, \`onEmpty()\`, \`onPendingZero()\` are sugar over these events:

\`\`\`ts
async onIdle(): Promise<void> {
  if (this.#pending === 0 && this.#queue.size === 0) return;
  await this.#onEvent('idle');
}
\`\`\`

Non-obvious gotcha: \`onIdle()\` resolves on the FIRST \`idle\` after you await it. If new work is added between resolution and your next statement, you don't get notified again — call \`onIdle()\` once per drain cycle. Also: the \`error\` event fires for every task failure, so a global \`queue.on('error', logger)\` will receive every rejection. The promise from \`add()\` ALSO rejects independently — the docs explicitly warn you must \`.catch(() => {})\` each \`add()\` to avoid unhandled rejections, even if you have an \`error\` listener.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['p-queue', 'events', 'eventemitter', 'lifecycle'],
    repository: pQueueRepo,
    filePath: 'source/index.ts',
    url: `${pQueueBase}/source/index.ts#L11`,
  },
  {
    title: 'p-queue: AbortSignal handling — abort while queued vs abort while running',
    body: `\`add(fn, {signal})\` accepts an \`AbortSignal\` and reacts differently depending on which lifecycle stage the task is in.

While the task is QUEUED (not yet running), p-queue installs a synchronous abort handler that removes the task from the queue and rejects its \`add()\` promise:

\`\`\`ts
const queueAbortHandler = () => {
  cleanupQueueAbortHandler();
  removeQueuedTask();
  reject(signal.reason);
  this.#tryToStartAnother();
  this.emit('next');
};

if (signal.aborted) {
  queueAbortHandler();
  return;
}
signal.addEventListener('abort', queueAbortHandler, {once: true});
\`\`\`

Once the task transitions to RUNNING, that queued-state handler is removed (\`cleanupQueueAbortHandler()\` runs first thing inside \`run\`). Now p-queue races the operation against an abort-listener promise:

\`\`\`ts
options.signal?.throwIfAborted();
let operation = function_({signal: options.signal});
if (options.signal) {
  const {signal} = options;
  operation = Promise.race([operation, new Promise<never>((_resolve, reject) => {
    eventListener = () => { reject(signal.reason); };
    signal.addEventListener('abort', eventListener, {once: true});
  })]);
}
const result = await operation;
\`\`\`

The race rejects \`add()\`'s promise with \`signal.reason\` when the abort fires. p-queue ALSO passes the same signal into your task as \`fn({signal})\` so your work can listen to it and stop early.

Non-obvious gotcha: aborting after the task starts does NOT actually stop your work. The race only rejects the OUTER promise — the underlying operation keeps running until your code reacts to \`signal\`. If you fire-and-forget a \`fetch()\` without passing the signal in, the network request continues to completion and its eventual resolution is silently discarded. The pending counter only decrements after the original operation settles, so you can also leak a pending slot until the work finishes naturally. Always plumb the signal through to whatever async primitive you call (\`fetch\`, child_process, db client) — the queue gives you the signal but won't enforce its use.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['p-queue', 'abort-controller', 'cancellation', 'abort-signal'],
    repository: pQueueRepo,
    filePath: 'source/index.ts',
    url: `${pQueueBase}/source/index.ts#L499`,
  },
  {
    title: 'p-queue: rate limiting — fixed-window vs strict (sliding-window) mode',
    body: `\`{interval, intervalCap}\` give you fixed-window rate limiting. \`{interval, intervalCap, strict: true}\` switches to a sliding window. The two have very different burst behavior.

Fixed window uses a \`setInterval\` and a counter that resets each tick:

\`\`\`ts
this.#intervalId = setInterval(() => { this.#onInterval(); }, this.#interval);

#onInterval(): void {
  if (!this.#strict) {
    this.#intervalCount = this.#carryoverIntervalCount ? this.#pending : 0;
  }
  this.#processQueue();
}
\`\`\`

This is cheap (one timer, one integer) but allows boundary bursts. With \`intervalCap: 2, interval: 1000\`, you can fire 2 tasks at t=999ms, the window resets at t=1000ms, and 2 more fire at t=1001ms — 4 tasks in 2ms.

Strict mode tracks individual execution timestamps in a circular buffer:

\`\`\`ts
#consumeIntervalSlot(now: number): void {
  if (this.#strict) this.#strictTicks.push(now);
  else this.#intervalCount++;
}

#cleanupStrictTicks(now: number): void {
  while (this.#strictTicksStartIndex < this.#strictTicks.length) {
    const oldestTick = this.#strictTicks[this.#strictTicksStartIndex];
    if (oldestTick !== undefined && now - oldestTick >= this.#interval) {
      this.#strictTicksStartIndex++;
    } else { break; }
  }
  // Compact when wasted prefix grows large
}
\`\`\`

Before each dispatch decision, strict mode evicts ticks older than \`interval\` and checks whether the active count is below \`intervalCap\`. If at capacity, it schedules a one-shot \`setTimeout\` for exactly \`interval - (now - oldestTick)\` ms — wake exactly when the next slot opens.

The constructor enforces two invariants for strict mode: \`interval\` must be non-zero and \`intervalCap\` must be finite. Both make sense — without them, the sliding window has no width or no ceiling.

Non-obvious gotcha: the \`carryoverIntervalCount\` option has no effect in strict mode (the comment in options.ts says so explicitly). It's a fixed-window-only knob that controls whether tasks that didn't finish in their window still count against the next window's cap.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['p-queue', 'rate-limiting', 'sliding-window', 'fixed-window', 'strict'],
    repository: pQueueRepo,
    filePath: 'source/index.ts',
    url: `${pQueueBase}/source/index.ts#L137`,
  },
  {
    title: 'p-queue: onIdle vs onEmpty vs onPendingZero — three "wait for done" semantics',
    body: `Three near-identical-looking awaitables; each waits for a different condition:

\`\`\`ts
async onEmpty(): Promise<void> {
  if (this.#queue.size === 0) return;
  await this.#onEvent('empty');
}

async onIdle(): Promise<void> {
  if (this.#pending === 0 && this.#queue.size === 0) return;
  await this.#onEvent('idle');
}

async onPendingZero(): Promise<void> {
  if (this.#pending === 0) return;
  await this.#onEvent('pendingZero');
}

async onSizeLessThan(limit: number): Promise<void> {
  if (this.#queue.size < limit) return;
  await this.#onEvent('next', () => this.#queue.size < limit);
}
\`\`\`

\`onEmpty\`: queue.size === 0. Tasks may still be running. Useful when you want to know "I can stop adding, the queue won't grow" but don't care that work is still in-flight.

\`onIdle\`: queue.size === 0 AND pending === 0. The strongest "all done" guarantee. Use this before tearing down a queue at process exit.

\`onPendingZero\`: pending === 0 regardless of queue size. Useful in producer-consumer setups where you want to know that all CURRENTLY-RUNNING tasks have settled before reading shared state, but you intend to keep adding more work.

\`onSizeLessThan(limit)\`: backpressure. \`await queue.onSizeLessThan(queue.concurrency)\` before adding a new item caps memory growth — useful when you're feeding a queue from a streaming source faster than it can drain.

The \`#onEvent\` helper installs a one-shot listener and resolves on the next emit. Each call binds to one event firing; the resolution is single-shot.

Non-obvious gotcha: there's a TOCTOU between "queue empty now" and "you await later." \`onIdle()\` returns a resolved promise if conditions are met at call time, otherwise it installs a listener — but the queue could go idle in the gap. The library handles this by checking the condition synchronously at the top. The \`onSizeLessThan\` filter \`() => this.#queue.size < limit\` re-checks every \`next\` emit because new tasks may have been added between events.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['p-queue', 'onidle', 'backpressure', 'await', 'lifecycle'],
    repository: pQueueRepo,
    filePath: 'source/index.ts',
    url: `${pQueueBase}/source/index.ts#L652`,
  },
  {
    title: 'p-queue: addAll uses Promise.all — partial failure poisons the batch result',
    body: `\`addAll\` is a one-line convenience over \`add\`:

\`\`\`ts
async addAll<TaskResultsType>(
  functions: ReadonlyArray<Task<TaskResultsType>>,
  options?: Partial<EnqueueOptionsType>,
): Promise<TaskResultsType[]> {
  return Promise.all(functions.map(async function_ => this.add(function_, options)));
}
\`\`\`

It enqueues every task synchronously (so concurrency / interval limits apply) and returns a single promise that resolves to an array of results. The choice of \`Promise.all\` (not \`allSettled\`) is the source of most addAll surprises.

Behavior implications:

1. If ANY task throws, the returned promise rejects with the first error. The other tasks keep running — you don't get to inspect their results from the addAll return value.
2. The rejected addAll promise has no reference to the still-running siblings. They will eventually settle and emit \`completed\` or \`error\` events on the queue, but their per-task promises (the inner \`this.add(...)\` calls) become orphaned. If you didn't attach \`.catch\` to those inner promises (you can't — \`addAll\` swallowed them), you may get unhandledRejection warnings.
3. Options apply uniformly. If you pass \`{priority: 5, signal: ctrl.signal}\` to addAll, every task gets the same priority and the same signal. Aborting the signal aborts all tasks at once.

When to NOT use addAll:

\`\`\`js
// Want all results regardless of failures?
const results = await Promise.allSettled(
  fns.map(fn => queue.add(fn).catch(e => ({error: e})))
);
\`\`\`

\`Promise.allSettled\` waits for every input to settle and returns \`{status: 'fulfilled' | 'rejected', value | reason}\` — exactly what you want for "best effort, tell me what happened to each."

Non-obvious gotcha: there's no AbortError-aware variant. If you abort halfway through, addAll rejects with the first AbortError but the still-queued tasks each individually reject with AbortError too. Because addAll already awaited, those rejections are unhandled. Wrap each \`fns.map\` element in \`.catch(noop)\` if you abort frequently.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['p-queue', 'addall', 'promise-all', 'promise-allsettled', 'partial-failure'],
    repository: pQueueRepo,
    filePath: 'source/index.ts',
    url: `${pQueueBase}/source/index.ts#L581`,
  },
  {
    title: 'p-queue: queueMicrotask in the run closure prevents stack overflow on long bursts',
    body: `Inside the \`run\` closure that wraps each task, the \`finally\` block does not call \`#next()\` directly — it queues a microtask:

\`\`\`ts
} finally {
  if (eventListener) {
    options.signal?.removeEventListener('abort', eventListener);
  }
  this.#runningTasks.delete(taskSymbol);

  // Use queueMicrotask to prevent deep recursion while maintaining timing
  queueMicrotask(() => {
    this.#next();
  });
}
\`\`\`

The reason: \`#next\` calls \`#tryToStartAnother\`, which dequeues a job and calls \`job()\` synchronously. If that job's promise is already resolved (e.g. \`queue.add(() => 'instant')\`), its \`then\` handler runs in the same microtask, hitting \`finally\` again, which would recurse into \`#next\` → \`#tryToStartAnother\` → \`job()\` → \`finally\` → ... and blow the stack on a queue of N synchronous tasks.

\`queueMicrotask\` breaks the chain: it appends a fresh microtask to the queue, which the engine drains AFTER the current one returns. Each task gets its own slot on the microtask queue, and the call stack stays bounded.

The same trick appears in the rate-limit update path:

\`\`\`ts
#scheduleRateLimitUpdate(): void {
  if (this.#isIntervalIgnored || this.#rateLimitFlushScheduled) return;
  this.#rateLimitFlushScheduled = true;
  queueMicrotask(() => {
    this.#rateLimitFlushScheduled = false;
    this.#updateRateLimitState();
  });
}
\`\`\`

The \`#rateLimitFlushScheduled\` flag de-dupes — if multiple events fire in the same tick (add + next + active), only one microtask runs. This is important because rate-limit state changes can themselves trigger new events.

Non-obvious gotcha: \`queueMicrotask\` runs before \`setTimeout(0)\` and before any I/O callbacks but after the current synchronous code. So the \`active\` event observer cannot rely on \`pending\` being decremented yet — \`#next\` runs in a later microtask. If you build dashboards or metrics from these events, snapshot the counters lazily inside the listener, not eagerly with the event payload.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['p-queue', 'queuemicrotask', 'microtask', 'stack-overflow', 'event-loop'],
    repository: pQueueRepo,
    filePath: 'source/index.ts',
    url: `${pQueueBase}/source/index.ts#L527`,
  },
  {
    title: 'p-queue: onError + Promise.race for fail-fast across many tasks',
    body: `\`queue.onError()\` returns a promise that rejects on the first task error. The intended use is \`Promise.race\` against \`onIdle\` to fail fast while still resolving normally on success:

\`\`\`ts
onError(): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    const handleError = (error: unknown) => {
      this.off('error', handleError);
      reject(error);
    };
    this.on('error', handleError);
  });
}
\`\`\`

The pattern from the JSDoc:

\`\`\`js
const queue = new PQueue({concurrency: 2});

queue.add(() => fetchData(1)).catch(() => {});
queue.add(() => fetchData(2)).catch(() => {});
queue.add(() => fetchData(3)).catch(() => {});

try {
  await Promise.race([queue.onError(), queue.onIdle()]);
} catch (error) {
  queue.pause(); // Stop processing remaining tasks
  console.error('Queue failed:', error);
}
\`\`\`

If any task fails, \`onError\` rejects, the race throws, the catch pauses the queue. If everything succeeds, \`onIdle\` resolves and the race resolves normally. \`onError\` removes its own listener as soon as it fires, so it's single-shot.

Critical detail the docs call out explicitly: "The promise returned by \`add()\` still rejects. You must handle each \`add()\` promise (for example, \`.catch(() => {})\`) to avoid unhandled rejections." \`onError\` listens to the queue's error event but does NOT consume the rejection on the per-task promise. They're independent paths to the same error.

Non-obvious gotcha: \`onError\` only catches the first error after you call it. Errors that already happened don't replay. If you call \`onError\` AFTER tasks have started failing, you might miss them — there's no error backlog. For long-running queues where you want a global error sink, attach \`queue.on('error', handler)\` once at construction time and don't rely on \`onError\` for that purpose.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['p-queue', 'onerror', 'fail-fast', 'promise-race'],
    repository: pQueueRepo,
    filePath: 'source/index.ts',
    url: `${pQueueBase}/source/index.ts#L756`,
  },
  {
    title: 'p-queue: isSaturated detects backpressure (concurrency or rate-limit)',
    body: `\`isSaturated\` is a single boolean that tells you whether the queue is currently unable to accept new work without queueing it:

\`\`\`ts
get isSaturated(): boolean {
  return (this.#pending === this.#concurrency && this.#queue.size > 0)
    || (this.isRateLimited && this.#queue.size > 0);
}
\`\`\`

It's true when (a) every concurrency slot is occupied AND there's queued work waiting, OR (b) the queue is rate-limited AND there's queued work waiting. The \`size > 0\` clause is what distinguishes "we just happen to have all slots full" from "we have a backlog."

Two practical uses, both in the JSDoc:

\`\`\`js
// Backpressure for producers
if (queue.isSaturated) {
  console.log('Queue is saturated, waiting for capacity...');
  await queue.onSizeLessThan(queue.concurrency);
}

// Monitoring for stuck tasks
setInterval(() => {
  if (queue.isSaturated) {
    console.warn(\`Queue saturated: \${queue.pending} running, \${queue.size} waiting\`);
  }
}, 60000);
\`\`\`

The first use is the right way to bridge a streaming source to a bounded queue. \`onSizeLessThan(queue.concurrency)\` blocks the producer until at least one slot opens; this gives you natural backpressure without an external semaphore.

The second use is observability: a queue that stays saturated for minutes is usually either rate-limited beyond recovery or has stuck tasks. Combined with \`runningTasks\` (which exposes per-task \`startTime\`), you can identify which tasks have been pending too long:

\`\`\`js
const stuck = queue.runningTasks.filter(t => Date.now() - t.startTime > 30000);
\`\`\`

Non-obvious gotcha: \`isSaturated\` is a snapshot getter, not an event. It can flip true → false → true many times in a single event-loop turn as tasks complete and new ones are added. If you build a metric on top, sample it on a fixed schedule (the second example above uses 60s) rather than reading it inside event handlers — otherwise you'll see noise rather than signal.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['p-queue', 'backpressure', 'saturation', 'monitoring'],
    repository: pQueueRepo,
    filePath: 'source/index.ts',
    url: `${pQueueBase}/source/index.ts#L918`,
  },
  {
    title: 'AbortController composition: forwarding a signal across nested async work',
    body: `p-queue's task receives an \`AbortSignal\` and the docs show the canonical composition pattern: forward the signal to every async primitive your task touches.

\`\`\`ts
import PQueue, {AbortError} from 'p-queue';
import got, {CancelError} from 'got';

const queue = new PQueue();
const controller = new AbortController();

try {
  await queue.add(({signal}) => {
    const request = got('https://sindresorhus.com');
    signal.addEventListener('abort', () => {
      request.cancel();
    });
    try {
      return await request;
    } catch (error) {
      if (!(error instanceof CancelError)) throw error;
    }
  }, {signal: controller.signal});
} catch (error) {
  if (!(error instanceof AbortError)) throw error;
}
\`\`\`

Key composition rules visible in this snippet:

1. The OUTER signal (\`controller.signal\`) is what the caller controls. p-queue passes it INTO the task as the inner \`signal\` parameter. They're the same object.
2. The task body wires \`signal.addEventListener('abort', ...)\` to translate the AbortSignal into the request library's own cancellation API. Some libraries (\`fetch\`, undici, \`axios\` ≥ 0.22) accept \`{signal}\` directly; older ones have their own \`request.cancel()\` API and need this manual bridge.
3. The catch on the inner request handles the library-specific cancel error (\`CancelError\` for got). The catch on the outer await handles \`AbortError\` (which p-queue throws when the signal aborts before the task starts running).

For \`fetch\`, the equivalent is one line:

\`\`\`js
queue.add(({signal}) => fetch(url, {signal}), {signal: controller.signal});
\`\`\`

For nested fetches, pass the same signal to every call. \`AbortSignal.any([sig1, sig2])\` (Node 20+) lets you compose signals — the resulting signal aborts when ANY input aborts, so you can bind a request to "user cancelled OR queue cleared OR per-request timeout."

Non-obvious gotcha: an \`AbortSignal\` cannot be re-armed. Once aborted, every check returns true forever. For retry loops where you want each attempt to have its own timeout signal, create a new \`AbortController\` per attempt and compose with the outer cancellation signal via \`AbortSignal.any\`. Reusing one controller across retries means the second attempt is already aborted before it starts.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['abort-controller', 'abort-signal', 'cancellation', 'composition'],
    repository: pQueueRepo,
    filePath: 'source/options.ts',
    url: `${pQueueBase}/source/options.ts#L111`,
  },
  {
    title: 'tanstack-query: defaultRetryDelay uses capped exponential backoff',
    body: `TanStack Query's default retry delay is capped exponential backoff — 1s, 2s, 4s, 8s, ... up to 30s:

\`\`\`ts
function defaultRetryDelay(failureCount: number) {
  return Math.min(1000 * 2 ** failureCount, 30000)
}
\`\`\`

The retryer's run loop applies it after each failure:

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

if (isRetryCancelled || !shouldRetry) {
  reject(error)
  return
}

failureCount++
config.onFail?.(failureCount, error)
sleep(delay)
  .then(() => canContinue() ? undefined : pause())
  .then(() => { isRetryCancelled ? reject(error) : run() })
\`\`\`

Two product decisions worth understanding. First: server defaults to \`retry: 0\` while client defaults to \`retry: 3\`. Servers are usually behind a reverse proxy that has its own retry logic; doubling that up wastes upstream capacity. Second: the delay is computed BEFORE \`canContinue()\` is checked. If the user goes offline mid-backoff, \`sleep(delay)\` still runs to completion, then \`pause()\` blocks until \`focus + online\` returns. The user pays the backoff time even if they were already going to wait for online.

Non-obvious gotcha: this implementation has NO jitter. If 1000 clients all fail at the same moment (e.g. a brief server outage), they all retry in lockstep at t+1s, t+3s, t+7s, t+15s. The thundering-herd problem is real — you can be the source of your own outage when the API recovers. For high-traffic apps, override \`retryDelay\` with jittered exponential:

\`\`\`ts
retryDelay: (n) => Math.min(1000 * 2 ** n, 30000) * (0.5 + Math.random() * 0.5)
\`\`\`

This spreads retries across a window. BullMQ's exponential backoff (in \`src/classes/backoffs.ts\`) supports a \`jitter\` parameter natively and is worth comparing.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['retry', 'exponential-backoff', 'tanstack-query', 'thundering-herd'],
    repository: tanstackRepo,
    filePath: 'packages/query-core/src/retryer.ts',
    url: `${tanstackBase}/packages/query-core/src/retryer.ts#L49`,
  },
  {
    title: 'bullmq: built-in exponential backoff with optional jitter',
    body: `BullMQ ships two built-in backoff strategies — \`fixed\` and \`exponential\` — both with optional jitter. The implementation is in \`src/classes/backoffs.ts\`:

\`\`\`ts
static builtinStrategies: BuiltInStrategies = {
  fixed: function (delay: number, jitter = 0) {
    return function (): number {
      if (jitter > 0) {
        const minDelay = delay * (1 - jitter);
        return Math.floor(Math.random() * delay * jitter + minDelay);
      } else {
        return delay;
      }
    };
  },

  exponential: function (delay: number, jitter = 0) {
    return function (attemptsMade: number): number {
      if (jitter > 0) {
        const maxDelay = Math.round(Math.pow(2, attemptsMade - 1) * delay);
        const minDelay = maxDelay * (1 - jitter);
        return Math.floor(Math.random() * maxDelay * jitter + minDelay);
      } else {
        return Math.round(Math.pow(2, attemptsMade - 1) * delay);
      }
    };
  },
};
\`\`\`

Read carefully: the exponential formula is \`2^(attempts - 1) * delay\`. Attempt 1 gives \`delay\` ms. Attempt 2 gives \`2 * delay\`. Attempt 3 gives \`4 * delay\`. So with \`{type: 'exponential', delay: 1000}\` and 5 attempts, total wait time before final failure is 1 + 2 + 4 + 8 + 16 = 31 seconds. Plan your \`attempts\` and \`delay\` together — naive defaults can make a worker look stuck for hours.

The \`jitter\` parameter is fractional (0..1). \`jitter: 0.5\` means the actual delay is uniformly distributed in \`[maxDelay * 0.5, maxDelay]\` — half-jitter. \`jitter: 1\` gives full jitter (\`[0, maxDelay]\`). The half-jitter form is generally preferred — it spreads the herd without making fast retries effectively never happen.

\`\`\`ts
static normalize(backoff: number | BackoffOptions): BackoffOptions | undefined {
  if (Number.isFinite(<number>backoff)) {
    return { type: 'fixed', delay: <number>backoff };
  } else if (backoff) {
    return <BackoffOptions>backoff;
  }
}
\`\`\`

If you pass a plain number, it's normalized to \`{type: 'fixed', delay: n}\`. If you want jitter, you must use the object form.

Non-obvious gotcha: this is "decorrelated" only with respect to siblings retrying at the same instant — successive retries of the SAME job are still strictly increasing in expected delay. AWS's "decorrelated jitter" formula (\`min(cap, random(base, prev * 3))\`) gives better throughput under saturation, but you'd need a custom strategy in BullMQ to use it.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'backoff', 'exponential-backoff', 'jitter', 'retry'],
    repository: bullmqRepo,
    filePath: 'src/classes/backoffs.ts',
    url: `${bullmqBase}/src/classes/backoffs.ts`,
  },
  {
    title: 'Idempotency and retry safety: which errors are safe to retry',
    body: `TanStack Query's retryer (\`packages/query-core/src/retryer.ts\`) gives you three ways to express retry policy. Each has a different idempotency contract:

\`\`\`ts
const shouldRetry =
  retry === true ||
  (typeof retry === 'number' && failureCount < retry) ||
  (typeof retry === 'function' && retry(failureCount, error))
\`\`\`

\`retry: true\` — retry forever. Only safe for fully idempotent reads.
\`retry: 3\` — retry up to N times regardless of error. Common default; appropriate for GET requests that the server cannot side-effect on.
\`retry: (failureCount, error) => boolean\` — the only form that lets you make idempotency decisions.

The right shape for the function form is to inspect the error and decide:

\`\`\`ts
retry: (failureCount, error) => {
  // Never retry 4xx — the server told us it's our fault
  if (error.status >= 400 && error.status < 500) return false;
  // Never retry past 3 attempts
  if (failureCount >= 3) return false;
  return true;
}
\`\`\`

Why 4xx is generally not safe to retry: the server's response is typically deterministic given the request. A 401 won't become 200 by trying again; a 422 validation error won't pass on attempt two. Retrying wastes network round-trips and may rate-limit you. The exception is 408 (Request Timeout) and 429 (Too Many Requests) — these are legitimately transient and Retry-After-aware.

Why 5xx and network errors usually ARE safe to retry — but only for idempotent operations:

- GET, PUT, DELETE: idempotent by HTTP semantics. Repeating them gives the same end state.
- POST: NOT idempotent in general. A POST that creates an order can create two orders if you retry after a successful write whose response was lost.

Non-obvious gotcha: a POST that timed out from the CLIENT's perspective may have succeeded server-side. The TCP RST or socket-hang-up arrived after the server had already processed the request. Retrying causes a duplicate side effect. The only correct fixes are server-side idempotency keys (Stripe, Square, Razorpay all accept \`Idempotency-Key\` headers) or client-side deduplication via a request fingerprint. p-queue's task signal lets you cancel the retry loop on user navigation, but it cannot un-do a side effect that already committed.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['retry', 'idempotency', 'tanstack-query', 'http', 'safety'],
    repository: tanstackRepo,
    filePath: 'packages/query-core/src/retryer.ts',
    url: `${tanstackBase}/packages/query-core/src/retryer.ts#L142`,
  },
  {
    title: 'Sequential await loops vs Promise.all — N x latency vs max latency',
    body: `p-queue's \`addAll\` shows the right way to fan out independent async work — \`Promise.all\` over a \`map\`:

\`\`\`ts
async addAll<TaskResultsType>(
  functions: ReadonlyArray<Task<TaskResultsType>>,
  options?: Partial<EnqueueOptionsType>,
): Promise<TaskResultsType[]> {
  return Promise.all(functions.map(async function_ => this.add(function_, options)));
}
\`\`\`

The wrong way — what you'd write naively in a refactor:

\`\`\`ts
async addAllSerial(functions) {
  const results = [];
  for (const fn of functions) {
    results.push(await this.add(fn)); // <-- await inside loop
  }
  return results;
}
\`\`\`

These look almost identical but have radically different performance. With 10 fetches each taking 200ms:

- Promise.all version: ~200ms total (all fetches run concurrently, the slowest determines wall-clock)
- await-in-loop version: ~2000ms total (each fetch waits for the previous one to resolve)

The await-in-loop pattern is sometimes correct — if each iteration depends on the previous result, you can't parallelize. But for independent operations, it's a 10x latency regression for no benefit.

A subtle middle ground: bounded concurrency. \`Promise.all\` with 1000 inputs fires 1000 concurrent fetches and may overwhelm a server or hit OS file-descriptor limits. p-queue's whole point is to give you the parallelism of \`Promise.all\` with the throttling of a manual loop:

\`\`\`ts
const queue = new PQueue({concurrency: 8});
const results = await queue.addAll(functions); // 8 in flight, the rest queued
\`\`\`

Non-obvious gotcha: ESLint's \`no-await-in-loop\` rule flags the bad pattern by default but produces false positives for sequential pipelines (each step depends on the prior). Disabling it locally with a comment is fine when the dependency is real. The rule does NOT catch the Array.prototype.reduce equivalent (\`fns.reduce(async (acc, fn) => { await acc; return await fn(); }, Promise.resolve())\`), which has the same serialization but is much harder to spot.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['promise-all', 'await-loop', 'concurrency', 'latency'],
    repository: pQueueRepo,
    filePath: 'source/index.ts',
    url: `${pQueueBase}/source/index.ts#L581`,
  },
  {
    title: 'Promise.all vs Promise.allSettled — when partial failure matters',
    body: `\`Promise.all\` short-circuits on the first rejection — the returned promise rejects with that error and the other inputs become orphaned (still running, results unobservable through the all promise). \`Promise.allSettled\` waits for every input to settle and returns an array of \`{status: 'fulfilled', value} | {status: 'rejected', reason}\`.

Where this matters in practice — p-queue's \`addAll\` chose \`Promise.all\`:

\`\`\`ts
async addAll<TaskResultsType>(
  functions: ReadonlyArray<Task<TaskResultsType>>,
  options?: Partial<EnqueueOptionsType>,
): Promise<TaskResultsType[]> {
  return Promise.all(functions.map(async function_ => this.add(function_, options)));
}
\`\`\`

That choice means addAll behaves like "run all, fail if any fails." If you instead want "run all, give me a report" — say, refreshing N widgets where one failure shouldn't blank the others — wrap each add in a catch:

\`\`\`ts
const results = await Promise.allSettled(
  fns.map(fn => queue.add(fn))
);
const successes = results.filter(r => r.status === 'fulfilled').map(r => r.value);
const failures = results.filter(r => r.status === 'rejected').map(r => r.reason);
\`\`\`

Or in cases where you want to keep going AND you want a typed shape:

\`\`\`ts
const results = await Promise.all(
  fns.map(fn => queue.add(fn).catch((err): { ok: false, err: Error } => ({ok: false, err})))
);
// Each result is either the task value or { ok: false, err }
\`\`\`

The "catch-and-tag" pattern is often clearer than allSettled because it gives you an array of values (not status objects) that you can pattern-match.

Non-obvious gotcha: \`Promise.all\`'s short-circuit behavior leaks resources. If you fire 100 fetches and the first one fails after 50ms, the other 99 keep running until they complete or you cancel them. They will hold onto sockets, memory, and file descriptors until they settle, but their results will be silently discarded. To actually stop them, share an AbortController across all inputs and abort it inside a \`.catch\` on the all promise:

\`\`\`ts
const ctrl = new AbortController();
const promises = urls.map(u => fetch(u, {signal: ctrl.signal}));
try { await Promise.all(promises); }
catch (e) { ctrl.abort(); throw e; }
\`\`\``,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['promise-all', 'promise-allsettled', 'partial-failure', 'cancellation'],
    repository: pQueueRepo,
    filePath: 'source/index.ts',
    url: `${pQueueBase}/source/index.ts#L585`,
  },
  {
    title: 'Promise.race vs Promise.any — first settle vs first success',
    body: `Both built into p-queue's task wrapper but used for different purposes. \`Promise.race\` is what p-queue uses to compose a task with its abort signal:

\`\`\`ts
operation = Promise.race([operation, new Promise<never>((_resolve, reject) => {
  eventListener = () => { reject(signal.reason); };
  signal.addEventListener('abort', eventListener, {once: true});
})]);
\`\`\`

\`Promise.race\` resolves OR rejects with the first input to SETTLE. The abort-signal promise here can only reject (it never resolves), so the race effectively becomes "the operation, but if abort fires first, throw."

\`Promise.any\` is the opposite: it resolves with the first input to FULFILL. Rejections are ignored unless ALL inputs reject — in which case it rejects with an \`AggregateError\` containing every rejection.

Use cases:

- Race: timeout vs work, abort vs work, "use whichever finishes first." Watch out — rejections short-circuit.
- Any: redundant requests across mirrors ("get the result from whichever CDN responds first, ignore failures unless they all fail"). Built-in in modern Node and browsers; before that, polyfill with \`Promise.all(promises.map(p => p.then(v => Promise.reject(v), e => e))).then(arr => Promise.reject(arr), v => v)\`.

A common bug: using race when you want any. Suppose you're racing three S3 mirrors:

\`\`\`ts
const result = await Promise.race([
  fetch('https://us-east.cdn/x'),
  fetch('https://eu-west.cdn/x'),
  fetch('https://ap-south.cdn/x'),
]);
\`\`\`

If the closest CDN returns 503 in 5ms while the others would have returned 200 in 50ms, race rejects with the 503. \`Promise.any\` would have waited for the slower, successful one.

Non-obvious gotcha: race does not cancel the losers. If you race three fetches and one wins, the other two keep streaming bytes. For mirror-style requests, follow with an abort to free the network:

\`\`\`ts
const ctrl = new AbortController();
try {
  return await Promise.any(urls.map(u => fetch(u, {signal: ctrl.signal})));
} finally {
  ctrl.abort(); // cancel the slower mirrors after we have an answer
}
\`\`\``,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['promise-race', 'promise-any', 'concurrency', 'redundancy'],
    repository: pQueueRepo,
    filePath: 'source/index.ts',
    url: `${pQueueBase}/source/index.ts#L502`,
  },
  {
    title: 'Promise.withResolvers (ES2024) and the deferred-promise pattern',
    body: `Before ES2024, building an externally-resolvable promise required the awkward "let resolve, reject; new Promise((r, j) => { resolve = r; reject = j; })" dance. tanstack-query's \`thenable.ts\` used this pattern, and p-queue uses something similar inside \`add\`:

\`\`\`ts
return new Promise((resolve, reject) => {
  // Create a unique symbol for tracking this task
  const taskSymbol = Symbol(\`task-\${options.id}\`);
  let cleanupQueueAbortHandler = () => undefined;
  const run = async () => {
    // ... eventually calls resolve(result) or reject(error)
  };
  this.#queue.enqueue(run, options);
  // ... abort handlers also reach into reject
  this.emit('add');
  this.#tryToStartAnother();
});
\`\`\`

The \`run\` closure and the abort handler both need to call \`resolve\`/\`reject\` from outside the Promise constructor's executor. Capturing them via closure works but is verbose.

\`Promise.withResolvers()\` (ES2024, Node 22+) makes this clean:

\`\`\`ts
const {promise, resolve, reject} = Promise.withResolvers<TaskResultType>();

const run = async () => {
  try { resolve(await fn()); } catch (e) { reject(e); }
};
this.#queue.enqueue(run, options);

if (signal) {
  signal.addEventListener('abort', () => reject(signal.reason), {once: true});
}

return promise;
\`\`\`

Functionally identical to the IIFE-with-let-bindings, but the resolvers are first-class returns. Useful when you need to:

- Resolve from an EventEmitter listener (the listener is registered after the Promise is returned)
- Resolve from a different module (pass \`resolve\` to a callback)
- Build a "deferred" abstraction for queue/pool management

Non-obvious gotcha: \`Promise.withResolvers\` is not polyfillable safely in older runtimes because it returns the actual native Promise constructor's resolvers. If your bundle target includes Node ≤21 or Safari ≤16, either feature-detect or use a tiny polyfill:

\`\`\`ts
if (!('withResolvers' in Promise)) {
  (Promise as any).withResolvers = function() {
    let resolve!: (v: any) => void, reject!: (e: any) => void;
    const promise = new Promise((r, j) => { resolve = r; reject = j; });
    return {promise, resolve, reject};
  };
}
\`\`\`

The polyfill is correct because the executor runs synchronously — \`resolve\` and \`reject\` are guaranteed assigned before \`new Promise\` returns.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['promise-withresolvers', 'deferred', 'es2024', 'closure'],
    repository: pQueueRepo,
    filePath: 'source/index.ts',
    url: `${pQueueBase}/source/index.ts#L453`,
  },
  {
    title: 'Async iterators and for-await-of: streaming results from a queue',
    body: `\`for await...of\` consumes anything that implements \`Symbol.asyncIterator\`. p-queue itself doesn't expose an async iterator, but you can wrap it to stream results as they complete (rather than waiting for all):

\`\`\`ts
async function* completedResults<T>(queue: PQueue, fns: Array<() => Promise<T>>): AsyncGenerator<T> {
  const pending = new Map<number, Promise<{i: number, v: T}>>();
  fns.forEach((fn, i) => {
    pending.set(i, queue.add(fn).then(v => ({i, v})));
  });

  while (pending.size > 0) {
    const {i, v} = await Promise.race(pending.values());
    pending.delete(i);
    yield v;
  }
}

for await (const result of completedResults(queue, fns)) {
  process(result); // see results in completion order, not submission order
}
\`\`\`

The pattern: maintain a map of in-flight promises tagged with their submission index. \`Promise.race\` returns the first to settle. Delete that entry, yield its value, loop. Order of yields is order of completion.

Compare to the simpler \`addAll\`:

\`\`\`ts
const results = await queue.addAll(fns); // submission order, all at once
\`\`\`

The async-iterator form is strictly more powerful for streaming UIs — render each result as it arrives instead of waiting for the slowest.

Async iterators are also the right primitive for paginated fetches:

\`\`\`ts
async function* paginate(url: string) {
  let next: string | null = url;
  while (next) {
    const res = await fetch(next).then(r => r.json());
    yield* res.items;
    next = res.next_page_url;
  }
}

for await (const item of paginate('/api/users')) {
  if (shouldStop(item)) break; // <-- the magic
}
\`\`\`

Non-obvious gotcha: \`break\` inside a \`for await...of\` triggers the async iterator's \`return()\` cleanup. For a \`yield*\` chain, this propagates back through every nested generator. If your generator holds a database cursor or open file, put cleanup in a \`finally\` block — it WILL be reached on early break:

\`\`\`ts
async function* readRows(client) {
  const cursor = await client.cursor('SELECT ...');
  try { for await (const row of cursor) yield row; }
  finally { await cursor.close(); } // runs even on break
}
\`\`\``,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['async-iterator', 'for-await-of', 'streaming', 'generators'],
    repository: pQueueRepo,
    filePath: 'source/index.ts',
    url: `${pQueueBase}/source/index.ts#L443`,
  },
  {
    title: 'p-queue: ESM-only and the top-level await constraint',
    body: `p-queue's readme leads with a warning that's representative of the modern npm ecosystem:

> Warning: This package is native ESM and no longer provides a CommonJS export. If your project uses CommonJS, you'll have to convert to ESM.

The package.json sets \`"type": "module"\` and exports only ES modules. There is no \`require('p-queue')\` form that works. In a CommonJS file, \`require\` throws \`ERR_REQUIRE_ESM\`.

What ESM-only enables for the consumer:

\`\`\`ts
// Top-level await in an ESM module (Node 14+, modern bundlers)
import PQueue from 'p-queue';

const queue = new PQueue({concurrency: 4});
const config = await loadConfig();
queue.add(() => processWithConfig(config));
\`\`\`

Top-level await is only legal in ESM modules. CommonJS modules cannot use it because \`require()\` is synchronous and would deadlock if a required module awaited.

The interop pain point is clear when you're in CommonJS land and want to import an ESM-only library:

\`\`\`js
// CommonJS — this throws ERR_REQUIRE_ESM
const PQueue = require('p-queue');

// CommonJS — only viable workaround
async function getQueue() {
  const {default: PQueue} = await import('p-queue');
  return new PQueue();
}
\`\`\`

\`import()\` (the function form, not the statement) is async and works in both ESM and CommonJS. It's the only escape hatch — but you must hide the await inside an async function, which often means propagating async-ness up the call stack.

For a Next.js app like this codebase, the constraint is mostly invisible because the App Router uses ESM by default. For a legacy Express + ts-node CJS server, the same import is a multi-day refactor.

Non-obvious gotcha: Jest's older transformers don't handle ESM-only deps gracefully. The portfolio's jest config (\`jest.config.cjs\`) uses \`transformIgnorePatterns\` to whitelist specific ESM packages. If you upgrade a dep and tests start failing with \`SyntaxError: Cannot use import statement outside a module\`, the package likely went ESM-only and you need to add it to that whitelist (or migrate to Vitest, which is ESM-native).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['esm', 'top-level-await', 'commonjs', 'modules'],
    repository: pQueueRepo,
    filePath: 'package.json',
    url: `${pQueueBase}/package.json`,
  },
  {
    title: 'Debounce vs throttle: leading vs trailing edges and where each fits',
    body: `Both rate-limit a function but with opposite semantics. p-queue's interval/intervalCap give you neither — they queue every call. For UI-driven rate limiting (search-as-you-type, scroll handlers), debounce and throttle are the right primitives.

Debounce: fire AFTER calls stop arriving for \`wait\` ms. Useful for "user finished typing":

\`\`\`ts
function debounce<T extends (...args: any[]) => void>(fn: T, wait: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

input.addEventListener('input', debounce(() => search(input.value), 300));
\`\`\`

If the user types "react" with 50ms between keystrokes, the search runs ONCE, 300ms after they stop typing. Five keystrokes = one network call.

Throttle: fire AT MOST once per \`wait\` ms. Useful for high-frequency events that you want sampled:

\`\`\`ts
function throttle<T extends (...args: any[]) => void>(fn: T, wait: number) {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= wait) {
      lastCall = now;
      fn(...args);
    }
  };
}

window.addEventListener('scroll', throttle(updateScrollIndicator, 100));
\`\`\`

If a scroll fires every 16ms (60fps), this samples it down to one call per 100ms.

The semantic difference: debounce CARES about the gap between calls; throttle CARES about the count of calls per interval. For a save-on-edit field, debounce (don't save until they stop). For a draggable resize handle, throttle (sample frequently, but cap CPU). For a "save every 5s while editing AND save when they stop," combine: throttle with leading-and-trailing edges.

Non-obvious gotcha: most "leading edge" debounce implementations (lodash's \`{leading: true, trailing: true}\`) fire on the first call, then suppress for \`wait\` ms, then fire again on the trailing edge with the latest args. This is closer to a "first AND last" semantic than to debounce. If you actually want "first only, ignore the rest until idle" use a small homegrown version — lodash's option matrix is easy to misread. Also: don't debounce inside React renders or each render gets a new debounced function with its own timer. Use \`useMemo\` (or better, use \`useDebouncedCallback\` from \`use-debounce\`).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['debounce', 'throttle', 'rate-limiting', 'ui'],
    repository: pQueueRepo,
    filePath: 'source/options.ts',
    url: `${pQueueBase}/source/options.ts#L58`,
  },
  {
    title: 'queueMicrotask vs setImmediate vs setTimeout(0) — scheduler ordering',
    body: `p-queue uses \`queueMicrotask\` deliberately to defer cleanup without yielding to I/O. Knowing which scheduler API runs when is essential for understanding concurrency code:

\`\`\`ts
queueMicrotask(() => {
  this.#next(); // runs before any I/O callback or timer
});
\`\`\`

The Node event loop has phases. Within a single iteration: macrotasks (timers, pending I/O, idle, poll, check, close), with the microtask queue drained between EVERY macrotask AND between every js-callback dequeued from a macrotask phase.

Concrete ordering for a single tick after some sync code:

1. \`queueMicrotask(fn)\` and \`Promise.resolve().then(fn)\` — both go on the microtask queue. They run AFTER current sync code, BEFORE any timer or I/O callback. \`process.nextTick\` runs even earlier (its own queue, drained before microtasks).

2. \`setImmediate(fn)\` — runs in the "check" phase, AFTER I/O callbacks in the current iteration. Roughly "next tick."

3. \`setTimeout(fn, 0)\` — runs in the "timers" phase, which happens at the START of the NEXT iteration. Minimum delay is actually clamped to 1ms in Node (4ms historically in browsers).

Empirically:

\`\`\`js
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));
Promise.resolve().then(() => console.log('microtask'));
queueMicrotask(() => console.log('queueMicrotask'));
process.nextTick(() => console.log('nextTick'));

// Output (deterministic):
// nextTick
// microtask
// queueMicrotask
// immediate (or timeout — order between these two from main is non-deterministic)
// timeout
\`\`\`

The setImmediate vs setTimeout(0) order from the main module is not guaranteed because of timer-resolution rounding. But inside an I/O callback, setImmediate ALWAYS runs before setTimeout(0) (same iteration's check phase vs next iteration's timers phase).

Non-obvious gotcha: \`process.nextTick\` is so early it can starve I/O. A recursive \`process.nextTick\` schedule (\`function tick() { process.nextTick(tick); }\`) prevents the event loop from ever entering its I/O phase — sockets stop reading, timers stop firing. The same is technically true of microtasks but is harder to hit accidentally because most Promise chains involve at least one async boundary. If you need "as soon as possible without starving I/O," \`setImmediate\` is the safe choice. If you need "before any I/O fires," \`queueMicrotask\` is right (and is what p-queue uses to break recursion without yielding scheduling priority).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['queuemicrotask', 'setimmediate', 'settimeout', 'event-loop', 'scheduler'],
    repository: pQueueRepo,
    filePath: 'source/index.ts',
    url: `${pQueueBase}/source/index.ts#L527`,
  },
  {
    title: 'Unhandled promise rejection — how p-queue tasks become silent failures',
    body: `Every task you add to a p-queue queue returns a promise. The library's docs explicitly warn:

> The promise returned by \`add()\` still rejects. You must handle each \`add()\` promise (for example, \`.catch(() => {})\`) to avoid unhandled rejections.

The reason is a common ergonomic trap: \`addAll\` swallows individual promises into a single \`Promise.all\`, and \`queue.on('error', handler)\` listens to the queue but does NOT consume the per-task rejection.

Fire-and-forget patterns are where this bites:

\`\`\`ts
// Bad — task rejection becomes an unhandled rejection
queue.add(() => riskyOperation());

// Good — explicit catch
queue.add(() => riskyOperation()).catch(err => log.error(err));

// Also fine — let the queue handle errors via the event
queue.on('error', err => log.error(err));
queue.add(() => riskyOperation()).catch(() => {}); // STILL needed
\`\`\`

The double-handling (event listener + per-task catch) feels redundant but is required because event listeners are decoupled from promise rejection state. The promise still has an unhandled rejection until something calls \`.catch\` on it.

Node's behavior: as of Node 15+, unhandled rejections crash the process by default (\`--unhandled-rejections=throw\`). Before that, they emitted a warning. Either way, leaking them in production is bad — at minimum it pollutes logs; at worst it tears down the process under load.

The defensive idiom for fire-and-forget queueing:

\`\`\`ts
const noop = () => {};

function fireAndForget<T>(fn: () => Promise<T>) {
  queue.add(fn).catch(noop);
}
\`\`\`

This is the right wrapper if you have an \`error\` event listener doing the actual logging, and you genuinely don't care about the per-call result.

Non-obvious gotcha: \`process.on('unhandledRejection', handler)\` will catch these but is a global net, not a fix. If your handler doesn't re-throw or exit, you've effectively silenced bugs. The right place to handle errors is at the call site or the queue's \`error\` event — \`unhandledRejection\` is the alarm, not the door. Also: \`addAll\`'s \`Promise.all\` only attaches \`.catch\` to the COMBINED promise. The individual \`add\` promises inside the \`map\` are unhandled if you don't await the all promise (or if you await it and don't catch it). Always wrap addAll calls in try/catch or attach \`.catch\` to the addAll promise.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['unhandled-rejection', 'p-queue', 'error-handling', 'fire-and-forget'],
    repository: pQueueRepo,
    filePath: 'source/index.ts',
    url: `${pQueueBase}/source/index.ts#L756`,
  },
];
