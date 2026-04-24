/**
 * Batch github-014-zod-typescript
 *
 * 30 patterns drawn directly from the Zod source
 * (https://github.com/colinhacks/zod). Every entry references a real
 * file in the repo, with quoted code from that file and a
 * production-grade gotcha attached. Focus: schema modeling + the
 * advanced TypeScript type-system tricks that make Zod's `z.infer<>`
 * actually round-trip.
 */

import type { SeedItem } from '../types';

const repo = { owner: 'colinhacks', name: 'zod' } as const;
const url = (path: string) =>
  `https://github.com/colinhacks/zod/blob/main/${path}`;

export const BATCH: SeedItem[] = [
  {
    title: 'z.object(): the static `create` constructor that defaults UnknownKeys to "strip"',
    body: `\`z.object({...})\` is a thin alias for \`ZodObject.create\`. The interesting part is what the static signature locks in: \`UnknownKeys\` defaults to \`"strip"\` and \`Catchall\` defaults to \`ZodTypeAny\` — meaning unknown keys are silently dropped from the parsed output, not preserved or rejected.

\`\`\`ts
static create = <Shape extends ZodRawShape>(
  shape: Shape,
  params?: RawCreateParams
): ZodObject<
  Shape,
  "strip",
  ZodTypeAny,
  objectOutputType<Shape, ZodTypeAny, "strip">,
  objectInputType<Shape, ZodTypeAny, "strip">
> => { /* ... */ };
\`\`\`

The shape is stored as a thunk (\`shape: () => T\`) so that recursive object schemas (where \`shape\` references the schema itself) don't blow up at construction time. The first call to \`._getCached()\` materializes the shape and caches it:

\`\`\`ts
_getCached(): { shape: T; keys: string[] } {
  if (this._cached !== null) return this._cached;
  const shape = this._def.shape();
  const keys = util.objectKeys(shape);
  this._cached = { shape, keys };
  return this._cached;
}
\`\`\`

That cache is per-instance, so repeated parses don't re-materialize the shape — important because every \`.parse()\` call walks \`shapeKeys\` to build pairs.

**Gotcha:** Because "strip" is the default, the type \`z.infer<typeof schema>\` will *not* include any unknown keys, but at runtime your input object's extra fields are silently swallowed. Two surprises follow: (1) you can't use \`z.object({})\` as a "passthrough" type-guard for a typed envelope — the result is always \`{}\`. (2) The output object is a *new* object built key-by-key (\`pairs.push(...)\`), not the input — referential equality with the input fails even when no transformation occurred. If you need a cheap "is this shape valid" without the rebuild, parse and discard the result, but don't expect \`parse(x) === x\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'z-object', 'schema-basics'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'z.infer / z.input / z.output: phantom type slots on the ZodType base class',
    body: `Zod's three inference helpers all read off phantom properties on \`ZodType\` — they're declared but never assigned, existing only at the type level:

\`\`\`ts
export abstract class ZodType<Output = any, Def extends ZodTypeDef = ZodTypeDef, Input = Output> {
  readonly _type!: Output;
  readonly _output!: Output;
  readonly _input!: Input;
  readonly _def!: Def;
  // ...
}

export type TypeOf<T extends ZodType<any, any, any>> = T["_output"];
export type input<T extends ZodType<any, any, any>> = T["_input"];
export type output<T extends ZodType<any, any, any>> = T["_output"];
export type { TypeOf as infer };
\`\`\`

The three generic slots — \`Output\`, \`Def\`, \`Input\` — default \`Input\` to \`Output\`, so for plain schemas like \`z.string()\` the input and output types are identical. They diverge only when you introduce \`.transform()\`, \`.preprocess()\`, \`.coerce.*\`, \`.default()\`, or \`.pipe()\` — anything that maps one shape into another. \`z.infer\` is just an alias for \`TypeOf\` (which is just \`T["_output"]\`).

**Gotcha:** When you write \`z.string().transform(s => s.length)\`, the input type is \`string\` and the output type is \`number\`. \`z.infer\` gives you the \`number\`. People reach for \`z.infer\` to type their form values and end up with the *post-transform* type — wrong for the form, right for the API consumer. Use \`z.input<typeof schema>\` for form values and \`z.output<typeof schema>\` (or \`z.infer\`, same thing) for the consumer of \`parse()\`. The \`!\` postfix on \`_output!: Output\` is a definite-assignment assertion — there's no runtime value, just a TS-only marker, so \`schema._output\` at runtime is \`undefined\` (and \`schema._def\` is the only one that's actually populated).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'z-infer', 'phantom-types', 'type-inference'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: '.refine() vs .superRefine(): one issue vs many, and why the overloads matter',
    body: `\`.refine()\` is the ergonomic single-issue path; \`.superRefine()\` is the escape hatch for multi-issue or fully custom \`addIssue\` calls. Internally both funnel through the same \`_refinement\` builder:

\`\`\`ts
refine(check: (arg: Output) => unknown, message?: ...) {
  // ...
  return this._refinement((val, ctx) => {
    const result = check(val);
    const setError = () =>
      ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val),
      });
    if (typeof Promise !== "undefined" && result instanceof Promise) {
      return result.then((data) => { if (!data) { setError(); return false; } return true; });
    }
    if (!result) { setError(); return false; } else { return true; }
  });
}

superRefine(refinement: (arg: Output, ctx: RefinementCtx) => unknown | Promise<unknown>) {
  return this._refinement(refinement);
}
\`\`\`

\`.refine\` always emits exactly one \`code: "custom"\` issue per failed check. \`.superRefine\` hands you the raw \`ctx.addIssue\` and lets you push as many issues as you want with whatever \`code\` you choose — including \`fatal: true\`, which short-circuits subsequent checks via \`status.abort()\` rather than \`status.dirty()\`.

**Gotcha:** \`.refine\` has a type-guard overload — \`(arg: Output) => arg is RefinedOutput\` — which narrows the output type. \`.superRefine\` has the same overload but the narrowing only fires if your function returns a real boolean type-guard predicate. Most people write \`(arg, ctx) => { if (...) ctx.addIssue(...) }\` (returning void), which means *no narrowing* even if you intended it. The other gotcha: a single \`.refine\` runs the check *after* every prior parse step succeeded, but if you stack \`.refine().refine()\`, both run even if the first failed (status goes dirty, parsing continues). To stop the chain on first failure, use \`.superRefine\` with \`ctx.addIssue({ ..., fatal: true })\` and \`return z.NEVER\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'refine', 'super-refine', 'validation'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'z.discriminatedUnion vs z.union: O(1) lookup vs O(n) try-each',
    body: `\`z.union\` walks every option until one parses cleanly and aggregates errors from all failures. \`z.discriminatedUnion\` builds a \`Map<discriminator, schema>\` at construction time and does a single direct lookup at parse time:

\`\`\`ts
// ZodUnion._parse — try every option
for (const option of options) {
  const result = option._parseSync({ data: ctx.data, path: ctx.path, parent: childCtx });
  if (result.status === "valid") return result;
  // ...collect dirty / errors
}
// ...if nothing valid, emit invalid_union with N union errors

// ZodDiscriminatedUnion._parse — single Map lookup
const discriminatorValue: string = ctx.data[discriminator];
const option = this.optionsMap.get(discriminatorValue);
if (!option) {
  addIssueToContext(ctx, {
    code: ZodIssueCode.invalid_union_discriminator,
    options: Array.from(this.optionsMap.keys()),
    path: [discriminator],
  });
  return INVALID;
}
return option._parseSync({ data: ctx.data, path: ctx.path, parent: ctx });
\`\`\`

The \`optionsMap\` is built in \`ZodDiscriminatedUnion.create\` via \`getDiscriminator\`, which recursively unwraps \`ZodLazy\`, \`ZodEffects\`, \`ZodLiteral\`, \`ZodEnum\`, \`ZodDefault\`, etc. to extract the literal value(s) of the discriminator field.

**Gotcha:** Discriminated unions reject duplicate discriminator values at construction time (\`throw new Error("Discriminator property ... has duplicate value ...")\`) — useful, but it means you can't have two variants share a tag even if they're otherwise structurally distinct. The bigger gotcha is error quality: a regular \`z.union\` failure reports issues from *every* branch (often 30+ noisy lines for a 5-variant union), while discriminated unions report a single \`invalid_union_discriminator\` issue with the list of valid values, then (if the discriminator matched) only the matching schema's issues. For UI form validation against a tagged union, always reach for discriminated — the error path \`["type"]\` becomes immediately actionable. The cost: the discriminator must be a literal/enum-like field that \`getDiscriminator\` can statically extract; \`z.string()\` won't work as the discriminator schema.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'discriminated-union', 'union', 'performance'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: '.transform(): how input/output types diverge through ZodEffects',
    body: `\`.transform()\` is what makes Zod schemas non-symmetric. Internally it constructs a \`ZodEffects\` whose \`Output\` generic is the transform's return type — completely independent of \`Input\`:

\`\`\`ts
transform<NewOut>(
  transform: (arg: Output, ctx: RefinementCtx) => NewOut | Promise<NewOut>
): ZodEffects<this, NewOut> {
  return new ZodEffects({
    ...processCreateParams(this._def),
    schema: this,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect: { type: "transform", transform },
  }) as any;
}
\`\`\`

At parse time, \`ZodEffects._parse\` parses the inner schema first, then runs the transform on the value:

\`\`\`ts
if (effect.type === "transform") {
  const base = this._def.schema._parseSync({ data: ctx.data, path: ctx.path, parent: ctx });
  if (!isValid(base)) return INVALID;
  const result = effect.transform(base.value, checkCtx);
  if (result instanceof Promise) {
    throw new Error(\`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.\`);
  }
  return { status: status.value, value: result };
}
\`\`\`

So \`z.string().transform(s => s.length)\` has \`_input: string\` and \`_output: number\`. The transform only runs after the inner schema validates — your transform never sees garbage input.

**Gotcha 1:** A transform that returns a \`Promise\` and is invoked via the sync \`.parse()\` will *throw* (not fail validation, *throw*). Always reach for \`.parseAsync()\` if any transform/refinement in the chain is async.

**Gotcha 2:** The transform receives a \`RefinementCtx\` as the second arg. You can call \`ctx.addIssue({ ... })\` inside a transform, but if you do you must \`return z.NEVER\` to bail — otherwise Zod will use whatever value you return and produce a dirty-but-not-aborted result. A common bug: validation fails, the transform issues an error, but the function still returns \`null\`, so downstream consumers see \`null\` *and* an error — pick one.

**Gotcha 3:** Once you transform, you can no longer call \`.shape\`, \`.partial\`, \`.pick\`, etc. — those are \`ZodObject\` methods, and \`ZodEffects\` doesn't proxy them. Compose transforms last, or use \`.pipe()\` to keep the object methods available before the transform stage.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'transform', 'zod-effects', 'type-divergence'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'z.preprocess() vs z.coerce: parser-level conversion vs type-level coercion flag',
    body: `\`z.coerce.string()\` and friends mutate the input via a typed cast *before* type checking. \`z.preprocess(fn, schema)\` runs an arbitrary function before the inner schema parses. They live in different code paths.

Coerce is implemented as a flag on the leaf classes:

\`\`\`ts
// ZodString._parse
_parse(input: ParseInput): ParseReturnType<string> {
  if (this._def.coerce) {
    input.data = String(input.data);
  }
  // ...continue with normal type check
}

// z.coerce export
export const coerce = {
  string: ((arg) => ZodString.create({ ...arg, coerce: true })) as (typeof ZodString)["create"],
  number: ((arg) => ZodNumber.create({ ...arg, coerce: true })) as (typeof ZodNumber)["create"],
  // ...boolean, bigint, date
};
\`\`\`

Preprocess is a \`ZodEffects\` variant constructed via \`createWithPreprocess\`:

\`\`\`ts
static createWithPreprocess = <I extends ZodTypeAny>(
  preprocess: (arg: unknown, ctx: RefinementCtx) => unknown,
  schema: I,
  params?: RawCreateParams
): ZodEffects<I, I["_output"], unknown> => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
  });
};
\`\`\`

Note the \`Input = unknown\` in the return type — preprocess accepts anything.

**Gotcha:** \`z.coerce.boolean()\` calls \`Boolean(input.data)\` which is *truthy coercion*: \`Boolean("false")\` is \`true\`, \`Boolean(0)\` is \`false\`, \`Boolean("0")\` is \`true\`. Almost never what you want for query strings or form data. For string-to-bool, write \`z.preprocess(v => v === "true" || v === true, z.boolean())\`. Similarly \`z.coerce.date()\` does \`new Date(input.data)\` and returns an Invalid Date object on garbage input — the \`Number.isNaN(input.data.getTime())\` check inside \`ZodDate._parse\` catches it as \`invalid_date\`, but only if you got that far. Preprocess is the right tool when you need conditional logic ("if string, parse JSON; if object, pass through"); coerce is only safe for trusted inputs from the same runtime.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'preprocess', 'coerce', 'type-coercion'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'z.brand(): nominal typing via a unique symbol intersection',
    body: `Zod's branded types simulate nominal typing in TypeScript's structural type system by intersecting the runtime type with a phantom property keyed by a unique symbol:

\`\`\`ts
export const BRAND: unique symbol = Symbol("zod_brand");
export type BRAND<T extends string | number | symbol> = {
  [BRAND]: { [k in T]: true };
};

export class ZodBranded<T extends ZodTypeAny, B extends string | number | symbol> extends ZodType<
  T["_output"] & BRAND<B>,
  ZodBrandedDef<T>,
  T["_input"]
> {
  _parse(input: ParseInput): ParseReturnType<any> {
    const { ctx } = this._processInputParams(input);
    return this._def.type._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }

  unwrap() { return this._def.type; }
}
\`\`\`

So \`z.string().brand("UserId")\` produces output type \`string & BRAND<"UserId">\`. At runtime, \`_parse\` is a passthrough — it just forwards to the inner type's parser, no extra validation. The brand is *purely* a TypeScript-level construct.

**Why it works:** \`string\` is assignable to \`string & BRAND<"UserId">\` only if you intersect them explicitly. So a function declared \`(id: z.infer<typeof UserId>) => ...\` will reject a raw \`string\` literal at compile time — you have to go through \`UserId.parse(...)\` to get a value with the brand. This is the only way TS gives you "you can't accidentally pass an OrderId where a UserId is expected" without runtime cost.

**Gotcha:** Because the brand is pure type-level, two schemas with the same brand string \`"UserId"\` produce the *same* TS type. The brand string isn't unique — it's structural based on the literal string you passed. If you accidentally brand two different schemas with \`"UserId"\` in different files, both will be assignable to each other. Convention: brand strings should be globally unique (use a module path prefix, like \`"users/UserId"\`). The other gotcha: brands don't survive serialization. \`JSON.parse(JSON.stringify(brandedValue))\` returns a plain string at runtime, even though TS still thinks it's branded. Re-parse through the schema after deserialization to restore the brand.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'brand', 'nominal-typing', 'unique-symbol'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'z.lazy(): the only escape hatch for recursive schemas',
    body: `Recursive schemas — a tree node that contains an array of itself, a JSON value type, etc. — can't be expressed directly because JS evaluates the inner schema before the outer assignment completes. \`z.lazy\` defers the construction:

\`\`\`ts
export class ZodLazy<T extends ZodTypeAny> extends ZodType<output<T>, ZodLazyDef<T>, input<T>> {
  get schema(): T {
    return this._def.getter();
  }

  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }

  static create = <Inner extends ZodTypeAny>(getter: () => Inner, params?: RawCreateParams): ZodLazy<Inner> => {
    return new ZodLazy({
      getter: getter,
      typeName: ZodFirstPartyTypeKind.ZodLazy,
      ...processCreateParams(params),
    });
  };
}
\`\`\`

The \`getter\` is invoked lazily on every \`_parse\` call — so the inner schema only needs to exist by the time you actually call \`.parse()\`, not at construction time.

**The TypeScript half:** \`output<T>\` and \`input<T>\` flow through, which means \`z.infer\` works for the inner schema's output. But the *outer* recursive type can't be inferred — TS needs an explicit type annotation to know what's recursive:

\`\`\`ts
type Category = { name: string; subcategories: Category[] };
const Category: z.ZodType<Category> = z.lazy(() =>
  z.object({ name: z.string(), subcategories: z.array(Category) })
);
\`\`\`

**Gotcha:** Because \`getter\` runs every parse call, repeated parses of a deeply-recursive structure call the getter once *per recursion level* — which usually means a fresh schema instance each time, defeating internal caching like \`ZodObject._cached\`. For hot paths, hoist the inner schema into a \`const\` and have the getter return that const, so the cache survives:

\`\`\`ts
const inner = z.object({ ... });
const Recursive = z.lazy(() => inner);
\`\`\`

The other gotcha: if you forget the \`z.ZodType<Category>\` annotation, TS infers \`ZodLazy<ZodObject<{...subcategories: ZodArray<ZodLazy<...>>}>>\` and \`z.infer\` produces a never-bottoming recursive type that's effectively unusable.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'lazy', 'recursive-schema', 'self-reference'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: '.merge() vs .extend(): semantic differences in shape composition',
    body: `Both \`.merge\` and \`.extend\` produce a new \`ZodObject\` with combined shapes, but \`.merge\` adopts the right-hand schema's \`unknownKeys\` and \`catchall\`, while \`.extend\` keeps the left's:

\`\`\`ts
extend<Augmentation extends ZodRawShape>(augmentation: Augmentation) {
  return new ZodObject({
    ...this._def,                    // ← left's unknownKeys + catchall preserved
    shape: () => ({
      ...this._def.shape(),
      ...augmentation,
    }),
  }) as any;
}

merge<Incoming extends AnyZodObject, Augmentation extends Incoming["shape"]>(merging: Incoming) {
  const merged: any = new ZodObject({
    unknownKeys: merging._def.unknownKeys,    // ← right's
    catchall: merging._def.catchall,          // ← right's
    shape: () => ({
      ...this._def.shape(),
      ...merging._def.shape(),
    }),
    typeName: ZodFirstPartyTypeKind.ZodObject,
  }) as any;
  return merged;
}
\`\`\`

\`.extend\` takes a *raw shape* (\`{ name: z.string() }\`); \`.merge\` takes another \`ZodObject\`. Both shallow-merge, so a key in the right side replaces (not deep-merges) the same key on the left.

**Gotcha 1:** If you have \`z.object({...}).strict().merge(z.object({...}))\`, the result is *not* strict — because \`.merge\` adopts the (default \`"strip"\`) unknown keys from the right. Re-apply \`.strict()\` after the merge if you need it. \`.extend\` doesn't have this problem.

**Gotcha 2:** The shape thunks compose by spreading, not by reference — so changing the original shape after the merge has no effect on the merged schema. This is only relevant if you're dynamically mutating raw shapes (rare, but it bit one team that built schemas at runtime from a JSON config).

**Gotcha 3:** Both \`.merge\` and \`.extend\` happily *override* keys without warning. \`z.object({ name: z.string() }).extend({ name: z.number() })\` silently produces \`{ name: number }\` with no compile-time complaint. If you want safety against accidental overrides, build a custom helper that asserts no key overlap (\`keyof A & keyof B\` should be \`never\`).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'merge', 'extend', 'schema-composition'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: '.pick() / .omit() / .partial(): mapped types over the shape',
    body: `These three methods rebuild the shape with a TS-level mask, then construct a new \`ZodObject\`. The implementations are straightforward but the *types* are where the magic lives:

\`\`\`ts
pick<Mask extends util.Exactly<{ [k in keyof T]?: true }, Mask>>(
  mask: Mask
): ZodObject<Pick<T, Extract<keyof T, keyof Mask>>, UnknownKeys, Catchall> {
  const shape: any = {};
  for (const key of util.objectKeys(mask)) {
    if (mask[key] && this.shape[key]) {
      shape[key] = this.shape[key];
    }
  }
  return new ZodObject({ ...this._def, shape: () => shape }) as any;
}

omit<Mask extends util.Exactly<{ [k in keyof T]?: true }, Mask>>(
  mask: Mask
): ZodObject<Omit<T, keyof Mask>, UnknownKeys, Catchall> {
  const shape: any = {};
  for (const key of util.objectKeys(this.shape)) {
    if (!mask[key]) shape[key] = this.shape[key];
  }
  return new ZodObject({ ...this._def, shape: () => shape }) as any;
}

partial(mask?: any) {
  const newShape: any = {};
  for (const key of util.objectKeys(this.shape)) {
    const fieldSchema = this.shape[key]!;
    if (mask && !mask[key]) newShape[key] = fieldSchema;
    else newShape[key] = fieldSchema.optional();
  }
  return new ZodObject({ ...this._def, shape: () => newShape }) as any;
}
\`\`\`

The \`util.Exactly\` constraint ensures the mask object only contains keys that exist on the shape — pass an unknown key and TS errors at the call site, not at parse time.

**Gotcha 1:** \`.partial()\` only goes one level deep. For nested partial, there's \`.deepPartial()\` (deprecated in v3), implemented via the recursive \`deepPartialify\` helper that walks \`ZodObject\`, \`ZodArray\`, \`ZodOptional\`, \`ZodNullable\`, and \`ZodTuple\`. It bails out on anything else (unions, effects, lazy schemas) and returns those untouched, so deep-partial through a transform or union doesn't actually deep-partial.

**Gotcha 2:** \`.pick({ a: true })\` and \`.omit({ a: true })\` both *erase* the schema's prior \`.refine\` / \`.transform\` calls. Those live on \`ZodEffects\` wrappers, not on \`ZodObject\`. If you have \`UserSchema.refine(...).pick({ id: true })\`, it won't typecheck because \`.refine\` returns \`ZodEffects\`, not \`ZodObject\`. Apply \`.pick\` first, then \`.refine\` — or use \`.transform\` as the *outermost* operation in the chain.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'pick', 'omit', 'partial', 'mapped-types'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'z.record(): the keyType / valueType pair, with surprising key-validation semantics',
    body: `\`z.record\` validates every entry of an object: the key against \`keyType\` and the value against \`valueType\`. The interesting quirk is that the \`for...in\` loop walks every own enumerable string key, including inherited ones if you're not careful.

\`\`\`ts
_parse(input: ParseInput): ParseReturnType<this["_output"]> {
  const { status, ctx } = this._processInputParams(input);
  if (ctx.parsedType !== ZodParsedType.object) { /* ...invalid_type */ }

  const pairs: { key: ParseReturnType<any>; value: ParseReturnType<any>; alwaysSet: boolean }[] = [];
  const keyType = this._def.keyType;
  const valueType = this._def.valueType;

  for (const key in ctx.data) {
    pairs.push({
      key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
      value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
      alwaysSet: key in ctx.data,
    });
  }
  return ctx.common.async ? ParseStatus.mergeObjectAsync(...) : ParseStatus.mergeObjectSync(...);
}
\`\`\`

The output type uses a conditional: if the key schema is exactly \`ZodString\` (the default), the result is \`Record<string, V>\`; otherwise the conditional \`RecordType\` produces \`Partial<Record<K, V>>\` because the runtime can't guarantee every K is present:

\`\`\`ts
export type RecordType<K extends string | number | symbol, V> = [string] extends [K]
  ? Record<K, V>
  : Partial<Record<K, V>>;
\`\`\`

**Gotcha 1:** \`z.record(z.enum(["a", "b"]), z.number())\` gives you \`Partial<Record<"a" | "b", number>>\` — both keys are *optional*. If you need both keys present, use \`z.object({ a: z.number(), b: z.number() })\`.

**Gotcha 2:** \`for (const key in ctx.data)\` walks the prototype chain. If the input is \`Object.create({ injected: true })\`, the \`injected\` key gets validated. Most JSON inputs are plain objects so this rarely matters, but if you accept arbitrary input from \`Object.assign(new Foo(), data)\`, the inherited methods will be enumerated and parsed — they'll usually fail \`valueType\` and produce confusing errors. Always normalize via \`{...input}\` or \`JSON.parse(JSON.stringify(input))\` before parsing untrusted records.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'record', 'collections'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'z.map() and z.set(): native collection schemas with size checks',
    body: `\`z.map\` and \`z.set\` validate JS \`Map\` / \`Set\` instances. \`z.map\` validates each entry's key and value; \`z.set\` validates each element and supports \`.min\` / \`.max\` / \`.size\` / \`.nonempty\`:

\`\`\`ts
// ZodMap._parse — each entry indexed by [index, "key"] and [index, "value"]
const pairs = [...(ctx.data as Map<unknown, unknown>).entries()].map(([key, value], index) => {
  return {
    key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
    value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"])),
  };
});

// ZodSet._parse — size checks first, then per-element validation
if (def.minSize !== null && ctx.data.size < def.minSize.value) {
  addIssueToContext(ctx, { code: ZodIssueCode.too_small, minimum: def.minSize.value, type: "set", inclusive: true, exact: false, message: def.minSize.message });
  status.dirty();
}
const elements = [...(ctx.data as Set<unknown>).values()].map((item, i) =>
  valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i))
);
\`\`\`

The error path for a map issue is something like \`[3, "value"]\` — the third entry, value side. For sets, the path is the iteration index (which has nothing to do with insertion order semantics for collections that aren't insertion-ordered, but JS Set is insertion-ordered, so it works).

**Gotcha 1:** \`z.map\` requires the input to *be* a \`Map\` instance, not a plain object. \`ZodParsedType.map\` is checked via \`ctx.data instanceof Map\` (in \`getParsedType\`). JSON deserialization produces plain objects, never Maps — so a network response can never directly satisfy \`z.map\`. Use \`z.preprocess(o => new Map(Object.entries(o)), z.map(z.string(), z.number()))\` if you need to accept object-shaped input.

**Gotcha 2:** \`z.set\`'s \`finalizeSet\` does \`parsedSet.add(element.value)\` — meaning the *output* set deduplicates by reference equality of the parsed values. If your \`valueType\` is a transform that returns fresh objects (e.g. parsing dates), every element will be unique even if the inputs were "equal" — because each parse produces a new object instance. Set semantics over deep equality require post-processing.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'map', 'set', 'collections'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'Custom error messages: errorMap, params, and the precedence chain',
    body: `Zod resolves an error message by walking a precedence chain of error maps. \`processCreateParams\` builds the schema-level error map from the shorthand options:

\`\`\`ts
function processCreateParams(params: RawCreateParams): ProcessedCreateParams {
  if (!params) return {};
  const { errorMap, invalid_type_error, required_error, description } = params;
  if (errorMap && (invalid_type_error || required_error)) {
    throw new Error(\`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.\`);
  }
  if (errorMap) return { errorMap, description };
  const customMap: ZodErrorMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") return { message: message ?? ctx.defaultError };
    if (typeof ctx.data === "undefined") return { message: message ?? required_error ?? ctx.defaultError };
    if (iss.code !== "invalid_type") return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
\`\`\`

So you can write \`z.string({ required_error: "Name is required", invalid_type_error: "Must be a string" })\` and Zod synthesizes an \`errorMap\` that handles both. If you pass a custom \`errorMap\` *and* the shorthand options, it throws.

The full resolution order at \`makeIssue\` time: contextual error map (passed to \`parse\`) → schema's error map (from \`processCreateParams\`) → global \`getErrorMap()\` → \`defaultErrorMap\`. First non-undefined message wins.

**Gotcha:** \`required_error\` only fires when \`ctx.data === undefined\`. If you send \`null\` to \`z.string({ required_error: "..." })\`, you get the \`invalid_type_error\` (or default), *not* the required error — because \`null\` is "present, wrong type." If your form treats null as missing, normalize to \`undefined\` before parsing or use \`.nullish()\` and add a \`.refine\` with the right message. Also: per-method messages like \`z.string().email("Invalid email")\` only override the *email check's* message, not the underlying invalid_type — chain-level customization doesn't compose into a single error map.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'error-map', 'error-messages', 'i18n'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'safeParse vs parse: same code path, different return contract',
    body: `\`parse\` and \`safeParse\` share their entire runtime path. \`parse\` is a thin wrapper that throws on \`safeParse\`'s error result:

\`\`\`ts
parse(data: unknown, params?: util.InexactPartial<ParseParams>): Output {
  const result = this.safeParse(data, params);
  if (result.success) return result.data;
  throw result.error;
}

safeParse(data: unknown, params?: util.InexactPartial<ParseParams>): SafeParseReturnType<Input, Output> {
  const ctx: ParseContext = {
    common: { issues: [], async: params?.async ?? false, contextualErrorMap: params?.errorMap },
    path: params?.path || [],
    schemaErrorMap: this._def.errorMap,
    parent: null,
    data,
    parsedType: getParsedType(data),
  };
  const result = this._parseSync({ data, path: ctx.path, parent: ctx });
  return handleResult(ctx, result);
}
\`\`\`

\`handleResult\` builds the \`{ success: true; data }\` or \`{ success: false; error }\` discriminated union. The error is built lazily via a getter — so if you never read \`result.error\`, no \`ZodError\` instance is constructed:

\`\`\`ts
return {
  success: false,
  get error() {
    if ((this as any)._error) return (this as any)._error;
    const error = new ZodError(ctx.common.issues);
    (this as any)._error = error;
    return (this as any)._error;
  },
};
\`\`\`

**Gotcha 1:** Performance-wise, the two are identical for the success path. The only overhead of \`parse\` is the \`if (result.success)\` branch + a throw on failure. The "wisdom" that \`safeParse\` is faster is wrong; the only reason to prefer it is exception-free control flow at call sites.

**Gotcha 2:** \`parse\` throws \`ZodError\` (which extends \`Error\`), but it's set up with \`Object.setPrototypeOf\` because some bundlers / older Node versions break the prototype chain when you extend \`Error\`. If you \`catch (e: any) { if (e instanceof ZodError) ... }\` and that check fails in production, your bundler is stripping the prototype work — switch to \`e?.name === "ZodError"\` for a more portable check.

**Gotcha 3:** The lazy \`error\` getter means the first read of \`result.error\` is more expensive than subsequent reads. If you log + re-throw, log first, then throw — same result, no double construction.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'safe-parse', 'parse', 'error-handling'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'safeParseAsync: how async refinements force the entire parse to be async',
    body: `Zod's parse machinery is dual-mode — every \`_parse\` returns either a \`SyncParseReturnType\` or a \`Promise<SyncParseReturnType>\`. The sync path throws if it accidentally encounters a Promise:

\`\`\`ts
_parseSync(input: ParseInput): SyncParseReturnType<Output> {
  const result = this._parse(input);
  if (isAsync(result)) {
    throw new Error("Synchronous parse encountered promise.");
  }
  return result;
}

async safeParseAsync(data: unknown, params?: util.InexactPartial<ParseParams>): Promise<SafeParseReturnType<Input, Output>> {
  const ctx: ParseContext = {
    common: { issues: [], contextualErrorMap: params?.errorMap, async: true },
    path: params?.path || [],
    schemaErrorMap: this._def.errorMap,
    parent: null,
    data,
    parsedType: getParsedType(data),
  };
  const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
  const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
  return handleResult(ctx, result);
}
\`\`\`

\`safeParseAsync\` flips \`ctx.common.async = true\` so leaf schemas know to return Promises (\`ZodObject\` and \`ZodUnion\` both branch on this flag). Even if no actual async work happens, the result is wrapped in \`Promise.resolve\` for a uniform await.

**Gotcha 1:** A schema with a single async \`.refine\` makes the *entire* schema async-only. \`schema.parse(...)\` will throw \`"Synchronous parse encountered promise"\` even if the data passes every other check. There's no way to mark "only this branch is async" — once async leaks in, you have to use \`parseAsync\` everywhere. People hit this when adding a "username is unique" check that hits the database; the rest of the form was sync, now it's not.

**Gotcha 2:** The \`spa\` alias (\`spa = this.safeParseAsync\`) exists for terseness — it's just \`s\`afe\`p\`arse\`A\`sync. Useful in tests where you don't want to type \`safeParseAsync\` 50 times.

**Gotcha 3:** \`ctx.common.async\` is a single boolean per parse call, not per schema. So if you pass \`{ async: true }\` to \`safeParse\`, sync-only schemas still take the async code path internally (Promise wrapping, then awaiting). It's idempotent but slightly slower.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'parse-async', 'safe-parse-async', 'async-validation'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'z.intersection vs .merge: structural & vs key-by-key combine',
    body: `\`z.intersection\` produces a TS \`A & B\` and runs *both* schemas against the input independently, then deep-merges the results. \`.merge\` rebuilds an object schema with combined keys.

\`\`\`ts
export class ZodIntersection<T extends ZodTypeAny, U extends ZodTypeAny> extends ZodType<
  T["_output"] & U["_output"],
  ZodIntersectionDef<T, U>,
  T["_input"] & U["_input"]
> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) return INVALID;
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, { code: ZodIssueCode.invalid_intersection_types });
        return INVALID;
      }
      // ...
    };
    // ...parse left + right, then handleParsed
  }
}
\`\`\`

The \`mergeValues\` helper does deep merge — it recursively walks both sides, fails if a key has incompatible scalar values on each side (\`{ x: 1 } & { x: 2 }\` is \`invalid_intersection_types\`), and unions arrays element-wise.

**Why pick which:**

- \`.merge\`: same-shape combination of two \`ZodObject\`s. The result is a single \`ZodObject\` you can still \`.pick\`, \`.partial\`, \`.extend\` on. Single parse pass.
- \`z.intersection\`: combine two non-object schemas, or combine a schema with refinements that you want to preserve independently. Two parse passes (left then right, in parallel for async). The result is a \`ZodIntersection\`, *not* a \`ZodObject\` — so no \`.pick\` / \`.partial\` access.

**Gotcha:** \`z.intersection(A, B)\` runs both schemas against the same input. If \`A\` is \`z.object({ x: z.string() }).strict()\` and the input has \`{ x: "hi", y: 1 }\`, the strict object rejects the unknown \`y\` key. Almost always you want \`.merge\` instead — intersections + strict schemas are a footgun. Also: intersecting two transforms is undefined behavior in practice — both transforms run, but \`mergeValues\` doesn't know how to combine, say, a \`Date\` from the left and a \`string\` from the right; it'll either fail or produce nonsense.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'intersection', 'merge', 'composition'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'z.literal + z.enum + z.nativeEnum: three flavors of "value must be one of"',
    body: `Zod has three constructs for enumerated values, each tuned for a different source.

**z.literal** — single value, any primitive:

\`\`\`ts
export class ZodLiteral<T> extends ZodType<T, ZodLiteralDef<T>, T> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, { received: ctx.data, code: ZodIssueCode.invalid_literal, expected: this._def.value });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
}
\`\`\`

**z.enum** — array of string literals, with a Set-backed cache:

\`\`\`ts
export class ZodEnum<T extends [string, ...string[]]> extends ZodType<T[number], ZodEnumDef<T>, T[number]> {
  _cache: Set<T[number]> | undefined;
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    if (typeof input.data !== "string") { /* invalid_type */ }
    if (!this._cache) this._cache = new Set(this._def.values);
    if (!this._cache.has(input.data)) { /* invalid_enum_value */ }
    return OK(input.data);
  }
}
\`\`\`

**z.nativeEnum** — wraps a TS \`enum\` declaration (string or numeric):

\`\`\`ts
export class ZodNativeEnum<T extends EnumLike> extends ZodType<T[keyof T], ZodNativeEnumDef<T>, T[keyof T]> {
  _cache: Set<T[keyof T]> | undefined;
  _parse(input: ParseInput): ParseReturnType<T[keyof T]> {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    // ...accepts string OR number (TS enums can be either)
    if (!this._cache) this._cache = new Set(util.getValidEnumValues(this._def.values));
    if (!this._cache.has(input.data)) { /* invalid_enum_value */ }
    return OK(input.data);
  }
}
\`\`\`

**Gotcha:** \`z.nativeEnum\` calls \`util.getValidEnumValues\` to filter out the *reverse mappings* TS adds for numeric enums. \`enum E { A = 0 }\` compiles to \`{ A: 0, 0: "A" }\` — the \`"0": "A"\` is a reverse map, not a real value. \`getValidEnumValues\` strips those. But for *string* enums there are no reverse mappings, so the cache is just the string values.

The other gotcha: \`z.enum(["a", "b"]).options\` exposes the literal tuple, and \`.enum\` exposes a record \`{ a: "a", b: "b" }\` — both useful in client code (e.g. for rendering a dropdown without re-typing the values). \`z.literal("a")\` doesn't expose either; if you have many single-value variants, prefer \`z.enum\` for ergonomics.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'literal', 'enum', 'native-enum'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'z.tuple with .rest(): fixed prefix + variadic tail',
    body: `\`z.tuple([A, B])\` produces a fixed-arity array \`[A, B]\`. \`z.tuple([A, B]).rest(C)\` allows any number of trailing \`C\` elements. The schema enforces both at parse time:

\`\`\`ts
_parse(input: ParseInput): ParseReturnType<this["_output"]> {
  const { status, ctx } = this._processInputParams(input);
  if (ctx.parsedType !== ZodParsedType.array) { /* invalid_type */ }

  if (ctx.data.length < this._def.items.length) {
    addIssueToContext(ctx, { code: ZodIssueCode.too_small, minimum: this._def.items.length, inclusive: true, exact: false, type: "array" });
    return INVALID;
  }

  const rest = this._def.rest;
  if (!rest && ctx.data.length > this._def.items.length) {
    addIssueToContext(ctx, { code: ZodIssueCode.too_big, maximum: this._def.items.length, inclusive: true, exact: false, type: "array" });
    status.dirty();
  }

  const items = ([...ctx.data] as any[])
    .map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema) return null as any as SyncParseReturnType<any>;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    })
    .filter((x) => !!x);
  // ...
}
\`\`\`

Each element is parsed with its index as the path segment, so errors look like \`["1", "name"]\` — second tuple position, \`name\` field of that element. The type-level result uses two separate generics:

\`\`\`ts
export type OutputTypeOfTupleWithRest<
  T extends ZodTupleItems | [],
  Rest extends ZodTypeAny | null = null,
> = Rest extends ZodTypeAny ? [...OutputTypeOfTuple<T>, ...Rest["_output"][]] : OutputTypeOfTuple<T>;
\`\`\`

**Gotcha 1:** Without \`.rest\`, extra elements only mark the parse \`dirty\`, not aborted — meaning \`safeParse\` returns \`success: false\` but the inner tuple still gets parsed up to the fixed length. With \`.rest\`, extras are validated as the rest type. Less-than-minimum length always aborts, no partial tuple.

**Gotcha 2:** TypeScript's variadic tuple types (\`[A, B, ...C[]]\`) only work as Zod's output type if you use \`.rest\` *after* the fixed tuple. There's no way to express \`[...C[], A, B]\` (rest at the start) — Zod always treats the rest as trailing. For "leading rest" patterns (e.g. function args where the last is a callback), reverse the array before parsing or design around it.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'tuple', 'rest', 'variadic'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'z.function(): wraps a function and validates args + return on every call',
    body: `\`z.function(args, returns).implement(fn)\` produces a wrapped function that validates inputs before calling and the return value after. The wrapper uses \`Reflect.apply\` to preserve \`this\`:

\`\`\`ts
return OK(function (this: any, ...args: any[]) {
  const parsedArgs = me._def.args.safeParse(args, params);
  if (!parsedArgs.success) {
    throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
  }
  const result = Reflect.apply(fn, this, parsedArgs.data);
  const parsedReturns = me._def.returns.safeParse(result, params);
  if (!parsedReturns.success) {
    throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
  }
  return parsedReturns.data;
}) as any;
\`\`\`

If \`returns\` is a \`ZodPromise\`, the wrapper returns an async function and awaits the inner promise before validating its resolved value:

\`\`\`ts
if (this._def.returns instanceof ZodPromise) {
  return OK(async function (this: any, ...args: any[]) {
    const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => { ... });
    const result = await Reflect.apply(fn, this, parsedArgs as any);
    const parsedReturns = await (me._def.returns as ZodPromise<ZodTypeAny>)._def.type.parseAsync(result, params);
    return parsedReturns;
  });
}
\`\`\`

The TS type-level magic uses two type aliases: \`OuterTypeOfFunction\` (for the wrapper signature shown to callers) uses \`Args["_input"]\` and \`Returns["_output"]\`, while \`InnerTypeOfFunction\` (for the function you implement) flips them: \`Args["_output"]\` and \`Returns["_input"]\`. This is correct because the *caller* sees the input form and the *implementation* receives the parsed/transformed form.

**Gotcha:** Every call pays double-validation cost — args + return — even for hot paths. For methods called millions of times, this is real overhead; reserve \`z.function\` for trust boundaries (e.g. plugin APIs, RPC handlers) rather than internal code. Also: \`z.function\` was deprecated in Zod v4 in favor of a more flexible API; in v3 it's still supported but the throw-on-error semantics make it awkward inside React event handlers (you'll want a try/catch wrapper).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'z-function', 'function-validation'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'Schema introspection: .shape and ._def for runtime metadata',
    body: `Every Zod schema carries its definition on \`_def\`, and \`ZodObject\` exposes the shape via a getter. This is how you build dynamic UI from schemas (auto-form generators, OpenAPI emitters, tRPC):

\`\`\`ts
get shape() {
  return this._def.shape();
}
\`\`\`

Note it's a getter that calls the thunk every time — in the hot path of an introspection tool, cache the result.

\`_def\` shape varies by type but always carries \`typeName\`:

\`\`\`ts
export interface ZodTypeDef {
  errorMap?: ZodErrorMap | undefined;
  description?: string | undefined;
}

// ZodObjectDef adds:
//   shape: () => T
//   catchall: ZodTypeAny
//   unknownKeys: "passthrough" | "strict" | "strip"
//   typeName: ZodFirstPartyTypeKind.ZodObject

// ZodOptionalDef adds:
//   innerType: T
//   typeName: ZodFirstPartyTypeKind.ZodOptional
\`\`\`

The \`ZodFirstPartyTypeKind\` enum is exhaustive across all built-in types — useful as a discriminator for visitor patterns over schemas:

\`\`\`ts
export enum ZodFirstPartyTypeKind {
  ZodString = "ZodString",
  ZodNumber = "ZodNumber",
  ZodObject = "ZodObject",
  ZodOptional = "ZodOptional",
  // ...all 30 variants
}
\`\`\`

**Gotcha 1:** The \`shape\` getter is *only* on \`ZodObject\`. If you have a \`ZodEffects\` (any \`.refine\` / \`.transform\` over an object), \`.shape\` doesn't exist. Walk via \`schema._def.schema\` (for ZodEffects) or \`.unwrap()\` (for ZodOptional, ZodNullable, ZodBranded, ZodReadonly) until you hit a \`ZodObject\` to introspect. \`schema._def.typeName === ZodFirstPartyTypeKind.ZodObject\` is the right discriminator.

**Gotcha 2:** \`_def.errorMap\` is the *schema-level* error map only. The full resolution chain (contextual + schema + global + default) is built at parse time — you can't reconstruct the user-visible error from \`_def\` alone.

**Gotcha 3:** Introspecting a schema doesn't give you the inferred TS type — that lives only in the type system. If you need a JSON-Schema-style description at runtime, walk \`_def\` recursively and emit your own representation; there's no \`schema.toJSON()\` in v3.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'introspection', 'schema-shape', 'metadata'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'ZodEffects internals: one class for refinement, transform, and preprocess',
    body: `All three "side effect" operations — refinement, transform, preprocess — share a single \`ZodEffects\` class. The \`effect.type\` discriminator branches \`_parse\`:

\`\`\`ts
export type Effect<T> = RefinementEffect<T> | TransformEffect<T> | PreprocessEffect<T>;

_parse(input: ParseInput): ParseReturnType<this["_output"]> {
  const { status, ctx } = this._processInputParams(input);
  const effect = this._def.effect || null;

  const checkCtx: RefinementCtx = {
    addIssue: (arg: IssueData) => {
      addIssueToContext(ctx, arg);
      if (arg.fatal) status.abort();
      else status.dirty();
    },
    get path() { return ctx.path; },
  };

  if (effect.type === "preprocess") {
    const processed = effect.transform(ctx.data, checkCtx);
    // ...parse the *processed* value through this._def.schema
  }
  if (effect.type === "refinement") {
    // ...parse first, then run effect.refinement on the value (return value ignored)
  }
  if (effect.type === "transform") {
    // ...parse first, then return effect.transform(value, ctx)
  }
}
\`\`\`

The order matters: **preprocess runs *before* the inner schema**, refinement and transform run *after*. So:

- \`z.preprocess(s => Number(s), z.number())\` — coerce, then validate
- \`z.number().refine(...)\` — validate, then refine
- \`z.number().transform(n => n * 2)\` — validate, then transform

**Gotcha 1:** Refinement *ignores* the return value of your function (\`return acc\` at the end). It's there only to call \`ctx.addIssue\`. If you accidentally write \`.refine(v => v.toUpperCase())\` thinking it's a transform, the value is unchanged and the truthy return passes the check — silent no-op. Use \`.transform\` for value mapping.

**Gotcha 2:** Refinement runs on a \`status.dirty\` result too — so a number that failed an earlier \`.min(0)\` still hits the \`.refine\`. Your refinement code might receive invalid input (still a number, but not the value you asserted). Check inputs in the refinement, or use \`.superRefine\` with \`fatal: true\` to abort earlier.

**Gotcha 3:** \`status\` from the outer parse and \`status\` inside the inner schema's parse are *different* status objects. A dirty inner status doesn't propagate back automatically — \`ZodEffects\` checks \`if (inner.status === "dirty") status.dirty()\` explicitly. If you write a custom schema that wraps another, copy this pattern.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'zod-effects', 'refinement', 'transform', 'preprocess'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'ZodType base methods: .optional / .nullable / .nullish / .default / .catch',
    body: `Five wrapper methods on \`ZodType\` that produce new schema classes for "value might be missing or fail":

\`\`\`ts
optional(): ZodOptional<this> { return ZodOptional.create(this, this._def) as any; }
nullable(): ZodNullable<this> { return ZodNullable.create(this, this._def) as any; }
nullish(): ZodOptional<ZodNullable<this>> { return this.nullable().optional(); }

default(def: any) {
  const defaultValueFunc = typeof def === "function" ? def : () => def;
  return new ZodDefault({
    ...processCreateParams(this._def),
    innerType: this,
    defaultValue: defaultValueFunc,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
  }) as any;
}

catch(def: any) {
  const catchValueFunc = typeof def === "function" ? def : () => def;
  return new ZodCatch({
    ...processCreateParams(this._def),
    innerType: this,
    catchValue: catchValueFunc,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
  }) as any;
}
\`\`\`

The implementations of the wrappers themselves are minimal short-circuits — \`ZodOptional._parse\` returns \`OK(undefined)\` if the input is undefined, \`ZodDefault._parse\` substitutes the default value before delegating to the inner type:

\`\`\`ts
// ZodDefault._parse
let data = ctx.data;
if (ctx.parsedType === ZodParsedType.undefined) {
  data = this._def.defaultValue();
}
return this._def.innerType._parse({ data, path: ctx.path, parent: ctx });
\`\`\`

\`ZodCatch\` is the failsafe — it parses the inner schema and, on any failure, returns the catch value:

\`\`\`ts
// ZodCatch._parse — simplified
const result = this._def.innerType._parse({...});
return {
  status: "valid",
  value: result.status === "valid"
    ? result.value
    : this._def.catchValue({ get error() { return new ZodError(newCtx.common.issues); }, input: newCtx.data }),
};
\`\`\`

**Gotcha 1:** \`.nullish()\` is just \`.nullable().optional()\` — the order matters because \`.optional\` is the outer wrapper, so input/output are \`T | null | undefined\`. The order doesn't affect runtime behavior, but \`schema instanceof ZodOptional\` returns \`true\` for nullish schemas while \`instanceof ZodNullable\` returns \`false\`.

**Gotcha 2:** \`.default(value)\` substitutes the default *only* for \`undefined\`, not for \`null\`. \`z.string().default("x").parse(null)\` throws — null is "wrong type," not "missing." Combine with \`.nullable()\` if you need null-to-default: \`z.string().nullable().default("x").transform(v => v ?? "x")\`.

**Gotcha 3:** \`.catch(fallback)\` swallows *all* validation errors. Combined with a transform, you can lose data silently. Use \`.catch(({ error }) => { logSentry(error); return fallback; })\` to keep visibility.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'optional', 'nullable', 'default', 'catch'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'Async refinements: how parseAsync gates promise-returning checks',
    body: `An async refinement returns a Promise. \`ZodEffects._parse\` detects this via \`instanceof Promise\` and either awaits it (in async mode) or throws (in sync mode):

\`\`\`ts
if (effect.type === "refinement") {
  const executeRefinement = (acc: unknown): any => {
    const result = effect.refinement(acc, checkCtx);
    if (ctx.common.async) {
      return Promise.resolve(result);
    }
    if (result instanceof Promise) {
      throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
    }
    return acc;
  };

  if (ctx.common.async === false) {
    const inner = this._def.schema._parseSync({...});
    if (inner.status === "aborted") return INVALID;
    if (inner.status === "dirty") status.dirty();
    executeRefinement(inner.value);  // sync path — return value ignored
    return { status: status.value, value: inner.value };
  } else {
    return this._def.schema._parseAsync({...}).then((inner) => {
      if (inner.status === "aborted") return INVALID;
      if (inner.status === "dirty") status.dirty();
      return executeRefinement(inner.value).then(() => {
        return { status: status.value, value: inner.value };
      });
    });
  }
}
\`\`\`

So \`schema.refine(async (val) => await checkInDb(val))\` parses fine through \`parseAsync\` but explodes through \`parse\`.

**Gotcha 1:** A common pattern is "username must be unique" — an async refine. The moment you add it, every consumer of the schema must use \`parseAsync\`. Refactoring is contagious — a sync call site three layers up suddenly throws. Mitigate by exposing two schemas: \`UserSchemaSync\` for client-side form validation (no DB check) and \`UserSchemaAsync\` for server-side submit handling (with the DB check).

**Gotcha 2:** Async refinements run *after* the inner schema parses. They can't gate parsing — if you need "validate field A only if field B is X," do it inside a \`.superRefine\` on the parent object, not as a per-field refine. The parent object hits superRefine after all fields parse, so you have access to all values at once.

**Gotcha 3:** Errors from async refinements come back *async*. If you forget to \`await safeParseAsync\`, you'll see the success type \`{ success: false; error: ZodError } | { success: true; data: T }\` resolve to the unwrapped Promise type — TS won't catch the missing await unless your tsconfig has \`noUncheckedIndexedAccess\` style strictness.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'async-refinement', 'parse-async'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'Catchall and unknown keys: .passthrough() vs .strict() vs .strip()',
    body: `\`ZodObject\` has three modes for unknown keys, set via \`unknownKeys\` on the def. The \`_parse\` method branches on it:

\`\`\`ts
if (this._def.catchall instanceof ZodNever) {
  const unknownKeys = this._def.unknownKeys;

  if (unknownKeys === "passthrough") {
    for (const key of extraKeys) {
      pairs.push({
        key: { status: "valid", value: key },
        value: { status: "valid", value: ctx.data[key] },
      });
    }
  } else if (unknownKeys === "strict") {
    if (extraKeys.length > 0) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.unrecognized_keys,
        keys: extraKeys,
      });
      status.dirty();
    }
  } else if (unknownKeys === "strip") {
    // do nothing — extras are silently dropped
  }
} else {
  // catchall path — validate every extra key against the catchall schema
  const catchall = this._def.catchall;
  for (const key of extraKeys) {
    pairs.push({
      key: { status: "valid", value: key },
      value: catchall._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
    });
  }
}
\`\`\`

The three setter methods are one-liners:

\`\`\`ts
strict(message?) { return new ZodObject({ ...this._def, unknownKeys: "strict", ... }); }
strip() { return new ZodObject({ ...this._def, unknownKeys: "strip" }); }
passthrough() { return new ZodObject({ ...this._def, unknownKeys: "passthrough" }); }
\`\`\`

**Why pick which:**
- \`.strip()\` (default) — silently drop unknowns. Safe for output to clients, dangerous for forwarding payloads.
- \`.passthrough()\` — preserve unknowns. Use for "envelope" types that wrap unknown payloads (e.g. webhook event handlers that re-emit the data).
- \`.strict()\` — error on unknowns. Use for input from untrusted sources where extra fields signal a bug or attack.
- \`.catchall(z.unknown())\` — passthrough but with type \`{[k:string]: unknown}\` instead of just adding to the inferred type opaquely.

**Gotcha:** When a \`.catchall\` schema is set, the \`unknownKeys\` mode is *ignored* — the catchall path runs unconditionally, validating every extra key against the catchall schema. \`.strict().catchall(z.string())\` does *not* error on extras; it validates them as strings. If you want strict-but-only-for-known-keys, don't combine with catchall. The other gotcha: extras are detected via \`for (const key in ctx.data)\` which walks the prototype chain — same caveat as \`z.record\`. Sanitize your inputs.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'catchall', 'strict', 'passthrough', 'strip'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'z.pipeline: chain transforms with proper input/output type inference',
    body: `\`z.pipeline(A, B)\` (or \`A.pipe(B)\`) parses input through \`A\` first, then feeds the result into \`B\`. Unlike \`.transform()\` which only attaches a function, pipeline lets you chain *full schemas*:

\`\`\`ts
export class ZodPipeline<A extends ZodTypeAny, B extends ZodTypeAny> extends ZodType<
  B["_output"],
  ZodPipelineDef<A, B>,
  A["_input"]
> {
  _parse(input: ParseInput): ParseReturnType<any> {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx });
        if (inResult.status === "aborted") return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        }
        return this._def.out._parseAsync({ data: inResult.value, path: ctx.path, parent: ctx });
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({...});
      if (inResult.status === "aborted") return INVALID;
      if (inResult.status === "dirty") { status.dirty(); return { status: "dirty", value: inResult.value }; }
      return this._def.out._parseSync({ data: inResult.value, path: ctx.path, parent: ctx });
    }
  }
}
\`\`\`

The TS contract is exact: input type comes from \`A["_input"]\`, output type comes from \`B["_output"]\`. Errors from either stage land in the same \`ctx.common.issues\` array.

**The classic use case:** \`z.string().transform(s => Number(s)).pipe(z.number().positive())\`. Without pipeline, you'd have to put the \`positive()\` check inside the transform via \`.refine\`, which doesn't compose. With pipeline, you have a real \`z.number().positive()\` schema after the transform, and you can \`.pipe(z.number().int().min(1))\` further if you want.

**Gotcha 1:** When \`A\` parses dirty (validation issues but not aborted), the dirty value is still passed to \`B\`. Both stages can produce issues for the same input. This usually surfaces as "two error messages for one bad input" — fine for UX, surprising during debugging.

**Gotcha 2:** Pipeline doesn't preserve \`ZodObject\` methods. Once you \`.pipe()\`, the result is a \`ZodPipeline\`, not the original object — no \`.shape\`, \`.pick\`, \`.partial\`, etc. Apply pipeline as the *last* step after all object surgery is done.

**Gotcha 3:** Async-ness propagates: if either A or B is async, the entire pipe is async-only. Same gotcha as async refinements.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'pipe', 'pipeline', 'composition'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'ZodObject._cached: per-instance shape memoization for parse hot paths',
    body: `Every \`ZodObject\` parse call walks every key in the shape. To avoid re-materializing the shape thunk and recomputing the keys on every parse, \`ZodObject\` caches both:

\`\`\`ts
export class ZodObject<...> extends ZodType<...> {
  _cached: { shape: T; keys: string[] } | null = null;

  _getCached(): { shape: T; keys: string[] } {
    if (this._cached !== null) return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }

  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    // ...
    const { shape, keys: shapeKeys } = this._getCached();
    // ...iterate shapeKeys
  }
}
\`\`\`

\`ZodEnum\` and \`ZodNativeEnum\` do the same trick with a Set:

\`\`\`ts
export class ZodEnum<...> extends ZodType<...> {
  _cache: Set<T[number]> | undefined;
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    // ...
    if (!this._cache) this._cache = new Set(this._def.values);
    if (!this._cache.has(input.data)) { /* invalid_enum_value */ }
    return OK(input.data);
  }
}
\`\`\`

The cache is per-instance, so two object schemas with the same shape don't share a cache.

**Gotcha 1:** The cache invalidates if you mutate \`_def.shape\` (you shouldn't, but some metaprogramming code does). Methods like \`.extend\` / \`.merge\` / \`.pick\` / \`.omit\` create new \`ZodObject\` instances with fresh caches — they don't mutate the original.

**Gotcha 2:** Performance impact: a 30-key object schema parsed in a hot loop benefits significantly from this cache (the alternative would be calling \`Object.keys(shape)\` per parse). But it also means schemas built via \`z.lazy(() => z.object({...}))\` have their cache *per call to the getter* — if your getter constructs a fresh object each time (instead of returning a hoisted const), the cache gets thrown away on every parse. Always hoist lazy schemas.

**Gotcha 3:** \`safeParse\` and \`parse\` share the cache — they're literally the same code path. Switching between them has no perf impact. The only performance levers are: discriminated unions over plain unions, hoisted lazy schemas, and \`.strict()\` over \`.passthrough()\` for less work per extra key.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'performance', 'cache', 'hot-path'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'ZodError.format() vs .flatten(): two error shapes for two consumer styles',
    body: `Both methods accept an optional \`mapper\` from \`ZodIssue\` to your error type. They differ in shape:

\`\`\`ts
flatten<U = string>(mapper: (issue: ZodIssue) => U = (issue) => issue.message as any): any {
  const fieldErrors: any = Object.create(null);
  const formErrors: U[] = [];
  for (const sub of this.issues) {
    if (sub.path.length > 0) {
      const firstEl = sub.path[0]!;
      fieldErrors[firstEl] = fieldErrors[firstEl] || [];
      fieldErrors[firstEl].push(mapper(sub));
    } else {
      formErrors.push(mapper(sub));
    }
  }
  return { formErrors, fieldErrors };
}

format(_mapper?: any) {
  const mapper = _mapper || ((issue: ZodIssue) => issue.message);
  const fieldErrors: ZodFormattedError<T> = { _errors: [] } as any;
  const processError = (error: ZodError) => {
    for (const issue of error.issues) {
      if (issue.code === "invalid_union") issue.unionErrors.map(processError);
      else if (issue.code === "invalid_return_type") processError(issue.returnTypeError);
      else if (issue.code === "invalid_arguments") processError(issue.argumentsError);
      else if (issue.path.length === 0) (fieldErrors as any)._errors.push(mapper(issue));
      else {
        let curr: any = fieldErrors;
        let i = 0;
        while (i < issue.path.length) {
          const el = issue.path[i]!;
          const terminal = i === issue.path.length - 1;
          if (!terminal) curr[el] = curr[el] || { _errors: [] };
          else { curr[el] = curr[el] || { _errors: [] }; curr[el]._errors.push(mapper(issue)); }
          curr = curr[el];
          i++;
        }
      }
    }
  };
  processError(this);
  return fieldErrors;
}
\`\`\`

\`flatten\` only looks at the *first* path element — \`["a", "b", 0, "name"]\` becomes \`fieldErrors.a\`. Good for top-level form fields, useless for nested objects.

\`format\` builds a full nested tree mirroring the schema shape, with \`_errors\` arrays at every level. It also recurses into \`invalid_union\`, \`invalid_arguments\`, and \`invalid_return_type\` issues to flatten nested ZodErrors into the same tree.

**Gotcha 1:** \`flatten\`'s \`fieldErrors\` is \`Object.create(null)\` — no prototype. \`fieldErrors.toString\` is \`undefined\`, not the Object prototype's toString. Mostly fine, but if you spread it into a context that expects a real object, JSON.stringify works but Object.assign(otherObj, fieldErrors) loses anything that relies on prototype lookup.

**Gotcha 2:** \`format\` over a nested schema with array fields produces \`_errors\` arrays at numeric keys (not real JS arrays). \`output.items[0]._errors\` works, but \`Array.isArray(output.items)\` is \`false\`. For UI rendering, walk the structure recursively — don't assume Array methods work on numbered branches.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'zod-error', 'error-formatting', 'flatten', 'format'],
    repository: repo,
    filePath: 'packages/zod/src/v3/ZodError.ts',
    url: url('packages/zod/src/v3/ZodError.ts'),
  },
  {
    title: 'z.custom<T>(): the typed escape hatch for "validate but trust me on the type"',
    body: `\`z.custom<T>(check)\` produces a schema with output type \`T\`, runtime validation via your \`check\` function, and zero structural inference. It's how you type-assert a schema for things Zod doesn't natively model (Buffer, File, RegExp, third-party class instances):

\`\`\`ts
export function custom<T>(
  check?: (data: any) => any,
  _params: string | CustomParams | ((input: any) => CustomParams) = {},
  fatal?: boolean
): ZodType<T, ZodTypeDef, T> {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r) => {
          if (!r) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
\`\`\`

It's literally \`z.any().superRefine(check)\` with the type cast as \`ZodType<T>\`. Notable: the default \`fatal: true\` means a failed custom check aborts further parsing — opposite of \`.refine\`'s default.

**Why it's powerful:** \`z.custom<File>(v => v instanceof File)\` gives you a schema typed as \`File\` with a runtime check. \`z.infer<typeof schema>\` returns \`File\`. No need to structurally describe File's properties.

**Gotcha 1:** The type \`T\` is *unchecked*. \`z.custom<{ id: string }>(v => true)\` produces a schema typed as \`{ id: string }\` that accepts literally anything at runtime, including \`null\`. The compiler can't help you — the burden is on the \`check\` function. People often write \`z.custom<MyType>(v => v != null)\` and then crash three layers up because the structure didn't match.

**Gotcha 2:** Without a check (\`z.custom<T>()\`), it's just \`z.any()\` cast to \`T\` — no validation at all. Useful for stub schemas during development; dangerous in production.

**Gotcha 3:** Async checks work (the function detects \`r instanceof Promise\`), but as with all async refinements, the entire schema becomes async-only — and \`z.custom\` doesn't surface this in the type system, so the failure mode (sync \`parse()\` throws "encountered Promise") is at runtime.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'z-custom', 'type-assertion', 'escape-hatch'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'z.string().regex(): how check.regex.lastIndex = 0 prevents stateful surprises',
    body: `\`z.string().regex(pattern)\` adds a \`{ kind: "regex", regex }\` check that runs in the string parser. The implementation has a critical defensive line:

\`\`\`ts
} else if (check.kind === "regex") {
  check.regex.lastIndex = 0;
  const testResult = check.regex.test(input.data);
  if (!testResult) {
    ctx = this._getOrReturnCtx(input, ctx);
    addIssueToContext(ctx, {
      validation: "regex",
      code: ZodIssueCode.invalid_string,
      message: check.message,
    });
    status.dirty();
  }
}
\`\`\`

The \`lastIndex = 0\` reset is necessary because JavaScript's \`/g\` and \`/y\` flagged regexes are *stateful* — \`.test()\` advances \`lastIndex\` and the next call starts from where the last one stopped. Without the reset, a \`/^\\d+$/g\` schema would alternate true/false on the same input string across consecutive parses.

\`\`\`ts
const r = /^\\d+$/g;
r.test("123"); // true, lastIndex now 3
r.test("123"); // false! starts at index 3, no match
\`\`\`

The \`.regex\` method is a thin wrapper:

\`\`\`ts
regex(regex: RegExp, message?: errorUtil.ErrMessage) {
  return this._addCheck({
    kind: "regex",
    regex: regex,
    ...errorUtil.errToObj(message),
  });
}
\`\`\`

**Gotcha 1:** Even with the lastIndex reset, sharing a single \`RegExp\` instance across schemas is risky if any *other* code mutates \`lastIndex\` between parses (concurrent usage, recursive calls). Best practice: pass a literal \`/.../\` to \`z.string().regex(...)\` so it's freshly constructed; for dynamic patterns, \`new RegExp(source)\` per schema construction.

**Gotcha 2:** Failed regex checks emit \`code: "invalid_string"\` with \`validation: "regex"\` — *not* \`code: "custom"\`. If your error formatter switches on \`code\` to render messages, regex failures look like email/URL/UUID failures, not refinements. Use the \`message\` parameter to give a user-facing string: \`z.string().regex(/^[a-z]+$/, "Lowercase letters only")\`.

**Gotcha 3:** Multiple \`.regex\` calls stack — both checks run, both can fail, both produce separate issues. \`z.string().regex(/A/).regex(/B/)\` requires both A and B to match. There's no built-in "any of these" — use \`z.union([z.string().regex(/A/), z.string().regex(/B/)])\` for that.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'regex', 'string-validation', 'lastindex'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
  {
    title: 'z.never() vs z.undefined() vs z.void(): when each appears in inferred types',
    body: `Three "empty" types with different semantics. The implementations are minimal and the differences live in *how they appear in inferred types*.

\`\`\`ts
export class ZodUndefined extends ZodType<undefined, ZodUndefinedDef, undefined> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) { /* invalid_type */ }
    return OK(input.data);
  }
}

export class ZodNever extends ZodType<never, ZodNeverDef, never> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType,
    });
    return INVALID;
  }
}

export class ZodVoid extends ZodType<void, ZodVoidDef, void> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) { /* invalid_type */ }
    return OK(input.data);
  }
}
\`\`\`

- \`z.undefined()\` — accepts only the literal \`undefined\`, output type is \`undefined\`. Use as the value for "this field must be missing" — e.g. as a discriminated-union variant.
- \`z.never()\` — rejects everything. Output type is \`never\`. Used as the *default* \`catchall\` in \`ZodObject\`, which is how the strict/strip/passthrough branching works (the catchall is checked via \`instanceof ZodNever\`).
- \`z.void()\` — at parse time identical to \`z.undefined()\` (both check for parsedType undefined). The difference is the output type \`void\` vs \`undefined\`. Use for function return types where you don't care about the return value.

**Gotcha 1:** \`z.never()\` as a field type — \`z.object({ foo: z.never() })\` — means "this field must not be present" because *any* value (including undefined!) for \`foo\` triggers the never check, which fails. To say "must be undefined," use \`z.undefined()\`.

**Gotcha 2:** \`z.void()\` and \`z.undefined()\` differ in TS-emitted assignability. A function typed \`() => void\` accepts implementations that return any value (the return is just ignored). A function typed \`() => undefined\` requires the implementation to literally return undefined. \`z.function([], z.void())\` is more permissive than \`z.function([], z.undefined())\`.

**Gotcha 3:** The \`ZodObject\` strict/strip/passthrough modes only apply when \`catchall instanceof ZodNever\`. If you call \`.catchall(z.unknown())\`, the unknown-keys mode is *ignored* — see the catchall entry. \`ZodNever\` is doing double duty as the "no catchall" sentinel.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['zod', 'typescript', 'never', 'undefined', 'void', 'empty-types'],
    repository: repo,
    filePath: 'packages/zod/src/v3/types.ts',
    url: url('packages/zod/src/v3/types.ts'),
  },
];
