/**
 * Batch github-020-fastapi-python
 *
 * 25 FastAPI / Python web + async patterns drawn from the actual source
 * of fastapi/fastapi (master). Each entry is attributed to a real file
 * in the repo. The `url` always resolves to the canonical file on master.
 *
 * Authoring rules (see CORPUS-PLAN.md):
 * - Real attribution; no fabricated URLs
 * - Real patterns the project actually implements
 * - 250-450 word body
 * - One topic per entry
 * - WHAT + HOW (real code) + WHY + non-obvious gotcha
 */

import type { SeedItem } from '../types';

const fastapi = { owner: 'fastapi', name: 'fastapi' };
const baseUrl = 'https://github.com/fastapi/fastapi/blob/master';

export const BATCH: SeedItem[] = [
  {
    title: 'FastAPI app subclasses Starlette and wires routing + OpenAPI in setup()',
    body: `\`fastapi.FastAPI\` is a subclass of \`starlette.applications.Starlette\`. The constructor accepts the usual Starlette args (debug, routes, middleware, lifespan) plus a long list of OpenAPI options (title, version, summary, description, terms_of_service, contact, license_info, openapi_url, docs_url, redoc_url, swagger_ui_oauth2_redirect_url, separate_input_output_schemas, ...).

\`\`\`python
class FastAPI(Starlette):
    def __init__(
        self: AppType,
        *,
        debug: bool = False,
        routes: list[BaseRoute] | None = None,
        title: str = "FastAPI",
        ...
        lifespan: Lifespan[AppType] | None = None,
        ...
    ):
        ...
\`\`\`

The two pieces of plumbing that actually wire the docs are \`app.openapi()\` (lazy schema generation, cached on \`self.openapi_schema\`) and \`app.setup()\`, which mounts \`/openapi.json\`, \`/docs\`, \`/redoc\`, and the OAuth2 redirect URL as plain Starlette routes with \`include_in_schema=False\`:

\`\`\`python
async def openapi(req: Request) -> JSONResponse:
    root_path = req.scope.get("root_path", "").rstrip("/")
    schema = self.openapi()
    if root_path and self.root_path_in_servers:
        ...
    return JSONResponse(schema)
self.add_route(self.openapi_url, openapi, include_in_schema=False)
\`\`\`

So \`app.openapi_schema\` is built on first request, not on import — if you mutate the schema (e.g. to add custom security headers) you have to either pre-call \`app.openapi()\` then patch, or override \`app.openapi\` with your own callable that does \`self.openapi_schema = ...\` once. The pattern docs recommend is the second.

Non-obvious gotcha: \`app.__call__\` (also in this file) does \`scope["root_path"] = self.root_path\` BEFORE delegating to \`super().__call__\`. So if you mount FastAPI under another ASGI app and want the docs to use the mount prefix, you must either pass \`root_path=\` to the FastAPI constructor or set \`root_path_in_servers=True\` so the OpenAPI \`servers\` array auto-prepends the path. Without that, Swagger UI inside the mounted app will hit \`/openapi.json\` (no prefix) and 404.

You almost never instantiate \`FastAPI\` with the \`routes=\` argument — it's marked deprecated in the source and exists only for Starlette compat. Use \`@app.get\`/\`@app.post\` instead.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'web', 'starlette', 'openapi'],
    repository: fastapi,
    filePath: 'fastapi/applications.py',
    url: `${baseUrl}/fastapi/applications.py`,
  },
  {
    title: 'Path operation decorators (@app.get/@app.post) just call add_api_route',
    body: `\`@app.get("/items/{id}")\` is sugar over \`add_api_route\` with \`methods=["GET"]\`. The decorator captures every per-route knob — response_model, status_code, tags, dependencies, summary, description, response_description, responses, deprecated, operation_id, response_class, callbacks, openapi_extra, generate_unique_id_function — and forwards them.

\`\`\`python
def get(
    self,
    path: str,
    *,
    response_model: Any = Default(None),
    status_code: int | None = None,
    tags: list[str | Enum] | None = None,
    dependencies: Sequence[params.Depends] | None = None,
    ...
) -> Callable[[DecoratedCallable], DecoratedCallable]:
    return self.api_route(
        path=path, response_model=response_model, status_code=status_code,
        tags=tags, dependencies=dependencies, methods=["GET"], ...
    )
\`\`\`

The decorator returns the original function unchanged — registration is a side effect. That's why you can \`@app.get(...)\` then call the function directly in tests without going through the HTTP layer (useful but lossy: you skip dependency injection, validation, response_model serialization).

A subtle one: \`response_model\` defaults to \`Default(None)\`, a \`DefaultPlaceholder\`. When the route is built, the placeholder triggers fall-through to the function's return-type annotation (\`get_typed_return_annotation(endpoint)\`). So \`def get_user() -> User\` is functionally equivalent to \`@app.get("/", response_model=User)\` — but if you need to disable the response model entirely you must explicitly pass \`response_model=None\` (a real None, not the placeholder).

Methods like \`HEAD\` and \`TRACE\` aren't on FastAPI — only the standard verbs that have semantic meaning for an API: GET, POST, PUT, PATCH, DELETE, OPTIONS. If you need HEAD, register it via \`api_route(methods=["HEAD"])\`. Starlette will auto-respond to HEAD with the GET handler's headers if you don't.

Non-obvious gotcha: each decorator instantiates a fresh \`APIRoute\` object eagerly at module-import time. Side effects in your endpoint definitions (e.g. opening DB connections at module scope) run at import, NOT per request — keep startup work inside \`lifespan\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'routing', 'decorators', 'openapi'],
    repository: fastapi,
    filePath: 'fastapi/applications.py',
    url: `${baseUrl}/fastapi/applications.py`,
  },
  {
    title: 'Pydantic body model: FastAPI infers it because the annotation is not scalar',
    body: `When you annotate a parameter with a Pydantic \`BaseModel\` and don't wrap it in \`Query()\` / \`Path()\` / \`Header()\` / \`Cookie()\`, FastAPI promotes it to a body parameter automatically. The decision is in \`analyze_param\` (dependencies/utils.py): if there's no explicit FieldInfo and the annotation is not a scalar, it becomes a \`Body\`.

\`\`\`python
elif is_uploadfile_or_nonable_uploadfile_annotation(type_annotation) or ...:
    field_info = params.File(annotation=use_annotation, default=default_value)
elif not field_annotation_is_scalar(annotation=type_annotation):
    field_info = params.Body(annotation=use_annotation, default=default_value)
else:
    field_info = params.Query(annotation=use_annotation, default=default_value)
\`\`\`

So \`def create_item(item: Item)\` works with no \`Body()\` annotation. The body is read with \`await request.body()\` in the request handler, JSON-decoded only if \`Content-Type\` is \`application/json\` (or \`*+json\`), otherwise raw bytes are passed:

\`\`\`python
if subtype == "json" or subtype.endswith("+json"):
    json_body = await request.json()
\`\`\`

And then validated through the body \`ModelField\` produced from the Pydantic model. Validation errors raise \`RequestValidationError\` which the default handler returns as 422 with \`{"detail": [{loc, msg, type}, ...]}\`.

Two non-obvious gotchas. First, with a single body model FastAPI does NOT embed it under a top-level key — \`POST /items\` expects \`{"name": "x"}\`, not \`{"item": {"name": "x"}}\`. To embed, use \`Body(..., embed=True)\` or declare two body params (\`_should_embed_body_fields\` flips automatically for >1).

Second, by default \`strict_content_type=True\` — a request with no \`Content-Type\` header but a JSON body returns 422. Set \`strict_content_type=False\` on the route if you accept untyped bodies (legacy clients, curl without \`-H\`).

Path operations with a body parameter automatically generate a corresponding \`requestBody\` in OpenAPI, with the model's \`$ref\` schema. Nullable / Optional fields render as \`anyOf: [..., {type: "null"}]\` per OpenAPI 3.1.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'pydantic', 'body', 'validation'],
    repository: fastapi,
    filePath: 'fastapi/dependencies/utils.py',
    url: `${baseUrl}/fastapi/dependencies/utils.py`,
  },
  {
    title: 'Path / Query / Header / Cookie: all subclass a single Param FieldInfo',
    body: `The four parameter sources share one base class. \`Path\`, \`Query\`, \`Header\`, \`Cookie\` all extend \`Param\` (which extends Pydantic's \`FieldInfo\`) and only differ by the \`in_\` enum.

\`\`\`python
class ParamTypes(Enum):
    query = "query"; header = "header"; path = "path"; cookie = "cookie"

class Param(FieldInfo):
    in_: ParamTypes

class Path(Param):
    in_ = ParamTypes.path
    def __init__(self, default=..., ...):
        assert default is ..., "Path parameters cannot have a default value"
        ...

class Query(Param):
    in_ = ParamTypes.query

class Header(Param):
    in_ = ParamTypes.header
\`\`\`

Notice the assertion in \`Path.__init__\`: a path parameter cannot have a default value. \`@app.get("/items/{id}")\` with \`def read(id: int = 0)\` raises at import time. Logical — the \`{id}\` token in the URL is mandatory, there's no way to call the route without it.

All four accept the standard Pydantic constraints: \`gt\`, \`ge\`, \`lt\`, \`le\`, \`min_length\`, \`max_length\`, \`pattern\` (\`regex\` is deprecated since FastAPI 0.100 / Pydantic v2). They also accept \`alias\` (and \`validation_alias\` / \`serialization_alias\` separately for v2), \`deprecated\`, \`include_in_schema\` (set False to hide from OpenAPI without disabling), \`examples\`, and \`openapi_examples\`.

The single most surprising one: \`Header\` has \`convert_underscores=True\` by default. \`def read(user_agent: Annotated[str, Header()])\` matches the \`User-Agent\` header — underscores are converted to dashes when looking up the header name. If you actually want a header literally named \`user_agent\` (some legacy backends), pass \`Header(convert_underscores=False)\`.

When you annotate a list type — \`q: Annotated[list[str], Query()]\` — FastAPI calls \`received_params.getlist(alias)\` (the \`ImmutableMultiDict\` path inside \`_get_multidict_value\`) to grab repeated query params. So \`?q=a&q=b\` produces \`["a", "b"]\`, not just \`"b"\`. Same for repeated headers, but cookies are always single-valued.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'pydantic', 'params', 'query', 'header'],
    repository: fastapi,
    filePath: 'fastapi/params.py',
    url: `${baseUrl}/fastapi/params.py`,
  },
  {
    title: 'Depends() is a frozen dataclass — the magic is in solve_dependencies',
    body: `\`Depends\` itself is tiny — a frozen dataclass that holds a callable, a cache flag, and a scope:

\`\`\`python
@dataclass(frozen=True)
class Depends:
    dependency: Callable[..., Any] | None = None
    use_cache: bool = True
    scope: Literal["function", "request"] | None = None
\`\`\`

All the work happens at request time in \`solve_dependencies\` (dependencies/utils.py). The router walks each sub-dependency, recursively resolves its own deps, then dispatches based on what kind of callable it is:

\`\`\`python
if sub_dependant.use_cache and sub_dependant.cache_key in dependency_cache:
    solved = dependency_cache[sub_dependant.cache_key]
elif use_sub_dependant.is_gen_callable or use_sub_dependant.is_async_gen_callable:
    use_astack = request_astack
    if sub_dependant.scope == "function":
        use_astack = function_astack
    solved = await _solve_generator(dependant=use_sub_dependant, stack=use_astack, ...)
elif use_sub_dependant.is_coroutine_callable:
    solved = await call(**solved_result.values)
else:
    solved = await run_in_threadpool(call, **solved_result.values)
\`\`\`

That \`else\` branch is critical: a sync (\`def\`) dependency runs in the AnyIO worker thread pool, an \`async def\` dependency runs on the event loop directly. Mixing them is fine — FastAPI handles the dispatch.

The \`cache_key\` is computed from \`(call, security_scopes_tuple)\` — same dependency, same scopes = one resolution per request. So \`get_db\` called from the route AND from another dependency only opens one connection per request. Pass \`Depends(get_db, use_cache=False)\` if you want a fresh value each time (rare — usually a sign you should restructure).

Non-obvious gotcha: the cache lives in the per-request \`dependency_cache\` dict, NOT across requests. There is no app-level memoization — if you want that, use \`functools.lru_cache\` on the dependency itself (common pattern for settings). Two requests in flight simultaneously each get their own cache, so a dependency that opens a DB connection won't accidentally share it across requests.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'dependencies', 'di', 'depends'],
    repository: fastapi,
    filePath: 'fastapi/dependencies/utils.py',
    url: `${baseUrl}/fastapi/dependencies/utils.py`,
  },
  {
    title: 'Sub-dependencies: get_dependant recurses through the param tree',
    body: `When FastAPI builds a route, it walks the endpoint's signature and for every parameter that's wrapped in \`Depends(...)\` it recursively calls \`get_dependant\` on that callable. The result is a tree of \`Dependant\` nodes, each with its own list of \`dependencies\`.

\`\`\`python
if param_details.depends is not None:
    ...
    sub_dependant = get_dependant(
        path=path,
        call=param_details.depends.dependency,
        name=param_name,
        own_oauth_scopes=sub_own_oauth_scopes,
        parent_oauth_scopes=current_scopes,
        use_cache=param_details.depends.use_cache,
        scope=param_details.depends.scope,
    )
    dependant.dependencies.append(sub_dependant)
\`\`\`

So \`get_current_user(token: str = Depends(oauth2_scheme))\` builds:
- root Dependant (the route)
  - sub: get_current_user
    - sub: oauth2_scheme

At request time \`solve_dependencies\` walks the tree depth-first, populating each node's \`values\` dict from its already-solved sub-deps. The recursion is plain Python — there's no DI container or DAG resolver, just a tree walk. That's why circular dependencies aren't possible to define (the import would cycle), and why the resolution order is purely the order params appear in each function signature.

Two practical implications. First, the same dependency referenced from multiple places in the tree is solved ONCE per request thanks to \`cache_key\` lookup before invocation — so layered deps like \`route -> get_user -> get_db\` and \`route -> get_db\` directly share the same \`db\` value. Second, an exception inside any sub-dep (typically \`HTTPException\`) propagates up immediately and skips the route — but yield-based deps that already entered their context get their cleanup run via the \`AsyncExitStack\`.

Non-obvious gotcha: parameters declared on a sub-dependency (Query, Header, etc.) are extracted from the request alongside the route's own params. So \`def paginator(limit: int = 10, offset: int = 0)\` used as \`Depends(paginator)\` exposes \`limit\` and \`offset\` as actual query params on the route — and they show up in OpenAPI on every operation that depends on it. This is the recommended way to share validation across many routes.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'dependencies', 'sub-dependencies', 'di'],
    repository: fastapi,
    filePath: 'fastapi/dependencies/utils.py',
    url: `${baseUrl}/fastapi/dependencies/utils.py`,
  },
  {
    title: 'Class-based dependencies: instances are callables, cached per request',
    body: `Anything callable can be passed to \`Depends(...)\` — including a class. When the class is the dependency, FastAPI inspects \`__init__\` for parameters and treats them like any other endpoint params (Query/Path/Header/Body/Depends). Then on request it calls \`Cls(...)\` and the instance becomes the injected value.

\`\`\`python
class Pagination:
    def __init__(self, limit: int = 10, offset: int = 0):
        self.limit = limit
        self.offset = offset

@app.get("/items")
def list_items(p: Pagination = Depends(Pagination)):
    return query(limit=p.limit, offset=p.offset)
# Or with PEP 593: p: Annotated[Pagination, Depends()]  -- self-referential
\`\`\`

The cache key uses the \`call\` (the class itself) plus the security_scopes tuple — so multiple route handlers in the same request that depend on \`Pagination\` get the same instance, including if one route depends on it directly and another via a deeper sub-dependency.

Use \`use_cache=False\` to opt out:

\`\`\`python
def fresh_paginator(limit: int = 10) -> Pagination:
    return Pagination(limit=limit, offset=0)

# Each call site gets a new Pagination
@app.get("/x")
def x(p: Pagination = Depends(fresh_paginator, use_cache=False)): ...
\`\`\`

Non-obvious gotcha #1: classes with \`__init__\` that takes \`*args\` / \`**kwargs\` cannot be analyzed — FastAPI raises during route registration because it can't introspect the params. Stick to explicit named params.

Non-obvious gotcha #2: an \`__init__\` that does \`def __init__(self, db: Annotated[Session, Depends(get_db)])\` IS a sub-dependency and works fine — but if you instead set \`self.db = next(get_db())\` inside \`__init__\`, you bypass FastAPI's dependency resolver, lose caching, and break the AsyncExitStack-based teardown for yield-deps. Always declare deps as constructor params.

Non-obvious gotcha #3: if the class is also a Pydantic \`BaseModel\`, FastAPI treats it as a body model, not a dependency. Use \`Depends(MyModel)\` explicitly, or rename the class so it isn't accidentally double-purposed.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'dependencies', 'class-based', 'caching'],
    repository: fastapi,
    filePath: 'fastapi/dependencies/utils.py',
    url: `${baseUrl}/fastapi/dependencies/utils.py`,
  },
  {
    title: 'yield-based dependencies: cleanup runs via AsyncExitStack',
    body: `A dependency function that uses \`yield\` is treated as a context manager. The code before \`yield\` runs on entry, the value is injected, and the code after \`yield\` runs on exit — even if the route raised. The plumbing is in \`_solve_generator\`:

\`\`\`python
async def _solve_generator(*, dependant, stack: AsyncExitStack, sub_values):
    if dependant.is_async_gen_callable:
        cm = asynccontextmanager(dependant.call)(**sub_values)
    elif dependant.is_gen_callable:
        cm = contextmanager_in_threadpool(contextmanager(dependant.call)(**sub_values))
    return await stack.enter_async_context(cm)
\`\`\`

Sync generators are wrapped in \`contextmanager_in_threadpool\` (concurrency.py) which runs both \`__enter__\` and \`__exit__\` in the AnyIO worker pool. The \`__exit__\` gets its OWN \`CapacityLimiter(1)\` so a blocking close cannot deadlock against a saturated default pool — important when the dependency itself owns a thread pool (like a SQLAlchemy connection pool).

\`\`\`python
@asynccontextmanager
async def contextmanager_in_threadpool(cm):
    exit_limiter = CapacityLimiter(1)
    try:
        yield await run_in_threadpool(cm.__enter__)
    except Exception as e:
        ok = await anyio.to_thread.run_sync(cm.__exit__, type(e), e, e.__traceback__, limiter=exit_limiter)
        if not ok:
            raise e
    else:
        await anyio.to_thread.run_sync(cm.__exit__, None, None, None, limiter=exit_limiter)
\`\`\`

The cleanup happens AFTER the response is sent to the client — exactly like Starlette's BackgroundTasks. So your DB session stays open until the response is fully streamed; if you want it closed before, factor the work outside the dependency.

Non-obvious gotcha: \`HTTPException\` raised after the \`yield\` is NOT caught by exception handlers — by the time you're past yield, the response is on its way out. Raise from a handler or from before-yield. To catch errors from inside the route, wrap your yield in try/except and re-raise OR convert. \`raise HTTPException\` after yield gets logged but doesn't change the response.

Two scopes are supported: \`scope="request"\` (default) cleans up after the response, \`scope="function"\` cleans up after the path operation function returns but before background tasks/streaming finishes. Use \`function\` for resources that don't need to survive streaming — frees them sooner.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'dependencies', 'yield', 'cleanup', 'asyncexitstack'],
    repository: fastapi,
    filePath: 'fastapi/concurrency.py',
    url: `${baseUrl}/fastapi/concurrency.py`,
  },
  {
    title: 'BackgroundTasks: in-process queue that runs after the response',
    body: `\`fastapi.BackgroundTasks\` is a thin subclass of \`starlette.background.BackgroundTasks\` that exists only to attach FastAPI-style docs and the \`ParamSpec\`-typed \`add_task\`:

\`\`\`python
class BackgroundTasks(StarletteBackgroundTasks):
    def add_task(
        self,
        func: Callable[P, Any],
        *args: P.args,
        **kwargs: P.kwargs,
    ) -> None:
        return super().add_task(func, *args, **kwargs)
\`\`\`

Inject it as a parameter and FastAPI auto-creates an instance per request:

\`\`\`python
@app.post("/send-notification/{email}")
async def send_notification(email: str, background_tasks: BackgroundTasks):
    background_tasks.add_task(write_notification, email, message="some notification")
    return {"message": "Notification sent in the background"}
\`\`\`

Tasks run AFTER the response is sent, in the SAME event loop / worker process. Sync tasks run in the AnyIO threadpool (same one used for sync route handlers); async tasks run on the loop directly. There's no persistent queue — if the worker process crashes between response and task execution, the task is lost.

This is the right tool for fire-and-forget side-effects that are cheap and idempotent: sending a confirmation email via a sync SMTP library, writing an audit log, invalidating a cache. It is the WRONG tool for anything you need to retry, schedule, distribute across workers, or survive a restart — that's Celery, ARQ, BullMQ, or RQ.

Non-obvious gotcha #1: tasks added during a yield-dependency are run BEFORE the dependency's after-yield cleanup. Order is: handler returns -> response sent -> background tasks -> dependency cleanup. So a task can't safely use a DB session opened in a yield-dep — by the time the task runs, the session is still alive only because the request stack hasn't fully unwound. Don't rely on it; pass a fresh session.

Non-obvious gotcha #2: the response is "sent" doesn't mean the client has received it before tasks start — it means the ASGI \`send({"type": "http.response.body", ...})\` has been called. Under HTTP/2 with backpressure, the bytes may still be buffered. Tasks can still start before the network confirms delivery.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'background-tasks', 'celery', 'async'],
    repository: fastapi,
    filePath: 'fastapi/background.py',
    url: `${baseUrl}/fastapi/background.py`,
  },
  {
    title: 'HTTPException is just Starlette\'s with FastAPI docs — handlers turn it into JSON',
    body: `\`fastapi.HTTPException\` extends \`starlette.exceptions.HTTPException\`. The only override is the constructor signature, which is type-annotated with \`Annotated[..., Doc(...)]\` so the IDE shows useful tooltips:

\`\`\`python
class HTTPException(StarletteHTTPException):
    def __init__(
        self,
        status_code: int,
        detail: Any = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail, headers=headers)
\`\`\`

The thing that turns the exception into a JSON response is the default handler in \`exception_handlers.py\`:

\`\`\`python
async def http_exception_handler(request: Request, exc: HTTPException) -> Response:
    headers = getattr(exc, "headers", None)
    if not is_body_allowed_for_status_code(exc.status_code):
        return Response(status_code=exc.status_code, headers=headers)
    return JSONResponse(
        {"detail": exc.detail}, status_code=exc.status_code, headers=headers
    )
\`\`\`

So 1xx, 204, and 304 produce empty-body responses (per RFC 7230 §3.3.3); everything else returns \`{"detail": ...}\`. \`detail\` can be any JSON-serializable thing — a string, dict, list — it's passed through \`jsonable_encoder\` indirectly via \`JSONResponse\`.

Override the handler with \`@app.exception_handler\`:

\`\`\`python
@app.exception_handler(HTTPException)
async def my_handler(request, exc):
    return JSONResponse({"error": exc.detail, "code": exc.status_code}, status_code=exc.status_code)
\`\`\`

Or register a handler for any custom exception class — FastAPI calls it whenever a handler raises that type.

Non-obvious gotcha: \`raise HTTPException\` inside a yield-dependency BEFORE \`yield\` is correctly caught and converted to a 4xx/5xx response. Raising it AFTER yield does NOT — by then the response is already being sent and the exception is logged as a server error. This is a frequent source of bugs where teardown code "validates" the result and tries to fail the response — too late.

Also: \`HTTPException\` from middleware bypasses the FastAPI handler chain because middlewares run outside the route's exception scope. The handler in \`get_request_handler\` re-raises HTTPException to let the outer Starlette stack deal with it. Catch and convert in your own middleware if you need custom shaping there.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'exceptions', 'http', 'error-handling'],
    repository: fastapi,
    filePath: 'fastapi/exceptions.py',
    url: `${baseUrl}/fastapi/exceptions.py`,
  },
  {
    title: 'response_model: validation + filtering on the way out',
    body: `Set \`response_model=\` (or a return type annotation) and FastAPI runs the handler's return value through a Pydantic model BEFORE serializing to JSON. The plumbing lives in \`get_request_handler\` (routing.py); the route's \`APIRoute\` captures every modifier:

\`\`\`python
response_model: Any = Default(None)
response_model_include: IncEx | None = None
response_model_exclude: IncEx | None = None
response_model_by_alias: bool = True
response_model_exclude_unset: bool = False
response_model_exclude_defaults: bool = False
response_model_exclude_none: bool = False
\`\`\`

If \`response_model=Default(None)\` (the placeholder), the route falls back to the function's return-type annotation. If that's a \`Response\` subclass, no model is applied — your raw response goes through. Otherwise the annotation becomes the model. To explicitly disable, pass a real \`response_model=None\`.

The \`exclude_unset\` flag is the most useful one in real APIs — it omits fields the user didn't set, so a PATCH that changes \`name\` returns \`{"name": "new"}\` instead of every other field with its default. \`exclude_none\` is similar but for null-valued fields.

\`response_model_include\` / \`response_model_exclude\` accept a set or dict. Sets give a flat allowlist/denylist; dicts let you go deep:

\`\`\`python
@app.get("/users/{id}", response_model=User,
         response_model_exclude={"password_hash", "internal_notes"})
def get_user(id: int): ...
\`\`\`

Why use \`response_model\` instead of just typing the return? Two reasons. First, the handler can return ANY object that satisfies the model (e.g. a SQLAlchemy ORM instance with the right attributes) and Pydantic will dump it. Second, the response shape in OpenAPI matches what the client will actually see — including the \`exclude\` filters — so generated SDKs are accurate.

Non-obvious gotcha: \`response_model\` validates AND filters. If your DB returns a \`password_hash\` column but the model doesn't declare it, Pydantic just drops it — no error. If you want strict validation that flags extra fields, set \`model_config = {"extra": "forbid"}\` on the response model. Conversely, returning a model instance with a missing required field raises \`ResponseValidationError\` at request time (logged + 500), so always run a smoke test.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'response-model', 'pydantic', 'serialization'],
    repository: fastapi,
    filePath: 'fastapi/routing.py',
    url: `${baseUrl}/fastapi/routing.py`,
  },
  {
    title: 'Status codes and the responses dict drive both runtime and OpenAPI',
    body: `\`status_code=201\` on a path operation sets the default response code AND removes "200 OK" from the operation's OpenAPI \`responses\` map. The \`responses=\` dict lets you document additional status codes — both successful (e.g. 202) and error (404, 422) — that the route can return.

\`\`\`python
@app.post("/items/", status_code=201, responses={
    409: {"description": "Item already exists", "model": ConflictError},
    422: {"description": "Validation error"},
})
def create(item: Item): ...
\`\`\`

The \`responses\` dict is merged with the auto-generated entries. Each value can have \`description\`, \`model\` (a Pydantic class — gets a \`$ref\` schema in OpenAPI), \`content\` (custom media-type entries), or \`headers\`.

For 1xx, 204, and 304 the response handler skips the body entirely:

\`\`\`python
def is_body_allowed_for_status_code(status_code: int | str | None) -> bool:
    ...  # returns False for 1xx, 204, 304
\`\`\`

Returning anything other than \`None\` from a 204 handler triggers a \`ResponseValidationError\` — Pydantic is told to validate \`None\` against the response model.

Non-obvious gotcha #1: \`status_code\` is the DEFAULT. If your handler returns a \`Response\` subclass directly (\`return JSONResponse(..., status_code=409)\`), the explicit code wins. Use that to return mixed status codes from a single endpoint.

Non-obvious gotcha #2: the \`responses\` dict supports the special key \`"default"\` (string, not int) which OpenAPI uses for "any other status not enumerated above". Useful for a generic \`Error\` model:

\`\`\`python
responses={"default": {"model": ApiError}}
\`\`\`

Non-obvious gotcha #3: the order matters in OpenAPI's docs UI but not for matching. ReDoc renders 2xx green / 4xx orange / 5xx red sorted ascending regardless of insertion order. So put your most-likely error codes first for readability — clients won't care.

Use \`fastapi.status\` for named constants (\`status.HTTP_201_CREATED\`) instead of magic numbers — easier to grep, no risk of typo.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'status-code', 'responses', 'openapi'],
    repository: fastapi,
    filePath: 'fastapi/routing.py',
    url: `${baseUrl}/fastapi/routing.py`,
  },
  {
    title: 'async def vs def: the dispatch happens in solve_dependencies and in the route handler',
    body: `FastAPI inspects every callable — route handler, dependency, sub-dependency — and dispatches based on whether it's a coroutine function or a plain function. The decision tree, from \`solve_dependencies\`:

\`\`\`python
elif use_sub_dependant.is_coroutine_callable:
    solved = await call(**solved_result.values)
else:
    solved = await run_in_threadpool(call, **solved_result.values)
\`\`\`

\`run_in_threadpool\` is re-exported from \`starlette.concurrency\`, which uses \`anyio.to_thread.run_sync\` under the hood. The default worker-thread limit is 40 (set by AnyIO via \`CapacityLimiter\`). So a sync handler doing a 200ms SQL query consumes ONE thread out of 40 for the duration; 41 simultaneous slow sync requests will queue.

The same dispatch happens for the route handler itself (in \`get_request_handler\`). \`async def\` route → run on the event loop directly. \`def\` route → wrapped in \`run_in_threadpool\`.

Practical rule of thumb baked into the source:
- I/O via \`async\` libraries (httpx, asyncpg, aiofiles): use \`async def\`. The loop stays free.
- I/O via blocking libraries (requests, psycopg2, sync SQLAlchemy, file open): use \`def\`. FastAPI threadpools it.
- CPU-bound (parsing, image work): use \`def\`, optionally bump the threadpool limit, OR offload to a process pool / Celery.

The disaster pattern: \`async def\` handler that calls a blocking function directly. \`time.sleep(2)\`, \`requests.get\`, sync SQLAlchemy — these block the entire event loop for every connected client until they finish. On a single-process uvicorn, one such call freezes everyone.

\`\`\`python
# BAD
@app.get("/x")
async def x(): time.sleep(2)         # blocks the loop

# GOOD
@app.get("/x")
def x(): time.sleep(2)               # threadpooled
\`\`\`

Non-obvious gotcha: even a tiny sync call inside \`async def\` matters under load. Use \`asyncio.to_thread\` (or \`anyio.to_thread.run_sync\`) for one-off blocking calls inside an async handler, instead of converting the whole handler to sync.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'async', 'threadpool', 'concurrency', 'anyio'],
    repository: fastapi,
    filePath: 'fastapi/dependencies/utils.py',
    url: `${baseUrl}/fastapi/dependencies/utils.py`,
  },
  {
    title: 'StreamingResponse: re-export from Starlette, no FastAPI extras',
    body: `\`fastapi.responses\` re-exports Starlette's response classes verbatim:

\`\`\`python
from starlette.responses import StreamingResponse as StreamingResponse  # noqa
from starlette.responses import FileResponse as FileResponse  # noqa
from starlette.responses import HTMLResponse as HTMLResponse  # noqa
from starlette.responses import JSONResponse as JSONResponse  # noqa
from starlette.responses import RedirectResponse as RedirectResponse  # noqa
\`\`\`

\`StreamingResponse\` takes any iterable or async iterable — sync generators are wrapped via Starlette's \`iterate_in_threadpool\` (also re-exported from \`fastapi.concurrency\`). Use it for chunked downloads, log tailing, large CSV exports, anything where you don't want to materialize the full body in memory:

\`\`\`python
def csv_rows():
    yield "id,name\\n"
    for r in db.stream_users():        # any sync or async iterator
        yield f"{r.id},{r.name}\\n"

@app.get("/users.csv")
def export(): return StreamingResponse(csv_rows(), media_type="text/csv")
\`\`\`

The deprecated \`UJSONResponse\` and \`ORJSONResponse\` classes still exist in \`fastapi/responses.py\` but emit deprecation warnings — Pydantic v2's serializer is now fast enough that custom JSON dumpers don't move the needle. The deprecation note in the source explains:

> \`ORJSONResponse\` is deprecated, FastAPI now serializes data directly to JSON bytes via Pydantic when a return type or response model is set, which is faster and doesn't need a custom response class.

For Server-Sent Events specifically, FastAPI ships its own \`EventSourceResponse\` (\`fastapi/sse.py\`) — see the SSE entry. For everything else, \`StreamingResponse\` is the go-to.

Non-obvious gotcha: returning \`StreamingResponse\` SKIPS \`response_model\` and \`response_model_exclude\` — those only apply when FastAPI is doing the serialization. If the route's annotated return type is a \`Response\` subclass, FastAPI sees this and doesn't try to validate. So adding stream support to an existing route with \`response_model=User\` requires removing the model OR returning a non-Response then converting — usually easier to just type the return as \`StreamingResponse\`.

Also: client disconnects don't auto-cancel the generator. Wrap the loop with \`if await request.is_disconnected(): break\` for true streaming abort.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'streaming', 'response', 'sse'],
    repository: fastapi,
    filePath: 'fastapi/responses.py',
    url: `${baseUrl}/fastapi/responses.py`,
  },
  {
    title: 'EventSourceResponse: SSE with built-in keep-alive pings',
    body: `FastAPI ships its own SSE response in \`fastapi/sse.py\`. \`EventSourceResponse\` is a \`StreamingResponse\` subclass with \`media_type = "text/event-stream"\`; the actual encoding lives in the routing layer.

\`\`\`python
class EventSourceResponse(StreamingResponse):
    """Use as response_class=EventSourceResponse on a path operation that uses yield."""
    media_type = "text/event-stream"
\`\`\`

You yield \`ServerSentEvent\` instances (Pydantic model) or plain dicts. \`format_sse_event\` builds the wire format:

\`\`\`python
if event is not None:    lines.append(f"event: {event}")
if data_str is not None:
    for line in data_str.splitlines():
        lines.append(f"data: {line}")
if id is not None:       lines.append(f"id: {id}")
if retry is not None:    lines.append(f"retry: {retry}")
lines.append(""); lines.append("")
return "\\n".join(lines).encode("utf-8")
\`\`\`

The wire format is sensitive: each event ends with a blank line, multi-line data is split into multiple \`data:\` lines, and the \`id\` field MUST NOT contain null characters (enforced by the \`_check_id_no_null\` validator).

Idle keep-alive pings are emitted every \`_PING_INTERVAL = 15.0\` seconds (importable for tests via monkeypatch) using:

\`\`\`python
KEEPALIVE_COMMENT = b": ping\\n\\n"
\`\`\`

These are SSE comment lines (\`:\` prefix) — \`EventSource\` clients ignore them, but they keep proxies and load balancers from killing the connection on idle. Without this, an SSE stream behind nginx with default timeouts dies after 60 seconds of silence.

\`ServerSentEvent\` has both \`data\` (JSON-serialized) and \`raw_data\` (string passed through verbatim) fields, mutually exclusive — guarded by a \`@model_validator\`:

\`\`\`python
@model_validator(mode="after")
def _check_data_exclusive(self) -> "ServerSentEvent":
    if self.data is not None and self.raw_data is not None:
        raise ValueError("Cannot set both 'data' and 'raw_data'...")
\`\`\`

Non-obvious gotcha: \`data="hello"\` produces \`data: "hello"\` on the wire (with quotes!) because strings ARE JSON-serialized too. If you want plain text, use \`raw_data="hello"\` or yield a pre-formatted string. This trips up everyone the first time.

Works with any HTTP method (GET, POST) for protocols like MCP that stream SSE over POST.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'sse', 'streaming', 'event-source'],
    repository: fastapi,
    filePath: 'fastapi/sse.py',
    url: `${baseUrl}/fastapi/sse.py`,
  },
  {
    title: 'WebSockets: same dependency injection, different teardown',
    body: `\`fastapi.websockets\` is just three re-exports from Starlette:

\`\`\`python
from starlette.websockets import WebSocket as WebSocket
from starlette.websockets import WebSocketDisconnect as WebSocketDisconnect
from starlette.websockets import WebSocketState as WebSocketState
\`\`\`

Register with \`@app.websocket("/ws")\` (in \`applications.py\`). The interesting bit is that WebSocket endpoints get the SAME dependency-injection treatment as HTTP routes — Path/Query/Cookie params, \`Depends\`, even \`Security\` work:

\`\`\`python
@app.websocket("/items/{item_id}/ws")
async def websocket_endpoint(
    *,
    websocket: WebSocket,
    session: Annotated[str | None, Cookie()] = None,
    item_id: str,
):
    if session is None:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)
    await websocket.accept()
    while True:
        data = await websocket.receive_text()
        await websocket.send_text(f"Echo: {data}")
\`\`\`

\`raise WebSocketException(code=...)\` is the WS analog of \`HTTPException\` — the default handler (\`websocket_request_validation_exception_handler\`) calls \`websocket.close(code=WS_1008_POLICY_VIOLATION, reason=jsonable_encoder(exc.errors()))\`. Validation errors close with a JSON-encoded reason.

The expected disconnect signal is \`WebSocketDisconnect\` (raised inside \`receive_text\` etc. when the client closes). Catch it to clean up subscriptions:

\`\`\`python
try:
    while True:
        data = await ws.receive_text()
        ...
except WebSocketDisconnect:
    pubsub.unsubscribe(ws)
\`\`\`

Non-obvious gotcha #1: WebSocket dependencies CANNOT use \`yield\` for cleanup the way HTTP routes do — there's no "after response sent" point. Use a \`try/finally\` around the receive loop instead.

Non-obvious gotcha #2: HTTP middleware runs on WebSocket connections too at the ASGI level (CORS, GZip, etc.) but those middlewares are mostly no-ops for WS. \`CORSMiddleware\` does NOT enforce origin checks on WebSocket upgrades — that's a deliberate Starlette decision. If you need origin validation, do it in the endpoint by reading \`websocket.headers["origin"]\` and closing with 1008 if invalid.

Non-obvious gotcha #3: \`async def\` is required for WS endpoints — there is no sync mode. You can call sync code via \`run_in_threadpool\` if needed.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'websocket', 'dependencies', 'real-time'],
    repository: fastapi,
    filePath: 'fastapi/websockets.py',
    url: `${baseUrl}/fastapi/websockets.py`,
  },
  {
    title: 'Middleware order: CORS / GZip are Starlette re-exports applied outside-in',
    body: `\`fastapi/middleware/cors.py\` and \`fastapi/middleware/gzip.py\` are one-line re-exports:

\`\`\`python
# fastapi/middleware/cors.py
from starlette.middleware.cors import CORSMiddleware as CORSMiddleware

# fastapi/middleware/gzip.py
from starlette.middleware.gzip import GZipMiddleware as GZipMiddleware
\`\`\`

Add them with \`app.add_middleware(CORSMiddleware, ...)\`. The order of \`add_middleware\` calls matters and is the OPPOSITE of what most people expect: middleware added LAST runs FIRST on the request and LAST on the response (it's an outside-in stack):

\`\`\`python
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"])
# Request flow:  CORS -> GZip -> route handler
# Response flow: route handler -> GZip (compresses) -> CORS (adds headers)
\`\`\`

So GZip should be added BEFORE CORS so the response compression happens INSIDE the CORS-headers wrapping — otherwise CORS headers might be applied to an uncompressed body. (In practice both work because CORS only adds headers; the order matters more for middlewares that transform bodies.)

The internal \`AsyncExitStackMiddleware\` (fastapi/middleware/asyncexitstack.py) is registered automatically and handles the exit stack used by yield-dependencies and request-body file cleanup:

\`\`\`python
class AsyncExitStackMiddleware:
    async def __call__(self, scope, receive, send):
        async with AsyncExitStack() as stack:
            scope[self.context_name] = stack
            await self.app(scope, receive, send)
\`\`\`

This is why \`request.scope["fastapi_middleware_astack"]\` exists — assertions in the route handler depend on it. If you build a custom Starlette \`Mount\` that doesn't go through FastAPI's setup, those scope keys won't be set and the assertions fire.

Non-obvious gotcha: \`CORSMiddleware\` with \`allow_credentials=True\` AND \`allow_origins=["*"]\` is a security smell — browsers reject the combo per spec. Either echo the request \`Origin\` (set \`allow_origin_regex\` or pass an explicit list) or drop credentials.

Custom middleware in FastAPI: write a Starlette-style ASGI callable, not the older \`@app.middleware("http")\` decorator (which is fine for simple cases but adds another wrapper level).`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'middleware', 'cors', 'gzip', 'order'],
    repository: fastapi,
    filePath: 'fastapi/middleware/asyncexitstack.py',
    url: `${baseUrl}/fastapi/middleware/asyncexitstack.py`,
  },
  {
    title: 'OAuth2PasswordBearer: dependency that just extracts the Bearer token',
    body: `\`OAuth2PasswordBearer\` is the simplest auth scheme FastAPI ships. It's a class instantiated with \`tokenUrl\` (used only for OpenAPI docs); the instance is callable as a dependency, and what it actually does is parse the Authorization header:

\`\`\`python
async def __call__(self, request: Request) -> str | None:
    authorization = request.headers.get("Authorization")
    scheme, param = get_authorization_scheme_param(authorization)
    if not authorization or scheme.lower() != "bearer":
        if self.auto_error:
            raise self.make_not_authenticated_error()
        else:
            return None
    return param
\`\`\`

So you wire it as:

\`\`\`python
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]) -> User:
    payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    return User(**payload)

@app.get("/me")
def me(user: Annotated[User, Depends(get_current_user)]):
    return user
\`\`\`

The pattern: \`OAuth2PasswordBearer\` extracts the raw token, your own dependency (\`get_current_user\`) decodes/validates it. FastAPI does NOT ship JWT support — bring \`pyjwt\` or \`python-jose\`.

\`tokenUrl\` doesn't actually mount anything; it's metadata for Swagger UI's "Authorize" button so the docs UI can POST credentials to your token endpoint and capture the bearer for "Try it out". You still need to write the token endpoint yourself, typically with \`OAuth2PasswordRequestForm\`:

\`\`\`python
@app.post("/token")
def token(form: Annotated[OAuth2PasswordRequestForm, Depends()]):
    user = authenticate(form.username, form.password)
    if not user: raise HTTPException(401)
    return {"access_token": jwt.encode({"sub": user.id}, SECRET), "token_type": "bearer"}
\`\`\`

Non-obvious gotcha #1: \`auto_error=True\` (default) means missing/invalid Authorization raises 401 immediately — your dependency never runs. Set \`auto_error=False\` to make the dep return \`None\` and decide what to do (e.g. allow optional auth on a public endpoint).

Non-obvious gotcha #2: the OpenAPI security scheme uses the \`scheme_name=\` attribute as the key. Two \`OAuth2PasswordBearer\` instances with the same default name collide in the schema — pass distinct \`scheme_name=\` if you have multiple flows.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'security', 'oauth2', 'jwt', 'auth'],
    repository: fastapi,
    filePath: 'fastapi/security/oauth2.py',
    url: `${baseUrl}/fastapi/security/oauth2.py`,
  },
  {
    title: 'APIRouter + include_router: prefix, tags, dependencies merge per route',
    body: `\`APIRouter\` is FastAPI's modular composition unit. You mount it on the main app via \`include_router\` with optional \`prefix\`, \`tags\`, \`dependencies\`, \`responses\`, and \`callbacks\` — all of which apply to every route in the router:

\`\`\`python
users_router = APIRouter()

@users_router.get("/")
def read_users():
    return [{"name": "Rick"}]

app.include_router(users_router, prefix="/users", tags=["users"],
                   dependencies=[Depends(get_token_header)])
\`\`\`

After \`include_router\`, the route is reachable at \`GET /users/\` with the \`users\` tag and the token header dependency baked in. The implementation walks the router's routes and re-registers them on the parent:

\`\`\`python
elif isinstance(route, APIRoute):
    self.add_api_route(prefix + route.path, route.endpoint, ...)
elif isinstance(route, APIWebSocketRoute):
    current_dependencies = []
    if dependencies: current_dependencies.extend(dependencies)
    if route.dependencies: current_dependencies.extend(route.dependencies)
    self.add_api_websocket_route(prefix + route.path, route.endpoint,
                                 dependencies=current_dependencies, name=route.name)
\`\`\`

Notice the \`prefix + route.path\` concatenation — there's no normalization for double-slashes. \`prefix="/users"\` + path \`""\` gives \`"/users"\`; prefix \`"/users/"\` + path \`""\` gives \`"/users/"\`. The convention is: prefix never trailing-slashed, path always leading-slashed.

\`include_router\` also forwards \`on_startup\` / \`on_shutdown\` handlers from the sub-router to the parent app, and merges \`lifespan_context\` via \`_merge_lifespan_context\`:

\`\`\`python
for handler in router.on_startup:
    self.add_event_handler("startup", handler)
self.lifespan_context = _merge_lifespan_context(self.lifespan_context, router.lifespan_context)
\`\`\`

So a sub-router can own its own lifespan and you can plug it into multiple parents.

Non-obvious gotcha: \`tags\` from \`include_router\` are PREPENDED to the route's own tags, not replaced. If you want the per-route tags to win in OpenAPI grouping order, declare them on the operation, not the include.

Including the same router twice (under different prefixes) is supported and creates duplicate operations in OpenAPI — useful for versioned APIs (\`/v1\` and \`/v2\` from the same router, then deprecate \`/v1\` paths individually).`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'router', 'include_router', 'modular'],
    repository: fastapi,
    filePath: 'fastapi/routing.py',
    url: `${baseUrl}/fastapi/routing.py`,
  },
  {
    title: 'Path() validators: gt/le/regex enforced by Pydantic at request time',
    body: `\`Path()\` accepts the full Pydantic constraint set: numeric (\`gt\`, \`ge\`, \`lt\`, \`le\`, \`multiple_of\`), string (\`min_length\`, \`max_length\`, \`pattern\`), and metadata (\`title\`, \`description\`, \`examples\`, \`deprecated\`, \`include_in_schema\`):

\`\`\`python
class Path(Param):
    in_ = ParamTypes.path
    def __init__(
        self,
        default: Any = ...,
        *,
        gt: float | None = None,
        ge: float | None = None,
        lt: float | None = None,
        le: float | None = None,
        min_length: int | None = None,
        max_length: int | None = None,
        pattern: str | None = None,
        regex: deprecated[str | None] = None,
        ...
    ):
        assert default is ..., "Path parameters cannot have a default value"
        ...
\`\`\`

Usage:

\`\`\`python
@app.get("/items/{item_id}")
def read_item(item_id: Annotated[int, Path(gt=0, le=1_000_000, title="Item ID")]):
    return ...
\`\`\`

A request to \`/items/0\` returns \`422 {"detail": [{"type": "greater_than", "loc": ["path", "item_id"], ...}]}\` — Pydantic constraint violation, caught by \`request_params_to_args\` in dependencies/utils.py and turned into a \`RequestValidationError\`.

\`pattern=\` is a regex anchored differently from Python's \`re.match\` — Pydantic uses \`re.search\` semantics by default but FastAPI's Path validator anchors the full string. Test your regex explicitly. The old \`regex=\` kwarg still works but emits a \`FastAPIDeprecationWarning\`:

\`\`\`python
regex: Annotated[
    str | None,
    deprecated("Deprecated in FastAPI 0.100.0 and Pydantic v2, use 'pattern' instead."),
] = None,
\`\`\`

Non-obvious gotcha #1: a Path parameter MUST NOT have a default value — the assertion fires at import time. If the path token is optional, refactor into two routes (\`/items\` and \`/items/{id}\`) or use a query param instead.

Non-obvious gotcha #2: enum types work as Path params and produce a constrained string in OpenAPI:

\`\`\`python
class Region(str, Enum): us = "us"; eu = "eu"
@app.get("/regions/{region}")
def get(region: Region): ...
\`\`\`

A request with \`/regions/asia\` returns 422 with \`type: "enum"\`. The OpenAPI shows the enum values explicitly, which generated SDKs use for type narrowing.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'path', 'validation', 'pydantic', 'constraints'],
    repository: fastapi,
    filePath: 'fastapi/params.py',
    url: `${baseUrl}/fastapi/params.py`,
  },
  {
    title: 'File / UploadFile: multipart parsing requires python-multipart',
    body: `Two ways to handle file uploads. \`bytes\` reads the whole file into memory; \`UploadFile\` gives you a file-like object backed by a temp spool that switches to disk above a threshold:

\`\`\`python
class UploadFile(StarletteUploadFile):
    file: Annotated[BinaryIO, Doc("The standard Python file object (non-async).")]
    filename: Annotated[str | None, Doc("The original file name.")]
    size: Annotated[int | None, Doc("The size of the file in bytes.")]
    headers: Annotated[Headers, Doc("The headers of the request.")]
    content_type: Annotated[str | None, ...]
\`\`\`

Usage:

\`\`\`python
@app.post("/files/")
async def create_file(file: Annotated[bytes, File()]):    # in-memory
    return {"file_size": len(file)}

@app.post("/uploadfile/")
async def create_upload_file(file: UploadFile):           # spooled
    return {"filename": file.filename}
\`\`\`

\`UploadFile\` exposes async methods (\`await file.read(size)\`, \`await file.write(data)\`, \`await file.seek(0)\`, \`await file.close()\`) — the underlying Starlette object delegates these to the threadpool because the spool is a regular Python file. Inside a \`def\` (sync) handler, use \`file.file\` — the raw blocking file object — directly without awaits.

Multipart parsing requires \`python-multipart\`. FastAPI checks for it at registration time:

\`\`\`python
def ensure_multipart_is_installed():
    try:
        from python_multipart import __version__
        assert __version__ > "0.0.12"
    except (ImportError, AssertionError):
        ...  # raise with helpful install message
\`\`\`

If you forget, route registration raises with: \`Form data requires "python-multipart" to be installed. pip install python-multipart\`.

Non-obvious gotcha #1: there's a name collision — the wrong package \`multipart\` (without the \`python-\` prefix) is also on PyPI. The error message explicitly tells you to uninstall it first:

\`\`\`
You can remove "multipart" with: pip uninstall multipart
\`\`\`

Non-obvious gotcha #2: \`UploadFile\` is automatically closed when the request finishes — a callback is pushed onto the request's exit stack (\`file_stack.push_async_callback(body.close)\`). Do NOT keep a reference to the file object after the response; it'll be closed and reads will fail.

Non-obvious gotcha #3: combining \`File\` and \`Form\` fields in the same handler works, but pure-JSON bodies cannot be mixed with file uploads — multipart is all-or-nothing per request.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'file', 'upload', 'multipart'],
    repository: fastapi,
    filePath: 'fastapi/datastructures.py',
    url: `${baseUrl}/fastapi/datastructures.py`,
  },
  {
    title: 'Lifespan: async context manager replacing on_startup / on_shutdown',
    body: `The legacy \`on_startup\` / \`on_shutdown\` hooks still work but are deprecated. The replacement is an async context manager passed as \`lifespan=\`:

\`\`\`python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    app.state.db = await asyncpg.create_pool(DSN)
    yield
    # shutdown
    await app.state.db.close()

app = FastAPI(lifespan=lifespan)
\`\`\`

The FastAPI constructor's docstring for the param is explicit:

> A Lifespan context manager handler. This replaces \`startup\` and \`shutdown\` functions with a single context manager. Read more in the FastAPI docs for \`lifespan\`.

Why an async context manager? Two reasons baked into the design:

1. Anything you set up needs to be torn down even if startup itself partially fails. \`async with\` gives you guaranteed cleanup via \`__aexit__\`.
2. State that lives across requests has a single owner — \`app.state.db\` is created once, used by every request via dependency injection (\`def get_db(): return app.state.db\`), and closed once.

\`include_router\` merges sub-router lifespans automatically:

\`\`\`python
self.lifespan_context = _merge_lifespan_context(self.lifespan_context, router.lifespan_context)
\`\`\`

So a self-contained sub-package can own its own lifespan (start its own background task, open its own pool) and be plugged into the main app without touching app-level setup.

Non-obvious gotcha #1: you cannot use both \`lifespan=\` and \`on_startup=\`/\`on_shutdown=\` on the same app. The constructor accepts them but the runtime picks one path. Stick to lifespan.

Non-obvious gotcha #2: code AFTER \`yield\` runs even if the app is killed by SIGTERM — but only if the ASGI server (uvicorn / hypercorn) handles the signal gracefully. \`kill -9\` skips it. Don't rely on it for critical state-flush; do that in the request path or via durable storage.

Non-obvious gotcha #3: an exception during startup (before \`yield\`) propagates and the ASGI server fails to start. Log loudly — silent bugs at startup are a common cause of Vercel/Cloud Run "container exited" mysteries.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'lifespan', 'startup', 'shutdown', 'asynccontextmanager'],
    repository: fastapi,
    filePath: 'fastapi/applications.py',
    url: `${baseUrl}/fastapi/applications.py`,
  },
  {
    title: 'Pydantic v1 → v2: FastAPI bridges via _compat with explicit v1-not-supported error',
    body: `FastAPI's \`_compat\` package isolates everything that depends on Pydantic version. The package re-exports v2 internals from \`fastapi/_compat/v2.py\` (only v2 is supported in current FastAPI):

\`\`\`python
# fastapi/_compat/__init__.py
from .v2 import ModelField as ModelField
from .v2 import RequiredParam as RequiredParam
from .v2 import Undefined as Undefined
from .v2 import copy_field_info as copy_field_info
from .v2 import create_body_model as create_body_model
from .v2 import evaluate_forwardref as evaluate_forwardref
from .v2 import get_definitions as get_definitions
...
\`\`\`

\`Undefined\` and \`RequiredParam\` are aliased to \`pydantic_core.PydanticUndefined\` — the sentinel meaning "no value supplied":

\`\`\`python
RequiredParam = PydanticUndefined
Undefined = PydanticUndefined
\`\`\`

\`evaluate_forwardref\` papers over a Pydantic API rename — \`eval_type_lenient\` was deprecated in Pydantic v2.10.0b1 and replaced with \`try_eval_type\`. The shim picks whichever exists:

\`\`\`python
try_eval_type = getattr(_pydantic_typing_extra, "try_eval_type", None)
if try_eval_type is not None:
    return try_eval_type(value, globalns, localns)[0]
return _pydantic_typing_extra.eval_type_lenient(value, globalns, localns)
\`\`\`

If you accidentally use a \`pydantic.v1.BaseModel\` (the bridge namespace inside Pydantic v2), FastAPI raises a dedicated error from \`exceptions.py\`:

\`\`\`python
class PydanticV1NotSupportedError(FastAPIError):
    """A pydantic.v1 model is used, which is no longer supported."""
\`\`\`

Detection is in \`shared.py\`'s \`is_pydantic_v1_model_instance\` / \`annotation_is_pydantic_v1\`. The raise happens during route building or in \`jsonable_encoder\`, so you get a clear failure at startup, not a confusing serialization error at runtime.

Non-obvious gotcha #1: third-party packages still using v1 models (older versions of \`fastapi-users\`, some celery integrations) will fail loudly. Pin them to v2-compatible releases or convert their models.

Non-obvious gotcha #2: \`GenerateJsonSchema\` is overridden inside \`v2.py\` to set \`bytes_schema\` to OpenAPI's \`{type: "string", contentMediaType: "application/octet-stream"}\` — stock Pydantic returns a different format. So your \`bytes\` fields show up as proper binary in OpenAPI, not as a base64 string.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'pydantic', 'pydantic-v2', 'compat'],
    repository: fastapi,
    filePath: 'fastapi/_compat/v2.py',
    url: `${baseUrl}/fastapi/_compat/v2.py`,
  },
  {
    title: 'TestClient: starlette.testclient re-export, runs the ASGI app via httpx',
    body: `\`fastapi.testclient\` is a one-line re-export:

\`\`\`python
from starlette.testclient import TestClient as TestClient
\`\`\`

\`TestClient\` is an httpx-based wrapper that runs your ASGI app in-process — no real HTTP socket. It's synchronous (uses \`httpx.Client\`, not \`AsyncClient\`) and uses a context manager to manage app lifespan:

\`\`\`python
def test_root():
    with TestClient(app) as client:
        r = client.get("/")
        assert r.status_code == 200
        assert r.json() == {"hello": "world"}
\`\`\`

The \`with\` block runs the lifespan context manager — startup on \`__enter__\`, shutdown on \`__exit__\`. So your DB pool is opened, requests use it, then it's closed. WITHOUT the \`with\`, lifespan handlers don't run.

For purely async test setups, use \`httpx.AsyncClient\` with an \`ASGITransport\` directly:

\`\`\`python
import httpx
async def test_async():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.get("/")
\`\`\`

That bypasses TestClient (and its lifespan handling — you must call lifespan yourself if you need it).

Dependency overrides for tests use \`app.dependency_overrides\` (a dict on the FastAPI instance):

\`\`\`python
def override_db():
    return FakeDB()

app.dependency_overrides[get_db] = override_db

with TestClient(app) as client:
    r = client.post("/items", json={...})

app.dependency_overrides.clear()  # reset between tests
\`\`\`

The override is applied in \`solve_dependencies\` — when resolving a sub-dependency, FastAPI checks \`dependency_overrides_provider.dependency_overrides\` and swaps the callable.

Non-obvious gotcha #1: \`TestClient\` IS sync but calls async handlers correctly because Starlette's testclient runs an event loop in a worker thread. Calling it from inside an async test (\`async def test_x()\`) deadlocks because it tries to start a loop inside the existing one. Use plain \`def test_x()\` OR switch to \`httpx.AsyncClient\`.

Non-obvious gotcha #2: requires \`httpx\` installed (\`pip install httpx\`) — TestClient was previously requests-based but the migration is complete.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'testing', 'testclient', 'httpx'],
    repository: fastapi,
    filePath: 'fastapi/testclient.py',
    url: `${baseUrl}/fastapi/testclient.py`,
  },
  {
    title: 'Custom OpenAPI: override app.openapi to mutate the cached schema',
    body: `The default OpenAPI generator is \`get_openapi(...)\` (\`fastapi/openapi/utils.py\`). \`FastAPI.openapi\` calls it lazily and caches the result on \`self.openapi_schema\`:

\`\`\`python
def openapi(self) -> dict[str, Any]:
    if not self.openapi_schema:
        self.openapi_schema = get_openapi(
            title=self.title, version=self.version, openapi_version=self.openapi_version,
            summary=self.summary, description=self.description,
            terms_of_service=self.terms_of_service, contact=self.contact,
            license_info=self.license_info, routes=self.routes,
            webhooks=self.webhooks.routes, tags=self.openapi_tags,
            servers=self.servers,
            separate_input_output_schemas=self.separate_input_output_schemas,
            external_docs=self.openapi_external_docs,
        )
    return self.openapi_schema
\`\`\`

To customize, replace \`app.openapi\` with your own callable that calls the original, mutates, caches, and returns:

\`\`\`python
from fastapi.openapi.utils import get_openapi

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(title="MyAPI", version="2.0", routes=app.routes)
    schema["info"]["x-logo"] = {"url": "https://example.com/logo.png"}
    schema["components"]["securitySchemes"] = {
        "ApiKeyAuth": {"type": "apiKey", "in": "header", "name": "X-API-Key"}
    }
    app.openapi_schema = schema
    return schema

app.openapi = custom_openapi
\`\`\`

Now \`/openapi.json\` returns your mutated schema. The cache is on the app instance — no per-request cost beyond the first hit.

\`get_openapi\` also accepts \`webhooks=self.webhooks.routes\` — FastAPI supports OpenAPI 3.1 webhooks. Define them on \`app.webhooks\` (an \`APIRouter\` exposed on the FastAPI instance) and they show up in the schema's \`webhooks\` section but are NOT mounted as real routes — they document what your service WILL POST to clients.

The Swagger UI is served at \`/docs\` by \`get_swagger_ui_html\` (in \`fastapi/openapi/docs.py\`) which builds the HTML with a \`<script>\` tag that loads the OpenAPI URL. The init parameters are HTML-escaped through \`_html_safe_json\` to prevent XSS:

\`\`\`python
return json.dumps(value).replace("<", "\\\\u003c").replace(">", "\\\\u003e").replace("&", "\\\\u0026")
\`\`\`

Non-obvious gotcha #1: setting \`openapi_url=None\` in the FastAPI constructor disables the OpenAPI endpoint AND the docs UIs (\`/docs\` and \`/redoc\` depend on it). Use this for production deploys where you don't want to expose the schema publicly.

Non-obvious gotcha #2: the schema is cached on \`app.openapi_schema\`, so mutations made AFTER the first request to \`/openapi.json\` are invisible until you reset \`app.openapi_schema = None\`. If you rebuild routes dynamically at runtime (rare but happens in plugin systems), reset the cache after each change or the docs will stay stale.`,
    contentType: 'REPOSITORY_FILE',
    language: 'python',
    tags: ['python', 'fastapi', 'openapi', 'docs', 'swagger', 'custom'],
    repository: fastapi,
    filePath: 'fastapi/applications.py',
    url: `${baseUrl}/fastapi/applications.py`,
  },
];
