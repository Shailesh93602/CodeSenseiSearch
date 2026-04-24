/**
 * Batch github-013-bullmq-patterns
 *
 * 25 BullMQ patterns drawn from the actual source of taskforcesh/bullmq
 * (v5.76.0). Each entry is attributed to a real file in the repo. The
 * `url` always resolves to the canonical file on master.
 *
 * Authoring rules (see CORPUS-PLAN.md):
 * - Real attribution; no fabricated URLs
 * - Real patterns the project actually implements
 * - 250-450 word body
 * - One topic per entry
 * - WHAT + HOW (real code) + WHY + non-obvious gotcha
 */

import type { SeedItem } from '../types';

const repo = { owner: 'taskforcesh', name: 'bullmq' };
const baseUrl = 'https://github.com/taskforcesh/bullmq/blob/master';

export const BATCH: SeedItem[] = [
  {
    title: 'Worker constructor: connection is required, defaults set in super()',
    body: `The Worker class extends QueueBase and applies its own defaults on top of the user options. The signature is \`new Worker(name, processor?, opts?, Connection?)\`. The processor can be a function, a string path to a sandboxed file, a URL to an ES module, or null (in which case you call \`worker.run()\` manually).

\`\`\`ts
super(name, {
  drainDelay: 5,
  concurrency: 1,
  lockDuration: 30000,
  maximumRateLimitDelay: 30000,
  maxStalledCount: 1,
  stalledInterval: 30000,
  autorun: true,
  runRetryDelay: 15000,
  ...opts,
  blockingConnection: true,
}, Connection);

if (!opts || !opts.connection) {
  throw new Error('Worker requires a connection');
}
\`\`\`

A few non-obvious things from this constructor: the worker FORCES \`blockingConnection: true\` regardless of what you pass, because the BZPOPMIN-based fetch loop needs a dedicated connection that doesn't share retry state with normal commands. \`lockRenewTime\` defaults to \`lockDuration / 2\`, not 30s — half the lock duration is what gives you a safety margin to renew before expiry.

\`maxStalledCount\` defaults to 1: a job that stalls more than once is moved to failed. If your worker frequently OOMs or is killed mid-job, bump this to 2-3 or your jobs end up in failed without ever completing successfully on the retry.

The processor's \`length >= 3\` check (\`processor.length >= 3\`) detects whether your function accepts an \`AbortSignal\` parameter — if it does, the worker will pass one and abort it on close. So write \`async (job, token, signal) => {}\` if you want graceful shutdown, otherwise long-running jobs will be killed only by the close timeout.

Worker requires connection since v5.0.0 — before that it would silently default to localhost:6379, which made it easy to point a production worker at the wrong Redis. The throw is intentional.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'worker', 'queue', 'redis', 'constructor'],
    repository: repo,
    filePath: 'src/classes/worker.ts',
    url: `${baseUrl}/src/classes/worker.ts`,
  },
  {
    title: 'Worker concurrency is per-instance, not per-process',
    body: `\`concurrency\` controls how many jobs a single Worker instance processes in parallel. It is enforced inside the worker's \`mainLoop\` by an \`AsyncFifoQueue\` whose size is bounded by \`this._concurrency\`.

\`\`\`ts
while (
  !this.closing &&
  !this.paused &&
  !this.waiting &&
  asyncFifoQueue.numTotal() < this._concurrency &&
  !this.isRateLimited()
) {
  const token = \`\${this.id}:\${tokenPostfix++}\`;
  const fetchedJob = this.retryIfFailed(
    () => this._getNextJob(client, bclient, token, { block: true }),
    { delayInMs: this.opts.runRetryDelay, onlyEmitError: true },
  );
  asyncFifoQueue.add(fetchedJob);
  // ...
}
\`\`\`

So if you set \`concurrency: 10\` and run two Node processes, you'll process up to 20 jobs in parallel. The job's lock token is unique per slot (\`workerId:0\`, \`workerId:1\`, ...), which is what lets the same worker hold locks on multiple jobs simultaneously without them conflicting.

The non-obvious gotcha: \`concurrency\` does NOT pre-fetch. The loop fetches one job, awaits the fetch, then loops again. Under heavy load you spend N round-trips to Redis to fill the slots — concurrency 100 means 100 BZPOPMIN-style fetches. For CPU-bound processors there's no point setting concurrency higher than the number of CPU cores; for I/O-bound processors (HTTP calls, DB queries) you can comfortably go to 50–100 per worker before Redis round-trip latency dominates.

If you change concurrency at runtime via the setter, it takes effect on the next iteration of the main loop — already-running jobs are not interrupted. Setting concurrency to a lower number is a graceful way to drain a worker before scale-down.

For scaling: think in terms of total slots, not pod count. 4 pods × concurrency 25 = 100 slots, same total throughput as 10 pods × concurrency 10. The 4-pod arrangement saves Redis connections (8 vs 20) but loses redundancy — a single pod failure drops you to 75% capacity vs 90%. Most production deploys land at 3-5 pods × concurrency in the 10-50 range depending on per-job CPU.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'worker', 'concurrency', 'parallelism'],
    repository: repo,
    filePath: 'src/classes/worker.ts',
    url: `${baseUrl}/src/classes/worker.ts`,
  },
  {
    title: 'Job lifecycle states: waiting, active, completed, failed, delayed, prioritized, waiting-children',
    body: `BullMQ's state machine is enumerated in two types. \`JobState\` is the set of states a job can be in, \`JobType\` adds the synthetic \`paused\`, \`repeat\`, and \`wait\` aliases used by getters and Lua scripts.

\`\`\`ts
// src/types/job-type.ts
export type JobState =
  | FinishedStatus           // 'completed' | 'failed'
  | 'active'
  | 'delayed'
  | 'prioritized'
  | 'waiting'
  | 'waiting-children';

export type JobType = JobState | 'paused' | 'repeat' | 'wait';
\`\`\`

Each state corresponds to a Redis data structure under the queue prefix:

- \`waiting\` → LIST (\`bull:queueName:wait\`) — jobs the worker pops via BLMOVE
- \`active\` → LIST (\`:active\`) — jobs currently held by a worker token
- \`delayed\` → ZSET (\`:delayed\`) — score is \`processOn\` timestamp
- \`prioritized\` → ZSET (\`:prioritized\`) — score is the priority (lower = higher priority)
- \`completed\` / \`failed\` → ZSET — score is \`finishedOn\` timestamp
- \`waiting-children\` → ZSET — parent jobs waiting for child completion
- \`paused\` → LIST — same shape as \`wait\`, but jobs are not picked until \`resume()\`

Transitions are atomic Lua scripts (\`moveToActive-11.lua\`, \`moveToFinished-14.lua\`, \`moveStalledJobsToWait-8.lua\`). The Node code never moves a job between states with multiple round-trips — it always sends one EVALSHA so other workers see a consistent view.

The non-obvious gotcha: \`paused\` is a state of the queue, but jobs in it look exactly like \`waiting\` jobs except they live in a different list. \`getCounts('waiting')\` does NOT include paused jobs. If you build a dashboard and your "waiting" count drops to 0 after a pause, that's why — query \`paused\` separately.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'job-states', 'lifecycle', 'redis'],
    repository: repo,
    filePath: 'src/types/job-type.ts',
    url: `${baseUrl}/src/types/job-type.ts`,
  },
  {
    title: 'Queue.add() job options: attempts, backoff, delay, priority, jobId',
    body: `\`Queue.add(name, data, opts)\` is the primary producer API. The options come from \`DefaultJobOptions\` plus the \`BaseJobOptions\` extension (jobId, repeat, parent).

\`\`\`ts
// src/interfaces/base-job-options.ts
export interface DefaultJobOptions {
  timestamp?: number;            // Date.now() by default
  priority?: number;             // 0 (highest) – 2_097_152 (lowest)
  delay?: number;                // ms to wait before becoming active
  attempts?: number;             // 1 by default — total tries including the first
  backoff?: number | BackoffOptions;
  lifo?: boolean;                // push to right of waiting list instead of left
  removeOnComplete?: boolean | number | KeepJobs;
  removeOnFail?: boolean | number | KeepJobs;
  keepLogs?: number;
  stackTraceLimit?: number;
  sizeLimit?: number;            // bytes; payload over this rejects with size limit error
}
\`\`\`

A few patterns from the source that are easy to miss:

- \`attempts\` is the TOTAL number of tries, not retries. \`attempts: 3\` means initial + up to 2 retries.
- \`priority: 0\` means highest priority, NOT "no priority". The priority queue uses a sorted set scored by priority, lower = sooner. Don't pass \`priority: 999999\` thinking it makes things urgent — that's the opposite.
- \`delay\` puts the job in the delayed ZSET with score \`Date.now() + delay\`. Workers don't actively poll delayed; an internal "marker" mechanism wakes them when the next delayed job is due.
- \`jobId\` makes adds idempotent: passing the same id twice returns the existing job rather than creating a duplicate. Strong protection against double-publishes from a webhook handler.
- \`sizeLimit\` is bytes of the JSON-serialized data. If you store a 10MB image bytes in \`data\`, Redis will accept it but you'll DoS your own queue. Cap it at ~100KB and pass S3 URLs instead.

The validation in \`addJob\` rejects \`jobId === '0'\` or any id starting with \`'0:'\` because that's the prefix used internally for delay markers — collisions break the marker machinery.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'queue', 'job-options', 'producer', 'priority'],
    repository: repo,
    filePath: 'src/interfaces/base-job-options.ts',
    url: `${baseUrl}/src/interfaces/base-job-options.ts`,
  },
  {
    title: 'removeOnComplete and removeOnFail: number, boolean, or KeepJobs object',
    body: `Without \`removeOnComplete\`, every successful job stays in the completed ZSET forever. On a queue doing 1M jobs/day this fills Redis fast. The option is overloaded:

\`\`\`ts
// boolean: drop immediately
{ removeOnComplete: true }

// number: keep the most recent N
{ removeOnComplete: 1000 }

// object: keep by age and/or count
{ removeOnComplete: { age: 24 * 3600, count: 1000 } }
{ removeOnFail: { age: 7 * 24 * 3600 } }
\`\`\`

The \`KeepJobs\` shape (src/types/keep-jobs.ts) supports \`age\` (seconds) plus an optional \`count\` cap and \`limit\` (max removals per pass). When both \`age\` and \`count\` are set, the job must satisfy BOTH to be kept — the stricter wins.

The non-obvious gotcha is in the doc comment for the field itself:

> When using \`age\` or \`count\`, the eviction is evaluated on a best-effort basis every time a job finishes; BullMQ does not run a background timer, so aged jobs are only removed once another job completes after their expiration.

So if your queue goes idle, jobs older than \`age\` will sit there until the NEXT completion. For a queue that processes one job a week, "keep for 24h" effectively means "keep until the next weekly job runs." If you need actual time-based eviction, run a separate cron that calls \`queue.clean(grace, limit, 'completed')\`.

\`removeOnFail\` has the symmetric semantics. The default is to keep failed jobs forever — useful for debugging, dangerous for storage. In production set \`removeOnFail: { age: 7 * 24 * 3600, count: 5000 }\` so you have a week of failures for triage but the set never grows unboundedly.

Per-job options on \`Queue.add\` override worker-level defaults set in \`WorkerOptions.removeOnComplete\` / \`removeOnFail\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'cleanup', 'remove-on-complete', 'keep-jobs'],
    repository: repo,
    filePath: 'src/types/keep-jobs.ts',
    url: `${baseUrl}/src/types/keep-jobs.ts`,
  },
  {
    title: 'Backoff strategies: built-in fixed, exponential, with jitter, and custom',
    body: `The Backoffs class registers two built-in strategies and lets you supply a custom one. They are pure functions of attemptsMade returning the next delay in ms.

\`\`\`ts
// src/classes/backoffs.ts
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

Usage on \`Queue.add\`:

\`\`\`ts
await queue.add('email', payload, {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
});
\`\`\`

Exponential with delay=1000 produces 1s, 2s, 4s, 8s, 16s — the formula is \`Math.pow(2, attemptsMade - 1) * delay\`. Jitter spreads each retry over a window of ±50% to avoid thundering-herd retries when 1000 webhook handlers all backoff at the same instant.

Custom strategies are registered in \`QueueOptions.settings.backoffStrategy\`. The signature receives \`(attemptsMade, type, err, job)\` so you can vary the delay by error class — back off harder on a 429 than on a 500.

The non-obvious gotcha: a "fixed" backoff with no \`delay\` field crashes Lua-side because \`backoff.delay!\` is asserted as defined. If you pass \`{ backoff: 5000 }\` (a number, not an object), the \`Backoffs.normalize\` helper wraps it as \`{ type: 'fixed', delay: 5000 }\`, so both forms work. But \`{ backoff: { type: 'exponential' } }\` with no delay is silently 0ms — worker hot-loops the retry.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'backoff', 'retry', 'exponential', 'jitter'],
    repository: repo,
    filePath: 'src/classes/backoffs.ts',
    url: `${baseUrl}/src/classes/backoffs.ts`,
  },
  {
    title: 'Job.moveToFailed: branch on shouldRetry vs hard fail',
    body: `When a processor throws, the worker calls \`job.moveToFailed(err, token, fetchNext)\`. The method first asks the backoff machinery whether the job should retry; the result drives one of three Redis paths.

\`\`\`ts
// src/classes/job.ts
async moveToFailed<E extends Error>(err: E, token: string, fetchNext = false) {
  this.failedReason = err?.message;
  const [shouldRetry, retryDelay] = await this.shouldRetryJob(err);

  // ...
  if (shouldRetry) {
    if (retryDelay) {
      // Retry with delay → ZADD into delayed ZSET
      result = await this.scripts.moveToDelayed(this.id, Date.now(), retryDelay, token, { fieldsToUpdate, fetchNext });
    } else {
      // Retry immediately → push back to wait list
      result = await this.scripts.retryJob(this.id, this.opts.lifo, token, { fieldsToUpdate });
    }
  } else {
    const args = this.scripts.moveToFailedArgs(this, this.failedReason, this.opts.removeOnFail, token, fetchNext, fieldsToUpdate);
    result = await this.scripts.moveToFinished(this.id, args);
  }

  this.attemptsMade += 1;
  return result;
}
\`\`\`

\`shouldRetryJob\` returns \`[false, 0]\` if any of: \`attemptsMade + 1 >= opts.attempts\`, the error is an \`UnrecoverableError\`, \`job.discarded\` is true, or no backoff is configured AND attempts are exhausted.

The \`failedReason\` field stored in Redis is the error MESSAGE only — not the stack. The stack is JSON-serialized into a separate \`stacktrace\` field, capped by \`stackTraceLimit\` so a single failing job can't blow up Redis memory. If your dashboard shows "failedReason: undefined", the processor threw something that was not an Error (a string or null) — always throw real Error subclasses.

The non-obvious gotcha: throwing \`new UnrecoverableError(msg)\` short-circuits all retry attempts even if you configured \`attempts: 10\`. Use it for permanent failures (4xx, validation errors). Throwing a plain Error always consumes one of the configured attempts.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'failed', 'retry', 'unrecoverable-error'],
    repository: repo,
    filePath: 'src/classes/job.ts',
    url: `${baseUrl}/src/classes/job.ts`,
  },
  {
    title: 'Repeatable jobs vs delayed jobs vs cron-pattern jobs',
    body: `These three schedule types map to three different storage shapes — knowing which one you have determines how you cancel/inspect them.

\`\`\`ts
// src/interfaces/repeat-options.ts
export interface RepeatOptions {
  pattern?: string;     // cron expression — uses cron-parser
  every?: number;       // ms between iterations (mutually exclusive with pattern)
  limit?: number;       // max iterations
  immediately?: boolean;// fire first iteration NOW (cron only)
  endDate?: Date;       // stop scheduling after this
  tz?: string;          // timezone for cron
  key?: string;         // custom repeatable key
}
\`\`\`

- **Delayed job** — \`queue.add(name, data, { delay: 5000 })\`. One-shot. Lives in the \`delayed\` ZSET. Cancel by \`job.remove()\`.
- **Repeatable with every** — \`{ repeat: { every: 60_000 } }\`. After each completion, \`updateRepeatableJob\` calculates the next \`nextMillis\` and inserts a new delayed job. Cancel via \`queue.removeRepeatable(name, repeatOpts)\`.
- **Cron pattern** — \`{ repeat: { pattern: '0 */5 * * * *' } }\`. Uses cron-parser; the next iteration is computed by \`getNextMillis(now, repeatOpts, name)\` which calls \`parseExpression\` (cron-parser supports 6-field syntax including seconds).

\`\`\`ts
// src/classes/repeat.ts
const nextMillis = await this.repeatStrategy(now, repeatOpts, name);
const { every, pattern } = repeatOpts;
const hasImmediately = Boolean((every || pattern) && repeatOpts.immediately);
\`\`\`

\`immediately\` only works with cron patterns (it is silently ignored with \`every\`). The first cron iteration normally fires at the next pattern boundary; \`immediately: true\` fires it NOW and continues from the next boundary.

The non-obvious gotcha: \`every\` is NOT "every N ms after the previous job completes" — it is a fixed schedule. If your job takes 70s and \`every: 60_000\`, you will get an overlap (workers will pick up the next iteration before the previous one finishes). Use a longer \`every\` than your worst-case processing time, or guard with a unique \`jobId\` to dedupe.

In v5+ "JobScheduler" replaced the old Repeat class internally; \`Repeat\` is kept for backwards compatibility but the comment at line 202 of worker.ts notes "To be deprecated in v6 in favor of Job Scheduler".`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'repeatable', 'cron', 'scheduler', 'delayed'],
    repository: repo,
    filePath: 'src/classes/repeat.ts',
    url: `${baseUrl}/src/classes/repeat.ts`,
  },
  {
    title: 'QueueEvents: listen to queue events from a separate process',
    body: `A Worker emits events on its own EventEmitter (\`worker.on('completed', ...)\`), but those events only fire in the process running that worker. To observe events from a producer process, dashboard, or a separate logging service, use QueueEvents — it tails a Redis stream that all workers write to.

\`\`\`ts
// src/classes/queue-events.ts
export interface QueueEventsListener extends IoredisListener {
  active: (args: { jobId: string; prev?: string }, id: string) => void;
  added: (args: { jobId: string; name: string }, id: string) => void;
  completed: (args: { jobId: string; returnvalue: string; prev?: string }, id: string) => void;
  failed: (args: { jobId: string; failedReason: string; prev?: string }, id: string) => void;
  delayed: (args: { jobId: string; delay: number }, id: string) => void;
  drained: (id: string) => void;
  progress: (args: { jobId: string; data: JobProgress }, id: string) => void;
  stalled: (args: { jobId: string }, id: string) => void;
  // ...
}
\`\`\`

Usage:

\`\`\`ts
import { QueueEvents } from 'bullmq';
const events = new QueueEvents('email', { connection: { host, port } });
await events.waitUntilReady();
events.on('completed', ({ jobId, returnvalue }) => log.info({ jobId, returnvalue }));
events.on('failed', ({ jobId, failedReason }) => log.error({ jobId, failedReason }));
\`\`\`

QueueEvents uses XREAD on the queue's events stream (\`bull:queueName:events\`), which means it requires a BLOCKING connection — you cannot share its ioredis instance with a Queue. The queue prefix and the stream are global to the queue name, so multiple QueueEvents instances in different services all see every event.

The non-obvious gotcha: \`returnvalue\` and \`failedReason\` arrive as STRINGS. The completed event handler must JSON.parse the returnvalue if your processor returned an object. Workers serialize the value before XADD, but listeners get it raw.

Also: the second argument \`id\` is the Redis stream message ID (e.g. \`1701024000000-0\`), useful as a cursor for replay/debug. You can pass \`{ lastEventId: '$' }\` to start from now, or a real ID to replay from a known point — handy for backfilling external systems after an outage.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'queue-events', 'pubsub', 'observability', 'streams'],
    repository: repo,
    filePath: 'src/classes/queue-events.ts',
    url: `${baseUrl}/src/classes/queue-events.ts`,
  },
  {
    title: 'FlowProducer: parent and child jobs across queues',
    body: `FlowProducer.add lets you create a tree of jobs in a single atomic call. The parent only becomes processable after every child completes — the worker for the parent queue gets a job whose \`getChildrenValues()\` returns the children's return values.

\`\`\`ts
// src/classes/flow-producer.ts
async add(flow: FlowJob, opts?: FlowOpts): Promise<JobNode> {
  // ...
}
\`\`\`

\`\`\`ts
// Real example
const flow = new FlowProducer({ connection });
await flow.add({
  name: 'send-report',
  queueName: 'reports',
  data: { userId: 'u1' },
  children: [
    { name: 'fetch-data',     queueName: 'etl',     data: { table: 'orders' } },
    { name: 'render-charts',  queueName: 'render',  data: { type: 'pie' } },
    { name: 'compress-pdf',   queueName: 'render',  data: { compression: 9 } },
  ],
});
\`\`\`

The shape (\`src/interfaces/flow-job.ts\`):

\`\`\`ts
export interface FlowJobBase<T> {
  name: string;
  queueName: string;       // children CAN be in different queues
  data?: any;
  prefix?: string;
  opts?: Omit<T, 'repeat'>;// children cannot be repeatable
  children?: FlowChildJob[];
}
\`\`\`

The whole tree is added via a single ChainableCommander pipeline so the parent and all children are inserted atomically — there is no window where the parent exists with zero children. Each child's options carry a \`parent\` field pointing to the parent's full key including its queue prefix.

In the parent's processor, retrieve children's outputs:

\`\`\`ts
new Worker('reports', async (job) => {
  const childResults = await job.getChildrenValues();
  // { 'bull:etl:42': {...}, 'bull:render:43': {...}, ... }
});
\`\`\`

The non-obvious gotcha: \`children\` cannot be \`repeat\`-able (the type omits repeat). And if even one child fails after exhausting attempts, the parent is moved to the \`waiting-children\` state forever unless you set \`failParentOnFailure: true\` in the child opts — without that flag a flow can hang silently.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'flow-producer', 'parent-child', 'dependencies'],
    repository: repo,
    filePath: 'src/classes/flow-producer.ts',
    url: `${baseUrl}/src/classes/flow-producer.ts`,
  },
  {
    title: 'Sandboxed processors: run job code in a separate process',
    body: `Pass a file path (or \`URL\`) instead of a function and BullMQ runs the processor in a forked child process via the ChildPool. The parent worker keeps owning the lock and renewing it; the child only does the CPU work.

\`\`\`ts
// src/classes/worker.ts (constructor)
if (typeof processor === 'function') {
  this.processFn = processor;
  this.processorAcceptsSignal = processor.length >= 3;
} else {
  // SANDBOXED — processor is a path or URL
  if (processor instanceof URL) { /* validate */ }
  else {
    const supportedFileTypes = ['.js', '.ts', '.flow', '.cjs', '.mjs'];
    const processorFile = processor + (supportedFileTypes.includes(path.extname(processor)) ? '' : '.js');
    if (!fs.existsSync(processorFile)) throw new Error(\`File \${processorFile} does not exist\`);
  }
  this.childPool = new ChildPool({
    mainFile: mainFilePath,
    useWorkerThreads: this.opts.useWorkerThreads,
    workerForkOptions: this.opts.workerForkOptions,
    workerThreadsOptions: this.opts.workerThreadsOptions,
  });
  this.createSandbox(processor);
}
\`\`\`

The sandbox wrapper (\`src/classes/sandbox.ts\`) uses an IPC protocol with command codes — \`Completed\`, \`Failed\`, \`Progress\`, \`Log\`, \`MoveToDelayed\`, \`Update\`, etc. — so the child can call \`job.updateProgress(50)\` and the parent forwards the call through Redis without leaking ioredis into the child.

\`useWorkerThreads: true\` switches from \`child_process.fork\` to \`worker_threads\`. Worker threads share the same V8 isolate (lower memory, faster spawn) but cannot \`process.exit\` cleanly without affecting the parent — fork is safer if your processor leaks state.

The non-obvious gotcha: when the child crashes, the exit handler rejects with \`'Unexpected exit code: <n> signal: <s>'\` — the original error is LOST. So if your processor SEGV's because of a native dependency, the failure message tells you nothing useful. Always wrap your child processor in a top-level try/catch that logs the real error before throwing.

Sandboxed processors are essential when one bad job (regex catastrophic backtracking, JSON bomb, native module crash) could take down the whole worker process and starve all the other queues sharing it.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'sandbox', 'child-process', 'worker-threads', 'isolation'],
    repository: repo,
    filePath: 'src/classes/sandbox.ts',
    url: `${baseUrl}/src/classes/sandbox.ts`,
  },
  {
    title: 'Rate limiter: max jobs per duration, queue-wide',
    body: `The limiter throttles a worker to N jobs per M ms. The shape is small but the behavior is queue-wide, not per-worker.

\`\`\`ts
// src/interfaces/rate-limiter-options.ts
export interface RateLimiterOptions {
  max: number;       // max jobs in the time window
  duration: number;  // window size in ms
}
\`\`\`

\`\`\`ts
new Worker('outbound-email', processor, {
  connection,
  limiter: { max: 10, duration: 1000 },
});
\`\`\`

The limiter is enforced in Lua via the \`getRateLimitTTL\` include — when a worker tries to fetch the next job, the script checks an INCR'd counter under the \`limiter\` key. If the count exceeds \`max\` within \`duration\`, the script returns the TTL on that key as the rate-limit-until timestamp; the worker then sleeps with \`abortDelayController\` until that timestamp.

\`\`\`ts
// src/classes/worker.ts
private async waitForRateLimit(): Promise<void> {
  const limitUntil = this.limitUntil;
  if (limitUntil > Date.now()) {
    this.abortDelayController?.abort();
    this.abortDelayController = new AbortController();
    const delay = this.getRateLimitDelay(limitUntil - Date.now());
    await this.delay(delay, this.abortDelayController);
    this.drained = false;
    this.limitUntil = 0;
  }
}
\`\`\`

Because the counter lives in Redis under one key per queue, every worker connected to that queue shares the same budget. \`max: 10/sec\` with two worker processes means 10 total per second, not 20. That is almost always what you want — third-party APIs rate-limit the SENDER, not the worker count.

The non-obvious gotcha: \`maximumRateLimitDelay\` (default 30000ms) caps how long the worker will sleep waiting for the limiter to clear. If the limiter says "wait 5 minutes", the worker still sleeps only 30s, polls again, sleeps 30s, etc. Setting \`max: 1, duration: 600000\` (1 job per 10 min) results in workers thrashing every 30s — combine the limiter with a per-job \`delay\` for very long windows, or bump \`maximumRateLimitDelay\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'rate-limiter', 'throttle', 'limiter'],
    repository: repo,
    filePath: 'src/interfaces/rate-limiter-options.ts',
    url: `${baseUrl}/src/interfaces/rate-limiter-options.ts`,
  },
  {
    title: 'Stalled job detection: lockDuration, lockRenewTime, stalledInterval',
    body: `A "stalled" job is one whose worker died (or was killed by Kubernetes) mid-processing. BullMQ detects this by combining a Redis lock with a periodic stalled checker.

\`\`\`ts
// src/classes/worker.ts (defaults)
{ lockDuration: 30000, stalledInterval: 30000, maxStalledCount: 1 }

// lockRenewTime defaults to lockDuration / 2
this.opts.lockRenewTime = this.opts.lockRenewTime || this.opts.lockDuration / 2;
\`\`\`

Mechanism: when a worker picks up a job it sets a Redis key \`<queueKey>:<jobId>:lock\` to a unique token with TTL = \`lockDuration\`. Every \`lockRenewTime\` ms the LockManager runs the \`extendLock-2.lua\` script:

\`\`\`lua
-- src/commands/extendLock-2.lua
local rcall = redis.call
if rcall("GET", KEYS[1]) == ARGV[1] then
  if rcall("SET", KEYS[1], ARGV[1], "PX", ARGV[2]) then
    rcall("SREM", KEYS[2], ARGV[3])
    return 1
  end
end
return 0
\`\`\`

Note the GET-then-SET-with-same-token pattern: the worker only renews if the lock is still its own. If another worker stole it (because it expired), the renewal returns 0 and you get a \`lockRenewalFailed\` event.

The stalledChecker (\`stalledInterval\` ms) runs the \`moveStalledJobsToWait\` Lua script which iterates the stalled SET, checks each job's lock key, and if missing, increments the stalled counter \`HINCRBY <jobKey> stc 1\`. If \`stc > maxStalledCount\`, the job goes to failed; otherwise back to waiting for another worker.

The non-obvious gotcha: if your CPU is pegged so badly that the lockRenewTime callback can not fire, your own job gets reaped as stalled. A 30s lockDuration with a 15s renew is generous, but a single-CPU pod handling concurrency:50 of CPU-bound jobs WILL miss renewals and self-reap. Either bump \`lockDuration\` to 60s+ or lower concurrency. Don't disable the stalled check (\`skipStalledCheck: true\`) without understanding that crashed workers will leak jobs in the active list forever.`,
    contentType: 'REPOSITORY_FILE',
    language: 'lua',
    tags: ['bullmq', 'stalled', 'lock', 'lock-duration', 'reliability'],
    repository: repo,
    filePath: 'src/commands/extendLock-2.lua',
    url: `${baseUrl}/src/commands/extendLock-2.lua`,
  },
  {
    title: 'Worker autorun: false and manual .run() control',
    body: `By default a Worker starts processing jobs the moment its connection is ready. \`autorun: false\` defers the loop start so you can control timing — useful for staggered cold starts, ordered shutdown, or test setup.

\`\`\`ts
// src/classes/worker.ts (constructor tail)
if (this.opts.autorun) {
  this.run().catch(error => this.emit('error', error));
}
\`\`\`

\`\`\`ts
// User code
const worker = new Worker('email', processor, {
  connection,
  autorun: false,
});

// Wait for app warm-up, DB pool ready, etc.
await myApp.ready();
await worker.run();
\`\`\`

\`run()\` itself is idempotent-protected:

\`\`\`ts
async run() {
  if (!this.processFn) throw new Error('No process function is defined.');
  if (this.running) throw new Error('Worker is already running.');
  try {
    this.running = true;
    if (this.closing || this.paused) return;
    await this.startStalledCheckTimer();
    if (!this.opts.skipLockRenewal) this.lockManager.start();
    const client = await this.client;
    const bclient = await this.blockingConnection.client;
    this.mainLoopRunning = this.mainLoop(client, bclient);
    await this.mainLoopRunning;
  } finally {
    this.running = false;
  }
}
\`\`\`

\`run()\` resolves when the worker is closed — it does not return after the first job. So if you \`await worker.run()\` your process won't reach the next line until shutdown.

Use cases for \`autorun: false\`:
- **Staggered start** in a fleet of pods to avoid 50 workers all hammering Redis with BLMOVE at \`t=0\`.
- **Test isolation** — construct the worker, run \`worker.run()\` only after seeding the queue with a known fixture.
- **Manual fetch loops** for advanced patterns (call \`getNextJob\` and \`processJob\` yourself); see the bullmq.io docs page on "manually fetching jobs".

The non-obvious gotcha: with \`autorun: false\` you must ALSO call \`startStalledCheckTimer\` if you do manual fetching, otherwise crashed workers' jobs are never recovered. \`run()\` does this for you; manual loops do not.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'worker', 'autorun', 'lifecycle'],
    repository: repo,
    filePath: 'src/classes/worker.ts',
    url: `${baseUrl}/src/classes/worker.ts`,
  },
  {
    title: 'Connection sharing: one ioredis client across multiple queues',
    body: `A Queue can accept either a connection options object or an existing ioredis instance. Passing an instance lets multiple Queues share the same TCP connection — important when your Redis provider charges per connection (Upstash) or caps them (free-tier Render Redis at 10).

\`\`\`ts
// docs/gitbook/guide/connections.md
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis({ maxRetriesPerRequest: null });

// Reuse the ioredis instance in 2 different producers
const myFirstQueue = new Queue('myFirstQueue', { connection });
const mySecondQueue = new Queue('mySecondQueue', { connection });
\`\`\`

Inside RedisConnection's constructor:

\`\`\`ts
// src/classes/redis-connection.ts
if (!isRedisInstance(opts)) {
  // We OWN this connection — wrap user opts and create a new IORedis
  this.opts = { port: 6379, host: '127.0.0.1', retryStrategy: ..., ...opts };
  if (this.extraOptions.blocking) this.opts.maxRetriesPerRequest = null;
} else {
  this._client = opts;
  if (this._client.options.keyPrefix) {
    throw new Error('BullMQ: ioredis does not support ioredis prefixes, use the prefix option instead.');
  }
}
\`\`\`

When you pass an instance, BullMQ does NOT call \`disconnect()\` on it during \`queue.close()\` (the \`shared\` extra-option is set true). You own the lifecycle.

The non-obvious gotcha: Workers cannot share connections in the same way because they need a BLOCKING connection for the BLMOVE fetch. If you pass your shared instance to a Worker, BullMQ duplicates it internally for the blocking client (\`opts.connection.duplicate({ connectionName })\`) — so a Worker always uses at least 2 connections, no matter what.

Also: ioredis' \`keyPrefix\` option is hard-rejected because it would prepend the prefix at the ioredis layer for EVERY command — including the EVALSHA arguments — silently breaking BullMQ's own \`bull:queueName:\` namespacing. Use the BullMQ \`prefix\` option instead.

For \`maxRetriesPerRequest\`: it must be \`null\` on blocking connections (workers, QueueEvents). Producers should keep the ioredis default (20) so a transient Redis blip does not hang an HTTP handler forever.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'connection', 'ioredis', 'sharing', 'redis'],
    repository: repo,
    filePath: 'src/classes/redis-connection.ts',
    url: `${baseUrl}/src/classes/redis-connection.ts`,
  },
  {
    title: 'Connecting to Redis Cluster: pass an ioredis Cluster instance',
    body: `BullMQ supports Redis Cluster but you have to construct the cluster client yourself with ioredis and pass it as the connection. The RedisConnection class has explicit cluster handling.

\`\`\`ts
// src/classes/redis-connection.ts
if (isRedisCluster(this._client)) {
  this.opts = this._client.options.redisOptions;
} else {
  this.opts = this._client.options;
}
\`\`\`

\`\`\`ts
// User code
import { Cluster } from 'ioredis';
import { Queue, Worker } from 'bullmq';

const cluster = new Cluster([
  { host: 'shard-1.example.com', port: 6379 },
  { host: 'shard-2.example.com', port: 6379 },
], {
  redisOptions: { tls: {}, password: process.env.REDIS_PASSWORD },
});

const queue = new Queue('email', { connection: cluster, prefix: '{email}' });
const worker = new Worker('email', processor, { connection: cluster, prefix: '{email}' });
\`\`\`

The crucial pattern is the \`prefix\` in curly braces: \`{email}\`. Cluster routes commands to shards based on the CRC16 hash of the key. BullMQ's Lua scripts touch many keys per call (waitKey, activeKey, eventStreamKey, etc.) and Lua refuses cross-slot operations. Wrapping the prefix in \`{...}\` forces all keys for that queue onto the same shard via ioredis' hash-tag handling.

For Worker, the cluster duplication path:

\`\`\`ts
isRedisInstance(opts.connection)
  ? (<Redis>opts.connection).isCluster
    ? (<Cluster>opts.connection).duplicate(undefined, {
        redisOptions: {
          ...((<Cluster>opts.connection).options?.redisOptions || {}),
          connectionName,
        },
      })
    : (<Redis>opts.connection).duplicate({ connectionName })
  : ...
\`\`\`

The cluster handler also has a special case in waitUntilReady — Cluster reports \`'connect'\` as connected (standalone uses \`'ready'\`), and treating that as not-ready would hang forever:

\`\`\`ts
if (client.status === 'connect' && isRedisCluster(client)) {
  return;
}
\`\`\`

Without that branch (added in v5.75.2), cluster workers throw a spurious "Connection is closed" during disconnect.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'redis-cluster', 'connection', 'sharding'],
    repository: repo,
    filePath: 'src/classes/redis-connection.ts',
    url: `${baseUrl}/src/classes/redis-connection.ts`,
  },
  {
    title: 'Atomic Lua scripts enforce queue invariants',
    body: `Almost every state transition in BullMQ is a Lua script. The src/commands directory has 51 \`.lua\` files for things like adding a job, moving to active, moving to finished, extending locks, cleaning sets, and obliterate.

\`\`\`
src/commands/
  addStandardJob-9.lua        — produce a normal job
  addDelayedJob-6.lua         — produce a delayed job (ZADD)
  addPrioritizedJob-9.lua     — priority queue insert
  moveToActive-11.lua         — atomic dequeue + lock
  moveToFinished-14.lua       — completed/failed transition + child notification
  moveStalledJobsToWait-8.lua — periodic stalled recovery
  extendLock-2.lua            — token-checked lock renewal
  drain-5.lua                 — clear waiting/delayed lists
  obliterate.lua              — destroy the entire queue
\`\`\`

The numeric suffix (\`-9\`, \`-11\`, \`-14\`) is the number of KEYS the script accepts — a build-time convention so the loader knows the EVALSHA shape.

Why so much Lua? Because every alternative is wrong:
- Multi-step Node code with \`MULTI/EXEC\` does not work for read-then-write logic (EXEC cannot branch on intermediate results).
- WATCH/MULTI optimistic locking thrashes under concurrency — a contested job add would retry 5–10 times.
- A separate "scheduler" process (which Bull v3 used) adds latency and SPOF.

Lua runs in the Redis main thread, so each script is atomic relative to all other commands. This is what guarantees that a job in \`active\` ALWAYS has a matching lock key and is NEVER also in \`waiting\` — invariants that would be impossible to maintain with separate commands under high concurrency.

The non-obvious gotcha: Lua scripts are loaded once with SCRIPT LOAD then called via EVALSHA. After a Redis FLUSHALL or restart-without-persistence, the cached scripts vanish; the next EVALSHA returns NOSCRIPT and BullMQ transparently re-loads. If you see "NOSCRIPT" in your logs, your Redis is restarting frequently — fix that, not the bullmq side.

Also: cross-slot key access in Cluster mode breaks Lua. That is why hash-tag prefixes (\`{queueName}\`) are required for cluster.`,
    contentType: 'REPOSITORY_FILE',
    language: 'lua',
    tags: ['bullmq', 'lua', 'atomicity', 'redis', 'invariants'],
    repository: repo,
    filePath: 'src/commands/moveStalledJobsToWait-8.lua',
    url: `${baseUrl}/src/commands/moveStalledJobsToWait-8.lua`,
  },
  {
    title: 'Queue.drain vs Queue.clean vs Queue.obliterate',
    body: `Three different ways to remove jobs, with very different semantics — picking the wrong one in production can either leave junk behind or lose data you wanted.

\`\`\`ts
// src/classes/queue.ts
async drain(delayed = false): Promise<void> {
  await this.scripts.drain(delayed);
}

async clean(grace: number, limit: number,
            type: 'completed'|'wait'|'waiting'|'active'|'paused'|'prioritized'|'delayed'|'failed' = 'completed'): Promise<string[]> {
  // Remove jobs of the given TYPE older than grace ms, up to limit
  const timestamp = Date.now() - grace;
  while (deletedCount < maxCount) {
    const jobsIds = await this.scripts.cleanJobsInSet(normalizedType, timestamp, maxCountPerCall);
    // ...
  }
}

async obliterate(opts?: ObliterateOpts): Promise<void> {
  await this.pause();
  let cursor = 0;
  do {
    cursor = await this.scripts.obliterate({ force: false, count: 1000, ...opts });
  } while (cursor);
}
\`\`\`

- **drain(delayed?)** — removes only jobs in waiting and (optionally) delayed. Active/completed/failed are untouched. Useful when you want to flush the backlog but keep history. Does NOT pause the queue.
- **clean(grace, limit, type)** — type-targeted cleanup of jobs older than \`grace\` ms. Iterates in batches of \`maxCountPerCall = min(10000, limit)\` to avoid one giant Lua call. Returns the IDs deleted. The default type is 'completed' — a common cron job is \`queue.clean(7 * 24 * 3600 * 1000, 10000, 'completed')\`.
- **obliterate(opts)** — nuclear. Pauses the queue first, then deletes every key under the queue prefix in 1000-key chunks (configurable). Throws if there are active jobs unless \`force: true\`. The cursor loop keeps going until obliterate returns 0 (no more keys).

The non-obvious gotcha with \`clean\`: passing type \`'active'\` removes ACTIVE jobs but does NOT release their locks or remove from the stalled set — those locks just expire on \`lockDuration\` and the stalled checker will then try to recover IDs that no longer exist. Cleaning active jobs is almost never the right move; pause the queue first, wait for active to drain, then clean.

\`obliterate\` is irreversible AND requires SCAN-equivalent iteration over potentially millions of keys. On a 10M-job queue it can take many minutes; the cursor loop is your hint to expect it.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'queue', 'drain', 'clean', 'obliterate', 'cleanup'],
    repository: repo,
    filePath: 'src/classes/queue.ts',
    url: `${baseUrl}/src/classes/queue.ts`,
  },
  {
    title: 'attemptsMade and attemptsStarted: subtle but distinct counters',
    body: `The Job class has TWO retry counters and they answer different questions.

\`\`\`ts
// src/classes/job.ts
attemptsStarted = 0;  // incremented every time the worker picks up the job
attemptsMade = 0;     // incremented every time the job COMPLETES or FAILS

// in moveToFailed:
this.attemptsMade += 1;
\`\`\`

\`attemptsMade\` is the one you usually want — "how many times has this job been tried to completion." It is compared against \`opts.attempts\` to decide whether to retry. The check is at line 776 of job.ts:

\`\`\`ts
this.attemptsMade + 1 < this.opts.attempts && !err instanceof UnrecoverableError
  ? // retry path
  : // fail permanently
\`\`\`

\`attemptsStarted\` is incremented every time the worker MOVES the job to active — even if the worker then crashes before \`attemptsMade\` ticks. That is how stalled-but-not-failed jobs are tracked separately from regular retries.

The \`maxStartedAttempts\` worker option (added recently) caps \`attemptsStarted\`:

\`\`\`ts
// src/interfaces/worker-options.ts
/**
 * Defines the maximum number of times a job is allowed to start processing,
 * regardless of whether it completes or fails. Each time a worker picks up the job
 * and begins processing it, the attemptsStarted counter is incremented.
 * If this counter reaches maxStartedAttempts, the job will be moved to the failed state
 * with an UnrecoverableError.
 */
maxStartedAttempts?: number;
\`\`\`

This guards against the pathological case where a job keeps crashing the worker BEFORE it can record the failure — without \`maxStartedAttempts\`, such a job becomes a "poison pill" that crashes worker after worker indefinitely (because each crash leaves \`attemptsMade\` unchanged).

Resetting these in \`Job.retry()\`:

\`\`\`ts
async retry(state = 'failed', opts: RetryOptions = {}) {
  await this.scripts.reprocessJob(this, state, opts);
  this.failedReason = null;
  if (opts.resetAttemptsMade) this.attemptsMade = 0;
  if (opts.resetAttemptsStarted) this.attemptsStarted = 0;
}
\`\`\`

Manually retrying a failed job from a dashboard typically wants \`resetAttemptsMade: true\` — otherwise a 3/3 attempts job will fail again immediately on the next exception with no further retries.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'retry', 'attempts-made', 'attempts-started', 'poison-pill'],
    repository: repo,
    filePath: 'src/classes/job.ts',
    url: `${baseUrl}/src/classes/job.ts`,
  },
  {
    title: 'Custom jobId for idempotent producers',
    body: `The \`jobId\` option on \`Queue.add\` is the single most important pattern for at-least-once safe producers — webhooks, retried HTTP handlers, fan-out from message buses.

\`\`\`ts
// src/interfaces/base-job-options.ts
/**
 * Override the job ID — by default, the job ID is a unique
 * integer, but you can use this setting to override it.
 * If you use this option, it is up to you to ensure the
 * jobId is unique. If you attempt to add a job with an id that
 * already exists, it will not be added.
 */
jobId?: string;
\`\`\`

\`\`\`ts
// Producer
app.post('/webhooks/stripe', async (req) => {
  const eventId = req.headers['stripe-signature']; // unique per event
  await queue.add('process-stripe', req.body, { jobId: eventId });
  res.send({ ok: true });
});
\`\`\`

If Stripe retries the webhook, your handler runs again, but the second \`queue.add\` is a no-op — the existing job (or its completed entry) is kept. Compare to the default behavior where every webhook produces a new job.

Validation in \`addJob\`:

\`\`\`ts
// src/classes/queue.ts
const jobId = opts?.jobId;
if (jobId == '0' || jobId?.startsWith('0:')) {
  throw new Error("JobId cannot be '0' or start with 0:");
}
\`\`\`

Reserved prefix because internal "delay markers" use \`'0:<timestamp>'\` IDs. Don't use raw integers as IDs because the test \`jobId == '0'\` is loose-equals — using \`jobId: 0\` (number) will throw.

The non-obvious gotcha: idempotency is for the WAITING/ACTIVE/COMPLETED states. Once a job is removed (because of \`removeOnComplete\` or manual \`clean\`), the same jobId can be added again. So if you set \`removeOnComplete: true\` AND deduplicate by jobId, your second-attempt webhook from 24h later WILL be processed — the dedup window equals the retention window. For permanent dedup you need an external store (Redis SET, DB unique index) populated atomically inside the processor.

For temporary dedup with extension, BullMQ also has the \`deduplication\` option (with optional TTL) that uses a separate Redis key as a debounce gate — different from \`jobId\` and survives \`removeOnComplete\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'idempotency', 'job-id', 'webhook', 'deduplication'],
    repository: repo,
    filePath: 'src/interfaces/base-job-options.ts',
    url: `${baseUrl}/src/interfaces/base-job-options.ts`,
  },
  {
    title: 'Telemetry: pluggable Tracer + Meter for OpenTelemetry / Prometheus',
    body: `BullMQ ships a vendor-neutral telemetry interface modeled on OpenTelemetry. You implement Tracer + ContextManager (and optionally Meter), pass it to \`QueueOptions.telemetry\`, and every \`add\`, \`addBulk\`, \`drain\`, \`obliterate\`, and processor invocation creates a span.

\`\`\`ts
// src/interfaces/telemetry.ts
export interface Telemetry<Context = any> {
  tracer: Tracer<Context>;
  contextManager: ContextManager;
  meter?: Meter;        // optional — for counters/histograms/gauges
}

export interface Meter {
  createCounter(name: string, options?: MetricOptions): Counter;
  createHistogram(name: string, options?: MetricOptions): Histogram;
  createGauge?(name: string, options?: MetricOptions): Gauge;
}
\`\`\`

The trace is woven into \`Queue.add\`:

\`\`\`ts
// src/classes/queue.ts
async add(name, data, opts) {
  return this.trace<Job>(SpanKind.PRODUCER, 'add', \`\${this.name}.\${name}\`,
    async (span, srcPropagationMetadata) => {
      if (srcPropagationMetadata && !opts?.telemetry?.omitContext) {
        opts = { ...opts, telemetry: { metadata: srcPropagationMetadata } };
      }
      const job = await this.addJob(name, data, opts);
      span?.setAttributes({
        [TelemetryAttributes.JobName]: name,
        [TelemetryAttributes.JobId]: job.id,
      });
      return job;
    },
  );
}
\`\`\`

\`srcPropagationMetadata\` is a serialized form of the active context (W3C traceparent header for OTel). It is stored in the job opts so when the worker picks up the job, it can call \`contextManager.fromMetadata(activeContext, metadata)\` and continue the trace across processes — the producer's HTTP request and the worker's job processing show up as one distributed trace.

For Prometheus: the \`Counter\`, \`Histogram\`, and \`Gauge\` interfaces map cleanly to prom-client. \`recordJobMetrics\` (in job.ts) calls the meter on every status transition (\`completed\`, \`failed\`, \`delayed\`, \`retried\`, \`waiting\`).

The non-obvious gotcha: \`opts.telemetry.omitContext: true\` skips propagation, useful for high-volume queues where you don't want every job's opts to carry an extra ~50 bytes of traceparent. Don't enable telemetry on a queue producing 100K jobs/s without thinking about that overhead.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'telemetry', 'opentelemetry', 'prometheus', 'observability'],
    repository: repo,
    filePath: 'src/interfaces/telemetry.ts',
    url: `${baseUrl}/src/interfaces/telemetry.ts`,
  },
  {
    title: 'BullMQ v5 breaking change: connection is now required',
    body: `The v5.0.0 changelog (Dec 2023) made \`connection\` mandatory on the Worker. Before v5 the Worker silently defaulted to \`{ host: '127.0.0.1', port: 6379 }\`, which made it trivially easy to deploy a worker that connected to localhost in a Kubernetes pod where Redis lived in a sibling service.

\`\`\`ts
// src/classes/worker.ts
if (!opts || !opts.connection) {
  throw new Error('Worker requires a connection');
}
\`\`\`

\`\`\`md
# v5.0.0 BREAKING CHANGES (docs/gitbook/changelog.md)
* connection: require connection to be passed (#2335)
* job: revert console warn custom job ids when they represent integers (#2312)
* worker: markers use now a dedicated key in redis instead of using a special
  Job ID. (73cf5fc, 0bac0fb)
\`\`\`

The "markers" change is the more invisible breaking one: in v4 and earlier, BullMQ used special job IDs starting with \`0:\` to mark positions in the wait list (so workers could skip them). In v5 markers live in their own Redis key. Migration impact: a queue created with v4 and read by v5 workers would see "phantom jobs" in the wait list. The mitigation is documented in the [Better Queue Markers](https://bullmq.io/news/231204/better-queue-markers/) post and the v5 migration guide.

Other v5 changes worth knowing about:
- Cron-pattern jobs use \`pattern\` (not the legacy \`cron\` field). The Repeat class still maps \`cron\` → \`pattern\` for backward-compat: \`repeatOpts.pattern ??= repeatOpts.cron;\`
- Repeatable jobs migrating to the new "Job Scheduler" — Repeat is still there but flagged "to be deprecated in v6 in favor of Job Scheduler" (worker.ts line 202).

If you are upgrading a v3/v4 deployment, the safe path is: deploy v5 producers and workers SIMULTANEOUSLY, drain the old queue first via \`queue.drain()\` if possible, and never run mixed v4/v5 workers against the same queue prefix.

The peerDependency tree also tightened — v5 requires Node 18+ and ioredis 5.x; v4 worked on Node 16. Check your container base image before bumping.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'migration', 'v5', 'breaking-changes', 'upgrade'],
    repository: repo,
    filePath: 'docs/gitbook/changelog.md',
    url: `${baseUrl}/docs/gitbook/changelog.md`,
  },
  {
    title: 'BullMQ requires maxmemory-policy=noeviction; Upstash and TLS gotchas',
    body: `The connections doc has a danger callout that is not negotiable for production:

\`\`\`md
> Make sure that your redis instance has the setting
> maxmemory-policy=noeviction
> in order to avoid automatic removal of keys which would cause unexpected
> errors in BullMQ
\`\`\`

If Redis evicts keys under memory pressure (\`allkeys-lru\`, the common default on managed services), it can drop a job's lock key while the worker still thinks it owns the job, or drop a half-written job hash. The result is corrupted state — phantom stalled jobs, jobs in \`active\` with no metadata, lost retries. \`noeviction\` makes Redis OOM the next write instead, which surfaces as a clear error rather than silent data loss.

Upstash and Redis Cloud both default to \`noeviction\` on paid tiers. Upstash free tier is also \`noeviction\` but caps memory hard at 256MB — for a busy queue, completed-job retention will fill that fast unless \`removeOnComplete\` is aggressive.

For TLS to Upstash / Redis Cloud:

\`\`\`ts
import IORedis from 'ioredis';
import { Worker } from 'bullmq';

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,        // required for blocking workers
  tls: { rejectUnauthorized: false },// many providers self-sign certs internally
  enableReadyCheck: false,           // Upstash REST mode quirk
});

new Worker('email', processor, { connection });
\`\`\`

The \`rediss://\` URL scheme (with two s's) auto-enables TLS in ioredis, which is cleaner than passing \`tls: {}\` manually. Most providers give you a \`rediss://\` URL.

The non-obvious gotcha specific to Upstash: their free-tier connection limit is 30 concurrent connections. A Worker with default config opens 2 (blocking + non-blocking). Add a Queue (1) and a QueueEvents (1 blocking) per service and you're at 5 connections per pod — 6 pods × 5 = 30, you're maxed. Either share connections (Queue side) or pay for higher limits before scaling out.

Also: Upstash REST API mode does NOT support BLMOVE/BZPOPMIN — you MUST use the regular Redis URL (\`redis-cli\` mode), not the REST mode. BullMQ workers will silently never fetch jobs over REST.`,
    contentType: 'REPOSITORY_FILE',
    language: 'markdown',
    tags: ['bullmq', 'upstash', 'tls', 'redis-cloud', 'maxmemory-policy', 'production'],
    repository: repo,
    filePath: 'docs/gitbook/guide/connections.md',
    url: `${baseUrl}/docs/gitbook/guide/connections.md`,
  },
  {
    title: 'getJobCounts and queue getters: building a dashboard backend',
    body: `When you want to expose queue health to a dashboard or alerting system, the QueueGetters class has a small set of count-and-list methods that are cheap and fault-tolerant.

\`\`\`ts
// src/classes/queue-getters.ts
async getJobCountByTypes(...types: JobType[]): Promise<number> {
  const result = await this.getJobCounts(...types);
  // sum of values for the requested types
}

async getJobCounts(...types: JobType[]): Promise<{ [index: string]: number }> {
  const currentTypes = ...; // dedup + filter
  const responses = await this.scripts.getCounts(currentTypes);
  // returns { waiting: N, active: N, completed: N, failed: N, ... }
}
\`\`\`

Convenience wrappers for the common cases:

\`\`\`ts
queue.getCompletedCount()    // → getJobCountByTypes('completed')
queue.getFailedCount()       // → getJobCountByTypes('failed')
queue.getDelayedCount()      // → getJobCountByTypes('delayed')
queue.getActiveCount()       // → getJobCountByTypes('active')
queue.getPrioritizedCount()  // → getJobCountByTypes('prioritized')
queue.getWaitingCount()      // → getJobCountByTypes('waiting')
queue.getWaitingChildrenCount()
\`\`\`

All of these go through the \`getCounts-1.lua\` script which calls \`LLEN\`/\`ZCARD\` per type in a single round-trip — much cheaper than doing 5 separate Redis commands.

For per-priority breakdown:

\`\`\`ts
async getCountsPerPriority(priorities: number[]): Promise<{...}> {
  const uniquePriorities = ...;
  const responses = await this.scripts.getCountsPerPriority(uniquePriorities);
}
\`\`\`

Useful when you have, say, priority 1 (urgent) and priority 100 (background) and you want to alert on a backed-up urgent queue without false positives from the background pile.

Listing actual jobs uses \`getJobs(types, start, end, asc)\` which fetches a page from the relevant list/zset and hydrates Job instances. The non-obvious gotcha: \`getJobs('active', 0, 1000)\` is fine, but \`getJobs('completed', 0, 100000)\` against a queue with millions of completed jobs deserializes 100K hashes through MGET — page it. Use small windows (\`[0, 100]\`) and paginate.

Building Bull Board, Arena, or Taskforce-style dashboards means combining these getters with QueueEvents listeners — getters give you "current state at this instant," QueueEvents gives you "stream of changes since I started watching."`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bullmq', 'getters', 'dashboard', 'metrics', 'queue-getters'],
    repository: repo,
    filePath: 'src/classes/queue-getters.ts',
    url: `${baseUrl}/src/classes/queue-getters.ts`,
  },
  {
    title: 'Dashboard tools: Bull Board, Arena, and the official Taskforce.sh frontend',
    body: `BullMQ ships no UI of its own — the README explicitly points to the company's hosted product:

\`\`\`md
# Official FrontEnd
[Taskforce.sh, Inc](https://taskforce.sh)

Supercharge your queues with a professional front end:
- Get a complete overview of all your queues.
- Inspect jobs, search, retry, or promote delayed jobs.
- Metrics and statistics.
\`\`\`

For self-hosted dashboards, the three commonly-used OSS options are:

- **Bull Board** ([felixmosh/bull-board](https://github.com/felixmosh/bull-board)) — Express/Fastify/Koa/Hapi adapter that mounts a React UI at any path. Supports BullMQ + legacy Bull. Most active community choice.
- **Arena** ([bee-queue/arena](https://github.com/bee-queue/arena)) — older, originally for bee-queue. BullMQ support added later. Lighter feature set than Bull Board but more mature.
- **Taskforce.sh** — hosted only, by the BullMQ maintainers. Adds team-level features (alerting, audit log) the OSS dashboards lack.

Wiring Bull Board with Express:

\`\`\`ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(emailQueue),
    new BullMQAdapter(reportsQueue),
  ],
  serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());
\`\`\`

The adapters wrap a Queue instance and expose pagination over the queue-getters described above (\`getJobs\`, \`getJobCounts\`) plus action endpoints (retry, remove, promote).

The non-obvious gotchas:

1. **Bull Board does NOT proxy to Redis directly**. It needs the Queue instance, which means the dashboard process needs the same Redis access as your producers. Don't run it on a public route — it can drain/obliterate queues. Always gate behind \`basicAuth\` or a SSO middleware.

2. **Listing 'completed' on a busy queue is expensive**. Bull Board defaults to 10/page but if a user clicks "page 1000" the underlying \`getJobs(0, 10000)\` call can deserialize 10K hashes. Cap your retention with \`removeOnComplete\` or pre-filter.

3. **Bull Board cannot draw real-time graphs without QueueEvents** — it only polls counts. For live dashboards (active jobs/sec, throughput) you need to push QueueEvents to a time-series store yourself.`,
    contentType: 'REPOSITORY_FILE',
    language: 'markdown',
    tags: ['bullmq', 'bull-board', 'arena', 'taskforce', 'dashboard', 'monitoring'],
    repository: repo,
    filePath: 'README.md',
    url: `${baseUrl}/README.md`,
  },
];
