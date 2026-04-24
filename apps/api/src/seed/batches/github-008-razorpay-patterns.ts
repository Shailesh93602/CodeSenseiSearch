/**
 * Batch github-008-razorpay-patterns
 *
 * 20 patterns extracted from Shailesh93602/razorpay-patterns-demo — the
 * India-accessible mirror of stripe-payments-demo. Razorpay's signing
 * scheme differs from Stripe's (raw HMAC-SHA256, no timestamp envelope)
 * and the event ID has to be derived from the entity payload — these
 * patterns capture both the "same as Stripe" and the "different from
 * Stripe" pieces of a production Razorpay integration.
 *
 * Authoring rules (see CORPUS-PLAN.md):
 * - Real attribution; no fabricated URLs
 * - 200–400 word body
 * - One topic per entry
 */

import type { SeedItem } from '../types';

const repo = { owner: 'Shailesh93602', name: 'razorpay-patterns-demo' };

export const BATCH: SeedItem[] = [
  {
    title: 'Razorpay webhook signature verification with constant-time HMAC compare',
    body: `Razorpay signs the raw request body with HMAC-SHA256 using your webhook secret. The expected signature arrives in the \`X-Razorpay-Signature\` header. Verification uses \`crypto.timingSafeEqual\` to avoid leaking timing information:

\`\`\`ts
export function verifyWebhookSignature(
  rawBody: string,
  headerSignature: string,
  secret: string = getWebhookSecret()
): boolean {
  if (!headerSignature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  // constant-time comparison — short-circuits would leak timing information
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(headerSignature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
\`\`\`

Unlike Stripe, which has a structured \`Stripe-Signature: t=timestamp,v1=hexhash\` header and an SDK-provided \`constructEvent\` helper, Razorpay sends a plain hex string and you hand-roll the HMAC. The math is the same (SHA-256, secret as key, body as payload, hex output) but you own the comparison.

\`crypto.timingSafeEqual\` is the security-critical detail. The naive \`expected === headerSignature\` short-circuits at the first character mismatch — an attacker can guess byte-by-byte by measuring how long the response takes (longer = more matching prefix). \`timingSafeEqual\` always compares all bytes regardless of where they differ, eliminating the timing channel.

The function MUST check buffer lengths before \`timingSafeEqual\` because the function throws if the lengths differ. The length check is itself constant-time (it's just a property read) so this doesn't reintroduce a timing leak.

\`Buffer.from(headerSignature)\` accepts an attacker-controlled string of any length — the explicit length comparison (vs trying to convert to fixed-width) is the safe pattern.

If \`headerSignature\` is empty/null, return false immediately. Don't compute the expected HMAC against nothing — that's wasted work and a more useful error path.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['razorpay', 'hmac', 'security', 'webhook', 'timing-attack'],
    repository: repo,
    filePath: 'lib/razorpay.ts',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/lib/razorpay.ts',
  },
  {
    title: 'extractEventId: derive a stable idempotency key from Razorpay payload',
    body: `Razorpay doesn't ship a top-level \`event.id\` the way Stripe does — you have to dig into \`payload.{entityType}.entity.id\` to find a stable identifier:

\`\`\`ts
export function extractEventId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "unknown";
  const body = payload as Record<string, unknown>;
  const container = body.payload as Record<string, unknown> | undefined;
  if (!container) return "unknown";

  const paymentEntity = (container.payment as { entity?: { id?: string } } | undefined)?.entity;
  if (paymentEntity?.id) return \`payment:\${paymentEntity.id}\`;

  const orderEntity = (container.order as { entity?: { id?: string } } | undefined)?.entity;
  if (orderEntity?.id) return \`order:\${orderEntity.id}\`;

  const subscriptionEntity = (container.subscription as { entity?: { id?: string } } | undefined)?.entity;
  if (subscriptionEntity?.id) return \`subscription:\${subscriptionEntity.id}\`;

  const refundEntity = (container.refund as { entity?: { id?: string } } | undefined)?.entity;
  if (refundEntity?.id) return \`refund:\${refundEntity.id}\`;

  return "unknown";
}
\`\`\`

The Razorpay event payload looks like \`{ event: "payment.captured", payload: { payment: { entity: { id: "pay_abc" } } } }\`. The entity ID is the unique part — same payment, same ID, even if Razorpay retries the webhook 5 times.

Priority ordering matters: a single event can have multiple entities (an \`order.paid\` event includes both the payment AND the order). Preferring \`payment\` over \`order\` is right because the payment ID is the most specific business event — same order can have multiple payment attempts (e.g. card decline then UPI retry), and you want each attempt deduped separately.

Returning \`"unknown"\` instead of throwing keeps the webhook handler resilient to malformed events. With a known prefix on every real ID (\`payment:\`, \`order:\`), \`unknown\` events still get a SETNX key — they're treated as a single deduped slot per process restart, which is conservative but safe.

The deeply nested optional chains (\`(container.payment as ...)?.entity\`) handle the reality that any field in the payload could be undefined. The double-cast pattern keeps TypeScript happy without imposing a strict schema for a body that's externally controlled.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['razorpay', 'webhook', 'idempotency', 'typescript'],
    repository: repo,
    filePath: 'lib/razorpay.ts',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/lib/razorpay.ts',
  },
  {
    title: 'Razorpay client-callback signature: HMAC of order_id|payment_id with KEY_SECRET',
    body: `When the customer completes payment in the Razorpay Checkout.js modal, the success handler receives \`razorpay_order_id\`, \`razorpay_payment_id\`, and \`razorpay_signature\`. The server verifies that signature against the merchant's KEY_SECRET (NOT the webhook secret):

\`\`\`ts
const payload = \`\${razorpay_order_id}|\${razorpay_payment_id}\`;
const expectedSignature = crypto
  .createHmac("sha256", keySecret)
  .update(payload)
  .digest("hex");

const expectedBuf = Buffer.from(expectedSignature);
const actualBuf = Buffer.from(razorpay_signature);

if (expectedBuf.length !== actualBuf.length) {
  return NextResponse.json(
    { ok: false, error: "Signature length mismatch" },
    { status: 400 }
  );
}

const valid = crypto.timingSafeEqual(expectedBuf, actualBuf);
\`\`\`

Three critical details in the algorithm:

1. **The pipe character** — the payload is \`\${order_id}|\${payment_id}\`, not concatenated without a separator. The unit test \`__tests__/verify-payment.test.ts\` literally has a case "separator matters — order_id + payment_id WITHOUT the pipe fails" to lock this in.

2. **KEY_SECRET, not webhook secret** — the route handler uses \`process.env.RAZORPAY_KEY_SECRET\` here, NOT \`RAZORPAY_WEBHOOK_SECRET\`. The two secrets are separate; webhooks are signed with the webhook secret, client-callback responses are signed with the API key secret. Mixing them produces a "signature mismatch" that's frustrating to debug.

3. **Two trust boundaries** — the client-callback signature proves "the frontend response wasn't forged or replayed." The webhook signature proves "this notification really came from Razorpay." A production integration uses BOTH: frontend shows "payment successful" after verify-payment returns 200, but billing state only flips to "paid" when the webhook fires (webhook is the authoritative source of truth, frontend is UX feedback).

The route returns 200 on verified callback but the doc comment is explicit: "DO NOT mark as paid here; wait for the webhook at /api/webhook to fire." That separation is what makes the integration robust against client-side tampering.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['razorpay', 'hmac', 'security', 'checkout', 'verification'],
    repository: repo,
    filePath: 'app/api/verify-payment/route.ts',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/app/api/verify-payment/route.ts',
  },
  {
    title: 'Razorpay order creation with auto-generated 40-char receipt',
    body: `Razorpay's \`receipt\` field on order creation is the caller-supplied idempotency key — and Razorpay caps it at 40 characters:

\`\`\`ts
const { amount, currency = "INR", notes } = body;
// Razorpay caps receipt at 40 chars. \`rcpt_\${randomUUID()}\` = 41 chars
// because UUIDv4 is 36. Drop the dashes → 32-char hex + 5-char prefix = 37.
const receipt = body.receipt ?? \`rcpt_\${randomUUID().replace(/-/g, "")}\`;

if (typeof amount !== "number" || !Number.isFinite(amount)) {
  return NextResponse.json(
    { error: "amount is required (integer paise, minimum 100)" },
    { status: 400 }
  );
}
if (amount < 100) {
  return NextResponse.json(
    { error: "amount must be at least 100 paise (₹1)" },
    { status: 400 }
  );
}
if (!Number.isInteger(amount)) {
  return NextResponse.json(
    { error: "amount must be an integer (paise). For ₹1 send 100." },
    { status: 400 }
  );
}
\`\`\`

The comment captures the exact arithmetic: \`rcpt_\${randomUUID()}\` would be 41 chars (5 prefix + 36 UUID-with-dashes), one over Razorpay's limit. \`replace(/-/g, "")\` drops the four dashes, getting back to 37 chars — comfortably under 40 with room for a longer prefix later.

Auto-generating a receipt when the caller doesn't supply one prevents client-side double-clicks from creating two orders with the same amount — Razorpay rejects duplicate receipts, so a second create-order with the same receipt fails fast at the API instead of silently making a duplicate order.

The amount validation enforces three things in order:
1. Type check — must be a number, not a string or undefined
2. Minimum check — Razorpay rejects amounts below 100 paise (₹1) with a 400, so we surface that ourselves with a clearer message
3. Integer check — amount is paise (INR's hundredths). \`1.5\` paise doesn't exist; the API will reject \`100.5\` and we surface a useful error instead.

Each validation returns 400 with a specific message — saves API requests AND gives the client a useful error vs. having to parse Razorpay's raw 400 response.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['razorpay', 'order-creation', 'validation', 'idempotency'],
    repository: repo,
    filePath: 'app/api/create-order/route.ts',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/app/api/create-order/route.ts',
  },
  {
    title: 'Razorpay error parsing: surface description + code, not "Unknown error"',
    body: `The Razorpay Node SDK throws errors with a specific shape — \`statusCode\` at the top level, \`error\` nested with \`code\`, \`description\`, \`source\`, \`step\`, \`reason\`. The route handler unpacks all of it before returning:

\`\`\`ts
} catch (error) {
  const rzpErr = (error ?? {}) as {
    statusCode?: number;
    status?: number;
    message?: string;
    error?: { code?: string; description?: string; source?: string; step?: string; reason?: string };
  };
  const statusCode = rzpErr.statusCode ?? rzpErr.status;
  const description = rzpErr.error?.description;
  const code = rzpErr.error?.code;
  const message =
    description ?? rzpErr.message ?? (error instanceof Error ? error.message : null) ?? "Unknown error";

  console.error("Razorpay order.create failed:", {
    statusCode, code, description,
    reason: rzpErr.error?.reason, step: rzpErr.error?.step, source: rzpErr.error?.source,
  });

  if (statusCode === 401) {
    return NextResponse.json(
      { error: "Razorpay authentication failed. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET." },
      { status: 401 }
    );
  }
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return NextResponse.json({ error: message, code }, { status: statusCode });
  }
  return NextResponse.json({ error: \`Failed to create order: \${message}\` }, { status: 500 });
}
\`\`\`

The bug this fixes: the Razorpay SDK's thrown errors often have \`message: undefined\`, so the obvious \`error.message\` evaluates to undefined and the older "Unknown error" path was firing for nearly every real error. Useless for debugging.

The fallback chain — \`description ?? rzpErr.message ?? error.message ?? "Unknown error"\` — tries the most-specific source first. \`description\` is the human-readable message Razorpay actually wants you to surface. The 401 special case names the env vars to check, which is way more useful than "401 Unauthorized."

Bubbling 4xx with the original status code (vs. flattening to 500) lets the client distinguish "your request was wrong, fix it" (400 with description) from "Razorpay is down, try again" (500). That's the difference between a useful error UI and a generic "something went wrong."

Logging all the Razorpay error fields (\`code\`, \`description\`, \`reason\`, \`step\`, \`source\`) lets you build dashboards on common failure modes — e.g. "12% of card failures are AUTHENTICATION_FAILED at the auth step" tells you something specific about your cardholder population.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['razorpay', 'error-handling', 'api-design', 'debugging'],
    repository: repo,
    filePath: 'app/api/create-order/route.ts',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/app/api/create-order/route.ts',
  },
  {
    title: 'In-memory idempotency fallback when REDIS_URL is absent',
    body: `The idempotency module gracefully degrades to a per-process Map when no Redis URL is configured — so the demo deploys to Vercel free tier without an Upstash add-on:

\`\`\`ts
let redis: Redis | null = null;
const memoryStore = new Map<string, number>();

function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!redis) {
    redis = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
  }
  return redis;
}

function memoryClaim(fullKey: string, ttlSeconds: number): boolean {
  const now = Date.now();
  const expiresAt = memoryStore.get(fullKey);
  if (expiresAt && expiresAt > now) return false;
  memoryStore.set(fullKey, now + ttlSeconds * 1000);
  if (memoryStore.size > 1024) {
    for (const [k, exp] of memoryStore) {
      if (exp <= now) memoryStore.delete(k);
    }
  }
  return true;
}

export async function claimEvent(key: string, ttlSeconds: number = IDEMPOTENCY_TTL_SECONDS): Promise<boolean> {
  const fullKey = \`razorpay:\${key}\`;
  const client = getRedis();
  if (!client) return memoryClaim(fullKey, ttlSeconds);
  const result = await client.set(fullKey, "1", "EX", ttlSeconds, "NX");
  return result === "OK";
}
\`\`\`

The doc comment is explicit about the tradeoff: "The in-memory fallback is per-function-instance and NOT safe for multi-region or high-scale production — real integrations (KhataGO, EduScale) must set REDIS_URL."

Why this fallback exists at all: a Vercel preview deploy of the demo without Redis env vars would otherwise crash on every webhook. The fallback lets the demo work for a single session — if you fire two webhook deliveries within 24 hours and they happen to land on the SAME warm Lambda, dedup works. If they land on different Lambdas, both run. For a demo that's fine; for production it's broken.

The opportunistic GC (\`if (memoryStore.size > 1024)\`) prevents unbounded memory growth — when the Map crosses a threshold, walk it once and delete expired entries. Linear cost amortized over many writes.

The \`__resetMemoryStoreForTests\` export (visible in the full file) is the only "test API" — production code never calls it but unit tests need a way to clear state between cases.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['idempotency', 'redis', 'fallback', 'graceful-degradation'],
    repository: repo,
    filePath: 'lib/idempotency.ts',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/lib/idempotency.ts',
  },
  {
    title: 'Razorpay webhook handler: read raw body, JSON.parse separately',
    body: `The webhook handler reads the raw body bytes for HMAC verification, THEN JSON.parses it for entity extraction — two separate steps:

\`\`\`ts
export async function POST(request: Request) {
  const headerSig = request.headers.get("x-razorpay-signature");
  if (!headerSig) {
    return NextResponse.json({ error: "Missing X-Razorpay-Signature header" }, { status: 400 });
  }

  const rawBody = await request.text();

  let signatureValid = false;
  try {
    signatureValid = verifyWebhookSignature(rawBody, headerSig);
  } catch (err) {
    console.error("Webhook signature verification error:", err);
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  if (!signatureValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventId = extractEventId(payload);
  // ...
}
\`\`\`

The order is load-bearing:
1. **\`request.text()\` first** — preserves the exact bytes Razorpay signed. Using \`request.json()\` would JSON-parse and re-stringify (with possibly-reordered keys), breaking the HMAC.
2. **Verify signature** — reject 400 BEFORE any business logic runs. This is a security boundary; bad signatures don't get to the dispatcher.
3. **Then \`JSON.parse(rawBody)\`** — now safe to interpret the body as JSON for extracting the entity ID. If the body is invalid JSON despite a valid signature (would be weird; Razorpay always sends valid JSON), return 400.

The 500 on "webhook secret not configured" is correct — that's a server config error, not a client error. Razorpay sees a 5xx and retries, which is right because once you fix the env var the next retry will succeed.

The Next.js runtime handles raw body retrieval transparently with \`request.text()\` — no need for the Express raw-body middleware dance. This is one place where the App Router actually simplifies the integration vs Express.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['razorpay', 'webhook', 'next.js', 'security'],
    repository: repo,
    filePath: 'app/api/webhook/route.ts',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/app/api/webhook/route.ts',
  },
  {
    title: 'Webhook dispatch table: switch with explicit fallthrough for similar events',
    body: `The webhook dispatcher uses a switch with grouped cases that fall through for events that share handling:

\`\`\`ts
async function dispatch(eventType: string, payload: Record<string, unknown>) {
  switch (eventType) {
    case "payment.captured":
    case "order.paid":
    case "subscription.activated":
    case "subscription.charged":
    case "payment.failed":
    case "refund.processed":
      console.log(\`Razorpay event \${eventType} processed\`, {
        hasPayload: Boolean(payload),
      });
      return;
    default:
      console.log(\`Razorpay event \${eventType} received (no-op)\`, {
        hasPayload: Boolean(payload),
      });
  }
}
\`\`\`

The fallthrough pattern \`case A: case B: case C: { sharedLogic(); return; }\` is explicit grouping — these six events all go through the same code path. In production those would be six separate \`Prisma.payment.update\` / \`Prisma.subscription.activate\` calls, but the demo just logs.

The \`return\` after the shared logic is the modern style (vs. \`break\`) — guarantees no accidental fallthrough into the default case if you later add more cases. ESLint's \`no-fallthrough\` rule is satisfied because falling through INTO a case with no body is the documented "intentional grouping" exception, while falling through OUT of a case body is the bug it's there to catch.

The default case is critical — Razorpay can send events you didn't subscribe to (a webhook URL configured to "all events" is one dashboard click away). Defaulting to a no-op log instead of throwing or silently ignoring lets you SEE which events are arriving in production. From there you decide whether to add a real handler or remove the subscription in the dashboard.

The \`hasPayload: Boolean(payload)\` field in the log is sanity instrumentation — if you ever see \`hasPayload: false\` in your logs, the JSON.parse path failed silently and you have a deeper bug to investigate.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['razorpay', 'webhook', 'event-dispatch', 'switch'],
    repository: repo,
    filePath: 'app/api/webhook/route.ts',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/app/api/webhook/route.ts',
  },
  {
    title: 'Exponential backoff retry: shouldRetry with status overload',
    body: `The Razorpay retry helper supports both \`statusCode\` and \`status\` as the error shape — different SDKs use different field names:

\`\`\`ts
export function defaultShouldRetry(error: unknown): boolean {
  if (!error || typeof error !== "object") return true; // assume transient
  const status = (error as { statusCode?: number; status?: number }).statusCode
    ?? (error as { statusCode?: number; status?: number }).status;

  // No statusCode → network / connection error → retry.
  if (status === undefined) return true;

  // 4xx → client error → don't retry.
  if (status >= 400 && status < 500) return false;

  // 5xx → server error / rate-limited → retry.
  return status >= 500;
}
\`\`\`

The \`statusCode ?? status\` chain handles both Razorpay-SDK errors (which use \`statusCode\`) and generic fetch errors (which use \`status\`). One predicate, two error shapes.

The "fail open" default for unknown error shapes (\`return true\`) is the right call for transient errors — \`new Error("ECONNRESET")\` has neither \`statusCode\` nor \`status\` and SHOULD be retried. The unit test "retries on unknown error shapes (fails open)" pins this down.

The retry rule itself is identical to the Stripe demo's: 4xx → fail fast (deterministic, retry won't help), 5xx → retry (transient). The doc comment in the file explains: "Razorpay returns 400 for invalid signatures, bad request shapes, declined cards, etc. Retrying would just burn capacity and repeatedly trigger the same exact error."

\`statusCode === undefined\` (network error) MUST come BEFORE the 4xx check — otherwise \`undefined >= 400\` evaluates to false (NaN comparison) and you'd accidentally fall into the "5xx" branch returning true. The explicit early return makes the logic resilient.

\`maxAttempts: 4, baseDelayMs: 200, maxDelayMs: 4000, jitterRatio: 0.25\` — same shape as the Stripe demo because the same reasoning transfers. Total worst-case backoff: ~1.4s before final failure.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['retry', 'razorpay', 'exponential-backoff', 'error-handling'],
    repository: repo,
    filePath: 'lib/retry.ts',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/lib/retry.ts',
  },
  {
    title: 'Razorpay Checkout.js script loader: idempotent, with prefetch',
    body: `The frontend demo loads Razorpay's Checkout.js dynamically and prefetches it on mount so the modal opens instantly when the user clicks Pay:

\`\`\`tsx
function loadCheckoutScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function DemoClient({ razorpayKeyId }: { razorpayKeyId: string }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    // Prefetch the script so the modal opens instantly when user clicks Pay
    void loadCheckoutScript();
  }, []);
  // ...
}
\`\`\`

Three correctness details:

1. **SSR guard** — \`typeof window === "undefined"\` returns false during Next.js server rendering. The loader is only meaningful in the browser; the server should not try to inject script tags.

2. **Idempotent re-load** — \`if (window.Razorpay) resolve(true)\` short-circuits if Checkout.js is already loaded. Calling \`loadCheckoutScript()\` multiple times (the prefetch in useEffect, then the actual call inside \`handlePay\`) doesn't inject the script twice.

3. **Prefetch on mount** — the \`useEffect(() => { void loadCheckoutScript(); }, [])\` fires once at mount, downloading and parsing Checkout.js while the user is still reading the page. By the time they click Pay, \`window.Razorpay\` is already populated and the modal opens with zero perceived latency.

\`script.onerror = () => resolve(false)\` covers the case where Razorpay's CDN is unreachable (corporate network blocks, ad blockers). The handler then surfaces "Failed to load Razorpay Checkout.js script" so the user sees a real message instead of a frozen UI.

\`void loadCheckoutScript()\` — the \`void\` is just to tell ESLint "I'm intentionally not awaiting this in useEffect." The promise resolves whenever it does; we don't care.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['razorpay', 'checkout', 'react', 'script-loading', 'next.js'],
    repository: repo,
    filePath: 'app/demo/DemoClient.tsx',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/app/demo/DemoClient.tsx',
  },
  {
    title: 'Discriminated union for payment flow status — every state explicit',
    body: `The Razorpay demo client uses a discriminated union to model the entire payment flow — every state is one of N named kinds with the data it carries:

\`\`\`tsx
type Status =
  | { kind: "idle" }
  | { kind: "loading-script" }
  | { kind: "creating-order" }
  | { kind: "opening-modal"; orderId: string }
  | { kind: "verifying"; paymentId: string }
  | { kind: "verified"; paymentId: string; orderId: string }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

function StatusLine({ status }: { status: Status }) {
  switch (status.kind) {
    case "idle": return <span>Ready. Click Pay to start.</span>;
    case "loading-script": return <span>Loading Razorpay Checkout.js…</span>;
    case "creating-order": return <span>Creating order on the server…</span>;
    case "opening-modal":
      return <span>Opened modal for order <code>{status.orderId}</code></span>;
    case "verifying":
      return <span>Verifying payment <code>{status.paymentId}</code> on the server…</span>;
    case "verified":
      return <span style={{ color: "#86efac" }}>✓ Verified payment <code>{status.paymentId}</code> on order <code>{status.orderId}</code></span>;
    case "cancelled": return <span>Modal dismissed — no payment made.</span>;
    case "error": return <span style={{ color: "#fca5a5" }}>Error: {status.message}</span>;
  }
}
\`\`\`

The discriminated union pattern makes IMPOSSIBLE STATES UNREPRESENTABLE — you can't have \`{ kind: "verified" }\` without a \`paymentId\` and \`orderId\` because TypeScript demands them. \`{ kind: "error" }\` requires a \`message\`. The compiler enforces the data model.

Inside the switch, \`status.orderId\` is type-safe in the \`opening-modal\` branch — TypeScript narrows the union based on the \`kind\` discriminator. No \`!\` non-null assertions needed.

If you add a new state (\`"polling"\` for example) without updating the switch, TS doesn't strictly error (no exhaustiveness check here without an \`assertNever\` helper) but every case branch becomes a place to add the new arm — making the missing one show up in code review.

The flat union vs. nested object (\`{ status: "verified", data: { paymentId, orderId } }\`) is more ergonomic at the call site — \`status.paymentId\` is more readable than \`status.data.paymentId\` and the type narrowing works without indirection.

This pattern eliminates the "loading and error are both true" / "verified but no orderId" bug class entirely.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['typescript', 'discriminated-union', 'state-machine', 'react'],
    repository: repo,
    filePath: 'app/demo/DemoClient.tsx',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/app/demo/DemoClient.tsx',
  },
  {
    title: 'Razorpay payment.failed event subscription on the Checkout instance',
    body: `Beyond the success \`handler\` callback, the Razorpay Checkout instance emits a \`payment.failed\` event that your code needs to subscribe to explicitly:

\`\`\`tsx
const razorpay = new window.Razorpay({
  key: razorpayKeyId,
  amount: order.amount,
  currency: order.currency,
  order_id: order.order_id,
  name: "razorpay-patterns-demo",
  description: "Standard Checkout demo payment",
  handler: async (response: unknown) => {
    // success path - verify signature
  },
  modal: {
    ondismiss: () => setStatus({ kind: "cancelled" }),
  },
  theme: { color: "#93c5fd" },
});

razorpay.on("payment.failed", (response: unknown) => {
  const r = response as { error?: { description?: string; code?: string } };
  setStatus({
    kind: "error",
    message: \`payment failed: \${r.error?.code ?? "unknown"} — \${r.error?.description ?? ""}\`,
  });
});

razorpay.open();
\`\`\`

There are THREE paths out of the modal — and you have to handle all three:

1. **Success** — \`handler\` callback fires with \`razorpay_order_id / razorpay_payment_id / razorpay_signature\`. You verify the signature server-side then update UI.
2. **Cancellation** — user closes the modal without paying. \`modal.ondismiss\` fires. No payment was attempted.
3. **Failure** — payment was attempted but failed (declined card, insufficient funds, OTP timeout). \`payment.failed\` event fires on the instance with an error object containing \`code\` and \`description\`.

Missing the \`payment.failed\` subscription is the most common Razorpay integration bug — declined cards just leave the UI hanging because the success handler never fires and no error is surfaced. Users hit "pay" twice, which compounds with the order-creation idempotency issue (now you've got two failed orders for the same intent).

The \`r.error?.description\` is the human-readable message Razorpay wants you to show — typically "Payment was declined by issuing bank" or "Card balance insufficient." The \`code\` is the machine-readable identifier for analytics/grouping.

The full flow handles success → server verify → UI update, and failure → UI error → user can retry. Each path moves the discriminated-union status to a different terminal state.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['razorpay', 'checkout', 'error-handling', 'event-handler'],
    repository: repo,
    filePath: 'app/demo/DemoClient.tsx',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/app/demo/DemoClient.tsx',
  },
  {
    title: 'Health endpoint that pings Redis: 503 if Redis is down',
    body: `The Razorpay demo's \`/api/health\` does a real Redis PING — if Redis is dead, the idempotency guard is dead, and the app should report unhealthy:

\`\`\`ts
export async function GET() {
  const startedAt = Date.now();
  const url = process.env.REDIS_URL;
  if (!url) {
    return NextResponse.json(
      { ok: false, error: "REDIS_URL not configured" },
      { status: 503 }
    );
  }

  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    const pong = await redis.ping();
    await redis.quit();
    return NextResponse.json({
      ok: pong === "PONG",
      redis: pong,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    try { await redis.quit(); } catch { /* swallow */ }
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
\`\`\`

The doc comment is explicit: "Redis PING is the main signal — if Redis is dead, the webhook idempotency guard is dead, and the app is unusable even if the Next.js server responds."

This is the deeper-than-typical health check pattern. Most \`/health\` endpoints just return \`{ status: "ok" }\` to prove the HTTP server is alive. This one proves the critical dependency is reachable too. Vercel's per-deploy health check will fail if Redis is misconfigured; your monitoring will alert if Upstash has an outage.

\`maxRetriesPerRequest: 1\` is intentionally low — the health check should fail FAST. If Redis takes 30 seconds to respond, the platform's health-check timeout will fire long before, and you don't want to add another 30s of retry on top.

\`latencyMs: Date.now() - startedAt\` exposes the round-trip time — if Redis is slow but responsive, a Grafana panel of health-check latency over time spots degradation before it becomes outright failure.

The 503 (Service Unavailable) on missing config is the right semantic — the service exists but can't serve requests because of a config error. 500 would imply a bug; 503 implies "operationally unhealthy, retry later or fix config."

The double try/catch (one for the connection + ping, one for the cleanup quit) prevents a quit-during-error from masking the original error.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['health-check', 'redis', 'observability', 'next.js'],
    repository: repo,
    filePath: 'app/api/health/route.ts',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/app/api/health/route.ts',
  },
  {
    title: 'replay-webhook script: signed fake webhook for demo / CI',
    body: `The repo ships a Node script that fires a signed fake Razorpay webhook at the local \`/api/webhook\` — useful for demos and CI smoke tests without needing a real Razorpay account:

\`\`\`js
import crypto from "node:crypto";

const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
const url = process.env.WEBHOOK_URL ?? "http://localhost:3000/api/webhook";

function buildEvent(paymentId) {
  return {
    entity: "event",
    account_id: "acc_test_replay",
    event: "payment.captured",
    contains: ["payment"],
    payload: {
      payment: {
        entity: {
          id: paymentId,
          entity: "payment",
          amount: 9900,
          currency: "INR",
          status: "captured",
          // ...
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000),
  };
}

async function fire(paymentId, label) {
  const body = JSON.stringify(buildEvent(paymentId));
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": signature,
    },
    body,
  });
  const json = await res.json();
  console.log(\`[\${label}]\`, res.status, json);
}

const paymentId = \`pay_replay_\${crypto.randomBytes(6).toString("hex")}\`;
await fire(paymentId, "1st delivery");
await new Promise((r) => setTimeout(r, 500));
await fire(paymentId, "2nd delivery (should be duplicate)");
\`\`\`

The script demonstrates the idempotency guard working end-to-end: same payment ID twice, server logs \`duplicate: true\` on the second call. That's the kind of "look, it actually works" proof that's hard to extract from a unit test.

The HMAC computation matches the production verification exactly — same algorithm (\`sha256\`), same input (raw body bytes), same output format (hex). If your webhook handler verification breaks, this script breaks first.

The fake event shape is faithful to Razorpay's actual schema — \`entity: "event"\`, nested \`payload.payment.entity\` structure, \`created_at\` as Unix epoch seconds. \`extractEventId\` will pull \`pay_replay_xxx\` out and use it as the dedup key.

Useful for: recorded Loom walkthroughs (you fire the script live in the demo), CI tests (script returns non-zero on failure), pair programming demos (no Razorpay account setup needed).`,
    contentType: 'REPOSITORY_FILE',
    language: 'javascript',
    tags: ['razorpay', 'webhook', 'testing', 'hmac', 'demo'],
    repository: repo,
    filePath: 'scripts/replay-webhook.mjs',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/scripts/replay-webhook.mjs',
  },
  {
    title: 'Lazy Razorpay client + per-route Node runtime declaration',
    body: `The Razorpay client is lazy-instantiated and every route that uses it declares \`runtime = "nodejs"\` to prevent edge-runtime deployment:

\`\`\`ts
let razorpayClient: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  if (!razorpayClient) {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_id || !key_secret) {
      throw new Error(
        "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set. See .env.example."
      );
    }
    razorpayClient = new Razorpay({ key_id, key_secret });
  }
  return razorpayClient;
}
\`\`\`

Every route that touches Razorpay starts with:

\`\`\`ts
export const runtime = "nodejs";
\`\`\`

Two reasons both pieces matter together:

1. **Lazy instantiation** — the Razorpay SDK constructor doesn't crash if env vars are missing during \`next build\`. Production deploys with real env vars succeed; preview deploys without env vars build fine and only fail at request time with a clean error.

2. **Node runtime declaration** — the Razorpay Node SDK uses \`crypto\`, \`http\`, and other Node built-ins not available on the edge runtime. Without \`export const runtime = "nodejs"\`, Vercel may try to compile the route as edge and fail at runtime with cryptic "Module not found: crypto" errors.

The error message \`"RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set. See .env.example."\` points the developer to the exact next step. Most env-var error messages are some variant of "FOO is required" — naming the file with examples reduces "where do I get this from?" ticket volume.

The split between \`getRazorpay()\` (Razorpay API client) and \`getWebhookSecret()\` (webhook secret string) means routes that ONLY verify webhooks don't pull the full SDK into memory — small but real cold-start savings on Vercel.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['razorpay', 'next.js', 'env-vars', 'singleton'],
    repository: repo,
    filePath: 'lib/razorpay.ts',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/lib/razorpay.ts',
  },
  {
    title: 'Test asserts pipe separator in Razorpay signature payload',
    body: `One of the most subtle Razorpay integration bugs is using the wrong separator between order_id and payment_id when computing the signature. The test suite has a dedicated case to lock the pipe character in:

\`\`\`ts
it("separator matters — order_id + payment_id WITHOUT the pipe fails", () => {
  const wrongFormat = crypto
    .createHmac("sha256", keySecret)
    .update(\`\${orderId}\${paymentId}\`) // missing "|"
    .digest("hex");
  expect(verifySignature(orderId, paymentId, wrongFormat, keySecret)).toBe(false);
});

it("rejects when the order_id was tampered with (replay on a different order)", () => {
  expect(
    verifySignature("order_OTHER", paymentId, goodSignature, keySecret)
  ).toBe(false);
});
\`\`\`

The Razorpay docs specify the payload as \`{order_id}|{payment_id}\` — pipe character between them. It's easy to miss because a quick read of the API docs might suggest "concatenate the two IDs." Without the separator, two completely different (order_id, payment_id) pairs could produce the same signature input — \`order_AB + pay_CD\` and \`order_A + pay_BCD\` would both serialize to \`order_ABpay_CD\` ambiguously. The pipe ensures the boundary is unambiguous.

The replay test \`verifySignature("order_OTHER", paymentId, goodSignature, keySecret)\` proves an attacker can't reuse a valid signature on a different order — the recomputed expected signature would be \`HMAC(order_OTHER|paymentId)\` which doesn't match the original \`HMAC(originalOrder|paymentId)\`.

The companion case for tampered \`payment_id\` proves the symmetric property. Together they show the signature binds BOTH the order ID and payment ID, not just one or the other.

This is what makes Razorpay's client-callback signature secure even though the values pass through the user's browser — they CAN see them, they just can't recompute the signature without the KEY_SECRET, and they can't reuse a captured signature on different IDs.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['razorpay', 'testing', 'hmac', 'security'],
    repository: repo,
    filePath: '__tests__/verify-payment.test.ts',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/__tests__/verify-payment.test.ts',
  },
  {
    title: 'Tampered body rejected even with valid old signature',
    body: `One of the webhook signature tests verifies that mutating the body INVALIDATES a previously-valid signature — proving the HMAC really does cover the body bytes:

\`\`\`ts
it("rejects when body is tampered after signing", () => {
  const tamperedBody = body + " ";
  expect(verifyWebhookSignature(tamperedBody, validSig, secret)).toBe(false);
});

it("rejects a tampered signature", () => {
  const tampered = validSig.slice(0, -1) + "0";
  expect(verifyWebhookSignature(body, tampered, secret)).toBe(false);
});

it("rejects a signature computed with a different secret", () => {
  const otherSig = crypto
    .createHmac("sha256", "different_secret")
    .update(body)
    .digest("hex");
  expect(verifyWebhookSignature(body, otherSig, secret)).toBe(false);
});
\`\`\`

Three failure modes covered, each provable independently:
1. **Tampered body** — appending a single space to the body fails verification. This proves an attacker who intercepts a valid (body, signature) pair can't modify the body and have it still verify.
2. **Tampered signature** — flipping the last byte of the signature fails. Cheap sanity check that the comparison actually checks the whole hex string, not just a prefix.
3. **Wrong secret** — a signature computed with a different secret over the SAME body fails. Proves the signature verifies authenticity (the signer holds the secret) and not just integrity.

The space-appending tamper test catches a class of bug where someone tries to "normalize" the body before verification (trim whitespace, parse-then-stringify, etc.). Any normalization on the verification side breaks security because the attacker can craft a body that normalizes the same way.

These tests use real \`crypto.createHmac\` to construct the test signatures — no mocks, no abstractions. The verification function is exercised exactly as it would be in production with real Razorpay payloads. The only thing missing from the integration test is the actual HTTP transport, which is covered by the route-level test.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['razorpay', 'testing', 'security', 'hmac'],
    repository: repo,
    filePath: '__tests__/razorpay.test.ts',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/__tests__/razorpay.test.ts',
  },
  {
    title: 'Test asserts custom shouldRetry predicate stops retry after 1 call',
    body: `The retry helper accepts a custom \`shouldRetry\` predicate; a test verifies that returning false from it stops retry immediately:

\`\`\`ts
it("honors a custom shouldRetry predicate", async () => {
  let calls = 0;
  await expect(
    withRetry(
      async () => {
        calls += 1;
        throw new Error("nope");
      },
      {
        maxAttempts: 4,
        baseDelayMs: 1,
        shouldRetry: () => false,
      }
    )
  ).rejects.toThrow("nope");
  expect(calls).toBe(1);
});

it("retries 5xx errors up to maxAttempts", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) {
        const err: Error & { statusCode?: number } = new Error("boom");
        err.statusCode = 503;
        throw err;
      }
      return "ok";
    },
    { maxAttempts: 4, baseDelayMs: 1, maxDelayMs: 5 }
  );
  expect(result).toBe("ok");
  expect(calls).toBe(3);
});
\`\`\`

The custom-predicate test exercises an uncommon path — a caller wanting to override the default 4xx-vs-5xx logic. Use cases: a payment-flow caller that wants to retry even 4xx errors (because they're calling against a flaky test environment), or a strict caller that wants to treat all errors as fatal (for "best effort" calls where retry adds no value).

The \`expect(calls).toBe(1)\` assertion is what makes the test meaningful — without it, the test would pass even if the predicate were ignored (the function would still throw "nope" on every attempt, but it would have been called \`maxAttempts\` times).

The 5xx retry test uses \`baseDelayMs: 1, maxDelayMs: 5\` — tiny values that make the test fast (total backoff is single-digit milliseconds even for 4 attempts) without skipping the actual retry logic. This avoids needing fake timers for the simple cases.

The retry tests don't use fake timers because real timers with 1ms delays are fast enough — Jest runs the test in ~5ms regardless. Fake timers become necessary only when delays are seconds-long; for ms-range delays the real timer is simpler and equivalent.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['testing', 'retry', 'jest', 'razorpay'],
    repository: repo,
    filePath: '__tests__/retry.test.ts',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/__tests__/retry.test.ts',
  },
  {
    title: 'Demo page test card setup: domestic INR cards, OTP 1111',
    body: `The /demo page's documentation includes the exact test credentials that work in Razorpay's test mode — the older \`4111 1111 1111 1111\` Visa is rejected because Razorpay test accounts have International Payments DISABLED by default:

\`\`\`tsx
<h3>Card tab</h3>
<p>
  Razorpay test accounts have International Payments disabled by
  default. The old <code>4111 1111 1111 1111</code> number gets
  classified as international and rejected with{" "}
  <em>"International cards are not supported."</em> Use the{" "}
  <strong>domestic</strong> test cards below instead.
</p>
<pre>{\`Card number   5267 3181 8797 5449   (Mastercard, domestic INR)
              4386 2894 0766 0153   (Visa, domestic INR)
Expiry        any future date (e.g. 12/30)
CVV           any 3 digits (e.g. 123)
Name          any
OTP           1111 (shown in the modal — NOT a real SMS)\`}</pre>
\`\`\`

This is field knowledge that doesn't exist in Razorpay's docs as a top-of-page warning — it's buried in the test card details page and easily missed. The doc says: "If you get a real SMS OTP on your phone during test mode, that's a coincidental Razorpay account notification, not this payment — nothing is actually charged."

The UPI tab uses different test IDs:
\`\`\`
success@razorpay   → payment.captured
failure@razorpay   → payment.failed
\`\`\`

Typing (NOT scanning) one of those into the UPI ID field triggers either a captured or failed payment without any real money movement. The page warns: "Don't scan the QR with a real UPI app. Test-mode orders aren't registered on the live UPI network, so GPay / PhonePe / Paytm will say 'invalid UPI id.'"

The OTP \`1111\` only works in the modal popup itself — Razorpay's modal accepts that as the test mode OTP. Real production flow would use a real SMS-delivered OTP. If someone tries to "test more realistically" by waiting for an SMS that never comes, they'll think the integration is broken when it's actually in test mode behaving correctly.

This kind of documentation lives in the demo page itself because future-you will hit the same confusion at month +12 and want it written down where you'll actually see it.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['razorpay', 'testing', 'documentation', 'next.js'],
    repository: repo,
    filePath: 'app/demo/page.tsx',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/app/demo/page.tsx',
  },
  {
    title: 'Two trust boundaries: client verify is UX, webhook is source of truth',
    body: `The home page documents the architectural rule that every Razorpay (and Stripe) integration eventually has to internalize: the webhook is the source of truth for billing state, the client-callback is just UX:

\`\`\`tsx
<li>
  <code>POST /api/webhook</code> — Razorpay async webhook receiver.
  Verifies the <code>X-Razorpay-Signature</code> header (HMAC-SHA256
  of the raw body with your webhook secret), then runs a Redis SETNX
  guard with a 24h TTL on the payment/order/subscription entity ID
  so duplicate deliveries short-circuit before the handler runs.
  This is the <em>authoritative</em> billing-state source.
</li>
<li>
  <code>POST /api/verify-payment</code> — client-callback signature
  verifier. Receives{" "}
  <code>razorpay_order_id / razorpay_payment_id / razorpay_signature</code>{" "}
  from Checkout.js success handler, recomputes HMAC-SHA256(
  <code>order_id|payment_id</code>, <code>KEY_SECRET</code>),
  constant-time compare. Returns 200 if verified, 400 if tampered.
</li>
\`\`\`

The split exists because:

- The **client callback** runs in the user's browser. The user could intercept the network request and replay it. The signature proves the response is genuine, but ANY client-controlled flow is fundamentally untrustworthy — the user could close the tab before the callback fires, the device could lose connectivity, etc.

- The **webhook** is server-to-server. Razorpay calls your endpoint directly with proof of payment. You verify the signature, dedup with SETNX, and update billing state. This happens regardless of what the client does — even if the user closes the tab the second they pay, the webhook still fires.

The temptation is "I verified the client callback, mark them as paid." That's the bug. If the network drops between Razorpay's response and your fulfillment, you've taken money but not granted access. Or worse: a sophisticated user replays an OLD valid signature for a CANCELLED order and gets paid access for free.

The right pattern: client callback unlocks the UI ("Payment successful! Your order is being processed."). The webhook does the actual billing-state update. Eventually-consistent, but correct under network partitions and adversarial clients.

This is the same pattern Stripe documents in their "Best practices" guide and it's why both demos in this corpus implement BOTH endpoints.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['razorpay', 'architecture', 'webhook', 'security'],
    repository: repo,
    filePath: 'app/page.tsx',
    url: 'https://github.com/Shailesh93602/razorpay-patterns-demo/blob/main/app/page.tsx',
  },
];
