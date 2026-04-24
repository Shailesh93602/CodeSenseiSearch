/**
 * Batch github-007-stripe-payments
 *
 * 20 patterns extracted from Shailesh93602/stripe-payments-demo — a
 * production-grade reference for Stripe webhook idempotency, payment
 * intent retry with exponential backoff, and the Next.js 16 App Router
 * runtime config that keeps Stripe + ioredis off the edge.
 *
 * Authoring rules (see CORPUS-PLAN.md):
 * - Real attribution; no fabricated URLs
 * - 200–400 word body
 * - One topic per entry
 */

import type { SeedItem } from '../types';

const repo = { owner: 'Shailesh93602', name: 'stripe-payments-demo' };

export const BATCH: SeedItem[] = [
  {
    title: 'Stripe webhook idempotency with Redis SETNX',
    body: `Stripe delivers webhooks at-least-once. The same \`payment_intent.succeeded\` can arrive 3-5 times during retries. Without a guard, every delivery triggers your fulfillment code — duplicate emails, duplicate inventory decrements, duplicate database rows.

The fix is a single atomic Redis operation:

\`\`\`ts
const DEDUP_TTL_SECONDS = 86_400; // 24 hours

export async function markEventProcessed(
  redis: Redis,
  eventId: string,
): Promise<IdempotencyStatus> {
  // SET key value NX EX ttl — returns 'OK' on first write, null on duplicate
  const result = await redis.set(
    \`stripe:event:\${eventId}\`,
    "1",
    "EX",
    DEDUP_TTL_SECONDS,
    "NX",
  );
  return result === "OK" ? "new" : "duplicate";
}
\`\`\`

\`SET ... NX\` (set if Not eXists) is atomic at the Redis level — even if two webhook deliveries land at the exact same millisecond on two different Vercel function instances, only ONE call will return "OK". The other gets null and short-circuits to a 200 response without re-running fulfillment.

\`EX 86400\` is a 24-hour TTL. Stripe's full retry window is 7 days, but in practice all delivery retries happen within the first 24 hours — and the TTL keeps the Redis keyspace bounded so old event IDs don't accumulate forever.

The key prefix \`stripe:event:\` namespaces this against other Redis usage (cache, sessions). Using \`event.id\` as the unique part is right because Stripe guarantees \`evt_xxx\` is unique per event across all retries of that event — different retry attempts of the same event share the same ID.

The function returns \`"new" | "duplicate"\` instead of a boolean — gives the call site a self-documenting branch instead of \`if (await markEventProcessed(...)) {}\` which reads ambiguously.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['stripe', 'redis', 'idempotency', 'webhook'],
    repository: repo,
    filePath: 'src/idempotency.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/src/idempotency.ts',
  },
  {
    title: 'Stripe webhook signature verification with raw body',
    body: `Stripe signs webhook payloads with HMAC-SHA256 and sends the signature in the \`Stripe-Signature\` header. Verifying it requires the EXACT bytes Stripe sent — JSON-parsing the body and re-stringifying it would reorder keys and break the HMAC:

\`\`\`ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    const webhookSecret = getWebhookSecret();
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  // ...
}
\`\`\`

\`req.text()\` (NOT \`req.json()\`) preserves the raw bytes. The Stripe SDK's \`constructEvent\` does the HMAC compare internally and either returns the parsed \`Stripe.Event\` or throws.

Three configuration directives matter:
- \`export const runtime = "nodejs"\` — the Stripe Node SDK and ioredis use Node built-ins (\`crypto\`, \`net\`) that don't exist on the edge runtime. Without this, Vercel may try to deploy the route on edge and it'll fail at runtime.
- \`export const dynamic = "force-dynamic"\` — POST routes can't be statically analyzed; this prevents Next.js from attempting to pre-render or cache.
- The 400 response on missing/invalid signature is critical — Stripe interprets non-2xx as "deliver failed, retry" so a bug here means infinite retries until you fix it. A 4xx specifically tells Stripe "don't retry, the request was bad" which is the right semantic for an unauthenticated request.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['stripe', 'webhook', 'hmac', 'next.js', 'security'],
    repository: repo,
    filePath: 'app/api/webhook/route.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/app/api/webhook/route.ts',
  },
  {
    title: 'Exponential backoff retry with jitter — never retry 4xx',
    body: `The retry helper has one rule that every payment integration eventually rediscovers: don't retry 4xx errors:

\`\`\`ts
function defaultIsRetryable(err: unknown): boolean {
  if (err && typeof err === "object" && "statusCode" in err) {
    const code = (err as { statusCode: number }).statusCode;
    return code >= 500;
  }
  // Network/timeout errors have no statusCode
  return true;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = DEFAULT_RETRY_OPTIONS,
  isRetryable: (err: unknown) => boolean = defaultIsRetryable,
): Promise<T> {
  let lastError: Error = new Error("unknown");

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!isRetryable(err)) {
        throw lastError;
      }
      if (attempt < opts.maxAttempts - 1) {
        await sleep(delayFor(attempt, opts));
      }
    }
  }
  throw new RetryExhaustedError(opts.maxAttempts, lastError);
}
\`\`\`

5xx and network errors are transient — Stripe is briefly unhappy or your packets dropped. Retrying with backoff usually succeeds. 4xx is a deterministic client error: a 402 card decline, a 400 invalid amount, a 401 bad API key. Retrying gives you the same error again, just slower, and burns API quota for no benefit.

The retry-budget shape is \`maxAttempts: 4\`, \`baseDelayMs: 200\`, \`maxDelayMs: 5_000\` with 25% jitter. Total worst-case: 200 + 400 + 800 = 1.4s of backoff over 4 attempts (the 4th delay isn't sleep'd because it's the last iteration). Jitter prevents thundering herd: if Stripe just came back from an outage and 1000 of your servers all retry at exactly t+400ms, you instantly DDoS them again.

\`RetryExhaustedError\` carries both the attempt count and the last error so the caller's logger can show "failed after 4 attempts: card_declined" instead of just "card_declined".`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['retry', 'exponential-backoff', 'stripe', 'reliability'],
    repository: repo,
    filePath: 'src/retry.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/src/retry.ts',
  },
  {
    title: 'Stripe payment intent with caller-supplied idempotency key',
    body: `Stripe's API accepts an \`idempotencyKey\` per request — the same key returns the same PaymentIntent for 24 hours, no matter how many times you retry:

\`\`\`ts
export async function createPaymentIntent(
  stripe: Stripe,
  params: CreatePaymentParams,
): Promise<PaymentResult> {
  const intent = await withRetry(
    () =>
      stripe.paymentIntents.create(
        {
          amount: params.amountCents,
          currency: params.currency,
          description: params.description,
          automatic_payment_methods: { enabled: true },
        },
        { idempotencyKey: params.idempotencyKey },
      ),
    DEFAULT_RETRY_OPTIONS,
  );

  return {
    id: intent.id,
    status: intent.status,
    clientSecret: intent.client_secret,
    amount: intent.amount,
    currency: intent.currency,
  };
}
\`\`\`

The crucial design choice: the \`idempotencyKey\` is REQUIRED in the params, not optional. Most payment bugs come from "we'll add idempotency later" — by the time you retrofit it, you've already shipped a double-charge bug.

The idempotency key needs to be stable per logical operation. A UUID generated server-side per HTTP request is WRONG — refresh the page, send another request, get a new key, get a new charge. Right values: \`order:\${orderId}\`, \`subscription:\${subId}:cycle:\${cycleNum}\`, \`refund:\${chargeId}:\${refundReason}\`. The key encodes "this is the same business operation" rather than "this is the same network call."

The retry wrapper is composable here: if Stripe returns 503 or the network drops, \`withRetry\` re-issues the same request — and because it's the same idempotency key, Stripe returns the in-progress or completed PaymentIntent instead of creating a duplicate. The combination is exactly-once payment creation under at-least-once delivery semantics.

\`automatic_payment_methods: { enabled: true }\` lets Stripe decide which payment method types to offer based on the merchant's dashboard config (cards, Apple Pay, Klarna, etc.). The intent surfaces the same set in the client-side Stripe.js modal.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['stripe', 'payment-intent', 'idempotency', 'retry'],
    repository: repo,
    filePath: 'src/payments.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/src/payments.ts',
  },
  {
    title: 'Webhook event dispatch with switch + typed event.data.object',
    body: `Once the signature is verified and the idempotency check passes, the webhook handler dispatches by \`event.type\` with a typed cast for each branch:

\`\`\`ts
switch (event.type) {
  case "payment_intent.succeeded": {
    const intent = event.data.object as Stripe.PaymentIntent;
    console.log(\`[webhook] payment_intent.succeeded id=\${intent.id} amount=\${intent.amount}\`);
    break;
  }
  case "payment_intent.payment_failed": {
    const intent = event.data.object as Stripe.PaymentIntent;
    console.log(\`[webhook] payment_intent.payment_failed id=\${intent.id}\`);
    break;
  }
  case "charge.refunded": {
    const charge = event.data.object as Stripe.Charge;
    console.log(\`[webhook] charge.refunded id=\${charge.id}\`);
    break;
  }
  default:
    console.log(\`[webhook] unhandled event type=\${event.type}\`);
}
\`\`\`

The Stripe Node SDK types \`event.data.object\` as a union of every possible Stripe object — so you have to narrow by event type. The \`as Stripe.PaymentIntent\` cast is safe BECAUSE you're inside the \`payment_intent.succeeded\` branch — Stripe's contract guarantees the object shape.

The \`default\` case is critical and easy to forget. Stripe sends events you didn't subscribe to in the dashboard if your endpoint URL is configured to receive them; new event types are added in API version bumps. A missing default means an unknown event throws or silently no-ops — both worse than logging "unhandled" and returning 200.

ALWAYS return 200 for unhandled events. The mental trap is "we don't care about this event, return 4xx" — Stripe interprets that as a delivery failure and retries it on the same exhaustion schedule (every few minutes for hours, then hourly for days). 200 + log = clean.

The block-scoped \`{ const intent = ... }\` is required so each case can declare its own variable without shadowing. Without the braces, TypeScript flags \`Cannot redeclare block-scoped variable\` on the second case.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['stripe', 'webhook', 'typescript', 'event-dispatch'],
    repository: repo,
    filePath: 'app/api/webhook/route.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/app/api/webhook/route.ts',
  },
  {
    title: 'Lazy Stripe client singleton — don\'t throw at import time',
    body: `The Stripe client is lazily instantiated so a missing env var doesn't break the Next.js build:

\`\`\`ts
let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    stripeClient = new Stripe(key, { apiVersion: "2023-10-16" });
  }
  return stripeClient;
}

export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  return secret;
}
\`\`\`

The doc comment captures the design intent: "We intentionally do NOT throw at import time — the Next.js build imports route modules to collect metadata, and we don't want missing env vars to break a static build."

If you do \`const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)\` at module top level, the \`!\` non-null assertion is technically a lie when the env var isn't set. The error surfaces during \`next build\` because the build process imports every route handler to extract metadata. CI fails. Deploys block. You can't even deploy a fix without first setting a placeholder env var.

The lazy pattern defers the env check to first call — the build still imports the module successfully, and the validation runs only when an actual request comes in. Production serves real requests with real env vars; preview branches that haven't set the env var yet just fail per-request with a clean 500 instead of failing the build.

Pinning \`apiVersion: "2023-10-16"\` is also a discipline — Stripe ships breaking changes in new API versions and the SDK defaults to "latest" which means a Stripe-side version bump can silently change response shapes in your prod app. Pin it, then bump intentionally when you've tested the new version.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['stripe', 'singleton', 'env-vars', 'next.js'],
    repository: repo,
    filePath: 'lib/stripe.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/lib/stripe.ts',
  },
  {
    title: 'ioredis with lazyConnect and bounded retry per request',
    body: `The Redis client wrapper combines lazy connect with per-request retry caps and an error handler that doesn't crash the process:

\`\`\`ts
import Redis from "ioredis";

let redisClient: Redis | null = null;

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    redisClient.on("error", (err) => {
      // Don't crash the process on transient Redis errors
      console.error("[redis] connection error:", err.message);
    });
  }
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
\`\`\`

\`lazyConnect: true\` defers the actual TCP connection until the first command. For Next.js serverless functions on Vercel, every cold start re-runs module init — \`lazyConnect\` means the connection only happens when a route actually needs Redis (the webhook), not on every cold start of every other route.

\`maxRetriesPerRequest: 3\` caps the per-command retry count. Without it, ioredis will retry forever during an outage, blocking your function until the platform timeout (10s on Vercel hobby, 60s on pro). With the cap, a request that can't reach Redis fails in a bounded time and returns a clean 500 — your error tracking sees it, your client sees a real response.

The \`on("error")\` handler logs and moves on. Without it, ioredis emits unhandled \`error\` events which crash the Node process. ioredis has its own reconnection logic — the right behavior is "log this so I can see it in Datadog, then trust the client to recover."

The \`||\` fallback to localhost is for local dev. \`closeRedis\` is for graceful shutdown in tests and signal handlers.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['redis', 'ioredis', 'singleton', 'reliability'],
    repository: repo,
    filePath: 'src/redis.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/src/redis.ts',
  },
  {
    title: 'Express raw body middleware for Stripe webhook',
    body: `When using Express, the webhook route MUST register \`express.raw({ type: 'application/json' })\` BEFORE the global \`express.json()\` middleware:

\`\`\`ts
export function createApp(stripe: Stripe, webhookSecret: string) {
  const app = express();

  app.use(morgan("dev"));

  // Raw body required for Stripe signature verification — must come before json()
  app.post(
    "/webhook",
    express.raw({ type: "application/json" }),
    (req: Request, res: Response) => {
      void handleWebhook(req, res, stripe, webhookSecret);
    },
  );

  app.use(express.json());
  // ... other routes
}
\`\`\`

The order is load-bearing. Express middleware runs in registration order. If \`express.json()\` is registered globally first, it parses every incoming body — including the webhook — and sets \`req.body\` to the parsed object. By the time your webhook handler runs, the raw bytes are gone, replaced by JavaScript objects. Stripe's signature verification then fails because it can only HMAC-compare against the original bytes.

The route-specific \`express.raw({ type: 'application/json' })\` overrides the JSON parser for THIS one route, leaving \`req.body\` as a Buffer. The Stripe SDK's \`constructEvent\` accepts that Buffer, computes the HMAC, and either returns the parsed event or throws.

For all OTHER routes (\`/create-payment-intent\`, \`/health\`, \`/simulate-payment\`), the global \`express.json()\` AFTER the webhook registration means they get convenient \`req.body.amountCents\` access without doing buffer parsing themselves.

This is one of the top three "why isn't my Stripe webhook working" StackOverflow questions. The Next.js App Router version sidesteps it entirely because \`req.text()\` always returns the raw body string regardless of content-type — but the Express version requires this dance.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['stripe', 'express', 'webhook', 'middleware'],
    repository: repo,
    filePath: 'legacy/express-app.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/legacy/express-app.ts',
  },
  {
    title: 'Mocking Stripe webhook signatures in tests with generateTestHeaderString',
    body: `Stripe SDK ships a test helper for generating valid signatures so your test suite doesn't need real Stripe credentials:

\`\`\`ts
function makeSignedPayload(
  stripe: Stripe,
  payload: object,
): { rawBody: string; sig: string } {
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = stripe.webhooks.generateTestHeaderString({
    payload: rawBody,
    secret: WEBHOOK_SECRET,
    timestamp,
  });
  return { rawBody, sig };
}

it("returns 200 and processes a payment_intent.succeeded event", async () => {
  const payload = {
    id: "evt_pi_succeeded",
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_123", amount: 1000, status: "succeeded" } },
  };
  const { rawBody, sig } = makeSignedPayload(stripe, payload);

  const res = await request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .set("stripe-signature", sig)
    .send(rawBody);

  expect(res.status).toBe(200);
});
\`\`\`

\`stripe.webhooks.generateTestHeaderString\` constructs a properly formatted \`Stripe-Signature\` header — \`t=timestamp,v1=hmac\` — using your test webhook secret. The Stripe SDK's \`constructEvent\` accepts it as if it came from real Stripe, so your handler's verification path runs end-to-end in the test.

The pattern lets you test:
- Valid signature → 200
- Missing header → 400
- Bad signature ("bad_sig") → 400
- Stale timestamp (set \`timestamp\` to 10 minutes ago) → 400 (Stripe rejects events outside ±5 min by default)

\`supertest\` (\`request(app).post(...)\`) drives the actual Express app instance with the real raw-body middleware, so the test exercises the whole signature-verification + idempotency-check + dispatch chain. Mocking is targeted at \`markEventProcessed\` (so we don't need a real Redis) and at the dispatch handlers (we just verify they were called) — leaving the security-critical signature math UN-mocked.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['stripe', 'testing', 'jest', 'supertest', 'webhook'],
    repository: repo,
    filePath: 'src/__tests__/webhook.test.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/src/__tests__/webhook.test.ts',
  },
  {
    title: 'Testing retry with fake timers — drain pending timers in a loop',
    body: `Testing exponential-backoff retry without sleeping for real seconds requires Jest's fake timers + a microtask-flushing helper:

\`\`\`ts
jest.useFakeTimers();

async function runWithTimers<T>(fn: () => Promise<T>): Promise<T> {
  const promise = fn();
  let settled = false;
  const result = promise.then(
    (v) => { settled = true; return v; },
    (e) => { settled = true; throw e; },
  );
  while (!settled) {
    await Promise.resolve(); // flush microtasks
    jest.runAllTimers();
    await Promise.resolve();
  }
  return result;
}

it("retries on retryable error and succeeds on 3rd attempt", async () => {
  const serverErr = Object.assign(new Error("server error"), { statusCode: 503 });
  const fn = jest.fn()
    .mockRejectedValueOnce(serverErr)
    .mockRejectedValueOnce(serverErr)
    .mockResolvedValue("recovered");

  const result = await runWithTimers(() =>
    withRetry(fn, { maxAttempts: 4, baseDelayMs: 1, maxDelayMs: 10, jitter: 0 }),
  );
  expect(result).toBe("recovered");
  expect(fn).toHaveBeenCalledTimes(3);
});
\`\`\`

The naive approach \`jest.useFakeTimers(); await withRetry(...); jest.runAllTimers();\` doesn't work — fake timers replace \`setTimeout\` so the retry's \`await sleep(...)\` never resolves on its own. You have to ALTERNATE between \`runAllTimers\` (which fires the setTimeout callbacks) and \`Promise.resolve()\` await (which yields to the microtask queue so the resolved sleep promise can chain into the next iteration of the for-loop).

The \`while (!settled)\` loop runs until the outer promise settles, draining timers each iteration. \`jitter: 0\` in the test config eliminates randomness so the test is deterministic.

The test verifies all the right things: retried twice on 503, succeeded on third attempt, total of 3 \`fn\` calls. Counterpart tests verify "fail fast on 4xx" — same wrapper, with a 402 error, expects exactly 1 call and an immediate throw.

This pattern is reusable for any retry / backoff / debounce code under test.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['testing', 'jest', 'fake-timers', 'retry', 'async'],
    repository: repo,
    filePath: 'src/__tests__/retry.test.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/src/__tests__/retry.test.ts',
  },
  {
    title: 'Idempotency unit test asserts exact Redis SET arguments',
    body: `The idempotency tests verify not just the return value but the EXACT arguments passed to \`redis.set\` — because the SETNX semantics depend on the precise option ordering:

\`\`\`ts
function makeRedisMock(setResult: "OK" | null = "OK", getResult: string | null = null) {
  return {
    set: jest.fn().mockResolvedValue(setResult),
    get: jest.fn().mockResolvedValue(getResult),
  } as unknown as Redis;
}

it('returns "new" on first call (SETNX succeeds)', async () => {
  const redis = makeRedisMock("OK");
  const result = await markEventProcessed(redis, "evt_123");
  expect(result).toBe("new");
  expect(redis.set).toHaveBeenCalledWith(
    "stripe:event:evt_123",
    "1",
    "EX",
    86400,
    "NX",
  );
});

it("sets 24-hour TTL", async () => {
  const redis = makeRedisMock("OK");
  await markEventProcessed(redis, "evt_ttl");
  const call = (redis.set as jest.Mock).mock.calls[0] as unknown[];
  const ttl = call[3] as number;
  expect(ttl).toBe(86400);
});
\`\`\`

The argument-by-argument assertion catches a class of regression that return-value assertions miss: a refactor that swaps \`"NX"\` and \`"EX"\` order, or drops the TTL by accident, would still return "OK" on the mock — but the production behavior would be broken (no TTL means keys live forever and Redis runs out of memory; missing NX means duplicate writes succeed and the dedup is gone).

\`expect(redis.set).toHaveBeenCalledWith(key, value, "EX", ttl, "NX")\` pins down the contract. The TTL test additionally extracts the 4th arg by index and asserts it equals 86400 — a guard against future "let's make TTL configurable" changes accidentally lowering the default below Stripe's retry window.

The \`as unknown as Redis\` double-cast pattern is the standard TS escape hatch for "I'm constructing a partial mock and I don't want to implement the entire Redis interface." Safe in tests because the production code only ever calls the methods you've stubbed.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['testing', 'jest', 'redis', 'idempotency'],
    repository: repo,
    filePath: 'src/__tests__/idempotency.test.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/src/__tests__/idempotency.test.ts',
  },
  {
    title: 'Returning 200 on duplicate webhook delivery',
    body: `When the idempotency guard says "we've seen this event before," the right response is 200 — NOT 4xx — so Stripe stops retrying:

\`\`\`ts
const redis = getRedis();
const status = await markEventProcessed(redis, event.id);
if (status === "duplicate") {
  return NextResponse.json({ received: true, duplicate: true });
}

// ... actual processing
return NextResponse.json({ received: true, eventId: event.id });
\`\`\`

The instinct is "we didn't actually process anything, so this is somehow an error." It isn't. The duplicate is a valid delivery, the work is already done, and from Stripe's perspective the only signal that matters is the HTTP status code. 200 means "ack, done." 4xx means "bad request, here's why" and 5xx means "I'm broken." Either non-2xx triggers Stripe's retry schedule.

The response body \`{ received: true, duplicate: true }\` is for YOUR observability — your log analyzer can count how often duplicates happen. In a healthy system you'll see 1-3% duplicate rate; spikes indicate Stripe is having delivery issues or your handler is timing out and Stripe is re-queueing.

\`{ received: true, eventId: event.id }\` on the success path lets you grep your access logs for "did we get evt_xxx?" by event ID.

This same pattern applies in reverse for new events: if your dispatch logic throws (DB write failed, fulfillment service down), you need to decide carefully — return 5xx (Stripe retries, eventually succeeds) or 200 (Stripe doesn't retry, you've lost the event unless you have your own retry queue). The right answer depends on whether your handler is idempotent in the failure case. The simple/safe choice is "return 5xx, let Stripe retry" — combined with the idempotency guard, retries are cheap.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['stripe', 'webhook', 'idempotency', 'http-status'],
    repository: repo,
    filePath: 'app/api/webhook/route.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/app/api/webhook/route.ts',
  },
  {
    title: 'Demo-only payment endpoint that auto-generates an idempotency key',
    body: `The "simulate-payment" endpoint exists specifically because the strict \`/create-payment-intent\` REQUIRES an idempotency key — and demo UIs don't have a stable order ID to derive one from:

\`\`\`ts
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { amountCents?: number; currency?: string; description?: string } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }

  const { amountCents = 1000, currency = "usd", description = "Demo payment" } = body;

  const idempotencyKey = \`demo-\${Date.now()}-\${Math.random().toString(36).slice(2)}\`;

  try {
    const stripe = getStripe();
    const result = await createPaymentIntent(stripe, {
      amountCents, currency, description, idempotencyKey,
    });
    return NextResponse.json({ ...result, idempotencyKey });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Payment failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
\`\`\`

The split between \`/create-payment-intent\` (strict, demands the key) and \`/simulate-payment\` (lenient, generates one) is the right way to surface API discipline without making the demo unusable.

The generated key \`demo-\${Date.now()}-\${Math.random().toString(36).slice(2)}\` is intentionally NOT idempotent across calls — every click generates a fresh key, every click creates a new PaymentIntent in Stripe. That's correct for a demo (you want to see new payment intents) but would be exactly wrong in production where you want double-clicks to converge on a single charge.

The response \`{ ...result, idempotencyKey }\` echoes the generated key back to the client so the demo UI can show it — useful for "see, if I supplied this same key it would return the same payment intent" pedagogy.

Defaults (\`amountCents = 1000, currency = "usd"\`) make the endpoint usable with an empty body — the curl command in the README is just \`curl -X POST .../api/simulate-payment\`. The \`.catch(() => ({}))\` chained on \`req.json()\` handles the empty-body case without a try/catch wrapper around the parse.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['stripe', 'api-design', 'next.js', 'demo'],
    repository: repo,
    filePath: 'app/api/simulate-payment/route.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/app/api/simulate-payment/route.ts',
  },
  {
    title: 'Backward-compat shim: re-exporting createApp from a moved location',
    body: `When the Express app moved from \`src/app.ts\` to \`legacy/express-app.ts\` during the Next.js port, the original location was kept as a single-line shim:

\`\`\`ts
/**
 * Backward-compat shim for the existing test suite.
 *
 * The Express app has moved to legacy/express-app.ts. Tests keep importing
 * \`../app\` so we re-export from there. Production traffic is now served by
 * the Next.js route handlers in app/api/*.
 */
export { createApp } from "../legacy/express-app";
\`\`\`

Why not just update the test imports? Because the test file count is 5 and each one would need to know whether to import the new path or the old. The shim says "old import path still works, but go look at legacy/express-app.ts for the implementation."

This is the cheapest possible refactor — one line, zero behavioral change, all existing tests keep passing without modification. The price is a tiny indirection that someone reading the test files has to follow once to find the real code.

The doc comment is the load-bearing part. Without it, a future developer sees \`import { createApp } from '../app'\` and assumes that's the production code — leading to bug reports filed against the wrong file. The comment makes it explicit: production traffic is in \`app/api/*\`, this Express factory is for tests + legacy fallback.

The same pattern — keep the old path, redirect to the new location, document the redirect — works for any "moved this thing" refactor where you don't want to do a synchronous mass-update. Eventually you can search-replace the imports and delete the shim. Or you don't, and the shim becomes a permanent piece of the codebase that quietly does its job.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['refactoring', 'backward-compatibility', 'typescript'],
    repository: repo,
    filePath: 'src/app.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/src/app.ts',
  },
  {
    title: 'isEventProcessed: read-only Redis check separate from the SETNX',
    body: `Alongside the marking function there's a read-only check — useful for status endpoints, debug tooling, and tests:

\`\`\`ts
export async function isEventProcessed(
  redis: Redis,
  eventId: string,
): Promise<boolean> {
  const val = await redis.get(\`stripe:event:\${eventId}\`);
  return val !== null;
}
\`\`\`

The split between \`markEventProcessed\` (writes) and \`isEventProcessed\` (reads) matters because they have different semantics:

- **\`markEventProcessed\`** mutates state — the act of calling it counts as "claiming" this event. Even if you don't go on to do anything with the result, the key is now in Redis.
- **\`isEventProcessed\`** is pure read — calling it doesn't change anything. Safe to call from monitoring, debugging tools, "did we already see this event?" status pages.

Mixing them up is a subtle bug. Imagine a "did we process X" check before the mark — \`if (!isEventProcessed(id)) { markEventProcessed(id); doWork(); }\`. Two concurrent webhook deliveries both pass the \`if\`, both call mark (one wins), and both call doWork. The TOCTOU (time-of-check time-of-use) race re-introduces the duplicate processing the SETNX was meant to prevent.

The right pattern: ALWAYS call \`markEventProcessed\` first and switch on its result. The atomicity is in the SET NX — there's no read-then-write window for two callers to slip through.

The \`isEventProcessed\` function is reserved for "give me a status" use cases where the answer doesn't drive a mutation. The unit tests cover both: \`isEventProcessed\` returns false when key absent, true when present, no side effects.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['redis', 'idempotency', 'concurrency', 'race-condition'],
    repository: repo,
    filePath: 'src/idempotency.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/src/idempotency.ts',
  },
  {
    title: 'Validation-first POST handler returns 400 before touching Stripe',
    body: `The \`/create-payment-intent\` route validates input BEFORE calling Stripe — saves an API request and surfaces a useful error message:

\`\`\`ts
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { amountCents?: number; currency?: string; description?: string; idempotencyKey?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { amountCents, currency, description, idempotencyKey } = body;

  if (!amountCents || !currency || !description || !idempotencyKey) {
    return NextResponse.json(
      { error: "amountCents, currency, description, idempotencyKey are required" },
      { status: 400 },
    );
  }

  try {
    const stripe = getStripe();
    const result = await createPaymentIntent(stripe, { amountCents, currency, description, idempotencyKey });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Payment failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
\`\`\`

Two validation layers:
1. **JSON parse** — a malformed body returns 400 with "invalid JSON body" instead of crashing the handler. \`NextRequest.json()\` throws on bad JSON; the try/catch translates that to a clean 4xx.
2. **Required fields** — all four params are checked before the Stripe call. Without this, missing \`amountCents\` would propagate to Stripe as \`amount: undefined\`, Stripe would return a 400 with "amount must be a positive integer", you'd waste an API request, and the error message your client sees would be a surprise.

The 500 catch wraps everything else — network failures, Stripe outages, retry exhaustion — and surfaces \`err.message\` to the client. In production you'd want to be more careful (don't leak internal stack traces) but for a demo with named errors (\`RetryExhaustedError\` etc.) the messages are user-safe.

\`!amountCents\` catches both \`undefined\` and \`0\` as falsy — \`amount: 0\` is a real Stripe error anyway (must be ≥ 50 cents for USD card processing) so rejecting at the API boundary is fine.

The validation discipline scales — for more complex payloads you'd swap the inline checks for Zod or a similar schema validator that gives you a typed object PLUS structured error messages.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['validation', 'next.js', 'api-design', 'error-handling'],
    repository: repo,
    filePath: 'app/api/create-payment-intent/route.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/app/api/create-payment-intent/route.ts',
  },
  {
    title: 'Test that does NOT retry on 4xx — single-call assertion',
    body: `The "don't retry 4xx" rule is enforced not just in code but in the test suite, with an assertion that the underlying function was called EXACTLY ONCE:

\`\`\`ts
it("does NOT retry on 402 card declined error", async () => {
  const cardErr = Object.assign(new Error("card declined"), { statusCode: 402 });
  const stripe = {
    paymentIntents: {
      create: jest.fn().mockRejectedValue(cardErr),
    },
  } as unknown as Stripe;

  await expect(
    createPaymentIntent(stripe, {
      amountCents: 1000,
      currency: "usd",
      description: "Declined",
      idempotencyKey: "decline_key",
    }),
  ).rejects.toThrow("card declined");

  expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
});
\`\`\`

The assertion that distinguishes "doesn't retry" from "happens to fail and the test passes" is \`toHaveBeenCalledTimes(1)\`. Without it, a regression that accidentally re-enabled retry on 4xx would still throw the same "card declined" error after 4 attempts — the \`rejects.toThrow\` would pass — but \`paymentIntents.create\` would have been called 4 times.

The mock builds a Stripe-shaped error with \`Object.assign(new Error("..."), { statusCode: 402 })\`. The Stripe SDK's real errors have \`statusCode\` as a property; mimicking that shape is what makes the \`defaultIsRetryable\` predicate take the "don't retry" branch in the same way it would in production.

The companion test for 5xx confirms the opposite — \`expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(2)\` after one rejection then a success means "retried once, succeeded on second attempt."

Together the two tests pin down the exact semantics: 5xx and network errors retry, 4xx fails immediately. If someone changes \`defaultIsRetryable\` in a way that breaks either rule, ONE of these tests will fail. Tight test coverage on the retry boundary is what makes the rest of the integration trustworthy.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['testing', 'jest', 'retry', 'stripe'],
    repository: repo,
    filePath: 'src/__tests__/payments.test.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/src/__tests__/payments.test.ts',
  },
  {
    title: 'Type-shape result instead of leaking Stripe.PaymentIntent',
    body: `The \`createPaymentIntent\` helper returns a normalized \`PaymentResult\` shape instead of the raw Stripe SDK type:

\`\`\`ts
export interface PaymentResult {
  id: string;
  status: Stripe.PaymentIntent.Status;
  clientSecret: string | null;
  amount: number;
  currency: string;
}

// Inside createPaymentIntent:
return {
  id: intent.id,
  status: intent.status,
  clientSecret: intent.client_secret,
  amount: intent.amount,
  currency: intent.currency,
};
\`\`\`

The Stripe \`PaymentIntent\` type has 50+ fields including ones you rarely want to expose to your callers (\`client_secret\` you do, \`metadata\` maybe, but \`canceled_at\`, \`source\`, \`charges\`, \`livemode\`, \`object: "payment_intent"\` — those are noise).

The handcrafted shape is the API contract. Callers get a stable typed object — if Stripe adds new fields in a future API version, your callers don't get surprised by them. If you eventually swap Stripe for another provider (or for a multi-provider abstraction), the same \`PaymentResult\` shape can be returned from the new path with no caller changes.

\`status: Stripe.PaymentIntent.Status\` reuses the SDK's union type — \`"requires_payment_method" | "requires_confirmation" | "succeeded" | ...\` — so callers can switch on it with full type safety. That's a deliberate borrowing: status enum values ARE the contract because they drive UI state, but the rest of the PaymentIntent shape is implementation detail.

\`clientSecret: string | null\` — \`client_secret\` can legitimately be null (e.g. for off-session payments). The translation from snake_case to camelCase normalizes the API to JS conventions.

The pattern: every external SDK should be wrapped at the boundary. Your code talks to your own types; the wrapper code translates to and from the SDK. Saves you from the world where every \`route.ts\` imports \`Stripe\` directly.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['typescript', 'api-design', 'stripe', 'abstraction'],
    repository: repo,
    filePath: 'src/payments.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/src/payments.ts',
  },
  {
    title: 'Express bootstrap with strict env validation and explicit exit',
    body: `The legacy Express server entrypoint validates required env vars and exits with a non-zero code if anything is missing:

\`\`\`ts
import "dotenv/config";
import Stripe from "stripe";
import { createApp } from "./express-app";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const port = parseInt(process.env.PORT || "3002", 10);

if (!stripeSecretKey) {
  console.error("STRIPE_SECRET_KEY is required");
  process.exit(1);
}
if (!webhookSecret) {
  console.error("STRIPE_WEBHOOK_SECRET is required");
  process.exit(1);
}

const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
const app = createApp(stripe, webhookSecret);

app.listen(port, () => {
  console.log(\`stripe-payments-demo running on http://localhost:\${port}\`);
});
\`\`\`

The fail-fast pattern is correct for long-running servers (Railway, Fly, Docker) where the process supervisor will see the non-zero exit code, mark the container as failed, and surface the error in deploy logs. \`process.exit(1)\` flushes stdout/stderr first so the "STRIPE_SECRET_KEY is required" message actually makes it to the log aggregator.

This is the OPPOSITE of the lazy-instantiation pattern in the Next.js version — and that's intentional. Next.js routes are ephemeral serverless functions where each invocation can succeed or fail independently; missing env vars there should fail per-request. Long-running Express processes should never start at all if config is bad — every request would fail the same way and you'd be wasting health-check cycles.

\`import "dotenv/config"\` (the side-effect import form) loads \`.env.local\` automatically — same convention as create-react-app and Next.js. \`PORT || "3002"\` falls back if PORT is undefined; the explicit radix in \`parseInt(..., 10)\` defends against the historic octal-leading-zero bug.

After validation, \`stripeSecretKey\` is narrowed from \`string | undefined\` to \`string\` because TypeScript's control-flow analysis sees the early \`process.exit\` — no \`!\` non-null assertion needed.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['express', 'env-vars', 'bootstrap', 'node.js'],
    repository: repo,
    filePath: 'legacy/express-server.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/legacy/express-server.ts',
  },
  {
    title: 'Jest config: 80% coverage threshold + selective exclude list',
    body: `The Jest config encodes both the coverage discipline AND the precise list of files that don't need to be in the metric:

\`\`\`ts
import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["**/src/__tests__/**/*.test.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "legacy/**/*.ts",
    "!src/app.ts",
    "!src/express-for-tests.ts",
    "!legacy/express-server.ts",
  ],
  coverageThreshold: {
    global: { statements: 80, lines: 80, functions: 80, branches: 70 },
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
};

export default config;
\`\`\`

The exclude list is the interesting bit — it documents which files are intentionally NOT covered:
- \`src/app.ts\` — the one-line backward-compat shim. No logic to test.
- \`src/express-for-tests.ts\` — a test utility, not production code.
- \`legacy/express-server.ts\` — the bootstrap that calls \`app.listen()\`. Testing it requires actually starting a server, and \`createApp\` is already covered by supertest tests.

Listing the exclusions explicitly (vs. silently omitting them) means future contributors see the intentional choice. Adding a new file to \`src/\` automatically requires it to hit 80% — no \`!\`-prefix means the coverage gate enforces the discipline.

Branches at 70% (vs 80% for the others) acknowledges that catch-all error branches are hard to hit in tests without elaborate fault injection. 70% is a working compromise.

\`tsconfig: "tsconfig.test.json"\` lets the tests use looser type-checking than production code (e.g. allowing \`as unknown as Redis\` mocks without strict checks). The split tsconfig is a common pattern for projects that want \`strict: true\` in prod but pragmatic mocking in tests.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['jest', 'testing', 'coverage', 'typescript'],
    repository: repo,
    filePath: 'jest.config.ts',
    url: 'https://github.com/Shailesh93602/stripe-payments-demo/blob/main/jest.config.ts',
  },
];
