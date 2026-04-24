/**
 * Batch github-024-sentry-observability
 *
 * 25 patterns from the official Sentry JavaScript SDK monorepo
 * (getsentry/sentry-javascript). Every entry attributes to a real
 * file on the `develop` branch and was authored after reading the
 * source — quoted code is verbatim or close paraphrase, and gotchas
 * are extracted from comments / behaviour visible in the file.
 *
 * Authoring rules (see CORPUS-PLAN.md):
 * - Real attribution; no fabricated URLs
 * - 250-450 word body
 * - One topic per entry
 * - WHAT + HOW (real code) + WHY + non-obvious gotcha
 */

import type { SeedItem } from '../types';

const sentry = { owner: 'getsentry', name: 'sentry-javascript' };
const baseUrl = 'https://github.com/getsentry/sentry-javascript/blob/develop';

export const BATCH: SeedItem[] = [
  {
    title: 'Sentry.init(): the only required option is the DSN — everything else has defaults',
    body: `\`Sentry.init()\` does not throw if you omit the DSN. Inside \`packages/browser/src/sdk.ts\` the \`init()\` function builds a \`BrowserClientOptions\` object out of whatever you passed, then hands it to \`initAndBind(BrowserClient, clientOptions)\`. There is no \`if (!options.dsn) throw\` anywhere — instead, the DSN is parsed inside the \`Client\` constructor; if it's missing or invalid, the client silently disables transport and the SDK becomes a no-op (capture* calls return an event id but nothing is sent).

\`\`\`ts
export function init(options: BrowserOptions = {}): Client | undefined {
  let defaultIntegrations =
    options.defaultIntegrations == null ? getDefaultIntegrations(options) : options.defaultIntegrations;

  const clientOptions: BrowserClientOptions = {
    ...options,
    enabled: shouldDisableBecauseIsBrowserExtenstion ? false : options.enabled,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup({
      integrations: options.integrations,
      defaultIntegrations,
    }),
    transport: options.transport || makeFetchTransport,
  };
  return initAndBind(BrowserClient, clientOptions);
}
\`\`\`

The defaults that apply when you only pass a DSN are not nothing: the browser SDK auto-installs \`InboundFilters\`, \`FunctionToString\`, \`BrowserApiErrors\`, \`Breadcrumbs\`, \`GlobalHandlers\` (window.onerror + onunhandledrejection), \`LinkedErrors\`, \`Dedupe\`, \`HttpContext\`, \`CultureContext\`, and \`BrowserSession\` — all from \`getDefaultIntegrations()\` in the same file.

The non-obvious gotcha: \`init()\` will silently set \`enabled: false\` if it detects the page is loaded inside a Chrome/Firefox extension content script, because Sentry's transport would otherwise try to use the extension's network and leak data. To override this, pass \`skipBrowserExtensionCheck: true\`. The check is in \`utils/detectBrowserExtension.ts\` and runs before any integration is wired up.

Another gotcha: if you pass \`defaultIntegrations: false\`, you lose all of the above — including the global error handlers. Most users who do this end up wondering why uncaught exceptions aren't reaching Sentry. Use the function form \`integrations: (defaults) => defaults.filter(i => i.name !== 'Dedupe')\` instead, which is documented at the top of \`getIntegrationsToSetup()\` in \`packages/core/src/integration.ts\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'init', 'dsn', 'browser', 'configuration'],
    repository: sentry,
    filePath: 'packages/browser/src/sdk.ts',
    url: `${baseUrl}/packages/browser/src/sdk.ts`,
  },
  {
    title: 'DSN parsing: a single regex pulls protocol, public key, host, port, and project ID',
    body: `Every DSN like \`https://abc123@o12345.ingest.sentry.io/678\` is parsed by one regex in \`packages/core/src/utils/dsn.ts\`:

\`\`\`ts
const DSN_REGEX = /^(?:(\\w+):)\\/\\/(?:(\\w+)(?::(\\w+)?)?@)((?:\\[[:.%\\w]+\\]|[\\w.-]+))(?::(\\d+))?\\/(.+)/;

export function dsnFromString(str: string): DsnComponents | undefined {
  const match = DSN_REGEX.exec(str);
  if (!match) {
    consoleSandbox(() => console.error(\`Invalid Sentry Dsn: \${str}\`));
    return undefined;
  }
  const [protocol, publicKey, pass = '', host = '', port = '', lastPath = ''] = match.slice(1);
  // ... split projectId out of lastPath
  return dsnFromComponents({ host, pass, path, projectId, port, protocol: protocol as DsnProtocol, publicKey });
}
\`\`\`

The validation in \`validateDsn\` only runs when \`DEBUG_BUILD\` is true — production bundles skip it entirely to save bytes. So in a prod build, an invalid DSN won't surface "Invalid projectId" or "Invalid protocol" errors; the regex just fails to match and you get a single \`console.error\` line and a silent no-op SDK.

The DSN must use \`http\` or \`https\` — the \`isValidProtocol\` check rejects anything else. The project ID at the end of the path must be all digits; \`projectMatch = projectId.match(/^\\d+/)\` strips trailing characters but if the path doesn't start with digits you get an empty string.

Non-obvious: the org ID is extracted from the host with a separate regex \`/^o(\\d+)\\./\`. So \`o12345.ingest.sentry.io\` parses to org \`12345\`. This is used for routing in \`extractOrgIdFromClient()\`; if your DSN host doesn't match (custom proxy, self-hosted), set \`orgId\` explicitly in the init options or some product features (organization-scoped trace links) won't work.

The password component (the optional \`:secret\` between key and \`@\`) is preserved by the regex but \`dsnToString()\` excludes it by default — only set \`withPassword: true\` if you're talking to legacy self-hosted Sentry instances that still require it.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'dsn', 'parsing', 'configuration', 'regex'],
    repository: sentry,
    filePath: 'packages/core/src/utils/dsn.ts',
    url: `${baseUrl}/packages/core/src/utils/dsn.ts`,
  },
  {
    title: 'integrations vs defaultIntegrations: the function form is the safe way to remove a default',
    body: `\`getIntegrationsToSetup\` in \`packages/core/src/integration.ts\` is what merges your \`integrations\` array with the SDK's \`defaultIntegrations\`. It supports three shapes:

\`\`\`ts
export function getIntegrationsToSetup(
  options: Pick<CoreOptions, 'defaultIntegrations' | 'integrations'>,
): Integration[] {
  const defaultIntegrations = options.defaultIntegrations || [];
  const userIntegrations = options.integrations;

  defaultIntegrations.forEach((integration: IntegrationWithDefaultInstance) => {
    integration.isDefaultInstance = true;
  });

  let integrations: Integration[];
  if (Array.isArray(userIntegrations)) {
    integrations = [...defaultIntegrations, ...userIntegrations];
  } else if (typeof userIntegrations === 'function') {
    const resolvedUserIntegrations = userIntegrations(defaultIntegrations);
    integrations = Array.isArray(resolvedUserIntegrations) ? resolvedUserIntegrations : [resolvedUserIntegrations];
  } else {
    integrations = defaultIntegrations;
  }
  return filterDuplicates(integrations);
}
\`\`\`

The clever bit is \`filterDuplicates\`: it keys integrations by \`name\` and resolves collisions with a rule that "we never want a default instance to overwrite an existing user instance." So if you pass \`integrations: [Sentry.dedupeIntegration({ ... })]\`, your custom Dedupe replaces the default one — the default is silently dropped because it's flagged \`isDefaultInstance: true\`.

Why the function form matters: \`integrations: (defaults) => defaults.filter(i => i.name !== 'Breadcrumbs')\` actually removes the default. \`integrations: []\` does NOT remove it because the array form just appends. To kill all defaults, pass \`defaultIntegrations: false\` (note: \`false\`, not \`[]\` — \`[]\` would still be falsy-merged but the type is \`false | Integration[]\`).

Gotcha: integration order matters because they're applied in array order. \`Dedupe\` is intentionally placed late in the browser default array (\`getDefaultIntegrations\` in \`packages/browser/src/sdk.ts\`) so it sees events after \`InboundFilters\` and \`LinkedErrors\` have already run. If you pass a custom Dedupe at the end of your array it'll work; if you pass it first and the function form preserves your ordering, you may end up deduping events before the linked-errors integration has populated \`event.exception.values[]\`, breaking the comparison.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'integrations', 'configuration', 'browser', 'defaults'],
    repository: sentry,
    filePath: 'packages/core/src/integration.ts',
    url: `${baseUrl}/packages/core/src/integration.ts`,
  },
  {
    title: 'captureException vs captureMessage: same pipeline, different event shape',
    body: `Both functions live in \`packages/core/src/exports.ts\` and both ultimately call into the current scope:

\`\`\`ts
export function captureException(exception: unknown, hint?: ExclusiveEventHintOrCaptureContext): string {
  return getCurrentScope().captureException(exception, parseEventHintOrCaptureContext(hint));
}

export function captureMessage(message: string, captureContext?: CaptureContext | SeverityLevel): string {
  // This is necessary to provide explicit scopes upgrade, without changing the original
  // arity of the \`captureMessage(message, level)\` method.
  const level = typeof captureContext === 'string' ? captureContext : undefined;
  const hint = typeof captureContext !== 'string' ? { captureContext } : undefined;
  return getCurrentScope().captureMessage(message, level, hint);
}
\`\`\`

Both return an event ID synchronously even though the actual transport is async. The ID is generated by \`uuid4()\` before the event is processed; if \`beforeSend\` or any event processor returns \`null\`, the ID is still valid but the event is never sent. \`Sentry.lastEventId()\` returns the most recent ID from the isolation scope.

The difference shows up in the Sentry UI grouping algorithm. \`captureException\` produces an event with a populated \`event.exception.values[]\` containing a stack trace parsed by the SDK's stack parser; the grouping algorithm hashes the top non-app frames to produce a fingerprint, so two different exceptions with the same stack trace get grouped together. \`captureMessage\` produces an event with \`event.message\` as a string and no exception array — grouping falls back to the message string itself, which means dynamic strings like \`captureMessage(\\\`Failed to load user \${userId}\\\`)\` create one Sentry issue per user. Always template the dynamic part out: \`captureMessage('Failed to load user', { extra: { userId } })\`.

Non-obvious: \`captureMessage\`'s second argument is overloaded — it can be either a severity level string (\`'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug'\`) or a \`CaptureContext\` object (with \`tags\`, \`user\`, \`level\` etc.). The \`typeof captureContext === 'string'\` check is what distinguishes them. If you want both a level AND tags, use the object form: \`{ level: 'warning', tags: { feature: 'checkout' } }\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'capture-exception', 'capture-message', 'grouping', 'fingerprint'],
    repository: sentry,
    filePath: 'packages/core/src/exports.ts',
    url: `${baseUrl}/packages/core/src/exports.ts`,
  },
  {
    title: 'Scope: setTag/setUser/setExtra mutate the isolation scope, not the current scope',
    body: `The top-level functions \`Sentry.setTag\`, \`Sentry.setUser\`, \`Sentry.setExtra\`, and \`Sentry.setContext\` all delegate to the **isolation scope**, not the current scope:

\`\`\`ts
// packages/core/src/exports.ts
export function setTag(key: string, value: Primitive): void {
  getIsolationScope().setTag(key, value);
}

export function setUser(user: User | null): void {
  getIsolationScope().setUser(user);
}
\`\`\`

The isolation scope is the one that wraps "a logical execution unit" — in Node it's an HTTP request, in the browser it's effectively the whole page. Tags set via \`Sentry.setTag()\` will be attached to every event captured in that request/page, even from setTimeout callbacks or promise chains spawned inside it.

The \`Scope\` class in \`packages/core/src/scope.ts\` stores tags as a plain object: \`this._tags = { ...this._tags, ...tags }\` — so \`setTag\` is additive (later calls overwrite earlier same-key calls but don't wipe other tags). \`setUser(null)\` is special: it doesn't delete the field, it overwrites with \`{ email: undefined, id: undefined, ip_address: undefined, username: undefined }\` so that downstream event processors clear any existing user data instead of inheriting from the global scope.

Three scopes are merged at event capture time: **global** (\`Sentry.getGlobalScope()\` — applied to every event the SDK ever sends), **isolation** (per request/page), and **current** (per \`withScope\` block). Their data is merged in that order with later scopes overriding earlier ones; see \`getCombinedScopeData()\` in \`utils/scopeData.ts\`.

Gotcha: \`setExtra\` is normalized at send time, not at set time. The depth of normalization is controlled by \`normalizeDepth\` (default 3, in \`types-hoist/options.ts\`). If you stash a deep object in extra, anything beyond depth 3 becomes the string \`'[Object]'\` or \`'[Array]'\`. Bump \`normalizeDepth\` to 5 or 6 if you're attaching nested config objects you actually want to read in the Sentry UI — but be aware the limit exists because deep recursion on circular objects used to crash the SDK.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'scope', 'tags', 'user', 'isolation-scope'],
    repository: sentry,
    filePath: 'packages/core/src/scope.ts',
    url: `${baseUrl}/packages/core/src/scope.ts`,
  },
  {
    title: 'withScope: temporary tags/user that auto-cleanup, even on throw',
    body: `\`withScope(callback)\` in \`packages/core/src/currentScopes.ts\` clones the current scope, makes the clone active for the duration of \`callback\`, then restores the previous scope:

\`\`\`ts
export function withScope<T>(
  ...rest: [callback: (scope: Scope) => T] | [scope: Scope | undefined, callback: (scope: Scope) => T]
): T {
  const carrier = getMainCarrier();
  const acs = getAsyncContextStrategy(carrier);

  if (rest.length === 2) {
    const [scope, callback] = rest;
    if (!scope) return acs.withScope(callback);
    return acs.withSetScope(scope, callback);
  }
  return acs.withScope(rest[0]);
}
\`\`\`

The actual lifecycle is implemented in the async context strategy (\`asyncContext/stack.ts\` for the default stack-based strategy, or OpenTelemetry's context manager in Node). Both guarantee the previous scope is restored even if \`callback\` throws — they wrap in try/finally.

Use case: temporarily add tags to a single capture without polluting the global scope.

\`\`\`ts
Sentry.withScope(scope => {
  scope.setTag('checkout.step', 'payment');
  scope.setExtra('cartId', cart.id);
  Sentry.captureException(err);
}); // tags + extra disappear here
\`\`\`

Without \`withScope\`, those tags would stick to every subsequent event in the same isolation context. \`withScope\` clones via \`Scope.clone()\` (line 184 of scope.ts) which copies breadcrumbs, tags, attributes, extras, and contexts as new arrays/objects, so mutations inside the callback don't leak out.

Non-obvious: \`withScope\` does NOT fork the **isolation** scope — only the current scope. So \`Sentry.setUser({...})\` inside a \`withScope\` still mutates the isolation scope and persists. Use \`withIsolationScope\` if you want to fork that too (intended for SDK internals; documented as "use at your own risk" because in browsers without a real async context strategy the fork is a no-op).

Gotcha: passing an explicit \`scope\` argument (the 2-arg overload) sets that scope as active without cloning. Mutations inside the callback persist on the passed scope, which is occasionally useful for accumulating breadcrumbs across multiple capture calls but is a footgun if you reuse the scope.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'with-scope', 'scope', 'isolation', 'lifecycle'],
    repository: sentry,
    filePath: 'packages/core/src/currentScopes.ts',
    url: `${baseUrl}/packages/core/src/currentScopes.ts`,
  },
  {
    title: 'addBreadcrumb: capped at 100, dropped silently when beforeBreadcrumb returns null',
    body: `\`addBreadcrumb\` in \`packages/core/src/breadcrumbs.ts\` is surprisingly small:

\`\`\`ts
const DEFAULT_BREADCRUMBS = 100;

export function addBreadcrumb(breadcrumb: Breadcrumb, hint?: BreadcrumbHint): void {
  const client = getClient();
  const isolationScope = getIsolationScope();
  if (!client) return;

  const { beforeBreadcrumb = null, maxBreadcrumbs = DEFAULT_BREADCRUMBS } = client.getOptions();
  if (maxBreadcrumbs <= 0) return;

  const timestamp = dateTimestampInSeconds();
  const mergedBreadcrumb = { timestamp, ...breadcrumb };
  const finalBreadcrumb = beforeBreadcrumb
    ? consoleSandbox(() => beforeBreadcrumb(mergedBreadcrumb, hint))
    : mergedBreadcrumb;

  if (finalBreadcrumb === null) return;
  if (client.emit) client.emit('beforeAddBreadcrumb', finalBreadcrumb, hint);
  isolationScope.addBreadcrumb(finalBreadcrumb, maxBreadcrumbs);
}
\`\`\`

If \`maxBreadcrumbs\` is 0 (or negative), the breadcrumb is dropped on the floor without ever calling \`beforeBreadcrumb\` — useful as a kill switch but also a footgun if you're trying to debug why your custom \`beforeBreadcrumb\` isn't firing.

Default categories that the auto-instrumentation produces (browser): \`console\`, \`ui.click\`, \`ui.keypress\`, \`navigation\` (history changes), \`fetch\`, \`xhr\`, plus \`sentry.event\` and \`sentry.transaction\` for crumbs that record the SDK's own activity. Each is added by a sub-handler inside the \`Breadcrumbs\` integration (\`packages/browser/src/integrations/breadcrumbs.ts\`), and you can disable any of them individually: \`breadcrumbsIntegration({ console: false, fetch: false })\`.

The \`hint\` parameter (a \`BreadcrumbHint\`) carries the raw event that produced the breadcrumb — for example, the original \`Response\` object for a fetch breadcrumb, or the \`MouseEvent\` for a click. \`beforeBreadcrumb\` can use the hint to decide whether to drop or modify; the hint is NOT serialized into the final event payload, so it's safe to inspect rich objects there without bloating the envelope.

Gotcha: breadcrumbs live on the **isolation scope**, not the current scope. So a breadcrumb added inside a \`withScope\` block persists after the block ends. This is intentional — breadcrumbs are meant to provide context across the whole request/page — but it surprises people who expect symmetry with \`setTag\`.

The \`consoleSandbox\` wrapper around \`beforeBreadcrumb\` exists because user code can \`console.log\` from inside the callback; without the sandbox, that log would be intercepted by the console instrumentation and become a new breadcrumb, infinite-looping.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'breadcrumbs', 'before-breadcrumb', 'isolation-scope', 'browser'],
    repository: sentry,
    filePath: 'packages/core/src/breadcrumbs.ts',
    url: `${baseUrl}/packages/core/src/breadcrumbs.ts`,
  },
  {
    title: 'beforeSend: the last-mile filter that runs after every event processor',
    body: `\`beforeSend\` is documented in \`packages/core/src/types-hoist/options.ts\` as "an event-processing callback for error and message events, guaranteed to be invoked after all other event processors":

\`\`\`ts
beforeSend?: (event: ErrorEvent, hint: EventHint) => PromiseLike<ErrorEvent | null> | ErrorEvent | null;
\`\`\`

It runs as the very last step before envelope serialization. By this point, the event has already been:
1. Built from the exception/message
2. Annotated by the global / isolation / current scope (tags, user, extra, breadcrumbs)
3. Passed through every \`addEventProcessor\` callback registered on any scope
4. Processed by every integration that defines \`processEvent\` (Dedupe, EventFilters, LinkedErrors, RewriteFrames, etc.)

Returning \`null\` drops the event. Returning the (possibly modified) event passes it through. Returning a Promise that resolves to either is fine — the SDK awaits it. Throwing inside \`beforeSend\` is caught and logged but the event is still sent (the throw is treated as "no opinion").

Common patterns this enables: stripping PII from error messages (\`event.exception.values[0].value = redact(event.exception.values[0].value)\`), adding request IDs from a context store you can't put in scope synchronously, dropping events when a feature flag is off, sampling errors based on user tier. The \`hint\` argument carries \`originalException\` and \`syntheticException\` — useful for deciding to drop based on instanceof checks before the exception was serialized to a string.

Gotcha: \`beforeSend\` only runs for **error and message** events. Transactions go through \`beforeSendTransaction\`. Spans go through \`beforeSendSpan\`. Sessions, replays, profiles, and metrics each have their own callback (\`beforeSendSession\`, \`beforeAddRecordingEvent\`, \`beforeSendMetric\`). Code that does \`if (event.type === 'transaction') return null\` inside \`beforeSend\` is dead — \`event.type\` is always undefined here because the type system filters to \`ErrorEvent\`.

Another gotcha: do NOT do network I/O inside \`beforeSend\` (e.g. calling another API). The SDK's \`flush()\` waits for in-flight promises and a slow \`beforeSend\` will block your serverless function shutdown. If you must fetch, set a timeout shorter than the SDK's \`shutdownTimeout\` (default 2s).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'before-send', 'event-processing', 'pii', 'filter'],
    repository: sentry,
    filePath: 'packages/core/src/types-hoist/options.ts',
    url: `${baseUrl}/packages/core/src/types-hoist/options.ts`,
  },
  {
    title: 'beforeSendTransaction: filter spans, not just transactions, with this hook',
    body: `Defined alongside \`beforeSend\` in \`packages/core/src/types-hoist/options.ts\`:

\`\`\`ts
beforeSendTransaction?: (
  event: TransactionEvent,
  hint: EventHint,
) => PromiseLike<TransactionEvent | null> | TransactionEvent | null;
\`\`\`

A \`TransactionEvent\` is a root span serialized for transport; it contains a \`spans\` array of all child spans, the root span attributes, the trace context, and the dynamic sampling context. Returning \`null\` drops the entire transaction (and all its child spans).

The high-leverage trick is **modifying** the transaction instead of dropping it. Common patterns:

\`\`\`ts
beforeSendTransaction(event) {
  // Drop noisy health checks
  if (event.transaction === 'GET /health') return null;

  // Strip query params from sensitive routes
  if (event.transaction?.includes('/api/auth/')) {
    event.transaction = event.transaction.replace(/\\?.+$/, '');
  }

  // Filter out span children matching a pattern
  event.spans = event.spans?.filter(s => !s.description?.startsWith('redis SET sess:'));

  return event;
}
\`\`\`

The reason filtering inside \`beforeSendTransaction\` is preferred over \`beforeSendSpan\` for noise reduction: \`beforeSendSpan\` is called per-span as each span ends, which means hundreds of callbacks per transaction. \`beforeSendTransaction\` runs once per transaction with the full picture, so you can make decisions based on the aggregate (e.g. drop only if total span count > 500).

Gotcha: filtering child spans does NOT affect the root span's \`duration\` — that's already computed. So a transaction with all its spans filtered out becomes an empty 2.5-second box in the Sentry UI. If the filtered transaction is itself uninteresting, drop the whole thing.

Another subtle gotcha: \`event.contexts.trace.dynamic_sampling_context\` is what propagates the sampling decision to downstream services via the \`baggage\` header. If you mutate \`event.transaction\` (the name) inside \`beforeSendTransaction\`, the DSC was already frozen and propagated by the time downstream services received the request — you're rewriting the local record only. To rename a transaction so the DSC matches, use \`Sentry.updateSpanName(rootSpan, name)\` inside the request handler before the transaction ends.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'before-send-transaction', 'tracing', 'spans', 'filter'],
    repository: sentry,
    filePath: 'packages/core/src/types-hoist/options.ts',
    url: `${baseUrl}/packages/core/src/types-hoist/options.ts`,
  },
  {
    title: 'tracesSampleRate: a single random draw decides the whole trace',
    body: `\`sampleSpan\` in \`packages/core/src/tracing/sampling.ts\` runs once per **root** span (transaction), not per child span:

\`\`\`ts
export function sampleSpan(
  options: Pick<CoreOptions, 'tracesSampleRate' | 'tracesSampler'>,
  samplingContext: SamplingContext,
  sampleRand: number,
): [sampled: boolean, sampleRate?: number, localSampleRateWasApplied?: boolean] {
  if (!hasSpansEnabled(options)) return [false];

  let sampleRate;
  if (typeof options.tracesSampler === 'function') {
    sampleRate = options.tracesSampler({ ...samplingContext, inheritOrSampleWith: ... });
  } else if (samplingContext.parentSampled !== undefined) {
    sampleRate = samplingContext.parentSampled;
  } else if (typeof options.tracesSampleRate !== 'undefined') {
    sampleRate = options.tracesSampleRate;
  }

  const parsedSampleRate = parseSampleRate(sampleRate);
  if (parsedSampleRate === undefined) return [false];
  if (!parsedSampleRate) return [false, parsedSampleRate, localSampleRateWasApplied];

  const shouldSample = sampleRand < parsedSampleRate;
  return [shouldSample, parsedSampleRate, localSampleRateWasApplied];
}
\`\`\`

The key insight is that \`sampleRand\` is **not** generated here — it's generated once per trace at the trace's origin and then propagated via the \`sentry-sample_rand\` baggage header. Every service in the trace compares its local \`tracesSampleRate\` against the same \`sampleRand\`. This means if service A has \`tracesSampleRate: 0.1\` and service B has \`tracesSampleRate: 0.5\`, and the trace's \`sampleRand\` happens to be 0.3, then A drops the trace but B keeps it. You get partial traces unless you align rates.

Precedence: \`tracesSampler\` function > inherited parent decision > \`tracesSampleRate\` static value. The \`inheritOrSampleWith(fallback)\` helper passed into \`tracesSampler\` lets you say "use the parent decision if there is one, otherwise apply this fallback rate" — the recommended pattern for distributed services.

Gotcha: returning \`true\` from \`tracesSampler\` is equivalent to \`1\`, returning \`false\` is equivalent to \`0\`. Returning \`NaN\`, \`undefined\`, or any non-number/non-boolean drops the trace and logs \`"Discarding root span because of invalid sample rate"\` — silent in production builds.

Profiling: \`profilesSampleRate\` (or the newer \`profileSessionSampleRate\` in \`packages/profiling-node/src/integration.ts\`) is a **second** sample applied only to traces that were already sampled. So 1.0 traces × 0.1 profiles = 10% of traces get profiles. Replays use yet another scheme (see the Replay entry).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'tracing', 'sampling', 'traces-sample-rate', 'sample-rand'],
    repository: sentry,
    filePath: 'packages/core/src/tracing/sampling.ts',
    url: `${baseUrl}/packages/core/src/tracing/sampling.ts`,
  },
  {
    title: 'tracePropagationTargets: matched against the FULL outgoing URL, with LRU cache',
    body: `\`shouldPropagateTraceForUrl\` in \`packages/core/src/utils/tracePropagationTargets.ts\` is the gate every outgoing fetch/XHR/HTTP request passes through before the SDK injects \`sentry-trace\` and \`baggage\` headers:

\`\`\`ts
export function shouldPropagateTraceForUrl(
  url: string | undefined,
  tracePropagationTargets: Options['tracePropagationTargets'],
  decisionMap?: LRUMap<string, boolean>,
): boolean {
  if (typeof url !== 'string' || !tracePropagationTargets) return true;

  const cachedDecision = decisionMap?.get(url);
  if (cachedDecision !== undefined) return cachedDecision;

  const decision = stringMatchesSomePattern(url, tracePropagationTargets);
  decisionMap?.set(url, decision);

  DEBUG_BUILD && !decision && debug.log(NOT_PROPAGATED_MESSAGE, url);
  return decision;
}
\`\`\`

If you do NOT set \`tracePropagationTargets\`, the SDK propagates to every URL — same-origin and cross-origin alike. This is the default in Node (where you usually control all destinations). In the browser, this is also the default but it's the most common cause of CORS errors: your API at \`api.example.com\` rejects the preflight that includes \`sentry-trace\` and \`baggage\` because they're not in \`Access-Control-Allow-Headers\`.

The matching rule is "URL contains the substring or matches the regex" — so \`tracePropagationTargets: ['/api']\` matches both \`/api/users\` (relative) and \`https://example.com/api/users\` (absolute). Use regex anchors if you need precision: \`/^\\/api\\//\`.

In the browser SDK the matching is performed against the **full resolved URL** (per docs in \`types-hoist/options.ts\` lines 459-471). For relative URLs in \`fetch('/api/posts')\`, that gets resolved to \`window.location.origin + path\` first. So same-origin requests will match against patterns like \`['localhost', /^\\//]\`.

The LRU cache (capacity 100, set up in \`SentryPropagator\` constructor in \`packages/opentelemetry/src/propagator.ts\`) means the regex is only evaluated once per unique URL. Hot paths with thousands of requests to the same endpoint don't pay regex overhead per call — but if you have a high-cardinality URL pattern (like \`/api/users/:id\`), every unique ID evicts an old entry and you do pay the regex cost.

Gotcha: setting \`tracePropagationTargets: []\` (empty array) is NOT the same as omitting it — empty array means "match nothing", so no headers are ever propagated and your distributed traces become single-service.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'trace-propagation', 'cors', 'distributed-tracing', 'baggage'],
    repository: sentry,
    filePath: 'packages/core/src/utils/tracePropagationTargets.ts',
    url: `${baseUrl}/packages/core/src/utils/tracePropagationTargets.ts`,
  },
  {
    title: 'startSpan: wraps a callback in a span, auto-finishes, propagates errors',
    body: `\`startSpan\` in \`packages/core/src/tracing/trace.ts\` is the recommended way to create a manual span:

\`\`\`ts
export function startSpan<T>(options: StartSpanOptions, callback: (span: Span) => T): T {
  const acs = getAcs();
  if (acs.startSpan) return acs.startSpan(options, callback);

  return withScope(customForkedScope, () => {
    const wrapper = getActiveSpanWrapper<T>(customParentSpan);
    return wrapper(() => {
      const scope = getCurrentScope();
      const parentSpan = getParentSpan(scope, customParentSpan);
      const activeSpan = createChildOrRootSpan({ parentSpan, spanArguments, forceTransaction, scope });
      _setSpanForScope(scope, activeSpan);

      return handleCallbackErrors(
        () => callback(activeSpan),
        () => {
          const { status } = spanToJSON(activeSpan);
          if (activeSpan.isRecording() && (!status || status === 'ok')) {
            activeSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
          }
        },
        () => activeSpan.end(),
      );
    });
  });
}
\`\`\`

What you get for free:
1. The span is set as **active** for the duration of the callback, so any auto-instrumentation (HTTP client, DB driver) inside the callback creates child spans of yours.
2. If the callback throws or returns a rejected Promise, the span status is set to \`internal_error\` (the OTEL error status code) automatically. The status is only set if you didn't already set one — so manual \`span.setStatus({ code: SPAN_STATUS_ERROR, message: 'unauthorized' })\` is preserved.
3. \`activeSpan.end()\` is called in a finally-equivalent block, so the span is always finished even on throw.

If \`onlyIfParent: true\` is passed and there's no active parent span, you get a \`SentryNonRecordingSpan\` and \`recordDroppedEvent('no_parent_span', 'span')\` is called for telemetry. This is the right pattern for "don't create top-level transactions from this code path, only attach to existing traces" (e.g. background workers spawned from request handlers).

Use \`startSpan\` for instrumented code blocks you can wrap synchronously. Use \`startSpanManual\` (in the same file) when the span lifetime crosses an async boundary you don't control — e.g., a span that ends when an external webhook fires. \`startInactiveSpan\` is for spans that should NOT be the active span (e.g. parallel sibling spans started in a Promise.all).

Gotcha: the OTEL-backed Node SDK has its own \`acs.startSpan\` implementation that delegates to OTEL's tracer instead of running the local code path. The behavior is the same but the code in this file is mostly inert in Node — that's why the early \`if (acs.startSpan) return acs.startSpan(...)\` exists.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'tracing', 'start-span', 'spans', 'opentelemetry'],
    repository: sentry,
    filePath: 'packages/core/src/tracing/trace.ts',
    url: `${baseUrl}/packages/core/src/tracing/trace.ts`,
  },
  {
    title: 'release + environment: backfilled onto every session, never optional for release health',
    body: `\`release\` and \`environment\` are top-level options on \`CoreOptions\` (\`packages/core/src/types-hoist/options.ts\` lines 173-198). They're not just labels — they gate a major feature: **release health**.

In \`packages/core/src/client.ts\`'s \`sendSession\` method:

\`\`\`ts
public sendSession(session: Session | SessionAggregates): void {
  const { release: clientReleaseOption, environment: clientEnvironmentOption = DEFAULT_ENVIRONMENT } = this._options;
  if ('aggregates' in session) {
    const sessionAttrs = session.attrs || {};
    if (!sessionAttrs.release && !clientReleaseOption) {
      DEBUG_BUILD && debug.warn(MISSING_RELEASE_FOR_SESSION_ERROR);
      return;
    }
    sessionAttrs.release = sessionAttrs.release || clientReleaseOption;
    sessionAttrs.environment = sessionAttrs.environment || clientEnvironmentOption;
    session.attrs = sessionAttrs;
  } else {
    if (!session.release && !clientReleaseOption) {
      DEBUG_BUILD && debug.warn('Discarded session because of missing or non-string release');
      return;
    }
    session.release = session.release || clientReleaseOption;
    session.environment = session.environment || clientEnvironmentOption;
  }
  ...
}
\`\`\`

If \`release\` is unset, **sessions are silently discarded**. The "% crash-free sessions" graph in Sentry will show no data and you'll wonder why. The warning is only logged in debug builds, so production users typically don't notice the drop until they look for the metric.

\`environment\` defaults to \`'production'\` (the \`DEFAULT_ENVIRONMENT\` constant). The validation in the docs is hard: "case-sensitive, no newlines/spaces/forward slashes, can't be 'None', 64 char max." Sentry's UI silently splits events by environment, so a typo (\`prod\` vs \`production\`) creates a parallel environment that won't show up in your default filter.

For the release name, Sentry recommends \`<package>@<version>+<commit>\` format because the UI parses it for the deploys/regressions graph. The auto-detection logic in \`packages/node-core/src/sdk/api.ts\` reads \`SENTRY_RELEASE\` env var first, then falls back to common CI provider envs (\`HEROKU_SLUG_COMMIT\`, \`VERCEL_GIT_COMMIT_SHA\`, etc.). If you build with the Sentry Vite/Webpack plugin, it auto-injects \`process.env.SENTRY_RELEASE\` at build time so you usually don't need to set it manually.

Gotcha: the release on a session is captured at session **start** time, not at error time. So a long-running browser tab that started before a deploy will continue reporting the old release even after the new bundle is loaded — this is correct behavior for crash-free-session math but surprises people debugging.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'release', 'environment', 'session-health', 'release-health'],
    repository: sentry,
    filePath: 'packages/core/src/client.ts',
    url: `${baseUrl}/packages/core/src/client.ts`,
  },
  {
    title: 'tunnel option: bypass ad-blockers by routing envelopes through your own server',
    body: `\`tunnel\` is documented in \`packages/core/src/types-hoist/options.ts\`:

> A URL to an envelope tunnel endpoint. An envelope tunnel is an HTTP endpoint that accepts Sentry envelopes for forwarding. This can be used to force data through a custom server independent of the type of data.

The implementation in \`packages/core/src/api.ts\` is one line:

\`\`\`ts
export function getEnvelopeEndpointWithUrlEncodedAuth(dsn: DsnComponents, tunnel?: string, sdkInfo?: SdkInfo): string {
  return tunnel ? tunnel : \`\${_getIngestEndpoint(dsn)}?\${_encodedAuth(dsn, sdkInfo)}\`;
}
\`\`\`

When \`tunnel\` is set, envelopes go to your URL instead of \`o12345.ingest.sentry.io\`. The auth (sentry_key) is normally included as a query string for CORS reasons (avoiding preflight); when tunneling, the tunnel endpoint is responsible for re-attaching auth and forwarding to Sentry.

Why this exists: ad-blockers (uBlock Origin, Brave Shields, AdGuard) block requests to known telemetry domains including \`*.ingest.sentry.io\`. Up to ~30% of users in some markets have ad-blockers. Without a tunnel, you simply get no error reports from those users.

A typical Next.js tunnel handler is small:

\`\`\`ts
// app/monitoring/route.ts
export async function POST(req: Request) {
  const envelope = await req.text();
  const piece = envelope.split('\\n')[0];
  const header = JSON.parse(piece);
  const dsn = new URL(header.dsn);
  const projectId = dsn.pathname.slice(1);
  const upstream = \`https://\${dsn.host}/api/\${projectId}/envelope/\`;
  return fetch(upstream, { method: 'POST', body: envelope, headers: { 'Content-Type': 'application/x-sentry-envelope' } });
}
\`\`\`

Then \`Sentry.init({ tunnel: '/monitoring' })\`.

Gotcha: the tunnel URL is treated as opaque — the SDK never appends \`?sentry_key=...\` to it (you can verify in the one-line implementation above). Your handler must parse the envelope's first line to extract the DSN and decide which Sentry project to forward to. Don't hardcode the upstream URL unless you only have one project, or you'll cross-pollute project data.

Another gotcha: tunneling defeats Sentry's own rate limiting headers because intermediate caches/CDNs in front of your tunnel may strip or normalize them. The SDK's transport reads \`X-Sentry-Rate-Limits\` from upstream responses to back off; if your tunnel doesn't proxy that header back, the SDK keeps sending and Sentry keeps 429ing.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'tunnel', 'ad-blocker', 'envelope', 'transport'],
    repository: sentry,
    filePath: 'packages/core/src/api.ts',
    url: `${baseUrl}/packages/core/src/api.ts`,
  },
  {
    title: 'EventFilters: ignoreErrors, allowUrls, denyUrls — only work if the integration is installed',
    body: `\`packages/core/src/integrations/eventFilters.ts\` (renamed from \`InboundFilters\` — both names still work) is the integration that implements three top-level options: \`ignoreErrors\`, \`ignoreTransactions\`, \`allowUrls\`/\`denyUrls\`.

\`\`\`ts
export const eventFiltersIntegration = defineIntegration((options: Partial<EventFiltersOptions> = {}) => {
  let mergedOptions: Partial<EventFiltersOptions> | undefined;
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const clientOptions = client.getOptions();
      mergedOptions = _mergeOptions(options, clientOptions);
    },
    processEvent(event, _hint, client) {
      if (!mergedOptions) {
        const clientOptions = client.getOptions();
        mergedOptions = _mergeOptions(options, clientOptions);
      }
      return _shouldDropEvent(event, mergedOptions) ? null : event;
    },
  };
});
\`\`\`

The integration is in the default browser/node integrations list. But the docs in \`types-hoist/options.ts\` line 307 are explicit: "Behavior of the \`ignoreErrors\` option is controlled by the \`Sentry.eventFiltersIntegration\` integration. If the event filters integration is not installed, the \`ignoreErrors\` option will not have any effect." So if you used \`integrations: (defaults) => defaults.filter(i => i.name !== 'EventFilters')\` to remove it, your top-level \`ignoreErrors\` is silently a no-op.

The default ignored patterns (\`DEFAULT_IGNORE_ERRORS\` at the top of the file) are an interesting list of "browser noise" the team has accumulated over years:
- \`/^Script error\\.?$/\` — opaque cross-origin errors
- \`/^ResizeObserver loop completed with undelivered notifications.$/\` — slow handler warnings, not real errors
- \`/^Cannot redefine property: googletag$/\` — GTM + ad-blocker collisions
- \`/can't redefine non-configurable property "solana"/\` — Brave/extension crypto wallet injection
- \`/Object Not Found Matching Id:\\d+, MethodName:simulateEvent/\` — CEFSharp .NET embedded chromium

These are merged with your custom patterns; pass \`disableErrorDefaults: true\` to opt out (you almost certainly don't want to — these are pure noise).

\`allowUrls\` and \`denyUrls\` match against the **filename in the top stack frame** of the exception. If the top frame is from an \`<inline>\` script, neither matches. Common pattern: \`allowUrls: [/https:\\/\\/your-cdn\\.com/]\` to drop errors thrown by third-party scripts you can't fix (Intercom, Hotjar, etc.). Gotcha: source maps are applied AFTER \`EventFilters\` runs in the SDK pipeline (sourcemap is a server-side processing step), so match against the deployed bundle URL, not the original \`.tsx\` path.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'event-filters', 'inbound-filters', 'ignore-errors', 'noise'],
    repository: sentry,
    filePath: 'packages/core/src/integrations/eventFilters.ts',
    url: `${baseUrl}/packages/core/src/integrations/eventFilters.ts`,
  },
  {
    title: 'Dedupe integration: only compares to the immediately previous event',
    body: `\`packages/core/src/integrations/dedupe.ts\` does not maintain a hash map of all recent events — it only stores the **single previous** event:

\`\`\`ts
const _dedupeIntegration = (() => {
  let previousEvent: Event | undefined;
  return {
    name: INTEGRATION_NAME,
    processEvent(currentEvent) {
      if (currentEvent.type) return currentEvent; // skip transactions/replays

      try {
        if (_shouldDropEvent(currentEvent, previousEvent)) {
          DEBUG_BUILD && debug.warn('Event dropped due to being a duplicate of previously captured event.');
          return null;
        }
      } catch {}

      return (previousEvent = currentEvent);
    },
  };
}) satisfies IntegrationFn;
\`\`\`

Two events are considered duplicates if they have:
1. The same message (or both are exception events with the same exception type+value), AND
2. The same fingerprint (or neither has one), AND
3. The same stacktrace (frame-by-frame: filename, lineno, colno, function must all match)

The "only compares to previous" design is intentional. It catches the dominant pattern of duplicate captures — e.g. an error caught in a try/catch that calls \`captureException\`, while \`window.onerror\` ALSO captures it (because the catch block re-threw, or because Promise rejection handlers also fire). These duplicates arrive milliseconds apart, so the previous-event check catches them.

It will NOT catch errors that fire in a loop with anything in between — if you have \`[errorA, errorB, errorA]\`, all three are sent because A is no longer "previous" by the time the second A arrives.

It will NOT catch transactions, spans, replays, or sessions (\`if (currentEvent.type) return currentEvent\` is the guard — error events have no \`type\` field, everything else does).

Gotcha: if you set a custom fingerprint via \`scope.setFingerprint(['my-key'])\` on event A but not on event B, even with identical messages and stacks they're treated as different (\`_isSameFingerprint\` returns false because one has a fingerprint and the other doesn't). This breaks dedup for "I want to manually group these" patterns — set the same fingerprint on both or none.

The \`try { ... } catch {}\` swallow is intentional defensive code: if comparing two malformed events throws (very rare, but possible with circular references in fingerprints), the SDK falls through to "send both" rather than crashing the entire processing pipeline.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'dedupe', 'integration', 'noise', 'fingerprint'],
    repository: sentry,
    filePath: 'packages/core/src/integrations/dedupe.ts',
    url: `${baseUrl}/packages/core/src/integrations/dedupe.ts`,
  },
  {
    title: 'GlobalHandlers: window.onerror + onunhandledrejection captured with handled:false',
    body: `\`packages/browser/src/integrations/globalhandlers.ts\` registers two global hooks at SDK init:

\`\`\`ts
function _installGlobalOnErrorHandler(client: Client): void {
  addGlobalErrorInstrumentationHandler(data => {
    const { stackParser, attachStacktrace } = getOptions();
    if (getClient() !== client || shouldIgnoreOnError()) return;

    const { msg, url, line, column, error } = data;
    const event = _enhanceEventWithInitialFrame(
      eventFromUnknownInput(stackParser, error || msg, undefined, attachStacktrace, false),
      url, line, column,
    );
    event.level = 'error';
    captureEvent(event, {
      originalException: error,
      mechanism: { handled: false, type: 'auto.browser.global_handlers.onerror' },
    });
  });
}
\`\`\`

\`mechanism.handled = false\` is what makes the event count as a "crash" for the release-health crash-free-sessions metric. Anything you capture manually via \`captureException\` defaults to \`handled: true\` and does NOT decrement crash-free %. So overriding this is a way to either inflate or deflate your crash rate by accident — only set \`handled: false\` for genuinely unrecoverable errors.

The \`Error.stackTraceLimit = 50\` set in \`setupOnce\` (line 36) is a global mutation. The Node default is 10; the browser default varies. Sentry needs deeper stacks to find the actual error origin past framework abstractions (React error boundaries, async wrappers). If your app monkey-patches \`stackTraceLimit\` for memory reasons, the GlobalHandlers integration silently overrides it — set it back AFTER \`Sentry.init\` if needed.

\`shouldIgnoreOnError()\` is a helper in \`packages/browser/src/helpers.ts\` that returns true if the SDK is currently in the middle of capturing — prevents recursive capture if a Sentry internal throws.

The unhandled rejection handler is symmetric:

\`\`\`ts
captureEvent(event, {
  originalException: error,
  mechanism: { handled: false, type: 'auto.browser.global_handlers.onunhandledrejection' },
});
\`\`\`

\`getClient() !== client\` short-circuits if a second \`Sentry.init()\` has run with a different client — this happens in tests or in micro-frontends sharing the SDK. Without the check, both clients would each capture the same global error.

Gotcha: the \`onerror\` listener is **added**, not assigned. So your existing \`window.onerror = ...\` will run alongside Sentry's listener, not replace it. If you have legacy code that returns \`true\` from \`window.onerror\` to suppress the browser's default console output, that suppression still works.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'global-handlers', 'onerror', 'unhandled-rejection', 'crash-free'],
    repository: sentry,
    filePath: 'packages/browser/src/integrations/globalhandlers.ts',
    url: `${baseUrl}/packages/browser/src/integrations/globalhandlers.ts`,
  },
  {
    title: 'Replay: replaysSessionSampleRate vs replaysOnErrorSampleRate — two completely different modes',
    body: `In \`packages/replay-internal/src/integration.ts\` and \`replay.ts\`, Replay has two recording modes that the sample rates select between:

\`\`\`ts
// Buffer mode: replay.ts startBuffering()
public startBuffering(): void {
  const session = loadOrCreateSession(
    { sessionIdleExpire, maxReplayDuration },
    { stickySession, sessionSampleRate: 0, allowBuffering: true },
  );
  this.recordingMode = 'buffer';
  this._initializeRecording();
}
\`\`\`

\`replaysSessionSampleRate\` is sampled once per session at session start. If sampled, the replay records continuously and uploads in segments — the user's whole journey is recorded. This is bandwidth-intensive (10s-100s of KB per minute of activity) so typical values are 0.01 to 0.1.

\`replaysOnErrorSampleRate\` puts the SDK in **buffer mode**. Recording happens to an in-memory ring buffer of the last 60 seconds (\`BUFFER_CHECKOUT_TIME\` constant). When an error is captured, if the per-error sample roll succeeds, the buffer is flushed and continues recording in session mode for the rest of the session. If no error fires, nothing is ever uploaded.

\`\`\`ts
// Sample check: util/isSampled.ts
export function isSampled(sampleRate?: number): boolean {
  if (sampleRate === undefined) return false;
  return Math.random() < sampleRate;
}
\`\`\`

The math.random() roll is independent for each rate. If you set both \`replaysSessionSampleRate: 0.1\` and \`replaysOnErrorSampleRate: 1.0\`, the SDK first rolls the session rate; if it loses, it falls back to buffer mode and rolls the error rate when an error happens. Net effect: 10% of sessions get full recording, of the remaining 90% any error triggers a 60s clip.

The recording flush behavior in buffer mode adds \`checkoutEveryNms: BUFFER_CHECKOUT_TIME\` (60_000 ms) so rrweb takes a full DOM snapshot every 60s — necessary because diff-only recording can't be replayed without a starting checkout, and the buffer can't keep diffs from before the last checkout.

Gotcha: the \`stickySession: true\` default (line 114 of integration.ts) persists the session ID and sampling decision in \`sessionStorage\`. So a sampled-out user stays sampled-out for the whole session even across page navigations — but they ALSO stay sampled-in if they hit reload after being sampled in. This makes per-deploy A/B tests of replay sampling tricky; clear sessionStorage to reset.

Constructor throws \`'Multiple Sentry Session Replay instances are not supported'\` if you call \`Sentry.init\` twice with replay enabled. Common mistake in Next.js apps that import the SDK in both client and server bundles without guarding.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'replay', 'session-replay', 'sample-rate', 'buffer-mode'],
    repository: sentry,
    filePath: 'packages/replay-internal/src/integration.ts',
    url: `${baseUrl}/packages/replay-internal/src/integration.ts`,
  },
  {
    title: 'Profiling (Node): profileSessionSampleRate is per-process, not per-trace',
    body: `\`packages/profiling-node/src/integration.ts\` initializes the profiler:

\`\`\`ts
public initialize(client: NodeClient): void {
  if (!isMainThread) {
    DEBUG_BUILD && debug.warn(
      '[Profiling] nodeProfilingIntegration() does not support worker threads — profiling will be disabled for this thread.',
    );
    return;
  }

  this._client = client;
  const options = client.getOptions();
  this._mode = getProfilingMode(options);
  this._sessionSamplingRate = Math.random();
  this._sampled = this._sessionSamplingRate < (options.profileSessionSampleRate ?? 0);
  this._profileLifecycle = options.profileLifecycle ?? 'manual';
  ...
}
\`\`\`

The key line is \`this._sessionSamplingRate = Math.random()\` — sampled ONCE at process start. So if your \`profileSessionSampleRate\` is 0.1 and you lose the roll, this entire process never profiles, even across thousands of requests. The next process restart gets a new roll.

This is intentionally different from \`tracesSampleRate\` (per-trace) and \`profilesSampleRate\` (legacy, per-trace, deprecated). The continuous-profiler model is "this process is or isn't a profiling node," with chunks uploaded every \`CHUNK_INTERVAL_MS\` (60 seconds) when sampled. The benefit is steady CPU/memory overhead — no decision per request.

Worker threads are explicitly opted out (\`if (!isMainThread)\`). This is because the underlying CPU profiler from \`@sentry-internal/node-cpu-profiler\` uses V8's profiling APIs that don't compose cleanly across worker thread boundaries. If your workload runs in workers (e.g. Bull jobs in worker mode), you won't get profiles for them.

The \`profileLifecycle\` option (\`'manual' | 'trace'\`) selects how chunks correlate to traces. \`'trace'\` lifecycle starts/stops profiling around the active root span — useful for isolating a single endpoint. \`'manual'\` (default) requires explicit \`Sentry.profiler.startProfiler()\` / \`stopProfiler()\` calls, useful for profiling specific code blocks.

Gotcha: the legacy \`profilesSampleRate\` (per-span) and the new \`profileSessionSampleRate\` (per-process) trigger different code paths. The integration switches mode based on which option you set: \`'profilesSampleRate' in options || 'profilesSampler' in options\` flips into legacy "span" mode. Setting both is supported but only the legacy one is honored — easy to misconfigure during migration.

Profiling adds non-trivial CPU overhead (~1-3% per the docs). Sample sparsely in production. Memory overhead is bounded by \`PROFILE_MAP = new LRUMap(50)\` — only the 50 most recent profiles are kept in memory pending upload.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'profiling', 'node', 'cpu-profiling', 'sample-rate'],
    repository: sentry,
    filePath: 'packages/profiling-node/src/integration.ts',
    url: `${baseUrl}/packages/profiling-node/src/integration.ts`,
  },
  {
    title: 'OpenTelemetry integration: SentrySpanProcessor onStart is where parent linkage happens',
    body: `\`packages/opentelemetry/src/spanProcessor.ts\` is what makes the Node SDK an "OTel-compatible" SDK — it accepts OTel \`Span\` objects from any OTel instrumentation and converts them to Sentry spans:

\`\`\`ts
public onStart(span: Span, parentContext: Context): void {
  const parentSpan = trace.getSpan(parentContext);
  let scopes = getScopesFromContext(parentContext);

  if (parentSpan && !parentSpan.spanContext().isRemote) {
    addChildSpanToSpan(parentSpan, span);
  }

  if (parentSpan?.spanContext().isRemote) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_PARENT_IS_REMOTE, true);
  }

  if (parentContext === ROOT_CONTEXT) {
    scopes = { scope: getDefaultCurrentScope(), isolationScope: getDefaultIsolationScope() };
  }

  if (scopes) {
    setCapturedScopesOnSpan(span, scopes.scope, scopes.isolationScope);
  }

  logSpanStart(span);
  client?.emit('spanStart', span);
}
\`\`\`

The key behaviors:
1. **Parent linkage**: every span's parent is looked up via OTel's context API. Local parents (same process) get registered in Sentry's span tree via \`addChildSpanToSpan\`. Remote parents (incoming distributed trace headers) are flagged with \`SENTRY_PARENT_IS_REMOTE\` so the span exporter knows to keep them as separate root spans on Sentry's side.
2. **Scope capture**: at span START time, the current Sentry scope (tags, user, breadcrumbs) is captured and pinned to the span. When the span ends much later, the pinned scope is what gets attached to the resulting transaction event — not whatever scope is active at end time. This matters for async work: a span started in request handler A but ended in callback B will be tagged with A's user, not B's.
3. **Root context fallback**: if there's no scope on the OTel context (because the span originated outside Sentry's instrumentation), Sentry's global default scopes are used.

Why this matters: the Node SDK uses OTel's \`AsyncLocalStorageContextManager\` (\`asyncLocalStorageContextManager.ts\`) for context propagation. So Node's async_hooks (the same primitive that powers Express request isolation) is the substrate for Sentry's scope propagation. If you're using a framework that breaks AsyncLocalStorage (some custom thread-pool libraries, some workers), spans started in those code paths get the global default scope instead of the request-bound one — your tags don't propagate.

Gotcha: \`forceFlush\` only flushes the Sentry-side queue (\`this._exporter.flush()\`). It does NOT call OTel's BatchSpanProcessor flush. If you have other OTel exporters (Datadog, Honeycomb) running alongside Sentry, you need to flush them separately on serverless shutdown or you'll lose traces.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'opentelemetry', 'span-processor', 'async-local-storage', 'distributed-tracing'],
    repository: sentry,
    filePath: 'packages/opentelemetry/src/spanProcessor.ts',
    url: `${baseUrl}/packages/opentelemetry/src/spanProcessor.ts`,
  },
  {
    title: 'sentry-trace + baggage propagation: how SentryPropagator handles existing headers',
    body: `\`packages/opentelemetry/src/propagator.ts\` implements W3C trace context propagation specifically for Sentry's \`sentry-trace\` and \`baggage\` headers. The \`inject\` method handles the gnarly case where the carrier already has a baggage header from another system:

\`\`\`ts
public inject(context: Context, carrier: unknown, setter: TextMapSetter): void {
  if (isTracingSuppressed(context)) return;

  const activeSpan = trace.getSpan(context);
  const url = activeSpan && getCurrentURL(activeSpan);

  const { tracePropagationTargets, propagateTraceparent } = getClient()?.getOptions() || {};
  if (!shouldPropagateTraceForUrl(url, tracePropagationTargets, this._urlMatchesTargetsMap)) return;

  const existingBaggageHeader = getExistingBaggage(carrier);
  const existingSentryTraceHeader = getExistingSentryTrace(carrier);

  let baggage = propagation.getBaggage(context) || propagation.createBaggage({});

  const { dynamicSamplingContext, traceId, spanId, sampled } = getInjectionData(context);

  if (existingBaggageHeader) {
    const baggageEntries = parseBaggageHeader(existingBaggageHeader);
    if (baggageEntries) {
      Object.entries(baggageEntries).forEach(([key, value]) => {
        if (!existingSentryTraceHeader && key.startsWith(SENTRY_BAGGAGE_KEY_PREFIX)) {
          // Edge case: A baggage header with sentry- keys was added previously but no
          // sentry-trace header. In this case we remove the old sentry-keys and add new ones below.
          return;
        }
        baggage = baggage.setEntry(key, { value });
      });
    }
  }
\`\`\`

The "edge case" comment is critical context. If something upstream (a misconfigured proxy, a half-implemented SDK) added \`sentry-public_key=xyz\` to baggage but did NOT add a corresponding \`sentry-trace\` header, the SDK strips the orphaned \`sentry-*\` baggage entries and writes its own. This prevents trace ID mismatches where baggage says trace A but the new \`sentry-trace\` header says trace B.

Non-Sentry baggage entries (e.g. another vendor's \`request_id\`) are preserved verbatim. So Sentry coexists with other propagators that use the W3C baggage spec.

The \`SENTRY_BAGGAGE_KEY_PREFIX\` is \`'sentry-'\` (from \`packages/core/src/utils/baggage.ts\`). A typical sentry baggage looks like:
\`\`\`
sentry-trace_id=abc...,sentry-public_key=xyz,sentry-sample_rate=0.1,sentry-sample_rand=0.0314,sentry-environment=production,sentry-release=app@1.2.3
\`\`\`

The \`sentry-trace\` header itself is a separate format: \`<trace-id>-<span-id>-<sampled>\`, e.g. \`abc...def-1234567890abcdef-1\`.

Gotcha: \`MAX_BAGGAGE_STRING_LENGTH = 8192\` (W3C limit). If your baggage hits the limit, \`objectToBaggageHeader\` in baggage.ts skips entries instead of truncating, with only a debug warning. So an upstream service putting huge values in baggage (e.g. user emails) silently disables Sentry's DSC propagation downstream.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'propagator', 'baggage', 'sentry-trace', 'distributed-tracing'],
    repository: sentry,
    filePath: 'packages/opentelemetry/src/propagator.ts',
    url: `${baseUrl}/packages/opentelemetry/src/propagator.ts`,
  },
  {
    title: 'BrowserTracing: bot user agents skip page-load spans entirely',
    body: `\`packages/browser/src/tracing/browserTracingIntegration.ts\` opens with a regex you might not expect:

\`\`\`ts
const BOT_USER_AGENT_RE =
  /Googlebot|Google-InspectionTool|Storebot-Google|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|Facebot|facebookexternalhit|LinkedInBot|Twitterbot|Applebot/i;

export function isBotUserAgent(): boolean {
  const nav = WINDOW.navigator as Navigator | undefined;
  if (!nav?.userAgent) return false;
  return BOT_USER_AGENT_RE.test(nav.userAgent);
}
\`\`\`

The comment above the regex explains: "We don't want to start a bunch of idle timers and PerformanceObservers for web crawlers, as they may prevent the page from being seen as 'idle' by the crawler's rendering engine (e.g. Googlebot's headless Chromium)."

This is observability hurting SEO. A page that never finishes loading (because Sentry has open performance observers) signals to Googlebot that the page is broken or slow — affecting search ranking. So the SDK actively detects bots and disables auto-instrumentation for them.

The \`browserTracingIntegration\` has a long set of options — defaults applied:
- \`idleTimeout: 1000\` — a span stays open until 1s passes with no new child spans
- \`finalTimeout: 30000\` — hard cutoff; even if children are still being added, the span finishes at 30s
- \`childSpanTimeout: 15000\` — individual child spans get killed at 15s
- \`instrumentPageLoad: true\` and \`instrumentNavigation: true\` — auto-create transactions for these events

The \`idleTimeout\` is the trickiest. A SPA route change creates a transaction; child spans accumulate (fetch, render, image loads); when 1s passes with no new child, the transaction closes. If your app has a heartbeat fetch every 800ms, your "navigation" transaction never ends until \`finalTimeout\` kicks in at 30s, vastly inflating your "page load" duration metric.

For React Router / Next.js / TanStack Router: there's framework-specific code that hooks into the router and calls \`startBrowserTracingNavigationSpan\` with the route pattern (e.g. \`/users/:id\` not \`/users/12345\`). Without that, every distinct URL becomes a separate transaction name in Sentry — a high-cardinality nightmare. The \`@sentry/react\`, \`@sentry/nextjs\`, \`@sentry/react-router\` packages do this wiring; without them you have to call \`startBrowserTracingNavigationSpan({ name: routePattern })\` manually on route change.

Gotcha: \`isBotUserAgent\` only checks navigator.userAgent. New crawlers (especially AI scrapers like GPTBot, ClaudeBot) are NOT in the regex. If you care about those, you can extend EventFilters' \`ignoreErrors\` instead, or check user-agent in your own \`tracesSampler\` and return 0.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'browser-tracing', 'bot-detection', 'page-load', 'idle-timeout'],
    repository: sentry,
    filePath: 'packages/browser/src/tracing/browserTracingIntegration.ts',
    url: `${baseUrl}/packages/browser/src/tracing/browserTracingIntegration.ts`,
  },
  {
    title: 'Node SDK init: defaults to OpenTelemetry setup unless skipOpenTelemetrySetup is true',
    body: `\`packages/node/src/sdk/index.ts\` shows that the modern Node SDK is OTel-first:

\`\`\`ts
export function init(options: NodeOptions | undefined = {}): NodeClient | undefined {
  return _init(options, getDefaultIntegrations);
}

function _init(
  options: NodeOptions | undefined = {},
  getDefaultIntegrationsImpl: (options: Options) => Integration[],
): NodeClient | undefined {
  applySdkMetadata(options, 'node');

  const client = initNodeCore({
    ...options,
    defaultIntegrations: options.defaultIntegrations ?? getDefaultIntegrationsImpl(options),
  });

  if (client && !options.skipOpenTelemetrySetup) {
    initOpenTelemetry(client, {
      spanProcessors: options.openTelemetrySpanProcessors,
    });
    validateOpenTelemetrySetup();
  }

  return client;
}
\`\`\`

Behind \`initOpenTelemetry\` is the actual OTel SDK setup: a \`NodeTracerProvider\` is created, the \`SentrySpanProcessor\` is registered, the \`SentryPropagator\` is set as the global propagator, and an \`AsyncLocalStorageContextManager\` is enabled for context propagation. This means the Node SDK is now incompatible with running your own OTel SDK setup unless you carefully merge.

\`skipOpenTelemetrySetup: true\` is the escape hatch for users who already have their own OTel SDK (e.g. they're sending traces to Honeycomb AND Sentry). When this flag is set, you must:
1. Register \`SentrySpanProcessor\` on your existing tracer provider
2. Wrap your existing propagator with the W3C baggage propagator that includes sentry- keys
3. Make sure your context manager preserves Sentry scope information (use \`SentryContextManager\` from \`@sentry/opentelemetry\`)

The default integrations from \`getDefaultIntegrationsWithoutPerformance()\` give you http instrumentation, node-fetch instrumentation, console-as-breadcrumbs, uncaught exception/rejection handlers, and node context. The performance integrations (Express, Fastify, Postgres, MongoDB, GraphQL, Redis, Mysql, NestJS, etc.) are added conditionally only when \`hasSpansEnabled(options)\` is true — i.e., when \`tracesSampleRate\` or \`tracesSampler\` is configured.

Gotcha: the integration filtering in line 22-24 — \`nodeCoreIntegrations.filter(integration => integration.name !== 'Http' && integration.name !== 'NodeFetch')\` — exists because node-core has stub HTTP integrations and the full Node SDK has the OTel-backed versions. If you import from \`@sentry/node-core\` directly (rare; recommended for serverless platforms with cold-start budget), you get the lightweight versions without OTel overhead but lose automatic span creation for HTTP.

The \`@sentry/node/init\` import (\`packages/node/src/init.ts\`) exists for the \`node --import @sentry/node/init app.mjs\` pattern, which lets you initialize Sentry entirely from \`SENTRY_DSN\` env var without touching app code.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'node', 'opentelemetry', 'init', 'instrumentation'],
    repository: sentry,
    filePath: 'packages/node/src/sdk/index.ts',
    url: `${baseUrl}/packages/node/src/sdk/index.ts`,
  },
  {
    title: 'debug: true requires a debug bundle — production bundles strip all debug.x calls',
    body: `\`initAndBind\` in \`packages/core/src/sdk.ts\` enforces the rule:

\`\`\`ts
export function initAndBind<F extends Client, O extends ClientOptions>(
  clientClass: ClientClass<F, O>,
  options: O,
): Client {
  if (options.debug === true) {
    if (DEBUG_BUILD) {
      debug.enable();
    } else {
      // use \`console.warn\` rather than \`debug.warn\` since by non-debug bundles have all \`debug.x\` statements stripped
      consoleSandbox(() => {
        console.warn('[Sentry] Cannot initialize SDK with \`debug\` option using a non-debug bundle.');
      });
    }
  }
  const scope = getCurrentScope();
  scope.update(options.initialScope);

  const client = new clientClass(options);
  setCurrentClient(client);
  client.init();
  return client;
}
\`\`\`

\`DEBUG_BUILD\` is a compile-time constant set by the build process. The default npm packages (\`@sentry/browser\`, \`@sentry/node\`) ship with \`DEBUG_BUILD = false\` — so EVERY \`DEBUG_BUILD && debug.log(...)\` and \`DEBUG_BUILD && debug.warn(...)\` call in the SDK source becomes \`false && ...\` and is dead-code eliminated by the bundler. The result: zero observable behavior from \`debug: true\`, just a single console.warn telling you why.

The debug bundle is a separate package (\`@sentry/browser/build/bundles/bundle.debug.min.js\` for CDN users, or specific export paths for npm users — see CHANGELOG for version-specific instructions). Loading the debug build adds ~30KB and emits internal SDK logs to console: which integrations loaded, why an event was dropped, what URL the propagator decided to skip, etc.

Why the extra build step instead of a runtime flag: bundle size. A production-grade browser SDK that's >100KB gzipped would be unusable. By stripping debug code at build time, the SDK gets to write defensive logging everywhere (and there are HUNDREDS of debug.log/warn calls in the source) without paying for it in shipped bytes.

The \`consoleSandbox\` wrapper exists because \`Sentry.init({ debug: true })\` might be called BEFORE the console instrumentation is set up, but ALSO might be called after it. The sandbox temporarily restores native console methods, calls the wrapped function, and re-installs the patched ones. Without it, the warning could re-enter the SDK as a breadcrumb.

Gotcha: in dev (Vite, Next.js dev server), the SDK is usually the production bundle anyway because dev-only Sentry packages are rare. If you need real debug output, point your bundler at the explicit debug entry. For Node, run with the \`@sentry/node\` package's debug-aware ESM resolver — or just temporarily \`console.log\` from a custom integration's \`processEvent\` hook.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'debug', 'init', 'bundle-size', 'tree-shaking'],
    repository: sentry,
    filePath: 'packages/core/src/sdk.ts',
    url: `${baseUrl}/packages/core/src/sdk.ts`,
  },
  {
    title: 'User Feedback widget: lazy-loads modal + screenshot integrations to keep base bundle small',
    body: `\`packages/feedback/src/core/integration.ts\` builds the feedback integration with two strategies for loading the modal/screenshot components:

\`\`\`ts
type BuilderOptions =
  | {
      lazyLoadIntegration?: never;
      getModalIntegration: () => IntegrationFn;
      getScreenshotIntegration: () => IntegrationFn;
    }
  | {
      lazyLoadIntegration: (
        name: 'feedbackModalIntegration' | 'feedbackScreenshotIntegration',
        scriptNonce?: string,
      ) => Promise<IntegrationFn>;
      getModalIntegration?: never;
      getScreenshotIntegration?: never;
    };

export const buildFeedbackIntegration = ({
  lazyLoadIntegration,
  getModalIntegration,
  getScreenshotIntegration,
}: BuilderOptions): IntegrationFn<...> => {
  const feedbackIntegration = (({
    id = 'sentry-feedback',
    autoInject = true,
    showBranding = true,
    isEmailRequired = false,
    isNameRequired = false,
    showEmail = true,
    showName = true,
    enableScreenshot = true,
    useSentryUser = { email: 'email', name: 'username' },
    ...
  }) => { ... });
};
\`\`\`

The two strategies exist because the modal and screenshot code is heavy (DOM manipulation, html2canvas-equivalent for screenshots). The CDN bundle uses \`lazyLoadIntegration\` to fetch them from Sentry's CDN only when the user clicks the feedback button — your base bundle stays tiny. The npm package uses \`getModalIntegration\`/\`getScreenshotIntegration\` to import them eagerly because bundlers handle code-splitting better than runtime fetches.

\`autoInject: true\` (default) automatically injects a floating "Report a Bug" button into the page. Set to \`false\` and call \`feedbackIntegration.attachTo(myButton)\` to use your own trigger element.

\`useSentryUser\` is the integration's contract for prefilling the form: it reads the user's email/name from \`scope.getUser()\` if those keys exist. So if you've called \`Sentry.setUser({ email, username })\` before the user opens the form, those fields are already populated. Pass an empty object to disable prefill.

The feedback event is sent as a separate envelope item (not as an error event), so it does NOT count toward your error quota. It does count toward a separate "feedback" quota.

Gotcha: feedback events bypass \`beforeSend\` — they go through \`beforeSendFeedback\` (a separate top-level option). Code that filters PII via \`beforeSend\` won't filter feedback messages, which can be problematic because users often paste sensitive info into the description box. If you handle PII in \`beforeSend\`, mirror the logic into \`beforeSendFeedback\`.

Another gotcha: \`enableScreenshot: true\` will only actually offer screenshots if the browser supports the required APIs (checked via \`isScreenshotSupported\`). Safari versions before 14 don't, so the screenshot button silently disappears for those users — not a bug, but surprising during cross-browser testing if you only test in Chrome.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['sentry', 'user-feedback', 'feedback-widget', 'lazy-load', 'browser'],
    repository: sentry,
    filePath: 'packages/feedback/src/core/integration.ts',
    url: `${baseUrl}/packages/feedback/src/core/integration.ts`,
  },
];
