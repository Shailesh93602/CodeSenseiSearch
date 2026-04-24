/**
 * Batch github-022-actions-toolkit
 *
 * 20 GitHub Actions toolkit + workflow patterns drawn from the actual
 * source of actions/toolkit (the @actions/* family on npm). Each entry
 * is attributed to a real file in the monorepo. The `url` always
 * resolves to the canonical file on `main`.
 *
 * Authoring rules (see CORPUS-PLAN.md):
 * - Real attribution; no fabricated URLs
 * - Real patterns the project actually implements
 * - 250-450 word body
 * - One topic per entry
 * - WHAT + HOW (real code) + WHY + non-obvious gotcha
 */

import type { SeedItem } from '../types';

const actionsToolkit = { owner: 'actions', name: 'toolkit' };
const baseUrl = 'https://github.com/actions/toolkit/blob/main';

export const BATCH: SeedItem[] = [
  {
    title: 'core.getInput reads INPUT_<NAME> env vars and trims by default',
    body: `Action inputs declared in \`action.yml\` are passed to the JS process as environment variables prefixed with \`INPUT_\`, with spaces replaced by underscores and the name uppercased. \`getInput\` is just an env-var lookup with whitespace trimming and a required-flag check.

\`\`\`ts
export function getInput(name: string, options?: InputOptions): string {
  const val: string =
    process.env[\`INPUT_\${name.replace(/ /g, '_').toUpperCase()}\`] || ''
  if (options && options.required && !val) {
    throw new Error(\`Input required and not supplied: \${name}\`)
  }

  if (options && options.trimWhitespace === false) {
    return val
  }

  return val.trim()
}
\`\`\`

WHY this matters: the runner injects every \`with:\` value into env at step start — that is the entire mechanism. There is no callback into the runner to "fetch" an input later. So \`process.env.INPUT_FOO\` and \`core.getInput('foo')\` are interchangeable, except getInput handles the case-and-space mangling for you.

The non-obvious gotchas:

1. \`required: true\` only throws when the value is the empty string. If the workflow author writes \`with: { token: '' }\` you get the throw; if they omit the input entirely AND the action yaml declares a \`default:\`, the runner injects the default before you ever see it — so "required" is really "non-empty after default substitution."

2. Trimming is on by default. If your input is a multi-line shell script or a YAML literal block you want byte-for-byte, pass \`{ trimWhitespace: false }\` or you'll silently lose leading indentation. \`getMultilineInput\` splits on \`\\n\` and trims each line for the same reason.

3. Boolean inputs use \`getBooleanInput\`, which only accepts the YAML 1.2 core schema (\`true|True|TRUE|false|False|FALSE\`) and throws \`TypeError\` on anything else — no \`yes\`, no \`1\`, no \`on\`. This trips up users coming from Ansible or docker-compose; document accepted values in your action's README.

4. The \`INPUT_\` env vars persist for the entire step's process tree. If you spawn a subprocess (via @actions/exec) that subprocess can read them too — fine for trusted scripts, but if you exec untrusted code you should sanitize \`process.env\` first.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'core', 'inputs', 'env-vars'],
    repository: actionsToolkit,
    filePath: 'packages/core/src/core.ts',
    url: `${baseUrl}/packages/core/src/core.ts`,
  },
  {
    title: 'core.setOutput writes to GITHUB_OUTPUT file, not the deprecated ::set-output:: command',
    body: `Outputs in current Actions runners are written to the file at \`$GITHUB_OUTPUT\` using a heredoc-style key/value/delimiter format. The legacy \`::set-output name=...::value\` workflow command was deprecated in October 2022 (CVE-2020-15228) because attacker-controlled output values could inject arbitrary commands via the \`::\` syntax.

\`\`\`ts
export function setOutput(name: string, value: any): void {
  const filePath = process.env['GITHUB_OUTPUT'] || ''
  if (filePath) {
    return issueFileCommand('OUTPUT', prepareKeyValueMessage(name, value))
  }

  process.stdout.write(os.EOL)
  issueCommand('set-output', {name}, toCommandValue(value))
}
\`\`\`

The branch falls back to the legacy stdout command only when \`GITHUB_OUTPUT\` is unset — which on hosted runners since Nov 2022 it never is. The fallback exists for self-hosted runners that haven't been upgraded; on GitHub.com it's dead code.

The file format is non-obvious. \`prepareKeyValueMessage\` uses a per-call random delimiter:

\`\`\`ts
const delimiter = \`ghadelimiter_\${crypto.randomUUID()}\`
return \`\${key}<<\${delimiter}\${EOL}\${convertedValue}\${EOL}\${delimiter}\`
\`\`\`

So writing output \`foo=bar\\nbaz\` appends:

\`\`\`
foo<<ghadelimiter_8f3a...
bar
baz
ghadelimiter_8f3a...
\`\`\`

WHY a UUID delimiter? Because the value can contain literally anything — JSON blobs, multi-line shell output, YAML — and a fixed delimiter could appear inside the value and confuse the parser on the runner side. The function explicitly throws if the value happens to contain the delimiter (cosmically unlikely with a v4 UUID, but defended against anyway).

Gotchas: (a) Outputs are scoped to the step that wrote them and consumed via \`steps.<id>.outputs.<name>\` in later steps of the same job. Cross-job output requires \`jobs.<id>.outputs:\` mapping. (b) Outputs are coerced to strings via \`toCommandValue\` (which JSON-stringifies non-strings), so \`setOutput('count', 42)\` produces the string \`"42"\` — downstream \`if:\` expressions need to compare against \`'42'\` not \`42\`. (c) Maximum output value size is ~1 MB per the runner; for larger blobs use artifacts.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'core', 'outputs', 'github-output', 'security'],
    repository: actionsToolkit,
    filePath: 'packages/core/src/core.ts',
    url: `${baseUrl}/packages/core/src/core.ts`,
  },
  {
    title: 'core.setSecret registers a mask via ::add-mask:: — only future logs are protected',
    body: `\`setSecret\` is a one-liner that emits the \`add-mask\` workflow command. The runner takes the value, builds a literal-string matcher, and replaces every future occurrence in stdout/stderr with \`***\`.

\`\`\`ts
export function setSecret(secret: string): void {
  issueCommand('add-mask', {}, secret)
}
\`\`\`

The output line is \`::add-mask::\${secret}\` (after escaping). The runner intercepts that line, registers the value, and then strips the line from the visible log. Subsequent logs that happen to contain the value see it replaced with \`***\` — including stdout from spawned processes, error messages, and even step summaries.

The MOST important thing the docstring spells out and people miss: "masking only affects future logs; any previous appearances of the secret in logs before calling this function will remain unmasked." If you fetch a token from a vault, log it for debugging, and THEN call setSecret, the leak is already in the run log forever. Always register the mask the instant you obtain a value, before any other code runs.

Other non-obvious traits:

1. The mask is a literal string, not a regex. If your secret is \`hunter2\` and a log line contains \`hunter22\`, only the first 7 chars get masked — the line shows \`***2\`. This is leak-prone for short or low-entropy secrets.

2. Multiline secrets get masked line-by-line. A PEM private key (\`-----BEGIN ... -----\\n... -----END ... -----\`) needs to be split on \`\\n\` and each line registered individually if you want robust masking, otherwise the runner only matches the exact multi-line blob.

3. JSON-encoded secrets are NOT masked when re-encoded. If the secret is \`s3cret\` and somewhere your code does \`JSON.stringify({ token: 's3cret' })\`, the substring \`s3cret\` is still in the output and IS masked. But if your code base64-encodes it first, the encoded form is a different string and won't match — register both forms with two setSecret calls.

4. \`OidcClient.getIDToken\` already calls \`setSecret(id_token)\` on the way back, so the ID token returned by \`core.getIDToken()\` is masked automatically. Most other secret-bearing helpers do NOT — you're expected to mask manually.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'core', 'secrets', 'masking', 'security'],
    repository: actionsToolkit,
    filePath: 'packages/core/src/core.ts',
    url: `${baseUrl}/packages/core/src/core.ts`,
  },
  {
    title: 'core.setFailed sets process.exitCode = 1 and emits an error annotation',
    body: `\`setFailed\` is the canonical "fail this step" call. It does two things: sets \`process.exitCode = ExitCode.Failure\` (which is \`1\`), then routes the message through \`error()\` so it shows up as a red annotation on the workflow run page.

\`\`\`ts
export function setFailed(message: string | Error): void {
  process.exitCode = ExitCode.Failure
  error(message)
}
\`\`\`

WHY \`exitCode\` instead of \`process.exit(1)\`? Because \`process.exit\` immediately terminates the Node event loop — it kills pending promises, half-flushed writes to stdout, and any \`finally\` blocks higher up the stack. Setting \`exitCode\` lets the program drain naturally and exit non-zero only when there is genuinely no more work, which is what you want for an action that may have spawned subprocesses or queued stdout writes. The action's exit becomes the step's outcome: zero is success, non-zero is failure.

The error annotation is emitted via the \`error()\` helper, which boils down to \`::error::\${message}\` on stdout. The runner parses that and turns it into a checkrun annotation that surfaces in the PR Files-changed view (if file/line properties are passed) or as a top-level error in the run log otherwise.

Non-obvious traits and gotchas:

1. Calling \`setFailed\` does NOT abort the rest of your action code. It only marks the step as failed-on-exit. If you want to bail immediately, follow it with \`return\` or \`throw\`. A common bug: handling an error with \`setFailed(err)\` then continuing to do work that depends on the prior step's success.

2. Multiple \`setFailed\` calls just keep emitting error annotations and re-set exitCode to 1 (already 1). Each error annotation appears separately.

3. If you accidentally call \`process.exit(0)\` later, you'll OVERRIDE \`process.exitCode = 1\` and the step turns green. Never call \`process.exit\` from action code; let Node drain.

4. \`setFailed\` accepts \`Error\` and toString()s it via the inner \`error()\`. That means the annotation includes \`Error: \` prefix and (depending on your tsconfig) may include the stack. If you don't want the stack in the public log, pass \`err.message\` not \`err\`.

5. There's no "warn but pass" version with the same exit semantics — for that, use \`core.warning(...)\` without setting exitCode.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'core', 'error-handling', 'exit-code'],
    repository: actionsToolkit,
    filePath: 'packages/core/src/core.ts',
    url: `${baseUrl}/packages/core/src/core.ts`,
  },
  {
    title: 'core.error / warning / notice annotations with file + line properties',
    body: `The three annotation helpers — \`error\`, \`warning\`, \`notice\` — all delegate to \`issueCommand\` with the same shape: a command name, a properties object, and a message. The properties object is what turns a plain log line into a clickable PR annotation.

\`\`\`ts
export function error(
  message: string | Error,
  properties: AnnotationProperties = {}
): void {
  issueCommand(
    'error',
    toCommandProperties(properties),
    message instanceof Error ? message.toString() : message
  )
}
\`\`\`

The supported \`AnnotationProperties\` are \`title\`, \`file\`, \`startLine\`, \`endLine\`, \`startColumn\`, \`endColumn\`. When all four position props are set, the runner renders the annotation as a code-review-style comment on the exact lines of the diff in the PR Files-changed view. With only \`file\` set, it appears as a file-level annotation. With nothing, it's a run-log annotation.

The wire format is \`::error file=src/foo.ts,line=42,col=7,title=Bad name::Variable shadows outer scope\`. Properties go through \`escapeProperty\` which percent-encodes \`%\`, CR, LF, \`:\`, and \`,\` — without that escaping a filename containing a comma would break parsing.

WHY three levels? The runner color-codes them (red error, yellow warning, blue notice) and only \`error\` actually contributes to the step's check-run summary count. \`warning\` and \`notice\` are purely informational — neither fails the step, neither sets exitCode. If you want a step to fail BECAUSE of an error, you also need \`setFailed\` (which calls \`error\` AND sets exitCode).

Gotchas:

1. There is a HARD CAP of 10 annotations per kind per step. Number 11+ are silently dropped from the UI (still in the log). For a linter that finds 200 issues, post a step summary table instead and emit only the first 10 as annotations.

2. \`endColumn\` cannot be set when \`startLine\` and \`endLine\` differ. The runner ignores it in that case. Multi-line annotations are line-range only.

3. The \`title\` property is what shows in the PR conversation tab as the annotation header; the message body shows when expanded. A good title is short and scannable ("Unused import"), the body has the detail.

4. Paths in \`file:\` are interpreted relative to the workspace root (\`$GITHUB_WORKSPACE\`). Absolute paths work but break if your action runs in a container with a different mount.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'core', 'annotations', 'pr-review'],
    repository: actionsToolkit,
    filePath: 'packages/core/src/core.ts',
    url: `${baseUrl}/packages/core/src/core.ts`,
  },
  {
    title: 'core.summary builds an HTML buffer that renders as the job summary',
    body: `The \`core.summary\` singleton is a tiny HTML-builder DSL. Each \`add*\` method appends to an in-memory buffer; \`write()\` flushes the buffer to the file at \`$GITHUB_STEP_SUMMARY\`, which the runner uploads and renders as the markdown/HTML summary on the workflow run page.

\`\`\`ts
async write(options?: SummaryWriteOptions): Promise<Summary> {
  const overwrite = !!options?.overwrite
  const filePath = await this.filePath()
  const writeFunc = overwrite ? writeFile : appendFile
  await writeFunc(filePath, this._buffer, {encoding: 'utf8'})
  return this.emptyBuffer()
}
\`\`\`

The class methods are chainable and emit raw HTML, not markdown — you're really constructing a fragment:

\`\`\`ts
await core.summary
  .addHeading('Test results')
  .addTable([
    [{ data: 'Suite', header: true }, { data: 'Passed', header: true }],
    ['unit', '247'],
    ['e2e',  '11'],
  ])
  .addDetails('Stack trace', '<pre>...</pre>')
  .addLink('Full logs', 'https://...')
  .write();
\`\`\`

WHY HTML and not markdown? GitHub renders the summary file with full HTML support including \`<table>\`, \`<details>\`, \`<img>\`, allowing rich layouts that GFM can't express. Markdown still works (the file is rendered as GFM, and inline HTML is allowed within GFM), but the helpers all emit HTML so you don't need to think about table-pipe escaping.

Non-obvious gotchas:

1. \`filePath()\` does an \`access(path, R_OK | W_OK)\` check the first time it's called and caches the result. If the env var is missing — which happens when running locally outside a runner — it throws. Wrap in try/catch when developing locally or feature-detect with \`process.env.GITHUB_STEP_SUMMARY\`.

2. \`write()\` defaults to APPEND. If you call it inside a loop you'll get duplicate content; pass \`{ overwrite: true }\` to reset, or call \`emptyBuffer()\` between sections.

3. The summary file has a 1 MB cap per step. For a test run with hundreds of failures, write a paginated summary or attach an artifact and link it.

4. The buffer is per-Summary-instance and the module exports a SINGLETON. If two npm packages both \`import { summary } from '@actions/core'\` and both append, they share state — order of writes is the order of imports, which is non-deterministic in practice.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'core', 'summary', 'job-summary', 'html'],
    repository: actionsToolkit,
    filePath: 'packages/core/src/summary.ts',
    url: `${baseUrl}/packages/core/src/summary.ts`,
  },
  {
    title: 'OidcClient.getIDToken — federated identity for keyless cloud auth',
    body: `\`core.getIDToken(audience?)\` returns a short-lived JWT signed by the GitHub OIDC provider. Cloud providers (AWS via \`AssumeRoleWithWebIdentity\`, GCP via Workload Identity Federation, Azure via federated credentials) verify that JWT and hand back temporary credentials — no long-lived secret in your repo.

\`\`\`ts
export class OidcClient {
  static async getIDToken(audience?: string): Promise<string> {
    let id_token_url: string = OidcClient.getIDTokenUrl()
    if (audience) {
      const encodedAudience = encodeURIComponent(audience)
      id_token_url = \`\${id_token_url}&audience=\${encodedAudience}\`
    }
    debug(\`ID token url is \${id_token_url}\`)
    const id_token = await OidcClient.getCall(id_token_url)
    setSecret(id_token)
    return id_token
  }
}
\`\`\`

The runner exposes the token URL and a request token via \`ACTIONS_ID_TOKEN_REQUEST_URL\` and \`ACTIONS_ID_TOKEN_REQUEST_TOKEN\` — both injected only when the workflow declares \`permissions: { id-token: write }\` at the workflow or job level. Without that permission the env vars are absent and \`getRequestToken\` throws.

The HTTP call goes through \`@actions/http-client\` with retries enabled (\`maxRetry = 10\`) and a Bearer auth handler. On success the JWT is run through \`setSecret\` so even debug logs don't leak it.

WHY this is a big deal: before OIDC, the standard pattern was to put an AWS access key into a repo secret and use \`aws-actions/configure-aws-credentials@v1\` with that secret. Compromise the workflow, exfiltrate the secret, you owned the AWS account forever. With OIDC the workflow only ever holds a 5-minute JWT for one specific audience, and the cloud trust policy can constrain which repos and refs may assume which roles.

Non-obvious gotchas:

1. The \`audience\` parameter is the OAuth audience claim — most cloud providers want their own domain (\`sts.amazonaws.com\`, \`api.adservice.google.com\`). If you don't set it, the default audience is \`https://github.com/<owner>\` which most providers reject.

2. The token's claims include \`repository\`, \`ref\`, \`environment\`, \`workflow_ref\`, \`job_workflow_ref\`. Bind the trust policy to the most specific subset you can — \`ref:refs/heads/main\` only, not \`*\`, otherwise a fork PR could request the role.

3. The token expires in 5 minutes from issuance. If your action does long-running work and needs to refresh, call \`getIDToken\` again — it always asks for a fresh token, never caches.

4. The thrown error wraps the original via \`new Error(\\\`Error message: \${error.message}\\\`)\` — a common log-noise complaint, no stack trace from the cause.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'oidc', 'authentication', 'security', 'core'],
    repository: actionsToolkit,
    filePath: 'packages/core/src/oidc-utils.ts',
    url: `${baseUrl}/packages/core/src/oidc-utils.ts`,
  },
  {
    title: 'Workflow command syntax (::name key=value::message) and why ::set-env:: was deprecated',
    body: `The \`Command\` class in @actions/core renders workflow commands to stdout in the format \`::name key=value,key=value::message\`. The runner watches stdout for lines matching this shape and routes them to internal handlers (annotations, env exports, output writes, masks).

\`\`\`ts
toString(): string {
  let cmdStr = CMD_STRING + this.command   // CMD_STRING === '::'
  if (this.properties && Object.keys(this.properties).length > 0) {
    cmdStr += ' '
    let first = true
    for (const key in this.properties) {
      if (this.properties.hasOwnProperty(key)) {
        const val = this.properties[key]
        if (val) {
          if (first) { first = false } else { cmdStr += ',' }
          cmdStr += \`\${key}=\${escapeProperty(val)}\`
        }
      }
    }
  }
  cmdStr += \`\${CMD_STRING}\${escapeData(this.message)}\`
  return cmdStr
}
\`\`\`

\`escapeData\` percent-encodes \`%\`, \`\\r\`, \`\\n\` so messages can be single-line; \`escapeProperty\` adds \`:\` and \`,\` to that set so they don't break the comma-separated key=value parser.

WHY some commands were deprecated (\`::set-env::\`, \`::set-output::\`, \`::save-state::\`, \`::add-path::\`): they were the vector for CVE-2020-15228. Any action that logged untrusted input verbatim — say, a curl response body, or a build error containing user-supplied text — could let the attacker inject \`::set-env name=NODE_OPTIONS::--require=/tmp/payload.js\` into stdout. The next step would inherit the malicious env var and execute the attacker's code with the workflow's permissions.

The fix was to move state-mutating commands off stdout entirely and onto append-only files (\`GITHUB_ENV\`, \`GITHUB_OUTPUT\`, \`GITHUB_PATH\`, \`GITHUB_STATE\`) with random per-write delimiters that an attacker can't predict. Pure logging commands (\`::error::\`, \`::warning::\`, \`::notice::\`, \`::debug::\`, \`::group::\`, \`::add-mask::\`) stayed on stdout because they can't pivot to code execution.

Gotchas:

1. If your action's stdout contains a line that LOOKS like a workflow command but isn't intended as one, the runner will try to parse it. Use \`core.startGroup\` / \`core.endGroup\` and avoid printing raw third-party output that might contain \`::\` sequences without first escaping.

2. \`stopCommands\` / \`echo on/off\` (\`::stop-commands::\` and \`::resume-commands::\`) let you temporarily disable command parsing — used when streaming user-controlled content. The runner now requires the stop token to be a strong opaque value to prevent attacker forging.

3. Empty values in the properties object are SKIPPED (\`if (val) { ... }\`) — \`{ name: '', file: 'x.ts' }\` produces \`file=x.ts\` not \`name=,file=x.ts\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'core', 'workflow-commands', 'security', 'cve'],
    repository: actionsToolkit,
    filePath: 'packages/core/src/command.ts',
    url: `${baseUrl}/packages/core/src/command.ts`,
  },
  {
    title: 'core.saveState + getState: passing data from main step to action.yml post lifecycle',
    body: `An action.yml can declare a \`post:\` step that runs at the END of the job, after every other step (including failures). The state written via \`core.saveState(name, value)\` in the main step is the ONLY way to pass data to that post step — env vars don't survive the gap, outputs don't either.

\`\`\`ts
export function saveState(name: string, value: any): void {
  const filePath = process.env['GITHUB_STATE'] || ''
  if (filePath) {
    return issueFileCommand('STATE', prepareKeyValueMessage(name, value))
  }
  issueCommand('save-state', {name}, toCommandValue(value))
}

export function getState(name: string): string {
  return process.env[\`STATE_\${name}\`] || ''
}
\`\`\`

The mechanism: \`saveState\` appends a heredoc-delimited key/value to the file at \`$GITHUB_STATE\`. When the runner schedules the post step, it reads that file and injects each entry as \`STATE_<NAME>\` into the post step's env. \`getState\` is just a thin wrapper around \`process.env.STATE_<NAME>\`.

Typical post-step pattern (from action.yml):

\`\`\`yaml
runs:
  using: 'node20'
  main: 'dist/main.js'
  post: 'dist/post.js'
  post-if: 'always()'   # run cleanup even if main failed
\`\`\`

And in code:

\`\`\`ts
// main.ts
const containerId = await startContainer();
core.saveState('containerId', containerId);
// ... do work ...

// post.ts (runs at job end)
const containerId = core.getState('containerId');
if (containerId) await stopContainer(containerId);
\`\`\`

WHY \`post-if: always()\`? Without it the post step is skipped when the main step fails — which defeats the whole point of cleanup. The default is \`success()\` (run only if main succeeded), which is rarely what you want.

The same heredoc-with-random-UUID protocol from setOutput/exportVariable is used (issueFileCommand → prepareKeyValueMessage), so multi-line state values and even arbitrary JSON survive intact across the main→post boundary.

Non-obvious gotchas:

1. State is per-action-instance. If your composite uses two copies of the same action with different IDs, each has its own STATE namespace — you can't read state set by another step.

2. \`getState\` returns the empty string for missing keys, NOT \`undefined\`. Defensive code that does \`if (state)\` works; \`if (state === undefined)\` does not.

3. The state file (\`$GITHUB_STATE\`) is per-step-and-action and is reset between actions. State from your action's main is NOT visible to other actions' post steps — privacy boundary.

4. The post step runs in a fresh Node process. Anything you stashed in module-level variables in main is gone. Always use saveState for data the post needs.

5. There is no \`pre:\` lifecycle hook for JS actions (only \`pre:\` for composite actions in newer schema). Use \`main:\` for setup that all later steps depend on.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'core', 'post-step', 'lifecycle', 'state'],
    repository: actionsToolkit,
    filePath: 'packages/core/src/core.ts',
    url: `${baseUrl}/packages/core/src/core.ts`,
  },
  {
    title: 'github.context — workflow metadata reconstructed from GITHUB_* env vars',
    body: `\`@actions/github\` exposes a \`context\` singleton populated from the \`GITHUB_*\` environment variables and from the JSON file at \`GITHUB_EVENT_PATH\` (which contains the raw webhook payload that triggered the workflow).

\`\`\`ts
constructor() {
  this.payload = {}
  if (process.env.GITHUB_EVENT_PATH) {
    if (existsSync(process.env.GITHUB_EVENT_PATH)) {
      this.payload = JSON.parse(
        readFileSync(process.env.GITHUB_EVENT_PATH, {encoding: 'utf8'})
      )
    }
  }
  this.eventName = process.env.GITHUB_EVENT_NAME as string
  this.sha = process.env.GITHUB_SHA as string
  this.ref = process.env.GITHUB_REF as string
  this.workflow = process.env.GITHUB_WORKFLOW as string
  this.runId = parseInt(process.env.GITHUB_RUN_ID as string, 10)
  // ...
}

get repo(): {owner: string; repo: string} {
  if (process.env.GITHUB_REPOSITORY) {
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/')
    return {owner, repo}
  }
  // ...
}
\`\`\`

This means \`context.payload\` is the FULL webhook event — for a \`pull_request\` trigger it contains the entire PR object including base/head SHAs, labels, requested reviewers, body markdown, etc. For \`push\` you get \`commits[]\`, \`before\`, \`after\`. The schema for each event is documented at docs.github.com/en/webhooks.

The convenience getters \`context.repo\` and \`context.issue\` are sugar for the common \`{ owner, repo }\` and \`{ owner, repo, number }\` Octokit input shapes:

\`\`\`ts
const octokit = github.getOctokit(token);
await octokit.rest.issues.createComment({
  ...github.context.repo,
  issue_number: github.context.issue.number,
  body: 'Hi from CI',
});
\`\`\`

Non-obvious gotchas:

1. The constructor runs at MODULE LOAD time. If you set \`GITHUB_*\` env vars after importing \`@actions/github\` they have no effect. In tests, set the env BEFORE the import or stub \`require.cache\`.

2. \`parseInt(process.env.GITHUB_RUN_ID, 10)\` — when \`GITHUB_RUN_ID\` is undefined this yields \`NaN\`, not an error. Defensive code that does \`if (context.runId)\` will treat NaN as falsy and behave like missing — which is usually right but weird to debug.

3. \`context.repo\` THROWS if neither \`GITHUB_REPOSITORY\` nor \`payload.repository\` is set — running outside a runner needs both stubbed.

4. \`context.issue.number\` reads from \`payload.issue || payload.pull_request || payload\` in that order, so it works for issue, PR, AND issue_comment events. For \`workflow_dispatch\` triggers it returns \`undefined\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'github-package', 'context', 'octokit'],
    repository: actionsToolkit,
    filePath: 'packages/github/src/context.ts',
    url: `${baseUrl}/packages/github/src/context.ts`,
  },
  {
    title: 'github.getOctokit — Octokit pre-loaded with REST + paginate plugins and proxy support',
    body: `\`getOctokit(token)\` returns an Octokit instance pre-configured with the two plugins almost every action needs (\`@octokit/plugin-rest-endpoint-methods\` for typed REST calls, \`@octokit/plugin-paginate-rest\` for cursor pagination) plus proxy-aware HTTP defaults.

\`\`\`ts
export function getOctokit(
  token: string,
  options?: OctokitOptions,
  ...additionalPlugins: OctokitPlugin[]
): InstanceType<typeof GitHub> {
  const GitHubWithPlugins = GitHub.plugin(...additionalPlugins)
  return new GitHubWithPlugins(getOctokitOptions(token, options))
}
\`\`\`

The base \`GitHub\` class is built once at module load:

\`\`\`ts
const baseUrl = Utils.getApiBaseUrl()
export const defaults: OctokitOptions = {
  baseUrl,
  request: {
    agent: Utils.getProxyAgent(baseUrl),
    fetch: Utils.getProxyFetch(baseUrl)
  }
}
export const GitHub = Octokit.plugin(
  restEndpointMethods,
  paginateRest
).defaults(defaults)
\`\`\`

The proxy detection reads \`HTTPS_PROXY\` / \`HTTP_PROXY\` / \`NO_PROXY\` and constructs an HTTP agent that routes through your enterprise proxy — important for self-hosted runners behind firewalls.

\`getOctokitOptions\` calls \`getAuthString(token, opts)\` which prepends \`token \` if you pass a bare PAT, or accepts a pre-formatted \`Bearer ...\` string. It also injects an Orchestration ID into the user agent for trace correlation in GHES debugging.

Typical usage:

\`\`\`ts
const octokit = github.getOctokit(core.getInput('token'));
const { data: prs } = await octokit.rest.pulls.list({
  ...github.context.repo,
  state: 'open',
});
// Auto-paginate every page:
const allIssues = await octokit.paginate(octokit.rest.issues.listForRepo, {
  ...github.context.repo, per_page: 100,
});
\`\`\`

Non-obvious gotchas:

1. The \`GITHUB_TOKEN\` provided to your action expires when the workflow run completes. If your action triggers an async operation that calls back later (e.g., dispatches a webhook to an external service that re-hits the GitHub API), the token will be invalid by then. Use a short-lived OIDC-derived app token instead.

2. \`GITHUB_TOKEN\` permissions are SCOPED by the workflow's \`permissions:\` block. By default many orgs ship with read-only contents. If \`octokit.rest.issues.createComment\` returns 403, check \`permissions: { issues: write }\`.

3. \`octokit.paginate\` loads ALL pages into memory. For an issues listing on a 50k-issue repo this is a 500 MB array — paginate manually with \`for await (const page of octokit.paginate.iterator(...))\` instead.

4. The Octokit instance is unique per call — there is no shared singleton. Two \`getOctokit\` calls construct two separate clients with separate connection pools.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'github-package', 'octokit', 'http'],
    repository: actionsToolkit,
    filePath: 'packages/github/src/github.ts',
    url: `${baseUrl}/packages/github/src/github.ts`,
  },
  {
    title: 'exec.exec spawns a child process and streams output to the console',
    body: `\`exec(commandLine, args?, options?)\` is the recommended way to run external programs from a JS action. It splits the command line, instantiates a \`ToolRunner\`, and returns the exit code as a promise.

\`\`\`ts
export async function exec(
  commandLine: string,
  args?: string[],
  options?: ExecOptions
): Promise<number> {
  const commandArgs = tr.argStringToArray(commandLine)
  if (commandArgs.length === 0) {
    throw new Error(\`Parameter 'commandLine' cannot be null or empty.\`)
  }
  const toolPath = commandArgs[0]
  args = commandArgs.slice(1).concat(args || [])
  const runner: tr.ToolRunner = new tr.ToolRunner(toolPath, args, options)
  return runner.exec()
}
\`\`\`

\`getExecOutput\` is the variant that ALSO captures stdout/stderr into strings using a \`StringDecoder\` (which correctly handles multi-byte UTF-8 sequences split across buffer boundaries):

\`\`\`ts
const stdoutDecoder = new StringDecoder('utf8')
const stdOutListener = (data: Buffer): void => {
  stdout += stdoutDecoder.write(data)
  if (originalStdoutListener) originalStdoutListener(data)
}
// ...
return { exitCode, stdout, stderr }
\`\`\`

Common usage:

\`\`\`ts
await exec.exec('git', ['fetch', '--depth=1', 'origin', sha]);
const { stdout } = await exec.getExecOutput('git', ['rev-parse', 'HEAD']);
const headSha = stdout.trim();
\`\`\`

WHY this exists when Node has \`child_process.spawn\`: the toolkit version (a) integrates with workflow command escaping so action stdout shows up properly in run logs, (b) handles Windows .cmd quoting via the \`_isCmdFile\` check (Windows applies different quoting rules to .cmd/.bat than .exe), (c) supports the \`ignoreReturnCode\` option to swallow non-zero exits without throwing, and (d) plugs into \`@actions/io.which\` for cross-platform tool resolution.

Non-obvious gotchas:

1. \`commandLine\` is split via \`argStringToArray\` which honors quoting but not full shell parsing — backticks, \`$VAR\` expansion, redirects (\`>\`, \`|\`), and \`&&\` chaining DO NOT work. To use those, run \`bash -c 'cmd1 | cmd2'\` explicitly.

2. By default a non-zero exit code throws. Pass \`{ ignoreReturnCode: true }\` and check the returned int yourself when calling tools that signal "no match" with a non-zero exit (grep, diff).

3. \`failOnStdErr: true\` makes ANY stderr write fail the call — too aggressive for most tools (git logs progress to stderr). Useful for strict linters.

4. The default \`delay: 10000\` is ms-to-wait for stdio streams to close after the child's exit event. Tools that spawn detached subprocesses (background daemons) hold stdio open and will hit this timeout.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'exec', 'subprocess', 'child-process'],
    repository: actionsToolkit,
    filePath: 'packages/exec/src/exec.ts',
    url: `${baseUrl}/packages/exec/src/exec.ts`,
  },
  {
    title: 'io.rmRF — recursive force-delete with retry, plus Windows path validation',
    body: `\`io.rmRF\` is the cross-platform \`rm -rf\` for actions. It uses Node's \`fs.rm\` with \`force\`, \`recursive\`, and built-in retry, and on Windows pre-validates the path for invalid characters that would silently cause partial deletes.

\`\`\`ts
export async function rmRF(inputPath: string): Promise<void> {
  if (ioUtil.IS_WINDOWS) {
    // Check for invalid characters
    if (/[*"<>|]/.test(inputPath)) {
      throw new Error(
        'File path must not contain \`*\`, \`"\`, \`<\`, \`>\` or \`|\` on Windows'
      )
    }
  }
  try {
    await ioUtil.rm(inputPath, {
      force: true,
      maxRetries: 3,
      recursive: true,
      retryDelay: 300
    })
  } catch (err) {
    throw new Error(\`File was unable to be removed \${err}\`)
  }
}
\`\`\`

WHY the Windows char check? On Windows, those characters are reserved for shell globbing or are illegal in NTFS filenames. \`fs.rm\` will not match them as wildcards (it's a direct rm, not a shell expansion), so a path like \`build/*.tmp\` would silently no-op instead of doing what the developer expected. The throw is loud-fail rather than silent-noop.

WHY retry with \`maxRetries: 3, retryDelay: 300\`? On Windows, antivirus software (Defender, CrowdStrike) commonly holds open handles on freshly-created files for a few hundred ms after they're written. A naive \`rm -rf\` on a directory containing such files races the AV scanner and fails with EBUSY/EPERM. Three retries at 300 ms back-off catches the typical AV window without making CI feel sluggish.

Companion \`io.cp\` and \`io.mv\` follow shelljs semantics — \`cp\` requires \`{ recursive: true }\` for directories or it throws, \`mv\` deletes the destination first via \`rmRF\` if \`force: true\` (the default).

Non-obvious gotchas:

1. \`rmRF\` swallows ENOENT silently — "if the path does not exist, error is silent" per the source comment. So you can safely call it on a maybe-existing path without an extra \`exists\` check.

2. The retry only applies to the \`fs.rm\` call as a whole. If the first deletion partially succeeds (some files removed, some held by AV), the retry restarts from scratch — usually fine since the partially-deleted directory is in a state that re-running on can complete.

3. There is no symlink-following control — \`fs.rm\` follows the symlink target by default. To delete the link itself but not the target, use \`fs.unlink\` directly.

4. On Linux, this is just \`rm -rf\` semantically — no special behavior.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'io', 'filesystem', 'cross-platform'],
    repository: actionsToolkit,
    filePath: 'packages/io/src/io.ts',
    url: `${baseUrl}/packages/io/src/io.ts`,
  },
  {
    title: 'tool-cache.downloadTool — retried HTTP download with smart status-code policy',
    body: `\`downloadTool(url, dest?, auth?, headers?)\` streams a URL to disk with up to 3 retry attempts. The retry policy is encoded as an \`isRetryable\` callback that DECIDES based on the HTTP status code, not just the error class.

\`\`\`ts
const retryHelper = new RetryHelper(maxAttempts, minSeconds, maxSeconds)
return await retryHelper.execute(
  async () => {
    return await downloadToolAttempt(url, dest || '', auth, headers)
  },
  (err: Error) => {
    if (err instanceof HTTPError && err.httpStatusCode) {
      // Don't retry anything less than 500, except 408 Request Timeout and 429 Too Many Requests
      if (
        err.httpStatusCode < 500 &&
        err.httpStatusCode !== 408 &&
        err.httpStatusCode !== 429
      ) {
        return false
      }
    }
    return true
  }
)
\`\`\`

The decision tree: 5xx → retry (server flaked, try again). 408 / 429 → retry (timeout or rate-limit, back off and try again). Other 4xx → fail immediately (404, 401, 403 won't fix themselves on retry, retrying just wastes time and triggers more rate-limit). Network errors (no response) → retry.

WHY 3 attempts? In practice, transient flakes are usually one-off — retrying twice catches almost everything. More attempts mostly buy you long delays before failing, which makes failed CI runs frustrating.

The download itself uses Node streams via \`util.promisify(stream.pipeline)\`, writing directly to disk so a multi-GB tarball doesn't blow the heap:

\`\`\`ts
const pipeline = util.promisify(stream.pipeline)
await pipeline(readStream, fs.createWriteStream(dest))
\`\`\`

If pipeline throws midway, the \`finally\` block deletes the partial file via \`io.rmRF\` so the next retry can write fresh.

Non-obvious gotchas:

1. \`dest\` defaults to a UUID-named file in the runner temp dir. If you want a stable filename — say to debug — pass \`dest\` explicitly. But the source explicitly throws if \`dest\` already exists (line: \`Destination file path \${dest} already exists\`), so the caller has to clean up before retrying.

2. The \`auth\` parameter is the FULL Authorization header value — pass \`'token ' + githubToken\` or \`'Bearer ' + jwt\`, not just the token. A common bug is passing the bare token and getting 401s.

3. The retry sleep is \`Math.random() * (max - min) + min\` seconds — randomized to avoid thundering-herd when many runners retry simultaneously. Defaults are 10–20 seconds; override via \`TEST_DOWNLOAD_TOOL_RETRY_*\` env vars in tests.

4. Custom headers override the auto-set \`authorization\` only if you don't ALSO pass \`auth\`. The \`auth\` parameter wins.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'tool-cache', 'download', 'retry', 'http'],
    repository: actionsToolkit,
    filePath: 'packages/tool-cache/src/tool-cache.ts',
    url: `${baseUrl}/packages/tool-cache/src/tool-cache.ts`,
  },
  {
    title: 'tool-cache.cacheDir + find — versioned tool cache layout with .complete sentinel',
    body: `\`cacheDir(sourceDir, tool, version, arch?)\` copies a freshly-built tool into the runner's tool cache at \`<RUNNER_TOOL_CACHE>/<tool>/<version>/<arch>/\`, then writes an empty \`<arch>.complete\` marker file alongside.

\`\`\`ts
export async function cacheDir(
  sourceDir: string, tool: string, version: string, arch?: string
): Promise<string> {
  version = semver.clean(version) || version
  arch = arch || os.arch()
  const destPath: string = await _createToolPath(tool, version, arch)
  // copy each child item. do not move. move can fail on Windows
  // due to anti-virus software having an open handle on a file.
  for (const itemName of fs.readdirSync(sourceDir)) {
    const s = path.join(sourceDir, itemName)
    await io.cp(s, destPath, {recursive: true})
  }
  _completeToolPath(tool, version, arch)
  return destPath
}
\`\`\`

\`find(toolName, versionSpec, arch?)\` is the lookup half — it resolves a semver range to a concrete installed version and returns the path ONLY if the \`.complete\` sentinel exists:

\`\`\`ts
if (fs.existsSync(cachePath) && fs.existsSync(\`\${cachePath}.complete\`)) {
  toolPath = cachePath
}
\`\`\`

WHY the \`.complete\` sentinel? Because cacheDir copies many files and an interrupted copy (runner killed mid-step) leaves a partial install. Without the marker, the next workflow's \`find\` would happily return a half-populated directory and your action would fail in confusing ways. The marker is created LAST, atomically, so its presence proves the copy finished.

WHY copy not move? Source comment: "move can fail on Windows due to anti-virus software having an open handle on a file." Same reason \`io.rmRF\` retries — AV scanning. Copy is slower but reliable.

Typical setup-action pattern:

\`\`\`ts
let toolPath = tc.find('node', '20.x', 'x64');
if (!toolPath) {
  const downloaded = await tc.downloadTool('https://nodejs.org/dist/...');
  const extracted = await tc.extractTar(downloaded);
  toolPath = await tc.cacheDir(extracted, 'node', '20.10.0', 'x64');
}
core.addPath(path.join(toolPath, 'bin'));
\`\`\`

Non-obvious gotchas:

1. The cache lives on the RUNNER, not in the GitHub Actions cache service. On hosted runners it survives only for the duration of the runner VM (one job). Self-hosted runners persist between jobs and the cache helps a lot. To persist across hosted-runner jobs, also save the toolPath via \`@actions/cache\`.

2. \`evaluateVersions\` uses semver range matching — \`find('node', '20')\` matches any 20.x.x. To pin exactly, pass the full version.

3. \`arch\` defaults to \`os.arch()\` on the running machine. To cache cross-arch tools (rare), pass \`arch\` explicitly — e.g., for a release pipeline that builds for both x64 and arm64.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'tool-cache', 'caching', 'setup-action'],
    repository: actionsToolkit,
    filePath: 'packages/tool-cache/src/tool-cache.ts',
    url: `${baseUrl}/packages/tool-cache/src/tool-cache.ts`,
  },
  {
    title: 'cache.saveCache + restoreCache — cache scope, key validation, 10 GB limit',
    body: `The high-level \`saveCache\` and \`restoreCache\` functions in @actions/cache wrap a Twirp/REST upload to the runner-side cache service. The first thing both do is validate inputs:

\`\`\`ts
function checkKey(key: string): void {
  if (key.length > 512) {
    throw new ValidationError(
      \`Key Validation Error: \${key} cannot be larger than 512 characters.\`
    )
  }
  const regex = /^[^,]*$/
  if (!regex.test(key)) {
    throw new ValidationError(
      \`Key Validation Error: \${key} cannot contain commas.\`
    )
  }
}
\`\`\`

Then \`saveCache\` builds a tar of the requested paths, reserves an entry, and uploads:

\`\`\`ts
const fileSizeLimit = 10 * 1024 * 1024 * 1024 // 10GB per repo limit
if (archiveFileSize > fileSizeLimit && !isGhes()) {
  throw new Error(
    \`Cache size of ~\${Math.round(archiveFileSize / (1024 * 1024))} MB
     (\${archiveFileSize} B) is over the 10GB limit, not saving cache.\`
  )
}
\`\`\`

\`restoreCache(paths, primaryKey, restoreKeys?)\` first asks for an exact match on \`primaryKey\`; if no hit, it walks \`restoreKeys\` doing PREFIX matching (so \`restoreKeys: ['npm-deps-']\` matches \`npm-deps-abc123\`). The returned key tells you which fallback hit so you can decide whether to re-save under the primary key.

Cache SCOPE rules (not in this file but enforced server-side): a cache is keyed by (repo, ref, key). A cache saved on \`refs/heads/main\` is visible to all branches. A cache saved on a feature branch is visible only to that branch and PRs merging INTO that branch. PRs from forks cannot read or write the parent repo's cache — security boundary.

Non-obvious gotchas:

1. The 10 GB limit is per REPO total, not per cache entry. Approaching the cap, the oldest entries are evicted. Caches not accessed for 7 days are auto-evicted regardless of cap.

2. \`saveCache\` does not throw on most failures — it logs a warning and returns \`-1\`. The "another job is creating this cache" race (HTTP 409 from \`reserveCache\`) is the most common silent failure; instrument it explicitly if you depend on the cache being present.

3. The key MUST NOT contain commas (the regex enforces this) because the runner uses comma to split restoreKeys lists. Spaces and slashes are fine.

4. \`enableCrossOsArchive: true\` lets you save a cache on one OS (say, Linux) and restore on another (Windows). The default is false because tar permissions/symlinks don't always round-trip safely.

5. The v2 service path forces Azure Blob SDK (\`useAzureSdk: true\`) which gives chunked parallel downloads — much faster for >100 MB caches than the v1 single-stream path.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'cache', 'storage', 'scopes'],
    repository: actionsToolkit,
    filePath: 'packages/cache/src/cache.ts',
    url: `${baseUrl}/packages/cache/src/cache.ts`,
  },
  {
    title: 'glob.create — newline-separated patterns with hidden-file and symlink controls',
    body: `\`@actions/glob.create(patterns, options?)\` returns a Globber that lazily walks the filesystem and yields matching paths. Patterns are NEWLINE separated (not space, not array) — multiple patterns in one call let you union or negate.

\`\`\`ts
export async function create(
  patterns: string,
  options?: GlobOptions
): Promise<Globber> {
  return await DefaultGlobber.create(patterns, options)
}
\`\`\`

The default \`GlobOptions\` are aggressive:

\`\`\`ts
export interface GlobOptions {
  followSymbolicLinks?: boolean       // default: true
  implicitDescendants?: boolean        // default: true (my-dir means my-dir/**)
  matchDirectories?: boolean           // default: true
  omitBrokenSymbolicLinks?: boolean    // default: true
  excludeHiddenFiles?: boolean         // default: false (dotfiles INCLUDED)
}
\`\`\`

Typical usage:

\`\`\`ts
const globber = await glob.create([
  '**/*.ts',
  '!**/*.d.ts',
  '!node_modules/**',
].join('\\n'));
const files = await globber.glob();
\`\`\`

Negation patterns (\`!\`) are processed in order, so put includes first then excludes. \`**\` matches across directory boundaries; \`*\` does not match \`/\`.

\`hashFiles\` (companion function) takes the same patterns and returns a deterministic SHA-256 hash of the matched files' contents — used in cache keys so the cache busts when any input file changes:

\`\`\`yaml
key: deps-\${{ runner.os }}-\${{ hashFiles('**/package-lock.json', '**/yarn.lock') }}
\`\`\`

WHY \`implicitDescendants: true\`? So that \`my-dir\` and \`my-dir/\` and \`my-dir/**\` all match the same set — convenient for "I want the directory and everything under it." Set false if you want strict glob semantics.

Non-obvious gotchas:

1. \`followSymbolicLinks: true\` is the default — but symlink loops will recurse infinitely. Set false when crawling untrusted directories or anywhere a symlink loop is possible (e.g., crawling Docker image extracted layers).

2. \`excludeHiddenFiles: false\` is the default. \`**/*\` includes \`.git/**\` which on a typical repo is thousands of objects — slow, and probably not what you want for "all source files." Set true or add \`!.git/**\`.

3. Patterns are matched with a custom internal globber, NOT minimatch, picomatch, or glob. Subtle differences exist around brace expansion (\`{a,b}\` is supported) and extglob (\`@(a|b)\` is NOT). Test edge cases on the actual runner.

4. \`hashFiles\` returns the empty string if no files match — a cache key built from an empty hash will collide across all "no-match" runs. Always have at least one file you know exists.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'glob', 'pattern-matching', 'hash'],
    repository: actionsToolkit,
    filePath: 'packages/glob/src/glob.ts',
    url: `${baseUrl}/packages/glob/src/glob.ts`,
  },
  {
    title: 'artifact.uploadArtifact — zips files, validates name, single-file skipArchive option',
    body: `\`@actions/artifact\`'s \`DefaultArtifactClient.uploadArtifact\` zips the given files in-process and streams the zip to the artifacts blob storage assigned by the Twirp \`CreateArtifact\` call.

\`\`\`ts
export async function uploadArtifact(
  name: string, files: string[], rootDirectory: string,
  options?: UploadArtifactOptions
): Promise<UploadArtifactResponse> {
  let artifactFileName = \`\${name}.zip\`
  if (options?.skipArchive) {
    if (files.length > 1) {
      throw new Error(
        'skipArchive option is only supported when uploading a single file'
      )
    }
    artifactFileName = path.basename(files[0])
    name = artifactFileName
  }

  validateArtifactName(name)
  validateRootDirectory(rootDirectory)
  // ... build zip spec ...

  const backendIds = getBackendIdsFromToken()
  const artifactClient = internalArtifactTwirpClient()
  const createArtifactResp = await artifactClient.CreateArtifact({...})
  // ... stream zip to signed URL ...
}
\`\`\`

\`rootDirectory\` controls how the file tree is laid out INSIDE the zip. If you pass \`files: ['/work/src/main.ts']\` and \`rootDirectory: '/work'\`, the zip contains \`src/main.ts\`. Pass \`rootDirectory: '/work/src'\` and the zip contains \`main.ts\` at top level. Get this wrong and the downloaded artifact has surprising paths.

\`skipArchive: true\` uploads ONE file as-is without zipping — useful for test result XML files that downstream tooling expects with their original name. The function throws if you try this with multiple files.

The \`backendIds\` come from decoding the runtime JWT in \`ACTIONS_RESULTS_URL\` — the artifact service authenticates by workflow run ID embedded in the runner token.

Non-obvious gotchas:

1. Artifact NAMES are validated against a list of forbidden chars (\`/ \\\\ : * ? " < > |\` and reserved Windows names). Renaming on download is supported but ugly — pick a clean name up-front.

2. \`v2+\` of the artifact API does NOT allow two artifacts with the same name in the same workflow run — second \`uploadArtifact\` with the same name throws. Old v1/v2/v3 actions allowed it; if you migrated and your name is conflicting with a prior step, rename.

3. \`compressionLevel\` (0–9) defaults to 6. Setting \`0\` uploads uncompressed (faster on slow CPU + fast network); \`9\` is slow but tighter. For pre-compressed payloads (zip-of-zips, .tar.gz), set 0 — re-compressing is pure overhead.

4. \`retentionDays\` is bounded by the repo's max retention setting; passing a higher value is silently capped. Default is 90 days.

5. The function does NOT delete the source files — clean up your \`rootDirectory\` afterwards if it's in a job-shared cache path.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'artifact', 'upload', 'zip'],
    repository: actionsToolkit,
    filePath: 'packages/artifact/src/internal/upload/upload-artifact.ts',
    url: `${baseUrl}/packages/artifact/src/internal/upload/upload-artifact.ts`,
  },
  {
    title: 'http-client retry policy: only idempotent verbs, only 502/503/504, exponential backoff',
    body: `\`@actions/http-client\` is a small Node http(s) wrapper used by every other toolkit package that talks to a service (cache, tool-cache, artifact, OIDC). Its retry behavior is constrained on purpose so it never duplicates a non-idempotent write.

\`\`\`ts
const HttpResponseRetryCodes: number[] = [
  HttpCodes.BadGateway,        // 502
  HttpCodes.ServiceUnavailable, // 503
  HttpCodes.GatewayTimeout      // 504
]
const RetryableHttpVerbs: string[] = ['OPTIONS', 'GET', 'DELETE', 'HEAD']
const ExponentialBackoffCeiling = 10
const ExponentialBackoffTimeSlice = 5

private async _performExponentialBackoff(retryNumber: number): Promise<void> {
  retryNumber = Math.min(ExponentialBackoffCeiling, retryNumber)
  const ms: number = ExponentialBackoffTimeSlice * Math.pow(2, retryNumber)
  return new Promise(resolve => setTimeout(() => resolve(), ms))
}
\`\`\`

The retry decision in \`request\`:

\`\`\`ts
const maxTries: number =
  this._allowRetries && RetryableHttpVerbs.includes(verb)
    ? this._maxRetries + 1
    : 1
// ...
if (
  !response.message.statusCode ||
  !HttpResponseRetryCodes.includes(response.message.statusCode)
) {
  return response  // not a retry status, return immediately
}
\`\`\`

WHY only OPTIONS/GET/DELETE/HEAD? Because POST/PUT/PATCH may have side effects on the server. Retrying a POST can create duplicate resources (a duplicate cache entry, two artifact uploads, two webhook deliveries). DELETE is included because it's idempotent in REST design (deleting an already-deleted resource is a no-op).

WHY only 502/503/504? Those three explicitly mean "transient infrastructure problem, the request never reached the application." 500 is excluded because it could mean "your request reached the app and the app threw an exception" — retrying might send the same bad request again or partially succeed. 401/403/404 are obvious no-retry. 408 is interesting — the http-client doesn't retry it, but \`tool-cache.downloadTool\` adds a custom retry policy that DOES retry 408 and 429.

The backoff is \`5 * 2^n\` ms — so 10ms, 20ms, 40ms, 80ms, ..., capped at \`5 * 2^10\` = 5.12 seconds. Aggressive at first to recover quickly, longer waits for persistent issues.

Non-obvious gotchas:

1. \`maxRetries\` defaults to 1 and \`allowRetries\` defaults to false — meaning by DEFAULT the client doesn't retry at all. Callers (cache, oidc) opt in via \`{ allowRetries: true, maxRetries: 10 }\`.

2. The Authorization header is STRIPPED on cross-host redirects to prevent token leakage to a third party — see lines 421-428.

3. There's no jitter — pure binary exponential backoff. If 100 runners hit a 503 simultaneously they all retry at exactly t+10ms, t+20ms, t+40ms — a thundering herd. For higher-stakes calls, layer a jittered retry on top.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'http-client', 'retry', 'idempotency', 'backoff'],
    repository: actionsToolkit,
    filePath: 'packages/http-client/src/index.ts',
    url: `${baseUrl}/packages/http-client/src/index.ts`,
  },
  {
    title: 'attest.attestProvenance — SLSA build provenance via Sigstore + GH attestations API',
    body: `\`@actions/attest\` produces signed provenance attestations for build artifacts. \`attestProvenance\` is the high-level helper that builds a SLSA v1.0 predicate from the OIDC token's claims, then hands it to \`attest\` for Sigstore signing and storage.

\`\`\`ts
export async function attestProvenance(
  options: AttestProvenanceOptions
): Promise<Attestation> {
  const predicate = await buildSLSAProvenancePredicate(options.issuer)
  return attest({
    ...options,
    predicateType: predicate.type,
    predicate: predicate.params
  })
}
\`\`\`

The predicate captures who built what and where, drawing from the OIDC JWT:

\`\`\`ts
externalParameters: {
  workflow: {
    ref: claims.ref,
    repository: \`\${serverURL}/\${claims.repository}\`,
    path: workflowPath
  }
},
internalParameters: {
  github: {
    event_name: claims.event_name,
    repository_id: claims.repository_id,
    runner_environment: claims.runner_environment
  }
},
resolvedDependencies: [{
  uri: \`git+\${serverURL}/\${claims.repository}@\${claims.ref}\`,
  digest: { gitCommit: claims.sha }
}]
\`\`\`

\`attest\` builds an in-toto Statement, signs it with Sigstore (either public-good Rekor or GitHub's private Sigstore-as-a-service), and POSTs the signed bundle to GitHub's attestations API:

\`\`\`ts
const statement = buildIntotoStatement(subjects, predicate)
const payload: Payload = {
  body: Buffer.from(JSON.stringify(statement)),
  type: INTOTO_PAYLOAD_TYPE  // 'application/vnd.in-toto+json'
}
const endpoints = signingEndpoints(options.sigstore)
const bundle = await signPayload(payload, endpoints)
attestationID = await writeAttestation(bundleToJSON(bundle), options.token, ...)
\`\`\`

Typical usage:

\`\`\`ts
import { attestProvenance } from '@actions/attest';
const att = await attestProvenance({
  subjects: [{ name: 'myapp:v1.2.3', digest: { sha256: dockerImageDigest } }],
  token: process.env.GITHUB_TOKEN,
});
\`\`\`

The verifier (\`gh attestation verify\`) checks the signing certificate's identity matches the expected workflow + repo, providing tamper-evident proof of origin.

Non-obvious gotchas:

1. Requires \`permissions: { id-token: write, attestations: write, contents: read }\` — without those, the OIDC fetch or the API write fails.

2. The signing certificate's identity is bound to the WORKFLOW REF that called \`attestProvenance\` — not the artifact itself. Anyone who controls that workflow file (PR with workflow change merged to default branch) controls who can mint provenance for that repo.

3. \`subjects\` must include a \`digest\` matching the EXACT artifact bytes. Re-zipping or re-tarring an artifact between attest and publish breaks verification — attest the FINAL bytes you publish.

4. \`skipWrite: true\` returns the bundle without storing — useful for testing, but the attestation is then ephemeral; verifiers won't find it via the public API.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['github-actions', 'cicd', 'attest', 'sigstore', 'slsa', 'supply-chain'],
    repository: actionsToolkit,
    filePath: 'packages/attest/src/provenance.ts',
    url: `${baseUrl}/packages/attest/src/provenance.ts`,
  },
];
