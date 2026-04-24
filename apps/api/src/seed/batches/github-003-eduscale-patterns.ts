/**
 * Batch github-003-eduscale-patterns
 *
 * 25 patterns extracted from EduScale (repo name: DevScale) — a real-time
 * coding-battle EdTech platform. Backend is Express + Prisma + Socket.io
 * with @socket.io/redis-adapter, Redlock, opossum, prom-client, and Bull.
 *
 * Each entry was read from the actual file in the repo. The url field
 * resolves to the Shailesh93602/DevScale repo on `main` (the GitHub repo
 * is named DevScale even though the product is now called EduScale).
 */

import type { SeedItem } from '../types';

const repo = { owner: 'Shailesh93602', name: 'DevScale' };
const blob = (path: string) =>
  `https://github.com/${repo.owner}/${repo.name}/blob/main/${path}`;

export const BATCH: SeedItem[] = [
  {
    title: 'Socket.io Redis adapter: cross-instance broadcasts via pub/sub',
    body: `Socket.io's default in-memory adapter only broadcasts events within ONE Node.js process. Deploy two instances behind a load balancer and \`socket.to(room).emit(...)\` reaches only sockets connected to the same instance — the other half of the room never sees the event.

EduScale wires \`@socket.io/redis-adapter\` so every emit is published to a Redis channel and re-broadcast by every instance:

\`\`\`ts
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

initialize(server: HttpServer) {
  // pub/sub MUST be separate connections per Socket.io adapter requirements
  this.pubClient = new Redis(REDIS_URL);
  this.subClient = this.pubClient.duplicate();

  this.pubClient.on('error', (err) =>
    logger.error('Socket.io pubClient Redis error', { err })
  );
  this.subClient.on('error', (err) =>
    logger.error('Socket.io subClient Redis error', { err })
  );

  this.io = new SocketIOServer(server, { cors: /* ... */ });
  this.io.adapter(createAdapter(this.pubClient, this.subClient));
}
\`\`\`

Two non-obvious requirements:

1. The pub and sub clients MUST be different ioredis connections. The Redis sub-mode is exclusive — once a client enters subscriber mode, it can't run normal commands. \`pubClient.duplicate()\` is the canonical way to get an identically-configured second connection.
2. \`io.adapter(...)\` has to be called BEFORE any \`io.on('connection', ...)\` handlers. Adapters wrap the adapter chain at install time; installing one after handlers are bound silently leaves them on the in-memory adapter.

The adapter only handles broadcasts. Per-socket state (which user → which socket id) is NOT in the adapter — EduScale tracks that separately in Redis sets, see the SOCKET_TTL pattern.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['socket.io', 'redis', 'distributed', 'pubsub'],
    repository: repo,
    filePath: 'Backend/src/services/socket.ts',
    url: blob('Backend/src/services/socket.ts'),
  },
  {
    title: 'Redlock: distributed mutex with retry/jitter for the battle-start race',
    body: `When two players join a battle simultaneously, two different Socket.io servers may both detect "room is full" and try to start the battle at the same instant. Without coordination, both execute the start logic — double-incrementing scores, duplicating questions, etc.

EduScale uses Redlock to serialise the critical section:

\`\`\`ts
export const redlock = new Redlock([redis as unknown as RedlockClient], {
  driftFactor: 0.01,         // ms — clock-drift tolerance per Redlock paper
  retryCount: 10,            // up to 10 attempts to acquire
  retryDelay: 200,           // 200ms between attempts
  retryJitter: 200,          // randomise +/- 200ms to avoid thundering herd
  automaticExtensionThreshold: 500, // auto-extend lock if <500ms left
});

redlock.on('clientError', (error: Error) => {
  if (error.name !== 'ResourceLockedError') {
    logger.error('Redlock Error:', error);
  }
});
\`\`\`

The repository wraps it in a \`withBattleLock\` helper:

\`\`\`ts
private async withBattleLock<T>(
  battleId: string, ttlMs: number, callback: () => Promise<T>
): Promise<T> {
  const resource = \`battle:lock:\${battleId}\`;
  const lock = await redlock.acquire([resource], ttlMs, { retryCount: 0 });
  try {
    return await callback();
  } finally {
    await lock.release().catch(/* tolerate already-expired releases */);
  }
}
\`\`\`

Note the override \`{ retryCount: 0 }\` for battle-start specifically: if another server already holds the lock, that server is starting the battle — retrying would queue a second start AFTER the first completes, which would restart an already-running battle. Fail-fast is the correct behaviour for "do this exactly once" critical sections.

The class-level \`retryCount: 10\` is the default for less-contentious operations like answer submission, where waiting 200-2000 ms for the lock is fine.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['redlock', 'redis', 'distributed-locking', 'concurrency'],
    repository: repo,
    filePath: 'Backend/src/services/cacheService.ts',
    url: blob('Backend/src/services/cacheService.ts'),
  },
  {
    title: 'opossum circuit breaker around Judge0 code execution + custom 503 fallback',
    body: `Judge0 (the third-party code-runner) is the most likely failure point in EduScale — a single user submitting heavy code can saturate the upstream and hang every battle in progress. The circuit breaker opens after a few failures so subsequent calls fail-fast instead of stacking up timeouts.

\`\`\`ts
import CircuitBreaker from 'opossum';

const judge0Breaker = new CircuitBreaker(_executeCodeRaw, {
  timeout: 15000,                  // 15 s — Judge0 slow-path ceiling
  errorThresholdPercentage: 50,    // open when ≥50% of calls in window fail
  resetTimeout: 30000,             // try again after 30 s in half-open
  volumeThreshold: 3,              // need at least 3 calls before opening
  name: 'judge0',
});

judge0Breaker.on('open',     () => logger.warn('Judge0 circuit breaker OPEN'));
judge0Breaker.on('halfOpen', () => logger.info('Judge0 circuit breaker HALF-OPEN — probing'));
judge0Breaker.on('close',    () => logger.info('Judge0 circuit breaker CLOSED — service recovered'));

export const executeCode = async (params: ExecuteCodeParams) => {
  try {
    return await judge0Breaker.fire(params);
  } catch (error) {
    if (judge0Breaker.opened) {
      throw createAppError(
        'Code execution is temporarily unavailable — please try again in a moment.',
        503
      );
    }
    throw error;
  }
};
\`\`\`

The three thresholds tune the breaker's sensitivity:

- \`volumeThreshold: 3\` — don't open on a one-off blip; need 3+ calls in the window first.
- \`errorThresholdPercentage: 50\` — open when at least half of those calls fail. If 2/3 fail the breaker opens; 1/3 it stays closed.
- \`resetTimeout: 30000\` — wait 30 seconds in OPEN before letting one probe through (HALF-OPEN). If the probe succeeds, transition to CLOSED; if it fails, back to OPEN for another 30s.

The 503 fallback is user-friendly. Without it, callers get an opaque "circuit breaker is open" error from opossum; with it they see a guidance message and the frontend can show "try again in a minute" UX.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['opossum', 'circuit-breaker', 'resilience', 'judge0'],
    repository: repo,
    filePath: 'Backend/src/utils/codeExecutor.ts',
    url: blob('Backend/src/utils/codeExecutor.ts'),
  },
  {
    title: 'Judge0 long-poll loop with exponential-friendly delays',
    body: `Judge0's submission API is asynchronous: POST returns a token, then you GET \`/submissions/{token}\` and poll until \`status.id >= 3\` (queued/processing → done). EduScale wraps this in a bounded poll loop with a 10-attempt cap.

\`\`\`ts
const pollSubmissionResult = async (token: string, maxAttempts = 10) => {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await axios.get(
      \`https://judge029.p.rapidapi.com/submissions/\${token}?base64_encoded=true\`,
      { headers: {
          'X-RapidAPI-Host': 'judge029.p.rapidapi.com',
          'X-RapidAPI-Key': COMPILER_CLIENT_SECRET,
      }}
    );

    if (response.data.status.id >= 3) {
      return response.data;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw createAppError('Code execution timeout', 408);
};
\`\`\`

Why \`status.id >= 3\` and not a specific value: Judge0 has a status enum (1=in queue, 2=processing, 3=accepted, 4=wrong answer, 5=tle, 6=cle, etc.). Anything ≥3 is terminal. Hard-coding "3" misses errors; \`>=3\` covers the full success/failure tree.

Why the 1000 ms delay is deliberate: Judge0's RapidAPI tier has a request-rate limit. Tighter polling burns the budget faster than the average submission completes, leading to "rate limit exceeded" instead of execution results.

Why \`base64_encoded=true\` everywhere: code, stdin, stdout, stderr all go over the wire as base64. Plain JSON would break on multi-line code (newlines in JSON strings get escaped) and on programs that print binary bytes. Base64 is universal.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['axios', 'polling', 'judge0', 'async-jobs'],
    repository: repo,
    filePath: 'Backend/src/utils/codeExecutor.ts',
    url: blob('Backend/src/utils/codeExecutor.ts'),
  },
  {
    title: 'Bull queue with exponential backoff + dead-letter queue handoff',
    body: `Email sending is decoupled from request handlers via a Bull queue. Failures retry with exponential backoff; jobs that exhaust their retry budget are moved to a dead-letter queue for manual review.

\`\`\`ts
const emailQueue = new Queue('email-queue', REDIS_URL);
const emailDLQ = new Queue('email-dlq', REDIS_URL);

export const sendEmail = async (data: EmailData): Promise<void> => {
  await emailQueue.add(data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  });
};

emailQueue.process(async (job) => {
  const info = await transporter.sendMail(/* ... */);
  await trackEmailDelivery(job.data.to, job.data.subject, 'delivered');
});

emailQueue.on('failed', async (job, error) => {
  if (job.attemptsMade >= (job.opts.attempts || 1)) {
    logger.error(\`Job \${job.id} definitively failed. Moving to DLQ.\`);
    await emailDLQ.add({
      originalJobId: job.id,
      data: job.data,
      error: error.message,
      failedAt: new Date(),
    });
  }
});

emailDLQ.process(async (job) => {
  logger.error('CRITICAL: Email in Dead-Letter Queue requires review:', job.data);
});
\`\`\`

The math: with \`type: 'exponential', delay: 1000\` and 3 attempts, retries happen at 1s, 2s, 4s. Total worst-case wait: 7 seconds before DLQ.

Why a separate DLQ queue (instead of just logging on final failure):

1. Replay capability. The DLQ retains the original job data, so once SMTP is healthy you can re-process the queue manually.
2. Alerting hook. The DLQ has its own \`process\` handler that logs CRITICAL — easy to wire into PagerDuty.
3. Backpressure isolation. If the SMTP outage lasts an hour, the DLQ grows but the main queue stays drained, so new emails queued during the outage still attempt the live transporter.

The Bull instance shares Redis with the Socket.io adapter and Redlock; \`maxRetriesPerRequest: null\` on the shared ioredis client (in cacheService.ts) is REQUIRED for Bull to function — Bull does long-blocking BRPOP calls that would otherwise be killed by ioredis's retry cap.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['bull', 'redis', 'queue', 'background-jobs', 'dlq'],
    repository: repo,
    filePath: 'Backend/src/utils/emailService.ts',
    url: blob('Backend/src/utils/emailService.ts'),
  },
  {
    title: 'prom-client custom metrics: Histogram for request latency, Gauge for memory',
    body: `EduScale exposes Prometheus-format metrics so the production deployment can be scraped by a Grafana stack. The patterns demonstrate when to reach for each metric type.

\`\`\`ts
import { Histogram, Gauge } from 'prom-client';

export class PerformanceMonitor {
  private static readonly requestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.5, 1, 2, 5],
  });

  private static readonly activeConnections = new Gauge({
    name: 'active_connections',
    help: 'Number of active connections',
  });

  private static readonly memoryUsage = new Gauge({
    name: 'memory_usage_bytes',
    help: 'Memory usage in bytes',
  });

  static trackRequest(method: string, route: string, duration: number, statusCode: number) {
    this.requestDuration.labels(method, route, statusCode.toString()).observe(duration);
  }

  static startMemoryMonitoring(interval = 60000) {
    setInterval(() => {
      const used = process.memoryUsage();
      this.memoryUsage.set(used.heapUsed);
      if (used.heapUsed > 1024 * 1024 * 1024) {
        logger.warn('High memory usage detected', { heapUsed: used.heapUsed });
      }
    }, interval);
  }
}
\`\`\`

The metric type rules of thumb in use here:

- **Histogram** for things you want percentiles of. The buckets define the resolution: \`[0.1, 0.5, 1, 2, 5]\` means Prometheus can compute "p95 latency" with bucket-edge precision. Pick buckets that bracket your SLO — if your SLO is "p95 < 500ms", you want a bucket exactly at 0.5.
- **Gauge** for current state — values that go up AND down. Active connections, memory usage, queue depth. \`gauge.set(value)\` overwrites; \`gauge.inc()/dec()\` mutate.
- **Counter** (not used here but common) for monotonic counters: total requests, total errors. Always increasing.

The labels (\`method\`, \`route\`, \`status_code\`) explode the metric into one time-series per combination. Be cautious — \`route\` should be the route TEMPLATE (\`/users/:id\`) not the concrete URL (\`/users/abc123\`), or you get cardinality explosion.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prom-client', 'prometheus', 'observability', 'metrics'],
    repository: repo,
    filePath: 'Backend/src/services/monitoring/performanceMonitor.ts',
    url: blob('Backend/src/services/monitoring/performanceMonitor.ts'),
  },
  {
    title: 'Health-check endpoint: parallel checks of Postgres, Redis, Bull → 200 or 503',
    body: `EduScale's \`/api/v1/health\` does real round trips to every dependency and returns 200 only if all three are healthy. A degraded component flips the response to 503, which lets a load balancer take the instance out of rotation.

\`\`\`ts
this.router.get('/', async (req, res) => {
  const checks: Record<string, 'ok' | 'error'> = {};
  let httpStatus = 200;

  // PostgreSQL check
  try {
    await prisma.$queryRaw\`SELECT 1\`;
    checks.postgres = 'ok';
  } catch {
    checks.postgres = 'error';
    httpStatus = 503;
  }

  // Redis check
  try {
    const pong = await redis.ping();
    checks.redis = pong === 'PONG' ? 'ok' : 'error';
    if (checks.redis === 'error') httpStatus = 503;
  } catch {
    checks.redis = 'error';
    httpStatus = 503;
  }

  // Bull queue check
  try {
    const q = new Queue('health-check-probe', REDIS_URL);
    await q.isReady();
    await q.close();
    checks.queue = 'ok';
  } catch {
    checks.queue = 'error';
    httpStatus = 503;
  }

  res.status(httpStatus).json({
    status: httpStatus === 200 ? 'ok' : 'degraded',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    checks,
  });
});
\`\`\`

A separate \`/api/v1/ready\` route returns 200 the moment the process is up — no dependency checks. The split matters in K8s/ECS:

- **Readiness probe → /ready**: "is this container accepting traffic yet?" Returning 200 too early during dependency outages causes traffic to land on broken instances.
- **Liveness probe → /health**: "is this container healthy?" Returning 503 lets the orchestrator restart the container if it stays unhealthy.

The Bull check creates a throwaway queue and immediately closes it — \`isReady()\` confirms Redis-Bull connectivity end-to-end (which a plain \`redis.ping()\` doesn't, since Bull uses different commands and key prefixes).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['express', 'health-check', 'kubernetes', 'observability'],
    repository: repo,
    filePath: 'Backend/src/routes/healthCheckRoutes.ts',
    url: blob('Backend/src/routes/healthCheckRoutes.ts'),
  },
  {
    title: 'Supabase JWT verify locally via JWKS, fall back to Supabase API on failure',
    body: `Calling Supabase's \`/auth/v1/user\` for every authenticated request adds latency and burns Supabase's request quota. EduScale's auth middleware verifies the JWT signature locally using Supabase's published JWKS, falling back to the HTTP API only when local verification fails.

\`\`\`ts
const verifyToken = async (token: string): Promise<SupabaseUser> => {
  try {
    const { jwtVerify, createRemoteJWKSet } = await import('jose');
    const JWKS_INTERNAL = createRemoteJWKSet(
      new URL(\`\${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json\`)
    );
    const { payload } = await jwtVerify(token, JWKS_INTERNAL);

    return {
      id: payload.sub,
      email: payload.email as string,
      user_metadata: (payload.user_metadata as Record<string, unknown>) || {},
    } as unknown as SupabaseUser;
  } catch (err) {
    logger.warn(\`Local JWT verification failed: \${err}. Falling back to Supabase HTTP API.\`);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) throw createAppError('Invalid authentication token', 401);
    return data.user;
  }
};
\`\`\`

The dynamic \`await import('jose')\` is intentional — \`jose\` is heavy, and lazy-loading it keeps the cold-start path lean for routes that don't hit auth.

\`createRemoteJWKSet\` caches the JWKS in memory for a default 30 minutes, so even local verification only fetches the key set once per half-hour per process. Token verification itself is then a pure-CPU operation — no I/O.

The HTTP fallback exists for two real edge cases: (a) tokens issued before a JWKS rotation, where the local key set is stale, and (b) tokens issued by Supabase services that don't appear in the JWKS yet. Logging the fallback path lets you spot key-rotation issues in production without breaking auth.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['supabase', 'jwt', 'jose', 'auth', 'jwks'],
    repository: repo,
    filePath: 'Backend/src/middlewares/authMiddleware.ts',
    url: blob('Backend/src/middlewares/authMiddleware.ts'),
  },
  {
    title: 'Token cache + token blocklist: two Redis-backed auth layers',
    body: `EduScale's auth middleware caches successfully-verified tokens for 5 minutes (saves Supabase round-trips) and ALSO checks a blocklist that lets logout invalidate tokens before their natural expiry.

\`\`\`ts
const TOKEN_BLOCKLIST_PREFIX = 'eduscale:auth:blocklist:';
const AUTH_CACHE_TTL_SECONDS = 5 * 60;
const AUTH_CACHE_PREFIX = 'eduscale:auth:';

const tokenCacheKey = (token: string) =>
  AUTH_CACHE_PREFIX + crypto.createHash('sha256').update(token).digest('hex');

const isTokenBlocklisted = async (token: string): Promise<boolean> => {
  try {
    const key = TOKEN_BLOCKLIST_PREFIX + crypto.createHash('sha256').update(token).digest('hex');
    return (await redis.exists(key)) === 1;
  } catch {
    return false;
  }
};

export const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next(createAppError('Authorization token required', 401));

  if (await isTokenBlocklisted(token)) {
    return next(createAppError('Token has been revoked', 401));
  }

  const cached = await getAuthCache(token);
  if (cached) {
    req.user = cached.userData;
    req.supabaseUser = cached.user;
    return next();
  }

  const user = await verifyToken(token);
  const userData = await syncUser(user);
  await setAuthCache(token, user, userData);
  req.user = userData;
  next();
};
\`\`\`

Three details:

1. SHA-256 hashing the token before using it as a Redis key. Tokens are sensitive material; storing them as-is means anyone with Redis access (or a Redis dump) gets a list of valid bearer tokens. The hash is one-way — Redis stores something derived from the token but unusable as one.
2. Blocklist is checked BEFORE the cache. Otherwise, logout would have to also evict the cache; checking the blocklist first means logout only needs to write to one place.
3. Blocklist TTL should match (or slightly exceed) the JWT's natural expiry. Once the JWT is expired, the cache wouldn't honour it anyway, so the blocklist entry is no longer needed and can be GC'd by Redis automatically.

Both Redis ops fail-open (\`catch { return false; }\`) — if Redis is down, the system falls back to slow but correct behaviour: every request hits Supabase to verify. That's the same fail-open pattern used by the rate limiter and account lockout middleware.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['auth', 'redis', 'cache', 'security', 'jwt'],
    repository: repo,
    filePath: 'Backend/src/middlewares/authMiddleware.ts',
    url: blob('Backend/src/middlewares/authMiddleware.ts'),
  },
  {
    title: 'Account lockout: sliding-window failure counter + 30-min lock per IP',
    body: `Brute-force attacks on the refresh-token endpoint are countered with a per-IP failure counter. Hitting 10 failures in a 15-minute sliding window locks the IP for 30 minutes.

\`\`\`ts
const MAX_FAILURES = 10;
const WINDOW_SECS = 15 * 60;
const LOCK_DURATION_SECS = 30 * 60;
const FAILURE_PREFIX = 'eduscale:lockout:failures:';
const LOCK_PREFIX = 'eduscale:lockout:locked:';

export const checkAccountLockout = async (req, res, next) => {
  try {
    const key = LOCK_PREFIX + ipKey(req);
    const locked = await redis.exists(key);
    if (locked) {
      const ttl = await redis.ttl(key);
      next(createAppError(
        \`Too many failed attempts. Try again in \${Math.ceil(ttl / 60)} minutes.\`,
        429
      ));
      return;
    }
    next();
  } catch {
    next(); // fail open — don't block legitimate users if Redis is down
  }
};

export const recordAuthFailure = async (req): Promise<void> => {
  const failKey = FAILURE_PREFIX + ipKey(req);
  const lockKey = LOCK_PREFIX + ipKey(req);

  const failures = await redis.incr(failKey);
  // Reset expiry on every increment so the window stays sliding
  await redis.expire(failKey, WINDOW_SECS);

  if (failures >= MAX_FAILURES) {
    await redis.setex(lockKey, LOCK_DURATION_SECS, '1');
    await redis.del(failKey);
  }
};
\`\`\`

The "sliding" part is achieved by re-setting the EXPIRE on every increment. A pure fixed window (set EXPIRE only on first failure) lets an attacker game the boundary — 9 failures at 14:59, 9 more at 15:00, no lockout despite 18 attempts in 60 seconds. Re-setting on each increment means the window starts fresh from the most recent failure.

The lockout ttl is communicated back via \`redis.ttl(key)\` so the user gets "Try again in 27 minutes" instead of a useless "locked." The lockout pattern is applied only to \`/auth/refresh\` (in \`authRoutes.ts\`), not every endpoint — refresh is the high-value brute-force target.

The fail-open behaviour in checkAccountLockout means a Redis outage doesn't trigger false lockouts for legitimate users. The trade-off is that an attacker can exploit the outage window — for EduScale's threat model that's acceptable.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['security', 'rate-limiting', 'redis', 'auth'],
    repository: repo,
    filePath: 'Backend/src/middlewares/accountLockout.ts',
    url: blob('Backend/src/middlewares/accountLockout.ts'),
  },
  {
    title: 'Distributed rate limiter via Redis MULTI: INCR + EXPIRE in one round trip',
    body: `Per-instance rate limiters don't work behind a load balancer — a flood gets distributed across N instances and each one sees N×less traffic. EduScale's limiter atomically increments a counter in Redis using MULTI so the cap is global across all instances.

\`\`\`ts
return (req: Request, res: Response, next: NextFunction): void => {
  if (!redisClient) {
    next();
    return;
  }

  const key = \`\${keyPrefix}:\${req.ip}\`;
  const windowInSeconds = Math.floor(windowMs / 1000);

  redisClient
    .multi()
    .incr(key)
    .expire(key, windowInSeconds)
    .exec()
    .then((result) => {
      const [incrResult] = result;
      const [, requestCount] = incrResult;
      const count = typeof requestCount === 'number' ? requestCount : 1;

      res.setHeader('X-RateLimit-Limit', max.toString());
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count).toString());

      if (count > max) {
        res.status(429).json({ status: 429, message });
        return;
      }
      next();
    })
    .catch(/* fail open */);
};

export const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
export const apiLimiter  = createRateLimiter({ windowMs: 60 * 1000, max: 60 });
export const uploadLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 10 });
\`\`\`

Why MULTI: \`INCR\` followed by \`EXPIRE\` as separate commands has a race where the EXPIRE can be issued against a key that another increment created milliseconds before yours — usually harmless, but on a brand-new key with a delayed EXPIRE the key persists indefinitely. \`MULTI\` ships both commands as one atomic unit.

Why three named exports: each route family has different rate-limit semantics. Auth (5/15min) defends against brute force; uploads (10/hour) cap Cloudinary spend; the general API limiter (60/min) catches abusive scrapers without affecting humans. Co-locating them in the same file makes it obvious that they share the same primitive.

\`enableOfflineQueue: false\` on the ioredis constructor (top of the file) means the rate limiter doesn't queue commands when Redis is down — it returns immediately and the middleware fails open. That's the same defensive pattern used elsewhere.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['rate-limiting', 'redis', 'express', 'middleware'],
    repository: repo,
    filePath: 'Backend/src/middlewares/rateLimiter.ts',
    url: blob('Backend/src/middlewares/rateLimiter.ts'),
  },
  {
    title: 'AsyncLocalStorage for requestId-tagged Winston logs without prop drilling',
    body: `Tracing a single user's flow through a backend with N async layers means every \`logger.info\` call needs to know the requestId. Threading it through every function signature is impractical. EduScale uses Node's \`AsyncLocalStorage\` so the logger reads the requestId from the implicit async context.

\`\`\`ts
import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestContext { requestId: string; }
export const requestContext = new AsyncLocalStorage<RequestContext>();

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const ctx = requestContext.getStore();
    return JSON.stringify({
      timestamp,
      level,
      message,
      requestId: ctx?.requestId,
      ...(stack ? { stack } : {}),
      ...meta,
    });
  })
);
\`\`\`

The middleware that establishes the context:

\`\`\`ts
export const requestIdMiddleware = (req, res, next) => {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  // Run the rest of the request chain inside the AsyncLocalStorage context
  requestContext.run({ requestId }, next);
};
\`\`\`

Critically, \`requestContext.run({ requestId }, next)\` wraps the next() call. AsyncLocalStorage propagates through Promise chains, setTimeout, setImmediate, and database driver internals — a logger.info call from inside a Prisma transaction 5 levels deep STILL gets the right requestId because the context is bound by Node's async hooks.

Honoring an incoming \`X-Request-ID\` header lets the gateway / load balancer / API client supply its own ID, so logs across microservices share a single correlation key. Setting \`X-Request-ID\` on the response lets downstream consumers (frontend, observability) read what the server used.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['async-hooks', 'winston', 'logging', 'observability'],
    repository: repo,
    filePath: 'Backend/src/utils/logger.ts',
    url: blob('Backend/src/utils/logger.ts'),
  },
  {
    title: 'Express error handler: AppError class + sanitised 500s in production',
    body: `Every async route in EduScale ultimately routes errors to one Express error middleware. The middleware does three jobs: structured logging, status-code mapping, and not leaking stack traces in production.

\`\`\`ts
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    logger.error('Application Error', {
      status: err.statusCode,
      path: \`\${req.method} \${req.originalUrl}\`,
      message: err.message,
      details: err.details,
      stack: err.stack,
    });
  } else {
    logger.error('Unexpected Error', {
      status: 500, path: \`\${req.method} \${req.originalUrl}\`,
      message: err.message, stack: err.stack,
    });
  }

  const statusCode = err.statusCode || 500;
  const isDev = process.env.NODE_ENV === 'development';
  const message = statusCode === 500 && !isDev ? 'Internal server error' : err.message;

  res.status(statusCode).json({
    status: statusCode,
    message,
    error: true,
    toast: statusCode < 500,
    requestId: req.requestId,
    ...(isDev && { stack: err.stack }),
  });
};
\`\`\`

Three details that matter:

1. \`Error.captureStackTrace(this, this.constructor)\` removes the AppError constructor itself from the stack trace, so the stack shows where the error was created, not how. Massive readability win when debugging.
2. The sanitisation rule is "5xx in production = generic message". Throwing \`new AppError("Failed to query users for org_42 with admin scope")\` is fine in dev, but in production that message becomes \`"Internal server error"\` to avoid leaking internal structure. Sub-500 errors (validation, auth) are user-actionable so they pass through.
3. The \`toast: statusCode < 500\` flag is a contract with the frontend — 4xx errors should be displayed inline (toast/alert), 5xx errors should show a generic "something broke" page. The frontend reads this flag instead of inspecting the code itself.

The requestId from AsyncLocalStorage flows through here automatically — every error response includes the request id so users can quote it in support tickets.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['express', 'error-handling', 'middleware'],
    repository: repo,
    filePath: 'Backend/src/middlewares/errorHandler.ts',
    url: blob('Backend/src/middlewares/errorHandler.ts'),
  },
  {
    title: 'catchAsync: the universal try/catch wrapper for Express async handlers',
    body: `Express's pre-5 routers don't natively forward Promise rejections from async handlers to the error middleware. Without a wrapper, an unhandled rejection inside an async route just hangs the request until the client times out.

\`\`\`ts
import { Request, Response, NextFunction } from 'express';

export type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

export const catchAsync = (fn: AsyncRequestHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
\`\`\`

Used at the route level:

\`\`\`ts
router.get('/users/:id', catchAsync(async (req, res) => {
  const user = await userService.findById(req.params.id);
  if (!user) throw createAppError('User not found', 404);
  res.json(user);
}));
\`\`\`

The whole helper is 4 lines, but it's the difference between writing try/catch in every async handler and just throwing. \`Promise.resolve(fn(...))\` handles both async and sync return values uniformly — even a sync handler that throws will be caught.

The \`.catch(next)\` forwards the error to the next error-handling middleware (the AppError handler above). No middleware between catchAsync and the error handler can swallow it.

Express 5 (currently in beta) does this natively, so this helper becomes optional once Express 5 is stable. Until then it's the cleanest way to write async route handlers without try/catch noise.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['express', 'async', 'error-handling'],
    repository: repo,
    filePath: 'Backend/src/utils/catchAsync.ts',
    url: blob('Backend/src/utils/catchAsync.ts'),
  },
  {
    title: 'Prisma transaction with timeout race + retry-with-backoff wrapper',
    body: `Long-running Prisma transactions can hold row locks indefinitely if the callback never resolves (e.g. a downstream HTTP call hanging). EduScale wraps \`$transaction\` with both a hard timeout AND retry logic for transient failures.

\`\`\`ts
type TransactionCallback<T> = (
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>
) => Promise<T>;

export class TransactionManager {
  static async transaction<T>(
    callback: TransactionCallback<T>,
    options?: { maxRetries?: number; timeout?: number }
  ): Promise<T> {
    const maxRetries = options?.maxRetries || 3;
    const timeout = options?.timeout || 5000;

    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const result = await Promise.race([
          prisma.$transaction(callback),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Transaction timeout')), timeout)
          ),
        ]);
        return result as T;
      } catch (error) {
        attempt++;
        if (attempt === maxRetries) {
          logger.error('Transaction failed after max retries:', error);
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
    throw new Error('Transaction failed');
  }
}
\`\`\`

The \`Promise.race\` with a setTimeout is the timeout mechanism. Note this doesn't actually CANCEL the underlying Prisma transaction — once the timeout fires, the wrapper rejects but the DB call still runs to completion in the background. Prisma 5 has a native \`timeout\` option that kills the transaction at the DB level; this wrapper predates that.

The retry loop with linear backoff (1s, 2s, 3s) is appropriate for transient failures (deadlocks, connection blips). It is NOT appropriate for business-rule failures (validation errors, missing rows) — those should throw a non-retryable AppError that the caller doesn't pass through this wrapper at all.

The Omit<> type signature is a careful detail: the \`tx\` client passed to the callback shouldn't be allowed to call \`$transaction\` again (nested transactions in Prisma are tricky), \`$connect/$disconnect\` (managed by the pool), or \`$use/$extends\` (mutates the global client).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'transactions', 'retry', 'timeout'],
    repository: repo,
    filePath: 'Backend/src/utils/transactionManager.ts',
    url: blob('Backend/src/utils/transactionManager.ts'),
  },
  {
    title: 'Anti-cheat middleware for battle answers: time-window + min-time clamp + dupe check',
    body: `Battle answer submissions are the highest-cheat-risk surface in EduScale. The anti-cheat middleware enforces three checks before the controller even runs:

\`\`\`ts
const MIN_ANSWER_TIME_MS = 500;

export const battleAntiCheatMiddleware = async (req, _res, next) => {
  const { battle_id, question_id, selected_option, time_taken_ms } = req.body;
  const userId = req.user?.id;

  if (!battle_id || !userId || !question_id ||
      selected_option === undefined || time_taken_ms === undefined) {
    return next(createAppError('Missing required fields for submission', 400));
  }

  const battle = await prisma.battle.findUnique({
    where: { id: battle_id },
    include: {
      questions: { where: { id: question_id } },
      participants: { where: { user_id: userId } },
    },
  });

  if (!battle) return next(createAppError('Battle not found', 404));
  if (battle.status !== 'IN_PROGRESS') return next(createAppError('Battle is not in progress', 403));
  if (!battle.participants.length) return next(createAppError('You are not a participant', 403));
  if (!battle.questions.length) return next(createAppError('Invalid question for this battle', 400));

  const question = battle.questions[0];
  const maxAllowedMs = question.time_limit * 1000 + 5000; // 5s grace period

  if (time_taken_ms < 0 || time_taken_ms > maxAllowedMs) {
    return next(createAppError('Invalid time taken for submission', 403));
  }

  // Cap minimum time to prevent speed-bonus gaming
  req.body.time_taken_ms = Math.max(time_taken_ms, MIN_ANSWER_TIME_MS);

  const existingAnswer = await prisma.battleAnswer.findFirst({
    where: { question_id, user_id: userId },
  });
  if (existingAnswer) {
    return next(createAppError('Answer already submitted for this question', 409));
  }

  next();
};
\`\`\`

Three cheats this defeats:

1. **Replay**: client sends a stale submission for a question whose timer expired. Caught by the \`time_taken_ms > maxAllowedMs\` check (with 5s grace for network jitter).
2. **Speed-bonus gaming**: client lies about time_taken_ms, sending 1ms to claim the maximum speed bonus (1.5×). Caught by the \`Math.max(time_taken_ms, 500)\` clamp — the scoring code in the repository awards full speed bonus only ≤25% of time used; with a 500ms floor on a 30-second question, you're capped at ~1.7% which still gets the full bonus, but you can't drop below the floor.
3. **Double-submit**: client races two requests for the same question hoping to score twice. Caught by the \`existingAnswer\` lookup before the controller runs.

The middleware does the read-only validation; the actual scoring + write happens inside a Redlock-protected transaction in the repository. Cheat detection at the boundary, atomic write at the core — defence in depth.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['security', 'anti-cheat', 'express', 'prisma'],
    repository: repo,
    filePath: 'Backend/src/middlewares/battleAntiCheatMiddleware.ts',
    url: blob('Backend/src/middlewares/battleAntiCheatMiddleware.ts'),
  },
  {
    title: 'CSRF double-submit cookie pattern: non-httpOnly cookie + matching header',
    body: `EduScale uses the double-submit cookie pattern for CSRF defence: a token in a non-httpOnly cookie that the client JS reads and echoes back in a custom header. The server validates that cookie value === header value on every state-changing request.

\`\`\`ts
const CSRF_COOKIE_NAME = 'XSRF-TOKEN';
const CSRF_HEADER_NAME = 'x-xsrf-token';

export const setCsrfToken = (req, res, next) => {
  if (!req.cookies[CSRF_COOKIE_NAME]) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,           // Client needs to read this to send it back
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });
  }
  next();
};

export const verifyCsrfToken = (req, res, next) => {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next();

  const cookieToken = req.cookies[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME] || req.body?._csrf;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({
      message: 'CSRF token validation failed. Please refresh the page.',
      code: 'CSRF_INVALID',
    });
    return;
  }
  next();
};
\`\`\`

Why it works: a CSRF attack from \`evil.com\` can cause the browser to send the cookie (cookies are auto-attached to cross-origin requests in many flows), but \`evil.com\` JavaScript cannot READ the cookie value to put in the header (that's blocked by the same-origin policy). So even though the cookie reaches your server, the header doesn't match.

Three implementation details:

1. \`httpOnly: false\` is REQUIRED here — your own JavaScript needs to read the cookie. (Compare to session cookies which are httpOnly precisely because no client code should touch them.)
2. \`sameSite: 'strict'\` is the second line of defence. SameSite-strict cookies aren't sent on cross-origin requests at all in modern browsers, so the attack is blocked at the cookie-attach stage. The double-submit pattern is the fallback for older browsers / edge cases where SameSite isn't honoured.
3. GET / HEAD / OPTIONS are skipped because they're idempotent / safe by spec; protecting them adds friction without security gain.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['security', 'csrf', 'express', 'cookies'],
    repository: repo,
    filePath: 'Backend/src/middlewares/csrfMiddleware.ts',
    url: blob('Backend/src/middlewares/csrfMiddleware.ts'),
  },
  {
    title: 'Joi request validation factory: validateBody / validateQuery / validateParams',
    body: `Validating request shape with Joi is repetitive — every route needs to call \`schema.validate()\`, format errors, and call next(). EduScale extracts the boilerplate into a single factory and three named exports:

\`\`\`ts
type RequestPart = 'body' | 'query' | 'params';

export const validateRequest = (schema: Schema, type: RequestPart = 'body') => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req[type], {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: false,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/['"]/g, ''),
      }));
      logger.warn('Request validation failed', { errors });
      return next(createAppError('Validation failed', 400, { errors }));
    }

    req[type] = value;
    next();
  };
};

export const validateBody = (schema: Schema) => validateRequest(schema, 'body');
export const validateQuery = (schema: Schema) => validateRequest(schema, 'query');
export const validateParams = (schema: Schema) => validateRequest(schema, 'params');
\`\`\`

Three Joi options carry meaningful behaviour:

- \`abortEarly: false\` — collect ALL validation errors instead of stopping at the first. Better UX: the user sees every problem with their submission at once, not "fix this, retry, fix the next, retry."
- \`stripUnknown: true\` — drop fields that aren't in the schema. Stops a malicious client from sneaking extra properties through into your Prisma create call.
- \`allowUnknown: false\` paired with stripUnknown is belt + suspenders. (When stripUnknown is true, allowUnknown defaults to true; explicitly setting both makes intent obvious.)

Critically, the line \`req[type] = value\` REPLACES the original request part with the validated/coerced value. Joi can transform input (\`Joi.number()\` accepts \`"42"\` and converts it to \`42\`); if you don't write \`value\` back, downstream handlers see the original string.

The error replay strips quotes from messages — Joi's defaults wrap field names in single quotes (\`"email" is required\`); the controller's response looks cleaner without them.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['joi', 'validation', 'express', 'middleware'],
    repository: repo,
    filePath: 'Backend/src/middlewares/validateRequest.ts',
    url: blob('Backend/src/middlewares/validateRequest.ts'),
  },
  {
    title: 'Helmet + xss-clean + hpp: layered HTTP security headers',
    body: `EduScale layers three off-the-shelf middlewares to set the standard hardening baseline. Each one defends a different class of attack:

\`\`\`ts
export const xssProtection = xss();

export const parameterProtection = hpp({
  whitelist: ['sort', 'page', 'limit', 'fields'],
});

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", process.env.API_URL || ''],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: 'same-site' },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});
\`\`\`

What each defends:

- **xss-clean**: strips HTML tags from \`req.body\`, \`req.query\`, \`req.params\` to defang reflected-XSS payloads even before they reach business logic. Cheap insurance.
- **hpp** (HTTP Parameter Pollution): consolidates duplicate query params (\`?id=1&id=2\` becomes \`req.query.id = ['1','2']\` by default; HPP normalises to \`'2'\`). The whitelist preserves params that legitimately repeat (multi-value sort fields).
- **helmet's CSP**: \`objectSrc: 'none'\` blocks Flash/Java embeds; \`frameSrc: 'none'\` + \`frameguard: 'deny'\` makes the site un-iframeable (clickjacking defence). \`hsts: true\` forces HTTPS for a year (default).

The CSP allows \`'unsafe-inline'\` for scripts and styles — that's the trade-off for using inline event handlers and styles in older parts of the React tree. Tightening this requires migrating to nonce/hash-based CSP, which is a bigger refactor.

\`crossOriginResourcePolicy: { policy: 'same-site' }\` blocks images, scripts, etc. from being requested by other origins — defence against the Spectre-class side channels.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['security', 'helmet', 'csp', 'express'],
    repository: repo,
    filePath: 'Backend/src/middlewares/securityMiddleware.ts',
    url: blob('Backend/src/middlewares/securityMiddleware.ts'),
  },
  {
    title: 'Stripping correct_answer from question payload before sending to clients',
    body: `Battle questions are stored in Postgres with their \`correct_answer\` and \`explanation\`. If those fields are sent to the browser, the client can read them out of network responses and auto-answer. EduScale's controller does an explicit projection at the response boundary.

\`\`\`ts
async getBattleQuestions(battleIdOrSlug: string, userId: string) {
  const battleId = await this.resolveId(battleIdOrSlug);
  const battle = await prisma.battle.findUnique({
    where: { id: battleId },
    include: {
      participants: { where: { user_id: userId } },
      questions: { orderBy: { order: 'asc' } },
    },
  });

  if (!battle) throw createAppError('Battle not found', 404);
  if (battle.status !== 'IN_PROGRESS') {
    throw createAppError('Questions are only available during an active battle', 403);
  }
  if (!battle.participants.length) {
    throw createAppError('You are not a participant in this battle', 403);
  }

  // Strip correct_answer and explanation before sending
  return battle.questions.map((q) => {
    const safeQ = { ...q } as Partial<typeof q>;
    delete safeQ.correct_answer;
    delete safeQ.explanation;
    return safeQ;
  });
}
\`\`\`

The pattern that's wrong: \`select\` the fields you DO want. That works until someone adds a new column and forgets to add it to the select — the client suddenly stops seeing it.

The pattern this uses: spread + delete. Adding a new \`question.hint\` column is automatically forwarded; only the explicitly-deleted sensitive fields are stripped. Inverting the default makes "leak" the exception, not the rule.

Where the correct_answer DOES go to the client: in the answer-result payload AFTER they submit. The repository's \`submitAnswer\` returns \`{ is_correct, points_earned, correct_answer, explanation, ... }\` — by then the user has committed to their guess and revealing the correct answer is the post-answer learning experience.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['security', 'data-projection', 'prisma'],
    repository: repo,
    filePath: 'Backend/src/repositories/battleRepository.ts',
    url: blob('Backend/src/repositories/battleRepository.ts'),
  },
  {
    title: 'Speed-bonus scoring: tiered multiplier based on % of time-limit used',
    body: `Battle scoring rewards correct AND fast answers. EduScale uses four tiered multipliers — answering in the first quarter of the time limit gets a 50% bonus; using the full time gets a 25% penalty. Wrong answers always score zero.

\`\`\`ts
/**
 * Speed bonus tiers (based on fraction of time limit used):
 *   ≤25% → +50%   (×1.5)
 *   ≤50% → +25%   (×1.25)
 *   ≤75% →  ±0%   (×1.0)
 *   ≤100% → -25%  (×0.75)
 * Wrong answers always score 0.
 */
export function calculatePoints(
  isCorrect: boolean,
  basePoints: number,
  timeTakenMs: number,
  timeLimitSeconds: number
): number {
  if (!isCorrect) return 0;
  const timeLimitMs = timeLimitSeconds * 1000;
  const fraction = Math.min(timeTakenMs / timeLimitMs, 1);

  let multiplier: number;
  if (fraction <= 0.25) multiplier = 1.5;
  else if (fraction <= 0.5) multiplier = 1.25;
  else if (fraction <= 0.75) multiplier = 1;
  else multiplier = 0.75;

  return Math.floor(basePoints * multiplier);
}
\`\`\`

Three design choices worth defending:

1. \`Math.min(timeTakenMs / timeLimitMs, 1)\` clamps the fraction. Without it, an answer submitted after the timer expired (in the 5s network grace window) would compute a negative multiplier — better to award the worst-tier multiplier than negative points.
2. Tiered multipliers (vs a continuous formula) are intentional. Continuous makes the relationship between effort and reward opaque ("I answered 47ms faster, did I get more points?"). Tiers make it gameable in a good way: players know "answer in the first quarter to maximise bonus."
3. \`Math.floor\` instead of round — points are integers and the floor disincentivises milking the boundary (5.99 points becomes 5, not 6). Tiebreaker rule in \`buildLeaderboard\` is lower avg time wins, so the lost fractions still count indirectly.

The leaderboard uses the same scoring after every submit, so the live battle UI updates rank in real time via the Socket.io \`battle:score_update\` broadcast.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['business-logic', 'scoring', 'gamification'],
    repository: repo,
    filePath: 'Backend/src/repositories/battleRepository.ts',
    url: blob('Backend/src/repositories/battleRepository.ts'),
  },
  {
    title: 'Stale-while-revalidate cache: serve stale immediately, revalidate behind a lock',
    body: `Cache-aside misses cause request latency spikes. Stale-while-revalidate (SWR) avoids the spike: serve the stale value immediately, refresh in the background. A Redis SETNX lock prevents thundering-herd revalidation.

\`\`\`ts
export async function getWithSWR<T>(
  key: string,
  callback: () => Promise<T>,
  options: CacheOptions & { staleTtl?: number } = {}
): Promise<T> {
  const { ttl = 60, staleTtl = 3600 } = options;
  const staleKey = \`stale:\${key}\`;

  // 1. Fresh data → return immediately
  const cached = await getCache<T>(key);
  if (cached) return cached;

  // 2. Stale data → return immediately + revalidate in background
  const stale = await getCache<T>(staleKey);
  if (stale) {
    (async () => {
      const lockKey = \`revalidate:lock:\${key}\`;
      const acquired = await redis.set(lockKey, '1', 'EX', 30, 'NX');
      if (acquired) {
        try {
          const fresh = await callback();
          await setCache(key, fresh, { ttl });
          await setCache(staleKey, fresh, { ttl: staleTtl });
        } catch (error) {
          logger.error('SWR Background Revalidation Error:', error);
        } finally {
          await redis.del(lockKey);
        }
      }
    })().catch();
    return stale;
  }

  // 3. No data → block and fetch
  const fresh = await callback();
  await setCache(key, fresh, { ttl });
  await setCache(staleKey, fresh, { ttl: staleTtl });
  return fresh;
}
\`\`\`

The two TTLs encode the SWR window:

- \`ttl: 60\` — data is "fresh" for 60 seconds. Within this window, no revalidation triggers.
- \`staleTtl: 3600\` — data is "stale but acceptable" up to an hour. During this window, the cached value is served immediately and a background revalidation refreshes it.

The \`SET ... EX 30 NX\` lock is the herd-prevention primitive. NX = "only set if not exists"; if 100 requests all hit a stale key at once, only one wins the SET and runs the revalidation; the other 99 just return the stale value. The 30-second lock TTL is a safety net — if the revalidation crashes, the lock auto-expires and the next request gets to retry.

The fire-and-forget IIFE (\`(async () => {...})().catch()\`) is intentional: the revalidation runs in the background, the request returns immediately. The trailing \`.catch()\` swallows promise rejections so an Express error middleware doesn't fire on a request that already returned 200.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['caching', 'redis', 'swr', 'performance'],
    repository: repo,
    filePath: 'Backend/src/services/cacheService.ts',
    url: blob('Backend/src/services/cacheService.ts'),
  },
  {
    title: 'Cloudinary upload via stream: pipe req.file.buffer into upload_stream',
    body: `Multer holds uploaded files in \`req.file.buffer\` (Buffer in memory). Cloudinary's SDK ships an \`upload_stream\` API; bridging the two requires wrapping the buffer in a Node Readable and piping it through.

\`\`\`ts
const uploadMiddleware = async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const stream = new Readable();
    stream.push(req.file.buffer);
    stream.push(null);                 // signal EOF

    const result = await new Promise((resolve, reject) => {
      stream.pipe(
        cloudinary.uploader.upload_stream((error, result) => {
          if (error) return reject(error);
          resolve(result);
        })
      );
    });

    req.fileUrl = (result as { secure_url: string }).secure_url;
    next();
  } catch (error) {
    logger.error('Cloudinary upload failed', { error });
    res.status(500).json({ error: 'Failed to upload file to Cloudinary' });
  }
};
\`\`\`

Three details:

1. \`stream.push(buffer)\` then \`stream.push(null)\` is the canonical "wrap a buffer as a one-shot stream" pattern. The \`null\` push is what marks the end — without it, upload_stream waits forever for more bytes.
2. Wrapping the callback API in a Promise lets the rest of the function be async/await. The reject path forwards Cloudinary's actual error message so debugging "why did this upload fail" doesn't require digging into the Cloudinary dashboard.
3. The middleware MUST be preceded by \`multer().single('field')\` and ideally a MIME-validation middleware. Multer is what populates \`req.file\`; the file-validation middleware (referenced in the comments) enforces the JPEG/PNG/WebP whitelist + 5MB cap before the upload call. By the time this middleware runs, the file is already trustworthy.

Setting \`req.fileUrl\` lets the next handler (the actual route) just read it from req — the upload is decoupled from the business logic that needs the resulting URL.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['cloudinary', 'multer', 'streams', 'express', 'file-upload'],
    repository: repo,
    filePath: 'Backend/src/middlewares/uploadMiddleware.ts',
    url: blob('Backend/src/middlewares/uploadMiddleware.ts'),
  },
  {
    title: 'Per-server battle timer: setInterval ticks + setTimeout for question timeout',
    body: `Each in-progress battle has a per-question countdown. EduScale runs a \`setInterval\` for the per-second tick broadcasts and a \`setTimeout\` for the question-expiry handler. Both handles are tracked in a per-battle state object so they can be cleared together when the battle ends or a question advances.

\`\`\`ts
async broadcastQuestion(battleId: string, index: number) {
  const state = this.getOrCreateState(battleId);
  if (state.questionTimerInterval) clearInterval(state.questionTimerInterval);
  if (state.questionTimeoutHandle)  clearTimeout(state.questionTimeoutHandle);

  // ... fetch question, emit battle:question event ...

  const now = Date.now();
  const endsAt = now + question.time_limit * 1000;
  state.currentQuestionIndex = index;
  state.questionEndsAt = endsAt;

  // Per-second timer ticks broadcast to the room
  const timerInterval = setInterval(() => {
    const secondsRemaining = Math.ceil((endsAt - Date.now()) / 1000);
    if (secondsRemaining > 0) {
      socketService.emitToRoom(battleId, 'battle:timer_tick', { seconds_remaining: secondsRemaining });
    }
  }, 1000);

  // Auto-advance when time expires (with 500 ms slack)
  const timeoutHandle = setTimeout(async () => {
    clearInterval(timerInterval);
    state.questionTimerInterval = null;
    const done = await battleRepo.checkAllParticipantsDone(battleId);
    if (done) await this.endBattle(battleId);
    else      await this.broadcastQuestion(battleId, index + 1);
  }, question.time_limit * 1000 + 500);

  state.questionTimerInterval = timerInterval;
  state.questionTimeoutHandle = timeoutHandle;
}
\`\`\`

The per-battle state Map is critical for cleanup. Without it, when a battle ends mid-question (everyone answers early), the timeout handle keeps running in the background — it eventually fires and tries to broadcast a question to a dead battle, polluting the logs and racing with the cleanup logic.

The 500 ms slack on the timeout (\`time_limit * 1000 + 500\`) is the network grace period — submissions that arrive in the last 500 ms still get through to scoring. Without it, the timeout could clear the state right as a valid submission lands.

This whole timer is per-Node-instance, NOT distributed. If the server crashes mid-question, the timer is lost. The Redis-backed \`battleState\` and \`questionEndsAt\` (stored in the state object) would let a recovered server pick up where it left off — that's a deliberate gap, not a bug.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['socket.io', 'timers', 'realtime', 'state-management'],
    repository: repo,
    filePath: 'Backend/src/services/battleSocket.ts',
    url: blob('Backend/src/services/battleSocket.ts'),
  },
  {
    title: 'Presence + socket-set tracking in Redis with TTL auto-expiry',
    body: `EduScale needs to know "is user X online?" across multiple Node instances. Storing this in process memory doesn't scale; storing it in Postgres on every connection/disconnect is too chatty. Redis sets with TTLs are the right primitive.

\`\`\`ts
const USER_SOCKETS_KEY = (userId: string) => \`eduscale:sockets:\${userId}\`;
const PRESENCE_KEY = (userId: string) => \`eduscale:presence:\${userId}\`;
const SOCKET_TTL = 24 * 60 * 60;   // 1 day — auto-expire orphaned keys
const PRESENCE_TTL = 35;            // 35 s — client pings every 25 s

this.io.on(SocketEvents.CONNECT, (socket) => {
  const userId = socket.data.user?.id;

  // Track this socket id in the user's set (multiple tabs supported)
  this.pubClient?.sadd(USER_SOCKETS_KEY(userId), socket.id).catch(/* fallback */);
  this.pubClient?.expire(USER_SOCKETS_KEY(userId), SOCKET_TTL).catch(() => {});

  // Mark user online; TTL auto-expires if the client stops pinging.
  this.pubClient?.setex(PRESENCE_KEY(userId), PRESENCE_TTL, '1').catch(() => {});

  // Client should emit 'ping' every ~25 s; each ping renews the TTL.
  socket.on('ping', () => {
    this.pubClient?.setex(PRESENCE_KEY(userId), PRESENCE_TTL, '1').catch(() => {});
    socket.emit('pong');
  });
});
\`\`\`

The two TTLs encode different staleness tolerances:

- **PRESENCE_TTL: 35 s** — if the client misses ONE ping (25 s interval + 10 s grace), they're marked offline. Tight enough that "this user is online" is meaningful; loose enough that one dropped packet doesn't flicker the indicator.
- **SOCKET_TTL: 1 day** — long-tail safety net. If a Node instance crashes without firing the disconnect handler, the user's socket id sits in the set forever. The 1-day TTL evicts these orphans automatically. Day-old data is fine because the same set gets actively pruned on every disconnect under normal operation.

The \`.catch()\` on every Redis call falls back to in-memory Maps. That's the same fail-open pattern used elsewhere — Redis outage degrades to "single-instance presence" instead of "presence broken entirely."

This is also why \`emitToUser\` works correctly across instances: it reads the user's socket-id set from Redis (any instance can see all the user's sockets), then \`io.to(socketId).emit(...)\` is auto-routed to the correct instance by the Socket.io Redis adapter.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['socket.io', 'redis', 'presence', 'ttl'],
    repository: repo,
    filePath: 'Backend/src/services/socket.ts',
    url: blob('Backend/src/services/socket.ts'),
  },
];
