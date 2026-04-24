/**
 * Batch github-006-redis-battle
 *
 * 20 patterns extracted from Shailesh93602/redis-battle-demo — a runnable
 * reference implementation of the two distributed-systems primitives that
 * power EduScale's multi-instance Socket.io backend:
 *   - @socket.io/redis-adapter (cross-instance pub/sub)
 *   - Redlock (distributed mutex over multiple Node processes)
 *
 * Authoring rules (see CORPUS-PLAN.md):
 * - Real attribution; no fabricated URLs
 * - 200–400 word body
 * - One topic per entry
 */

import type { SeedItem } from '../types';

const repo = { owner: 'Shailesh93602', name: 'redis-battle-demo' };

export const BATCH: SeedItem[] = [
  {
    title: 'Socket.io Redis adapter: why pub and sub need separate connections',
    body: `When you wire \`@socket.io/redis-adapter\` you have to pass it TWO Redis clients, not one. The pattern is exactly:

\`\`\`js
const pubClient = createClient(REDIS_URL);
const subClient = pubClient.duplicate(); // separate connection
io.adapter(createAdapter(pubClient, subClient));
\`\`\`

The reason is a quirk of Redis pub/sub: once a client issues \`SUBSCRIBE\` it enters subscriber mode and can no longer send regular commands like \`PUBLISH\`, \`SET\`, or \`PING\` on that same connection. The adapter needs to do BOTH — receive broadcasts from other instances AND publish its own — so it needs one connection that stays in subscriber mode forever and a second one that's free to issue any command.

\`pubClient.duplicate()\` is the idiomatic way to get a second connection that reuses the same connection options (host, port, TLS, password) without re-specifying them. Both clients share the same \`error\` handlers, are kept alive together, and shut down together.

If you accidentally pass the same client twice (a common mistake when copy-pasting from older docs), \`SUBSCRIBE\` is issued first, then your next \`PUBLISH\` either silently no-ops or errors depending on the Redis client library. Symptom in production: events emitted on instance A never reach instance B even though the adapter "looks" wired up correctly.`,
    contentType: 'REPOSITORY_FILE',
    language: 'javascript',
    tags: ['redis', 'socket.io', 'pubsub', 'distributed-systems'],
    repository: repo,
    filePath: 'src/server.js',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/src/server.js',
  },
  {
    title: 'Redlock with retryCount:0 — skip the tick instead of queuing',
    body: `When you use Redlock for a periodic task that runs across multiple instances, the right config is to NOT retry on lock contention:

\`\`\`js
const redlock = new Redlock([pubClient], {
  retryCount: 0, // don't queue — if another instance has the lock, skip
  retryDelay: 0,
  driftFactor: 0.01,
});
\`\`\`

The default Redlock behavior is to retry acquisition for up to N attempts with delays in between. That's right for a one-off critical section. It's exactly wrong for a heartbeat / cron / tick that fires every N seconds.

Why? Imagine three instances all calling \`setInterval(tryTick, 2000)\`. With \`retryCount: 10\` and \`retryDelay: 200\`, the two losers each block for ~2 seconds trying to grab the lock that's already held. Their next setInterval tick stacks on top while they're still blocked. Within a minute you've got dozens of queued lock attempts that fire in a stampede the moment the lock briefly releases.

With \`retryCount: 0\`, the losers fail immediately, the calling code catches the error, returns early, and the next \`setInterval\` tick is fresh. The semantic is: "it's better to skip a heartbeat than to do twelve of them in a burst." This is also why Redlock surface a Prometheus gauge for \`battle_ticks_skipped_total\` — a healthy two-instance setup should show roughly 50/50 split between acquired and skipped.`,
    contentType: 'REPOSITORY_FILE',
    language: 'javascript',
    tags: ['redis', 'redlock', 'distributed-lock', 'cron'],
    repository: repo,
    filePath: 'src/server.js',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/src/server.js',
  },
  {
    title: 'Distributed tick: try-finally guarantees lock release',
    body: `The core distributed-tick function is built around a tight try/finally so the lock is always released even if the inner work throws:

\`\`\`js
async function tryTick() {
  let lock;
  try {
    lock = await redlock.acquire([TICK_LOCK_KEY], LOCK_TTL_MS);
    ticksAcquired.inc();
  } catch {
    ticksSkipped.inc();
    return;
  }

  try {
    const timestamp = new Date().toISOString();
    io.emit("server_tick", { at: timestamp, by: INSTANCE_ID });
  } finally {
    await lock.release();
  }
}
\`\`\`

Two layers of try matter here. The OUTER try wraps \`acquire\` — failure means another instance won, so we skip silently and increment the \`skipped\` counter. The INNER try/finally wraps the actual work — \`io.emit\` could throw, the timestamp formatter could throw, anything inside there could throw — but the finally still runs \`lock.release()\` so the next tick window has a clean lock to acquire.

Without the finally, an exception inside the work would leave the lock held until its TTL expires (1500ms here). For an isolated incident that's fine. For a recurring crash it means every other tick gets skipped because the dying instance keeps holding then losing then re-holding the lock until it finally crashes. The finally pattern keeps the system self-healing — even if instance A is in a bad state, instance B can still get the lock on the next 2-second window.`,
    contentType: 'REPOSITORY_FILE',
    language: 'javascript',
    tags: ['redis', 'redlock', 'distributed-lock', 'error-handling'],
    repository: repo,
    filePath: 'src/server.js',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/src/server.js',
  },
  {
    title: 'Lock TTL must be shorter than the tick interval',
    body: `The Redlock TTL and the setInterval period must satisfy a specific inequality, and the redlock test suite codifies the rule:

\`\`\`js
const TICK_INTERVAL_MS = 2000; // how often a tick is attempted
const LOCK_TTL_MS = 1500;       // lock held for at most this long

test("lock TTL is a positive number less than TICK_INTERVAL_MS (2000ms)", async () => {
  mockRedlock.acquire.mockResolvedValue(mockLock);
  await tryTick();
  const ttl = mockRedlock.acquire.mock.calls[0][1];
  expect(ttl).toBeGreaterThan(0);
  expect(ttl).toBeLessThan(2000); // must be shorter than the tick interval
});
\`\`\`

Why TTL < INTERVAL: if a process crashes immediately after acquiring the lock and never reaches \`lock.release()\`, the lock is stuck until the TTL expires. With TTL > INTERVAL, the next setInterval fires while the dead lock is still held, that tick gets skipped, and worst case you skip multiple ticks in a row. With TTL < INTERVAL, the dead lock has already expired by the time the next tick window opens, so a healthy instance grabs it and life resumes.

Why TTL > 0 (and meaningfully so): the work inside the lock — emit a Socket.io event, write a log line — has to fit comfortably within the TTL or Redlock's lease will expire mid-work and a SECOND instance might also grab the lock. 1500ms is a generous budget for a 1-line emit. For DB-backed work you'd profile the p99 and add headroom.

The 500ms gap between TTL (1500) and INTERVAL (2000) is the recovery margin — the time the system gives itself to detect a crashed instance and let the next instance take over.`,
    contentType: 'REPOSITORY_FILE',
    language: 'javascript',
    tags: ['redis', 'redlock', 'distributed-lock', 'ttl'],
    repository: repo,
    filePath: 'src/__tests__/redlock.test.js',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/src/__tests__/redlock.test.js',
  },
  {
    title: 'Prometheus gauges + counters for distributed lock observability',
    body: `The metrics surface tells you whether your distributed lock is actually distributing — without them you'd have no way to know if both instances are ever winning the race or if one has silently been hoarding the lock for hours.

\`\`\`js
const ticksAcquired = new promClient.Counter({
  name: "battle_ticks_acquired_total",
  help: "Total server ticks where this instance acquired the distributed lock",
  registers: [register],
});

const ticksSkipped = new promClient.Counter({
  name: "battle_ticks_skipped_total",
  help: "Total server ticks skipped because another instance held the lock",
  registers: [register],
});
\`\`\`

The metric design rule here: pair every "we did the work" counter with a "we skipped the work" counter. Sum across all instances and divide by elapsed seconds — if the rate doesn't match your expected tick frequency, you've got a stuck instance or a Redis outage. Group by instance label in Grafana — if one instance has acquired:skipped = 100:0 while the others are 0:100, the lock is stuck on that instance.

Counters (monotonically increasing) are right for these metrics, not gauges — Prometheus's \`rate()\` function works correctly across counter resets and gives you events-per-second graphs without having to remember the previous value. The \`battle_\` prefix is set on \`collectDefaultMetrics({ prefix: "battle_" })\` so the per-process Node metrics (CPU, heap, GC) are namespaced consistently with the app metrics.

Gauges (\`battle_connected_clients\`, \`battle_active_rooms\`) are for instantaneous state — set on every \`/metrics\` scrape from the live \`io.engine.clientsCount\` and \`rooms.size\` so the value Prometheus pulls is always fresh, never stale.`,
    contentType: 'REPOSITORY_FILE',
    language: 'javascript',
    tags: ['prometheus', 'observability', 'metrics', 'distributed-lock'],
    repository: repo,
    filePath: 'src/server.js',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/src/server.js',
  },
  {
    title: 'Cross-instance broadcast: io.to(roomId).emit reaches every server',
    body: `The single line that makes the Socket.io adapter worth setting up:

\`\`\`js
io.to(roomId).emit("room_update", {
  roomId,
  playerCount: room.players.size,
  score: room.score,
  handledBy: INSTANCE_ID,
});
\`\`\`

With NO adapter, \`io.to(roomId).emit\` only reaches clients connected to THIS instance. Browser A connected to :3001 emits an attack — only other browsers on :3001 see it. Browser C on :3002 stays out of sync.

With the Redis adapter wired in, the same \`io.to(roomId).emit\` line publishes to a Redis channel that every instance subscribes to. The instance that originated the emit sends to its local sockets directly. The other instances receive it from Redis and forward to THEIR local sockets in that room. End result: a single emit reaches every client in the room regardless of which instance owns each client's TCP connection.

The \`handledBy: INSTANCE_ID\` field in the payload is a debug crumb — when the demo UI shows "score updated by server:3002" you know the cross-instance routing actually fired. In production you can drop the field; the adapter doesn't need it.

The pattern transfers to BroadcastChannel, EventEmitter, or any non-distributed pub/sub interface you've used. The mental model is "this one line of code now means the same thing across N processes" — no map of instance IDs to follow, no manual fan-out, no missed clients.`,
    contentType: 'REPOSITORY_FILE',
    language: 'javascript',
    tags: ['socket.io', 'redis', 'pubsub', 'broadcast'],
    repository: repo,
    filePath: 'src/server.js',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/src/server.js',
  },
  {
    title: 'disconnecting handler: clean up rooms BEFORE socket.rooms is empty',
    body: `Socket.io fires both \`disconnecting\` and \`disconnect\`, and they're not interchangeable for cleanup work:

\`\`\`js
socket.on("disconnecting", () => {
  for (const roomId of socket.rooms) {
    const room = rooms.get(roomId);
    if (!room) continue;
    room.players.delete(socket.id);
    io.to(roomId).emit("room_update", {
      roomId,
      playerCount: room.players.size,
      score: room.score,
      handledBy: INSTANCE_ID,
    });
  }
});

socket.on("disconnect", () => {
  console.log(\`[\${INSTANCE_ID}] disconnected: \${socket.id}\`);
});
\`\`\`

The crucial difference: during \`disconnecting\`, \`socket.rooms\` is still populated with every room the socket is in. By the time \`disconnect\` fires, Socket.io has already cleared the rooms set, so iterating it gives you nothing.

This is the standard pattern for "tell the room someone left." If you do it on \`disconnect\`, you have to remember which rooms the socket WAS in (typically by maintaining a parallel Map keyed by socket.id). On \`disconnecting\` you get the rooms for free.

The \`io.to(roomId).emit\` inside the loop is what makes the cross-instance adapter pay off — the remaining player on a different instance gets a real-time \`room_update\` showing the decremented count. Without the adapter that emit only reaches clients on the instance that owned the disconnecting socket; the player on the other server would still see the leaver's avatar until they refreshed.`,
    contentType: 'REPOSITORY_FILE',
    language: 'javascript',
    tags: ['socket.io', 'cleanup', 'disconnect', 'realtime'],
    repository: repo,
    filePath: 'src/server.js',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/src/server.js',
  },
  {
    title: 'Per-instance rooms Map: when local state is OK in a distributed app',
    body: `The room state lives in a per-process \`Map\` even though the app runs on multiple instances:

\`\`\`js
// Game state (per-process)
// In a real app this lives in Redis; here we keep it simple.
const rooms = new Map(); // roomId → { players: Set<socketId>, score: { red: 0, blue: 0 } }
\`\`\`

This is intentional and the comment is honest about the tradeoff. The demo's score and player count diverge slightly between instances (instance :3001's \`rooms.get("foo").score.red\` is its own count of attacks it processed, not the global). The Socket.io adapter still broadcasts every score update across all instances so the BROWSER UI stays in sync — but the in-memory \`rooms\` Map on each server isn't authoritative.

For a real app the rule is: anything you'd lose on a process crash and care about must live in Redis, Postgres, or an external store. Per-instance Maps are fine for ephemeral coordination state — recently seen socket IDs, in-flight requests for cleanup, etc.

The reference implementation keeps the demo simple by not introducing a Redis-backed game state. The pattern to look at instead is the Socket.io \`adapter\` line + the \`io.to(roomId).emit\` calls — those handle the cross-instance broadcast which is the actual hard problem. Persisting per-room score across instance restarts is a separate (and uninteresting for the demo) Redis SET / Hash exercise.

Knowing where to put the boundary — what's per-process, what's shared via pub/sub, what's persisted — is the actual architectural call.`,
    contentType: 'REPOSITORY_FILE',
    language: 'javascript',
    tags: ['distributed-systems', 'state-management', 'socket.io'],
    repository: repo,
    filePath: 'src/server.js',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/src/server.js',
  },
  {
    title: '/health endpoint: include instance ID for load-balancer debugging',
    body: `The health endpoint returns more than \`{ status: "ok" }\` — it includes the instance label so you can confirm WHICH instance answered:

\`\`\`js
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    instance: INSTANCE_ID,
    uptime: process.uptime(),
    activeRooms: rooms.size,
    connectedClients: io?.engine?.clientsCount ?? 0,
  });
});
\`\`\`

Why the instance field matters: when you've got multiple replicas behind a load balancer (Kubernetes, ECS, Railway, Render), repeated curl to \`/health\` should round-robin across instances. If every response shows \`instance: "server:3001"\`, your LB is sticky-pinned or one instance is dead and the others are silently absorbing all the traffic. Grafana panels that group health-check responses by \`instance\` field reveal the load distribution at a glance.

\`uptime: process.uptime()\` — Node's built-in seconds-since-process-start. Lets you correlate \`/health\` output with deploy timestamps. If uptime resets to ~0 in the middle of the day on one instance, that's a silent crash & restart you missed.

\`activeRooms\` and \`connectedClients\` — live values from this instance's data structures. Useful for capacity-planning ("we have 30 active rooms across 2 instances at 9pm") and for confirming that disconnects actually clean up state.

Kept deliberately small — health checks fire every 5–30 seconds in production. Anything heavier (a Redis ping, a DB query) belongs in a separate \`/ready\` endpoint that's polled less often. \`/health\` should answer in <5ms or your liveness probes will start killing healthy pods.`,
    contentType: 'REPOSITORY_FILE',
    language: 'javascript',
    tags: ['health-check', 'observability', 'kubernetes'],
    repository: repo,
    filePath: 'src/server.js',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/src/server.js',
  },
  {
    title: 'Testing distributed tick logic without Redis: dependency injection',
    body: `The tryTick function is replicated as a factory in the test file so every code path can be exercised with mocks instead of a real Redis:

\`\`\`js
function makeTryTick({ redlock, io }) {
  return async function tryTick() {
    let lock;
    try {
      lock = await redlock.acquire([TICK_LOCK_KEY], LOCK_TTL_MS);
    } catch {
      return; // Another instance holds the lock — skip this tick.
    }
    try {
      const timestamp = new Date().toISOString();
      io.emit("server_tick", { at: timestamp, by: INSTANCE_ID });
    } finally {
      await lock.release();
    }
  };
}
\`\`\`

The pattern is "extract the side-effecting function so it takes its dependencies as arguments." In the production server.js, \`redlock\` and \`io\` are module-scope singletons created at boot. In tests, \`makeTryTick\` lets you pass jest.fn() mocks for both — so you can assert "when acquire rejects, emit is never called" or "lock.release runs even if emit throws" without spinning up Redis or Socket.io.

The downside of replicating the logic in two places (server.js and the test factory) is that the test isn't actually exercising the production code — it's exercising a copy. The win is that the test runs in 50ms with zero infrastructure. For a project this small that's the right tradeoff. For larger systems you'd refactor server.js to export \`makeTryTick\` directly and import it in both places.

The test asserts every branch: success path, failure path, lock release on success, lock release on emit-throw, no release on acquire-failure, alternating acquire/skip across multiple invocations. That's the unit test version of "verify the lock is actually distributing."`,
    contentType: 'REPOSITORY_FILE',
    language: 'javascript',
    tags: ['testing', 'jest', 'dependency-injection', 'redis'],
    repository: repo,
    filePath: 'src/__tests__/redlock.test.js',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/src/__tests__/redlock.test.js',
  },
  {
    title: 'In-process Socket.io tests: real server, no Redis',
    body: `For testing the join_room / attack / disconnect handlers, the test spins up a real Socket.io server on an OS-assigned port and connects real socket.io-client clients to it:

\`\`\`js
function buildServer() {
  const httpServer = createServer();
  const io = new Server(httpServer, { cors: { origin: "*" } });
  // ... handlers replicated inline (no Redis adapter)
  return { io, httpServer, rooms };
}

beforeAll(() => new Promise((resolve) => {
  ({ io, httpServer, rooms } = buildServer());
  httpServer.listen(0, () => {
    port = httpServer.address().port;
    resolve();
  });
}));
\`\`\`

\`httpServer.listen(0)\` asks the OS to assign a free port — this lets the test suite run in parallel without port conflicts. The actual port is read back from \`httpServer.address().port\` and used in the client URL.

The handlers are replicated inline (without the Redis adapter line) so the test exercises the real Socket.io stack but skips the cross-instance broadcast. For testing single-instance handler logic — does \`attack\` increment the score, does \`disconnecting\` decrement playerCount — that's the right boundary.

The trick to making async event tests reliable is the \`waitFor(socket, event)\` helper that promisifies \`socket.once(event)\`. Sequencing becomes straightforward: \`emit\` then \`await waitFor\` for the response. Without the helper you'd be writing Promise constructors every other line.

\`afterAll\` shuts down the io server and the http server in nested callbacks — both have to fully close or the Jest process hangs at the end of the run.`,
    contentType: 'REPOSITORY_FILE',
    language: 'javascript',
    tags: ['testing', 'socket.io', 'integration-test', 'jest'],
    repository: repo,
    filePath: 'src/__tests__/socket-events.test.js',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/src/__tests__/socket-events.test.js',
  },
  {
    title: 'Module-load smoke test with mocked Redis, Socket.io, and Express',
    body: `The config test verifies that server.js LOADS without throwing — no Redis, no listen socket, no Socket.io transport. Every external is mocked:

\`\`\`js
jest.mock("ioredis", () => {
  const MockRedis = jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    duplicate: jest.fn().mockReturnValue({ on: jest.fn() }),
  }));
  MockRedis.createClient = MockRedis;
  return MockRedis;
});

jest.mock("redlock", () => {
  const MockRedlock = jest.fn().mockImplementation(() => ({
    acquire: jest.fn(),
    release: jest.fn(),
  }));
  MockRedlock.default = MockRedlock;
  return MockRedlock;
});
\`\`\`

The \`MockRedlock.default = MockRedlock\` assignment is the workaround for a real-world quirk: \`redlock\` v5 ships ESM and CommonJS, and depending on the loader \`require("redlock")\` returns either the class directly or an object with \`.default\` pointing to the class. The production code handles both:

\`\`\`js
const Redlock = require("redlock").default ?? require("redlock");
\`\`\`

The mock has to handle both too. Same trick for Socket.io: the production \`new Server(httpServer, ...)\` is mocked with a factory that returns an object exposing \`adapter\`, \`on\`, \`emit\`, \`to\` — the four methods server.js actually calls.

The test's value isn't deep behavioral verification — that's covered by the other suites. It's a smoke check: "did the module wire up correctly, was \`Redlock\` instantiated with \`retryCount: 0\`, was \`io.adapter()\` called." Catches regressions where someone accidentally removes the adapter line or changes the Redlock config.

The custom-PORT test re-runs \`require("../server")\` after \`jest.resetModules()\` and re-applies all mocks — proves the env var is parsed at module load.`,
    contentType: 'REPOSITORY_FILE',
    language: 'javascript',
    tags: ['testing', 'jest', 'mocking', 'redis'],
    repository: repo,
    filePath: 'src/__tests__/config.test.js',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/src/__tests__/config.test.js',
  },
  {
    title: 'Isolated Prometheus registry per test: avoid metric bleed-through',
    body: `prom-client uses a global default registry — if you don't isolate per test, metrics from one test leak into the next, causing assertion failures or "metric already registered" errors:

\`\`\`js
function buildTestApp() {
  // Use an isolated registry per test run so metrics don't bleed between tests.
  const testRegister = new promClient.Registry();
  promClient.collectDefaultMetrics({
    register: testRegister,
    prefix: "battle_",
  });

  const testConnectedClients = new promClient.Gauge({
    name: "battle_connected_clients",
    help: "Number of currently connected Socket.io clients",
    registers: [testRegister], // explicit, not the default
  });
  // ...
}
\`\`\`

Two failure modes this prevents:

1. **"A metric with the name X has already been registered"** — if your production server.js registers metrics on the default registry at module-load time, then your test ALSO registers the same metrics (via a second require, or via a separate mock setup), prom-client throws.

2. **Stale gauge values across tests** — a Counter's value persists across tests if the registry is shared. Test A increments \`battle_attacks_total\` to 5; Test B asserts the metric is 0 and fails.

The fix is the same in both directions: every test that touches metrics gets its own \`new promClient.Registry()\`, and every metric is created with \`registers: [testRegister]\` instead of relying on the default. The HTTP \`/metrics\` route is then defined to call \`testRegister.metrics()\` instead of the global \`register.metrics()\`.

This is also why the production server.js uses a named \`register\` variable — making the registry explicit at the call site means you can swap it without code changes when the test wants its own.`,
    contentType: 'REPOSITORY_FILE',
    language: 'javascript',
    tags: ['prometheus', 'testing', 'jest', 'observability'],
    repository: repo,
    filePath: 'src/__tests__/http-endpoints.test.js',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/src/__tests__/http-endpoints.test.js',
  },
  {
    title: 'Lazy Prometheus gauge updates inside the /metrics handler',
    body: `Gauges that reflect "current size of an in-memory data structure" are updated INSIDE the /metrics handler, not on every state change:

\`\`\`js
app.get("/metrics", async (_req, res) => {
  // Update gauges with live values
  activeRooms.set(rooms.size);
  connectedClients.set(io?.engine?.clientsCount ?? 0);

  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});
\`\`\`

The naive alternative is to call \`activeRooms.inc()\` whenever a room is created and \`activeRooms.dec()\` whenever the last player leaves. That works but it's bug-prone — every code path that mutates \`rooms\` has to remember to update the gauge, and if you miss one (or an exception bypasses it) the gauge drifts permanently from reality.

The lazy pattern: read the live value at scrape time. Prometheus pulls /metrics every 15–30 seconds, so the cost is one Map.size + one socket count per scrape. Both are O(1) operations. The gauge is correct by construction because it's recomputed from the source of truth instead of maintained as a parallel counter.

This works for gauges — instantaneous values. It does NOT work for counters (events that happened over time) — \`battle_attacks_total\` has to be incremented at the attack handler because there's no source-of-truth structure to read at scrape time. The counter stores its own state.

The pattern's limit: anything expensive to compute (a DB count, a Redis SCAN) shouldn't run on every scrape. For those cases either cache the value with a TTL or precompute it on a schedule. \`rooms.size\` and \`engine.clientsCount\` are both already O(1) so there's nothing to optimize.`,
    contentType: 'REPOSITORY_FILE',
    language: 'javascript',
    tags: ['prometheus', 'observability', 'metrics'],
    repository: repo,
    filePath: 'src/server.js',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/src/server.js',
  },
  {
    title: 'docker-compose with appendonly Redis for local persistence',
    body: `The local-development Redis is configured to write an AOF (Append-Only File) so data survives container restarts:

\`\`\`yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  redis_data:
\`\`\`

Default Redis is in-memory only — \`docker-compose down\` and your data is gone. \`--appendonly yes\` flips on AOF persistence; combined with the named \`redis_data\` volume mounted at \`/data\` (the default Redis dir), every write is fsynced to a file that survives container teardown.

For a distributed-lock demo this matters less — locks have short TTLs and are recreated on the fly. But for a development setup that mirrors what production looks like (where you'd be using Upstash, ElastiCache, or a managed Redis with persistence), it's the closer match.

The \`healthcheck\` block lets \`docker-compose up --wait\` block until Redis answers PING. Useful in CI: your Node tests start the second Redis is actually responding instead of immediately after \`docker-compose up\` returns, which previously was a common race that caused flaky test starts.

\`redis:7-alpine\` — the alpine variant is ~30MB vs ~120MB for the full image. For a demo Redis that does PING and SETNX, the alpine slim build is plenty.`,
    contentType: 'REPOSITORY_FILE',
    language: 'yaml',
    tags: ['docker', 'redis', 'docker-compose', 'devops'],
    repository: repo,
    filePath: 'docker-compose.yml',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/docker-compose.yml',
  },
  {
    title: 'Environment-driven instance ID for multi-process demo',
    body: `Each Node process gets a label derived from its port so you can tell instances apart in logs, metric labels, and demo UI:

\`\`\`js
const PORT = parseInt(process.env.PORT ?? "3001", 10);
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// Each instance gets a label so the demo UI can show which server handled a tick.
const INSTANCE_ID = \`server:\${PORT}\`;
\`\`\`

\`process.env.PORT ?? "3001"\` uses the nullish coalescing operator — falls back to "3001" only if PORT is undefined, NOT if it's the string "0" or empty (which \`||\` would also fall through). For a port arg that's the safer operator.

\`parseInt(..., 10)\` with the explicit radix — avoids the historic JavaScript footgun where \`parseInt("08")\` in older engines returned 0 (interpreted as octal). Modern engines default to base 10 but the explicit radix is good muscle memory.

The pattern enables the demo's "open both terminals" workflow:

\`\`\`bash
PORT=3001 node src/server.js &
PORT=3002 node src/server.js &
\`\`\`

Two processes, same code, different INSTANCE_IDs, both connected to the same Redis. The Socket.io adapter routes events between them; Redlock makes sure only one tick handler runs per window. INSTANCE_ID gets stamped onto every emit (\`handledBy: INSTANCE_ID\`) so the demo browser UI can color-code which server processed each event — visual proof that the cross-instance broadcast is working.

For Railway / Render / Fly deploys the same env-var pattern works — set PORT differently per replica via the platform's env config.`,
    contentType: 'REPOSITORY_FILE',
    language: 'javascript',
    tags: ['env-vars', 'config', 'multi-process'],
    repository: repo,
    filePath: 'src/server.js',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/src/server.js',
  },
  {
    title: 'Railway healthcheckPath wires /health into the platform LB',
    body: `The Railway deploy config tells the platform which endpoint to poll for liveness:

\`\`\`toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "node src/server.js"
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
\`\`\`

\`healthcheckPath = "/health"\` — Railway hits this URL after deploy and won't promote the new container until it returns 2xx. If the new container is broken (Redis URL wrong, port misconfigured, syntax error), the old one keeps serving traffic and you get a deploy failure instead of a downed app.

\`healthcheckTimeout = 300\` (seconds) — generous window for cold-start. Node + Express + Socket.io takes ~2s to fully boot; this allows up to 5 minutes for slow image pulls or Redis connection delays before declaring the deploy dead.

\`restartPolicyType = "ON_FAILURE"\` with \`restartPolicyMaxRetries = 3\` — restart up to 3 times on crash, then give up and surface the failure. Without the cap a crash-looping container would burn forever consuming CPU and triggering alerts.

\`builder = "NIXPACKS"\` — Railway's auto-detect that recognizes \`package.json\`, runs \`npm install\` and \`npm start\` automatically. No Dockerfile required for a vanilla Node project. The startCommand override here points at \`src/server.js\` directly because the package.json doesn't have a \`start\` script that matches.

The combination of /health endpoint design + railway.toml policy is the deploy-confidence layer — bad deploys fail loud and fast instead of silently rotating bad pods into your traffic.`,
    contentType: 'REPOSITORY_FILE',
    language: 'toml',
    tags: ['railway', 'deployment', 'devops', 'health-check'],
    repository: repo,
    filePath: 'railway.toml',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/railway.toml',
  },
  {
    title: 'Counter labels: track attacks by team without N counters',
    body: `Prometheus counters with a label dimension let one metric track multiple sub-counts:

\`\`\`js
const attacksTotal = new promClient.Counter({
  name: "battle_attacks_total",
  help: "Total number of attack events processed",
  labelNames: ["team"],
  registers: [register],
});

socket.on("attack", ({ roomId, team }) => {
  // ... increment score
  attacksTotal.inc({ team: team ?? "unknown" });
  // ...
});
\`\`\`

One \`battle_attacks_total\` metric, two label values: \`team="red"\` and \`team="blue"\`. Prometheus stores them as two separate time series internally but you only declare and instrument ONE counter. PromQL queries can sum across teams (\`sum(battle_attacks_total)\`) or break out by team (\`sum by (team) (battle_attacks_total)\`).

The alternative — \`attacksRedTotal\` and \`attacksBlueTotal\` as separate counter declarations — works for two values but doesn't scale. Add a third team and you're back in the source code adding a new constant. With labels you just start passing the new value; Prometheus discovers the new series automatically.

The \`team ?? "unknown"\` fallback prevents a misbehaving client (\`emit("attack", { roomId })\` with team missing) from crashing the metric increment. Cardinality discipline: the value space MUST be small (red/blue, not user IDs) — high-cardinality labels blow up Prometheus storage. \`team\` has 2-3 possible values; \`socket.id\` has unlimited and would be the wrong choice.

The Grafana dashboard pattern: a single panel with \`sum by (team) (rate(battle_attacks_total[1m]))\` shows attacks-per-second per team as two lines on one chart. No code change needed if you add a third team.`,
    contentType: 'REPOSITORY_FILE',
    language: 'javascript',
    tags: ['prometheus', 'metrics', 'labels', 'observability'],
    repository: repo,
    filePath: 'src/server.js',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/src/server.js',
  },
  {
    title: 'Redis connection error handler: log, don\'t crash',
    body: `Redis can hiccup — network blips, failover, brief outages. The server stays up by handling the error event instead of letting it crash the process:

\`\`\`js
const pubClient = createClient(REDIS_URL);
const subClient = pubClient.duplicate();

pubClient.on("error", (err) =>
  console.error(\`[\${INSTANCE_ID}] Redis pub error:\`, err.message),
);
subClient.on("error", (err) =>
  console.error(\`[\${INSTANCE_ID}] Redis sub error:\`, err.message),
);
\`\`\`

ioredis emits an \`error\` event when the connection drops, when authentication fails, when a command times out. If NO listener is attached, Node's default behavior for unhandled \`error\` events on EventEmitters is to crash the process with a stack trace.

Crashing on a transient Redis blip is the wrong default for a long-lived server — ioredis will reconnect automatically (you don't need to wire up reconnection logic for the basic case), so the right behavior is "log it and let the client recover on its own."

What's NOT being done here is critical: the error is logged but not swallowed silently and not retried. Logging means you see it in your aggregated logs (Datadog, Sentry, Vercel Logs). You can build alerts on log frequency (\`Redis pub error\` rate > 10/minute → page someone).

For commands issued during the outage, ioredis' \`maxRetriesPerRequest: 3\` (set in stripe-payments-demo's redis.ts) means individual commands will retry then surface a final error to the awaiter. That error propagates up through the request handler and turns into a 500 response — which is the right behavior for a request that genuinely couldn't be served. The connection-level error handler is for the persistent connection state; per-request retry is its own concern.`,
    contentType: 'REPOSITORY_FILE',
    language: 'javascript',
    tags: ['redis', 'ioredis', 'error-handling', 'reliability'],
    repository: repo,
    filePath: 'src/server.js',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/src/server.js',
  },
  {
    title: 'WCAG-AA contrast tokens for terminal-style demo UI',
    body: `The demo UI's CSS variables include a comment explaining why the muted color was lightened — the original failed WCAG AA contrast checks:

\`\`\`css
:root {
  --bg: #0a0a0f;
  --surface: #111118;
  --surface2: #16161f;
  --border: #22222e;
  --text: #e2e2f0;
  /* Previous --muted #6b6b80 was ~3.5:1 on --bg / ~3.8:1 on --surface2 —
     failed WCAG AA 4.5:1 on axe (40 violations on the audit run).
     Lightened to #a8a8c0 (~7:1 on --bg, ~6:1 on --surface2). */
  --muted: #a8a8c0;
  --red: #ff6b5c;
  --blue: #5dade2;
  --green: #5eea96;
  --purple: #c58df5;
  --yellow: #fde047;
}
\`\`\`

WCAG AA requires 4.5:1 contrast for normal text, 3:1 for large text. Dark-themed terminal UIs are a common offender — the "muted secondary text" color tends to drift toward background grey because it looks "designed" but flunks contrast.

The original \`#6b6b80\` was 3.5:1 on the darkest surface — visually fine for designers, unreadable for low-vision users. The fix is one hex value bump up. The audit tool (axe) flagged it as 40 violations because the muted token was used in 40 places; one variable change fixed all of them.

The lesson worth carrying: when you have semantic color tokens (\`--muted\`, \`--text\`, \`--accent\`), audit each pairing once at design time and lock it in. Component-level overrides ("just make this text a bit lighter for THIS panel") are how contrast drift creeps back in. Centralize the palette, run axe in CI on the rendered HTML, and the rule mostly takes care of itself.

The accent colors were also bumped up — \`--blue\` and \`--green\` are used for live status badges where AA still applies even though they look "decorative."`,
    contentType: 'REPOSITORY_FILE',
    language: 'css',
    tags: ['accessibility', 'wcag', 'css', 'design-system'],
    repository: repo,
    filePath: 'public/index.html',
    url: 'https://github.com/Shailesh93602/redis-battle-demo/blob/main/public/index.html',
  },
];
