/**
 * Batch github-019-gin-go
 *
 * 20 Gin (Go HTTP framework) patterns drawn from the actual source of
 * gin-gonic/gin. Each entry attributes to a real file in the repo. The
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

const gin = { owner: 'gin-gonic', name: 'gin' };
const baseUrl = 'https://github.com/gin-gonic/gin/blob/master';

export const BATCH: SeedItem[] = [
  {
    title: 'gin.New() vs gin.Default() — what middleware you actually get',
    body: `\`gin.New()\` returns a bare Engine with zero middleware. \`gin.Default()\` is exactly \`New()\` plus \`Use(Logger(), Recovery())\`. That is the entire functional difference.

\`\`\`go
func New(opts ...OptionFunc) *Engine {
    debugPrintWARNINGNew()
    engine := &Engine{
        RouterGroup: RouterGroup{Handlers: nil, basePath: "/", root: true},
        RedirectTrailingSlash:  true,
        ForwardedByClientIP:    true,
        RemoteIPHeaders:        []string{"X-Forwarded-For", "X-Real-IP"},
        TrustedPlatform:        defaultPlatform,
        MaxMultipartMemory:     defaultMultipartMemory,
        trees:                  make(methodTrees, 0, 9),
        delims:                 render.Delims{Left: "{{", Right: "}}"},
        secureJSONPrefix:       "while(1);",
        trustedProxies:         []string{"0.0.0.0/0", "::/0"},
        trustedCIDRs:           defaultTrustedCIDRs,
    }
    engine.engine = engine
    engine.pool.New = func() any { return engine.allocateContext(engine.maxParams) }
    return engine.With(opts...)
}

func Default(opts ...OptionFunc) *Engine {
    debugPrintWARNINGDefault()
    engine := New()
    engine.Use(Logger(), Recovery())
    return engine.With(opts...)
}
\`\`\`

The non-obvious gotchas: \`trustedProxies\` defaults to \`["0.0.0.0/0", "::/0"]\` — the entire IPv4 + IPv6 space. Both \`Run()\` and \`RunTLS()\` print a WARNING to stderr if you don't override this, and \`c.ClientIP()\` will trust \`X-Forwarded-For\` from any source until you call \`engine.SetTrustedProxies([]string{"10.0.0.0/8"})\`. In production behind a known proxy, set this explicitly.

\`MaxMultipartMemory\` defaults to 32 MiB — files larger than that are spooled to disk during \`ParseMultipartForm\`. Bump it for high-throughput upload endpoints to keep things in memory; lower it on memory-constrained pods to force spilling.

\`RedirectTrailingSlash: true\` means a request to \`/users\` when only \`/users/\` is registered (or vice versa) returns a 301. This breaks idempotency for POST/PUT/PATCH because browsers downgrade to GET on 301 — set \`RedirectTrailingSlash = false\` if you have non-GET routes that must round-trip preserved.

If you want Recovery without the colored, multi-line Logger output (e.g., behind structured-log middleware), use \`gin.New()\` then \`engine.Use(gin.Recovery())\` and skip Logger entirely. \`Default\` is convenience, not contract.`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'http', 'engine', 'middleware'],
    repository: gin,
    filePath: 'gin.go',
    url: `${baseUrl}/gin.go`,
  },
  {
    title: 'c.Next() vs return: how middleware ordering really works',
    body: `Middleware in Gin is a slice. \`c.Next()\` advances the index and runs every handler after the current one, then control returns to the caller — so anything written *after* \`c.Next()\` runs *after* the downstream handlers (post-processing). Just \`return\` (no Next call) without aborting also runs downstream handlers, because the outer loop in \`engine.handleHTTPRequest\` is what walks the chain when you do not call Next yourself.

\`\`\`go
// context.go
func (c *Context) Next() {
    c.index++
    for c.index < safeInt8(len(c.handlers)) {
        if c.handlers[c.index] != nil {
            c.handlers[c.index](c)
        }
        c.index++
    }
}

func (c *Context) IsAborted() bool {
    return c.index >= abortIndex
}

func (c *Context) Abort() {
    c.index = abortIndex
}
\`\`\`

\`abortIndex\` is \`math.MaxInt8 >> 1\` (= 63). Setting \`c.index\` to that value makes the \`for\` loop in \`Next\` (and the equivalent in the engine's request dispatch) immediately false-positive on the bounds check, so no further handler is called.

The pattern that bites people: a "logging" middleware that calls \`c.Next()\` and then logs status code only works because Next blocks until the chain unwinds. If you forget \`c.Next()\`, your post-handler code runs *before* the route handler, observing the default 200 status — your latency metrics will all be ~0ms and your access log will be useless.

The other gotcha: \`Abort\` does not stop the *current* handler. After \`c.AbortWithStatusJSON(401, ...)\` you still need to \`return\` from the function, otherwise subsequent code in the same middleware (e.g. \`c.Next()\`, additional writes) executes against an aborted context — which often manifests as "headers were already written" debug warnings.

If you call \`c.Next()\` from a non-middleware handler (the terminal route), it is a no-op because there are no further handlers — the index moves past the end and the loop exits.`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'middleware', 'flow-control', 'next'],
    repository: gin,
    filePath: 'context.go',
    url: `${baseUrl}/context.go`,
  },
  {
    title: 'Recovery() — what it actually catches and what it sanitizes',
    body: `\`gin.Recovery()\` installs a deferred \`recover()\` around \`c.Next()\`. It only catches *panics*, not regular errors — your handlers must return errors via \`c.Error(err)\` or render them themselves.

\`\`\`go
// recovery.go
return func(c *Context) {
    defer func() {
        if rec := recover(); rec != nil {
            var isBrokenPipe bool
            err, ok := rec.(error)
            if ok {
                isBrokenPipe = errors.Is(err, syscall.EPIPE) ||
                    errors.Is(err, syscall.ECONNRESET) ||
                    errors.Is(err, http.ErrAbortHandler)
            }
            // ... log with stack trace
            if isBrokenPipe {
                // If the connection is dead, we can't write a status to it.
                c.Error(err)
                c.Abort()
            } else {
                handle(c, rec)
            }
        }
    }()
    c.Next()
}
\`\`\`

The default \`handle\` is \`defaultHandleRecovery\`, which simply calls \`c.AbortWithStatus(http.StatusInternalServerError)\`. Use \`gin.CustomRecovery(func(c *Context, rec any) { ... })\` to render a JSON error body or report to Sentry.

Three non-obvious behaviors:

1. **EPIPE / ECONNRESET / http.ErrAbortHandler are special-cased.** If the panic was caused by writing to a closed connection, Recovery does NOT try to write a 500 (you can't — the socket is dead) and skips even the stack-trace log; only a brief one-liner is logged. This avoids spammy stack dumps when clients drop early.

2. **Authorization headers are scrubbed.** \`secureRequestDump\` walks the dumped request line-by-line and replaces any line starting with \`Authorization:\` with \`Authorization: *\`. Bearer tokens won't leak into your panic logs. Cookies are NOT scrubbed — if you put session tokens in cookies, they will appear in the dump.

3. **It only catches panics in goroutines spawned BY the request handler synchronously.** A panic in a goroutine you fired off with \`go doWork(c.Copy())\` runs in its own stack — Recovery's defer doesn't see it, and the process crashes. Wrap any \`go func()\` in your handlers with their own \`defer recover()\`.

Recovery must be registered before any middleware that might panic; \`gin.Default()\` puts it at index 1 (after Logger), which is the right default — Logger runs the timer first.`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'recovery', 'panic', 'middleware'],
    repository: gin,
    filePath: 'recovery.go',
    url: `${baseUrl}/recovery.go`,
  },
  {
    title: 'Logger middleware: when latency is captured and what skip lists do',
    body: `Gin's Logger captures timing around \`c.Next()\` — start before, end after — so the latency includes every downstream handler and middleware *except* itself. Any middleware registered before Logger contributes to its measurement; any registered after does not.

\`\`\`go
// logger.go — LoggerWithConfig closure
return func(c *Context) {
    start := time.Now()
    path := c.Request.URL.Path
    raw := c.Request.URL.RawQuery

    c.Next()

    if _, ok := skip[path]; ok || (conf.Skip != nil && conf.Skip(c)) {
        return
    }

    param := LogFormatterParams{Request: c.Request, isTerm: isTerm, Keys: c.Keys}
    param.TimeStamp = time.Now()
    param.Latency = param.TimeStamp.Sub(start)
    param.ClientIP = c.ClientIP()
    param.Method = c.Request.Method
    param.StatusCode = c.Writer.Status()
    param.ErrorMessage = c.Errors.ByType(ErrorTypePrivate).String()
    param.BodySize = c.Writer.Size()

    if raw != "" && !conf.SkipQueryString {
        path = path + "?" + raw
    }
    param.Path = path
    fmt.Fprint(out, formatter(param))
}
\`\`\`

The \`SkipPaths\` slice is converted into a map at construction time, so lookups are O(1) per request. Use it to silence \`/healthz\` and \`/metrics\` noise without paying for log formatting on every probe.

\`SkipQueryString\` is the security knob: when API keys or one-time tokens travel in query strings, set it to \`true\` so they don't end up in stdout (and from there into Loki / CloudWatch). The path is still logged, just without the \`?...\` suffix.

The latency-truncation behavior in \`defaultLogFormatter\` (>1 minute -> truncated to 10s, >1s -> 10ms, >1ms -> 10us) is purely cosmetic for the human-readable line and only applies when you use the *default* formatter. If you supply your own \`Formatter\`, you get the raw nanosecond \`time.Duration\`.

Gotcha: \`c.Writer.Status()\` returns the status that has been *set*, defaulting to 200 even before any write. If your handler panics before calling \`c.JSON\` / \`c.Status\`, Logger logs "200" while Recovery is simultaneously writing 500. The status in your access log will be wrong on panics. The fix is custom Recovery that calls \`c.Status(500)\` *before* writing the body, so Logger sees the right number when it samples after \`c.Next()\` returns.`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'logger', 'middleware', 'observability'],
    repository: gin,
    filePath: 'logger.go',
    url: `${baseUrl}/logger.go`,
  },
  {
    title: 'Router groups: middleware composition via combineHandlers',
    body: `\`router.Group(prefix, ...handlers)\` returns a new \`RouterGroup\` whose \`Handlers\` slice is the parent's handlers + the new ones, and whose \`basePath\` is the joined path. Routes registered on the group walk that combined slice on every request.

\`\`\`go
// routergroup.go
func (group *RouterGroup) Group(relativePath string, handlers ...HandlerFunc) *RouterGroup {
    return &RouterGroup{
        Handlers: group.combineHandlers(handlers),
        basePath: group.calculateAbsolutePath(relativePath),
        engine:   group.engine,
    }
}

func (group *RouterGroup) combineHandlers(handlers HandlersChain) HandlersChain {
    finalSize := len(group.Handlers) + len(handlers)
    assert1(finalSize < int(abortIndex), "too many handlers")
    mergedHandlers := make(HandlersChain, finalSize)
    copy(mergedHandlers, group.Handlers)
    copy(mergedHandlers[len(group.Handlers):], handlers)
    return mergedHandlers
}
\`\`\`

The combine returns a *fresh slice* — mutating the parent's \`Handlers\` after creating a child group does NOT propagate. So the canonical pattern works:

\`\`\`go
r := gin.New()
r.Use(Logger())                  // global
api := r.Group("/api", AuthRequired())  // /api/* gets Logger + AuthRequired
v1 := api.Group("/v1")           // /api/v1/* gets Logger + AuthRequired
v1.GET("/users", listUsers)      // chain length: 3 handlers + listUsers
\`\`\`

The \`assert1(finalSize < int(abortIndex), ...)\` panics at registration time if a single route's handler chain hits 63. \`abortIndex\` is \`math.MaxInt8 >> 1\`, so the maximum combined handlers per route is 62. In practice this only bites when you stack a lot of middleware via nested groups.

Subtle: groups are *not* a routing-level construct. The group's prefix and handlers are baked into the route at registration and the radix tree only sees the final absolute path. Adding middleware to a group *after* registering routes on it does NOT retroactively apply — it only applies to routes registered after the \`.Use()\` call. This is the most common "why isn't my new middleware running?" bug.

Also: \`group.Use()\` returns the group cast as \`IRoutes\` so you can chain (\`api.Use(X).Use(Y)\`), but the returned interface value is the same \`*RouterGroup\` underneath.`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'router', 'group', 'middleware'],
    repository: gin,
    filePath: 'routergroup.go',
    url: `${baseUrl}/routergroup.go`,
  },
  {
    title: 'c.Param vs c.Query: where each comes from and what they cost',
    body: `\`c.Param(":id")\` reads a path parameter that was matched by the radix tree at routing time. \`c.Query("id")\` reads from \`c.Request.URL.Query()\` — i.e. the \`?id=...\` part. They are unrelated and use different storage.

\`\`\`go
// context.go
func (c *Context) Param(key string) string {
    return c.Params.ByName(key)
}

func (c *Context) Query(key string) (value string) {
    value, _ = c.GetQuery(key)
    return
}

func (c *Context) GetQuery(key string) (string, bool) {
    if values, ok := c.GetQueryArray(key); ok {
        return values[0], ok
    }
    return "", false
}

func (c *Context) initQueryCache() {
    if c.queryCache == nil {
        if c.Request != nil && c.Request.URL != nil {
            c.queryCache = c.Request.URL.Query()
        } else {
            c.queryCache = url.Values{}
        }
    }
}
\`\`\`

\`c.Params\` is a \`Params\` slice (a slice of \`{Key, Value}\` structs) populated by the tree walk. \`ByName\` is a linear scan, but that's fine — typical routes have 1–3 params. Lookup is O(n) where n is small; do not micro-optimize this.

\`c.Query\` lazily parses the query string the first time you call any \`Query*\` method via \`initQueryCache\`. Subsequent calls hit the cached \`url.Values\` map. So calling \`c.Query("a")\` then \`c.Query("b")\` parses once. Be aware that \`url.URL.Query()\` itself silently swallows malformed query parameters — there is no way to detect a malformed \`?a=%ZZ\` from a user handler; you'd need to inspect \`c.Request.URL.RawQuery\` directly.

\`c.DefaultQuery(key, default)\` returns default when the key is absent. The contract is subtle: \`c.DefaultQuery("lastname", "none")\` returns \`""\` for \`?lastname=\` (key present, value empty), but \`"none"\` for missing key. Use \`c.GetQuery\` if you need to distinguish "absent" from "present-but-empty".

For wildcard routes (\`/files/*filepath\`), \`c.Param("filepath")\` includes the leading slash in the match — \`/files/a/b\` yields \`"/a/b"\`, not \`"a/b"\`. The doc on \`Param\` calls this out explicitly with a \`/user/john/\` example returning \`/john/\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'context', 'param', 'query', 'router'],
    repository: gin,
    filePath: 'context.go',
    url: `${baseUrl}/context.go`,
  },
  {
    title: 'Bind vs ShouldBind: the only difference is what happens on error',
    body: `Gin has two parallel families of binding methods. \`c.Bind*\` writes a 400 and aborts on error. \`c.ShouldBind*\` returns the error and does nothing else. Both ultimately delegate to the same \`binding.Binding.Bind\` implementation.

\`\`\`go
// context.go
func (c *Context) Bind(obj any) error {
    b := binding.Default(c.Request.Method, c.ContentType())
    return c.MustBindWith(obj, b)
}

func (c *Context) MustBindWith(obj any, b binding.Binding) error {
    err := c.ShouldBindWith(obj, b)
    if err != nil {
        var maxBytesErr *http.MaxBytesError
        switch {
        case errors.As(err, &maxBytesErr):
            c.AbortWithError(http.StatusRequestEntityTooLarge, err).SetType(ErrorTypeBind)
        default:
            c.AbortWithError(http.StatusBadRequest, err).SetType(ErrorTypeBind)
        }
        return err
    }
    return nil
}

func (c *Context) ShouldBind(obj any) error {
    b := binding.Default(c.Request.Method, c.ContentType())
    return c.ShouldBindWith(obj, b)
}

func (c *Context) ShouldBindWith(obj any, b binding.Binding) error {
    return b.Bind(c.Request, obj)
}
\`\`\`

Both \`Bind\` and \`ShouldBind\` use \`binding.Default(method, contentType)\` to pick the binding. For GET requests it's always \`Form\` (parses query string). For POST/PUT it dispatches on Content-Type: JSON, XML, ProtoBuf, MsgPack, YAML, TOML, multipart/form-data, BSON, or x-www-form-urlencoded as a fallback.

When to use which:
- **\`c.Bind\` / \`BindJSON\`**: prototype code where you want one-line "either it works or 400 was sent". Returns the error too, but you can ignore it.
- **\`c.ShouldBind\` / \`ShouldBindJSON\`**: production code that wants to render a structured error body (\`{ "errors": [...]}\`) instead of Gin's default plain-text 400.

Three non-obvious gotchas:

1. \`MustBindWith\` special-cases \`http.MaxBytesError\` and returns 413 instead of 400. To trigger this, set \`c.Request.Body = http.MaxBytesReader(w, c.Request.Body, N)\` before calling Bind — otherwise large payloads silently OOM.

2. The body is consumed by the read. Calling \`c.BindJSON\` twice fails the second time. Use \`c.ShouldBindBodyWith\` if you need to bind the same body against multiple shapes (it stores the bytes in \`c.Keys[BodyBytesKey]\`).

3. \`Bind\` adds the error to \`c.Errors\` with \`SetType(ErrorTypeBind)\` — your custom error logger middleware can filter on \`c.Errors.ByType(ErrorTypeBind)\` for "user input errors only".`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'binding', 'validation', 'json'],
    repository: gin,
    filePath: 'context.go',
    url: `${baseUrl}/context.go`,
  },
  {
    title: 'binding.Default(): how Content-Type picks the binder',
    body: `When you call \`c.Bind\` or \`c.ShouldBind\` (no suffix), Gin looks at the request method and Content-Type and picks the binder. This is \`binding.Default\`:

\`\`\`go
// binding/binding.go
func Default(method, contentType string) Binding {
    if method == http.MethodGet {
        return Form
    }

    switch contentType {
    case MIMEJSON:
        return JSON
    case MIMEXML, MIMEXML2:
        return XML
    case MIMEPROTOBUF:
        return ProtoBuf
    case MIMEMSGPACK, MIMEMSGPACK2:
        return MsgPack
    case MIMEYAML, MIMEYAML2:
        return YAML
    case MIMETOML:
        return TOML
    case MIMEMultipartPOSTForm:
        return FormMultipart
    case MIMEBSON:
        return BSON
    default: // case MIMEPOSTForm:
        return Form
    }
}
\`\`\`

The two non-obvious behaviors:

1. **GET requests always use Form binding regardless of Content-Type.** A GET with \`Content-Type: application/json\` will NOT parse the body — Gin reads from the query string. This is correct per RFC (GET bodies are undefined) but surprises people coming from Express where bodyParser doesn't care about the method.

2. **Unknown Content-Type silently falls through to Form.** A POST with \`Content-Type: text/plain\` (or no header at all) gets the urlencoded form parser, which will succeed with an empty struct on a JSON body — your handler sees a zero-value struct and you'll think the client sent nothing. Always specify the binding explicitly (\`c.ShouldBindJSON\`) when you know the wire format.

The \`Binding\` interface itself is small:

\`\`\`go
type Binding interface {
    Name() string
    Bind(*http.Request, any) error
}

type BindingBody interface {
    Binding
    BindBody([]byte, any) error
}

type BindingUri interface {
    Name() string
    BindUri(map[string][]string, any) error
}
\`\`\`

\`BindingBody\` (a superset) is what \`c.ShouldBindBodyWith\` requires — the body must be re-readable from a \`[]byte\`, which is why \`Form\` and \`Header\` (which read from non-body sources) don't satisfy it. \`Uri\` is special-cased because path parameters aren't on the request — they live on \`c.Params\`.

To register your own binder (e.g. for a custom binary format), implement \`Binding\` and pass it to \`c.ShouldBindWith(&out, myBinding)\`. The default validator (go-playground/validator with tag name \`binding\`) runs at the end of every binder via \`validate(obj)\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'binding', 'content-type', 'mime'],
    repository: gin,
    filePath: 'binding/binding.go',
    url: `${baseUrl}/binding/binding.go`,
  },
  {
    title: 'JSON binding: UseNumber + DisallowUnknownFields are package-level toggles',
    body: `Gin's JSON binder is a thin wrapper around \`encoding/json\` (or sonic / go-json depending on build tags), with two behavior switches that are package-level globals:

\`\`\`go
// binding/json.go
var EnableDecoderUseNumber = false
var EnableDecoderDisallowUnknownFields = false

func decodeJSON(r io.Reader, obj any) error {
    decoder := json.API.NewDecoder(r)
    if EnableDecoderUseNumber {
        decoder.UseNumber()
    }
    if EnableDecoderDisallowUnknownFields {
        decoder.DisallowUnknownFields()
    }
    if err := decoder.Decode(obj); err != nil {
        return err
    }
    return validate(obj)
}
\`\`\`

The two toggles, set once in \`main()\` before serving:

\`\`\`go
binding.EnableDecoderUseNumber = true             // numbers stay as json.Number, no float64 precision loss
binding.EnableDecoderDisallowUnknownFields = true // 400 if client sends keys you didn't model
\`\`\`

\`UseNumber\` is the right call for any API that handles money, IDs, or anything that can exceed 53 bits. Without it, \`{"id": 9007199254740993}\` decodes into an \`any\`-typed field as \`9007199254740992\` (silently rounded). With it, you read \`json.Number\` and decide whether to call \`.Int64()\` or \`.String()\`.

\`DisallowUnknownFields\` is your defense against typos and version drift. Without it, \`{"emial": "..."}\` (typo of "email") decodes as a struct with empty Email and validates fine — the client thinks they sent the right field, you silently drop it. With it, you 400 immediately.

Both are package globals. There is no per-request override and no thread-safety contract — set them at startup and never touch again.

After decode, every binding calls \`validate(obj)\`, which delegates to \`binding.Validator.ValidateStruct(obj)\`. The default validator is go-playground/validator/v10 with the tag name \`binding\` (not \`validate\`):

\`\`\`go
// binding/default_validator.go
func (v *defaultValidator) lazyinit() {
    v.once.Do(func() {
        v.validate = validator.New()
        v.validate.SetTagName("binding")
    })
}
\`\`\`

So the canonical Gin tag is \`json:"email" binding:"required,email"\`. The validator engine is exposed via \`binding.Validator.(*defaultValidator).Engine().(*validator.Validate)\` if you need to register custom validators (\`v.RegisterValidation("phone", phoneValidator)\`).`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'binding', 'json', 'validation'],
    repository: gin,
    filePath: 'binding/json.go',
    url: `${baseUrl}/binding/json.go`,
  },
  {
    title: 'Form binding: ParseMultipartForm runs even for urlencoded requests',
    body: `\`formBinding.Bind\` parses *both* the regular form and any multipart payload, returning success only if both succeed (or the multipart parse returns the specific "not multipart" sentinel):

\`\`\`go
// binding/form.go
const defaultMemory = 32 << 20

func (formBinding) Bind(req *http.Request, obj any) error {
    if err := req.ParseForm(); err != nil {
        return err
    }
    if err := req.ParseMultipartForm(defaultMemory); err != nil && !errors.Is(err, http.ErrNotMultipart) {
        return err
    }
    if err := mapForm(obj, req.Form); err != nil {
        return err
    }
    return validate(obj)
}
\`\`\`

Three distinct binders share this file:
- \`formBinding\` — used for GET (query string) and \`application/x-www-form-urlencoded\` POST. Tries multipart too.
- \`formPostBinding\` — \`c.ShouldBindWith(obj, binding.FormPost)\`. Reads only \`req.PostForm\` (body POST values, no query params).
- \`formMultipartBinding\` — \`multipart/form-data\`. Calls \`mappingByPtr\` with a wrapped multipart request, so file fields can be bound to \`*multipart.FileHeader\` struct fields.

The struct tag for form fields is \`form:"name"\`:

\`\`\`go
type SearchInput struct {
    Q       string    \`form:"q" binding:"required"\`
    Page    int       \`form:"page,default=1"\`
    Tags    []string  \`form:"tags"\`        // ?tags=go&tags=web => ["go", "web"]
    Created time.Time \`form:"created" time_format:"2006-01-02"\`
}
\`\`\`

Non-obvious behaviors:

1. **\`defaultMemory\` is hardcoded at 32 MiB.** This is only the in-memory portion — larger uploads spool to a temp file. There is no way to override this from the binding layer; you must either set \`engine.MaxMultipartMemory\` (used by \`c.MultipartForm\` and \`c.FormFile\`) or call \`c.Request.ParseMultipartForm(N)\` yourself before binding.

2. **\`time_format\` and \`time_utc\` tags are honored.** The form mapper has built-in time.Time support: \`form:"date" time_format:"2006-01-02" time_utc:"1"\` parses \`2024-01-15\` as midnight UTC. No custom \`UnmarshalText\` needed.

3. **Slice fields parse comma-separated by default? No.** They parse repeated keys (\`?t=a&t=b\`). For comma-separated, use \`form:"t" collection_format:"csv"\`. The default \`multi\` mode confuses developers coming from query libraries that auto-split commas.`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'binding', 'form', 'multipart'],
    repository: gin,
    filePath: 'binding/form.go',
    url: `${baseUrl}/binding/form.go`,
  },
  {
    title: 'BasicAuth: constant-time comparison via crypto/subtle',
    body: `Gin's \`BasicAuth\` middleware does the right thing for credential comparison — it pre-encodes every \`user:password\` pair as a Basic header value at startup and uses \`crypto/subtle.ConstantTimeCompare\` per request, so attackers can't time-side-channel known usernames.

\`\`\`go
// auth.go
func (a authPairs) searchCredential(authValue string) (string, bool) {
    if authValue == "" {
        return "", false
    }
    for _, pair := range a {
        if subtle.ConstantTimeCompare(bytesconv.StringToBytes(pair.value), bytesconv.StringToBytes(authValue)) == 1 {
            return pair.user, true
        }
    }
    return "", false
}

func BasicAuthForRealm(accounts Accounts, realm string) HandlerFunc {
    if realm == "" {
        realm = "Authorization Required"
    }
    realm = "Basic realm=" + strconv.Quote(realm)
    pairs := processAccounts(accounts)
    return func(c *Context) {
        user, found := pairs.searchCredential(c.requestHeader("Authorization"))
        if !found {
            c.Header("WWW-Authenticate", realm)
            c.AbortWithStatus(http.StatusUnauthorized)
            return
        }
        c.Set(AuthUserKey, user)
    }
}
\`\`\`

Wire it like this:

\`\`\`go
auth := r.Group("/admin", gin.BasicAuth(gin.Accounts{
    "alice": "s3cr3t!",
    "bob":   "p@ssword",
}))
auth.GET("/dashboard", func(c *gin.Context) {
    user := c.MustGet(gin.AuthUserKey).(string) // safe — middleware only Sets on success
    c.JSON(200, gin.H{"hello": user})
})
\`\`\`

The \`processAccounts\` function pre-computes \`"Basic " + base64(user:pass)\` once, so the request path does not base64-encode anything — it just compares the inbound Authorization header against pre-encoded strings.

Three non-obvious things:

1. **\`subtle.ConstantTimeCompare\` returns 0 if the lengths differ.** That's actually a timing leak at the length level — an attacker can probe password lengths (not common but worth knowing). Mitigation: use long, fixed-length tokens.

2. **\`assert1(length > 0, "Empty list of authorized credentials")\`** in \`processAccounts\` panics at registration time if you pass \`gin.Accounts{}\`. There is no "empty = allow none" mode — empty config is a bug.

3. **The realm is wrapped in quotes via \`strconv.Quote\`,** so a realm containing \`"\` is safely escaped. But the user-controlled \`AuthUserKey\` is set to the raw username — if you log it, treat it as untrusted input even though it matched a known credential.

\`BasicAuthForProxy\` exists for HTTP proxies; identical logic but reads \`Proxy-Authorization\` and returns 407.`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'auth', 'basic-auth', 'security'],
    repository: gin,
    filePath: 'auth.go',
    url: `${baseUrl}/auth.go`,
  },
  {
    title: 'FormFile + SaveUploadedFile: directory creation and permissions',
    body: `Gin's file-upload helpers wrap stdlib \`mime/multipart\` with parse-on-demand and a directory-creating save:

\`\`\`go
// context.go
func (c *Context) FormFile(name string) (*multipart.FileHeader, error) {
    if c.Request.MultipartForm == nil {
        if err := c.Request.ParseMultipartForm(c.engine.MaxMultipartMemory); err != nil {
            return nil, err
        }
    }
    f, fh, err := c.Request.FormFile(name)
    if err != nil {
        return nil, err
    }
    f.Close()
    return fh, err
}

func (c *Context) SaveUploadedFile(file *multipart.FileHeader, dst string, perm ...fs.FileMode) error {
    src, err := file.Open()
    if err != nil { return err }
    defer src.Close()

    var mode os.FileMode = 0o750
    if len(perm) > 0 {
        mode = perm[0]
    }
    dir := filepath.Dir(dst)
    if err = os.MkdirAll(dir, mode); err != nil { return err }
    if err = os.Chmod(dir, mode); err != nil { return err }

    out, err := os.Create(dst)
    if err != nil { return err }
    defer out.Close()
    _, err = io.Copy(out, src)
    return err
}
\`\`\`

Typical handler:

\`\`\`go
file, err := c.FormFile("avatar")
if err != nil { c.JSON(400, gin.H{"err": err.Error()}); return }
if err := c.SaveUploadedFile(file, "uploads/" + file.Filename); err != nil {
    c.JSON(500, gin.H{"err": err.Error()}); return
}
\`\`\`

Three things to watch:

1. **\`file.Filename\` is client-controlled.** Joining it directly into a path is path-traversal: \`Filename = "../../etc/passwd"\` and you've just clobbered \`/etc/passwd\` (if perms allow). Always sanitize: \`filepath.Base(file.Filename)\` strips directory components, and you should also generate your own random suffix to avoid collisions and cache-key leakage.

2. **\`SaveUploadedFile\` calls \`os.MkdirAll\` AND \`os.Chmod\` on the directory.** If the directory already exists with stricter perms (e.g. 0700), Gin will widen them to 0750 (or whatever you pass). That's a security regression on shared hosts. Pre-create your upload dirs and pass the existing mode if you care.

3. **\`FormFile\` calls \`f.Close()\` immediately** — it returns only the \`*multipart.FileHeader\`, not an open file. \`SaveUploadedFile\` reopens via \`file.Open()\`. So if you want to stream-process without saving, call \`file.Open()\` yourself. The pattern of "open, validate magic bytes, then save" requires two opens — cheap because for files in-memory the second open just re-wraps the buffer.

\`MaxMultipartMemory\` (default 32 MiB) controls the in-memory threshold; larger files are spooled to \`os.TempDir()\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'upload', 'multipart', 'file'],
    repository: gin,
    filePath: 'context.go',
    url: `${baseUrl}/context.go`,
  },
  {
    title: 'Static file serving: Static / StaticFS / StaticFile',
    body: `\`router.Static("/assets", "./public")\` registers GET and HEAD handlers for \`/assets/*filepath\` that delegate to \`http.FileServer(http.Dir("./public"))\`. The \`*filepath\` is consumed by the route param and stripped before delegating.

\`\`\`go
// routergroup.go
func (group *RouterGroup) Static(relativePath, root string) IRoutes {
    return group.StaticFS(relativePath, Dir(root, false))
}

func (group *RouterGroup) StaticFS(relativePath string, fs http.FileSystem) IRoutes {
    if strings.Contains(relativePath, ":") || strings.Contains(relativePath, "*") {
        panic("URL parameters can not be used when serving a static folder")
    }
    handler := group.createStaticHandler(relativePath, fs)
    urlPattern := path.Join(relativePath, "/*filepath")
    group.GET(urlPattern, handler)
    group.HEAD(urlPattern, handler)
    return group.returnObj()
}

func (group *RouterGroup) createStaticHandler(relativePath string, fs http.FileSystem) HandlerFunc {
    absolutePath := group.calculateAbsolutePath(relativePath)
    fileServer := http.StripPrefix(absolutePath, http.FileServer(fs))

    return func(c *Context) {
        if _, noListing := fs.(*OnlyFilesFS); noListing {
            c.Writer.WriteHeader(http.StatusNotFound)
        }
        file := c.Param("filepath")
        f, err := fs.Open(file)
        if err != nil {
            c.Writer.WriteHeader(http.StatusNotFound)
            c.handlers = group.engine.noRoute
            c.index = -1
            return
        }
        f.Close()
        fileServer.ServeHTTP(c.Writer, c.Request)
    }
}
\`\`\`

Three flavors:
- \`Static(prefix, dir)\` — \`gin.Dir(dir, false)\` allows directory listings (the second arg is \`listDirectory\`)
- \`StaticFS(prefix, http.FileSystem)\` — bring your own FS (e.g. \`embed.FS\` wrapped via \`http.FS\`)
- \`StaticFile(path, file)\` — single file, e.g. \`router.StaticFile("/favicon.ico", "./assets/favicon.ico")\`

Non-obvious behaviors:

1. **\`OnlyFilesFS\` (returned by \`gin.Dir(root, false)\`) writes 404 BEFORE checking if the file exists, then \`http.FileServer\` overwrites the status when it serves the file.** This works because \`responseWriter.WriteHeader\` is a no-op once a status was already written but a body has not yet been written — see \`response_writer.go\` line 67-75. Gross, but it's how directory-listing suppression is implemented without forking FileServer.

2. **The 404 path triggers \`engine.noRoute\` handlers** by setting \`c.handlers = group.engine.noRoute; c.index = -1\` — your custom \`r.NoRoute(...)\` handler runs for missing static files. So you can serve a SPA \`index.html\` fallback by registering NoRoute.

3. **\`http.StripPrefix\` is computed ONCE at registration**, against the absolute path. If you mount the same handler via two groups (rare), the prefix is wrong for one of them. Always use a single \`r.Static\` per directory.

For \`embed.FS\` in production builds: \`router.StaticFS("/", http.FS(embeddedFS))\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'static', 'file-server', 'router'],
    repository: gin,
    filePath: 'routergroup.go',
    url: `${baseUrl}/routergroup.go`,
  },
  {
    title: 'Run / RunTLS / RunUnix: convenience wrappers around http.Server',
    body: `Each \`Run*\` method builds an \`http.Server\` with \`engine.Handler()\` (which auto-wraps in h2c when \`engine.UseH2C\` is set) and calls the matching \`ListenAndServe*\` variant. None of them give you a handle to the server, so graceful shutdown requires building your own.

\`\`\`go
// gin.go
func (engine *Engine) Run(addr ...string) (err error) {
    defer func() { debugPrintError(err) }()
    if engine.isUnsafeTrustedProxies() {
        debugPrint("[WARNING] You trusted all proxies, this is NOT safe...")
    }
    engine.updateRouteTrees()
    address := resolveAddress(addr)
    debugPrint("Listening and serving HTTP on %s\\n", address)
    server := &http.Server{ // #nosec G112
        Addr:    address,
        Handler: engine.Handler(),
    }
    err = server.ListenAndServe()
    return
}

func (engine *Engine) RunTLS(addr, certFile, keyFile string) (err error) {
    debugPrint("Listening and serving HTTPS on %s\\n", addr)
    defer func() { debugPrintError(err) }()
    server := &http.Server{ // #nosec G112
        Addr:    addr,
        Handler: engine.Handler(),
    }
    err = server.ListenAndServeTLS(certFile, keyFile)
    return
}
\`\`\`

The \`#nosec G112\` comment is gosec acknowledging the absence of read/write/idle timeouts — Gin's Run methods do NOT set them, which is a slowloris vulnerability waiting to happen on internet-facing deployments.

For production, always build the server yourself:

\`\`\`go
srv := &http.Server{
    Addr:              ":8080",
    Handler:           r,
    ReadTimeout:       5 * time.Second,
    WriteTimeout:      10 * time.Second,
    IdleTimeout:       120 * time.Second,
    ReadHeaderTimeout: 2 * time.Second,
}
go func() {
    if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
        log.Fatal(err)
    }
}()

// graceful shutdown
quit := make(chan os.Signal, 1)
signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
<-quit

ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()
if err := srv.Shutdown(ctx); err != nil {
    log.Fatalf("forced shutdown: %v", err)
}
\`\`\`

\`engine.updateRouteTrees()\` is called inside \`Run\` (but not \`RunTLS\` or \`RunUnix\` — that's an inconsistency in the codebase). It rebuilds internal route lookup state. If you bypass \`Run\` and pass the engine straight to your own \`http.Server\`, this method is exported only as part of the engine; but in practice routes are also lazily set up during \`addRoute\` — not calling it manually is safe.

\`isUnsafeTrustedProxies()\` is the source of the "[WARNING] You trusted all proxies" message you've seen. Call \`engine.SetTrustedProxies(...)\` to silence it (and to make \`c.ClientIP()\` actually trustworthy).`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'server', 'http', 'graceful-shutdown'],
    repository: gin,
    filePath: 'gin.go',
    url: `${baseUrl}/gin.go`,
  },
  {
    title: 'c.Stream: chunked responses with disconnect detection',
    body: `\`c.Stream(step func(w io.Writer) bool) bool\` runs your step function in a loop, flushing after each call, until either the step returns false or the client disconnects. The return value tells you which happened:

\`\`\`go
// context.go
func (c *Context) Stream(step func(w io.Writer) bool) bool {
    w := c.Writer
    clientGone := w.CloseNotify()
    for {
        select {
        case <-clientGone:
            return true   // client disconnected
        default:
            keepOpen := step(w)
            w.Flush()
            if !keepOpen {
                return false  // step said "done"
            }
        }
    }
}
\`\`\`

Typical use — paginated CSV streaming:

\`\`\`go
r.GET("/export.csv", func(c *gin.Context) {
    c.Header("Content-Type", "text/csv")
    c.Header("Content-Disposition", \`attachment; filename="export.csv"\`)

    cursor := db.OpenCursor()
    defer cursor.Close()

    disconnected := c.Stream(func(w io.Writer) bool {
        row, ok := cursor.Next()
        if !ok {
            return false
        }
        fmt.Fprintf(w, "%d,%s,%s\\n", row.ID, row.Name, row.Email)
        return true
    })
    if disconnected {
        log.Printf("client dropped at row %d", cursor.Position())
    }
})
\`\`\`

Three non-obvious points:

1. **\`select { case <-clientGone: ... default: ... }\` is non-blocking** — it checks for disconnect once per iteration and immediately falls through if no disconnect signal. This means a slow step (e.g. 30s DB query) won't notice a client drop until the next loop. For long iterations, expose your own \`ctx\` and check \`ctx.Err()\` mid-step.

2. **\`CloseNotify\` is deprecated in net/http** (use \`Request.Context().Done()\` instead) but Gin still uses it because the framework predates context wiring. The signal arrives when the TCP connection is closed by the client OR proxy. Behind a reverse proxy that buffers responses, you may not get the notification until the proxy itself disconnects.

3. **\`w.Flush()\` runs after every step** — your transport must support flushing (HTTP/1.1 chunked, HTTP/2). Behind certain reverse-proxy buffer settings (nginx \`proxy_buffering on\`, the default), the client sees nothing until the buffer fills or the connection closes. Set \`X-Accel-Buffering: no\` for nginx or run the proxy with buffering disabled.

For Server-Sent Events, prefer \`c.SSEvent(name, data)\` instead — it formats the SSE wire protocol for you and uses the same Stream/Flush plumbing under the hood.`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'stream', 'streaming', 'flush'],
    repository: gin,
    filePath: 'context.go',
    url: `${baseUrl}/context.go`,
  },
  {
    title: 'SSEvent: built-in Server-Sent Events using gin-contrib/sse',
    body: `\`c.SSEvent(name, message)\` writes a Server-Sent Event frame to the response. It delegates to \`gin-contrib/sse\`'s \`Event.Render\`, which formats the \`event: ...\\ndata: ...\\n\\n\` wire protocol and sets \`Content-Type: text/event-stream\`.

\`\`\`go
// context.go
func (c *Context) SSEvent(name string, message any) {
    c.Render(-1, sse.Event{
        Event: name,
        Data:  message,
    })
}
\`\`\`

The \`-1\` status code tells \`Render\` "don't write a status header" — important because subsequent SSEvent calls would otherwise try to overwrite. In a normal SSE handler you set up the response once and stream events forever:

\`\`\`go
r.GET("/events", func(c *gin.Context) {
    c.Header("Content-Type", "text/event-stream")
    c.Header("Cache-Control", "no-cache")
    c.Header("Connection", "keep-alive")
    c.Header("Transfer-Encoding", "chunked")

    msgChan := subscribe()
    defer unsubscribe(msgChan)

    c.Stream(func(w io.Writer) bool {
        select {
        case msg := <-msgChan:
            c.SSEvent("message", msg)  // emits: event: message\\ndata: <json>\\n\\n
            return true
        case <-time.After(15 * time.Second):
            c.SSEvent("ping", "")      // keepalive
            return true
        case <-c.Request.Context().Done():
            return false
        }
    })
})
\`\`\`

The verified test case in \`context_test.go\` shows the wire format:

\`\`\`go
// context_test.go (TestContextRenderSSE)
c.SSEvent("float", 1.5)
c.Render(-1, sse.Event{Id: "123", Data: "text"})
c.SSEvent("chat", H{"foo": "bar", "bar": "foo"})
// produces:
// event:float\\ndata:1.5\\n\\nid:123\\ndata:text\\n\\nevent:chat\\ndata:{"bar":"foo","foo":"bar"}\\n\\n
\`\`\`

Three non-obvious things:

1. **Maps are JSON-encoded with sorted keys** (\`{"bar":"foo","foo":"bar"}\` — alphabetical). That's go's \`encoding/json\` behavior on \`map[string]any\`. If you need stable wire ordering for snapshot tests, this is fine; if you need a specific order, use a struct.

2. **No \`retry:\` field is set by default.** EventSource clients reconnect after 3s by default; if your backend wants to control reconnect, use \`c.Render(-1, sse.Event{Retry: 5000, Data: "..."})\` to suggest 5s.

3. **You MUST flush after each event for the client to see it.** \`c.SSEvent\` itself does NOT flush — it just writes. \`c.Stream\` calls \`Flush\` after each iteration, which is why the canonical pattern wraps SSEvent calls inside \`c.Stream\`. If you write SSEvent in a normal handler without a Stream loop, all events buffer until the response ends.`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'sse', 'server-sent-events', 'streaming'],
    repository: gin,
    filePath: 'context.go',
    url: `${baseUrl}/context.go`,
  },
  {
    title: 'WebSocket support: Hijack() lets gorilla/websocket take over',
    body: `Gin doesn't ship a WebSocket implementation. Instead it satisfies \`http.Hijacker\` so any third-party WebSocket library (gorilla/websocket, coder/websocket, nhooyr/websocket) can take over the underlying TCP connection.

\`\`\`go
// response_writer.go
var errHijackAlreadyWritten = errors.New("gin: response body already written")

type ResponseWriter interface {
    http.ResponseWriter
    http.Hijacker
    http.Flusher
    http.CloseNotifier
    // ...
}

func (w *responseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
    // Allow hijacking before any data is written (size == -1) or after headers
    // are written (size == 0), but not after body data is written (size > 0).
    // For compatibility with websocket libraries (e.g., github.com/coder/websocket)
    if w.size > 0 {
        return nil, nil, errHijackAlreadyWritten
    }
    if w.size < 0 {
        w.size = 0
    }
    return w.ResponseWriter.(http.Hijacker).Hijack()
}
\`\`\`

And the helper to detect the upgrade:

\`\`\`go
// context.go
func (c *Context) IsWebsocket() bool {
    if strings.Contains(strings.ToLower(c.requestHeader("Connection")), "upgrade") &&
        strings.EqualFold(c.requestHeader("Upgrade"), "websocket") {
        return true
    }
    return false
}
\`\`\`

Typical handler:

\`\`\`go
import "github.com/gorilla/websocket"

var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool {
        return r.Header.Get("Origin") == "https://my-app.com"
    },
}

r.GET("/ws", func(c *gin.Context) {
    if !c.IsWebsocket() {
        c.AbortWithStatus(http.StatusBadRequest)
        return
    }
    conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
    if err != nil { return }
    defer conn.Close()
    for {
        mt, msg, err := conn.ReadMessage()
        if err != nil { break }
        conn.WriteMessage(mt, msg) // echo
    }
})
\`\`\`

Three non-obvious points:

1. **The size-tracking gate.** \`Hijack\` errors with \`errHijackAlreadyWritten\` if you've written a body. The \`size < 0\` (\`noWritten = -1\`) case sets size to 0 to permit handshake responses that were already half-written by the upgrade library. This is the only reason a "headers written" hijack works — the comment in the source explicitly cites \`coder/websocket\` compatibility.

2. **Recovery middleware in the chain after the upgrade is useless.** Once Hijack returns, Gin's response-writer is essentially detached; panics in your read loop will bubble up to the goroutine, not to Recovery. Wrap your read/write loop in its own \`defer recover()\`.

3. **CORS for WebSockets is NOT handled by HTTP CORS middleware.** Browsers don't send preflight OPTIONS for WebSocket upgrades — they only check the \`Origin\` header on the upgrade request itself. The \`upgrader.CheckOrigin\` callback is your only line of defense. The default CheckOrigin (when nil) returns true for same-origin and false otherwise, but most production code overrides it.`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'websocket', 'hijacker', 'upgrade'],
    repository: gin,
    filePath: 'response_writer.go',
    url: `${baseUrl}/response_writer.go`,
  },
  {
    title: 'CreateTestContext + httptest: the canonical Gin testing pattern',
    body: `Gin exposes \`CreateTestContext\` and \`CreateTestContextOnly\` for unit tests that need to exercise a Context without a full server. For HTTP-level integration tests, the standard \`httptest.NewRecorder\` + \`engine.ServeHTTP\` pair works because Gin's \`*Engine\` is itself an \`http.Handler\`.

\`\`\`go
// test_helpers.go
func CreateTestContext(w http.ResponseWriter) (c *Context, r *Engine) {
    r = New()
    c = r.allocateContext(0)
    c.reset()
    c.writermem.reset(w)
    return
}

func CreateTestContextOnly(w http.ResponseWriter, r *Engine) (c *Context) {
    c = r.allocateContext(r.maxParams)
    c.reset()
    c.writermem.reset(w)
    return
}
\`\`\`

Two distinct testing patterns:

**Unit test of a middleware** — use CreateTestContext when you need to drive a single handler with a synthetic Context:

\`\`\`go
func TestAuthMiddleware(t *testing.T) {
    w := httptest.NewRecorder()
    c, _ := gin.CreateTestContext(w)
    c.Request, _ = http.NewRequest("GET", "/", nil)
    c.Request.Header.Set("Authorization", "Bearer bad-token")

    AuthMiddleware()(c)

    assert.Equal(t, 401, w.Code)
    assert.True(t, c.IsAborted())
}
\`\`\`

**Integration test of routing + binding + render** — use full Engine + httptest:

\`\`\`go
func TestUserCreate(t *testing.T) {
    gin.SetMode(gin.TestMode)
    r := gin.New()
    r.POST("/users", createUser)

    body := strings.NewReader(\`{"name":"alice","email":"a@b.com"}\`)
    req := httptest.NewRequest("POST", "/users", body)
    req.Header.Set("Content-Type", "application/json")
    w := httptest.NewRecorder()

    r.ServeHTTP(w, req)

    assert.Equal(t, 201, w.Code)
    var got User
    json.NewDecoder(w.Body).Decode(&got)
    assert.Equal(t, "alice", got.Name)
}
\`\`\`

Three non-obvious things:

1. **\`gin.SetMode(gin.TestMode)\` silences debug output.** Without it, every route registration prints to stdout via \`debugPrintRoute\`, which clutters \`go test -v\` output. Set this in \`TestMain\` or each test's setup.

2. **\`CreateTestContext\` builds a fresh Engine.** For tests that need shared state (rate limiter, in-memory cache), pass your real Engine to \`CreateTestContextOnly\` instead. The maxParams (0 in CreateTestContext, r.maxParams in CreateTestContextOnly) controls the params slice capacity — irrelevant in unit tests but important if you set \`c.Params\` directly.

3. **\`httptest.NewRecorder\` does not implement \`http.Hijacker\`.** WebSocket handlers will fail in unit tests with "responseWriter does not implement http.Hijacker". For WebSocket integration tests, use \`httptest.NewServer(r)\` instead — it spins up a real loopback listener.`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'testing', 'httptest', 'unit-test'],
    repository: gin,
    filePath: 'test_helpers.go',
    url: `${baseUrl}/test_helpers.go`,
  },
  {
    title: 'render.Render interface: implementing custom response formats',
    body: `Every response method in Gin (JSON, XML, HTML, String, ...) ultimately calls \`c.Render(code, render.Render)\` with an implementation of a tiny interface:

\`\`\`go
// render/render.go
type Render interface {
    Render(http.ResponseWriter) error
    WriteContentType(w http.ResponseWriter)
}
\`\`\`

The dispatch in \`c.Render\` handles the no-body status codes (1xx, 204, 304):

\`\`\`go
// context.go
func (c *Context) Render(code int, r render.Render) {
    c.Status(code)
    if !bodyAllowedForStatus(code) {
        r.WriteContentType(c.Writer)
        c.Writer.WriteHeaderNow()
        return
    }
    if err := r.Render(c.Writer); err != nil {
        _ = c.Error(err)
        c.Abort()
    }
}
\`\`\`

To add a custom format (e.g. NDJSON, Cap'n Proto, plain text with a trailer):

\`\`\`go
type NDJSON struct{ Items []any }

var ndjsonContentType = []string{"application/x-ndjson"}

func (n NDJSON) Render(w http.ResponseWriter) error {
    n.WriteContentType(w)
    enc := json.NewEncoder(w)
    for _, item := range n.Items {
        if err := enc.Encode(item); err != nil {
            return err
        }
    }
    return nil
}

func (NDJSON) WriteContentType(w http.ResponseWriter) {
    if val := w.Header()["Content-Type"]; len(val) == 0 {
        w.Header()["Content-Type"] = ndjsonContentType
    }
}

// usage
c.Render(200, NDJSON{Items: rows})
\`\`\`

Three non-obvious points:

1. **\`WriteContentType\` is required because of the no-body branch.** \`bodyAllowedForStatus\` returns false for 1xx, 204, 304 — in those cases \`Render\` is never called but the Content-Type still gets set. If you forget WriteContentType, your 204 response has no Content-Type header. Most clients don't care; some proxies do.

2. **The "if not already set" guard.** Look at \`writeContentType\` in render.go: \`if val := header["Content-Type"]; len(val) == 0\`. If a middleware (or your own handler) set Content-Type before \`c.Render\`, the renderer respects it. Useful for SSE where you set the type up front and then call SSEvent repeatedly.

3. **Errors from Render abort the request via \`c.Error(err); c.Abort()\`.** A partially written response cannot be "unwritten" — the client already sees bytes. The abort just stops further middleware. In practice, Render errors are rare (they happen when the connection drops mid-encode) and your post-handler logger will see the error in \`c.Errors\`. Custom renderers should fail fast (early in Render) before writing anything; if you discover the error after writing, there's nothing you can do but log.`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'render', 'response', 'interface'],
    repository: gin,
    filePath: 'render/render.go',
    url: `${baseUrl}/render/render.go`,
  },
  {
    title: 'Tree internals: radix tree with priority-based child ordering',
    body: `Gin's router is a forked httprouter radix tree (per HTTP method), with one optimization httprouter doesn't have: children are sorted by priority so high-traffic routes are scanned first.

\`\`\`go
// tree.go
type nodeType uint8
const (
    static nodeType = iota
    root
    param      // :id
    catchAll   // *filepath
)

type node struct {
    path      string
    indices   string
    wildChild bool
    nType     nodeType
    priority  uint32
    children  []*node // child nodes, at most 1 :param style node at the end of the array
    handlers  HandlersChain
    fullPath  string
}

// Increments priority of the given child and reorders if necessary
func (n *node) incrementChildPrio(pos int) int {
    cs := n.children
    cs[pos].priority++
    prio := cs[pos].priority

    newPos := pos
    for ; newPos > 0 && cs[newPos-1].priority < prio; newPos-- {
        cs[newPos-1], cs[newPos] = cs[newPos], cs[newPos-1]
    }
    if newPos != pos {
        n.indices = n.indices[:newPos] +
            n.indices[pos:pos+1] +
            n.indices[newPos:pos] + n.indices[pos+1:]
    }
    return newPos
}
\`\`\`

The \`priority\` is incremented every time a route is *registered* through a node — so popular sub-trees float to the front. The \`indices\` string is a parallel array of first-bytes-of-children, used as an O(branches) bytewise scan during lookup (faster than \`strings.HasPrefix\` per child for narrow fanouts).

Param and catch-all nodes are kept at the END of the children slice via \`addChild\`:

\`\`\`go
func (n *node) addChild(child *node) {
    if n.wildChild && len(n.children) > 0 {
        wildcardChild := n.children[len(n.children)-1]
        n.children = append(n.children[:len(n.children)-1], child, wildcardChild)
    } else {
        n.children = append(n.children, child)
    }
}
\`\`\`

Three non-obvious behaviors:

1. **Static routes always win over params.** Registering both \`/users/:id\` and \`/users/me\` is fine — \`/users/me\` matches the static node first, \`/users/123\` falls through to the param node. Gin enforces this at registration time; conflicting routes (\`/users/:id\` and \`/users/:slug\`) panic at startup.

2. **CatchAll (\`*filepath\`) is greedy and must be the last segment.** \`/files/*path/preview\` panics — there is nothing after a catchAll. \`/files/*path\` matches \`/files/a/b/c\` with \`path = "/a/b/c"\` (leading slash included).

3. **\`countParams\` and \`countSections\` are pre-computed at register time** to size the \`Params\` slice and \`skippedNodes\` stack on context allocation. \`engine.allocateContext\` uses these to pool zero-allocation contexts via \`engine.pool\` (a \`sync.Pool\`). This is why Gin handlers see a reused \`*Context\` — it gets reset between requests, not allocated fresh.`,
    contentType: 'REPOSITORY_FILE',
    language: 'go',
    tags: ['go', 'gin', 'router', 'tree', 'radix', 'internals'],
    repository: gin,
    filePath: 'tree.go',
    url: `${baseUrl}/tree.go`,
  },
];
