/**
 * Batch github-023-drizzle-orm
 *
 * 25 entries on Drizzle ORM patterns + internals, sourced from the
 * actual `drizzle-team/drizzle-orm` repo (cloned at /tmp/oss/drizzle-orm).
 * Every filePath here was verified to exist; quoted snippets come from
 * those files. Each entry pairs the public surface (pgTable, eq,
 * onConflictDoUpdate, ...) with the implementation file that defines it,
 * plus a non-obvious gotcha drawn from the source.
 */

import type { SeedItem } from '../types';

const drizzle = { owner: 'drizzle-team', name: 'drizzle-orm' };

export const BATCH: SeedItem[] = [
  {
    title: 'pgTable() — schema definition is just a typed factory over PgColumnBuilder',
    body: `\`pgTable('users', { ... })\` looks declarative, but at runtime it's a builder pipeline. Drizzle constructs a \`PgTable\` instance, then iterates the columns object twice: once to build the real columns bound to the table, and once to build "extra config columns" used for index/check/unique definitions.

\`\`\`ts
const builtColumns = Object.fromEntries(
  Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
    const colBuilder = colBuilderBase as PgColumnBuilder;
    colBuilder.setName(name);
    const column = colBuilder.build(rawTable);
    rawTable[InlineForeignKeys].push(...colBuilder.buildForeignKeys(column, rawTable));
    return [name, column];
  }),
) as unknown as BuildColumns<TTableName, TColumnsMap, 'pg'>;
\`\`\`

The \`InlineForeignKeys\` symbol collects FKs declared via \`.references(() => other.id)\` so they end up on the parent table without needing a separate \`foreignKey()\` block.

The third argument has two shapes — an object (deprecated) and an array (current). The deprecated overload is still exported with a giant \`@deprecated\` JSDoc:

\`\`\`ts
// New API (use this)
export const users = pgTable("users", {
  id: integer(),
}, (t) => [
  index('custom_name').on(t.id)
]);
\`\`\`

Why does it matter? Drizzle picks an entirely different internal codepath based on the return type. If you mix object + array (e.g., spread an array into an object), neither path runs and your indexes silently disappear from the generated migration. Always return a flat array.

Gotcha: \`pgTable\` itself does no SQL escaping. \`PgTableExtraConfigValue\` accepts \`AnyIndexBuilder | CheckBuilder | ForeignKeyBuilder | PrimaryKeyBuilder | UniqueConstraintBuilder | PgPolicy\` — anything else (a stray \`sql\`...\`\` chunk, a custom builder) is silently dropped. The compiler catches most cases, but \`as any\` will swallow it, leading to "why isn't my unique constraint there?" hunts in production.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'pgtable', 'schema', 'postgres'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/pg-core/table.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/table.ts',
  },
  {
    title: 'serial() — an int4 with hasDefault and notNull baked into the builder',
    body: `\`serial()\` is the smallest column type in the Drizzle codebase, but it shows the entire column-builder pattern. It returns a \`PgSerialBuilder\` whose constructor pre-flips two flags:

\`\`\`ts
constructor(name: T['name']) {
  super(name, 'number', 'PgSerial');
  this.config.hasDefault = true;
  this.config.notNull = true;
}
\`\`\`

Those two booleans propagate up into the public type as \`NotNull<HasDefault<...>>\`, which is what makes \`serial('id').primaryKey()\` work without you having to write \`.notNull()\`.

The SQL output is delegated to a one-liner:

\`\`\`ts
getSQLType(): string {
  return 'serial';
}
\`\`\`

That string is what \`drizzle-kit generate\` writes into your migration as \`"id" serial\`. Postgres then expands it to \`integer NOT NULL DEFAULT nextval(...)\` server-side.

The non-obvious gotcha: because \`hasDefault\` is set in the builder itself, the type signature of \`db.insert(users).values({ ... })\` makes \`id\` optional even though the underlying column is \`NOT NULL\`. If you try to mix \`bigserial\` and \`serial\` across tables and rely on \`InferInsertModel\` to detect required keys, only the \`hasDefault\` flag matters — Drizzle doesn't introspect the actual SQL type. So a \`PgCustomColumn\` with \`default: true\` in its CustomTypeValues will look identical to \`serial\` from the type system's perspective. That bites you when you change the underlying type and forget to update the generic.

Second gotcha: \`serial\` uses a 4-byte int. On a high-write table you can exhaust the 2.1B positive range surprisingly fast — every failed insert (constraint violation, rolled-back transaction) still consumes the sequence. Production-grade tables should default to \`bigserial\` (which has the same builder shape but maps to \`bigint\` under the hood) or \`uuid().defaultRandom()\` for tables with multi-region writes.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'serial', 'columns', 'postgres'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/pg-core/columns/serial.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/columns/serial.ts',
  },
  {
    title: 'varchar({ length, enum }) — typed string unions without a separate enum',
    body: `\`varchar\` accepts both a length and a TS-side enum. The enum part is the underrated feature — it gives you a string-union type without needing a real Postgres enum:

\`\`\`ts
export interface PgVarcharConfig<
  TEnum extends readonly string[] | string[] | undefined,
  TLength extends number | undefined,
> {
  enum?: TEnum;
  length?: TLength;
}
\`\`\`

\`\`\`ts
status: varchar('status', { length: 16, enum: ['draft', 'published', 'archived'] })
// inferred select type: 'draft' | 'published' | 'archived'
\`\`\`

The SQL emitter is intentionally dumb:

\`\`\`ts
getSQLType(): string {
  return this.length === undefined ? \`varchar\` : \`varchar(\${this.length})\`;
}
\`\`\`

Notice what's missing: nothing about the enum lands in the migration. \`enum\` is a pure type-level constraint enforced by TypeScript on \`insert\`/\`update\` values. The database happily stores \`'banana'\` if anything bypasses Drizzle.

Gotcha: this is great for small, stable status enums and dangerous for anything else. There is no \`CHECK\` constraint generated, no validation at the driver level, and no ALTER on the column when you add or remove an enum value — only your TS type changes. If you need the database to enforce the set, reach for \`pgEnum()\` (which generates a real \`CREATE TYPE\`) or add a \`check()\` constraint in the table's extraConfig array. A common compromise on hot tables: \`varchar({ enum })\` for the type narrowing, plus a partial index \`where status = 'pending'\` so the planner still benefits.

Second gotcha: when you remove a value from the enum array on the TS side, all existing rows that hold the now-removed value still load — Drizzle does not validate inbound strings against \`enumValues\`. The compiler will then complain at the call site that it is getting an unexpected literal, but only if you have enabled strict null/literal checks. Treat enum removals as data migrations, not schema migrations.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'varchar', 'enum', 'columns'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/pg-core/columns/varchar.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/columns/varchar.ts',
  },
  {
    title: 'text({ enum }) — same enum trick as varchar, no length cap',
    body: `\`text()\` is structurally identical to \`varchar()\` but without the \`length\` config — Postgres treats \`text\` and \`varchar\` the same internally, so the only meaningful difference for Drizzle is type plumbing:

\`\`\`ts
export interface PgTextConfig<
  TEnum extends readonly string[] | string[] | undefined,
> {
  enum?: TEnum;
}

export class PgText<T extends ColumnBaseConfig<'string', 'PgText'>>
  extends PgColumn<T, { enumValues: T['enumValues'] }>
{
  override readonly enumValues = this.config.enumValues;

  getSQLType(): string {
    return 'text';
  }
}
\`\`\`

Use \`text({ enum: [...] as const })\` for any enum-shaped string that has no length pressure: roles, providers, regions, log levels. The inferred type narrows to the union; the column at the SQL layer stays a plain \`text\`, so adding a value later is a one-line schema change with no migration on the underlying column.

Gotcha: the \`as const\` (or \`Writable<T>\`) on the array is load-bearing. Without it, TypeScript widens the array to \`string[]\` and you lose the union — \`status: 'banana'\` becomes valid again. Drizzle's overloads accept \`Readonly<[U, ...U[]]>\` precisely so a \`const\`-asserted array is preserved as a tuple, but you get no warning if you forgot the assertion. If you find yourself debugging "why is this typed as string?" — that's almost always the cause.

Second gotcha: \`text\` and \`varchar(n)\` have effectively identical performance in modern Postgres — \`varchar(n)\` does NOT pre-allocate storage, and the only difference is the optional length check. Do not pick \`varchar(255)\` because it feels safer. If your data has a real domain bound, use \`varchar(n)\` to enforce it. Otherwise \`text\` is the better default and you avoid an awkward migration when 256-character inputs eventually appear.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'text', 'enum', 'columns'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/pg-core/columns/text.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/columns/text.ts',
  },
  {
    title: 'jsonb() — JSON.stringify on write, lenient JSON.parse on read',
    body: `Drizzle's \`jsonb\` column type is a thin layer on top of \`PgColumn\`. The interesting bits are the driver mappers:

\`\`\`ts
override mapToDriverValue(value: T['data']): string {
  return JSON.stringify(value);
}

override mapFromDriverValue(value: T['data'] | string): T['data'] {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value as T['data'];
    }
  }
  return value;
}
\`\`\`

\`mapToDriverValue\` always stringifies — so you can pass \`{ foo: 'bar' }\`, an array, a number, or \`null\` and Drizzle hands a JSON string to the driver. Postgres parses it server-side into proper \`jsonb\`.

\`mapFromDriverValue\` does something subtle: most pg clients (\`pg\`, \`postgres\`, neon) already parse \`jsonb\` to a JS object via the row parser, so \`value\` arrives as the parsed object and the function short-circuits. But if some driver hands back a string — neon http used to in certain cases, and some serverless adapters do — Drizzle silently \`JSON.parse\`s it. If parsing fails, it returns the raw string instead of throwing.

Gotcha 1: that lenient \`catch\` means a corrupted row won't crash your read path, but it will arrive in your code as a \`string\` even though TypeScript thinks it's \`T\`. If you want strictness, use \`.$type<MyType>()\` plus a Zod \`.parse()\` after every read.

Gotcha 2: passing a \`Date\` object into \`jsonb\` ends up as an ISO string after \`JSON.stringify\`, but on the way back out you get the string — not a Date — because there's no schema-driven revival. Use \`json: jsonb().$type<{ at: string }>()\` and convert at the boundary.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'jsonb', 'columns', 'postgres'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/pg-core/columns/jsonb.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/columns/jsonb.ts',
  },
  {
    title: 'timestamp({ mode, withTimezone, precision }) — Date vs string and the +0000 hack',
    body: `\`timestamp()\` returns one of two builders depending on \`mode\`:

\`\`\`ts
if (config?.mode === 'string') {
  return new PgTimestampStringBuilder(name, config.withTimezone ?? false, config.precision);
}
return new PgTimestampBuilder(name, config?.withTimezone ?? false, config?.precision);
\`\`\`

The default \`mode: 'date'\` returns JS \`Date\` objects. The mapper is doing more than it looks:

\`\`\`ts
override mapFromDriverValue(value: Date | string): Date {
  if (typeof value === 'string') return new Date(this.withTimezone ? value : value + '+0000');
  return value;
}

override mapToDriverValue = (value: Date): string => {
  return value.toISOString();
};
\`\`\`

The \`'+0000'\` suffix is the load-bearing line: Postgres' \`timestamp\` (without time zone) returns strings like \`'2024-01-15 14:30:00'\` with no offset. \`new Date('2024-01-15 14:30:00')\` would be parsed in the runtime's local time zone — making your reads dependent on TZ env config. By appending \`+0000\` Drizzle forces UTC interpretation, which matches what the column actually stored.

\`mode: 'string'\` keeps the value as a string and avoids any Date conversion — useful when you need byte-for-byte round-trips, or when your runtime can't represent sub-millisecond precision.

Gotcha: \`defaultNow()\` (defined on \`PgDateColumnBaseBuilder\`) emits \`now()\`, not \`current_timestamp\`, and not \`new Date()\` evaluated in JS. Don't reach for \`$defaultFn(() => new Date())\` unless you actively want the app server's clock — \`defaultNow()\` is what you want for "set on insert" semantics so all rows agree on the database clock even under clock skew.

Third gotcha: precision matters for sub-second event ordering. \`timestamp({ precision: 6 })\` gives microseconds; the default of \`null\` in Postgres also means microseconds, but Drizzle emits the precision into DDL when set, which can prevent silent precision drift between environments. JS \`Date\` only has millisecond resolution — round-tripping a microsecond-precision timestamp through \`mode: date\` truncates the trailing three digits.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'timestamp', 'columns', 'timezone'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/pg-core/columns/timestamp.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/columns/timestamp.ts',
  },
  {
    title: 'uuid().defaultRandom() — sql\\`gen_random_uuid()\\` shortcut',
    body: `\`uuid()\` is a one-method-of-note class — \`defaultRandom()\` just wraps \`.default()\` with a SQL template literal:

\`\`\`ts
defaultRandom(): ReturnType<this['default']> {
  return this.default(sql\`gen_random_uuid()\`) as ReturnType<this['default']>;
}
\`\`\`

So \`id: uuid('id').primaryKey().defaultRandom()\` generates a column with \`DEFAULT gen_random_uuid()\` in the migration. The actual UUID is produced server-side by Postgres' built-in (since 13) — no \`pgcrypto\` extension needed.

Why this matters: \`gen_random_uuid()\` returns a v4 UUID. There is no built-in helper in Drizzle for v7 (time-ordered, much friendlier to btree indexes). For v7 you write your own:

\`\`\`ts
import { sql } from 'drizzle-orm';
id: uuid().primaryKey().default(sql\`uuidv7()\`)  // requires the extension
\`\`\`

…or generate client-side with \`$defaultFn(() => uuidv7())\` and skip the SQL default entirely.

Gotcha: if you mix client-generated UUIDs with \`defaultRandom()\` on the same column, behaviour is fine — Drizzle only fills in the default when you omit the field on insert. But if you migrate from \`defaultRandom()\` to a client-side \`$defaultFn\`, drop the SQL default in a follow-up migration. Otherwise old rows inserted by external services or psql shells keep getting v4s while your app generates v7s, and your index ordering quietly degrades back to random.

Second gotcha: UUIDs as primary keys are slower than serials for inserts and indexes — the random distribution causes btree fragmentation. Postgres fillfactor stays low, autovacuum runs more often, and joins are slightly larger. v7 (time-ordered) UUIDs fix the fragmentation but not the size. For internal-only tables where you do not need uncoordinated writes, \`serial\` or \`bigserial\` is still the better choice. Use UUIDs when you actually need them — public APIs, multi-region inserts, or merge-from-offline workflows.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'uuid', 'columns', 'postgres'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/pg-core/columns/uuid.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/columns/uuid.ts',
  },
  {
    title: '.default() vs .$defaultFn() — SQL-side vs JS-side defaults and what migrations see',
    body: `Two different "default" mechanisms live on \`PgColumnBuilder\`. The distinction matters for migrations:

\`\`\`ts
default(value: ... | SQL): HasDefault<this> {
  this.config.default = value;
  this.config.hasDefault = true;
  return this as HasDefault<this>;
}

$defaultFn(
  fn: () => ... | SQL,
): HasRuntimeDefault<HasDefault<this>> {
  this.config.defaultFn = fn;
  this.config.hasDefault = true;
  return this as HasRuntimeDefault<HasDefault<this>>;
}
\`\`\`

\`.default(sql\`now()\`)\` lands in the SQL: \`drizzle-kit\` generates \`DEFAULT now()\` in the CREATE TABLE. Any insert that omits the column — including from psql or another service — gets that default.

\`.$defaultFn(() => crypto.randomUUID())\` does NOT land in the SQL. Drizzle calls it in JS at insert time and supplies the value. There's even a comment in the source: "This value does not affect the \`drizzle-kit\` behavior, it is only used at runtime in \`drizzle-orm\`."

\`\$onUpdateFn\` is the third variant — fires on update (and on insert if no other default exists). Used for \`updatedAt\` triggers without database triggers.

Gotcha 1: rows inserted from outside Drizzle (raw SQL, another microservice, a CSV import) get NO default if you used \`$defaultFn\`. The column is still \`NOT NULL\` per its type, and the insert fails. People hit this when they migrate from an ORM-based seed script to a SQL one and rows start failing to insert.

Gotcha 2: \`.default(sql\`now()\`)\` evaluates on the database; \`$defaultFn(() => new Date())\` evaluates on the application. Under heavy concurrency, "rows in the same transaction get the same timestamp" only holds with the SQL form.

Third gotcha: \`$defaultFn\` runs once per row at insert time, even for bulk \`values([...])\` calls — it is not memoized. If you use it for IDs (\`$defaultFn(() => ulid())\`), the function fires for every element in the array, which is what you want. But if you use it for \`createdAt: $defaultFn(() => new Date())\`, every row in a batch insert gets a slightly different timestamp. Use \`sql\\\`now()\\\`\` for batch-coherent timestamps.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'default', 'columns', 'sql-template'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/column-builder.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/column-builder.ts',
  },
  {
    title: 'relations() — declarative joins for the relational query API',
    body: `\`relations()\` is the entry point for Drizzle's relational query builder (\`db.query.users.findMany({ with: { posts: true } })\`). It returns a \`Relations\` instance that pairs a table with a config function:

\`\`\`ts
export function relations<
  TTableName extends string,
  TRelations extends Record<string, Relation<any>>,
>(
  table: AnyTable<{ name: TTableName }>,
  relations: (helpers: TableRelationsHelpers<TTableName>) => TRelations,
): Relations<TTableName, TRelations> {
  return new Relations<TTableName, TRelations>(
    table,
    (helpers) =>
      Object.fromEntries(
        Object.entries(relations(helpers)).map(([key, value]) => [
          key,
          value.withFieldName(key),
        ]),
      ) as TRelations,
  );
}
\`\`\`

The \`helpers\` object exposes \`one\` and \`many\`. \`one(table, { fields, references })\` is the FK-side declaration; \`many(table)\` is the inverse. The library detects nullability automatically — from \`createOne\`:

\`\`\`ts
(config?.fields.reduce<boolean>((res, f) => res && f.notNull, true) ?? false)
\`\`\`

If every field in the FK is \`notNull\`, the relation is non-nullable in the result type. One nullable field flips it.

Gotcha: \`relations()\` is purely a Drizzle-side construct. It generates NO \`FOREIGN KEY\` constraint in your migration — that's what \`.references(() => parent.id)\` on the column does. Defining the relation without the column-level reference works for queries but leaves the database with no referential integrity. Conversely, defining the column reference without \`relations()\` works for SQL but \`db.query.foo.findMany({ with: { bar: true } })\` won't compile. You usually want both.

Second gotcha: many-to-many relations need a junction table with TWO \`one()\` relations on it (one to each side), plus a \`many()\` on each end pointing to the junction. Drizzle has no shorthand. The relational-query builder traverses the junction in two hops, which generates a slightly less efficient SQL than a hand-rolled JOIN — for hot read paths, dropping down to \`db.select().from(...).innerJoin(junction, ...).innerJoin(other, ...)\` is worth the extra typing.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'relations', 'foreign-keys', 'query-api'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/relations.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/relations.ts',
  },
  {
    title: 'and() / or() — undefined-conditions are silently filtered',
    body: `\`and()\` and \`or()\` from \`sql/expressions/conditions.ts\` are designed to be friendly to dynamic query construction. They accept \`(SQLWrapper | undefined)[]\` and discard the \`undefined\`s:

\`\`\`ts
export function and(
  ...unfilteredConditions: (SQLWrapper | undefined)[]
): SQL | undefined {
  const conditions = unfilteredConditions.filter(
    (c): c is Exclude<typeof c, undefined> => c !== undefined,
  );
  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return new SQL(conditions);
  return new SQL([
    new StringChunk('('),
    sql.join(conditions, new StringChunk(' and ')),
    new StringChunk(')'),
  ]);
}
\`\`\`

This is a feature, not a bug. It's why dynamic where-builders are clean:

\`\`\`ts
const where = and(
  eq(posts.published, true),
  q.author ? eq(posts.authorId, q.author) : undefined,
  q.search ? ilike(posts.title, \`%\${q.search}%\`) : undefined,
);
db.select().from(posts).where(where);
\`\`\`

If all filters are absent, \`and()\` returns \`undefined\` and \`.where(undefined)\` becomes a no-op. Single condition gets unwrapped (no extra parens). Multiple conditions get wrapped in \`(... and ...)\` so operator precedence with an outer \`or\` still works.

Gotcha: this only filters \`undefined\` — \`null\` and \`false\` are not filtered. If you write \`and(maybe && eq(...))\`, when \`maybe\` is \`false\` you pass \`false\` as a condition, which is NOT a \`SQLWrapper\` and the type system rejects it (or, with \`as any\`, you get malformed SQL). Always use ternaries returning \`undefined\`, never short-circuit booleans.

Second gotcha: \`and()\` with no arguments returns \`undefined\`, not \`sql\\\`true\\\`\`. If your code path expects a SQL fragment (always pass something to \`.where\`), you will silently lose the WHERE clause and select every row. The Drizzle convention is to let \`where(undefined)\` be a no-op — but if you build raw SQL elsewhere with \`and()\` results, defensively coerce: \`where: filter ?? sql\\\`true\\\`\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'where', 'conditions', 'and', 'or'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/sql/expressions/conditions.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/sql/expressions/conditions.ts',
  },
  {
    title: 'inArray([]) returns sql\\`false\\` — empty arrays do NOT throw',
    body: `\`inArray\` is overloaded for columns, aliased SQL, and arbitrary SQLWrappers, but they all funnel into one runtime check:

\`\`\`ts
export function inArray(
  column: SQLWrapper,
  values: ReadonlyArray<unknown | Placeholder> | SQLWrapper,
): SQL {
  if (Array.isArray(values)) {
    if (values.length === 0) {
      return sql\`false\`;
    }
    return sql\`\${column} in \${values.map((v) => bindIfParam(v, column))}\`;
  }
  return sql\`\${column} in \${bindIfParam(values, column)}\`;
}
\`\`\`

The \`values.length === 0 → sql\\\`false\\\`\` branch is the kind of decision that prevents exactly one bug: \`SELECT ... WHERE x IN ()\` is a syntax error in Postgres. Drizzle short-circuits to a literal \`false\` which is always-empty but valid.

That means this is safe:

\`\`\`ts
const ids: number[] = await getIdsFromUpstream();  // could be []
const rows = await db.select().from(items).where(inArray(items.id, ids));
\`\`\`

Empty \`ids\` returns no rows, no exception.

Gotcha: the same isn't true if you build the query manually with \`sql\`\${col} in \${arr}\`\`. The template literal would expand the empty array to nothing and you'd get \`WHERE x in\` followed by EOF. Always reach for \`inArray\` over a hand-rolled \`IN\` template.

Second gotcha: when \\\`values\\\` is a \\\`SQLWrapper\\\` (a subquery), the empty-check doesn't fire — the subquery is the source of truth at execution time. So \\\`inArray(col, db.select(...).from(...))\\\` works as expected even if the subquery returns zero rows.

Third gotcha: \`notInArray([])\` returns \`sql\\\`true\\\`\` — the inverse of the empty-array case for \`inArray\`. That means \`notInArray(col, userBlocklist)\` with an empty blocklist returns ALL rows, which is usually what you want. But if you have inverted the logic in your head and expected zero rows from an empty exclusion list, you will be surprised. Always read the source for \`notInArray\` (same file, a few lines below) when relying on the empty-array semantics.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'inarray', 'where', 'edge-cases'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/sql/expressions/conditions.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/sql/expressions/conditions.ts',
  },
  {
    title: 'leftJoin / innerJoin / rightJoin / fullJoin — all share createJoin()',
    body: `Drizzle's join methods on \`PgSelect\` are not separate implementations — they're partial applications of a single internal factory:

\`\`\`ts
leftJoin = this.createJoin('left', false);
leftJoinLateral = this.createJoin('left', true);

rightJoin = this.createJoin('right', false);

innerJoin = this.createJoin('inner', false);
innerJoinLateral = this.createJoin('inner', true);

fullJoin = this.createJoin('full', false);

crossJoin = this.createJoin('cross', false);
crossJoinLateral = this.createJoin('cross', true);
\`\`\`

The first arg is the join type, the second is a lateral flag. The shape of the result row changes based on the join type — Drizzle tracks nullability per joined table in \`joinsNotNullableMap\`, and the public type system reflects that. After a \`leftJoin(posts, ...)\`, \`row.posts\` is typed as \`Post | null\` because rows on the left side might not have a match.

Usage:

\`\`\`ts
const rows = await db.select()
  .from(users)
  .leftJoin(posts, eq(users.id, posts.authorId))
  .innerJoin(comments, eq(posts.id, comments.postId));
// rows[0].posts: Post | null     (left join)
// rows[0].comments: Comment      (inner join — never null)
\`\`\`

Gotcha 1: \`select()\` with no argument after joins gives you a nested object \`{ users, posts, comments }\` per row — not a flattened row. To flatten, pass an explicit selection: \`select({ userName: users.name, postTitle: posts.title })\`.

Gotcha 2: \`fullJoin\` makes BOTH sides nullable, which means even \`users.id\` might be \`null\` in the result. The type system enforces this — your downstream code has to handle the case, even when business logic says it can't happen.

Third gotcha: chained joins compose left-to-right, so the join condition for the second join can reference any table from the FROM or first join. But the SQL generator emits joins in the order written, which means \`leftJoin(a, ...).innerJoin(b, eq(a.id, b.aId))\` works while \`innerJoin(b, eq(a.id, b.aId)).leftJoin(a, ...)\` is a reference error at the SQL layer. The TypeScript types catch this — \`a\` is not in scope yet — but the error message is unhelpful (Property id does not exist).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'joins', 'select', 'nullability'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/pg-core/query-builders/select.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/query-builders/select.ts',
  },
  {
    title: '.prepare(name) + sql.placeholder() — server-side prepared statements',
    body: `\`.prepare()\` on any select/insert/update/delete builder produces a \`PgSelectPrepare\` that you can \`.execute(values)\` repeatedly:

\`\`\`ts
prepare(name: string): PgSelectPrepare<this> {
  return this._prepare(name);
}

_prepare(name?: string): PgSelectPrepare<this> {
  // ...
  return tracer.startActiveSpan('drizzle.prepareQuery', () => {
    const fieldsList = orderSelectedFields<PgColumn>(fields);
    const query = session.prepareQuery<...>(
      dialect.sqlToQuery(this.getSQL()), fieldsList, name, true, ...
    );
    query.joinsNotNullableMap = joinsNotNullableMap;
    return query.setToken(authToken);
  });
}
\`\`\`

The \`name\` argument is what Postgres uses on the server side to cache the parsed plan — pass any unique string. Combined with \`sql.placeholder('id')\`:

\`\`\`ts
const byId = db
  .select().from(users)
  .where(eq(users.id, sql.placeholder('id')))
  .prepare('users_by_id');

await byId.execute({ id: 1 });
await byId.execute({ id: 2 });
\`\`\`

Both execute calls reuse the same parsed plan; only parameters change. On a hot path with thousands of repeats per second, this can cut p50 latency noticeably.

Gotcha 1: prepared statements are scoped to a single physical connection. With a connection pool, the first \`execute\` on a fresh connection re-prepares — so very-low-traffic apps don't see much benefit, while very-high-traffic apps do.

Gotcha 2: the neon-http driver throws on \`.transaction()\` ("No transactions support in neon-http driver", session.ts L253). \`.prepare()\` works, but understand it doesn't survive across HTTP requests because each request is a fresh "connection" to the gateway. Use neon-serverless (WebSocket) or postgres-js for true persistent prepared statements.

Third gotcha: prepared statements with \`placeholder\` cannot be used for dynamic IN-list lengths. \`eq(col, sql.placeholder(x))\` works; \`inArray(col, sql.placeholder(xs))\` does NOT — the prepared plan is fixed at prepare time, so the IN-list count must be known. The workaround is to prepare separate statements per common IN-list size, or build the query fresh each time and let Postgres re-plan.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'prepare', 'placeholder', 'performance'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/pg-core/query-builders/select.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/query-builders/select.ts',
  },
  {
    title: 'db.transaction(cb) — abstract on PgDatabase, implemented per driver',
    body: `\`PgDatabase\` declares \`transaction\` as abstract:

\`\`\`ts
abstract transaction<T>(
  transaction: (tx: PgTransaction<TQueryResult, TFullSchema, TSchema>) => Promise<T>,
  config?: PgTransactionConfig,
): Promise<T>;
\`\`\`

Each driver implements it differently because they handle connection acquisition differently. \`node-postgres\` checks out a client from the pool, runs \`BEGIN\`/\`COMMIT\`/\`ROLLBACK\` itself, and releases the client. \`postgres-js\` calls into postgres.js's \`sql.begin(...)\` which manages the connection lifecycle.

Inside the callback you get a \`tx\` that is itself a \`PgDatabase\` — so the same query builder methods all work. The callback's promise resolution semantics drive commit/rollback:

\`\`\`ts
await db.transaction(async (tx) => {
  await tx.insert(users).values({ ... });
  await tx.insert(audit).values({ ... });
  // returning normally → COMMIT
  // throwing → ROLLBACK
  // calling tx.rollback() → throws TransactionRollbackError → ROLLBACK
});
\`\`\`

\`tx.rollback()\` is sugar for "throw a tagged error that the driver catches but doesn't rethrow":

\`\`\`ts
rollback(): never {
  throw new TransactionRollbackError();
}
\`\`\`

Gotcha 1: do NOT use the outer \`db\` inside the callback. \`db.insert(...)\` checks out a different connection, escapes the transaction, and runs autocommit. This is the most common drizzle bug — \`db\` shadows \`tx\` in IDE autocomplete and people don't notice.

Gotcha 2: \`config\` lets you set isolation level (\`'serializable'\`, \`'repeatable read'\`, etc.) but only as the very first statement. Calling \`tx.execute(sql\`set transaction ...\`)\` later in the transaction does nothing — Postgres ignores it.

Third gotcha: long-running transactions hold their connection from the pool the whole time. If your callback awaits an external HTTP call or a long compute, you have taken a connection out of circulation. Under load this is the difference between a healthy app and one that pool-starves at 10 RPS. Move the slow work outside the transaction; use the transaction only for the tight read-modify-write window.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'transaction', 'postgres', 'session'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/pg-core/session.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/session.ts',
  },
  {
    title: 'Nested db.transaction() — implemented as SAVEPOINT, not nested BEGIN',
    body: `Postgres has no nested transactions; "nested" in Drizzle means SAVEPOINT. The node-postgres driver makes this explicit:

\`\`\`ts
override async transaction<T>(transaction: (tx: NodePgTransaction<TFullSchema, TSchema>) => Promise<T>): Promise<T> {
  const savepointName = \`sp\${this.nestedIndex + 1}\`;
  const tx = new NodePgTransaction<TFullSchema, TSchema>(
    this.dialect,
    this.session,
    this.schema,
    this.nestedIndex + 1,
  );
  await tx.execute(sql.raw(\`savepoint \${savepointName}\`));
  try {
    const result = await transaction(tx);
    await tx.execute(sql.raw(\`release savepoint \${savepointName}\`));
    return result;
  } catch (err) {
    await tx.execute(sql.raw(\`rollback to savepoint \${savepointName}\`));
    throw err;
  }
}
\`\`\`

The \`nestedIndex\` counter generates unique savepoint names (\`sp1\`, \`sp2\`, ...). Re-throwing after \`ROLLBACK TO SAVEPOINT\` is intentional — the inner failure should still propagate, and the outer transaction can decide to catch and continue.

Pattern:

\`\`\`ts
await db.transaction(async (tx) => {
  await tx.insert(orders).values(order);
  try {
    await tx.transaction(async (tx2) => {
      await tx2.insert(payments).values(payment);  // might fail
    });
  } catch {
    // payment rolled back, order still pending — could update its status
  }
});
\`\`\`

Gotcha: \`postgres-js\` uses its underlying client's \`.savepoint()\` directly (\`postgres-js/session.ts\` L206), so the implementation differs but semantics match. Importantly, the SQLite drivers don't truly support savepoints in the same way — \`d1\` rejects nested transactions outright at the driver level. Don't write code that relies on nested transactions if you want it to be portable across the dialects Drizzle supports.

Second gotcha: every nested transaction adds a SAVEPOINT round-trip. Three levels deep means three extra \`SAVEPOINT sp1\`, \`SAVEPOINT sp2\`, \`SAVEPOINT sp3\` statements, plus releases on success or rollbacks on failure. For tight loops that try-catch each item, the savepoint overhead can dominate query time. Prefer batching items and validating in JS before the single insert, or use \`onConflictDoNothing\` to let Postgres skip duplicates without throwing.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'transaction', 'savepoint', 'nested'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/node-postgres/session.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/node-postgres/session.ts',
  },
  {
    title: 'pgEnum() — real Postgres enums backed by CREATE TYPE',
    body: `\`pgEnum()\` produces a column factory that maps to a real Postgres \`enum\` type at the database level — different from the \`text({ enum })\` trick which is type-only:

\`\`\`ts
export function pgEnumWithSchema<U extends string, T extends Readonly<[U, ...U[]]>>(
  enumName: string,
  values: T | Writable<T>,
  schema?: string,
): PgEnum<Writable<T>> {
  const enumInstance: PgEnum<Writable<T>> = Object.assign(
    <TName extends string>(name?: TName): PgEnumColumnBuilderInitial<TName, Writable<T>> =>
      new PgEnumColumnBuilder(name ?? '' as TName, enumInstance),
    {
      enumName,
      enumValues: values,
      schema,
      [isPgEnumSym]: true,
    } as const,
  );
  return enumInstance;
}
\`\`\`

The result is a function tagged with the symbol \`isPgEnumSym\` — that's what \`drizzle-kit\` looks for when scanning your schema to emit \`CREATE TYPE\` statements.

\`\`\`ts
export const userRole = pgEnum('user_role', ['admin', 'editor', 'viewer']);

export const users = pgTable('users', {
  role: userRole('role').notNull().default('viewer'),
});
\`\`\`

\`drizzle-kit generate\` produces \`CREATE TYPE "user_role" AS ENUM('admin', 'editor', 'viewer');\` followed by the table.

Gotcha 1: adding a value to a Postgres enum is a separate ALTER (\`ALTER TYPE ... ADD VALUE\`), and Drizzle generates it — but removing or reordering values is not supported by Postgres at all without dropping and recreating the type, and \`drizzle-kit\` will refuse to make destructive changes silently. You'll get a "do you want to truncate?" prompt in interactive mode and a hard fail in CI.

Gotcha 2: enums don't compose with multi-tenancy patterns where each tenant has their own values. For dynamic value sets, prefer \`text\` + a join to a values table.

Third gotcha: Drizzle pgEnum instance is BOTH a column factory AND a type carrier — \`userRole.enumValues\` gives you the array at runtime, useful for building Zod schemas (\`z.enum(userRole.enumValues)\`) without duplicating the list. Keep one source of truth: define the enum in your schema file, then import \`enumValues\` everywhere else (Zod, OpenAPI, frontend) so adding a value is a one-line change.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'pgenum', 'enum', 'postgres'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/pg-core/columns/enum.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/columns/enum.ts',
  },
  {
    title: 'pgSchema(name) — multi-schema tables and a guard against "public"',
    body: `\`pgSchema('app')\` returns an object that mirrors \`pgTable\` / \`pgEnum\` / \`pgView\` / \`pgSequence\` but pre-fills the schema name:

\`\`\`ts
export class PgSchema<TName extends string = string> implements SQLWrapper {
  constructor(public readonly schemaName: TName) {}

  table: PgTableFn<TName> = ((name, columns, extraConfig) => {
    return pgTableWithSchema(name, columns, extraConfig, this.schemaName);
  });

  view = ((name, columns) => {
    return pgViewWithSchema(name, columns, this.schemaName);
  }) as typeof pgView;

  // ...
}

export function pgSchema<T extends string>(name: T) {
  if (name === 'public') {
    throw new Error(
      \`You can't specify 'public' as schema name. Postgres is using public schema by default. ...\`,
    );
  }
  return new PgSchema(name);
}
\`\`\`

The \`'public'\` guard is opinionated and worth knowing about — Drizzle wants you to use \`pgTable\` for the public schema and reserve \`pgSchema\` for explicit non-public schemas.

\`\`\`ts
export const auth = pgSchema('auth');
export const users = auth.table('users', { id: serial('id').primaryKey() });
// CREATE TABLE "auth"."users" ...
\`\`\`

Gotcha 1: cross-schema foreign keys work but you have to import the parent table from its own module — there's no schema-level scoping in TypeScript. Circular imports are easy here; if you split per-schema files, put the cross-schema FK definitions in a third "relations" file.

Gotcha 2: \`drizzle-kit\` needs to know about every schema you reference. If you create a schema in another migration tool and only \`pgSchema('foo').table('...')\` it from Drizzle, you must add \`schemaFilter: ['foo', 'public']\` to your kit config or the introspection / push won't see it.

Third gotcha: views, materialized views, sequences, and enums declared via \`pgSchema(foo)\` all live in that schema. But the row type from \`pgSchema(foo).table(...)\` is structurally identical to a public-schema table — TypeScript cannot tell them apart. If you accidentally pass a \`foo.users\` row into a function expecting a \`public.users\` row, it compiles. Defensive option: brand each schema row types with a phantom property.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'schema', 'multi-schema', 'postgres'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/pg-core/schema.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/schema.ts',
  },
  {
    title: 'check() and unique() — composable extra-config builders',
    body: `\`check('name', sql)\` and \`unique('name').on(col1, col2)\` live in tiny files that hold the entire constraint logic for Drizzle:

\`\`\`ts
// checks.ts
export function check(name: string, value: SQL): CheckBuilder {
  return new CheckBuilder(name, value);
}
\`\`\`

\`\`\`ts
// unique-constraint.ts
export function unique(name?: string): UniqueOnConstraintBuilder {
  return new UniqueOnConstraintBuilder(name);
}

export class UniqueConstraintBuilder {
  nullsNotDistinct() {
    this.nullsNotDistinctConfig = true;
    return this;
  }
}
\`\`\`

Used in a table's third argument:

\`\`\`ts
export const accounts = pgTable('accounts', {
  email: text('email').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  status: text('status').notNull(),
}, (t) => [
  unique('accounts_email_tenant').on(t.email, t.tenantId),
  unique('accounts_email_active').on(t.email).nullsNotDistinct(),
  check('status_check', sql\`\${t.status} in ('active', 'pending', 'banned')\`),
]);
\`\`\`

\`.nullsNotDistinct()\` is a Postgres 15+ feature — by default Postgres treats two NULLs as distinct (so two rows with NULL email both pass the unique check). Calling this method makes NULLs equal-for-uniqueness, matching MySQL behavior.

Gotcha: \`check()\` accepts arbitrary \`SQL\`, including references to other columns — but the SQL is never validated client-side. A typo like \`sql\`\${t.statu} in ('a')\`\` (missing letter) compiles, then crashes at migration time with a Postgres error pointing at column "statu" not existing. The error message is helpful, but the typo escapes type-checking because \`t.statu\` becomes \`undefined\` and \`sql\` happily interpolates nothing.

Second gotcha: composite unique constraints do not replace composite indexes for query speed. A \`unique(a_b).on(t.a, t.b)\` creates a unique btree under the hood, which DOES help queries that filter on \`(a, b)\` or just \`a\` (leftmost-prefix rule), but NOT queries that filter on \`b\` alone. If your read patterns hit \`b\` independently, add a separate \`index(b_idx).on(t.b)\` — it is redundant for uniqueness but free for reads.

Third gotcha: \`check()\` constraints do not get re-validated when you ALTER the column type later. Postgres requires a separate \`ALTER TABLE ... VALIDATE CONSTRAINT\` step which Drizzle does not generate. Plan for that explicitly during type migrations.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'check', 'unique', 'constraints'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/pg-core/unique-constraint.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/unique-constraint.ts',
  },
  {
    title: 'index() / uniqueIndex() — partial, concurrent, custom-method indexes',
    body: `\`index()\` and \`uniqueIndex()\` return an \`IndexBuilderOn\` that fluently composes the rest of the index spec:

\`\`\`ts
export function index(name?: string): IndexBuilderOn {
  return new IndexBuilderOn(false, name);
}
export function uniqueIndex(name?: string): IndexBuilderOn {
  return new IndexBuilderOn(true, name);
}

export class IndexBuilder implements AnyIndexBuilder {
  concurrently(): this { this.config.concurrently = true; return this; }
  with(obj: Record<string, any>): this { this.config.with = obj; return this; }
  where(condition: SQL): this { this.config.where = condition; return this; }
}
\`\`\`

Plus \`.using('btree' | 'hash' | 'gin' | 'gist' | 'brin' | 'hnsw' | 'ivfflat' | string)\` to pick the index method (the \`PgIndexMethod\` type lists the known options but accepts any string for unknown extensions).

\`\`\`ts
export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  authorId: integer('author_id').notNull(),
  publishedAt: timestamp('published_at'),
  embedding: vector('embedding', { dimensions: 1536 }),
}, (t) => [
  index('posts_author_published_idx')
    .on(t.authorId, t.publishedAt.desc())
    .where(sql\`\${t.publishedAt} is not null\`),
  index('posts_embedding_hnsw')
    .using('hnsw', t.embedding.op('vector_cosine_ops')),
]);
\`\`\`

The first is a partial composite index — narrow + sorted; the second uses pgvector's HNSW with a cosine op-class.

Gotcha: \`.concurrently()\` lands in the migration as \`CREATE INDEX CONCURRENTLY\`, which Postgres CANNOT run inside a transaction. Drizzle's migrator runs each generated migration file inside a transaction by default, so concurrent index creation fails with "CREATE INDEX CONCURRENTLY cannot run inside a transaction block". The fix is to hand-edit the generated SQL and add \`--> statement-breakpoint\` markers around the concurrent statement so it executes outside the transaction. Drizzle's migrator splits on those markers (see \`migrator.ts\`).

Second gotcha: Drizzle generates index names automatically if you do not provide one — based on table + columns + idx suffix. Two indexes with the same column list but different \`where\` predicates will get the same auto-generated name and the migration will fail with relation already exists. Always name partial indexes explicitly so refactors do not surprise you.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'indexes', 'partial', 'concurrent'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/pg-core/indexes.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/indexes.ts',
  },
  {
    title: 'onConflictDoUpdate() — Postgres upsert with target, set, and per-side WHERE',
    body: `Postgres' \`INSERT ... ON CONFLICT ... DO UPDATE\` has a lot of knobs. Drizzle exposes all of them through \`onConflictDoUpdate\`:

\`\`\`ts
onConflictDoUpdate(
  config: PgInsertOnConflictDoUpdateConfig<this>,
): PgInsertWithout<this, TDynamic, 'onConflictDoNothing' | 'onConflictDoUpdate'> {
  if (config.where && (config.targetWhere || config.setWhere)) {
    throw new Error(
      'You cannot use both "where" and "targetWhere"/"setWhere" at the same time - "where" is deprecated, use "targetWhere" or "setWhere" instead.',
    );
  }
  const targetWhereSql = config.targetWhere ? sql\` where \${config.targetWhere}\` : undefined;
  const setWhereSql = config.setWhere ? sql\` where \${config.setWhere}\` : undefined;
  const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
  let targetColumn = Array.isArray(config.target)
    ? config.target.map((it) => this.dialect.escapeName(this.dialect.casing.getColumnCasing(it))).join(',')
    : this.dialect.escapeName(this.dialect.casing.getColumnCasing(config.target));
  this.config.onConflict = sql\`(\${sql.raw(targetColumn)})\${targetWhereSql} do update set \${setSql}\${whereSql}\${setWhereSql}\`;
  return this as any;
}
\`\`\`

\`target\` selects the conflict target — typically the primary key or a unique index column. \`set\` is what gets written. \`targetWhere\` filters which existing rows count as conflicts (for partial unique indexes); \`setWhere\` filters which conflict rows actually get updated.

\`\`\`ts
await db.insert(users)
  .values({ id: 1, email: 'a@b.com', loginCount: 1 })
  .onConflictDoUpdate({
    target: users.id,
    set: { loginCount: sql\`\${users.loginCount} + 1\` },
    setWhere: sql\`\${users.bannedAt} is null\`,
  });
\`\`\`

Gotcha 1: the deprecated single \`where\` is mutually exclusive with \`targetWhere\`/\`setWhere\` — Drizzle throws at build time. Always use the new pair.

Gotcha 2: there is no \`excluded.\` helper. You write \`set: { col: sql\`excluded.\${users.col}\` }\` by hand if you want "use the value the insert tried to write". MySQL's \`onDuplicateKeyUpdate\` works differently — it has no target and uses \`VALUES(col)\` syntax — so this code does NOT port to mysql-core.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'upsert', 'onconflictdoupdate', 'postgres'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/pg-core/query-builders/insert.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/query-builders/insert.ts',
  },
  {
    title: 'onDuplicateKeyUpdate() — MySQL\'s upsert is a different beast',
    body: `MySQL has no \`ON CONFLICT\` clause — instead it uses \`ON DUPLICATE KEY UPDATE\`, which conflicts on ANY unique index (you don't choose). Drizzle's mysql-core mirrors that:

\`\`\`ts
onDuplicateKeyUpdate(
  config: MySqlInsertOnDuplicateKeyUpdateConfig<this>,
): MySqlInsertWithout<this, TDynamic, 'onDuplicateKeyUpdate'> {
  const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
  this.config.onConflict = sql\`update \${setSql}\`;
  return this as any;
}
\`\`\`

No \`target\`, no \`where\` — just \`set\`. The doc comment in the source is unusually candid:

\`\`\`ts
// While MySQL does not directly support doing nothing on conflict, you can perform a no-op
// by setting any column's value to itself and achieve the same effect:
await db.insert(cars)
  .values({ id: 1, brand: 'BMW' })
  .onDuplicateKeyUpdate({ set: { id: sql\`id\` } });
\`\`\`

Use that idiom when you want "INSERT IGNORE-ish" semantics without losing the actual error visibility \`INSERT IGNORE\` swallows.

Gotcha 1: because there's no target, if you have multiple unique indexes (say, both an email index and a username index), an insert that conflicts on either triggers the same UPDATE. There's no way to say "only on email conflict, set X; on username conflict, set Y". You must check which row got updated yourself, typically by re-querying.

Gotcha 2: MySQL's \`AUTO_INCREMENT\` increments even when an \`onDuplicateKeyUpdate\` rolls into the UPDATE branch — leaving gaps in your sequence. Heavy-write tables with this pattern can exhaust an \`int\` PK faster than you'd expect; use \`bigint\` for tables you upsert at high volume.

Third gotcha: combining \`onDuplicateKeyUpdate\` with \`$returningId()\` in MySQL gives you the last inserted ID — but for the UPDATE branch, MySQL returns the existing row ID, not a no-row-was-inserted marker. You can detect inserts vs updates only by checking \`affectedRows\`: 1 means INSERT, 2 means UPDATE (yes, two — MySQL counts the conflicting delete + insert). Drizzle exposes both via the result object on most MySQL drivers.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'upsert', 'onduplicatekeyupdate', 'mysql'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/mysql-core/query-builders/insert.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/mysql-core/query-builders/insert.ts',
  },
  {
    title: '$with(alias).as(qb) and db.with(...) — Common Table Expressions',
    body: `Drizzle's CTE API splits creation from use. \`db.$with('alias').as(qb)\` builds a \`WithSubquery\`; \`db.with(sub).select()...\` consumes it:

\`\`\`ts
$with: WithBuilder = (alias: string, selection?: ColumnsSelection) => {
  const self = this;
  const as = (qb: ... | SQL | (qb => ...)) => {
    if (typeof qb === 'function') {
      qb = qb(new QueryBuilder(self.dialect));
    }
    return new Proxy(
      new WithSubquery(qb.getSQL(), selection ?? ..., alias, true),
      new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
    );
  };
  return { as };
};
\`\`\`

Usage:

\`\`\`ts
const sq = db.$with('sq').as(
  db.select().from(users).where(eq(users.id, 42))
);
const result = await db.with(sq).select().from(sq);
\`\`\`

The Proxy is what makes \`sq.name\` valid in subsequent SELECTs without explicit re-typing — accessing a property on the WithSubquery returns an aliased SQL expression scoped to the CTE.

For arbitrary expressions (not just columns), you need \`.as('alias')\` on the SQL fragment so it has a name in the CTE projection:

\`\`\`ts
const sq = db.$with('sq').as(db.select({
  name: sql<string>\`upper(\${users.name})\`.as('name'),
}).from(users));

const result = await db.with(sq).select({ name: sq.name }).from(sq);
\`\`\`

Gotcha 1: if you forget the \`.as('name')\` on a raw SQL field, Drizzle's SelectionProxyHandler is configured \`sqlBehavior: 'error'\` — it throws when you try to reference \`sq.something\` because there's no name to alias.

Gotcha 2: CTEs in Postgres are an optimization fence by default until v12. On older Postgres, putting a filter inside a CTE prevents predicate pushdown. Drizzle generates standard \`WITH alias AS (...)\` — if you want \`WITH ... AS NOT MATERIALIZED\` you have to write it via \`sql\`...\`\`.

Third gotcha: a CTE referenced multiple times in the outer query gets evaluated ONCE in modern Postgres (the inlining can be controlled with \`MATERIALIZED\` / \`NOT MATERIALIZED\`). For one-shot reuse, an inline subquery may plan better. Use CTEs when you need recursive queries (\`WITH RECURSIVE\`) — Drizzle supports these via \`db.$with(rec).asRecursive(...)\` — or when the named result aids readability for non-trivial pipelines.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'cte', 'with', 'subquery'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/pg-core/db.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/db.ts',
  },
  {
    title: 'sql.raw() and sql.placeholder() — escape hatches with very different safety profiles',
    body: `The \`sql\` template tag has two namespaced helpers that look similar but behave very differently:

\`\`\`ts
export function raw(str: string): SQL {
  return new SQL([new StringChunk(str)]);
}

export function placeholder<TName extends string>(name: TName): Placeholder<TName> {
  return new Placeholder(name);
}
\`\`\`

\`sql.raw('order by id desc')\` interpolates a string verbatim into the query — NO escaping, NO parameter binding. It's how Drizzle itself emits things like SAVEPOINT names or dynamic ORDER BY directions where the value is known-safe (came from a builder, not a user). Use it whenever you need to splice a SQL identifier or fragment that the parameterized layer can't handle.

\`sql.placeholder('id')\` creates a named placeholder that's resolved at \`.execute({ id: 42 })\` time — fully parameterized, fully safe.

\`\`\`ts
// Safe — parameter binding
const byEmail = db.select().from(users)
  .where(eq(users.email, sql.placeholder('email')))
  .prepare('by_email');
await byEmail.execute({ email: req.body.email });

// DANGER — string interpolation
const sortDir: 'asc' | 'desc' = req.query.dir;  // attacker-controlled
db.select().from(users)
  .orderBy(sql.raw(\`name \${sortDir}\`));  // SQL injection if not whitelisted
\`\`\`

The source even calls this out for \`sql.identifier\`: "WARNING: This function does not offer any protection against SQL injections, so you must validate any user input beforehand."

Gotcha: people reach for \`sql.raw\` when \`sql\`...\`\` would work fine. \`sql\`order by \${col} desc\`\` (where \`col\` is a Drizzle column) generates correctly-escaped identifiers. Reserve \`sql.raw\` for bare-string fragments and always whitelist the input first.

Third gotcha: \`sql.raw(LIMIT  + n)\` looks safe when \`n\` is a number — but JavaScript loose typing means \`n\` could be a string at runtime if it came from \`req.query.limit\` and you forgot to coerce. Always pass numeric values through a type-safe parser (\`z.coerce.number().int().positive().parse(n)\`) before splicing them into a \`sql.raw\`, even when they should obviously be numbers.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'sql', 'raw', 'placeholder', 'security'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/sql/sql.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/sql/sql.ts',
  },
  {
    title: 'logger: true | DefaultLogger | custom Logger — query inspection at the wire level',
    body: `Drizzle's \`logger\` option ties into a tiny \`Logger\` interface:

\`\`\`ts
export interface Logger {
  logQuery(query: string, params: unknown[]): void;
}

export class DefaultLogger implements Logger {
  readonly writer: LogWriter;

  constructor(config?: { writer: LogWriter }) {
    this.writer = config?.writer ?? new ConsoleLogWriter();
  }

  logQuery(query: string, params: unknown[]): void {
    const stringifiedParams = params.map((p) => {
      try { return JSON.stringify(p); } catch { return String(p); }
    });
    const paramsStr = stringifiedParams.length ? \` -- params: [\${stringifiedParams.join(', ')}]\` : '';
    this.writer.write(\`Query: \${query}\${paramsStr}\`);
  }
}

export class NoopLogger implements Logger {
  logQuery(): void { /* noop */ }
}
\`\`\`

Pass \`logger: true\` to the \`drizzle()\` factory and you get \`DefaultLogger\` writing to \`console.log\`. Pass a custom object and Drizzle hands every prepared query — SQL plus param array — to \`logQuery\` before execution.

\`\`\`ts
const db = drizzle(client, {
  logger: {
    logQuery(q, params) {
      logger.debug({ q, params }, 'drizzle query');
    },
  },
});
\`\`\`

Gotcha 1: \`logQuery\` runs synchronously on the hot path. Don't do anything expensive inside (no synchronous file I/O, no \`JSON.stringify\` of huge objects). The default impl already protects against circular references in params with the try/catch.

Gotcha 2: parameters are post-encoder values — what the driver actually sees. So a \`Date\` shows up as the ISO string after \`PgTimestamp.mapToDriverValue\`, not as the original Date. If you need pre-encode visibility, log inside your own application code before calling Drizzle.

Gotcha 3: failed queries still emit a log line BEFORE the error. If your alerting watches for "Query:" patterns to confirm execution, double-check it's not flagging queries that subsequently failed.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'logger', 'observability', 'debugging'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/logger.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/logger.ts',
  },
  {
    title: 'db.batch([...]) — atomic multi-statement for D1 / Turso, NOT for Postgres',
    body: `\`batch\` is Drizzle's API for D1 and libSQL/Turso, where the wire protocol can ship a list of statements as a single round-trip. The driver-side wrapper is one line:

\`\`\`ts
// d1/driver.ts
async batch<U extends BatchItem<'sqlite'>, T extends Readonly<[U, ...U[]]>>(
  batch: T,
): Promise<BatchResponse<T>> {
  return this.session.batch(batch) as Promise<BatchResponse<T>>;
}

// libsql/driver-core.ts
async batch<U extends BatchItem<'sqlite'>, T extends Readonly<[U, ...U[]]>>(
  batch: T,
): Promise<BatchResponse<T>> {
  return this.session.batch(batch) as Promise<BatchResponse<T>>;
}
\`\`\`

The \`BatchResponse<T>\` mapped type returns a tuple where each element matches the corresponding statement's result — so types stay precise:

\`\`\`ts
const [users, posts, latestId] = await db.batch([
  db.select().from(usersTable),
  db.select().from(postsTable).limit(10),
  db.insert(postsTable).values({ title: 't' }).returning({ id: postsTable.id }),
]);
// users: User[], posts: Post[], latestId: { id: number }[]
\`\`\`

D1 wraps the whole batch in an implicit transaction — all-succeed or all-rollback. Same for libSQL. This is the correct primitive for serverless Postgres-shaped workloads where you'd reach for \`transaction()\` on Node — but Postgres-on-edge typically goes through neon-http, which doesn't support either batch or transactions.

Gotcha 1: \`batch\` is NOT exported on \`PgDatabase\`. Calling it on a node-postgres or postgres-js \`db\` is a type error. If you want similar semantics on Postgres, use \`db.transaction(async tx => Promise.all([...]))\` — but those are sequential round-trips.

Gotcha 2: Each statement's prepared form must be cacheable. Building queries with dynamic schema names inside \`batch()\` defeats the cache. Drizzle generates fresh SQL per call, so plan-cache wins only happen with stable, parameterized statements.

Third gotcha: D1 batch limit is ~1000 statements per request, and libSQL has a similar (driver-dependent) cap. Splitting into multiple batches breaks atomicity — there is no commit-across-batches primitive. For workloads larger than the batch limit, you have to choose between one big batch with potential failure exposing partial state and many small batches with eventual consistency. Plan idempotency at the application layer.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['drizzle', 'orm', 'batch', 'd1', 'libsql', 'edge'],
    repository: drizzle,
    filePath: 'drizzle-orm/src/d1/driver.ts',
    url: 'https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/d1/driver.ts',
  },
];
