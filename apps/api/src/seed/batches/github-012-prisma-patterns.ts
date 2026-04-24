/**
 * Batch github-012-prisma-patterns
 *
 * 30 entries on Prisma ORM patterns + internals, sourced from the
 * actual `prisma/prisma` repo (cloned at /tmp/oss/prisma). Every
 * filePath here was verified to exist; quoted code blocks come from
 * those files. Where a pattern is best illustrated by a schema or
 * test fixture inside the repo, that fixture is attributed.
 */

import type { SeedItem } from '../types';

const repo = (owner: string, name: string) => ({ owner, name });

export const BATCH: SeedItem[] = [
  {
    title: 'findUnique vs findFirst — only findUnique gets DataLoader batching',
    body: `Both \`findUnique\` and \`findFirst\` return a single record, but they have very different runtime behaviour. \`findUnique\` requires a unique field (or compound unique) in \`where\` and the engine guarantees at most one row. \`findFirst\` accepts any filter — including non-unique columns — and silently picks the first match according to your \`orderBy\`.

The non-obvious win for \`findUnique\` is that Prisma Client coalesces concurrent calls into a single SQL query. From \`getBatchId.ts\`:

\`\`\`ts
export function getBatchId(query: JsonQuery): string | undefined {
  if (query.action !== 'findUnique' && query.action !== 'findUniqueOrThrow') {
    return undefined
  }
  const parts: string[] = []
  if (query.modelName) {
    parts.push(query.modelName)
  }
  if (query.query.arguments) {
    parts.push(buildKeysString(query.query.arguments))
  }
  parts.push(buildKeysString(query.query.selection))
  return parts.join('')
}
\`\`\`

Two \`findUnique\`s issued in the same tick with the same shape (same model, same selection, same where keys) get a non-undefined batch id and are merged by \`DataLoader\` into one round trip — the classic fix for the GraphQL N+1 problem in resolvers. \`findFirst\` returns \`undefined\` here and is always sent as its own request.

\`\`\`ts
// Inside a GraphQL resolver fired N times in one tick:
const user = await prisma.user.findUnique({ where: { id }, select: { name: true } })
// → coalesced into ONE 'WHERE id IN (...)' query

const user = await prisma.user.findFirst({ where: { id }, select: { name: true } })
// → N separate queries, even if id is the @id column
\`\`\`

Gotcha: the batch key includes the selection. If two callers use the same \`where\` but different \`select\` shapes, they don't batch. That's why a single shared selection helper is worth using inside a request scope.

Use \`findFirst\` only when you genuinely need ordering or non-unique filtering (e.g., "the most recent post by this user"). Reach for \`findUnique\` everywhere else, especially in DataLoader-shaped code paths.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'orm', 'findunique', 'dataloader', 'n+1'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client/src/runtime/core/jsonProtocol/getBatchId.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client/src/runtime/core/jsonProtocol/getBatchId.ts',
  },
  {
    title: 'DataLoader: how Prisma actually coalesces findUnique calls',
    body: `Prisma's \`DataLoader\` (not the npm package — its own minimal version) is what turns N adjacent \`findUnique\` calls into one SQL query. The trick is \`process.nextTick\`: requests collected within the same micro-task burst share a batch.

\`\`\`ts
request(request: T): Promise<any> {
  const hash = this.options.batchBy(request)
  if (!hash) {
    return this.options.singleLoader(request)
  }
  if (!this.batches[hash]) {
    this.batches[hash] = []
    if (!this.tickActive) {
      this.tickActive = true
      process.nextTick(() => {
        this.dispatchBatches()
        this.tickActive = false
      })
    }
  }
  return new Promise((resolve, reject) => {
    this.batches[hash].push({ request, resolve, reject })
  })
}
\`\`\`

\`batchBy\` is the function from \`getBatchId.ts\` — only \`findUnique(OrThrow)\` returns a non-undefined hash. Everything else short-circuits to \`singleLoader\`.

In \`dispatchBatches\` Prisma even degrades gracefully: if only one request landed in the batch, it skips the IN-list query and uses the single-row path:

\`\`\`ts
if (batch.length === 1) {
  this.options.singleLoader(batch[0].request)
\`\`\`

Why \`process.nextTick\` and not \`setImmediate\` or a microtask? \`nextTick\` fires after the current operation but before any I/O — fast enough that GraphQL resolvers feel synchronous, slow enough that callers in the same tick all hit the same batch. Microtasks (Promise jobs) drain repeatedly within a single tick; using one would batch fewer requests because new work could arrive in subsequent microtask drains. \`setImmediate\` runs after I/O — too late, the network round trip would already have started for the first call.

Three production gotchas:

1. **Batching is strictly per-tick.** If your resolver \`await\`s anything between two \`findUnique\` calls, they end up in different ticks and won't batch. The fix is to fire all the lookups eagerly with \`Promise.all\` (or use \`include\` on the parent query so Prisma joins on the server side).

2. **The batch limit is provider-specific.** Postgres can take 32K parameters per query but most JDBC-shaped clients cap around 1000. If you fan out 10K \`findUnique\` calls in one tick, the engine splits them into multiple IN-list queries — still better than 10K round trips, but watch query planner cost.

3. **\`tickActive\` is a single boolean, not per-batch-key.** All hashes share one \`nextTick\`, so a fast-arriving findUnique for User and one for Post in the same tick both dispatch in the same tick — but as two separate SQL queries (because the hash differs).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'dataloader', 'batching', 'n+1', 'internals'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client/src/runtime/DataLoader.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client/src/runtime/DataLoader.ts',
  },
  {
    title: '$transaction: interactive callback vs sequential array',
    body: `\`$transaction\` has two completely different shapes — Prisma picks which one to run by checking whether you passed a function or an array. The dispatch lives in \`getPrismaClient.ts\`:

\`\`\`ts
if (typeof input === 'function') {
  if (this._engineConfig.adapter?.adapterName === '@prisma/adapter-d1') {
    callback = () => {
      throw new Error(
        'Cloudflare D1 does not support interactive transactions. ...'
      )
    }
  } else if (config.activeProvider === 'mongodb' && getItxScopeContext(this).kind === 'nested') {
    callback = () => { throw new PrismaClientValidationError(...) }
  } else {
    callback = () => this._transactionWithCallback({ callback: input, options })
  }
} else {
  // Batch transaction
  callback = () => this._transactionWithArray({ promises: input, options })
}
\`\`\`

The two shapes have very different semantics:

\`\`\`ts
// Sequential array — all queries are sent as one batch in one tx
await prisma.$transaction([
  prisma.user.create({ data: { email } }),
  prisma.audit.create({ data: { event: 'signup' } }),
])

// Interactive — you can branch on intermediate results
await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({ data: { email } })
  if (user.role === 'admin') {
    await tx.audit.create({ data: { event: 'admin-signup', userId: user.id } })
  }
})
\`\`\`

Use the array form whenever you don't need to read between writes — it's cheaper because Prisma sends one round trip and the engine wraps the statements in a single \`BEGIN/COMMIT\` server-side.

Use the interactive form when later writes depend on earlier reads. The cost is real: every statement is a separate round trip while the connection is held in BEGIN. If your callback hangs (await fetch to Stripe…), you can hold the pool connection for seconds and starve other requests.

Gotchas. Cloudflare D1 doesn't support interactive transactions at all (see the throw above) — refactor to the array form. MongoDB doesn't support nested transactions. And for both shapes, the default \`timeout\` is 5s and \`maxWait\` is 2s; bump them via the second arg if you have legitimately long work.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'transactions', 'itx', 'concurrency'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client/src/runtime/getPrismaClient.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client/src/runtime/getPrismaClient.ts',
  },
  {
    title: 'Transaction options: maxWait, timeout, isolationLevel',
    body: `Prisma's interactive transaction options are exactly three knobs. The type definition (\`transaction.ts\` in client-engine-runtime) is the canonical reference:

\`\`\`ts
export type Options = {
  /// Timeout for starting the transaction [ms]
  maxWait?: number

  /// Timeout for the transaction body [ms]
  timeout?: number

  /// Transaction isolation level
  isolationLevel?: IsolationLevel
  newTxId?: string
}
\`\`\`

\`maxWait\` is how long the client will wait for the engine to actually open a transaction (acquire a connection). \`timeout\` is how long the body callback can run before being rolled back. The defaults are 2s / 5s respectively — fine for OLTP, way too short for any callback that calls a third-party API.

The implementation in \`transaction-manager.ts\` shows that \`maxWait\` is enforced via an \`AbortController\` and the engine gracefully rolls back if a connection eventually arrives after the timeout fired:

\`\`\`ts
const startTimer = createTimeoutIfDefined(() => abortController.abort(), options.maxWait)
// ...
transaction.transaction = await Promise.race([
  startTransactionPromise.finally(() => clearTimeout(startTimer)),
  once(abortController.signal, 'abort').then(() => undefined),
])
\`\`\`

Note the recovery path: even after \`maxWait\` fires, if \`startTransaction\` later succeeds in the background, Prisma issues a rollback so the connection is released back to the pool — without that, a slow PgBouncer plus an aggressive \`maxWait\` would silently leak connections.

\`\`\`ts
await prisma.$transaction(async (tx) => {
  await tx.payment.create({ data })
  await chargeStripe(amount)              // external call
}, {
  maxWait: 5_000,                          // wait up to 5s for a connection
  timeout: 30_000,                         // allow 30s for the body
  isolationLevel: 'Serializable',
})
\`\`\`

Gotcha: never put long external IO inside an interactive transaction. Prisma will hold the underlying SQL connection (BEGIN, no commit) for the entire callback. With a pool of 10 connections and a 30-second Stripe call, you've capped your throughput at 10/30s ≈ 0.33 RPS. Charge Stripe first; record the result in a short transaction after.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'transactions', 'isolation', 'pooling'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client-engine-runtime/src/transaction-manager/transaction.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client-engine-runtime/src/transaction-manager/transaction.ts',
  },
  {
    title: '$queryRaw vs $executeRaw vs $queryRawUnsafe — where SQL injection lives',
    body: `Prisma exposes four raw SQL methods. Two are safe by construction; two are explicit foot-guns. The implementation in \`rawQueryArgsMapper.ts\` shows how the safe forms turn template literals into prepared statements:

\`\`\`ts
case 'cockroachdb':
case 'postgresql':
case 'postgres': {
  queryString = args.text
  parameters = {
    values: serializeRawParameters(args.values),
    __prismaRawParameters__: true,
  }
  break
}
\`\`\`

When you call \`prisma.$queryRaw\`<users where email = \${email}>\`\`, Prisma gets a tagged-template object with separate \`text\` (\`select * from users where email = $1\`) and \`values\` arrays. Those go into a parameterized query — \`email\` is never spliced into the SQL string.

Compare to \`$queryRawUnsafe\` / \`$executeRawUnsafe\`. They take a raw string. Anything you concatenate into that string is part of the SQL:

\`\`\`ts
// SAFE — $email is bound as a parameter
await prisma.$queryRaw\`SELECT * FROM "User" WHERE email = \${email}\`

// SAFE — Prisma.sql() composes parameterized fragments
await prisma.$queryRaw(Prisma.sql\`SELECT * FROM "User" WHERE id = \${id}\`)

// UNSAFE — anything in \${email} ends up as raw SQL
await prisma.$queryRawUnsafe(\`SELECT * FROM "User" WHERE email = '\${email}'\`)
\`\`\`

The same file also blocks one specific footgun — running ALTER through the unsafe path with bound values, which Postgres can't parameterize:

\`\`\`ts
if (values.length > 0 && ALTER_RE.exec(query)) {
  throw new Error(\`Running ALTER using \${invalidCall} is not supported ...\`)
}
\`\`\`

\`$executeRaw\` returns the affected row count (use for INSERT/UPDATE/DELETE). \`$queryRaw\` returns rows. The Unsafe variants exist for one reason: when you genuinely need dynamic identifiers (table or column names), which Postgres won't bind. In every other case, prefer the tagged-template form — there's no perf difference and the safety property is free.

Gotcha: \`Prisma.sql\` fragments compose, but \`Prisma.raw\` is the same as Unsafe. \`Prisma.raw(userInput)\` is an injection just like string concatenation.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'sql-injection', 'raw-query', 'security'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client/src/runtime/core/raw-query/rawQueryArgsMapper.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client/src/runtime/core/raw-query/rawQueryArgsMapper.ts',
  },
  {
    title: 'upsert: atomic create-or-update in one round trip',
    body: `\`upsert\` looks up a record by a unique key, runs \`create\` if it's missing or \`update\` if it exists. Prisma compiles it to provider-specific atomic SQL — \`INSERT ... ON CONFLICT DO UPDATE\` on Postgres, \`INSERT ... ON DUPLICATE KEY UPDATE\` on MySQL — so two clients racing for the same key won't both create.

The action is a recognised write in \`isWrite.ts\`:

\`\`\`ts
const writeMap: Record<JsonQueryAction, boolean> = {
  // ...
  upsertOne: true,
  // ...
}
\`\`\`

A typical use:

\`\`\`ts
await prisma.user.upsert({
  where:  { email: 'ada@example.com' },
  update: { lastSeen: new Date() },
  create: { email: 'ada@example.com', name: 'Ada' },
})
\`\`\`

Three trade-offs people forget:

1. **\`update\` is partial; \`create\` is total.** If you add a new required column to the schema, every \`create\` block must include it but \`update\` blocks don't. Forgetting to update only the \`create\` is a P2011 NullConstraintViolation when the row genuinely doesn't exist yet — flaky in dev, latent in prod.

2. **\`where\` must reference a unique field or compound \`@@unique\`.** Otherwise the engine can't generate the conflict clause and rejects the call client-side. If you're unique-on-(\`tenantId\`, \`slug\`), use \`{ where: { tenantId_slug: { tenantId, slug } } }\`.

3. **It's not a no-op when the row exists.** Even \`update: {}\` on Postgres still executes the \`ON CONFLICT DO UPDATE\` branch (which writes \`xmax\` and bumps the tuple). On MySQL with \`ON DUPLICATE KEY UPDATE id = id\`, it touches no columns but still writes a binlog row. If "create or do nothing" is what you actually want, use \`createMany({ skipDuplicates: true })\` instead — see batch entry on bulk operations.

Gotcha: if you're upserting a row inside a hot loop (analytics aggregation, idempotency keys), wrap it in a \`$transaction\` array form along with the dependent reads — interactive transactions hold a connection per upsert and don't batch. Even better: precompute conflicts in memory and \`createMany({ skipDuplicates: true })\` once.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'upsert', 'atomicity', 'on-conflict'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client/src/runtime/core/jsonProtocol/isWrite.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client/src/runtime/core/jsonProtocol/isWrite.ts',
  },
  {
    title: 'Connection pooling with the pg adapter — and why a Pool can be passed in',
    body: `Prisma's Postgres driver adapter wraps node-postgres' \`Pool\`. The factory accepts either a connection string, a \`PoolConfig\`, or — crucially — an existing \`pg.Pool\` instance you've already constructed:

\`\`\`ts
private readonly config: pg.PoolConfig
private externalPool: pg.Pool | null

if (poolOrConfig instanceof pg.Pool) {
  this.externalPool = poolOrConfig
  this.config = poolOrConfig.options
} else if (typeof poolOrConfig === 'string') {
  this.externalPool = null
  this.config = { connectionString: poolOrConfig }
} else {
  this.externalPool = null
  this.config = poolOrConfig
}
\`\`\`

This three-way constructor is the fix for two real production problems.

**Problem 1: serverless cold starts open a new pool every invocation.** On Vercel/Lambda, your handler module reloads on cold start; if you construct \`new PrismaClient()\` inside the handler, you get a fresh pool every time, blow past the database \`max_connections\`, and start hitting P1001. The fix is to hoist the client (and its pool) to module scope so warm invocations share it.

**Problem 2: you want pgBouncer in transaction mode.** PgBouncer in transaction-pooling mode rotates the underlying connection between statements — that breaks prepared statements (which are per-connection). The pg adapter exposes the option to disable prepares; pass a \`pg.Pool\` you've configured for your environment and Prisma will use it as-is.

\`\`\`ts
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,                  // tune for serverless
  idleTimeoutMillis: 10_000,
})
const adapter = new PrismaPg(pool)
export const prisma = new PrismaClient({ adapter })
\`\`\`

The adapter exposes \`disposeExternalPool: false\` so calling \`prisma.$disconnect()\` doesn't tear down a pool you might still want for raw queries. Gotcha: if you DO want Prisma to own the pool, omit the external instance — otherwise you'll leak the pool when Prisma disconnects but the \`pg.Pool\` keeps its idle clients open.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'connection-pool', 'pg', 'pgbouncer', 'serverless'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/adapter-pg/src/pg.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/adapter-pg/src/pg.ts',
  },
  {
    title: '$extends: the modern replacement for $use middleware',
    body: `\`$extends\` is the Prisma Client extension API. Implementation is tiny — it returns a new client that inherits from the original and appends the extension to a list:

\`\`\`ts
export function $extends(this: Client, extension: ExtensionArgs | ((client: Client) => Client)): Client {
  if (typeof extension === 'function') {
    return extension(this)
  }
  const newClient = Object.create(this._originalClient, {
    _extensions: { value: this._extensions.append(extension) },
    _appliedParent: { value: this, configurable: true },
    $on: { value: undefined },
  }) as Client
  return applyModelsAndClientExtensions(newClient)
}
\`\`\`

Three things matter here. First, \`$on\` is set to \`undefined\` on the extended client — extensions don't inherit event listeners, you have to attach them on the base. Second, the result is a NEW client; the original is unchanged. Third, extensions stack via \`_extensions.append\`, so calling \`$extends\` twice gives you both layers.

Compare with the legacy \`$use\` middleware (still present in \`QueryMiddlewareParams.ts\` for backward compat):

\`\`\`ts
prisma.$use(async (params, next) => {
  const before = Date.now()
  const result = await next(params)
  console.log(\`\${params.model}.\${params.action} took \${Date.now() - before}ms\`)
  return result
})
\`\`\`

The four sub-APIs of \`$extends\` cover everything middleware did and more:

- \`query\` — wraps a query call, like \`$use\`, but typed per model+action
- \`model\` — adds methods to a specific model (e.g. \`prisma.user.signUp\`)
- \`result\` — adds computed fields (e.g. \`fullName\`)
- \`client\` — adds methods to the client itself

Gotcha: \`$extends\` returns a NEW client, while \`$use\` mutates the existing one. Code that does \`const ext = prisma.$extends(...)\` and keeps using \`prisma\` will silently bypass the extension. Either reassign (\`prisma = prisma.$extends(...)\`) or always export the extended one.

The Prisma team has explicitly marked \`$use\` as superseded; new code should reach for \`$extends\` because it's typed, composable, and doesn't require global mutation.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'extends', 'middleware', 'extensions'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client/src/runtime/core/extensions/$extends.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client/src/runtime/core/extensions/$extends.ts',
  },
  {
    title: 'defineExtension: package an extension for reuse',
    body: `When you build an extension as a library (e.g. an audit-log layer used in three services), you don't want consumers to learn the \`$extends\` API. \`defineExtension\` is the tiny helper that lets a library export a function consumers just hand to \`$extends\`:

\`\`\`ts
export function defineExtension(ext: ExtensionArgs | ((client: Client) => Client)) {
  if (typeof ext === 'function') {
    return ext
  }
  return (client: Client) => client.$extends(ext)
}
\`\`\`

That's the whole implementation. The point is type inference: by accepting either an args object or a function, library authors get a single ergonomic call site, and consumers get back a function with the right \`Client\` types preserved.

Library code:

\`\`\`ts
// my-audit-log/index.ts
import { Prisma } from '@prisma/client'
export const auditLog = Prisma.defineExtension({
  name: 'auditLog',
  query: {
    $allModels: {
      async create({ args, query, model }) {
        const result = await query(args)
        await fetch('/audit', { method: 'POST', body: JSON.stringify({ model, args }) })
        return result
      },
    },
  },
})
\`\`\`

Consumer code:

\`\`\`ts
// app/db.ts
import { PrismaClient } from '@prisma/client'
import { auditLog } from 'my-audit-log'
export const prisma = new PrismaClient().$extends(auditLog)
\`\`\`

Gotcha: \`name\` is optional in the \`ExtensionArgs\` type but you should always set it — it's what shows up in error stacks and in the engine's debug logs when an extension throws. Without a name, debugging "TypeError in some extension" across three layered extensions is painful.

Also: extensions are NOT inherited across \`$transaction\` interactive callbacks. Inside the \`tx\` parameter you get a vanilla client. If your extension is doing audit-logging, it won't see writes inside an interactive tx. Use the array form of \`$transaction\`, or re-extend the \`tx\` inside the callback (cheap because it's just an Object.create).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'extensions', 'defineExtension', 'libraries'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client/src/runtime/core/extensions/defineExtension.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client/src/runtime/core/extensions/defineExtension.ts',
  },
  {
    title: 'Computed fields via $extends.result — lazy and cached',
    body: `\`result\` extensions add fields to a model that are computed from other fields. The implementation in \`applyResultExtensions.ts\` shows two important properties: lazy evaluation and per-row caching.

\`\`\`ts
function computedPropertyLayer(field: ComputedField, result: object): CompositeProxyLayer {
  return cacheProperties(addProperty(field.name, () => field.compute(result)))
}
\`\`\`

The computed value is wrapped in \`cacheProperties\`, which means \`row.fullName\` runs the compute function on first access, then memoises. Reading it five times costs one compute. The function only runs at all if you actually access the property — printing the row to JSON.stringify will trigger it, but ignoring it doesn't.

The other interesting bit: dependencies. Each computed field declares a \`needs\` array, and the engine respects \`select\` / \`omit\`:

\`\`\`ts
} else if (select) {
  if (!select[field.name]) {
    continue
  }
  const toMask = field.needs.filter((prop) => !select[prop])
  if (toMask.length > 0) {
    maskingLayers.push(removeProperties(toMask))
  }
}
\`\`\`

If you \`select: { fullName: true }\` but didn't ask for \`firstName\` and \`lastName\` directly, Prisma still queries them from the database (the compute needs them) but masks them from the returned object. Result: the consumer sees only the computed field, but the engine fetched the dependencies.

\`\`\`ts
const prisma = new PrismaClient().$extends({
  result: {
    user: {
      fullName: {
        needs: { firstName: true, lastName: true },
        compute: (u) => \`\${u.firstName} \${u.lastName}\`,
      },
    },
  },
})

const u = await prisma.user.findFirst({ select: { fullName: true } })
// SQL still SELECTs firstName + lastName, but u only exposes { fullName }
\`\`\`

Gotcha: \`compute\` is sync. If you need an async derived value (call to another service, JWT decode), do it at the query layer instead — \`result\` runs synchronously inside the proxy. And \`needs\` only types the dependency for the type system; if you forget a dep at runtime, \`compute\` gets \`undefined\` and you ship a silent bug.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'extensions', 'computed-fields', 'result'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client/src/runtime/core/extensions/applyResultExtensions.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client/src/runtime/core/extensions/applyResultExtensions.ts',
  },
  {
    title: 'include vs select — over-fetching, under-fetching, and the type story',
    body: `\`include\` and \`select\` look similar but model very different intents. \`select\` is opt-in: list exactly the fields you want and you get only those. \`include\` is opt-in for relations only: you keep all scalar columns and additionally pull a relation.

\`\`\`ts
// All scalar columns of Post + the related author
await prisma.post.findMany({ include: { author: true } })

// Only id, title, and the author's id+email
await prisma.post.findMany({
  select: {
    id: true,
    title: true,
    author: { select: { id: true, email: true } },
  },
})
\`\`\`

You cannot mix \`include\` and \`select\` at the same level — Prisma will throw a validation error. The reason is type inference: the result type is computed from whichever you pass, and combining them creates an ambiguous shape.

The TypeScript type narrowing is generated by the client generator. The relevant generator file is \`SelectIncludeOmit.ts\`:

\`\`\`ts
const selectType = ts...
return buildExport(typeName, selectType)
\`\`\`

Each model gets a \`UserSelect\`, \`UserInclude\`, and \`UserOmit\` type. The result type narrows precisely to the shape you asked for — \`{ id: string; title: string; author: { id: string; email: string } }\` for the second example, with NO \`content\` or \`createdAt\` fields. This is what makes Prisma feel safer than knex/typeorm.

When to use which:

- **\`include\`** — quick prototyping, when you actually need every column anyway, when the row is small.
- **\`select\`** — production code paths that hit big rows. A 50KB \`Post.body\` field you don't render costs you 50KB × N rows on every list query.
- **\`omit\`** — newer than the other two. Good for "everything except the password hash" patterns where the model has 20 columns and you don't want to list 19 of them in \`select\`.

Gotcha: \`include\` of a 1-many relation does NOT paginate by default. \`include: { posts: true }\` on a user with 10K posts will pull all 10K. Use \`include: { posts: { take: 20 } }\` or do a separate \`findMany\` with a \`where: { authorId: ... }\` filter.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'select', 'include', 'over-fetching', 'codegen'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client-generator-ts/src/TSClient/SelectIncludeOmit.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client-generator-ts/src/TSClient/SelectIncludeOmit.ts',
  },
  {
    title: 'Cursor-based pagination — the only sane choice for big lists',
    body: `Prisma supports both offset (\`take\` + \`skip\`) and cursor pagination. Use cursor for anything bigger than ~1000 rows.

\`\`\`ts
// Offset — the database scans + discards the first 10000 rows
await prisma.post.findMany({ take: 20, skip: 10_000, orderBy: { id: 'asc' } })

// Cursor — the database seeks via the index, no scan
await prisma.post.findMany({
  take: 20,
  cursor: { id: lastSeenId },
  skip: 1,                       // skip the cursor itself
  orderBy: { id: 'asc' },
})
\`\`\`

The Prisma JSON-protocol layer treats \`cursor\` as a first-class arg in the serialized query (see \`serializeJsonQuery.ts\` for the action map listing \`findMany\`). The engine compiles it to a \`WHERE id > ?\` predicate (for ascending), so the database can use the primary-key index instead of scanning.

Why offset is bad in production: \`OFFSET 10000\` means the database fetches and discards 10000 rows before the first one you wanted. With a 100K-row table and pagination at the end, that's a full table scan per page — what looked like O(1) is actually O(n).

Why cursor is better: \`WHERE id > ?\` uses the primary-key B-tree, so each page is O(log n) regardless of where in the result set you are. The trade-off is you lose page numbers ("you're on page 47 of 200") — only "next" / "previous" navigation works.

A third option that's even faster than cursor for some shapes:

\`\`\`ts
// Keyset pagination by a non-id field — needs an index on (createdAt, id)
const page = await prisma.post.findMany({
  where: {
    OR: [
      { createdAt: { lt: lastCreatedAt } },
      { createdAt: lastCreatedAt, id: { lt: lastId } },  // tiebreaker
    ],
  },
  take: 20,
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
})
\`\`\`

The tiebreaker on \`id\` is critical when \`createdAt\` isn't unique — without it, a page boundary that lands inside a group of rows with the same timestamp will silently drop or duplicate rows.

Gotcha: \`cursor\` requires the field to be unique (or be part of a compound \`@@unique\`). Otherwise the engine can't reliably resume from "after this row" — there might be many rows tied on that value. Use \`@id\` or a compound \`@@unique\` for your cursor key.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'pagination', 'cursor', 'performance'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client/src/runtime/core/jsonProtocol/serializeJsonQuery.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client/src/runtime/core/jsonProtocol/serializeJsonQuery.ts',
  },
  {
    title: 'groupBy: a thin sugar over aggregate',
    body: `\`groupBy\` is implemented as a tiny transformation on top of \`aggregate\`. The whole desugar lives in \`groupBy.ts\`:

\`\`\`ts
function desugarUserArgs(args: UserArgs = {}) {
  const _args = desugarUserArgsAggregate(args)

  // we desugar the array into { [key]: boolean }
  if (Array.isArray(_args['by'])) {
    for (const key of _args['by']) {
      if (typeof key === 'string') {
        _args['select'][key] = true
      }
    }
  } else if (typeof _args['by'] === 'string') {
    _args['select'][_args['by']] = true
  }

  return _args
}
\`\`\`

Then the unpacker re-flattens the \`_count: { _all: 5 }\` shape that the engine returns into \`_count: 5\` for the \`true\` form:

\`\`\`ts
return (data: object[]) => {
  if (typeof args?.['_count'] === 'boolean') {
    data.forEach((row) => {
      row['_count'] = row['_count']['_all']
    })
  }
  return data
}
\`\`\`

In practice:

\`\`\`ts
// 5 posts per author, sorted by count desc
const stats = await prisma.post.groupBy({
  by: ['authorId'],
  _count: true,
  orderBy: { _count: { authorId: 'desc' } },
  having: { _count: { authorId: { gt: 5 } } },
})
// → [{ authorId: 1, _count: 42 }, { authorId: 7, _count: 18 }, ...]
\`\`\`

Three trade-offs:

1. **\`having\` is repeated in groupBy.** The \`{ _count: { authorId: { gt: 5 } } }\` shape feels redundant but reflects the SQL: \`HAVING COUNT(authorId) > 5\`. Prisma needs to know which aggregate it's filtering on.

2. **You can't \`select\` arbitrary fields.** \`groupBy\` only returns the columns in \`by\` plus aggregates. To get a "representative row" per group (latest post per user), do a separate \`findFirst\` per group — or use a window function via \`$queryRaw\` (Prisma doesn't yet expose them).

3. **Aggregates of nullable columns.** \`_avg\` / \`_sum\` ignore nulls (SQL standard); \`_count\` of a column counts non-nulls. If a row has \`amount: null\`, \`_count: { amount: true }\` skips it but \`_count: { _all: true }\` includes it. Use \`_all\` for "row count," column counts for "non-null count."

Gotcha: \`groupBy\` requires every column you \`orderBy\` to be in \`by\` or be an aggregate. The engine throws a validation error otherwise — same constraint as standard SQL \`GROUP BY\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'groupby', 'aggregate', 'analytics'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client/src/runtime/core/model/aggregates/groupBy.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client/src/runtime/core/model/aggregates/groupBy.ts',
  },
  {
    title: 'createMany + skipDuplicates: bulk inserts with idempotency',
    body: `\`createMany\` is Prisma's bulk insert. It compiles to a single multi-row \`INSERT\` and is dramatically faster than N individual \`create\` calls — one round trip, one statement, one pass through the WAL.

\`\`\`ts
// Safe and fast for 1000 rows: ONE network call, ONE INSERT
await prisma.event.createMany({
  data: events.map((e) => ({ kind: e.kind, payload: e.payload })),
  skipDuplicates: true,  // ON CONFLICT DO NOTHING (Postgres) / IGNORE (MySQL)
})
\`\`\`

It's listed in the write map alongside its sibling \`createManyAndReturn\`:

\`\`\`ts
const writeMap: Record<JsonQueryAction, boolean> = {
  // ...
  createMany: true,
  createManyAndReturn: true,
  // ...
}
\`\`\`

\`skipDuplicates\` is the most useful flag: any row that would violate a unique constraint is silently skipped instead of throwing P2002. Pair it with a unique key like \`@@unique([userId, eventKey])\` and \`createMany\` becomes a clean idempotency primitive — replay a batch and it's a no-op, no try/catch needed.

Three production gotchas:

1. **Returns a count, not the rows.** If you need the inserted rows back (e.g., to use their auto-generated ids), use \`createManyAndReturn\` (Postgres + CockroachDB only — uses \`RETURNING\`). On MySQL or SQLite you'll have to query them after by some natural key.

2. **\`skipDuplicates\` is NOT supported on MongoDB or SQLServer.** The flag throws a validation error on those providers because their conflict semantics differ. Catch P2002 manually if you target those databases.

3. **Nested writes don't work.** \`createMany\` accepts only scalar fields — no \`{ author: { connect: ... } }\` nested syntax. Pass the FK column directly (\`authorId\`). If you genuinely need to create N parents and their children atomically, use a \`$transaction\` array of \`create\` calls; it's slower but works.

The single round-trip nature is the win. A loop of \`for (e of events) await prisma.event.create(...)\` makes 1000 SQL round trips. \`createMany\` makes 1. On a 50ms-RTT database that's the difference between 50 seconds and 50ms.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'createmany', 'bulk', 'idempotency', 'skipDuplicates'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client/src/runtime/core/jsonProtocol/isWrite.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client/src/runtime/core/jsonProtocol/isWrite.ts',
  },
  {
    title: 'P2002 / P2003 / P2025 — the three error codes you actually catch',
    body: `Prisma maps every database-side error onto a \`P\`-prefixed code. The mapping for driver-adapter errors lives in \`user-facing-error.ts\`:

\`\`\`ts
case 'UniqueConstraintViolation':
  return 'P2002'
case 'ForeignKeyConstraintViolation':
  return 'P2003'
\`\`\`

And for "operation expected a row that didn't exist" (the \`OrThrow\` family, plus failed updates/deletes), \`validation.ts\` returns:

\`\`\`ts
case 'MISSING_RECORD':
case 'MISSING_RELATED_RECORD':
case 'INCOMPLETE_CONNECT_INPUT':
  return 'P2025'
\`\`\`

These three codes cover ~90% of the catches you'll write in real apps:

\`\`\`ts
import { Prisma } from '@prisma/client'

try {
  await prisma.user.create({ data: { email } })
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    switch (e.code) {
      case 'P2002':
        // duplicate email — return a 409, not a 500
        return res.status(409).json({ error: 'EMAIL_TAKEN', target: e.meta?.target })
      case 'P2003':
        // FK violation — userId references nothing
        return res.status(400).json({ error: 'INVALID_REFERENCE' })
      case 'P2025':
        // updateOrThrow / deleteOrThrow couldn't find the row
        return res.status(404).json({ error: 'NOT_FOUND' })
    }
  }
  throw e
}
\`\`\`

The \`meta\` field carries useful detail. For P2002, \`meta.target\` is the array of fields that conflicted — handy for "which field is duplicate?" UI. For P2003, \`meta.field_name\` is the FK that failed.

Gotcha: P2002 fires from \`createMany\` ONLY if you didn't pass \`skipDuplicates: true\`. With that flag, conflicting rows are silently skipped — your catch never runs. A common bug: assuming a try/catch P2002 means "ALL rows failed," when in fact only some did. Check the returned \`{ count }\` against your input length to see how many actually inserted.

Also: P2025 is thrown for \`update\` / \`delete\` when the row doesn't exist, not P2001. P2001 is "Record searched for in WHERE does not exist" and is rarer (it surfaces on certain nested operations). Always handle both if you're being defensive.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'error-codes', 'p2002', 'p2003', 'p2025'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client-engine-runtime/src/user-facing-error.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client-engine-runtime/src/user-facing-error.ts',
  },
  {
    title: 'migrate dev vs migrate deploy — never run dev in production',
    body: `\`prisma migrate dev\` and \`prisma migrate deploy\` are two completely different commands. Confusing them is one of the most common Prisma incidents.

The dev command's help text in \`MigrateDev.ts\` describes its full job:

\`\`\`
Create a migration from changes in Prisma schema, apply it to the database, trigger generators (e.g. Prisma Client)
\`\`\`

So \`migrate dev\` does FOUR things: diff the schema against the database, write a new SQL migration file, run it, and re-generate the client. It also expects to be able to drop and recreate the shadow database, and will prompt before destructive operations.

\`migrate deploy\`'s help text in \`MigrateDeploy.ts\` is one line:

\`\`\`
Apply pending migrations to update the database schema in production/staging
\`\`\`

Just one job: read the migrations folder, apply any that aren't yet recorded in \`_prisma_migrations\`. No diffing, no schema-to-migration generation, no shadow database. Suitable for CI and production.

Why the split:

\`\`\`bash
# In dev — you change the schema, run this, it writes a SQL file
prisma migrate dev --name add_email_index

# In CI / prod — only applies what's already in git
prisma migrate deploy
\`\`\`

Three production-incident causes:

1. **Running \`migrate dev\` in production.** Dev tries to introspect the database, detect drift, and reset if needed. On a production DB it can prompt to drop tables. Always use \`deploy\`.

2. **Running \`db push\` in production.** \`db push\` is for prototyping — it syncs schema → DB without writing a migration file. The change is invisible to git. Subsequent \`migrate deploy\` calls won't know about it. Result: drift errors that need \`migrate resolve\` to fix.

3. **Skipping the shadow database in CI.** \`migrate dev\` in CI tries to validate the new migration against a shadow database. If you don't grant \`CREATE DATABASE\`, dev fails. Set \`shadowDatabaseUrl\` to a permanent ephemeral DB, or just don't run \`migrate dev\` in CI at all — generate migrations locally and commit them.

Gotcha: when a deploy fails partway (the migration ran but \`_prisma_migrations\` wasn't updated), use \`migrate resolve --applied <id>\` to mark it done. Re-running \`deploy\` would try to apply the same SQL again and fail.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'migrate', 'deploy', 'production'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/migrate/src/commands/MigrateDeploy.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/migrate/src/commands/MigrateDeploy.ts',
  },
  {
    title: 'migrate resolve: the escape hatch when migration history goes wrong',
    body: `\`prisma migrate resolve\` is the only tool you should reach for when a deploy half-applies a migration. The help text in \`MigrateResolve.ts\` is honest about the use cases:

\`\`\`
Resolve issues with database migrations in deployment databases:
- recover from failed migrations
- baseline databases when starting to use Prisma Migrate on existing databases
- reconcile hotfixes done manually on databases with your migration history
\`\`\`

Two flags, opposite effects:

\`\`\`
--applied      Record a specific migration as applied
--rolled-back  Record a specific migration as rolled back
\`\`\`

Neither flag changes the database schema. They only change the rows in \`_prisma_migrations\` so that subsequent \`migrate deploy\` calls behave correctly.

The three real-world scenarios:

1. **Baselining a legacy database.** You're adopting Prisma on a database with 50 existing tables. You generate an initial migration that creates all those tables, but the tables already exist — running it would fail. The fix:

\`\`\`bash
# Mark the initial migration as already applied without running it
prisma migrate resolve --applied 20240101000000_init
\`\`\`

2. **Recovering from a failed migration.** A migration ran on prod but timed out halfway. The schema is in an unknown state. After manually fixing the schema (or rolling back via your own SQL), tell Prisma:

\`\`\`bash
# Mark as rolled back so deploy will retry it
prisma migrate resolve --rolled-back 20240315142000_add_index

# OR, if you completed the migration manually:
prisma migrate resolve --applied 20240315142000_add_index
\`\`\`

3. **Reconciling a hotfix.** A DBA dropped an index manually at 3am to fix a performance issue. Now your migration history doesn't match reality. Either re-create the index in a new migration, or drop the index from your schema and run \`migrate resolve --applied\` on a no-op migration that documents the change.

Gotcha: \`migrate resolve\` doesn't validate that the schema actually matches the migration. You can mark a migration applied that was never run, and Prisma will believe you. The next \`migrate dev\` will then detect drift and want to "fix" it, possibly destructively. Always run \`prisma migrate status\` after a resolve to confirm the state.

Critical: never use \`migrate resolve\` in dev to skip a migration you don't like. Just delete the migration folder and re-run \`migrate dev\`. Resolve is strictly for production states that can't be reset.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'migrate', 'resolve', 'incident-recovery'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/migrate/src/commands/MigrateResolve.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/migrate/src/commands/MigrateResolve.ts',
  },
  {
    title: 'db push vs migrate dev — the prototype-vs-production divide',
    body: `\`prisma db push\` is the alternative to \`migrate dev\`. Both reconcile your schema against the database, but they're for very different stages of a project. From the help text in \`DbPush.ts\`:

\`\`\`
Push the state from your Prisma schema to your database
\`\`\`

That's the entire description — and the distinction. \`db push\` syncs schema → database WITHOUT writing a migration file. There's no SQL artifact, no entry in \`_prisma_migrations\`, no history.

When to use \`db push\`:

- Day 1 of a prototype, schema is changing every five minutes
- A short-lived feature branch where you don't want to commit migration noise
- A test database that's wiped between runs

When NOT to use \`db push\`:

- Any database that other developers or CI deploys to
- Any database that holds data you'd cry about losing
- Production. Ever.

The flags hint at the hazard:

\`\`\`
--accept-data-loss   Ignore data loss warnings
--force-reset        Force a reset of the database before push
\`\`\`

\`db push\` will warn before destructive operations (dropping a column with data in it), but \`--accept-data-loss\` makes it silent. \`--force-reset\` blows the whole DB away.

The trap that bites teams: a developer runs \`db push\` against the staging database to "just try" a schema change. The change works locally and in staging, so they ship the schema to git. Now production deploy via \`migrate deploy\` has no migration to run — but staging's schema also has no migration recorded. \`migrate dev\` in another developer's branch detects "drift" and tries to reset.

Once you've shipped a schema with real users, the upgrade path is one-way: \`migrate dev\` → commit migration files → \`migrate deploy\` in CI. Never go back to \`db push\` even for a "tiny change" — it doesn't write a migration, so the change is invisible to anyone else's git history.

Gotcha: \`db push\` is fine for the very specific case of "this database is mine and ephemeral." Test runners are a great fit — spin up a fresh Postgres, \`db push\` the schema, run tests, kill the container. No migrations needed because the database is born and dies inside one CI job.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'db-push', 'migrate', 'prototyping'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/migrate/src/commands/DbPush.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/migrate/src/commands/DbPush.ts',
  },
  {
    title: 'Multi-schema support: one Prisma schema, many database schemas',
    body: `Prisma supports referencing multiple Postgres / SQL Server schemas (the namespace, not the .prisma file) in a single client. The fixture in \`multi-schema-with-external/prisma/schema.prisma\` shows the syntax:

\`\`\`prisma
datasource db {
  provider = "postgresql"
  schemas  = ["base", "shop", "invoicing"]
}

model User {
  id     Int     @id
  orders Order[]

  @@schema("base")
}

model Order {
  id      Int  @id
  user    User @relation(fields: [userId], references: [id])
  userId  Int
  invoice Invoice?

  @@schema("shop")
}

model Invoice {
  id      Int   @id
  order   Order @relation(fields: [orderId], references: [id])
  orderId Int   @unique

  amount Float

  @@schema("invoicing")
}
\`\`\`

Notice that relations cross schemas freely — \`Order.user\` references \`User\` even though they live in different schemas. Prisma handles the qualified table names (\`shop.\`Order\`\` references \`base.\`User\`\`) in the generated SQL.

Two reasons to use multi-schema:

1. **Hard isolation between domains.** Billing tables in \`invoicing\`, product tables in \`shop\`, identity in \`base\`. You can grant database-level permissions per schema (the \`reporting\` user gets \`SELECT\` on \`shop\` only). The Prisma client still sees them as one model graph.

2. **Adopting Prisma alongside an existing app.** Your legacy Rails app owns the \`public\` schema. Put new Prisma-managed tables in \`prisma_owned\` and your migrations don't touch any Rails-managed table.

Gotchas:

- **Enums also need \`@@schema\`.** Forget it and migrate dev throws because the enum has no namespace. The fixture above gets it right with \`@@schema("shop")\` on \`Size\`.
- **MySQL and SQLite don't support this.** Multi-schema is Postgres + SQL Server + CockroachDB only. The schema-files-loader will reject the \`schemas = [...]\` block on other providers.
- **Cross-schema FKs need both schemas to exist before migration.** First migration must \`CREATE SCHEMA\` before \`CREATE TABLE\`. Prisma generates the schema-creation SQL, but if you're baselining an existing DB you may need to create the schemas manually first.
- **\`db pull\` (introspection) only ingests schemas listed in \`schemas\`.** Tables in other schemas are invisible. If you pull and see a missing table, check \`schemas\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'prisma',
    tags: ['prisma', 'multi-schema', 'postgres', 'isolation'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client/tests/e2e/multi-schema-with-external/prisma/schema.prisma',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client/tests/e2e/multi-schema-with-external/prisma/schema.prisma',
  },
  {
    title: 'Driver adapters: PrismaNeon, PrismaPlanetScale, PrismaD1',
    body: `Driver adapters let Prisma talk to the database via a native JavaScript driver instead of the Rust query engine. The package layout is one adapter per provider — and each one's index file is striking in its brevity:

\`\`\`ts
// packages/adapter-neon/src/index.ts
export { PrismaNeonAdapterFactory as PrismaNeon, PrismaNeonHttpAdapterFactory as PrismaNeonHttp } from './neon'
\`\`\`

\`\`\`ts
// packages/adapter-planetscale/src/index.ts
export { PrismaPlanetScaleAdapterFactory as PrismaPlanetScale } from './planetscale'
\`\`\`

\`\`\`ts
// packages/adapter-d1/src/index-workerd.ts
export { PrismaD1 } from './d1'
export { PrismaD1HttpAdapterFactory as PrismaD1Http } from './d1-http'
\`\`\`

Why use them:

1. **Edge runtime support.** Cloudflare Workers, Vercel Edge, Deno Deploy don't allow native binaries. The Rust query engine can't run there. Driver adapters let Prisma run inside the V8 isolate by delegating SQL to a pure-JS driver.

2. **HTTP-based databases.** Neon Serverless, PlanetScale, Cloudflare D1 use HTTP/WebSocket protocols, not raw TCP. Their adapters speak those protocols natively — no need for a separate connection-pool process.

3. **Smaller bundle.** No Rust binary to ship. The Edge build of Prisma + an adapter is ~1MB vs ~50MB for a full Linux engine.

\`\`\`ts
import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })
\`\`\`

Three caveats:

- **Cloudflare D1 has no interactive transactions.** The throw is hard-coded in \`getPrismaClient.ts\` (see "$transaction interactive vs sequential" entry). Use the array form.
- **PlanetScale doesn't allow foreign keys by default.** Set \`relationMode = "prisma"\` in your schema so Prisma emulates referential integrity in the application layer.
- **Adapter must be passed at construct time.** You can't \`prisma.$useAdapter\` later — the engine is selected once. This means env-driven swap (\`if (process.env.EDGE) ...\`) needs to happen at the \`new PrismaClient()\` call.

Gotcha: a few features (raw SQL with native types, some advanced cursor combinations) round-trip through the engine differently when an adapter is in play. If a query works with the default engine but fails on Neon, check the adapter's release notes — feature parity is good but not 100%.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'driver-adapters', 'neon', 'planetscale', 'd1', 'edge'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/adapter-neon/src/index.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/adapter-neon/src/index.ts',
  },
  {
    title: 'Relation modes: foreignKeys vs prisma',
    body: `By default Prisma emits \`FOREIGN KEY\` constraints in the database. PlanetScale (Vitess) doesn't support them; some sharded setups ban them; some engineers want app-level control. The fixture in \`relationMode-prisma\` shows the alternative:

\`\`\`prisma
datasource db {
  provider = "postgres"
  relationMode = "prisma"
}

model SomeUser {
  id            String @id @default(cuid())
  profileUpdate ProfileUpdateNoAction?
  profileDelete ProfileDeleteNoAction?
  enabled       Boolean?
}

model ProfileDeleteNoAction {
  id       String @id @default(cuid())
  user     SomeUser @relation(fields: [userId], references: [id], onDelete: NoAction)
  userId   String @unique
  enabled  Boolean?
}
\`\`\`

With \`relationMode = "prisma"\`, the engine emulates referential integrity in the client:

- On a parent \`delete\` it issues separate SQL to delete (or set null on, or restrict) the children, before issuing the parent delete.
- On an insert it pre-checks that the referenced FK exists.
- The database itself has NO foreign-key constraints — \`SHOW CREATE TABLE\` reveals plain columns.

Compare with \`relationMode = "foreignKeys"\` (default on Postgres, MySQL with InnoDB, SQLite, MSSQL):

- The database enforces FKs natively. Inserts fail with P2003 if the referenced row doesn't exist.
- Deletes / updates respect the SQL-level \`ON DELETE\` / \`ON UPDATE\` actions.

When to use which:

- **\`prisma\`** — PlanetScale (mandatory; their proxy can't handle FKs across shards), CockroachDB at scale (FKs are expensive cross-region), legacy databases where you can't add FK constraints without downtime.
- **\`foreignKeys\`** — everywhere else. Database-enforced integrity is faster, atomic, and survives bypasses (raw SQL, other apps writing to the same DB).

Gotchas:

1. **\`relationMode = "prisma"\` is slower for cascades.** A parent delete with 1000 children in \`foreignKeys\` mode is one DELETE statement; in \`prisma\` mode it's a SELECT + a DELETE for the children + a DELETE for the parent.
2. **You MUST add an index on every FK column manually.** With native FKs the database adds an index implicitly; in \`prisma\` mode it doesn't, and queries that join on the FK become full scans. Add \`@@index([userId])\` for every relation field.
3. **Other apps can violate integrity.** Raw SQL inserts that bypass Prisma will happily create orphan rows, because nothing at the database level rejects them.`,
    contentType: 'REPOSITORY_FILE',
    language: 'prisma',
    tags: ['prisma', 'relation-mode', 'foreign-keys', 'planetscale'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/cli/src/__tests__/fixtures/referential-actions/no-action/relationMode-prisma/prisma/postgres.prisma',
    url: 'https://github.com/prisma/prisma/blob/main/packages/cli/src/__tests__/fixtures/referential-actions/no-action/relationMode-prisma/prisma/postgres.prisma',
  },
  {
    title: 'Self-referential relations and named relations',
    body: `Prisma supports self-references (a tree, an org chart, a comment thread) and multiple relations between the same two models (an audit log where one User authored a record and another reviewed it). The grading-app fixture in the migrate tests is a clean reference:

\`\`\`prisma
model User {
  id        Int     @default(autoincrement()) @id
  email     String  @unique
  firstName String?
  lastName  String?

  testResults TestResult[] @relation(name: "results")
  testsGraded TestResult[] @relation(name: "graded")
}

model TestResult {
  id        Int      @default(autoincrement()) @id
  result    Int

  studentId Int
  student   User @relation(name: "results", fields: [studentId], references: [id])
  graderId  Int
  gradedBy  User @relation(name: "graded", fields: [graderId], references: [id])
}
\`\`\`

Two relations between \`User\` and \`TestResult\`. Prisma can't infer "which User does this FK point at?" so you give each relation a unique \`name\`. The names line up on both ends — \`testResults @relation("results")\` matches \`student @relation("results")\`.

Self-references work the same way:

\`\`\`prisma
model Comment {
  id        Int       @id @default(autoincrement())
  body      String

  parentId  Int?
  parent    Comment?  @relation("CommentThread", fields: [parentId], references: [id], onDelete: NoAction)
  replies   Comment[] @relation("CommentThread")
}
\`\`\`

\`parent\` is the FK side; \`replies\` is the back-reference. The \`name\` is required because Prisma sees two relations to \`Comment\` (one outgoing, one incoming) and needs a label to pair them.

Three production gotchas:

1. **Self-references with cascade can crash on Postgres.** \`onDelete: Cascade\` on a self-referential FK is allowed by Postgres, but \`onUpdate: Cascade\` triggers a known PG limitation (multiple cascade paths). Use \`NoAction\` or handle the chain in app code.

2. **Trees aren't queryable recursively in Prisma.** Prisma has no native recursive CTE support. Fetching a 10-level deep comment thread requires either 10 round trips or a raw recursive \`WITH RECURSIVE\` query.

3. **M-N self-references need an explicit join model.** Implicit M-N (Prisma's \`PostsOnTags\` magic) doesn't support self-references. For a "User follows User" graph, declare:

\`\`\`prisma
model Follow {
  followerId  Int
  followedId  Int
  follower    User @relation("Following", fields: [followerId], references: [id])
  followed    User @relation("Followers", fields: [followedId], references: [id])
  @@id([followerId, followedId])
}
\`\`\``,
    contentType: 'REPOSITORY_FILE',
    language: 'prisma',
    tags: ['prisma', 'relations', 'self-relation', 'named-relations'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/migrate/src/__tests__/fixtures/real-world-grading-app/prisma/schema.prisma',
    url: 'https://github.com/prisma/prisma/blob/main/packages/migrate/src/__tests__/fixtures/real-world-grading-app/prisma/schema.prisma',
  },
  {
    title: 'Indexes and compound keys: @@index, @@unique, @@id',
    body: `Prisma's index syntax is concise but the choice of which one to use has real performance implications. The grading-app fixture demonstrates all three:

\`\`\`prisma
model CourseEnrollment {
  createdAt DateTime @default(now())
  role      UserRole

  userId   Int
  courseId Int
  user     User   @relation(fields: [userId], references: [id])
  course   Course @relation(fields: [courseId], references: [id])

  @@id([userId, courseId])
  @@index([userId, role])
}
\`\`\`

Three different attributes, three semantics:

- **\`@@id([userId, courseId])\`** — compound primary key. No autoincrement \`id\`; the natural pair is the identity. Replaces the row entirely if (userId, courseId) repeats.
- **\`@@unique([fieldA, fieldB])\`** — unique constraint without making it the PK. Use when a row needs a synthetic \`@id\` but a tuple of fields must also be unique (e.g. \`@@unique([tenantId, slug])\`).
- **\`@@index([userId, role])\`** — non-unique index. Speeds up reads; doesn't constrain writes.

Two non-obvious points:

1. **Column order matters.** \`@@index([userId, role])\` is great for queries that filter by userId (or by both). It's USELESS for queries that filter only by role — Postgres can't use the index because role isn't the leading column. Reorder if your common query is "all admins" rather than "this user's role."

2. **Compound \`@@id\` and \`@@unique\` get a synthetic key in the Prisma Client.** To query \`CourseEnrollment\` by its PK, you don't write \`{ where: { userId, courseId } }\` — you write \`{ where: { userId_courseId: { userId, courseId } } }\`. Same for \`@@unique([a, b])\` becoming \`{ where: { a_b: { a, b } } }\`. The combiner key is the field names sorted, joined with underscores. Surprising the first time you see it.

3. **\`@@index\` and \`@@unique\` differences for FKs.** With \`relationMode = "prisma"\` (PlanetScale), Prisma does NOT create indexes on FK columns automatically. You MUST add \`@@index([userId])\` manually for every relation field, or joins become table scans.

Gotcha: adding an \`@@index\` on a 100M-row table without \`CONCURRENTLY\` (Postgres) or in production hours is a great way to lock the table for an hour. Prisma migrations don't generate \`CREATE INDEX CONCURRENTLY\`. For big-table indexes, write a manual SQL migration with \`IF NOT EXISTS\` and \`CONCURRENTLY\`, then mark it applied via \`migrate resolve\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'prisma',
    tags: ['prisma', 'indexes', 'unique', 'compound-keys', 'performance'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/migrate/src/__tests__/fixtures/real-world-grading-app/prisma/schema.prisma',
    url: 'https://github.com/prisma/prisma/blob/main/packages/migrate/src/__tests__/fixtures/real-world-grading-app/prisma/schema.prisma',
  },
  {
    title: 'Postgres extensions: declaring pgvector, postgis, and friends',
    body: `Prisma can manage Postgres extensions (\`CREATE EXTENSION\`) as part of your migrations. The fixture in \`prisma-config-extensions/schema.prisma\` is the minimum:

\`\`\`prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider = "postgres"
  extensions = [vector]
}

model User {
  id       Int @id @default(autoincrement())
  name     String
  position Vector3
}
\`\`\`

The \`extensions = [vector]\` line tells Prisma migrate to issue \`CREATE EXTENSION IF NOT EXISTS "vector"\` in the migration that introduces it. Without it you'd have to write a manual SQL migration before any model that depends on the extension.

Three ways to specify an extension:

\`\`\`prisma
extensions = [vector]                                // simple
extensions = [vector(version: "0.5.1")]              // pin a version
extensions = [vector(map: "vector_v05", schema: "extensions")]  // rename + locate
\`\`\`

The \`map\` variant is for when the extension is installed under a different name (vendor naming). The \`schema\` variant is the production-grade pattern — keep extensions in their own \`extensions\` schema so dropping a database doesn't drop them, and so PG_DUMP only restores them once.

Common extensions worth declaring:

- \`vector\` (pgvector) — embedding storage, similarity search. Use a \`Vector\` native type and \`@@index(... type: HNSW)\` for ANN queries.
- \`postgis\` — geospatial. Adds \`Geometry\` / \`Geography\` types.
- \`pgcrypto\` — \`gen_random_uuid()\`. Pair with \`@default(uuid())\` if you don't want client-side cuid.
- \`citext\` — case-insensitive text. Removes the need for \`LOWER(email) = LOWER(?)\`.
- \`uuid-ossp\` — older UUID generators. Mostly superseded by pgcrypto.

Gotchas:

1. **\`postgresqlExtensions\` is still a preview feature.** It works fine, but Prisma may change the syntax in a major release. Add it to \`previewFeatures\` and check the changelog before upgrading client versions.

2. **The user running migrations needs \`SUPERUSER\` or the pre-installed-extensions list grants.** Managed Postgres providers (RDS, Supabase, Neon) usually allow \`CREATE EXTENSION\` on a curated list; check yours.

3. **\`migrate dev\` can drop extensions on reset.** If you're using the shadow database, granting \`CREATEDB\` isn't enough — you need permission to install the extension in the shadow DB too. Otherwise dev fails before it even runs your migration.`,
    contentType: 'REPOSITORY_FILE',
    language: 'prisma',
    tags: ['prisma', 'postgres', 'extensions', 'pgvector', 'postgis'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/migrate/src/__tests__/fixtures/prisma-config-extensions/schema.prisma',
    url: 'https://github.com/prisma/prisma/blob/main/packages/migrate/src/__tests__/fixtures/prisma-config-extensions/schema.prisma',
  },
  {
    title: 'Logging via the query event — every SQL the engine runs',
    body: `Prisma's logging pipeline emits structured events for query, info, warn, and error. The wiring lives in \`getPrismaClient.ts\`:

\`\`\`ts
const logEmitter = new EventEmitter().on('error', () => {}) as LogEmitter
// ...
if (options.log) {
  for (const log of options.log) {
    const level = typeof log === 'string' ? log : log.emit === 'stdout' ? log.level : null
    if (level) {
      this.$on(level, (event) => {
        logger.log(\`\${logger.tags[level] ?? ''}\`, (event as LogEvent).message || (event as QueryEvent).query)
      })
    }
  }
}
\`\`\`

Two emit modes per level. \`emit: 'stdout'\` makes Prisma log it itself. \`emit: 'event'\` makes Prisma emit it on the EventEmitter — you handle it via \`prisma.$on('query', ...)\`. The latter is what you want in production, because you can pipe to your structured logger:

\`\`\`ts
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'stdout', level: 'warn' },
    { emit: 'stdout', level: 'error' },
  ],
})

prisma.$on('query', (e) => {
  if (e.duration > 200) {
    logger.warn({ sql: e.query, params: e.params, ms: e.duration }, 'slow query')
  }
})
\`\`\`

The \`QueryEvent\` payload is \`{ query, params, duration, target, timestamp }\`. \`duration\` is the engine's measurement — it includes the network round trip to the DB but NOT the Prisma client's serialisation overhead. For end-to-end timing, wrap the call site in your own start/end clock.

Gotchas:

1. **The \`error\` listener on the bare EventEmitter is a no-op.** Look at the line \`new EventEmitter().on('error', () => {})\`. Without that, an uncaught \`emit('error', ...)\` would crash Node. Don't remove it; do add your own error listener via \`$on('error', ...)\` to actually handle them.

2. **\`params\` are stringified.** They're a JSON-stringified array, not a real array. To extract them you have to \`JSON.parse(e.params)\`. Easy to miss; logs look fine until you try to programmatically inspect the values.

3. **Don't enable \`query\` logging in production at \`stdout\` level.** Every query gets a line — on a busy app that's hundreds of MB/day of stdout. Use \`emit: 'event'\` and apply a filter (\`if (e.duration > 100)\`).

4. **Driver adapters bypass this for some events.** When using a JS driver adapter, certain engine-internal events don't fire because the engine isn't doing the work. The \`query\` event still fires (the adapter reports it back), but exact metric availability differs.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'logging', 'observability', 'query-event'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client/src/runtime/getPrismaClient.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client/src/runtime/getPrismaClient.ts',
  },
  {
    title: 'Error code mapping: turning DriverAdapter errors into P-codes',
    body: `When a driver adapter throws (Neon, pg, libsql), Prisma normalizes the error into the same P-code shape the Rust engine would emit. The mapping in \`user-facing-error.ts\` is a long switch:

\`\`\`ts
function getErrorCode(err: DriverAdapterError): string | undefined {
  switch (err.cause.kind) {
    case 'AuthenticationFailed':            return 'P1000'
    case 'DatabaseNotReachable':            return 'P1001'
    case 'DatabaseDoesNotExist':            return 'P1003'
    case 'SocketTimeout':                   return 'P1008'
    case 'ConnectionClosed':                return 'P1017'
    case 'TransactionAlreadyClosed':        return 'P1018'
    case 'UniqueConstraintViolation':       return 'P2002'
    case 'ForeignKeyConstraintViolation':   return 'P2003'
    case 'NullConstraintViolation':         return 'P2011'
    case 'TableDoesNotExist':               return 'P2021'
    case 'ColumnNotFound':                  return 'P2022'
    case 'TransactionWriteConflict':        return 'P2034'
    case 'TooManyConnections':              return 'P2037'
    // ...
  }
}
\`\`\`

This mapping is why your error-handling code can be the same regardless of adapter. P2002 is P2002 whether the underlying error is a Postgres \`23505\`, a MySQL \`1062\`, or a SQLite \`UNIQUE constraint failed\` — the adapter's job is to recognize the native shape and report a kind.

Three particularly useful codes:

- **\`P1001\` (DatabaseNotReachable)** — your app can retry these. They usually mean a transient network glitch or the database is restarting. A simple exponential backoff on P1001 saves a 502 page during a brief failover.

- **\`P2034\` (TransactionWriteConflict)** — happens at \`Serializable\` isolation when two transactions try to write the same data. The fix is to retry the transaction; the failure is by design, not a bug. Wrap the entire \`$transaction\` in a retry loop.

- **\`P2037\` (TooManyConnections)** — this is the one to alert on. It means your pool sized the database past its \`max_connections\`. Either scale down (more workers, smaller per-worker pool) or use a transaction pooler (PgBouncer).

Gotchas:

1. **The fallback case returns \`undefined\`.** If the adapter encounters an error kind Prisma doesn't recognize, no P-code is set and you get a \`PrismaClientUnknownRequestError\` instead of \`PrismaClientKnownRequestError\`. Handle both in your top-level catch, or you'll miss the unknown ones.

2. **\`P2002\`'s \`meta\` shape varies by provider.** Postgres gives \`meta.target\` as the constraint name (\`User_email_key\`) on some versions; MySQL gives the column name (\`email\`). Don't string-match constraint names — read \`meta.target\` defensively.

3. **\`P1008\` (SocketTimeout) is a query timeout, not a connect timeout.** It fires when a single query exceeds the engine's per-query deadline. Tune via the connection-string param \`?socket_timeout=10\` or your driver-specific equivalent.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'error-codes', 'driver-adapters', 'reliability'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client-engine-runtime/src/user-facing-error.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client-engine-runtime/src/user-facing-error.ts',
  },
  {
    title: 'SQL Commenter: tagging every query with request context',
    body: `Prisma's sqlcommenter integration appends structured comments to every emitted SQL statement. The format follows the Google sqlcommenter spec; the implementation is in \`sql-commenter.ts\`:

\`\`\`ts
export function formatSqlComment(tags: Record<string, string>): string {
  const entries = Object.entries(tags)
  if (entries.length === 0) {
    return ''
  }

  // Sort by key lexicographically
  entries.sort(([a], [b]) => a.localeCompare(b))

  const parts = entries.map(([key, value]) => {
    const encodedKey = encodeURIComponent(key)
    const encodedValue = encodeURIComponent(value).replace(/'/g, "\\'")
    return \`\${encodedKey}='\${encodedValue}'\`
  })

  return \`/*\${parts.join(',')}*/\`
}
\`\`\`

So a query becomes:

\`\`\`sql
SELECT * FROM "User" WHERE "id" = $1 /*controller='userController',route='%2Fusers%2F%3Aid'*/
\`\`\`

Why this matters: every database observability tool (pgAnalyze, Datadog DBM, AWS Performance Insights) groups statements by their SQL text. Without sqlcommenter, two requests from different controllers look identical in the dashboard. With it, you can attribute slow queries back to the route, the user, the trace ID — without joining anything.

Hooking it up via a plugin:

\`\`\`ts
import { PrismaClient, Prisma } from '@prisma/client'
import { sqlCommenter } from '@prisma/sqlcommenter'

const prisma = new PrismaClient().$extends(
  sqlCommenter({
    plugins: [
      {
        getTags: () => ({
          route: getCurrentRequestRoute(),
          traceparent: getCurrentTraceParent(),
        }),
      },
    ],
  }),
)
\`\`\`

The implementation deep-clones the context for every plugin via \`klona\` — so a buggy plugin can't mutate the shared object and corrupt other plugins' tags.

Gotchas:

1. **Comments invalidate the prepared-statement cache for some clients.** If your driver caches prepared statements by the full SQL text (including comments), a unique-per-request comment makes EVERY query a cache miss. The pg driver and most others ignore comments for cache keys, but verify on yours.

2. **Don't put PII in tags.** Comments end up in slow-query logs. \`user_email='ada@example.com'\` is now in plaintext on every DB log destination forever. Use opaque IDs.

3. **Tag values are URL-encoded but not size-limited.** A tag with a 10KB JSON blob will produce a 10KB comment on every query. Database log volume explodes. Stick to short identifier-shaped values.

4. **The trace-context plugin enables W3C trace context propagation** — your DB tool can correlate slow queries to the upstream HTTP trace, which is the whole point of distributed tracing finally working at the database boundary.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'sqlcommenter', 'observability', 'tracing'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client-engine-runtime/src/sql-commenter.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client-engine-runtime/src/sql-commenter.ts',
  },
  {
    title: 'Prisma Studio: a GUI for the database, not for migrations',
    body: `\`prisma studio\` opens a local web GUI to browse and edit data. The CLI entry in \`Studio.ts\` shows the supported runtime modes:

\`\`\`ts
import { createMySQL2Executor } from '@prisma/studio-core/data/mysql2'
import { createNodeSQLiteExecutor } from '@prisma/studio-core/data/node-sqlite'
import { createPostgresJSExecutor } from '@prisma/studio-core/data/postgresjs'
\`\`\`

Studio is data-only. It can browse tables, edit rows, run filters, and add records. It cannot run migrations, change the schema, or apply DDL. That separation is intentional: Studio is the "database client" tool; \`prisma migrate\` is the "schema management" tool. Don't expect Studio to do both.

The default port comes from a small Easter egg:

\`\`\`ts
/** \`prisma dev\`'s \`51_213 - 1\` */
const DEFAULT_PORT = 51_212
\`\`\`

51212 is one less than 51213 because that's the port \`prisma dev\` (the local Postgres dev server) uses. Easy way to remember: if Studio's port collides, it's because dev is on the next one up.

A meaningful constraint:

\`\`\`ts
const ACCELERATE_UNSUPPORTED_MESSAGE =
  'Prisma Studio no longer supports Accelerate URLs (\`prisma://\` or \`prisma+postgres://\`). Use a direct database connection string instead.'
\`\`\`

If your \`DATABASE_URL\` is a Prisma Accelerate URL (cached connection-pooler), Studio refuses to launch. The reason: Studio runs SQL the engine doesn't know how to cache, and the Accelerate edge layer doesn't expose a generic SQL pass-through. Set a \`DIRECT_URL\` in your schema and point Studio at it explicitly:

\`\`\`bash
DATABASE_URL=postgres://direct.neon.tech/db prisma studio
\`\`\`

When to use Studio:

- Quick "what's actually in this row?" inspection during development
- Editing seed data without writing a script
- Showing a non-engineer (PM, designer) what the data looks like

When NOT to use Studio:

- Production. There's no audit trail; every edit is a silent UPDATE.
- Schema design. It can't add columns. Use \`migrate dev\` for that.
- Bulk operations. The UI is row-at-a-time; for 1000 updates write SQL or a script.

Gotcha: Studio holds an open database connection while running. On a tight connection-pool budget (free-tier Postgres, 5 connections total), running Studio against your dev DB while your dev server is also running can starve the dev server. Stop one or the other.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'studio', 'tooling', 'database-gui'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/cli/src/Studio.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/cli/src/Studio.ts',
  },
  {
    title: 'isWrite: how Prisma knows which actions need a transaction',
    body: `Prisma classifies every JSON-protocol action as read or write via a single map in \`isWrite.ts\`. It looks trivial but several behaviours hinge on it:

\`\`\`ts
const writeMap: Record<JsonQueryAction, boolean> = {
  aggregate: false,
  aggregateRaw: false,
  createMany: true,
  createManyAndReturn: true,
  createOne: true,
  deleteMany: true,
  deleteOne: true,
  executeRaw: true,
  findFirst: false,
  findFirstOrThrow: false,
  findMany: false,
  findRaw: false,
  findUnique: false,
  findUniqueOrThrow: false,
  groupBy: false,
  queryRaw: false,
  runCommandRaw: true,
  updateMany: true,
  updateManyAndReturn: true,
  updateOne: true,
  upsertOne: true,
}

export function isWrite(action: JsonQueryAction): boolean {
  return writeMap[action]
}
\`\`\`

What this map drives:

1. **Replica routing.** When you have a read replica configured (via the \`@prisma/extension-read-replicas\` extension), \`isWrite\` decides which queries go to the primary and which to a replica. \`findMany\` reads from the replica; \`upsert\` always goes to primary.

2. **Sequential array transactions.** When you pass an array to \`$transaction([])\`, the engine wraps it in a transaction only if at least one action is a write — otherwise it can be sent as a parallel batch. (Reads don't need atomicity, so why pay for BEGIN/COMMIT?)

3. **\`$queryRaw\` is classified as a READ.** This is non-obvious. If your raw query is actually a CTE that mutates (\`WITH x AS (UPDATE ...) SELECT ...\`), Prisma treats it as a read because the JSON action is \`queryRaw\`. Use \`$executeRaw\` for any statement that mutates, even via a CTE — otherwise replica routing will send the mutation to a read-only replica and crash with "cannot execute UPDATE in a read-only transaction."

4. **\`runCommandRaw\` is a write.** This is the MongoDB raw command escape hatch. Even read-shaped Mongo commands (\`find\`) are conservatively classified as writes — the engine has no way to tell what the command does, so it routes safely.

Gotcha: extensions that override query routing should consult \`isWrite\` rather than guessing. Hardcoding a "find*" prefix check would miss \`aggregate\` (a read) and would falsely classify \`findRaw\` correctly but \`runCommandRaw\` incorrectly. The map is the source of truth.

Also: this map only knows about the Prisma JSON protocol. If you bypass via \`$queryRaw\`, the read/write decision is on you. There's no SQL parser inside Prisma to detect "this looks like an update."`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'internals', 'read-write', 'replicas'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client/src/runtime/core/jsonProtocol/isWrite.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client/src/runtime/core/jsonProtocol/isWrite.ts',
  },
  {
    title: 'Nested transactions via savepoints — when supported',
    body: `Prisma supports nested interactive transactions by using SAVEPOINTs under the hood. The implementation in \`transaction-manager.ts\` is explicit:

\`\`\`ts
if (options.newTxId) {
  return await this.#withActiveTransactionLock(options.newTxId, 'start', async (existing) => {
    if (existing.status !== 'running') {
      throw new TransactionInternalConsistencyError(
        \`Transaction in invalid state \${existing.status} when starting a nested transaction.\`,
      )
    }
    if (!existing.transaction) {
      throw new TransactionInternalConsistencyError(
        \`Transaction missing underlying driver transaction when starting a nested transaction.\`,
      )
    }

    existing.depth += 1

    const savepointName = this.#nextSavepointName(existing)
    existing.savepoints.push(savepointName)
    try {
      await this.#requiredCreateSavepoint(existing.transaction)(savepointName)
    } catch (e) {
      // Keep state consistent if creating the savepoint fails.
      existing.depth -= 1
      existing.savepoints.pop()
      throw e
    }

    return { id: existing.id }
  })
}
\`\`\`

Each nested \`$transaction\` call inside an existing one gets a SAVEPOINT. If the inner block throws, the engine rolls back to that savepoint — outer work survives. If both succeed, the savepoint is released and the outer commit is the only durable boundary.

\`\`\`ts
await prisma.$transaction(async (tx) => {
  await tx.user.create({ data: { email } })

  try {
    await tx.$transaction(async (tx2) => {
      await tx2.audit.create({ data: { event: 'signup' } })
      throw new Error('audit quota exceeded')
    })
  } catch {
    // The audit insert was rolled back to a savepoint; user.create still survives
  }

  await tx.profile.create({ data: { userId: ... } })
})
\`\`\`

Three constraints:

1. **MongoDB doesn't support nested transactions at all.** The dispatch in \`getPrismaClient.ts\` throws explicitly: \`'The mongodb provider does not support nested transactions'\`. Mongo's session API doesn't expose savepoints.

2. **The savepoint counter is per outer transaction.** Each nested level gets a unique name (\`sp_1\`, \`sp_2\`, ...). Don't try to manage savepoint names yourself via raw SQL — Prisma will get confused.

3. **Failure inside savepoint creation rolls back the depth counter.** Note the \`try/catch\` around \`#requiredCreateSavepoint\` — Prisma is careful to keep its internal state consistent even if the database refuses the savepoint. Without that, a transient error would leave depth at the wrong value and break later cleanup.

Gotcha: nested transactions are rarely the right design. They make code paths hard to reason about ("did this side effect commit?") and they multiply the amount of time the connection is held. If you need conditional rollback within a transaction, prefer to compute the decision before issuing the writes. Reach for nested tx only when the inner block is genuinely independent (a sub-saga that might fail without invalidating the outer work).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'transactions', 'savepoint', 'nested'],
    repository: repo('prisma', 'prisma'),
    filePath: 'packages/client-engine-runtime/src/transaction-manager/transaction-manager.ts',
    url: 'https://github.com/prisma/prisma/blob/main/packages/client-engine-runtime/src/transaction-manager/transaction-manager.ts',
  },
];
