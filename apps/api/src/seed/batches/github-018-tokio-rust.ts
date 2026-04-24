/**
 * Batch github-018-tokio-rust
 *
 * 25 patterns from the Tokio async runtime for Rust (tokio-rs/tokio).
 * Every entry attributes to a real source file under tokio/ or
 * tokio-macros/. Code snippets are taken verbatim from the repo.
 *
 * Authoring rules (see CORPUS-PLAN.md):
 * - Real attribution; no fabricated URLs
 * - Real patterns implemented in the runtime
 * - 250-450 word body
 * - One topic per entry
 * - WHAT + HOW (real code) + WHY + non-obvious gotcha
 */

import type { SeedItem } from '../types';

const tokio = { owner: 'tokio-rs', name: 'tokio' };
const baseUrl = 'https://github.com/tokio-rs/tokio/blob/master';

export const BATCH: SeedItem[] = [
  {
    title: '#[tokio::main] expands to a Builder + block_on, not magic',
    body: `The \`#[tokio::main]\` attribute is a thin proc-macro from the \`tokio-macros\` crate. It strips \`async\` from your function, builds a runtime, and calls \`block_on\` on the body. There is no hidden runtime — what you see in the expansion is exactly what executes.

\`\`\`rust
// from tokio-macros/src/entry.rs
let mut config = Configuration::new(is_test, rt_multi_thread);
// ... parses worker_threads, flavor, start_paused, crate, unhandled_panic, name
match config.flavor {
    RuntimeFlavor::CurrentThread | RuntimeFlavor::Local => {
        // builds Builder::new_current_thread()
    }
    RuntimeFlavor::Threaded => {
        // builds Builder::new_multi_thread().worker_threads(n)
    }
}
\`\`\`

The default flavor is \`multi_thread\` for \`#[tokio::main]\` and \`current_thread\` for \`#[tokio::test]\`. Worker thread count defaults to the number of CPU cores. The macro forces \`enable_all()\` so I/O and time drivers are always on — you only need to drop into \`Builder\` manually if you want to disable one of those, set thread name/stack size, or install lifecycle callbacks.

Two non-obvious things. First, the \`crate\` attribute (\`#[tokio::main(crate = "my_tokio_reexport")]\`) lets you re-export tokio under a different name — the macro emits \`#crate_path::runtime::Builder\` rather than hard-coding \`tokio\`. Useful for libraries that vendor tokio.

Second, \`unhandled_panic = "shutdown_runtime"\` is gated on \`tokio_unstable\` and only works on the current-thread flavor. By default a panicked task just emits a tracing event and the runtime keeps going — a panic in one task does NOT bring down the process. If you want the panic to kill the process you have to handle the \`JoinError\` from the JoinHandle and propagate it yourself.

Because the macro just expands to a synchronous \`fn main()\` that builds a Runtime, you can usually replace it with the explicit \`Runtime::new()?.block_on(async { ... })\` form when you need finer control (multiple runtimes, custom shutdown timeouts, conditional flavor selection). The macro is convenience, not infrastructure — there is nothing it does that you cannot do by hand.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'async', 'macro', 'runtime'],
    repository: tokio,
    filePath: 'tokio-macros/src/entry.rs',
    url: `${baseUrl}/tokio-macros/src/entry.rs`,
  },
  {
    title: 'tokio::spawn returns a JoinHandle that drives the task even if dropped',
    body: `\`tokio::spawn\` submits a future to the current runtime and immediately returns a \`JoinHandle<T>\`. The future starts running as soon as the scheduler picks it up — you do NOT need to await the handle for the task to make progress.

\`\`\`rust
// tokio/src/task/spawn.rs
pub fn spawn<F>(future: F) -> JoinHandle<F::Output>
where
    F: Future + Send + 'static,
    F::Output: Send + 'static,
{
    let fut_size = std::mem::size_of::<F>();
    if fut_size > BOX_FUTURE_THRESHOLD {
        spawn_inner(Box::pin(future), SpawnMeta::new_unnamed(fut_size))
    } else {
        spawn_inner(future, SpawnMeta::new_unnamed(fut_size))
    }
}
\`\`\`

The \`Send + 'static\` bounds are why you cannot capture an \`Rc\` or a non-\`'static\` reference into a spawned task — the work-stealing scheduler may move the task between threads. For \`!Send\` futures use \`spawn_local\` inside a \`LocalSet\`.

The \`BOX_FUTURE_THRESHOLD\` boxes large futures before submission. Tokio computes \`size_of::<F>()\` at the call site and falls back to a heap allocation when the future is bigger than ~16 KiB. This avoids stack-blowing the worker thread when you spawn deeply nested async chains.

Dropping a \`JoinHandle\` does NOT cancel the task — it just detaches. The task keeps running to completion and its output is discarded. To actually cancel, call \`handle.abort()\`:

\`\`\`rust
// tokio/src/runtime/task/join.rs
pub fn abort(&self) {
    self.raw.remote_abort();
}
\`\`\`

Abort is asynchronous: the task is scheduled to be cancelled at its next await point. A task between awaits (i.e. running synchronous code) will not be interrupted. If you await the handle of an aborted task you get \`Err(JoinError)\` whose \`.is_cancelled()\` returns true.

Critical gotcha: \`abort\` does NOT work on \`spawn_blocking\` tasks once they have started. Blocking tasks run on dedicated OS threads and there is no safe way to interrupt them. If your blocking work might run forever, pass a cancellation flag (\`Arc<AtomicBool>\`) into the closure and check it periodically — or accept that runtime shutdown will block until the work finishes (use \`shutdown_timeout\` to cap the wait).`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'spawn', 'joinhandle', 'task'],
    repository: tokio,
    filePath: 'tokio/src/task/spawn.rs',
    url: `${baseUrl}/tokio/src/task/spawn.rs`,
  },
  {
    title: 'tokio::select! random-by-default branch selection (and when to flip biased;)',
    body: `\`tokio::select!\` polls multiple futures concurrently on the same task and completes when the first one returns. The macro itself is documented in \`tokio/src/macros/select.rs\` and lays out the lifecycle in six steps: evaluate preconditions, aggregate futures, poll concurrently, match the first ready value to the pattern, retry if the pattern fails, fall through to \`else\` if everything is disabled.

\`\`\`text
<pattern> = <async expression> (, if <precondition>)? => <handler>,
\`\`\`

Fairness comes from random branch selection. Every poll, tokio uses its task-local RNG to pick the starting branch:

> By default, \`select!\` randomly picks a branch to check first. This provides
> some level of fairness when calling \`select!\` in a loop with branches that
> are always ready.

This matters when one branch is "always ready" (e.g. a channel with backed-up messages). Without randomness, the first branch in source order would starve the rest. The cost is non-trivial: the random selection has a CPU price tag the docs explicitly call out.

Add \`biased;\` at the top to disable randomness and poll top-to-bottom:

\`\`\`rust
select! {
    biased;
    _ = shutdown.recv() => break,           // checked first every poll
    Some(msg) = stream.next() => process(msg),
}
\`\`\`

Use \`biased\` when (a) one branch is "more important" — the canonical example is a shutdown signal that must take precedence over a busy stream, or (b) the futures interact in a way where polling order is meaningful, or (c) the random RNG cost shows up in profiling.

The non-obvious gotcha is **cancellation safety**. When one branch wins, every other branch's future is **dropped**. If a branch was \`mid-await\` on something that holds state (e.g. \`mpsc::Receiver::recv\` mid-dequeue, or a custom future that was about to remove an item from a queue), dropping it must leave the world in a consistent state. Tokio's own primitives (\`recv\`, \`send\`, \`sleep\`) are documented as cancel-safe. \`tokio::io::AsyncReadExt::read\` is NOT cancel-safe — it may have partially consumed bytes from the kernel buffer that are now lost. The docs maintain a list at \`docs.rs/tokio/latest/tokio/macro.select.html#cancellation-safety\` — consult it before putting any future you do not own inside \`select!\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'select', 'fairness', 'cancellation'],
    repository: tokio,
    filePath: 'tokio/src/macros/select.rs',
    url: `${baseUrl}/tokio/src/macros/select.rs`,
  },
  {
    title: 'tokio::join! waits for all branches; rotates poll order for fairness',
    body: `\`tokio::join!\` is the AND-counterpart to \`select!\`. It runs N futures concurrently on the **same task** and completes when **all** of them return, yielding a tuple of their outputs.

\`\`\`rust
// tokio/src/macros/join.rs (doc preview)
let (first, second) = tokio::join!(
    do_stuff_async(),
    more_async_work());
\`\`\`

The key phrase from the docs: "running all async expressions on the current task, the expressions are able to run **concurrently** but not in **parallel**." That is, \`join!\` is **single-threaded multiplexing**, not parallelism. If one of the joined futures runs CPU-bound code without yielding, every other branch is blocked. For real parallelism, spawn each future with \`tokio::spawn\` and \`join!\` the resulting JoinHandles instead — that pushes them onto separate worker threads.

Two important differences from \`futures::future::join_all\`:

1. \`join!\` stores futures **inline**, no Vec/Box allocation. The number of branches must be known at compile time. \`join_all\` allocates one Box per future and accepts a runtime-sized iterator.
2. \`join!\` returns a tuple of mixed types: \`(A, B, C)\`. \`join_all\` requires all futures to have the same output type and returns \`Vec<T>\`.

Fairness: by default \`join!\` rotates which inner future is polled first on each wakeup. This prevents the leftmost future from starving its siblings. Add \`biased;\` to lock the order top-to-bottom — useful when one branch is cheap and you want it to short-circuit (e.g. checking a cancel token before doing real work).

For the early-exit-on-error variant, use \`tokio::try_join!\` — it short-circuits and returns the first \`Err\`, dropping the unfinished futures. \`join!\` itself ignores Result-ness: it waits for every branch even if one returned \`Err\`, which can mean burning a long timeout because one branch hangs while another already failed.

Cancellation: if the future that contains the \`join!\` is dropped (e.g. its containing \`select!\` lost), all sub-futures are dropped. Their cancel-safety rules apply transitively. Two non-cancel-safe futures inside a join inside a select means dropping the select can corrupt state in either of them — keep \`select!\` branches simple and only join cancel-safe futures.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'join', 'concurrency', 'macro'],
    repository: tokio,
    filePath: 'tokio/src/macros/join.rs',
    url: `${baseUrl}/tokio/src/macros/join.rs`,
  },
  {
    title: 'tokio::sync::Mutex vs std::sync::Mutex — async lock is for held-across-await guards',
    body: `The first thing the docstring says is "**Contrary to popular belief, it is ok and often preferred to use the ordinary Mutex from the standard library in asynchronous code.**" That sentence ends a lot of arguments.

\`\`\`rust
// tokio/src/sync/mutex.rs
/// The feature that the async mutex offers over the blocking mutex is the
/// ability to keep it locked across an \`.await\` point. This makes the async
/// mutex more expensive than the blocking mutex, so the blocking mutex should
/// be preferred in the cases where it can be used. The primary use case for the
/// async mutex is to provide shared mutable access to IO resources such as a
/// database connection.
\`\`\`

Rule of thumb: if the critical section does **not** await, use \`std::sync::Mutex\` (or \`parking_lot::Mutex\` for performance). It is faster, has no async machinery, and the compiler will yell if you try to hold its guard across an await point in a Send future.

Use \`tokio::sync::Mutex\` when:
- You **must** hold the lock across \`.await\` (rare in well-designed code).
- The protected resource is itself an I/O handle (DB connection, network socket) where contention is dominated by I/O wait, not lock acquisition.

Tokio's Mutex guarantees **FIFO fairness** — tasks acquire the lock in the order they called \`.lock()\`. \`std::sync::Mutex\` makes no fairness guarantee on most platforms; under contention it can starve waiters.

The "lock-across-await" footgun: with \`std::sync::Mutex\` the compiler sometimes lets the guard live across an await when the future happens not to be \`Send\` (e.g. inside a \`spawn_local\`). That compiles, but if you ever migrate to a multi-thread runtime or change the future to Send, you get cryptic errors. Even when it compiles, it can deadlock — the task may park while holding the lock, and another task on the same worker may never get a chance to release it.

Better than either mutex: design out the shared state. Wrap the resource in a dedicated task and talk to it via \`mpsc\`. The task owns the resource, you send it commands, no lock needed. The mini-redis example linked from the Mutex docs is the canonical illustration of this pattern.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'mutex', 'sync', 'async-lock'],
    repository: tokio,
    filePath: 'tokio/src/sync/mutex.rs',
    url: `${baseUrl}/tokio/src/sync/mutex.rs`,
  },
  {
    title: 'tokio::sync::RwLock is write-preferring (writers cannot starve)',
    body: `Tokio's \`RwLock\` allows N concurrent readers OR one writer, with a fairness policy that explicitly prevents reader starvation of writers.

\`\`\`rust
// tokio/src/sync/rwlock/mod.rs
/// The priority policy of Tokio's read-write lock is _fair_ (or
/// _write-preferring_), in order to ensure that readers cannot starve
/// writers. Fairness is ensured using a first-in, first-out queue for the tasks
/// awaiting the lock; a read lock will not be given out until all write lock
/// requests that were queued before it have been acquired and released.
\`\`\`

The implementation reuses \`batch_semaphore\` under the hood: each writer acquires \`MAX_READS\` permits (\`u32::MAX >> 3\`), each reader acquires 1. Because the semaphore is FIFO, a queued writer blocks subsequent readers from being admitted until the writer's turn comes — that is what gives the write-preferring guarantee.

\`\`\`rust
#[cfg(not(loom))]
const MAX_READS: u32 = u32::MAX >> 3;
\`\`\`

Contrast with \`std::sync::RwLock\`, where the priority policy is OS-dependent (Linux glibc is read-preferring; on macOS it is more balanced). For correctness across platforms, prefer \`tokio::sync::RwLock\` when you need predictable fairness.

When to use RwLock at all: only if you have many readers and rare writers, AND the read critical sections are non-trivial (longer than a few hundred nanoseconds). For tiny critical sections \`Mutex\` is faster — the read-side bookkeeping (incrementing/decrementing the reader count atomically) costs more than just acquiring the mutex.

The non-obvious gotcha: with the write-preferring policy, a hot read path with one occasional writer can pause **all readers** for as long as the in-flight readers take to finish AND any queued readers behind the writer take to start. If your readers can take seconds (e.g. holding the read guard across a slow async operation), writes can stall arbitrarily long. Either keep read sections short, or design with a single-writer model: a dedicated writer task owns the data and broadcasts updates via \`watch\` or \`broadcast\` to readers — no lock needed at all.

Same as Mutex: holding a write guard across an \`.await\` is a deadlock invitation if any awaited future tries to acquire a read lock on the same RwLock.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'rwlock', 'fairness', 'sync'],
    repository: tokio,
    filePath: 'tokio/src/sync/rwlock.rs',
    url: `${baseUrl}/tokio/src/sync/rwlock.rs`,
  },
  {
    title: 'oneshot: single-value channel with sync send (works outside async context)',
    body: `\`tokio::sync::oneshot\` carries exactly one value from sender to receiver. The sender is a one-shot resource — once you call \`send\`, the channel is consumed.

\`\`\`rust
// tokio/src/sync/oneshot.rs
let (tx, rx) = oneshot::channel();

tokio::spawn(async move {
    if let Err(_) = tx.send(3) {
        println!("the receiver dropped");
    }
});

match rx.await {
    Ok(v) => println!("got = {:?}", v),
    Err(_) => println!("the sender dropped"),
}
\`\`\`

The key feature is that **\`Sender::send\` is not async**. It is a synchronous method that takes self by value, drops the value into a slot, and wakes any parked receiver. This means:

1. You can send from non-async code (a thread, an FFI callback, a signal handler — anywhere).
2. You can send from inside another runtime, which is the standard pattern for bridging tokio with other async ecosystems.
3. There is no back-pressure: if the receiver is gone, \`send\` returns \`Err(value)\` immediately — your value comes back so you can decide what to do with it.

\`Receiver\` implements Future. Awaiting it returns \`Ok(T)\` if the sender sent, \`Err(RecvError)\` if the sender was dropped without sending. There is no way to time out without wrapping the await in \`tokio::time::timeout\`.

Use case 1 — request/response: a worker task wants to ask the orchestrator a question. Allocate a oneshot per request, send the request \`(question, tx)\` over an mpsc, await \`rx\` for the response. This is the canonical actor-pattern reply channel.

Use case 2 — graceful shutdown: pass a \`Receiver<()>\` into a long-running task, \`select!\` it against the work loop. When the orchestrator drops or sends, the task exits cleanly.

Non-obvious gotcha: to use the receiver in a \`select!\` loop you need \`&mut rx\` — \`Receiver\` consumes itself when awaited by value, but the docs explicitly show the \`&mut\` form so you can re-poll without consuming. Just be aware that once it resolves once, subsequent polls will return immediately.

If you are tempted to reuse a oneshot for multiple values, you want \`mpsc\` (queue) or \`watch\` (latest-value) instead. oneshot is **deliberately** single-shot.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'oneshot', 'channel', 'sync'],
    repository: tokio,
    filePath: 'tokio/src/sync/oneshot.rs',
    url: `${baseUrl}/tokio/src/sync/oneshot.rs`,
  },
  {
    title: 'mpsc bounded vs unbounded — bounded gives back-pressure, unbounded does not',
    body: `Tokio offers two flavors of multi-producer single-consumer queue:

\`\`\`rust
// tokio/src/sync/mpsc/bounded.rs
pub fn channel<T>(buffer: usize) -> (Sender<T>, Receiver<T>) { ... }

// tokio/src/sync/mpsc/unbounded.rs
pub fn unbounded_channel<T>() -> (UnboundedSender<T>, UnboundedReceiver<T>) { ... }
\`\`\`

The bounded \`channel(N)\` reserves N "permits" via an internal semaphore. Each \`send\` is async — it awaits a permit. When the channel is full, \`send\` parks the sender until a receiver consumes a slot. This is **back-pressure**: a slow consumer naturally throttles producers, which propagates upstream to whoever is producing the events.

\`UnboundedSender\` has a sync \`send\` that always succeeds (returning \`Err\` only if the receiver was dropped). There is **no upper bound** on the queue. If a producer outpaces the consumer indefinitely, the queue grows until you OOM. The convenience of sync send buys you a memory safety footgun.

When to pick which:

- **Bounded** is the right default for any queue where the producer can fail or block gracefully — task pipelines, worker fan-out, event buses with a slow downstream.
- **Unbounded** is appropriate when (a) you absolutely cannot block the producer (e.g. inside a non-async context or signal handler) AND (b) you can prove the queue length is naturally bounded (e.g. one message per request and requests are rate-limited upstream).

Bounded sender has a richer API for capacity control:

\`\`\`rust
// from bounded.rs — Permit reserves capacity before you produce the value
pub struct Permit<'a, T> { chan: &'a chan::Tx<T, Semaphore> }
\`\`\`

\`Sender::reserve()\` awaits a permit; once you hold it, sending is infallible (besides receiver-dropped). This lets you avoid building expensive messages for slots that may not exist. \`reserve_many(n)\` reserves n at once for batch operations.

\`WeakSender\` (both flavors) lets you hold a non-keepalive reference: when all strong senders drop, the channel closes even if WeakSenders exist. Useful for back-references (e.g. a worker that wants to send replies but should not keep the orchestrator's mpsc alive).

Non-obvious gotcha: the bounded \`buffer\` parameter is the size of **the channel**, not per-sender. Tokio's \`mpsc\` is mpsc not mpmc — you can clone the Sender freely but you can NOT clone the Receiver. For multi-consumer use \`async_channel\` (third-party) or design a fan-out with a single receiver that re-dispatches.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'mpsc', 'channel', 'backpressure'],
    repository: tokio,
    filePath: 'tokio/src/sync/mpsc/bounded.rs',
    url: `${baseUrl}/tokio/src/sync/mpsc/bounded.rs`,
  },
  {
    title: 'broadcast: fan-out channel with bounded retention and Lagged errors',
    body: `\`tokio::sync::broadcast\` is a multi-producer multi-consumer channel where every value is delivered to **every** receiver. It solves the "pub-sub within a process" problem — config updates, shutdown signals, fan-out events.

\`\`\`rust
// tokio/src/sync/broadcast.rs
let (tx, mut rx1) = broadcast::channel(16);
let mut rx2 = tx.subscribe();

tx.send(10).unwrap();
tx.send(20).unwrap();
\`\`\`

The buffer parameter caps how many in-flight values the channel retains. Values stay in the channel until **every** receiver has cloned them out — slow receivers create memory pressure for everyone.

When the buffer is full and a new value is sent, the oldest value is **dropped from the channel**. Any receiver that had not yet seen it will, on its next \`recv\`, return \`Err(RecvError::Lagged(n))\` where \`n\` is how many messages it missed. This is the channel telling the slow receiver: "you are too slow to keep up; some data is gone."

\`\`\`text
// from the module docstring
This behavior enables a receiver to detect when it has lagged so far behind
that data has been dropped. The caller may decide how to respond to this:
either by aborting its task or by tolerating lost messages and resuming
consumption of the channel.
\`\`\`

Two design contracts you must remember:

1. \`subscribe\` only sees values sent **after** the call. There is no replay of historical values. If you need "give me the current value plus all updates," use \`watch\` (for single-value latest) or build a snapshot+broadcast bridge yourself.
2. The value type \`T\` must be \`Clone\` because every receiver gets its own copy. For large values, wrap in \`Arc\` so the clone is cheap.

When all senders drop, the channel closes. Receivers drain remaining buffered values, then \`recv\` returns \`Err(RecvError::Closed)\`.

Non-obvious gotcha: a Lagged error does **not** kill the receiver — after returning Lagged, the receiver's position is fast-forwarded to the oldest still-buffered value, and the next \`recv\` will succeed with that. So the recv loop should look like \`loop { match rx.recv().await { Ok(v) => ..., Err(Lagged(_)) => continue, Err(Closed) => break } }\`. A common bug is treating Lagged as fatal and exiting — the channel is still healthy, you just lost data. If lost data is unacceptable, switch to mpsc (with back-pressure) and design a slow-consumer policy upstream.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'broadcast', 'pubsub', 'channel'],
    repository: tokio,
    filePath: 'tokio/src/sync/broadcast.rs',
    url: `${baseUrl}/tokio/src/sync/broadcast.rs`,
  },
  {
    title: 'watch: single-value latest-value channel for state observation',
    body: `\`tokio::sync::watch\` is a "the receiver sees the latest value, missed intermediate values are fine" channel. Perfect for live config, shutdown flags, current connection count — anything where the consumer needs the **current** state, not every state transition.

\`\`\`rust
// tokio/src/sync/watch.rs
/// A multi-producer, multi-consumer channel that only retains the *last* sent
/// value.
///
/// This channel is useful for watching for changes to a value from multiple
/// points in the code base, for example, changes to configuration values.
\`\`\`

The channel is created with an **initial value** — there is never an "empty" state. Every receiver tracks "did I see the current value yet?":

- \`receiver.borrow()\` — synchronous read of the current value, does NOT mark it seen.
- \`receiver.borrow_and_update()\` — read and mark seen.
- \`receiver.changed().await\` — async wait until an unseen value arrives, marks it seen on completion.
- \`receiver.has_changed()\` — sync check whether there is an unseen value.

The standard observe-loop pattern:

\`\`\`rust
loop {
    rx.changed().await?;
    let value = rx.borrow_and_update();
    apply_new_config(&*value);
}
\`\`\`

Why \`borrow_and_update\` and not \`borrow\`? Because between \`changed().await\` returning and \`borrow()\` running, the sender could write again. \`borrow()\` would not mark the SECOND value seen, so the next iteration's \`changed().await\` would return immediately for a value the loop just processed — running the body twice for the same value. \`borrow_and_update\` closes that race.

The borrow returns a \`Ref<T>\` that holds an internal RwLock read guard. Holding it blocks senders from writing — keep borrows short, never await while holding one.

Initial value is considered "seen" by the receiver at creation. This means right after \`subscribe()\` or \`channel()\`, \`changed()\` will NOT return until something new is sent. If you want "kick the receiver once on startup," send a sentinel value right after subscribe.

When the last sender drops, \`changed()\` returns \`Err(RecvError)\` IF the current value is already seen. If the current value is unseen and the sender drops, \`changed()\` returns Ok one more time so you do not miss the final value. Asymmetric on purpose — the sender's last write should not be lost just because the sender then dropped.

Non-obvious gotcha: \`Sender::send\` is **synchronous and infallible** — there is no permit / no back-pressure. The cost is that fast senders can fully overwrite values before any receiver sees them. That is the design — if you need every value, use mpsc or broadcast.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'watch', 'channel', 'state'],
    repository: tokio,
    filePath: 'tokio/src/sync/watch.rs',
    url: `${baseUrl}/tokio/src/sync/watch.rs`,
  },
  {
    title: 'Notify: a single-permit semaphore for "wake one waiter"',
    body: `\`tokio::sync::Notify\` is the smallest possible synchronization primitive: a stored "permit" bit and a queue of waiters. \`notify_one()\` sets the permit (or wakes one queued waiter); \`notified().await\` consumes a permit (or queues for one).

\`\`\`rust
// tokio/src/sync/notify.rs
/// A \`Notify\` can be thought of as a [\`Semaphore\`] starting with 0 permits.
/// The [\`notified().await\`] method waits for a permit to become available, and
/// [\`notify_one()\`] sets a permit **if there currently are no available
/// permits**.
\`\`\`

The "no double-buffering" rule is critical:

> If \`notify_one()\` is called **multiple** times before \`notified().await\`, only a **single** permit is stored.

So Notify is for "something happened, please check" semantics — it does NOT count events. If you need event counting, use a \`Semaphore\` (which can store many permits) or an \`mpsc\`.

The classic pattern is "dirty-flag wakeup": a producer mutates shared state and calls \`notify_one()\`; a consumer loops \`notified().await\` then reads the state. Spurious wakeups are fine — the consumer always re-checks. Missed wakeups are NOT possible because the permit persists until consumed.

\`notify_waiters()\` is the broadcast variant — wakes every currently-queued waiter exactly once (does NOT store a permit for future awaiters). Used for "phase change" events: every active consumer needs to know, but late arrivers do not retroactively get the notification.

The implementation uses an intrusive linked list of waiters protected by a \`std::sync::Mutex\`:

\`\`\`rust
type WaitList = LinkedList<Waiter, <Waiter as linked_list::Link>::Target>;
\`\`\`

Intrusive because the waiter node is allocated as part of the future, not separately on the heap — \`notified()\` is allocation-free.

Non-obvious gotcha: there is a registration race. \`notified()\` returns a future that does NOT register itself in the waiter list until the first poll. If you do \`let f = notify.notified()\` and then \`tokio::time::sleep(...).await\` before awaiting \`f\`, any \`notify_one\` during the sleep is **missed**. The fix is the explicit registration form: \`let mut f = pin!(notify.notified()); f.as_mut().enable();\` registers immediately. Used in libraries that need to set up a notification before kicking off the operation that might trigger it.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'notify', 'sync', 'wakeup'],
    repository: tokio,
    filePath: 'tokio/src/sync/notify.rs',
    url: `${baseUrl}/tokio/src/sync/notify.rs`,
  },
  {
    title: 'Semaphore: explicit permits for limiting concurrency',
    body: `A semaphore maintains a count of permits. Each \`acquire()\` removes one (awaiting if none available), each drop of the returned \`SemaphorePermit\` adds one back. Tokio's implementation is **fair**: permits are handed out in FIFO order.

\`\`\`rust
// tokio/src/sync/semaphore.rs
let semaphore = Semaphore::new(3);

let a_permit = semaphore.acquire().await.unwrap();
let two_permits = semaphore.acquire_many(2).await.unwrap();

assert_eq!(semaphore.available_permits(), 0);
\`\`\`

The two canonical use cases the docs walk through:

1. **Capping open file handles**: \`static PERMITS: Semaphore = Semaphore::const_new(100);\` then every \`File::create\` first does \`let _permit = PERMITS.acquire().await.unwrap();\`. \`const_new\` is the const constructor for static initialization — no \`once_cell\` needed.
2. **Capping outbound HTTP**: \`Arc<Semaphore>\` cloned into each spawned task, acquire before \`reqwest::get\`. This prevents you from blowing out a downstream rate limit with a burst of spawned tasks.

\`acquire_many(n)\` is fair-with-a-twist: a request for N permits queued at the front of the queue blocks ALL subsequent requests, even single-permit ones, until N permits are simultaneously free:

> This fairness is also applied when \`acquire_many\` gets involved, so if a call to \`acquire_many\` at the front of the queue requests more permits than currently available, this can prevent a call to \`acquire\` from completing, even if the semaphore has enough permits complete the call to \`acquire\`.

This is intentional — without it, a "give me 100" call could be starved forever by a stream of "give me 1" calls. But it means a single greedy acquire_many can deadlock a system if the released permits never accumulate to N.

\`try_acquire()\` returns \`Result<_, TryAcquireError::NoPermits>\` immediately without queueing — useful when the cap is a soft hint and you want to fail fast or fall back rather than wait.

\`add_permits(n)\` adds N new permits at runtime. \`forget()\` on a permit consumes it without returning it to the pool, **permanently shrinking** the semaphore — useful for "use this permit and remove it from circulation forever" workflows like one-time tokens.

Non-obvious gotcha: cancellation. If a task is parked in \`acquire().await\` and then dropped, it correctly removes itself from the wait queue (no leak) — but a permit that was about to be granted to it may now flow to the next waiter. This is correct, but means cancel-then-retry can re-queue you behind newer waiters. For strict ordering, hold the permit and pass it explicitly; do not re-acquire.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'semaphore', 'concurrency', 'rate-limit'],
    repository: tokio,
    filePath: 'tokio/src/sync/semaphore.rs',
    url: `${baseUrl}/tokio/src/sync/semaphore.rs`,
  },
  {
    title: 'tokio::time::sleep returns a Sleep type that can be reset',
    body: `\`sleep(Duration)\` and \`sleep_until(Instant)\` return a \`Sleep\` future. Awaiting it yields after the deadline. Dropping it cancels with no cleanup.

\`\`\`rust
// tokio/src/time/sleep.rs
pub fn sleep_until(deadline: Instant) -> Sleep {
    Sleep::new_timeout(deadline, trace::caller_location())
}
\`\`\`

Sleep is more than a fire-and-forget timer — it has methods:

\`\`\`rust
impl Sleep {
    pub fn deadline(&self) -> Instant { self.entry.deadline() }
    pub fn is_elapsed(&self) -> bool { self.entry.is_elapsed() }
    pub fn reset(self: Pin<&mut Self>, deadline: Instant) { ... }
}
\`\`\`

\`reset(new_deadline)\` is the killer feature. It changes the wakeup time **without reallocating** the timer's entry in the runtime's timer wheel. Use cases: a debounce timer that pushes its deadline forward on each event; a connection idle-timeout that resets on every byte received; a retry backoff that changes its next attempt time.

The performance reason matters. Tokio's timer wheel hashes timers by deadline tick. Inserting and removing is O(1) amortized but involves a Mutex acquisition on the timer driver. Reset reuses the same slot allocation, so a tight loop of resets is much cheaper than \`drop + sleep_until\` over and over.

Resolution is millisecond — the docs explicitly warn it should not be used for high-resolution timing. On Windows it can be coarser (the OS timer granularity is ~15ms by default).

The "must be inside a runtime" rule is important: \`Sleep::new_timeout\` calls \`scheduler::Handle::current()\` and panics if there is no current runtime. The docs spell out a subtle case:

> \`rt.block_on(sleep(...))\` will panic, since the function is executed outside of the runtime. Whereas \`rt.block_on(async {sleep(...).await})\` doesn't panic.

The first form **calls** \`sleep\` (creating the Sleep) before \`block_on\` enters the runtime context. The second wraps the call in an \`async {}\` block which is lazy — the call to \`sleep\` happens when the future is polled, by which point we are inside the runtime.

Cancellation safety: dropping a Sleep is safe and cheap. The timer entry is removed from the wheel synchronously. So putting \`sleep(...)\` inside a \`select!\` branch and having another branch win is the correct way to implement "do X for at most Y" — no leak, no cleanup needed.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'sleep', 'timer', 'time'],
    repository: tokio,
    filePath: 'tokio/src/time/sleep.rs',
    url: `${baseUrl}/tokio/src/time/sleep.rs`,
  },
  {
    title: 'tokio::time::timeout wraps a future with a deadline',
    body: `\`timeout(duration, future)\` returns a \`Timeout<F>\` that completes either with the future's output (\`Ok(T)\`) or with \`Err(Elapsed)\` when the duration runs out, whichever happens first.

\`\`\`rust
// tokio/src/time/timeout.rs
pub fn timeout<F>(duration: Duration, future: F) -> Timeout<F::IntoFuture>
where
    F: IntoFuture,
{
    let location = trace::caller_location();
    let deadline = Instant::now().checked_add(duration);
    let delay = match deadline {
        Some(deadline) => Sleep::new_timeout(deadline, location),
        None => Sleep::far_future(location),
    };
    Timeout::new_with_delay(future.into_future(), delay)
}
\`\`\`

Implementation-wise, timeout is just \`select!(future, sleep)\` packaged as a struct — cancellation behavior is identical. When the timer wins, the inner future is **dropped** at whatever await point it was parked on. If that future is not cancel-safe, the partial work is lost.

The duration is checked **before** polling the future. The docs call out a weird consequence:

> Note that the timeout is checked before polling the future, so if the future does not yield during execution then it is possible for the future to complete and exceed the timeout _without_ returning an error.

In practice this means: if your future runs synchronous CPU-heavy code without any await points, the timeout cannot fire mid-CPU. The timer fires when control returns to the executor — which is whenever the future awaits or completes. For CPU-bound work, sprinkle \`tokio::task::yield_now().await\` or move the work to \`spawn_blocking\`.

\`Duration::saturating_add\` overflow is handled: \`checked_add\` returns None for huge durations, in which case Tokio uses \`Sleep::far_future\` (essentially no timeout). So \`timeout(Duration::MAX, fut)\` does not panic — it just behaves like \`fut\`.

\`Timeout::into_inner()\` consumes the Timeout and gives back the unfinished inner future — useful when you want to retry or apply a different policy after a timeout fires.

Compose with: \`?\` works on the result. \`tokio::time::timeout(d, async { ... }).await??\` resolves to T if both the timeout AND the inner Result are Ok. Two question marks because timeout returns \`Result<F::Output, Elapsed>\` and F::Output is itself a Result.

Non-obvious gotcha: timeout is one-shot. If you want a repeating "kill if quiet for 30s" pattern (e.g. websocket idle-timeout), you want a \`Sleep::reset()\` loop, not a fresh \`timeout()\` each iteration — the latter allocates a new timer entry each time. See the previous entry on Sleep::reset.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'timeout', 'time', 'cancellation'],
    repository: tokio,
    filePath: 'tokio/src/time/timeout.rs',
    url: `${baseUrl}/tokio/src/time/timeout.rs`,
  },
  {
    title: 'tokio::time::interval — tick-based scheduling with MissedTickBehavior',
    body: `\`interval(period)\` returns an \`Interval\` whose \`tick().await\` yields once every \`period\`. The first tick fires immediately. Use this instead of a \`loop { sleep(period).await; work().await; }\` because Sleep measures from "now" while Interval measures from "start of last tick" — sleep loops drift, intervals do not.

\`\`\`rust
// tokio/src/time/interval.rs
pub fn interval(period: Duration) -> Interval {
    assert!(period > Duration::new(0, 0), "\`period\` must be non-zero.");
    internal_interval_at(Instant::now(), period, trace::caller_location())
}
\`\`\`

The drift problem: if your work takes 30ms inside a \`sleep(1s)\` loop, you get a tick every 1.03s. Over an hour you have lost ~108 ticks. With \`Interval\`, the deadline for tick N is \`start + N * period\` — late ticks compress and catch up.

What "catch up" means is configurable via \`MissedTickBehavior\`:

\`\`\`rust
pub enum MissedTickBehavior {
    Burst,  // default — fire all missed ticks back-to-back
    Delay,  // schedule the next tick \`period\` after the late one
    Skip,   // skip missed ticks, align to the next multiple of period
}
\`\`\`

\`Burst\` (default): if your work takes 5 seconds and the period is 1 second, the next 4 \`tick().await\` calls return immediately. This is the right choice when "do this N times per second" is a strict requirement and missed ticks must be made up.

\`Delay\`: pretend the late tick was on time, schedule the next tick \`period\` after it. Effectively makes the interval behave like a sleep loop — no catch-up. Use when "at least \`period\` between ticks" matters more than "exactly N ticks per second."

\`Skip\`: fast-forward to the next aligned slot. If period is 1s and you missed 4 ticks, the next tick fires at the next whole-second boundary, no catch-up. Use for clock-aligned tasks where you would rather skip than burst (e.g. "publish stats every 5 seconds, on the 5-second mark").

\`\`\`rust
let mut interval = time::interval(Duration::from_secs(2));
for _i in 0..5 {
    interval.tick().await;
    task_that_takes_a_second().await;
}
// total: ~9 seconds (1 immediate tick + 4 × 2s) not ~15
\`\`\`

Non-obvious gotcha: \`interval()\` is **not** cancel-safe inside select!. If the select drops the tick future mid-poll, the next call to \`tick()\` may return immediately (the timer entry was reset to "fire now") even though the period has not elapsed. Mitigation: store the Interval outside the select, and call \`interval.tick()\` as the branch — the Interval itself owns the timer state, only the future returned by tick() is dropped, and a new tick() call recomputes the deadline correctly. The Tokio docs on Interval explicitly call this out.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'interval', 'scheduling', 'time'],
    repository: tokio,
    filePath: 'tokio/src/time/interval.rs',
    url: `${baseUrl}/tokio/src/time/interval.rs`,
  },
  {
    title: 'spawn_blocking moves CPU/blocking work off the async worker pool',
    body: `Async runtimes assume tasks yield often. CPU-bound or sync-blocking work in an async task starves every other task on the same worker. Tokio gives you two escape hatches: \`spawn_blocking\` (always available) and \`block_in_place\` (multi-thread runtime only).

\`\`\`rust
// tokio/src/task/blocking.rs
/// Tokio will spawn more blocking threads when they are requested through this
/// function until the upper limit configured on the [\`Builder\`] is reached.
/// After reaching the upper limit, the tasks are put in a queue.
/// The thread limit is very large by default, because \`spawn_blocking\` is often
/// used for various kinds of IO operations that cannot be performed
/// asynchronously.
\`\`\`

Default \`max_blocking_threads\` is 512 (set in \`Builder::new\`). The pool is dynamically sized — threads are spawned lazily and idle ones are reaped after \`thread_keep_alive\` (default 10s).

\`spawn_blocking(closure)\` returns a \`JoinHandle<R>\`. The closure runs on a thread from the blocking pool. You await the JoinHandle from your async code to get the result back.

\`\`\`rust
let result = tokio::task::spawn_blocking(|| {
    expensive_cpu_work()  // sync
}).await?;
\`\`\`

When to use it:
- Heavy CPU computation (cryptography, image encoding, parsing big JSON).
- Sync I/O without an async equivalent (rusqlite, std::fs in hot paths, third-party C libraries).
- Bridging from sync code that needs to call async code via \`Handle::current().block_on\`.

When NOT to use it:
- For 1000s of concurrent blocking calls — that hits the 512 thread cap and queues, with bad latency. For high-fanout I/O, prefer the async equivalent (\`tokio::fs\`, \`reqwest\`, \`sqlx\`).
- For very small bursts of work — the cost of crossing thread boundaries (channel send + wakeup) is ~1-10µs. Below that just inline it.

\`block_in_place(closure)\` is the multi-thread-only alternative. It tells the worker "I am about to block; please hand off my other tasks to a sibling worker." No new thread is spawned. Cheaper than spawn_blocking but cannot be cancelled and panics on the current_thread runtime.

The spawn_blocking gotcha called out in the source: **abort does NOT work** on a started blocking task. \`handle.abort()\` is a no-op once the closure has begun executing. Runtime shutdown will wait indefinitely unless you use \`shutdown_timeout\`. For interruptible blocking work, pass an \`Arc<AtomicBool>\` cancel flag and check it inside the loop.

Sizing rule of thumb: if you have N CPU cores and your CPU-bound work, set \`max_blocking_threads\` to \`N\` and use a Semaphore to gate spawn_blocking calls. The default 512 is for I/O — using it for CPU just thrashes context switches.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'spawn-blocking', 'cpu-bound', 'task'],
    repository: tokio,
    filePath: 'tokio/src/task/blocking.rs',
    url: `${baseUrl}/tokio/src/task/blocking.rs`,
  },
  {
    title: 'tokio::task::yield_now — cooperative yield with no guarantees',
    body: `\`yield_now().await\` is the simplest cooperative-scheduling primitive: it returns Pending once and then Ready, giving the runtime a chance to poll other tasks before yours runs again.

\`\`\`rust
// tokio/src/task/yield_now.rs
pub async fn yield_now() {
    let mut yielded = false;
    poll_fn(|cx| {
        ready!(crate::trace::trace_leaf(cx));

        if yielded {
            return Poll::Ready(());
        }

        yielded = true;

        context::defer(cx.waker());

        Poll::Pending
    })
    .await
}
\`\`\`

The implementation is exactly what it looks like: on first poll, mark yielded, register the waker via \`context::defer\`, return Pending. On the next poll, return Ready. The current task is added to the **back** of the pending queue.

Use cases:

1. Inside a loop doing CPU-bound work that you cannot easily move to spawn_blocking — sprinkle \`if i % 1000 == 0 { yield_now().await; }\` to let the runtime breathe.
2. After holding a hot lock or sync resource — yield to let other tasks run before reacquiring.
3. In tests, to force the scheduler to advance another task before yours continues.

The docstring is unusually candid about what yield_now does NOT guarantee:

> This function may not yield all the way up to the executor if there are any special combinators above it in the call stack. For example, if a \`tokio::select!\` has another branch complete during the same poll as the \`yield_now()\`, then the yield is not propagated all the way up to the runtime.

> In particular, the runtime may choose to poll the task that just ran \`yield_now()\` again immediately without polling any other tasks first.

So yield_now is a **hint**, not a barrier. The runtime decides what happens. For example, the I/O driver is not necessarily polled between consecutive task polls — yielding does not force I/O readiness checks.

The non-obvious gotcha: relying on yield_now for fairness or progress is fragile. If your design depends on "task A yields so task B gets to run," that may work in 1.30 and break in 1.31. The docs explicitly warn changes to scheduling order are not breaking changes.

Real fix for CPU-bound starvation: \`tokio::task::spawn_blocking\`. yield_now is for cooperative scheduling between **async** tasks that all want to share a worker; for sync work, use the right tool.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'yield', 'scheduling', 'cooperative'],
    repository: tokio,
    filePath: 'tokio/src/task/yield_now.rs',
    url: `${baseUrl}/tokio/src/task/yield_now.rs`,
  },
  {
    title: 'JoinSet manages a group of tasks with completion-order iteration',
    body: `\`JoinSet<T>\` is the right collection for "fan out N tasks, then process results as they arrive." It owns a set of \`JoinHandle<T>\` and gives you \`join_next()\` which returns the next task to complete (in completion order, not spawn order).

\`\`\`rust
// tokio/src/task/join_set.rs
let mut set = JoinSet::new();

for i in 0..10 {
    set.spawn(async move { i });
}

while let Some(res) = set.join_next().await {
    let idx = res.unwrap();
    seen[idx] = true;
}
\`\`\`

Why prefer JoinSet over \`Vec<JoinHandle<T>>\` + \`futures::future::join_all\`?

1. **Completion-order processing**: with join_all, you get all results in spawn order after the slowest finishes. With JoinSet, you process each result as soon as it lands — useful when downstream work can start on partial results.
2. **Drop-aborts everything**: \`When the JoinSet is dropped, all tasks in the JoinSet are immediately aborted.\` This is the key safety property. If your function returns early (early return, panic, ?-error propagation) the spawned children are cancelled, not detached. Vec<JoinHandle> requires you to remember to call .abort() on every panic path.
3. **Bounded mutable borrowing**: \`set.spawn\` and \`set.join_next\` are &mut self methods, so the borrow checker forces sequential access — no accidental concurrent reaping from multiple tasks.

\`abort_all()\` cancels every task without waiting. \`shutdown().await\` aborts and awaits — the canonical "clean drain" sequence is \`set.abort_all(); while set.join_next().await.is_some() {}\`.

The set is unordered. Internally it uses an \`IdleNotifiedSet<JoinHandle<T>>\`:

\`\`\`rust
pub struct JoinSet<T> {
    inner: IdleNotifiedSet<JoinHandle<T>>,
}
\`\`\`

This is a custom data structure that splits handles into "idle" (no notification pending) and "notified" (a result is ready). \`join_next\` pops from notified; if empty, registers a waker and returns Pending.

For \`!Send\` work, use the LocalSet variant: \`set.spawn_local_on(future, &local)\` schedules onto a LocalSet rather than the global runtime.

Non-obvious gotcha: \`join_next()\` returns \`Option<Result<T, JoinError>>\`. The outer Option is None when the set is empty. The inner Result is Err if the task panicked or was cancelled. A common mistake is treating None as "all done successfully" — really it just means the set is drained, and any prior Err results may have been silently unwrapped if you used \`.unwrap()\` in the loop. Match on both.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'joinset', 'task', 'concurrency'],
    repository: tokio,
    filePath: 'tokio/src/task/join_set.rs',
    url: `${baseUrl}/tokio/src/task/join_set.rs`,
  },
  {
    title: 'AsyncRead trait — poll_read is the foundation of all async I/O',
    body: `\`AsyncRead\` is Tokio's analogue to \`std::io::Read\`. It is the bottom of the I/O stack — every async source (TcpStream, File, stdin, codec wrappers) implements it.

\`\`\`rust
// tokio/src/io/async_read.rs
pub trait AsyncRead {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>>;
}
\`\`\`

Three return states matter:
- \`Poll::Ready(Ok(()))\` with \`buf.filled().len()\` increased — that many bytes were read. If the increase is 0, EOF was hit (or buf had zero capacity).
- \`Poll::Pending\` — no data right now, the waker has been registered.
- \`Poll::Ready(Err(e))\` — I/O error.

The trait is intentionally unfriendly to use directly. You almost never call \`poll_read\` yourself — instead, you import \`AsyncReadExt\` and use \`.read()\`, \`.read_exact()\`, \`.read_to_end()\`, \`.read_to_string()\`. These are async methods that handle the polling loop for you:

\`\`\`rust
use tokio::io::AsyncReadExt;
let mut buf = [0u8; 1024];
let n = stream.read(&mut buf).await?;
\`\`\`

\`ReadBuf\` is a wrapper around an \`&mut [u8]\` that tracks initialized vs filled bytes — readers can write into uninitialized memory safely. This is what makes \`read_buf\` (the lower-level API) safe with vectored reads.

Critical: \`AsyncReadExt::read\` is **NOT cancel-safe**. If you put it inside \`select!\` and another branch wins, you may have lost bytes that were already read into the kernel buffer but not into your buffer. Tokio's docs say:

> If \`read\` is used as the event in a \`tokio::select!\` statement and some other branch completes first, then it is guaranteed that no data was read.

Wait — that's actually saying \`read\` IS cancel-safe in the sense that no bytes are silently lost. The trick is that until poll_read returns Ready, no consume has happened. But \`read_exact\` IS NOT cancel-safe — it loops internally and can lose partial reads. Same for \`read_to_end\`. Use the simple \`read\` for cancel-safe loops.

The implementation passes through \`Box<T>\`, \`&mut T\`, and \`Pin<P>\` automatically, so wrapping a stream in a smart pointer does not require re-implementing the trait:

\`\`\`rust
impl<T: ?Sized + AsyncRead + Unpin> AsyncRead for Box<T> { deref_async_read!(); }
\`\`\`

For implementing your own AsyncRead (rare — usually you compose existing ones), the contract is: never block, always register the waker before returning Pending, never lie about EOF (returning 0 bytes filled when more might come).`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'asyncread', 'io', 'trait'],
    repository: tokio,
    filePath: 'tokio/src/io/async_read.rs',
    url: `${baseUrl}/tokio/src/io/async_read.rs`,
  },
  {
    title: 'TcpListener::accept loop — the canonical server pattern',
    body: `A Tokio TCP server is essentially \`bind -> loop { accept -> spawn(handle) }\`. The pattern is shown directly in the TcpListener docs and is the right shape for 99% of services.

\`\`\`rust
// tokio/src/net/tcp/listener.rs
let listener = TcpListener::bind("127.0.0.1:8080").await?;

loop {
    let (socket, _) = listener.accept().await?;

    tokio::spawn(async move {
        // Process each socket concurrently.
        process(socket).await
    });
}
\`\`\`

\`accept\` is implemented on top of the I/O driver:

\`\`\`rust
pub async fn accept(&self) -> io::Result<(TcpStream, SocketAddr)> {
    let (mio, addr) = self
        .io
        .registration()
        .async_io(Interest::READABLE, || self.io.accept())
        .await?;

    let stream = TcpStream::new(mio)?;
    Ok((stream, addr))
}
\`\`\`

\`async_io\` is the standard adapter pattern: register interest in READABLE on the underlying mio listener, then loop trying the sync \`accept\` until it returns either Ok or an error other than WouldBlock. When WouldBlock comes back, the future parks until epoll/kqueue says the fd is readable again.

The "spawn per connection" pattern means each connection gets a dedicated task that can be scheduled across worker threads. The server itself stays single-task — the accept loop is sequential. That is fine because accept is cheap; the per-connection work is what scales horizontally.

Several real-world refinements to layer on:

1. **Bound the connection count**: wrap a Semaphore around accept. \`let _permit = sem.acquire().await?;\` before \`spawn\` (and move the permit into the spawn so it releases on connection close). This caps concurrent clients without dropping new accepts hard.

2. **Handle errors gracefully**: \`accept\` can return errors that should NOT terminate the server (EMFILE — too many open files, ECONNABORTED — client closed before accept). Propagating these via \`?\` will kill the loop. Match on the error kind and just log+continue for transient errors.

3. **Graceful shutdown**: \`select!\` the accept against a \`tokio::signal::ctrl_c()\` future. On signal, break the loop, drop the listener (no new accepts), then await all spawned tasks (track them with JoinSet for clean drain).

4. **Per-spawn buffer sizing**: \`socket.set_nodelay(true)\` for low-latency RPC; \`socket.set_keepalive(...)\` for long-lived connections.

Non-obvious gotcha: there is a subtle race where the listener can be polled-accept-edge from two places. Tokio's \`poll_accept\` notes "on multiple calls, only the Waker from the most recent call is scheduled" — so do NOT poll-accept the same listener from two concurrent tasks. The \`accept\` async method takes \`&self\`, but you must keep all calls in a single task.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'tcp', 'listener', 'server'],
    repository: tokio,
    filePath: 'tokio/src/net/tcp/listener.rs',
    url: `${baseUrl}/tokio/src/net/tcp/listener.rs`,
  },
  {
    title: 'tokio::fs::File offloads sync std::fs to the blocking pool',
    body: `\`tokio::fs::File\` looks like \`std::fs::File\` but every operation returns a Future. Under the hood, every read/write is dispatched to the blocking pool — there is no kernel-level async file I/O on most platforms (Linux io_uring is opt-in via the \`io_uring\` feature).

\`\`\`rust
// tokio/src/fs/file.rs
#[cfg(not(test))]
use crate::blocking::{spawn_blocking, spawn_mandatory_blocking};
\`\`\`

So \`file.read(...).await\` is essentially \`spawn_blocking(|| std_file.read(...)).await\`. The cost is a thread hop per operation. For tiny reads on hot paths this is very expensive (~10µs overhead per call). The fix is buffering: wrap in a \`BufReader\` so 8 KiB is read at a time and most subsequent .read calls hit the in-memory buffer.

\`\`\`rust
use tokio::fs::File;
use tokio::io::AsyncWriteExt; // for write_all()

let mut file = File::create("foo.txt").await?;
file.write_all(b"hello, world!").await?;
\`\`\`

The implementation uses an internal Mutex around the std File handle:

\`\`\`rust
use crate::sync::Mutex;
// ...
struct File {
    std: Arc<Mutex<StdFile>>,
    // state for in-flight blocking ops
}
\`\`\`

The Mutex enforces that only one blocking operation runs against the file at a time — concurrent reads would race on the file cursor anyway.

The "drop does not flush" warning matters: \`A file will not be closed immediately when it goes out of scope if there are any IO operations that have not yet completed. To ensure that a file is closed immediately when it is dropped, you should call flush before dropping it.\` This is because drop runs synchronously and cannot await, so any pending write is just abandoned to the blocking pool.

Even \`flush().await\` only flushes Tokio's internal buffer to the kernel — it does NOT call \`fsync()\`. For "actually durable on disk" you need \`file.sync_all().await\` (calls fsync) or \`sync_data().await\` (fdatasync).

Non-obvious gotcha: \`tokio::fs\` is great for "occasional file reads in a network service" but **bad** for high-throughput file processing. If you are processing 10K files in parallel, every operation hops to the blocking pool — you saturate the 512-thread default and queue, with terrible latency. For batch file work, use \`std::fs\` inside \`spawn_blocking\` with explicit work batching (10 files per blocking task, not 1), or use \`io_uring\` if on Linux. The \`tokio::fs\` API is convenience for the common case; do not let "tokio::" mislead you into thinking it is faster than std for I/O-bound batch work.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'file', 'fs', 'io'],
    repository: tokio,
    filePath: 'tokio/src/fs/file.rs',
    url: `${baseUrl}/tokio/src/fs/file.rs`,
  },
  {
    title: 'Single-thread vs multi-thread runtime — pick by workload, not "more is better"',
    body: `Tokio has two runtime flavors. Both are constructed via the Builder:

\`\`\`rust
// tokio/src/runtime/builder.rs
pub fn new_current_thread() -> Builder {
    const EVENT_INTERVAL: u32 = 61;
    Builder::new(Kind::CurrentThread, EVENT_INTERVAL)
}

pub fn new_multi_thread() -> Builder {
    Builder::new(Kind::MultiThread, 61)
}
\`\`\`

The "61" is the number of task polls between checks of the global queue / I/O driver — copied from the Go runtime, where it was empirically tuned.

**Multi-thread** (default for \`#[tokio::main]\`): N worker threads (default = num_cpus), each with its own local task queue. Tasks can be **stolen** between workers — a worker that finishes its queue grabs work from a peer's queue. Required \`Send + 'static\` on spawned futures because tasks may move between threads.

Use multi-thread when:
- Your service has more concurrent CPU work than a single thread can handle.
- You have many independent connections (e.g. a web server) that benefit from parallel processing.
- Your tasks rarely block; if they do, use spawn_blocking.

**Current-thread**: a single thread that drives both the executor and the I/O driver. No work-stealing, no Send requirement on spawned futures (well, almost — \`spawn_local\` via LocalSet is the explicit !Send escape hatch).

Use current-thread when:
- The workload is mostly I/O-bound and a single core can keep up. CLI tools, lightweight proxies, embedded use cases.
- You want predictable scheduling for tests (start_paused, deterministic ordering).
- You have non-Send state that you want spawned tasks to share (use LocalSet).

Performance: current-thread has measurably lower overhead per spawn (~50ns vs ~500ns) and lower context-switch cost (none, vs cross-thread task migration). For pure I/O at modest concurrency (<100K conn), single-thread can outperform multi-thread on the same hardware because there is no synchronization overhead. The break-even depends on workload — measure, do not guess.

Default \`max_blocking_threads\` is 512. Default worker count is num_cpus (auto-detected). Default thread name is \`"tokio-rt-worker"\`. Default I/O = off, time = off — the macros call \`enable_all\` for you, but if you build the runtime by hand you must enable the drivers explicitly or you get panics ("there is no reactor running, must be called from the context of a Tokio 1.x runtime").

Non-obvious gotcha: nesting runtimes panics. \`Runtime::new()?.block_on(async { Runtime::new()?... })\` panics because the outer runtime is already current. If you need to bridge sync code that needs a runtime from inside async code, use \`tokio::task::block_in_place(|| Handle::current().block_on(...))\`. For truly separate runtimes (e.g. a background runtime for offload), spawn a thread that owns the second runtime and use channels to communicate.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'runtime', 'builder', 'scheduler'],
    repository: tokio,
    filePath: 'tokio/src/runtime/builder.rs',
    url: `${baseUrl}/tokio/src/runtime/builder.rs`,
  },
  {
    title: 'Runtime::block_on vs Handle::spawn — when to use each',
    body: `\`Runtime\` and \`Handle\` are two views of the same scheduler. Runtime owns it (drop = shutdown). Handle is a clonable reference (Send + Sync) that you pass around to spawn tasks from anywhere.

\`\`\`rust
// tokio/src/runtime/runtime.rs
pub fn block_on<F: Future>(&self, future: F) -> F::Output {
    let fut_size = mem::size_of::<F>();
    if fut_size > BOX_FUTURE_THRESHOLD {
        self.block_on_inner(Box::pin(future), SpawnMeta::new_unnamed(fut_size))
    } else {
        self.block_on_inner(future, SpawnMeta::new_unnamed(fut_size))
    }
}
\`\`\`

\`block_on\` parks the calling thread until the future completes. It enters the runtime context (so \`tokio::spawn\` works inside the future) and drives the I/O / time drivers. The thread that calls block_on is the one driving the future — on multi-thread runtimes, OTHER worker threads run the spawned tasks, but the future passed to block_on runs on the calling thread.

Use block_on when:
- You are in sync code (\`fn main\`, FFI callback, test) and need to enter async land for a single computation.
- You are bridging from another runtime / framework into tokio.
- You explicitly want to wait synchronously.

\`Handle::current().spawn(future)\` (or just \`tokio::spawn\` when inside a runtime) submits a task **without waiting**. Returns a JoinHandle. The runtime drives it on a worker thread.

Use spawn when:
- You want fire-and-forget background work.
- You want parallel execution and will await the JoinHandles later (or join via JoinSet).
- You are already inside async code.

The Handle is the bridge for "I have a Runtime built up here, I want to spawn into it from over there." Examples:
- A sync HTTP server (e.g. legacy Hyper-1 wrapped in axum) needs to spawn async work — store \`Handle\` in app state.
- A signal handler (must be sync) needs to schedule cleanup — call \`handle.spawn(...)\` from inside the handler.

\`Handle::block_on\` exists too — it does the same as Runtime::block_on but is callable from a Handle (Send + Sync) without needing the original Runtime. **DO NOT call \`Handle::block_on\` from inside a runtime worker thread** — it parks the worker thread and can deadlock the executor. The check is at runtime; you get a panic.

\`Runtime::enter()\` returns an \`EnterGuard\` that sets the current runtime context for the duration of the guard. Use this when you need to call code that **constructs** Tokio types (Sleep, TcpStream, etc.) in sync code that does not actually await — they need a runtime context just to be created.

Non-obvious gotcha: dropping a Runtime from inside a Tokio context panics ("Cannot drop a runtime in a context where blocking is not allowed"). The drop must \`shutdown_blocking()\` the worker pool, which blocks. If you need to dispose of a runtime mid-program, do it from a sync thread, OR use \`runtime.shutdown_background()\` which abandons workers without waiting.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'runtime', 'block-on', 'handle'],
    repository: tokio,
    filePath: 'tokio/src/runtime/runtime.rs',
    url: `${baseUrl}/tokio/src/runtime/runtime.rs`,
  },
  {
    title: 'LocalSet — the escape hatch for !Send futures (Rc, RefCell, etc.)',
    body: `The multi-thread runtime requires \`Send + 'static\` on spawned futures because tasks can migrate between worker threads. That breaks for futures that hold \`Rc\`, \`RefCell\`, or any other \`!Send\` type. \`LocalSet\` is the official answer.

\`\`\`rust
// tokio/src/task/local.rs
let local = task::LocalSet::new();

local.run_until(async move {
    let nonsend_data = nonsend_data.clone();
    task::spawn_local(async move {
        println!("{}", nonsend_data);
    }).await.unwrap();
}).await;
\`\`\`

A LocalSet pins itself to a single thread. \`spawn_local\` (only callable from inside a LocalSet's context) submits a future to that LocalSet's queue. The future is polled only on that thread, so \`!Send\` is fine.

Two ways to drive a LocalSet:
1. \`local.run_until(future).await\` — runs the inner future to completion, polling spawn_local'd children alongside it. Returns when the inner future completes (children may still be running).
2. \`local.await\` — drives the LocalSet until ALL spawned children complete. Useful when the children are the actual work and there is no "main" future.

\`LocalSet::new()\` does not require any runtime config — it works on multi-thread runtimes too. Internally it manages its own task queue and registers itself with the runtime so the runtime knows when to poll it.

The big use case: integrating with single-threaded async libraries. Example — a JS engine binding (\`deno_core\`, \`wasmtime\` async) where the V8/wasm instance is \`!Send\`. Wrap the per-instance event loop in a LocalSet, drive it on a dedicated thread.

Other use case: simplifying state. With LocalSet you can hold an \`Rc<RefCell<State>>\` and pass clones to every spawn_local. No Mutex, no Arc, no atomic refcount. For low-concurrency services this is a measurable win in code clarity and performance.

Non-obvious gotcha: \`run_until\` cannot be called from inside a \`tokio::spawn\` task. The docs are explicit:

> The \`run_until\` method can only be used in \`#[tokio::main]\`, \`#[tokio::test]\` or directly inside a call to \`Runtime::block_on\`. It cannot be used inside a task spawned with \`tokio::spawn\`.

Why? Because \`tokio::spawn\`'d tasks have a \`Send + 'static\` constraint, and \`run_until\`'s future is \`!Send\` by virtue of borrowing the LocalSet. To use a LocalSet from a normal spawned task, run it on a dedicated OS thread that owns the LocalSet and uses block_on internally.

Performance: spawn_local is ~10x faster than spawn because no atomic operations on the task struct. For very-fine-grained tasks (parsers spinning up sub-tasks per item) this matters.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'localset', 'spawn-local', 'send'],
    repository: tokio,
    filePath: 'tokio/src/task/local.rs',
    url: `${baseUrl}/tokio/src/task/local.rs`,
  },
  {
    title: 'tokio::pin! macro — stack-pin a future without Box::pin',
    body: `Pinning is required to poll a future via \`&mut\`. Async-fn return types are \`!Unpin\`, so calling \`(&mut future).await\` does not compile. The two pinning options are heap (\`Box::pin\`) and stack (\`pin!\`).

\`\`\`rust
// tokio/src/macros/pin.rs
#[macro_export]
macro_rules! pin {
    ($($x:ident),*) => { $(
        // Move the value to ensure that it is owned
        let mut $x = $x;
        // Shadow the original binding so that it can't be directly accessed
        // ever again.
        #[allow(unused_mut)]
        let mut $x = unsafe {
            $crate::macros::support::Pin::new_unchecked(&mut $x)
        };
    )* };
}
\`\`\`

The macro expands to: take ownership of the value, shadow the binding with a Pin made from a mutable reference. Because the pinned binding shadows the unpinned one, you can no longer move out of it — the borrow checker enforces the pinning invariant.

Why \`unsafe\`? Because \`Pin::new_unchecked\` requires you to promise the value will not be moved for the rest of its scope. The macro provides that guarantee structurally — the original binding is shadowed and unreachable, the new binding is a \`Pin<&mut T>\` that can only be dereferenced.

Use cases:

1. Awaiting a future by reference inside a select! loop:
\`\`\`rust
let future = my_async_fn();
pin!(future);
loop {
    select! {
        _ = &mut future => break,
        Some(val) = stream.next() => println!("got = {}", val),
    }
}
\`\`\`

You cannot move the future into select on every iteration (it gets consumed); pin! lets you take \`&mut future\` repeatedly.

2. Working with traits that require \`T: Stream + Unpin\` — pin! on the stack instead of allocating.

The let-binding form pins multiple futures at once:
\`\`\`rust
pin! {
    let future1 = my_async_fn();
    let future2 = my_async_fn();
}
select! {
    _ = &mut future1 => {}
    _ = &mut future2 => {}
}
\`\`\`

\`Box::pin\` is the heap alternative — one allocation, but the future can be moved around (e.g. stored in a struct field, returned from a function as \`Pin<Box<dyn Future>>\`). The trade-off is the alloc + heap indirection on every poll.

Non-obvious gotcha: \`pin!\` only takes **identifiers**, not expressions. \`pin!(my_async_fn())\` does NOT compile (the docstring shows this as a compile_fail example). You must do \`let f = my_async_fn(); pin!(f);\`. This is because the macro shadows the binding — there has to be a binding to shadow. Workaround for one-liners: \`std::pin::pin!(my_async_fn())\` (stable since 1.68) is an expression-position version.`,
    contentType: 'REPOSITORY_FILE',
    language: 'rust',
    tags: ['tokio', 'rust', 'pin', 'future', 'macro'],
    repository: tokio,
    filePath: 'tokio/src/macros/pin.rs',
    url: `${baseUrl}/tokio/src/macros/pin.rs`,
  },
];
