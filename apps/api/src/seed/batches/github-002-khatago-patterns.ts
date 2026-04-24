/**
 * Batch github-002-khatago-patterns
 *
 * 25 patterns extracted from KhataGO — a WhatsApp-first accounting MVP
 * (Next.js 15 App Router + Prisma + Postgres + Gemini AI + Razorpay).
 *
 * Each entry was read from the actual file in the repo and the URL
 * resolves to that file on `main`. No invented code.
 */

import type { SeedItem } from '../types';

const repo = { owner: 'Shailesh93602', name: 'KhataGO' };
const blob = (path: string) =>
  `https://github.com/${repo.owner}/${repo.name}/blob/main/${path}`;

export const BATCH: SeedItem[] = [
  {
    title: 'WhatsApp webhook: HMAC-SHA256 signature verification on the raw body',
    body: `Meta signs every WhatsApp Business webhook with HMAC-SHA256(rawBody, APP_SECRET) and ships the digest in the \`X-Hub-Signature-256\` header. Verifying it requires the EXACT raw bytes — a JSON.parse + re-stringify roundtrip reorders keys and breaks the digest.

\`\`\`ts
function verifySignature(rawBody: string, headerValue: string | null): boolean {
  if (!APP_SECRET || !headerValue) return false;
  const expected = "sha256=" +
    crypto.createHmac("sha256", APP_SECRET).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(headerValue);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }
  const payload = JSON.parse(rawBody);
  // ...
}
\`\`\`

Two details that matter:

1. \`crypto.timingSafeEqual\` instead of \`===\`. String equality returns early on the first mismatched byte, leaking byte-by-byte timing info that lets an attacker brute-force the digest one character at a time. timingSafeEqual always compares all bytes.
2. Buffer length pre-check. timingSafeEqual throws if the lengths differ; comparing the lengths first lets the function return false cleanly.

The handler also force-uses the Node.js runtime (\`export const runtime = "nodejs"\`) — Edge runtime doesn't ship Node's \`crypto\` module the same way and the HMAC primitives change.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'webhooks', 'whatsapp', 'security', 'hmac'],
    repository: repo,
    filePath: 'app/api/whatsapp/route.ts',
    url: blob('app/api/whatsapp/route.ts'),
  },
  {
    title: 'WhatsApp webhook GET handler: hub.challenge verification handshake',
    body: `Before Meta will deliver any webhook events, it sends a one-time GET to the configured callback URL with three query params: \`hub.mode=subscribe\`, \`hub.verify_token=<your-secret>\`, \`hub.challenge=<random-string>\`. The endpoint must echo the challenge back as plain text iff the token matches.

\`\`\`ts
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new NextResponse("Forbidden", { status: 403 });
}
\`\`\`

Two things people get wrong:

1. Returning JSON. Meta's verifier expects \`text/plain\` with the raw challenge as the body. Returning \`{ challenge: "..." }\` or any HTML wrapping fails the handshake silently — the dashboard just shows "verification failed" without telling you why.
2. Skipping the token check. The token is a shared secret you set in both the Meta dashboard and your env. Without it, anyone who knows the URL can register the endpoint to their own phone-number-id.

Once the handshake passes, Meta starts POSTing events to the same URL — those go through the HMAC-verified POST handler.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'webhooks', 'whatsapp', 'meta-api'],
    repository: repo,
    filePath: 'app/api/whatsapp/route.ts',
    url: blob('app/api/whatsapp/route.ts'),
  },
  {
    title: 'Idempotent WhatsApp message persistence using waMessageId as the unique key',
    body: `Meta's WhatsApp Cloud API can deliver the same message to your webhook more than once (network retries, manual replays from the dashboard). KhataGO's persistence layer treats this as expected: every inbound message has a \`waMessageId\` from Meta, which the schema marks \`@unique\`, and the persist function checks-then-updates instead of always inserting.

\`\`\`ts
export async function persistWhatsappMessage(
  parsed: ParsedWhatsappMessage,
  rawPayload: Prisma.InputJsonValue
): Promise<WhatsappMessage> {
  const sharedData = { /* phoneNumberId, senderWaId, textBody, ... */ };

  if (parsed.waMessageId) {
    const existing = await prisma.whatsappMessage.findUnique({
      where: { waMessageId: parsed.waMessageId },
    });
    if (existing) {
      return prisma.whatsappMessage.update({
        where: { waMessageId: parsed.waMessageId },
        data: sharedData,
      });
    }
  }
  // first time we've seen this id — insert
  return prisma.whatsappMessage.create({ data: { waMessageId: parsed.waMessageId, ...sharedData, userId } });
}
\`\`\`

The find-then-update is racy on its own — two concurrent webhook deliveries could both see "no existing row" and both try to insert. The DB-level \`@unique\` constraint on \`waMessageId\` is the actual safety net: the loser of the race throws P2002 and the outer handler retries with the now-existing row.

The same pattern is reused for Razorpay webhooks (see \`app/api/razorpay/webhook/route.ts\`) where it's tightened — the BillingEvent model has \`razorpayEventId @unique\` and the handler does a try-insert, catching P2002 to detect duplicates without an extra read.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'idempotency', 'webhooks', 'whatsapp'],
    repository: repo,
    filePath: 'lib/whatsapp.ts',
    url: blob('lib/whatsapp.ts'),
  },
  {
    title: 'WhatsApp media download: triple size cap (declared, header, body)',
    body: `When a user sends an image or PDF over WhatsApp, the webhook receives a media id; downloading it is a two-step Meta API dance (get the temporary URL, then GET the URL with the same Bearer token). The download is the most attack-prone part of the pipeline — a malicious sender could ship a 2 GB file and OOM the server.

KhataGO's downloadMedia checks size THREE times because each check fails differently:

\`\`\`ts
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf",
]);

const urlData = await urlRes.json();
const declaredSize: number | undefined = urlData.file_size;

if (!ALLOWED_MEDIA_TYPES.has(mimeType)) return null;
if (typeof declaredSize === "number" && declaredSize > MAX_MEDIA_BYTES) return null;

const mediaRes = await fetch(mediaUrl, { headers: { Authorization: \`Bearer \${token}\` } });
const contentLength = Number(mediaRes.headers.get("content-length") ?? 0);
if (contentLength > MAX_MEDIA_BYTES) return null;

const arrayBuffer = await mediaRes.arrayBuffer();
if (arrayBuffer.byteLength > MAX_MEDIA_BYTES) return null;
\`\`\`

The three checks correspond to three threat models:
1. Meta's metadata says the file is too big — reject before the download starts.
2. The CDN's response Content-Length says too big — reject before reading the body into memory.
3. The actual bytes received exceed the cap — reject after the fact (catches Content-Length lies).

10 MB is the cap because Gemini's vision input has a comparable limit; rejecting larger files at the WhatsApp boundary saves a round-trip to the LLM that would fail anyway.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'security', 'whatsapp', 'file-upload'],
    repository: repo,
    filePath: 'lib/whatsapp.ts',
    url: blob('lib/whatsapp.ts'),
  },
  {
    title: 'Gemini function-calling loop with a maxTurns guard',
    body: `KhataGO's AI agent runs Gemini in tool-use mode: the model can call \`create_transaction\`, \`get_recent_transactions\`, \`create_receivable\`, etc. Each call returns a JSON response that's fed back to Gemini, which may issue another tool call, and so on. Without a turn limit a buggy prompt could loop forever.

\`\`\`ts
const maxTurns = 5;
let turns = 0;

while (functionCalls && functionCalls.length > 0 && turns < maxTurns) {
  turns++;
  const parts: Part[] = [];

  for (const call of functionCalls) {
    let functionResponse;
    if (call.name === "create_transaction") {
      functionResponse = await executor.create_transaction(call.args as any);
    } else if (call.name === "get_recent_transactions") {
      functionResponse = await executor.get_recent_transactions(call.args as any);
    } else if (/* ...other tools... */) {
      // ...
    } else {
      functionResponse = { error: "Unknown function" };
    }
    parts.push({ functionResponse: { name: call.name, response: functionResponse } });
  }

  result = await chat.sendMessage(parts);
  response = result.response;
  functionCalls = response.functionCalls();
}
\`\`\`

Three things to call out:

1. The "Unknown function" branch matters. Gemini can hallucinate tool names; without the catch-all the dispatcher would crash mid-conversation and the user would just see a generic error.
2. \`maxTurns = 5\` is empirically tuned. Most accounting interactions are 1-2 turns ("record sale of 500" → one create_transaction call → confirmation). Five gives headroom for "list my receivables, then send a reminder to the top one" without runaway loops.
3. The function results are sent back as a single \`sendMessage(parts)\` call with all responses bundled — Gemini's API expects parallel tool calls to be answered in one message, not one at a time.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['gemini', 'ai', 'function-calling', 'tool-use'],
    repository: repo,
    filePath: 'lib/ai/agent.ts',
    url: blob('lib/ai/agent.ts'),
  },
  {
    title: 'Loading recent chat history from Postgres into the Gemini context',
    body: `Gemini doesn't remember anything between API calls — every \`startChat\` is a fresh session. KhataGO simulates conversational memory by replaying the last 10 successfully-processed turns from Postgres into the chat history before sending the new message.

\`\`\`ts
const previousMessages = await prisma.whatsappMessage.findMany({
  where: {
    userId: userId,
    aiResponse: { not: null }, // Only completed turns
    textBody: { not: null },   // Only text messages
  },
  orderBy: { receivedAt: "desc" },
  take: 10,
});

const historyMessages = previousMessages.reverse(); // chronological

const chatHistory = [
  { role: "user", parts: [{ text: systemInstruction }] },
  { role: "model", parts: [{ text: "Understood. I am ready to help with accounting tasks." }] },
];

for (const msg of historyMessages) {
  if (msg.textBody && msg.aiResponse) {
    chatHistory.push({ role: "user", parts: [{ text: msg.textBody }] });
    chatHistory.push({ role: "model", parts: [{ text: msg.aiResponse }] });
  }
}

const chat = model.startChat({ history: chatHistory });
\`\`\`

Three deliberate choices:

1. \`aiResponse: { not: null }\` — only include turns that actually finished. Half-processed messages would skew the model's understanding of what it has already done.
2. The \`order: 'desc' + take: 10 + reverse()\` pattern is the standard Postgres trick for "the most recent 10 in chronological order" — a single index-friendly query instead of a slow tail scan.
3. The system instruction is hand-prepended as a fake user/model exchange because Gemini's older SDKs don't all support a top-level \`systemInstruction\` field. Treating the bootstrapping turn as a fake exchange works on every SDK version.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['gemini', 'ai', 'prisma', 'conversation-memory'],
    repository: repo,
    filePath: 'lib/ai/agent.ts',
    url: blob('lib/ai/agent.ts'),
  },
  {
    title: 'Gemini tool schema with SchemaType + enum constraints',
    body: `Gemini's function-calling API is JSON-Schema-flavoured but uses its own \`SchemaType\` enum (OBJECT, STRING, NUMBER, BOOLEAN). KhataGO's tool definitions live in one big \`tools\` array, with enums constraining the values the model is allowed to emit.

\`\`\`ts
import { SchemaType } from "@google/generative-ai";

export const tools = [{
  functionDeclarations: [{
    name: "create_transaction",
    description: "Record a new financial transaction (sale, purchase, or expense).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        type: {
          type: SchemaType.STRING,
          description: "Type of transaction: 'SALE', 'PURCHASE', or 'EXPENSE'.",
          enum: ["SALE", "PURCHASE", "EXPENSE"],
        },
        amount: { type: SchemaType.NUMBER, description: "The monetary amount." },
        party: { type: SchemaType.STRING, description: "Customer or vendor name." },
        gstRate: {
          type: SchemaType.NUMBER,
          description: "GST Rate in percentage (e.g., 5, 12, 18, 28). Default 0.",
        },
        isTaxIncluded: {
          type: SchemaType.BOOLEAN,
          description: "True if amount includes tax. Default true.",
        },
      },
      required: ["type", "amount", "party", "mode"],
    },
  }],
}];
\`\`\`

The \`enum\` on \`type\` is what stops Gemini from emitting \`"SELL"\` or \`"sale"\` — the SDK validates the model's output against the schema and rejects calls that don't match. Without the enum the executor would need a fuzzy-match shim; with it, the model self-corrects.

\`required\` is the other guardrail. If the user says "record 500" without a counterparty, Gemini won't fire \`create_transaction\` — it'll respond asking for the missing field. That's better than the executor erroring out after the fact.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['gemini', 'ai', 'function-calling', 'schema'],
    repository: repo,
    filePath: 'lib/ai/tools.ts',
    url: blob('lib/ai/tools.ts'),
  },
  {
    title: 'GST extraction from a tax-inclusive amount: reverse-derive base, then subtract',
    body: `When a small-business owner messages "Record sale of 1180 to Ram, 18% GST", they almost always mean ₹1180 INCLUDING tax — that's how invoices are typed in India. KhataGO's executor handles both cases via an \`isTaxIncluded\` flag (default \`true\`).

\`\`\`ts
let finalAmount = amount;
let calculatedGstAmount = 0;
const rate = gstRate || 0;

if (rate > 0) {
  if (isTaxIncluded === false) {
    // Amount is base; add tax on top
    calculatedGstAmount = amount * (rate / 100);
    finalAmount = amount + calculatedGstAmount;
  } else {
    // Amount is total (default); back out the base
    // Total = Base * (1 + Rate/100)  =>  Base = Total / (1 + Rate/100)
    const baseAmount = amount / (1 + rate / 100);
    calculatedGstAmount = amount - baseAmount;
  }
}
\`\`\`

The naive bug here is computing tax as \`amount * rate / 100\` for a total-amount input — that gives 18% of ₹1180 = ₹212.40, which is wrong. The base is ₹1000, so the actual GST embedded in ₹1180 is ₹180. The reverse-derive formula is the only way to recover it.

The same logic is used in \`update_transaction\` so retroactively adding GST to an existing entry works the same way as setting it at create-time. Storing both \`amount\` (the total seen by the customer) and \`gstAmount\` (the embedded tax) lets monthly reports compute GST collected vs paid without re-running the math.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['ai', 'business-logic', 'gst', 'india'],
    repository: repo,
    filePath: 'lib/ai/tools.ts',
    url: blob('lib/ai/tools.ts'),
  },
  {
    title: 'FIFO payment allocation across multiple receivables in a Prisma transaction',
    body: `When Rahul has three outstanding invoices (₹2000, ₹3000, ₹5000) and pays ₹6000, the bookkeeping convention is FIFO: clear the oldest first. KhataGO does this inside a Prisma \`$transaction\` so partial failures don't leave the books inconsistent.

\`\`\`ts
const pendingReceivables = await prisma.receivable.findMany({
  where: { userId, contactId: contact.id, status: { in: ["PENDING", "PARTIAL"] } },
  orderBy: { createdAt: "asc" }, // FIFO
});

let remainingPayment = amount;

await prisma.$transaction(async tx => {
  for (const receivable of pendingReceivables) {
    if (remainingPayment <= 0) break;

    const balance = receivable.balance.toNumber();
    const paymentForThis = Math.min(remainingPayment, balance);
    const newBalance = balance - paymentForThis;
    const isFullyPaid = newBalance === 0;

    await tx.payment.create({
      data: { userId, receivableId: receivable.id, contactId: contact.id,
              amount: paymentForThis, mode: mode || "CASH", date: new Date() },
    });

    await tx.receivable.update({
      where: { id: receivable.id },
      data: {
        paidAmount: receivable.paidAmount.toNumber() + paymentForThis,
        balance: newBalance,
        status: isFullyPaid ? "PAID" : "PARTIAL",
        nextReminderDate: isFullyPaid ? null : receivable.nextReminderDate,
      },
    });

    remainingPayment -= paymentForThis;
  }
});
\`\`\`

The interactive transaction (\`$transaction(async tx => ...)\`) is critical here — without it, a network blip after creating two payments but before updating the last receivable would leave \`paidAmount + balance\` not equal to \`amount\` for that row. With it, all writes commit or none do.

The pre-fetch outside the transaction could go stale (someone else marks a receivable PAID between the read and the txn). For a per-user single-writer flow that's acceptable; the constraint that protects correctness is the \`Math.min(remainingPayment, balance)\` clamp inside the loop, which prevents over-applying even if the cached balance is wrong.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'transactions', 'business-logic', 'accounting'],
    repository: repo,
    filePath: 'lib/ai/tools.ts',
    url: blob('lib/ai/tools.ts'),
  },
  {
    title: 'Tally XML voucher export with double-entry ledger amounts',
    body: `Tally (the dominant Indian accounting software) imports vouchers via a specific XML envelope. KhataGO generates this XML so users can take their WhatsApp-recorded transactions and ingest them into their accountant's Tally setup.

The interesting bit is the double-entry derivation — every voucher needs two ledger entries that sum to zero (debit + credit):

\`\`\`ts
function deriveLedgerAmounts(type: Transaction["type"], amount: string) {
  switch (type) {
    case "SALE":
      // Customer (debtor) is debited, Sales Ledger is credited
      return { partyAmount: amount, counterAmount: prependNegative(amount) };
    case "PURCHASE":
      // Vendor is credited, Purchase Ledger is debited
      return { partyAmount: prependNegative(amount), counterAmount: amount };
    case "EXPENSE":
    default:
      // Cash/Bank is credited, Expense Ledger is debited
      return { partyAmount: prependNegative(amount), counterAmount: amount };
  }
}
\`\`\`

The negative sign maps to Tally's \`<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\` — counter-intuitively, a negative amount in the XML means "this is the credit side." The voucher type also varies (\`Sales\`, \`Purchase\`, \`Payment\`) and Tally infers the ledger semantics from there.

The \`escapeXml\` helper escapes the five XML special chars (\`&<>"'\`); skipping it lets a party name with an apostrophe break the import. The \`sanitizeLedgerName\` collapses whitespace because Tally treats two-space-separated names as different ledgers.

Generated XML looks like real Tally output — see \`fixtures/tally-sample.xml\` in the repo for a verified-working reference.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['xml', 'tally', 'accounting', 'india'],
    repository: repo,
    filePath: 'lib/tally.ts',
    url: blob('lib/tally.ts'),
  },
  {
    title: 'Razorpay webhook: HMAC verify on raw body + DB unique-constraint idempotency',
    body: `Razorpay signs every webhook with HMAC-SHA256(rawBody, webhookSecret). Verification needs the raw bytes — a \`req.json()\` shortcut would re-serialise and break the digest. The handler also has to be idempotent because Razorpay retries non-2xx responses for up to 24 hours.

\`\`\`ts
const rawBody = await request.text();

const signatureValid = verifyWebhookSignature(rawBody, headerSig);
if (!signatureValid) {
  return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
}

const payload = JSON.parse(rawBody);
const razorpayEventId = extractEventId(payload);

try {
  await prisma.billingEvent.create({
    data: { razorpayEventId, eventType, rawPayload: payload, billingAccountId: billingAccount?.id },
  });
} catch (err) {
  // P2002 = unique constraint violation on razorpayEventId -> duplicate.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return NextResponse.json({ ok: true, duplicate: true, eventId: razorpayEventId });
  }
  throw err;
}

await dispatch({ eventType, payload, userId, planKey });
\`\`\`

The schema declares \`razorpayEventId String @unique\` on the BillingEvent model. The webhook handler does a try-insert and catches Prisma's P2002 error code as the "duplicate" signal. This is stronger than the SETNX-in-Redis pattern: idempotency is tied to the audit row, so there's no window where a Redis claim exists but the DB row hasn't been persisted.

\`extractEventId\` is custom because Razorpay (unlike Stripe) doesn't ship a top-level \`event.id\` — the handler derives it from \`payload.{payment,order,subscription,refund}.entity.id\` with a prefix to namespace by entity type (\`payment:pay_xxx\`, \`order:order_xxx\`).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'razorpay', 'webhooks', 'idempotency', 'prisma'],
    repository: repo,
    filePath: 'app/api/razorpay/webhook/route.ts',
    url: blob('app/api/razorpay/webhook/route.ts'),
  },
  {
    title: 'Two different HMAC signatures for two different Razorpay verification flows',
    body: `Razorpay actually has two signatures with two different secrets, and conflating them is a common bug. KhataGO's \`lib/razorpay.ts\` handles both:

\`\`\`ts
// 1. Webhook signature: HMAC-SHA256 of raw body with WEBHOOK secret.
export function verifyWebhookSignature(
  rawBody: string,
  headerSignature: string,
  secret: string = getWebhookSecret()
): boolean {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(headerSignature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

// 2. Client-callback signature: HMAC-SHA256 of \`{order_id}|{payment_id}\` with KEY_SECRET.
export function verifyPaymentSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const { key_secret } = getRazorpayKeys();
  const payload = \`\${input.orderId}|\${input.paymentId}\`;
  const expected = crypto.createHmac("sha256", key_secret).update(payload).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(input.signature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
\`\`\`

Same algorithm (HMAC-SHA256), same \`timingSafeEqual\` defence, but two different secrets and two different message formats:

- Webhook server-to-server: signs the entire request body, secret is \`RAZORPAY_WEBHOOK_SECRET\` (set in the Razorpay dashboard webhook config).
- Client checkout callback: signs the pipe-joined \`order_id|payment_id\`, secret is \`RAZORPAY_KEY_SECRET\` (the API key secret).

Trying to verify a checkout callback with the webhook secret silently fails — the digest just won't match. The right fix is two named functions and two separate env vars; the wrong fix is "let me try both secrets and see which works," which leaks the webhook secret to the client-trusted code path.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['razorpay', 'security', 'hmac', 'payments'],
    repository: repo,
    filePath: 'lib/razorpay.ts',
    url: blob('lib/razorpay.ts'),
  },
  {
    title: 'Razorpay order creation via raw fetch (no SDK dependency)',
    body: `KhataGO calls Razorpay's order-create endpoint with plain fetch + Basic auth instead of pulling in the official \`razorpay\` npm package.

\`\`\`ts
export async function createRazorpayOrder(input: {
  amount: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<{ id: string; amount: number; currency: string; receipt: string }> {
  const { key_id, key_secret } = getRazorpayKeys();
  const auth = Buffer.from(\`\${key_id}:\${key_secret}\`).toString("base64");

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: \`Basic \${auth}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(\`Razorpay order create failed: \${response.status} \${errText}\`);
  }
  return response.json();
}
\`\`\`

Reasons this scales better than \`new Razorpay({...}).orders.create(...)\`:

1. Cold-start size on Vercel. The official SDK pulls in a tree of utilities just for one POST endpoint; serverless cold starts are sensitive to bundle size.
2. Edge runtime compatibility. Most payment SDKs assume Node.js — fetch + Buffer.from is portable.
3. Visibility. The error surface is exactly \`status + body text\`; no SDK abstraction layer to debug when a 401 comes back.

The receipt format (\`sub_<userIdSuffix>_<timestampB36>\`) is generated at the call site to give the BillingAccount.lastOrderId column something human-readable to look at when troubleshooting failed payments.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['razorpay', 'fetch', 'serverless', 'payments'],
    repository: repo,
    filePath: 'lib/razorpay.ts',
    url: blob('lib/razorpay.ts'),
  },
  {
    title: 'Next.js middleware: session-gated routes with ?next deep-link preservation',
    body: `KhataGO's middleware enforces auth across the app while keeping the public marketing pages open. The notable detail is preserving the user's intended destination through the login redirect.

\`\`\`ts
const publicRoutes = ["/", "/login", "/waitlist", "/about", "/contact", /* ... */];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get("session")?.value;

  const isPublicRoute =
    publicRoutes.some(r => pathname === r || pathname.startsWith(\`\${r}/\`)) ||
    pathname.startsWith("/api/");

  if (!session && !isPublicRoute) {
    const loginUrl = new URL("/login", request.url);
    const next = pathname + (request.nextUrl.search || "");
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  if (session && pathname === "/login") {
    const next = request.nextUrl.searchParams.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      return NextResponse.redirect(new URL(next, request.url));
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return await updateSession(request);
}
\`\`\`

The \`next.startsWith("/") && !next.startsWith("//")\` check is the open-redirect defence: \`/dashboard\` is a same-origin path (allowed), but \`//evil.com\` is a protocol-relative URL that browsers treat as cross-origin. Both pass a naive \`startsWith("/")\` check; the explicit \`!"//"\` rejects the dangerous case.

The matcher excludes \`/api/whatsapp\` because the WhatsApp webhook is called by Meta (no session cookie possible) — auth there is HMAC instead. \`/api/auth\` is also excluded because the login flow itself can't require a session.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'middleware', 'auth', 'security'],
    repository: repo,
    filePath: 'middleware.ts',
    url: blob('middleware.ts'),
  },
  {
    title: 'JWT session cookies with jose: SignJWT + httpOnly + 24h sliding expiry',
    body: `KhataGO uses the \`jose\` library (instead of \`jsonwebtoken\`) because it works in both Node.js and Next.js Edge runtime — middleware runs on Edge and can't import \`jsonwebtoken\`.

\`\`\`ts
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const key = new TextEncoder().encode(secretKey);

export async function encrypt(payload: any): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(key);
}

export async function login(userId: string) {
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const session = await encrypt({ userId, expires });
  const cookieStore = await cookies();
  cookieStore.set("session", session, { expires, httpOnly: true });
}

export async function updateSession(request: NextRequest) {
  const session = request.cookies.get("session")?.value;
  if (!session) return;
  const parsed = await decrypt(session);
  parsed.expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const res = NextResponse.next();
  res.cookies.set({ name: "session", value: await encrypt(parsed), httpOnly: true, expires: parsed.expires });
  return res;
}
\`\`\`

\`updateSession\` implements a sliding window: every request that has a valid session re-issues a fresh 24-hour cookie. Active users stay logged in indefinitely; idle users get logged out after 24h.

\`httpOnly: true\` is non-negotiable — it stops document.cookie from reading the token, so an XSS payload can't exfiltrate the session. The TODO in the file (\`secretKey = "secret"\`) is a known gap to wire up \`process.env.JWT_SECRET\` before going wider.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'jwt', 'jose', 'auth', 'cookies'],
    repository: repo,
    filePath: 'lib/auth.ts',
    url: blob('lib/auth.ts'),
  },
  {
    title: 'Indian phone number normalization across 4 input formats',
    body: `Indian users type their phone numbers in at least four ways: bare 10 digits, leading 0, +91 prefix, +0091 prefix. The login OTP endpoint normalizes all four into the canonical 10-digit form before looking up the user.

\`\`\`ts
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\\D/g, ""); // strip non-digits

  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    cleaned = cleaned.substring(1);             // 0XXXXXXXXXX
  } else if (cleaned.length === 12 && cleaned.startsWith("91")) {
    cleaned = cleaned.substring(2);             // 91XXXXXXXXXX
  } else if (cleaned.length === 14 && cleaned.startsWith("0091")) {
    cleaned = cleaned.substring(4);             // 0091XXXXXXXXXX
  }
  return cleaned;
}
\`\`\`

The lookup then tries multiple variations because data was inserted before normalization existed:

\`\`\`ts
const user = await prisma.user.findFirst({
  where: {
    OR: [
      { phone: phone },
      { phone: normalizedPhone },
      { phone: \`91\${normalizedPhone}\` },
      { phone: normalizedPhone.startsWith("0") ? normalizedPhone.substring(1) : normalizedPhone },
    ],
  },
});
\`\`\`

This is messier than using \`libphonenumber\` and the file even calls that out as a TODO — the right fix is normalize-on-write (during signup) so reads only need a single canonical lookup. For an MVP the OR-search is the migration-free workaround.

The same problem exists in \`persistWhatsappMessage\` where Meta's WhatsApp ID always includes the country code (\`919876543210\`) but stored phones might not — that file does a similar OR-match against \`phone\` and \`phone.replace(/^91/, "")\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'i18n', 'phone-numbers', 'india'],
    repository: repo,
    filePath: 'app/api/auth/otp/route.ts',
    url: blob('app/api/auth/otp/route.ts'),
  },
  {
    title: 'Daily keepalive cron route to keep Supabase free-tier from auto-pausing',
    body: `Supabase's free Postgres tier auto-pauses projects after 7 days of no activity — the next request then takes 30+ seconds to wake the database. KhataGO's keepalive cron runs once a day and issues a real SQL roundtrip to keep the project alive.

\`\`\`ts
export const runtime = "nodejs";
const CRON_SECRET = process.env.CRON_SECRET;

async function handleKeepalive(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== \`Bearer \${CRON_SECRET}\`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ now: Date }>>\`SELECT NOW() as now\`;
    return NextResponse.json({ ok: true, project: "khatago", db: "postgres", now: rows[0]?.now });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
\`\`\`

Two things worth noting:

1. \`SELECT NOW()\` is intentionally trivial — the goal is just "did this hit the database?". Pinging the Supabase REST API doesn't count because it doesn't open a Postgres connection; only a real query through Prisma triggers Supabase's "active" timer.
2. The \`Authorization: Bearer $CRON_SECRET\` check matters because Vercel cron URLs are publicly addressable. Without the secret, anyone scanning routes can mass-trigger the endpoint and (in worse cases than a SELECT NOW) cause real load.

Vercel's cron config in \`vercel.json\` schedules this at \`0 9 * * *\` (09:00 UTC daily). The same shape is reused in DevTrack and EduScale — three sibling projects all keeping their Supabase instances warm.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'vercel-cron', 'supabase', 'prisma'],
    repository: repo,
    filePath: 'app/api/cron/keepalive/route.ts',
    url: blob('app/api/cron/keepalive/route.ts'),
  },
  {
    title: 'Cron-driven WhatsApp reminder dispatcher: group by contact, dedupe outbound sends',
    body: `If three of Rahul's invoices are all overdue, sending three separate WhatsApp reminders is annoying and burns three template-message billings. KhataGO's reminder cron groups all overdue receivables per contact and sends ONE message with the total balance.

\`\`\`ts
const byContact = new Map<string, {
  contact: ...; user: ...; receivables: typeof receivables; totalBalance: number;
}>();

for (const r of receivables) {
  const key = \`\${r.userId}-\${r.contactId}\`;
  if (!byContact.has(key)) {
    byContact.set(key, { contact: r.contact, user: r.user, receivables: [], totalBalance: 0 });
  }
  const entry = byContact.get(key)!;
  entry.receivables.push(r);
  entry.totalBalance += r.balance.toNumber();
}

for (const [, entry] of byContact) {
  if (!entry.contact.phone) continue;
  const businessName = entry.user.businessName || entry.user.name || "your supplier";
  const reminderMessage = /* templated message with totalBalance */;

  try {
    await sendWhatsappMessage(entry.contact.phone, reminderMessage);

    await prisma.receivable.updateMany({
      where: { id: { in: entry.receivables.map(r => r.id) } },
      data: {
        lastReminderSent: now,
        reminderCount: { increment: 1 },
        nextReminderDate: addDays(now, 3),
      },
    });
  } catch (error) {
    // record failure, continue with other contacts
  }
}
\`\`\`

The \`updateMany\` after each successful send is the de-dupe primitive: \`nextReminderDate\` is bumped 3 days into the future, so the next cron run won't re-pick the same receivables. If WhatsApp send fails, \`nextReminderDate\` is NOT bumped — the cron will try again tomorrow.

The cron query filter (\`reminderEnabled: true, nextReminderDate: { lte: now }, contact.phone: { not: null }\`) does most of the work in SQL. The \`@@index([nextReminderDate])\` on the Receivable model makes this scan cheap even with millions of receivables.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'vercel-cron', 'prisma', 'whatsapp'],
    repository: repo,
    filePath: 'app/api/cron/reminders/route.ts',
    url: blob('app/api/cron/reminders/route.ts'),
  },
  {
    title: 'Prisma global singleton for Next.js dev-mode hot reload',
    body: `Next.js's dev server reloads modules on every code change. Without protection, every reload spawns a fresh PrismaClient → connection pool → quickly exhausts Postgres' \`max_connections\` limit during local development.

\`\`\`ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production"
      ? ["error"]
      : ["query", "error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
\`\`\`

The pattern leans on \`globalThis\` surviving HMR reloads — module code re-runs but the global object persists, so the existing PrismaClient is reused. In production the cache is intentionally skipped (\`if (process.env.NODE_ENV !== "production")\`) because each serverless function invocation is a fresh process anyway, and you don't want a stale prisma instance ever surviving across actual deploys.

The \`log\` config also branches on env: production logs only errors (cheap), dev logs every query (useful for spotting N+1s while iterating). This is documented in the Prisma docs as the recommended Next.js setup; KhataGO's version is the textbook implementation.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'nextjs', 'dev-experience'],
    repository: repo,
    filePath: 'lib/prisma.ts',
    url: blob('lib/prisma.ts'),
  },
  {
    title: 'CSV escaping: quote-and-double-quote when the cell contains , " or newline',
    body: `Naive CSV serialisation breaks the moment a transaction note contains a comma or a quote. The CSV spec (RFC 4180) requires wrapping such cells in double quotes, AND escaping any embedded double quotes by doubling them.

\`\`\`ts
function escapeCsv(str: string): string {
  if (!str) return "";
  if (str.includes(",") || str.includes('"') || str.includes("\\n")) {
    return \`"\${str.replace(/"/g, '""')}"\`;
  }
  return str;
}

export function buildCsv(transactions: TransactionWithRelations[]): string {
  const headers = ["Date", "Type", "Party", "Amount", "Mode", "Notes",
                   "GST Rate", "GST Amount", "Invoice No", "Category", "Created At"];
  const rows = transactions.map(tx => [
    tx.date.toISOString().split("T")[0],
    tx.type,
    escapeCsv(tx.contact?.name || tx.party),
    tx.amount.toString(),
    tx.mode,
    escapeCsv(tx.notes || ""),
    /* ... */
  ].join(","));

  return [headers.join(","), ...rows].join("\\n");
}
\`\`\`

Three failure modes the escape avoids:

1. A note like \`Sale to Sharma, Bombay\` would become two columns (\`Sale to Sharma\` and \`Bombay\`) without the wrap.
2. A note with a quote (\`said "ok"\`) would close-and-reopen the quoted field mid-cell. Doubling becomes \`said ""ok""\`.
3. A note with a newline — actually possible since the WhatsApp parser preserves the original message — would split the row.

Numeric and date columns don't need escaping because they're guaranteed not to contain the delimiters. The skip-if-not-needed branch keeps the output diffable in a code review.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['csv', 'data-export', 'serialization'],
    repository: repo,
    filePath: 'lib/csv.ts',
    url: blob('lib/csv.ts'),
  },
  {
    title: 'Prisma groupBy for dashboard period totals (one query instead of N)',
    body: `The dashboard shows sales / purchases / expenses for "today", "this week", "this month". The naive way is three findMany calls per period × three periods = nine queries. Prisma's \`groupBy\` does it in one query per period, returning the per-type sum directly from Postgres.

\`\`\`ts
async function aggregateTotals(period: Period, start: Date, userId: string): Promise<PeriodSummary> {
  const groupBy = await prisma.transaction.groupBy({
    by: ["type"],
    where: { userId, date: { gte: start } },
    _sum: { amount: true },
  });

  const sales = findAmount(groupBy, "SALE");
  const purchases = findAmount(groupBy, "PURCHASE");
  const expenses = findAmount(groupBy, "EXPENSE");

  return {
    period,
    label: periodLabel(period),
    totals: { sales, purchases, expenses, net: sales - purchases - expenses },
  };
}

export async function getDashboardSummaries(
  userId: string,
  periods: Period[] = ["day", "week", "month"]
): Promise<PeriodSummary[]> {
  const ranges = periods.map(period => ({ period, start: periodStart(period) }));
  return Promise.all(ranges.map(({ period, start }) => aggregateTotals(period, start, userId)));
}
\`\`\`

The wins compared to "fetch all transactions then sum in JS":

1. The Postgres engine does the SUM, which is O(n) over the index on (userId, date) instead of pulling every row over the wire.
2. \`Promise.all\` runs the three period queries in parallel — three round trips become one wall-clock interval.
3. The \`net\` field is a derived value; it's computed in JS rather than in SQL because expressing it across grouped rows would need a CASE/SUM combo that's harder to read than the four-line JS.

The format is wrapped via \`Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" })\` so the dashboard shows ₹1,23,456.00 (lakh-formatting) not ₹123,456.00.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'sql', 'performance', 'aggregation'],
    repository: repo,
    filePath: 'lib/metrics.ts',
    url: blob('lib/metrics.ts'),
  },
  {
    title: 'Monthly summary aggregation: bucket transactions in JS by YYYY-MM key',
    body: `For the 12-month GST report, KhataGO fetches every transaction in the lookback window and buckets them by month in JS. \`groupBy\` could do the bucketing in SQL, but the report needs four derived columns (gstCollected, gstPaid, netGst, balance) that are easier to compute in code.

\`\`\`ts
const LOOKBACK_MONTHS = 12;

export async function getMonthlySummaries(userId: string): Promise<MonthlySummaryRow[]> {
  const start = monthsAgo(new Date(), LOOKBACK_MONTHS - 1);
  const transactions = await prisma.transaction.findMany({
    where: { date: { gte: start }, userId },
    orderBy: [{ date: "asc" }],
  });

  const buckets = new Map<string, MonthlySummaryRow>();

  for (const tx of transactions) {
    const key = formatMonthKey(tx.date); // "YYYY-MM"
    if (!buckets.has(key)) {
      buckets.set(key, {
        month: key, totalSales: 0, totalPurchases: 0, totalExpenses: 0,
        gstCollected: 0, gstPaid: 0, netGst: 0,
      });
    }
    const bucket = buckets.get(key)!;
    const amount = tx.amount.toNumber();
    const gstAmount = tx.gstAmount?.toNumber() ?? 0;

    switch (tx.type) {
      case "SALE":     bucket.totalSales += amount;     bucket.gstCollected += gstAmount; break;
      case "PURCHASE": bucket.totalPurchases += amount; bucket.gstPaid += gstAmount;     break;
      case "EXPENSE":  bucket.totalExpenses += amount;  bucket.gstPaid += gstAmount;     break;
    }
    bucket.netGst = bucket.gstCollected - bucket.gstPaid;
  }

  return Array.from(buckets.values()).sort((a, b) => (a.month < b.month ? 1 : -1));
}
\`\`\`

The Map keyed by \`"YYYY-MM"\` is the bucketing primitive. Iterating once over the sorted-asc transaction list keeps the algorithm O(n). The final sort flips to descending so the most recent month appears first in the UI.

The \`Decimal\` to \`number\` conversion via \`.toNumber()\` is done lazily inside the loop — we don't fetch with \`select\` because we need both \`amount\` and \`gstAmount\` and the savings would be marginal compared to the SQL roundtrip cost.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'reporting', 'aggregation', 'gst'],
    repository: repo,
    filePath: 'lib/monthly-summary.ts',
    url: blob('lib/monthly-summary.ts'),
  },
  {
    title: 'i18next with localStorage detection + Indian language tag normalization',
    body: `KhataGO ships in English, Hindi, and Gujarati. The detection chain is localStorage (user override) → navigator.language (browser) → htmlTag (fallback), and the convertDetectedLanguage hook collapses regional tags like \`hi-IN\` to the canonical \`hi\`.

\`\`\`ts
i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    supportedLngs: ["en", "hi", "gu"],
    fallbackLng: "en",
    debug: process.env.NODE_ENV === "development",

    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
      lookupLocalStorage: "preferredLanguage",
      convertDetectedLanguage: (lng: string) => {
        if (!lng) return "en";
        const primary = lng.toLowerCase().split("-")[0];
        if (primary === "hi") return "hi";
        if (primary === "gu") return "gu";
        return "en";
      },
    },

    backend: { loadPath: "/locales/{{lng}}/{{ns}}.json" },
    react: { useSuspense: false }, // important for Next.js SSR
  });
\`\`\`

Three details:

1. \`useSuspense: false\` is the magic line for Next.js. With Suspense enabled, server-rendered components throw on the first render because the translation bundle hasn't been fetched yet, breaking SSR.
2. \`lookupLocalStorage: "preferredLanguage"\` (instead of the default \`i18nextLng\`) makes the key human-readable when debugging in DevTools.
3. The convertDetectedLanguage allow-list approach is deliberate. Without it, \`mr-IN\` (Marathi) would be detected as \`mr\` and then fall back to fallbackLng — cleaner to map unknown primaries directly to \`"en"\` so the language switcher's "Default" state is consistent.

Translation files are loaded from \`public/locales/{lng}/{namespace}.json\` — namespaces (common, transactions, analytics, etc.) split the bundle so the landing page only fetches its strings, not the whole app's.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['i18n', 'i18next', 'nextjs', 'localization'],
    repository: repo,
    filePath: 'lib/i18n.ts',
    url: blob('lib/i18n.ts'),
  },
  {
    title: 'Find-or-create contact pattern with case-insensitive name match',
    body: `When the AI agent records a sale "to Ram", the executor needs to attach the transaction to a contact row. If "Ram" already exists, reuse it; otherwise create the row inline. The code does this with a case-insensitive lookup so "ram", "Ram", and "RAM" all collapse to the same contact.

\`\`\`ts
let contactId = null;
if (type === "SALE" || type === "PURCHASE") {
  const existingContact = await prisma.contact.findFirst({
    where: {
      userId: this.userId,
      name: { equals: party, mode: "insensitive" },
    },
  });

  if (existingContact) {
    contactId = existingContact.id;
  } else {
    const newContact = await prisma.contact.create({
      data: {
        userId: this.userId,
        name: party,
        type: type === "SALE" ? "CUSTOMER" : "VENDOR",
      },
    });
    contactId = newContact.id;
  }
}
\`\`\`

Two things worth knowing:

1. \`mode: "insensitive"\` on Prisma's \`equals\` translates to Postgres's \`ILIKE\` under the hood. Without it, \`"Ram"\` and \`"ram"\` would be treated as different contacts and the user's master data would fragment over time.
2. The default \`type\` is inferred from the transaction type (SALE → CUSTOMER, PURCHASE → VENDOR) but it's a guess — the user can overwrite it later via the master-data UI. Inferring rather than asking keeps the AI conversation short.

This pattern is racy under concurrent writes (two find-then-create calls could both miss and both insert duplicates). For a per-user single-writer flow it's safe; the proper fix would be a unique compound index on (userId, lower(name)) and \`upsert\` instead of find-then-create.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'find-or-create', 'sql', 'case-insensitive'],
    repository: repo,
    filePath: 'lib/ai/tools.ts',
    url: blob('lib/ai/tools.ts'),
  },
  {
    title: 'Fail-loud env-var check on module import for required external API keys',
    body: `KhataGO's Gemini client config runs the env check at import time and throws if the key is missing. The reasoning: a missing GEMINI_API_KEY shouldn't degrade silently to "Sorry, I encountered an error..." — it should fail at startup so the symptom shows up in Vercel function logs.

\`\`\`ts
import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error(
    "GEMINI_API_KEY is not set. Add it to Vercel Project Settings → Environment Variables for all environments and redeploy."
  );
}

export const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const MODEL_NAME = "gemini-2.0-flash";

export const generationConfig = {
  temperature: 0.2, // Low temperature for more deterministic actions
  topP: 0.8,
  topK: 40,
  maxOutputTokens: 8192,
};
\`\`\`

The actionable error message is the win — if you're triaging a 500 in production, "GEMINI_API_KEY is not set" with the exact remediation step beats a 50-line stack trace ending in \`undefined.getGenerativeModel is not a function\`.

\`temperature: 0.2\` is also intentional. Tool-using agents need deterministic outputs (the model picks a function to call and fills in the args; creativity hurts). Higher temperature would have Gemini occasionally pick the wrong tool or invent fields outside the schema — the executor would then return errors and the conversation devolves.

The model name comment (\`gemini-2.5-flash fails on legacy SDK's v1beta endpoint in 2026\`) is a paper trail for the "why are we still on 2.0" question that recurs every time a teammate sees a newer version in the docs.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['gemini', 'ai', 'env-vars', 'fail-fast'],
    repository: repo,
    filePath: 'lib/ai/config.ts',
    url: blob('lib/ai/config.ts'),
  },
];
