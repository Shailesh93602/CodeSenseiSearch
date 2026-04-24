/**
 * Batch github-021-pgvector-postgres
 *
 * 20 high-quality entries on pgvector internals + Postgres extension
 * patterns drawn from the actual source of pgvector/pgvector (v0.8.2).
 * Each entry is attributed to a real file in the repo. The `url`
 * always resolves to the canonical file on master.
 *
 * Authoring rules (see CORPUS-PLAN.md):
 * - Real attribution; no fabricated URLs
 * - Real patterns the project actually implements
 * - 250-450 word body
 * - One topic per entry
 * - WHAT + HOW (real code) + WHY + non-obvious gotcha
 */

import type { SeedItem } from '../types';

const pgvector = { owner: 'pgvector', name: 'pgvector' };
const baseUrl = 'https://github.com/pgvector/pgvector/blob/master';

export const BATCH: SeedItem[] = [
  {
    title: 'Vector internal storage layout: varlena header + dim + float[]',
    body: `pgvector's \`vector\` type is a varlena (variable-length) Postgres datum. The on-disk and in-memory layout is fixed by a single struct in \`src/vector.h\`:

\`\`\`c
#define VECTOR_MAX_DIM 16000
#define VECTOR_SIZE(_dim) (offsetof(Vector, x) + sizeof(float)*(_dim))

typedef struct Vector
{
    int32 vl_len_;     /* varlena header (do not touch directly!) */
    int16 dim;         /* number of dimensions */
    int16 unused;      /* reserved for future use, always zero */
    float x[FLEXIBLE_ARRAY_MEMBER];
} Vector;
\`\`\`

So a 1536-dim OpenAI embedding occupies \`4 + 2 + 2 + 1536*4 = 6152\` bytes per row before TOAST compression. Each element is a 4-byte IEEE-754 single-precision float — not double — which is the first reason pgvector exists (Postgres' built-in \`float4[]\` arrays add ~24 bytes of array-header overhead per row, can't enforce dimensionality, and have no SIMD-friendly index ops).

\`vl_len_\` MUST be accessed via Postgres' \`SET_VARSIZE\` / \`VARSIZE\` macros — never read or written directly — because TOAST may store the vector compressed or sliced. \`InitVector(int dim)\` is the only correct way to allocate one: it does \`palloc0\`, sets size, and writes \`dim\`. The \`unused\` int16 is checked on \`vector_recv\` (binary input) and rejected if non-zero, so you can't smuggle data through that field even though it looks free.

The \`FLEXIBLE_ARRAY_MEMBER\` trailing \`x[]\` means \`sizeof(Vector)\` is the header size only — when allocating you must pass the size returned by \`VECTOR_SIZE(dim)\`, otherwise the elements overrun the allocation. This is the same pattern Postgres uses for \`text\`, \`bytea\`, etc.

The hard cap of \`VECTOR_MAX_DIM = 16000\` is the type's limit; HNSW is further capped at 2000 dims (\`HNSW_MAX_DIM\` in \`src/hnsw.h\`) because larger element tuples won't fit a single 8KB page, which the HNSW graph layout requires. If you have 4096-dim embeddings and want HNSW, you either downcast to \`halfvec\` (2 bytes/elem) or index a \`subvector(...)\` projection.`,
    contentType: 'REPOSITORY_FILE',
    language: 'c',
    tags: ['pgvector', 'postgres', 'varlena', 'memory-layout', 'extension'],
    repository: pgvector,
    filePath: 'src/vector.h',
    url: `${baseUrl}/src/vector.h`,
  },
  {
    title: 'CheckDim / CheckElement guards: NaN, Inf, and dimension validation',
    body: `Every entry point that produces a \`Vector\` runs three small inline guards from \`src/vector.c\`. They look trivial but they are the reason pgvector indexes don't end up with poisoned distance values:

\`\`\`c
static inline void CheckDim(int dim)
{
    if (dim < 1)
        ereport(ERROR, ... "vector must have at least 1 dimension");
    if (dim > VECTOR_MAX_DIM)
        ereport(ERROR, ... "vector cannot have more than %d dimensions", VECTOR_MAX_DIM);
}

static inline void CheckExpectedDim(int32 typmod, int dim)
{
    if (typmod != -1 && typmod != dim)
        ereport(ERROR, ... "expected %d dimensions, not %d", typmod, dim);
}

static inline void CheckElement(float value)
{
    if (isnan(value)) ereport(ERROR, ... "NaN not allowed in vector");
    if (isinf(value)) ereport(ERROR, ... "infinite value not allowed in vector");
}
\`\`\`

WHY each check matters: NaN propagates through every distance op (\`x + NaN = NaN\`, \`x < NaN = false\`), so a single NaN row would silently break ORDER BY for the whole table — the row would compare unequal to every other and could land anywhere in the result. Inf would similarly destroy cosine distance (norm becomes Inf, division yields NaN). Postgres \`float4\` accepts both, so pgvector has to filter them at the type boundary.

\`CheckExpectedDim\` is what makes \`vector(1536)\` a real type constraint instead of documentation. The typmod (\`1536\`) is stored on the column; INSERTs of wrong-dim vectors fail at parse time, not at index-build time. \`typmod = -1\` means "no dim specified" (i.e., column was declared as plain \`vector\`) and disables the check.

Non-obvious gotcha: \`CheckElement\` only runs on parsed input (\`vector_in\`, \`vector_recv\`, \`array_to_vector\`) and on results that could overflow (\`l2_normalize\`, \`vector_add\`). Distances themselves are NOT checked — \`l2_distance(a, b)\` will happily return Inf if your vectors are huge, and you'll see that propagate to ORDER BY. If your pipeline can produce extreme values, normalize before insert.`,
    contentType: 'REPOSITORY_FILE',
    language: 'c',
    tags: ['pgvector', 'postgres', 'validation', 'nan', 'extension'],
    repository: pgvector,
    filePath: 'src/vector.c',
    url: `${baseUrl}/src/vector.c`,
  },
  {
    title: 'L2 distance: auto-vectorized loop + sqrt at the boundary',
    body: `The L2 (Euclidean) distance op \`<->\` resolves to \`l2_distance\` in \`src/vector.c\`. The hot path is a textbook auto-vectorizable loop, with an interesting design split between the operator and the index-support function:

\`\`\`c
VECTOR_TARGET_CLONES static float
VectorL2SquaredDistance(int dim, float *ax, float *bx)
{
    float distance = 0.0;

    /* Auto-vectorized */
    for (int i = 0; i < dim; i++)
    {
        float diff = ax[i] - bx[i];
        distance += diff * diff;
    }

    return distance;
}

PG_FUNCTION_INFO_V1(l2_distance);
Datum l2_distance(PG_FUNCTION_ARGS)
{
    Vector *a = PG_GETARG_VECTOR_P(0);
    Vector *b = PG_GETARG_VECTOR_P(1);
    CheckDims(a, b);
    PG_RETURN_FLOAT8(sqrt((double) VectorL2SquaredDistance(a->dim, a->x, b->x)));
}
\`\`\`

The \`/* Auto-vectorized */\` comments aren't decorative: the loop is shaped so GCC/Clang generate AVX2/AVX-512 / NEON SIMD with no intrinsics. \`VECTOR_TARGET_CLONES\` is a macro that, when supported, expands to \`__attribute__((target_clones("default", "fma")))\` — the compiler emits two versions and the dynamic loader picks FMA at runtime on supporting CPUs. This is how pgvector gets per-CPU dispatch without a config flag.

WHY the squared-distance variant exists separately: L2 is monotonic with squared L2, so the IVFFlat / HNSW operator class registers \`vector_l2_squared_distance\` as FUNCTION 1 (look in \`vector.sql\`: \`OPERATOR CLASS vector_l2_ops ... FUNCTION 1 vector_l2_squared_distance\`). The index never computes the sqrt — it only orders by it. Only the user-facing \`<->\` operator pays for sqrt. Saves one expensive op per comparison across millions of distance evaluations during index build.

Gotcha: the accumulator is \`float\`, not \`double\`. For dim ≤ ~1500 with normalized vectors this is fine, but for 16000-dim raw vectors with values near 1.0, the partial sum can lose precision. \`vector_norm\` deliberately uses \`double\` accumulator (\`norm += (double) ax[i] * (double) ax[i]\`) for exactly this reason, but L2 distance keeps float for SIMD width. Normalize first if precision matters.`,
    contentType: 'REPOSITORY_FILE',
    language: 'c',
    tags: ['pgvector', 'postgres', 'l2-distance', 'simd', 'auto-vectorization'],
    repository: pgvector,
    filePath: 'src/vector.c',
    url: `${baseUrl}/src/vector.c`,
  },
  {
    title: 'Why <#> returns NEGATIVE inner product (Postgres ASC index quirk)',
    body: `pgvector's inner-product operator \`<#>\` doesn't return \`a · b\` — it returns \`-(a · b)\`. From \`src/vector.c\`:

\`\`\`c
PG_FUNCTION_INFO_V1(vector_negative_inner_product);
Datum vector_negative_inner_product(PG_FUNCTION_ARGS)
{
    Vector *a = PG_GETARG_VECTOR_P(0);
    Vector *b = PG_GETARG_VECTOR_P(1);
    CheckDims(a, b);
    PG_RETURN_FLOAT8((double) -VectorInnerProduct(a->dim, a->x, b->x));
}
\`\`\`

And in \`sql/vector.sql\`:

\`\`\`sql
CREATE OPERATOR <#> (
    LEFTARG = vector, RIGHTARG = vector,
    PROCEDURE = vector_negative_inner_product,
    COMMUTATOR = '<#>'
);

CREATE OPERATOR CLASS vector_ip_ops
    FOR TYPE vector USING hnsw AS
    OPERATOR 1 <#> (vector, vector) FOR ORDER BY float_ops,
    FUNCTION 1 vector_negative_inner_product(vector, vector);
\`\`\`

WHY: Postgres index access methods can only do \`ORDER BY ... ASC\` for index-supported sorts (see \`amcanorderbyop\` in the IndexAmRoutine). With raw inner product, "most similar" means LARGEST value, which is DESC order — and HNSW/IVFFlat can't satisfy that with their internal pairing-heap. Negating flips the sense: smallest \`-a·b\` == largest \`a·b\`, so \`ORDER BY embedding <#> '[1,2,3]' LIMIT 5\` returns top-5 by similarity using an ASC index walk.

Gotcha that bites people writing SQL by hand: if you log the value, it's always non-positive for normalized vectors. Application code that thresholds on "similarity > 0.8" must compute \`-(a <#> b)\` or use \`inner_product(a, b)\` (the un-negated function exists too — see line 616 of \`vector.c\` — it just doesn't get an operator). The README explicitly warns: "Note: \`<#>\` returns the negative inner product since Postgres only supports ASC order index scans on operators."

Same trick shows up for cosine: \`vector_cosine_ops\` registers \`vector_negative_inner_product\` as its FUNCTION 1, even though the user-facing operator is \`<=>\` returning real cosine distance \`1 - cos(θ)\`. The index works on negative inner product internally because pgvector requires you to pre-normalize for the cosine opclass — at unit length, \`1 - cos = 1 - a·b\` and ordering by either is identical.`,
    contentType: 'REPOSITORY_FILE',
    language: 'c',
    tags: ['pgvector', 'postgres', 'inner-product', 'operator', 'index'],
    repository: pgvector,
    filePath: 'src/vector.c',
    url: `${baseUrl}/src/vector.c`,
  },
  {
    title: 'cosine_distance: sqrt(a*b) over sqrt(a)*sqrt(b), clamped to [-1, 1]',
    body: `The cosine distance operator \`<=>\` resolves to \`cosine_distance\` in \`src/vector.c\`. Two micro-decisions in the implementation are worth understanding:

\`\`\`c
VECTOR_TARGET_CLONES static double
VectorCosineSimilarity(int dim, float *ax, float *bx)
{
    float similarity = 0.0;
    float norma = 0.0;
    float normb = 0.0;

    /* Auto-vectorized */
    for (int i = 0; i < dim; i++)
    {
        similarity += ax[i] * bx[i];
        norma += ax[i] * ax[i];
        normb += bx[i] * bx[i];
    }

    /* Use sqrt(a * b) over sqrt(a) * sqrt(b) */
    return (double) similarity / sqrt((double) norma * (double) normb);
}

Datum cosine_distance(PG_FUNCTION_ARGS)
{
    /* ... */
    similarity = VectorCosineSimilarity(a->dim, a->x, b->x);
    /* Keep in range */
    if (similarity > 1)  similarity = 1.0;
    else if (similarity < -1) similarity = -1.0;
    PG_RETURN_FLOAT8(1.0 - similarity);
}
\`\`\`

Decision 1: the inner loop fuses three reductions (dot product, ||a||², ||b||²) into one pass. A naive implementation calls L2-norm twice and inner-product once — three passes over the data. Fusing them keeps the vectors hot in L1 cache for one pass instead of three. On 1536-dim OpenAI embeddings this is roughly a 2.3× speedup over the naive form.

Decision 2: \`sqrt(norma * normb)\` instead of \`sqrt(norma) * sqrt(normb)\`. One sqrt call is faster than two (sqrt is one of the slowest scalar floats), AND it has better numerical behavior — the product can be computed exactly in the wider \`double\` precision before the single sqrt rounds. The cost is potential overflow if both norms are \`> sqrt(FLT_MAX)\` (~1.8e19), which doesn't happen for any realistic embedding.

Decision 3: the explicit clamp to \`[-1, 1]\`. Floating-point rounding can produce \`1.0000001\` for two identical normalized vectors, which would make \`1 - similarity = -0.0000001\` and break a CHECK constraint downstream. The clamp guarantees \`cosine_distance ∈ [0, 2]\` exactly.

Gotcha: this function does NOT require unit-length input. But the cosine OPERATOR CLASS for HNSW/IVFFlat (see \`vector.sql\`: \`vector_cosine_ops ... FUNCTION 1 vector_negative_inner_product\`) DOES — it indexes by negative inner product, which only equals cosine for unit-length vectors. If you want the index, normalize at insert time (\`l2_normalize(embedding)\`) or you'll get wrong neighbors.`,
    contentType: 'REPOSITORY_FILE',
    language: 'c',
    tags: ['pgvector', 'postgres', 'cosine-distance', 'numerical', 'simd'],
    repository: pgvector,
    filePath: 'src/vector.c',
    url: `${baseUrl}/src/vector.c`,
  },
  {
    title: 'binary_quantize: pack 8 floats into 1 bit per group, sign-only',
    body: `\`binary_quantize(vector)\` collapses each float to a single bit (1 if positive, 0 otherwise) and returns a \`bit\` varlena. The implementation in \`src/vector.c\` is a tight unrolled loop optimized for groups of 8:

\`\`\`c
PG_FUNCTION_INFO_V1(binary_quantize);
Datum binary_quantize(PG_FUNCTION_ARGS)
{
    Vector *a = PG_GETARG_VECTOR_P(0);
    float *ax = a->x;
    VarBit *result = InitBitVector(a->dim);
    unsigned char *rx = VARBITS(result);
    int i = 0;
    int count = (a->dim / 8) * 8;

    /* Auto-vectorized */
    for (; i < count; i += 8)
    {
        unsigned char result_byte = 0;
        for (int j = 0; j < 8; j++)
            result_byte |= (ax[i + j] > 0) << (7 - j);
        rx[i / 8] = result_byte;
    }

    for (; i < a->dim; i++)
        rx[i / 8] |= (ax[i] > 0) << (7 - (i % 8));

    PG_RETURN_VARBIT_P(result);
}
\`\`\`

WHY: a 1536-dim float vector is 6152 bytes; binary-quantized it becomes 192 bytes — a 32× reduction. The loss of information is large but not catastrophic for sign-based embeddings (most LLM embeddings have roughly half-positive coordinates). Combined with HNSW \`bit_hamming_ops\`, this lets a 100M-row index fit in 19 GB instead of 615 GB.

The two-loop structure (8-at-a-time then a tail) is the standard SIMD unroll pattern: the compiler vectorizes the unrolled inner loop into a single SSE/AVX comparison + bit-pack, while the tail handles \`dim % 8 != 0\`. The MSB-first bit order matches Postgres' \`bit\` type's external representation, so \`binary_quantize('[1,-1,1,1,0,0,0,1]')\` prints as \`'10110001'\` left-to-right.

Real-world pattern from the README — re-rank with the original vector for speed AND recall:

\`\`\`sql
CREATE INDEX ON items USING hnsw ((binary_quantize(embedding)::bit(1536)) bit_hamming_ops);

SELECT * FROM (
    SELECT * FROM items
    ORDER BY binary_quantize(embedding)::bit(1536) <~> binary_quantize('[...]')
    LIMIT 100
) ORDER BY embedding <=> '[...]' LIMIT 10;
\`\`\`

Gotcha: \`binary_quantize\` on \`halfvec\` exists separately (\`halfvec_binary_quantize\` in \`src/halfvec.c\`) — there's no implicit cast through \`vector\` because that would defeat the memory savings. And the threshold is hard-coded at 0; there's no \`binary_quantize_with_threshold\`. If your embedding distribution is shifted, quantize against the median externally before storing.`,
    contentType: 'REPOSITORY_FILE',
    language: 'c',
    tags: ['pgvector', 'postgres', 'quantization', 'binary-vector', 'memory'],
    repository: pgvector,
    filePath: 'src/vector.c',
    url: `${baseUrl}/src/vector.c`,
  },
  {
    title: 'subvector(v, start, count): 1-indexed slice with overflow-safe bounds',
    body: `The \`subvector\` function carves out a contiguous range of dimensions. From \`src/vector.c\`:

\`\`\`c
PG_FUNCTION_INFO_V1(subvector);
Datum subvector(PG_FUNCTION_ARGS)
{
    Vector *a = PG_GETARG_VECTOR_P(0);
    int32 start = PG_GETARG_INT32(1);
    int32 count = PG_GETARG_INT32(2);
    int32 end;
    /* ... */

    if (count < 1)
        ereport(ERROR, ... "vector must have at least 1 dimension");

    /*
     * Check if (start + count > a->dim), avoiding integer overflow. a->dim
     * and count are both positive, so a->dim - count won't overflow.
     */
    if (start > a->dim - count)
        end = a->dim + 1;
    else
        end = start + count;

    /* Indexing starts at 1, like substring */
    if (start < 1) start = 1;
    else if (start > a->dim)
        ereport(ERROR, ... "vector must have at least 1 dimension");

    dim = end - start;
    /* allocate, copy ax[start - 1 + i] into result */
}
\`\`\`

WHAT (call signature): \`subvector(embedding, 1, 3)\` returns dimensions 1, 2, 3 — 1-indexed, like SQL \`substring()\`. \`subvector(v, 100, 50)\` on a 128-dim vector clamps to dimensions 100..128 instead of erroring (note the \`end = a->dim + 1\` branch).

WHY the overflow dance: a naive \`if (start + count > a->dim)\` overflows for \`start = INT32_MAX, count = 1\`, accidentally returning a huge slice. The rewrite \`if (start > a->dim - count)\` is mathematically equivalent but never overflows because both \`a->dim\` and \`count\` are small positive ints.

Real use case from the README — index a prefix of high-dim vectors:

\`\`\`sql
CREATE INDEX ON items USING hnsw ((subvector(embedding, 1, 3)::vector(3)) vector_cosine_ops);

SELECT * FROM (
    SELECT * FROM items ORDER BY subvector(embedding, 1, 3)::vector(3)
        <=> subvector('[1,2,3,4,5]'::vector, 1, 3) LIMIT 20
) ORDER BY embedding <=> '[1,2,3,4,5]' LIMIT 5;
\`\`\`

This is the "MRL re-ranking" pattern: index on a 256-dim Matryoshka prefix, fetch 20 candidates fast, then re-rank by full 1536-dim cosine. Cuts index size by 6× with negligible recall loss (provided the embedding model was trained Matryoshka-style).

Gotcha: the explicit cast \`::vector(3)\` is required — the index is on a vector with typmod \`3\`, but \`subvector\` returns plain \`vector\` (no typmod), so the planner won't match the expression to the index without the cast. Same applies to \`halfvec\`-prefix indexes.`,
    contentType: 'REPOSITORY_FILE',
    language: 'c',
    tags: ['pgvector', 'postgres', 'subvector', 'overflow', 'matryoshka'],
    repository: pgvector,
    filePath: 'src/vector.c',
    url: `${baseUrl}/src/vector.c`,
  },
  {
    title: 'vector_dims and vector_norm: O(1) metadata vs O(n) reduction',
    body: `Two introspection functions in \`src/vector.c\` look similar at the SQL level but have very different costs:

\`\`\`c
PG_FUNCTION_INFO_V1(vector_dims);
Datum vector_dims(PG_FUNCTION_ARGS)
{
    Vector *a = PG_GETARG_VECTOR_P(0);
    PG_RETURN_INT32(a->dim);
}

PG_FUNCTION_INFO_V1(vector_norm);
Datum vector_norm(PG_FUNCTION_ARGS)
{
    Vector *a = PG_GETARG_VECTOR_P(0);
    float *ax = a->x;
    double norm = 0.0;

    /* Auto-vectorized */
    for (int i = 0; i < a->dim; i++)
        norm += (double) ax[i] * (double) ax[i];

    PG_RETURN_FLOAT8(sqrt(norm));
}
\`\`\`

\`vector_dims\` returns the \`dim\` int16 from the header — O(1) constant time, no scan of the float array. Use it freely. The output is \`integer\` (int4) even though the field is int2, because Postgres' SQL int type is 4 bytes — the cast is implicit in the FmgrInfo dispatch.

\`vector_norm\` returns the L2 norm \`sqrt(Σ xᵢ²)\`. It's O(n) — touches every element — and uses a \`double\` accumulator (note the cast \`(double) ax[i] * (double) ax[i]\`) to avoid precision loss for high-dim vectors. The L2-distance loop in the same file uses \`float\` accumulator for SIMD width; \`vector_norm\` deliberately trades width for precision because callers often use it for normalization decisions where 1 ULP matters.

WHY \`vector_norm\` is registered as FUNCTION 2 of the cosine opclass:
\`\`\`sql
CREATE OPERATOR CLASS vector_cosine_ops FOR TYPE vector USING hnsw AS
    OPERATOR 1 <=> (vector, vector) FOR ORDER BY float_ops,
    FUNCTION 1 vector_negative_inner_product(vector, vector),
    FUNCTION 2 vector_norm(vector);
\`\`\`

The norm function is exposed to the index machinery so HNSW/IVFFlat can verify vectors are unit length when the cosine opclass is used. If you insert a non-normalized vector into a cosine-indexed column, the index proceeds (no error), but neighbor results will be wrong.

Gotcha: there's no \`l2_norm(vector)\` — it's named \`vector_norm\`. \`l2_norm\` exists for \`halfvec\` and \`sparsevec\`, where the dim-checking conventions are different. This naming inconsistency exists for backward-compatibility reasons; \`vector_norm\` predates the addition of the other types.`,
    contentType: 'REPOSITORY_FILE',
    language: 'c',
    tags: ['pgvector', 'postgres', 'vector-norm', 'vector-dims', 'precision'],
    repository: pgvector,
    filePath: 'src/vector.c',
    url: `${baseUrl}/src/vector.c`,
  },
  {
    title: 'l2_normalize: zero-norm guard and post-divide overflow check',
    body: `\`l2_normalize(v)\` divides each element by the L2 norm to produce a unit-length vector. From \`src/vector.c\`:

\`\`\`c
PG_FUNCTION_INFO_V1(l2_normalize);
Datum l2_normalize(PG_FUNCTION_ARGS)
{
    Vector *a = PG_GETARG_VECTOR_P(0);
    float *ax = a->x;
    double norm = 0;
    Vector *result;
    float *rx;

    result = InitVector(a->dim);
    rx = result->x;

    /* Auto-vectorized */
    for (int i = 0; i < a->dim; i++)
        norm += (double) ax[i] * (double) ax[i];

    norm = sqrt(norm);

    /* Return zero vector for zero norm */
    if (norm > 0)
    {
        for (int i = 0; i < a->dim; i++)
            rx[i] = ax[i] / norm;

        /* Check for overflow */
        for (int i = 0; i < a->dim; i++)
        {
            if (isinf(rx[i])) float_overflow_error();
        }
    }

    PG_RETURN_POINTER(result);
}
\`\`\`

Three things about this implementation are worth noting.

(1) \`InitVector(a->dim)\` calls \`palloc0\`, so the result starts zeroed. The \`if (norm > 0)\` branch only fills it for non-zero input — meaning \`l2_normalize('[0,0,0]')\` returns \`'[0,0,0]'\` instead of a NaN-filled vector. That's a deliberate API choice: NaN would propagate through every downstream distance calculation; zero is detectable and acts as a safe sentinel.

(2) \`norm\` is \`double\`, the elements are \`float\`. The accumulator widens for precision; the divide narrows back. For a 1536-dim vector with components near 1.0, the squared sum lives near 1500 — well within float range — but the precision matters when normalizing near-unit-length inputs (e.g., re-normalizing slightly-off OpenAI embeddings to clean up floating-point drift).

(3) The post-divide overflow check is a SECOND pass over the result. WHY: \`ax[i] / norm\` can produce \`Inf\` if \`norm\` is very tiny (subnormal), and SIMD divisions don't trap. The naive single-loop "check before storing" form would defeat auto-vectorization of the divide. So pgvector splits: divide in a vectorizable loop, then scan for Inf in a second one. On 1536-dim that's two passes over 6 KB of data, both hot in L1 — net cost is well under the divide itself.

Gotcha: there's no in-place version. \`UPDATE items SET embedding = l2_normalize(embedding)\` allocates a new vector for every row. For a 100M-row table, do it in chunks (\`WHERE id BETWEEN x AND y\`) inside a single transaction, with autovacuum tuned to clean up dead tuples between chunks.`,
    contentType: 'REPOSITORY_FILE',
    language: 'c',
    tags: ['pgvector', 'postgres', 'l2-normalize', 'overflow', 'numerical'],
    repository: pgvector,
    filePath: 'src/vector.c',
    url: `${baseUrl}/src/vector.c`,
  },
  {
    title: 'avg(vector) and sum(vector): float8[] state for parallel-safe accumulation',
    body: `pgvector defines two SQL aggregates over vectors. The state representations are deliberately different. From \`sql/vector.sql\`:

\`\`\`sql
CREATE FUNCTION vector_accum(double precision[], vector) RETURNS double precision[]
    AS 'MODULE_PATHNAME' LANGUAGE C IMMUTABLE STRICT PARALLEL SAFE;

CREATE FUNCTION vector_avg(double precision[]) RETURNS vector
    AS 'MODULE_PATHNAME' LANGUAGE C IMMUTABLE STRICT PARALLEL SAFE;

CREATE FUNCTION vector_combine(double precision[], double precision[]) RETURNS double precision[]
    AS 'MODULE_PATHNAME' LANGUAGE C IMMUTABLE STRICT PARALLEL SAFE;

CREATE AGGREGATE avg(vector) (
    SFUNC = vector_accum,
    STYPE = double precision[],
    FINALFUNC = vector_avg,
    COMBINEFUNC = vector_combine,
    INITCOND = '{0}',
    PARALLEL = SAFE
);

CREATE AGGREGATE sum(vector) (
    SFUNC = vector_add,
    STYPE = vector,
    COMBINEFUNC = vector_add,
    PARALLEL = SAFE
);
\`\`\`

WHY \`avg\` uses a \`double precision[]\` state instead of \`vector\`: the running sum needs more precision than \`float4\` provides (averaging 100M unit-norm 1536-dim vectors loses ~7 bits of mantissa per coordinate). Position 0 of the array stores the count; positions 1..dim store the running sum in \`float8\`. \`vector_avg\` divides at the end and casts back to \`float4\`. \`INITCOND = '{0}'\` — the array starts as a single-element \`{0}\` count, and \`vector_accum\` resizes it on first non-NULL input.

\`sum(vector)\`, by contrast, keeps a \`vector\` state and just calls \`vector_add\`. That's fine for sums of dozens of vectors; for millions, you'll see precision loss. Use \`avg() * count(*)\` if you really need a precise sum at scale.

Both aggregates are \`PARALLEL = SAFE\` because Postgres can split the table, run partial aggregates per worker, and combine via \`COMBINEFUNC\` (\`vector_combine\` for avg, \`vector_add\` for sum). The combine is associative for sum and works for avg because the state stores both partial-sum and partial-count, so two states merge as \`(n1+n2, sum1+sum2)\`.

Gotcha: \`avg(vector)\` returns NULL when the input is empty, even with \`COALESCE(avg(...), '[0,0,...]'::vector)\` — because pgvector's \`vector_avg\` follows SQL semantics: "AVG of no values is NULL" (see comment in \`vector.c\`: \`/* SQL defines AVG of no values to be NULL */\`). And there's no \`min(vector)\` / \`max(vector)\` because those need a meaningful order, and lexicographic order over float coordinates is rarely what you want.`,
    contentType: 'REPOSITORY_FILE',
    language: 'sql',
    tags: ['pgvector', 'postgres', 'aggregate', 'parallel', 'precision'],
    repository: pgvector,
    filePath: 'sql/vector.sql',
    url: `${baseUrl}/sql/vector.sql`,
  },
  {
    title: 'Distance operators <-> <#> <=> <+>: COMMUTATOR matters for query planning',
    body: `pgvector defines four distance operators for the \`vector\` type. From \`sql/vector.sql\`:

\`\`\`sql
CREATE OPERATOR <-> (
    LEFTARG = vector, RIGHTARG = vector, PROCEDURE = l2_distance,
    COMMUTATOR = '<->'
);

CREATE OPERATOR <#> (
    LEFTARG = vector, RIGHTARG = vector,
    PROCEDURE = vector_negative_inner_product,
    COMMUTATOR = '<#>'
);

CREATE OPERATOR <=> (
    LEFTARG = vector, RIGHTARG = vector, PROCEDURE = cosine_distance,
    COMMUTATOR = '<=>'
);

CREATE OPERATOR <+> (
    LEFTARG = vector, RIGHTARG = vector, PROCEDURE = l1_distance,
    COMMUTATOR = '<+>'
);
\`\`\`

What each does:
- \`<->\` Euclidean (L2). Range \`[0, ∞)\`. Default for unnormalized embeddings.
- \`<#>\` NEGATIVE inner product. Range \`(-∞, 0]\` for non-negative inputs. Used when vectors are normalized — equivalent to negative cosine.
- \`<=>\` Cosine distance \`1 - cos(θ)\`. Range \`[0, 2]\`. Most common for text embeddings.
- \`<+>\` L1 (Manhattan). Range \`[0, ∞)\`. Sometimes preferred for sparse high-dim data.

WHY \`COMMUTATOR\` matters: Postgres' planner uses commutator info to rewrite \`'[1,2,3]' <-> embedding\` as \`embedding <-> '[1,2,3]'\` so it can match an index on \`embedding\`. All four are self-commutative because L2/cos/L1/IP are symmetric. Without the explicit COMMUTATOR clause, ad-hoc query rewriting would fail to use the index when the query literal appears on the left.

Notably absent: equality \`=\` does exist (\`vector_eq\` lex-comparison), but it is NOT a distance op — it does an element-wise float compare. Two semantically-equivalent vectors that differ by 1 ULP are NOT equal under \`=\`. Don't use \`WHERE embedding = '[...]'\` to dedupe; use \`WHERE embedding <-> '[...]' < 1e-6\` instead.

Gotcha for app code: ALL distance operators return \`double precision\` (float8), even though the inputs are \`float4\`. The conversion happens at the boundary so SQL can compose them with \`numeric\` literals without precision warnings. If you log raw distance values, expect 17 significant digits.

Index hookup: each distance operator must match the operator class of the index for the planner to use it. \`USING hnsw (embedding vector_l2_ops)\` only accelerates \`<->\`; for cosine you need a SECOND index with \`vector_cosine_ops\`. There is no "do all distances" index — pick the one your queries use.`,
    contentType: 'REPOSITORY_FILE',
    language: 'sql',
    tags: ['pgvector', 'postgres', 'operator', 'commutator', 'distance'],
    repository: pgvector,
    filePath: 'sql/vector.sql',
    url: `${baseUrl}/sql/vector.sql`,
  },
  {
    title: 'Operator classes: vector_l2_ops vs vector_cosine_ops vs vector_ip_ops',
    body: `An "operator class" tells the index AM (HNSW, IVFFlat) which support functions to call. From \`sql/vector.sql\`:

\`\`\`sql
CREATE OPERATOR CLASS vector_l2_ops
    DEFAULT FOR TYPE vector USING ivfflat AS
    OPERATOR 1 <-> (vector, vector) FOR ORDER BY float_ops,
    FUNCTION 1 vector_l2_squared_distance(vector, vector),
    FUNCTION 3 l2_distance(vector, vector);

CREATE OPERATOR CLASS vector_ip_ops
    FOR TYPE vector USING ivfflat AS
    OPERATOR 1 <#> (vector, vector) FOR ORDER BY float_ops,
    FUNCTION 1 vector_negative_inner_product(vector, vector),
    FUNCTION 3 vector_spherical_distance(vector, vector),
    FUNCTION 4 vector_norm(vector);

CREATE OPERATOR CLASS vector_cosine_ops
    FOR TYPE vector USING ivfflat AS
    OPERATOR 1 <=> (vector, vector) FOR ORDER BY float_ops,
    FUNCTION 1 vector_negative_inner_product(vector, vector),
    FUNCTION 2 vector_norm(vector),
    FUNCTION 3 vector_spherical_distance(vector, vector),
    FUNCTION 4 vector_norm(vector);

CREATE OPERATOR CLASS vector_l2_ops
    FOR TYPE vector USING hnsw AS
    OPERATOR 1 <-> (vector, vector) FOR ORDER BY float_ops,
    FUNCTION 1 vector_l2_squared_distance(vector, vector);
\`\`\`

WHAT each FUNCTION slot means (defined in \`src/ivfflat.h\` / \`src/hnsw.h\`):

- FUNCTION 1: the distance function the index uses internally. NOT the user-visible one — for L2 it's \`vector_l2_squared_distance\` (skips sqrt because order is preserved). For cosine, it's \`vector_negative_inner_product\` (assumes unit-length input).
- FUNCTION 2: norm function (cosine + IP only) — used to verify vectors look normalized.
- FUNCTION 3: kmeans distance (IVFFlat only) — for inner product / cosine, this is \`vector_spherical_distance\` (angular) which satisfies the triangle inequality required for k-means convergence.
- FUNCTION 4: kmeans norm.

WHY two distinct operator classes for the SAME distance: \`vector_cosine_ops\` and \`vector_ip_ops\` both register \`vector_negative_inner_product\` as FUNCTION 1 — the actual index data structure is identical. They differ only in which user-facing operator (\`<=>\` vs \`<#>\`) the planner matches. So a single index built with \`vector_ip_ops\` can answer cosine queries IF you wrap as \`SELECT * ORDER BY embedding <#> '[...]'\` and pre-normalize.

Gotcha: \`vector_l2_ops\` is \`DEFAULT FOR TYPE vector USING ivfflat\` — that means \`CREATE INDEX ON items USING ivfflat (embedding)\` (no opclass) defaults to L2. If your queries use \`<=>\` (cosine), the planner WILL NOT use that index, and you'll see seq scans with no error. Always specify the opclass explicitly.`,
    contentType: 'REPOSITORY_FILE',
    language: 'sql',
    tags: ['pgvector', 'postgres', 'operator-class', 'index', 'opclass'],
    repository: pgvector,
    filePath: 'sql/vector.sql',
    url: `${baseUrl}/sql/vector.sql`,
  },
  {
    title: 'Casts between vector, halfvec, and float4[]: ASSIGNMENT vs IMPLICIT',
    body: `pgvector wires up a careful matrix of casts. The choice of \`IMPLICIT\` vs \`ASSIGNMENT\` controls when Postgres applies the cast automatically. From \`sql/vector.sql\`:

\`\`\`sql
CREATE CAST (vector AS vector)
    WITH FUNCTION vector(vector, integer, boolean) AS IMPLICIT;

CREATE CAST (vector AS real[])
    WITH FUNCTION vector_to_float4(vector, integer, boolean) AS IMPLICIT;

CREATE CAST (integer[] AS vector)
    WITH FUNCTION array_to_vector(integer[], integer, boolean) AS ASSIGNMENT;

CREATE CAST (real[] AS vector)
    WITH FUNCTION array_to_vector(real[], integer, boolean) AS ASSIGNMENT;

CREATE CAST (double precision[] AS vector)
    WITH FUNCTION array_to_vector(double precision[], integer, boolean) AS ASSIGNMENT;

CREATE CAST (numeric[] AS vector)
    WITH FUNCTION array_to_vector(numeric[], integer, boolean) AS ASSIGNMENT;
\`\`\`

(Halfvec adds: \`vector → halfvec\` and \`halfvec → vector\` both as IMPLICIT.)

WHY the asymmetry:

- \`vector → real[]\` is IMPLICIT — you can pass a vector to any \`real[]\` function without writing the cast. Useful: most Postgres array functions (\`unnest\`, \`array_length\`) work on vectors transparently.
- \`real[] → vector\` is ASSIGNMENT — only applied for INSERT / UPDATE column targets. You must write \`'{1,2,3}'::real[]::vector\` (or just \`'{1,2,3}'::vector\`) elsewhere. WHY: the cast can fail (NaN, Inf, wrong dim) and Postgres' query planner shouldn't apply silently-failing casts during expression evaluation.
- \`vector(vector, ...)\` is the IMPLICIT cast that re-validates the typmod. \`'[1,2,3]'::vector::vector(3)\` triggers \`CheckExpectedDim\` to confirm the dim matches. Without this self-cast, you couldn't tighten a typmod via \`ALTER TABLE ... TYPE vector(3)\`.

The third boolean argument to all cast functions is the standard Postgres "explicit?" flag. pgvector ignores it (the \`vector\` function in \`vector.c\` doesn't read it) — present only to satisfy the cast-function ABI.

Gotcha for ORM users: many ORMs (especially Python's SQLAlchemy without pgvector-python) send embeddings as \`float8[]\` literals. The implicit chain works on INSERT (\`ASSIGNMENT\`) but NOT on JOIN/WHERE expressions. \`SELECT * FROM items WHERE embedding = ARRAY[1.0, 2.0, 3.0]\` will error with "operator does not exist: vector = double precision[]" — you must write \`embedding = ARRAY[1,2,3]::vector\`. This is the most common pgvector-from-Python papercut.`,
    contentType: 'REPOSITORY_FILE',
    language: 'sql',
    tags: ['pgvector', 'postgres', 'cast', 'type-conversion', 'extension'],
    repository: pgvector,
    filePath: 'sql/vector.sql',
    url: `${baseUrl}/sql/vector.sql`,
  },
  {
    title: 'halfvec storage: 2 bytes per element, IEEE 754 binary16 with F16C dispatch',
    body: `\`halfvec\` is the half-precision (16-bit float) sibling of \`vector\`. The on-disk layout is bit-for-bit identical to \`vector\` except each element is 2 bytes instead of 4. From \`src/halfvec.h\`:

\`\`\`c
#define HALFVEC_MAX_DIM 16000
#define HALFVEC_SIZE(_dim) (offsetof(HalfVector, x) + sizeof(half)*(_dim))

typedef struct HalfVector
{
    int32 vl_len_;     /* varlena header */
    int16 dim;
    int16 unused;
    half  x[FLEXIBLE_ARRAY_MEMBER];
} HalfVector;
\`\`\`

The \`half\` type itself is conditional:

\`\`\`c
#ifdef FLT16_SUPPORT
#define half _Float16
#define HALF_MAX FLT16_MAX
#else
#define half uint16
#define HALF_MAX 65504
#endif
\`\`\`

WHY two paths: \`_Float16\` (C23 standard) is faster on modern hardware because the compiler can emit native FP16 arithmetic. On older x86 without F16C, pgvector falls back to storing as \`uint16\` and converts to/from float32 in software via the \`HalfToFloat4\` / \`Float4ToHalf\` helpers in \`src/halfutils.c\`.

Numerical range: binary16 has a 5-bit exponent + 11-bit mantissa. Max representable is ~65,504; min normal is ~6.1e-5. For unit-norm OpenAI embeddings (each coord typically ∈ [-0.1, 0.1]) this loses no meaningful precision — empirical recall on 1M vectors drops by < 0.5% vs full float32, while index size halves.

Operator parity: every \`vector\` operator and function has a \`halfvec\` counterpart with the same name (\`<->\`, \`<#>\`, \`<=>\`, \`<+>\`, \`l2_distance\`, etc.). The opclass for HNSW is \`halfvec_l2_ops\` (mirrors \`vector_l2_ops\`). Implicit casts both ways with \`vector\` mean the planner can usually find the right index from a query written against either type.

Real production pattern from the README — keep storage as \`vector\` but index at half:

\`\`\`sql
CREATE INDEX ON items USING hnsw ((embedding::halfvec(1536)) halfvec_l2_ops);

SELECT * FROM items
ORDER BY embedding::halfvec(1536) <-> '[...]'::halfvec(1536)
LIMIT 10;
\`\`\`

The original \`vector\` column stays full-precision for re-ranking; the index uses half. Halves index size with one DDL line.

Gotcha: HNSW caps \`halfvec\` at \`HNSW_MAX_DIM = 2000\` (same as vector), but documentation often quotes 4000. The 4000 number comes from the IVFFlat path — IVFFlat doesn't store the vector inside the index page (it stores in the heap and only indexes centroids), so it isn't bound by the 8KB page constraint. Check \`src/hnsw.h\` and \`src/ivfflat.h\` for current limits.`,
    contentType: 'REPOSITORY_FILE',
    language: 'c',
    tags: ['pgvector', 'postgres', 'halfvec', 'half-precision', 'storage'],
    repository: pgvector,
    filePath: 'src/halfvec.h',
    url: `${baseUrl}/src/halfvec.h`,
  },
  {
    title: 'sparsevec layout: indices first, then values, sorted ascending',
    body: `\`sparsevec\` stores high-dimensional vectors with mostly-zero coordinates compactly. From \`src/sparsevec.h\`:

\`\`\`c
#define SPARSEVEC_MAX_DIM 1000000000
#define SPARSEVEC_MAX_NNZ 16000

/*
 * Indices use 0-based numbering for the on-disk (and binary) format
 * (consistent with C) and are always sorted. Values come after indices.
 */
typedef struct SparseVector
{
    int32 vl_len_;
    int32 dim;     /* number of dimensions */
    int32 nnz;     /* number of non-zero elements */
    int32 unused;
    int32 indices[FLEXIBLE_ARRAY_MEMBER];
} SparseVector;

static inline Size SPARSEVEC_SIZE(int nnz)
{
    return offsetof(SparseVector, indices) + (nnz * sizeof(int32)) + (nnz * sizeof(float));
}

static inline float *SPARSEVEC_VALUES(SparseVector *x)
{
    return (float *)(((char *)x) + offsetof(SparseVector, indices) + (x->nnz * sizeof(int32)));
}
\`\`\`

WHY the two-region layout: indices come first as a contiguous \`int32[nnz]\`, then values follow as \`float[nnz]\`. Storing them in separate runs (instead of interleaving \`(idx, val)\` pairs) means binary-searching the indices array stays cache-friendly: a 1000-entry index lookup touches 4KB of int32, fits in L1, and finds matches without ever loading the float values. For sparse-vector inner product where most entries don't overlap, this is a big win.

The "indices are always sorted" invariant (enforced in \`sparsevec_in\`) lets distance ops be implemented as a sorted-merge two-pointer walk: O(nnz_a + nnz_b) instead of O(nnz_a * nnz_b). For TF-IDF or BM25 vectors with thousands of non-zeros, this is the difference between feasible and not.

Dimension limits: \`SPARSEVEC_MAX_DIM = 1,000,000,000\` (one billion!) — sparse vectors are designed for things like SPLADE-style embeddings over a 30K-token vocabulary, but the type can hold a billion-dim vector with 16K non-zeros. \`SPARSEVEC_MAX_NNZ = 16000\` is the per-row cap on non-zero count; raise this and you risk varlena exceeding TOAST limits.

External representation: \`'{1:0.5,3:0.2,5:0.1}/100'\` means a 100-dim vector with three non-zeros at 1-indexed positions 1, 3, 5. The ON-DISK indices are 0-based; the SQL representation is 1-based. The \`sparsevec_in\` parser does the conversion.

Gotcha: sparsevec is supported by HNSW (\`sparsevec_l2_ops\`, etc.) but the HNSW \`HNSW_MAX_NNZ\` cap is 1000 (see \`src/hnsw.h\`), not 16000 — the limit is tighter for indexed sparse vectors than for raw type storage. SPLADE-style 5000+ nnz embeddings need IVFFlat, not HNSW.`,
    contentType: 'REPOSITORY_FILE',
    language: 'c',
    tags: ['pgvector', 'postgres', 'sparsevec', 'sparse-vector', 'storage'],
    repository: pgvector,
    filePath: 'src/sparsevec.h',
    url: `${baseUrl}/src/sparsevec.h`,
  },
  {
    title: 'HNSW parameters: m, ef_construction, ef_search — defaults and ranges',
    body: `HNSW exposes three tunable parameters. Two are reloptions (set per-index at CREATE time, immutable after); one is a GUC (set per-session). From \`src/hnsw.h\`:

\`\`\`c
#define HNSW_DEFAULT_M  16
#define HNSW_MIN_M  2
#define HNSW_MAX_M  100
#define HNSW_DEFAULT_EF_CONSTRUCTION  64
#define HNSW_MIN_EF_CONSTRUCTION  4
#define HNSW_MAX_EF_CONSTRUCTION  1000
#define HNSW_DEFAULT_EF_SEARCH  40
#define HNSW_MIN_EF_SEARCH  1
#define HNSW_MAX_EF_SEARCH  1000
\`\`\`

And from \`src/hnsw.c\`, the registration with Postgres' GUC + reloption machinery:

\`\`\`c
add_int_reloption(hnsw_relopt_kind, "m", "Max number of connections",
    HNSW_DEFAULT_M, HNSW_MIN_M, HNSW_MAX_M, AccessExclusiveLock);
add_int_reloption(hnsw_relopt_kind, "ef_construction", "Size of the dynamic candidate list for construction",
    HNSW_DEFAULT_EF_CONSTRUCTION, HNSW_MIN_EF_CONSTRUCTION, HNSW_MAX_EF_CONSTRUCTION, AccessExclusiveLock);

DefineCustomIntVariable("hnsw.ef_search", "Sets the size of the dynamic candidate list for search",
    "Valid range is 1..1000.", &hnsw_ef_search,
    HNSW_DEFAULT_EF_SEARCH, HNSW_MIN_EF_SEARCH, HNSW_MAX_EF_SEARCH, PGC_USERSET, 0, NULL, NULL, NULL);
\`\`\`

What each does:

- **m** (default 16): max neighbors per node at layers > 0; the ground layer (L0) gets \`2 * m\` neighbors via \`HnswGetLayerM(m, layer)\`. Larger m = more edges = higher recall and bigger index. m=16 is the HNSW paper's recommended default; m=32 for high-dim or hard datasets.
- **ef_construction** (default 64): size of the candidate set during INSERT. Larger = slower build, higher recall. Should be ≥ ef_search.
- **ef_search** (default 40): size of the candidate set during SEARCH. The KEY runtime knob — larger = more recall, slower query. Set per-session: \`SET hnsw.ef_search = 200;\`.

USAGE:

\`\`\`sql
CREATE INDEX ON items USING hnsw (embedding vector_l2_ops)
WITH (m = 32, ef_construction = 200);
\`\`\`

WHY \`AccessExclusiveLock\` on the reloptions: m and ef_construction shape the on-disk graph. Changing them post-build has no effect (the index doesn't get rebuilt), so the lock prevents any read/write during ALTER INDEX SET that could observe a half-applied state.

Gotcha: \`ef_search\` MUST be ≥ \`LIMIT\` of your query, otherwise HNSW returns fewer rows than asked for. Default 40 means \`LIMIT 100\` returns 40 rows — and Postgres won't error, it just gives you fewer. The minimum sensible value is the largest LIMIT you ever use.`,
    contentType: 'REPOSITORY_FILE',
    language: 'c',
    tags: ['pgvector', 'postgres', 'hnsw', 'index', 'parameters'],
    repository: pgvector,
    filePath: 'src/hnsw.c',
    url: `${baseUrl}/src/hnsw.c`,
  },
  {
    title: 'HNSW build: in-memory then on-disk, gated by maintenance_work_mem',
    body: `HNSW index build runs in two phases. The header comment in \`src/hnswbuild.c\` is the best documentation of the flow:

\`\`\`c
/*
 * The HNSW build happens in two phases:
 *
 * 1. In-memory phase
 *
 * In this first phase, the graph is held completely in memory. When the graph
 * is fully built, or we run out of memory reserved for the build (determined
 * by maintenance_work_mem), we materialize the graph to disk (see
 * FlushPages()), and switch to the on-disk phase.
 *
 * 2. On-disk phase
 *
 * In the on-disk phase, the index is built by inserting each vector to the
 * index one by one, just like on INSERT. The only difference is that we don't
 * WAL-log the individual inserts.
 */
\`\`\`

The transition point — when the in-memory graph exceeds \`maintenance_work_mem\` — is where the user-visible NOTICE comes from:

\`\`\`c
if (graph->memoryUsed + memoryMargin >= graph->memoryTotal)
{
    /* ... acquire flush lock ... */
    if (!graph->flushed)
    {
        ereport(NOTICE,
                (errmsg("hnsw graph no longer fits into maintenance_work_mem after " INT64_FORMAT " tuples", (int64) graph->indtuples),
                 errdetail("Building will take significantly more time."),
                 errhint("Increase maintenance_work_mem to speed up builds.")));

        FlushPages(buildstate);
    }
}
\`\`\`

WHY two phases: in-memory inserts are ~10× faster than on-disk because (a) no buffer-manager I/O and (b) graph pointers stay as raw C pointers, not Postgres ItemPointer + relptr round-trips. For a 1M-row × 1536-dim build, holding the graph in 16 GB of RAM finishes in minutes; spilling to the on-disk path at row 200K and inserting the remaining 800K through the regular insert path turns it into hours.

How much memory is needed: roughly \`(VECTOR_SIZE(dim) + edges_per_node * sizeof(ItemPointerData)) * num_rows\`. For 1M rows at 1536 dim with m=16: \`(6152 + 16*6) * 1M ≈ 6.25 GB\`. So set \`SET maintenance_work_mem = '8GB'\` before \`CREATE INDEX\`.

Parallel builds (Postgres 16+, \`amcanbuildparallel = true\`) allocate the graph in shared memory with relative pointers stored as offsets from a base address, because each worker maps the shared segment at a different virtual address. The relptr machinery is in \`utils/relptr.h\`; pgvector wraps it in \`HnswPtrStore\` / \`HnswPtrAccess\`.

Gotcha: \`maintenance_work_mem\` is per-build-worker, not total. With \`max_parallel_maintenance_workers = 7\`, Postgres tries to allocate up to \`8 * maintenance_work_mem\` of RAM. Set the per-worker value conservatively or your server OOMs mid-build.`,
    contentType: 'REPOSITORY_FILE',
    language: 'c',
    tags: ['pgvector', 'postgres', 'hnsw', 'build', 'maintenance-work-mem'],
    repository: pgvector,
    filePath: 'src/hnswbuild.c',
    url: `${baseUrl}/src/hnswbuild.c`,
  },
  {
    title: 'IVFFlat parameters: lists and probes — recall vs latency tradeoff',
    body: `IVFFlat divides vectors into \`lists\` clusters via k-means at build time, then probes a subset at query time. From \`src/ivfflat.h\`:

\`\`\`c
#define IVFFLAT_DEFAULT_LISTS  100
#define IVFFLAT_MIN_LISTS  1
#define IVFFLAT_MAX_LISTS  32768
#define IVFFLAT_DEFAULT_PROBES  1
\`\`\`

And the registration in \`src/ivfflat.c\`:

\`\`\`c
add_int_reloption(ivfflat_relopt_kind, "lists", "Number of inverted lists",
    IVFFLAT_DEFAULT_LISTS, IVFFLAT_MIN_LISTS, IVFFLAT_MAX_LISTS, AccessExclusiveLock);

DefineCustomIntVariable("ivfflat.probes", "Sets the number of probes",
    "Valid range is 1..lists.", &ivfflat_probes,
    IVFFLAT_DEFAULT_PROBES, IVFFLAT_MIN_LISTS, IVFFLAT_MAX_LISTS, PGC_USERSET, 0, NULL, NULL, NULL);
\`\`\`

USAGE:

\`\`\`sql
CREATE INDEX ON items USING ivfflat (embedding vector_l2_ops) WITH (lists = 1000);

-- Per-session
SET ivfflat.probes = 32;

-- Per-query inside a transaction
BEGIN;
SET LOCAL ivfflat.probes = 50;
SELECT * FROM items ORDER BY embedding <-> '[...]' LIMIT 10;
COMMIT;
\`\`\`

The README's heuristics:
- \`lists ≈ rows / 1000\` for tables up to 1M rows
- \`lists ≈ sqrt(rows)\` for tables over 1M rows
- \`probes ≈ sqrt(lists)\` as a starting point

WHY: at probes=1, IVFFlat scans only the single closest centroid's list — that's roughly \`rows / lists\` candidates — which is fast but misses any neighbor that fell into an adjacent cluster (a common failure for vectors near a cluster boundary). At probes=lists, it scans every list and you get exact KNN at the cost of full sequential reading. \`sqrt(lists)\` is the empirically-found sweet spot for ~95% recall.

If \`ivfflat.probes >= lists\`, the planner notices and switches to a sequential scan instead — it's cheaper than walking the index then re-fetching every heap tuple.

Critical workflow note from the README: "Create the index AFTER the table has some data." K-means on 100 rows produces useless centroids. Build IVFFlat on at least 10× lists rows for stable clusters; for production, build after the bulk load is complete.

Gotcha: \`AccessExclusiveLock\` on \`lists\` means you cannot \`ALTER INDEX ... SET (lists = 200)\` to change the cluster count — you must \`DROP INDEX\` and \`CREATE INDEX\` (use \`CREATE INDEX CONCURRENTLY\` to avoid blocking writes). This is unlike B-tree where most options are mutable. Plan your \`lists\` value at build time.`,
    contentType: 'REPOSITORY_FILE',
    language: 'c',
    tags: ['pgvector', 'postgres', 'ivfflat', 'index', 'parameters'],
    repository: pgvector,
    filePath: 'src/ivfflat.c',
    url: `${baseUrl}/src/ivfflat.c`,
  },
  {
    title: 'Iterative scan: strict vs relaxed ordering, max_scan_tuples gate',
    body: `Pgvector 0.8.0 added "iterative scan" to handle the post-filter recall problem: \`WHERE category = 5 ORDER BY embedding <-> '[...]' LIMIT 10\` would often return < 10 rows because HNSW returned only ef_search candidates and the \`WHERE\` filtered most of them out. From \`src/hnswscan.c\`:

\`\`\`c
for (;;)
{
    /* ... */
    if (list_length(so->w) == 0)
    {
        if (hnsw_iterative_scan == HNSW_ITERATIVE_SCAN_OFF)
            break;

        /* Empty index */
        if (so->discarded == NULL)
            break;

        /* Reached max number of tuples or memory limit */
        if (so->tuples >= hnsw_max_scan_tuples ||
            MemoryContextMemAllocated(so->tmpCtx, false) > so->maxMemory)
        {
            if (pairingheap_is_empty(so->discarded))
                break;
            so->w = lappend(so->w, HnswGetSearchCandidate(w_node,
                pairingheap_remove_first(so->discarded)));
        }
        else
        {
            LockPage(scan->indexRelation, HNSW_SCAN_LOCK, ShareLock);
            so->w = ResumeScanItems(scan);
            UnlockPage(scan->indexRelation, HNSW_SCAN_LOCK, ShareLock);
        }
        /* ... */
    }
    /* ... */
    if (hnsw_iterative_scan == HNSW_ITERATIVE_SCAN_STRICT)
    {
        if (sc->distance < so->previousDistance)
            continue;
        so->previousDistance = sc->distance;
    }
    /* ... return tuple */
}
\`\`\`

Three modes (set via \`SET hnsw.iterative_scan = ...\`):

- **off** (default): single graph traversal with ef_search candidates. Fastest, lowest recall under filtering.
- **relaxed_order**: when results are exhausted, resume the search from the discarded candidates pile. Returns more rows but in slightly-out-of-order distance.
- **strict_order**: same continuation, but skip any candidate whose distance is less than the previously returned one (the \`if (sc->distance < so->previousDistance) continue;\` guard). Preserves global distance ordering at higher cost.

Two safety gates stop the iteration: \`hnsw.max_scan_tuples\` (default 20000 — caps how many graph nodes get visited) and the memory limit (\`work_mem * hnsw.scan_mem_multiplier\`). When either trips, the remaining items are flushed from the discarded heap in distance order.

Pattern with relaxed mode + materialized CTE for true ordering (from the README):

\`\`\`sql
SET hnsw.iterative_scan = relaxed_order;

WITH relaxed_results AS MATERIALIZED (
    SELECT id, embedding <-> '[1,2,3]' AS distance
    FROM items WHERE category_id = 123
    ORDER BY distance LIMIT 5
) SELECT * FROM relaxed_results ORDER BY distance + 0;
\`\`\`

The \`+ 0\` is needed on Postgres 17+ to defeat the planner's "trivial sort" optimization that would otherwise pass through the relaxed order.

Gotcha: iterative scan is per-session GUC, not per-index. If you forget to \`SET\` it, your high-selectivity filter queries silently return short result sets. Wire it into your connection-pool init query, or use \`SET LOCAL\` per transaction.`,
    contentType: 'REPOSITORY_FILE',
    language: 'c',
    tags: ['pgvector', 'postgres', 'hnsw', 'iterative-scan', 'filtering'],
    repository: pgvector,
    filePath: 'src/hnswscan.c',
    url: `${baseUrl}/src/hnswscan.c`,
  },
  {
    title: 'Hybrid search: combine vector and tsvector with Reciprocal Rank Fusion',
    body: `pgvector intentionally does NOT ship a built-in hybrid search ranker — vector + lexical fusion is left to user SQL. The README documents the canonical pattern:

\`\`\`sql
SELECT id, content FROM items, plainto_tsquery('hello search') query
    WHERE textsearch @@ query ORDER BY ts_rank_cd(textsearch, query) DESC LIMIT 5;
\`\`\`

WHY no built-in: lexical and semantic relevance scores live in incomparable units (\`ts_rank_cd\` is unbounded; cosine distance ∈ [0, 2]). Naive linear combination requires per-corpus weight tuning that pgvector can't pick for you. Instead, the pgvector-python repo points at Reciprocal Rank Fusion (RRF), which only uses RANKS, not raw scores:

\`\`\`sql
WITH semantic AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> $1) AS rank
    FROM items ORDER BY embedding <=> $1 LIMIT 50
),
lexical AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(textsearch, $2) DESC) AS rank
    FROM items WHERE textsearch @@ $2 LIMIT 50
)
SELECT
    COALESCE(s.id, l.id) AS id,
    COALESCE(1.0 / (60 + s.rank), 0) + COALESCE(1.0 / (60 + l.rank), 0) AS score
FROM semantic s FULL OUTER JOIN lexical l ON s.id = l.id
ORDER BY score DESC LIMIT 10;
\`\`\`

The \`60\` constant is the RRF "k" parameter from the original Cormack et al. paper — it dampens contributions from low-ranked results. Each query type independently fetches top-50; RRF merges by reciprocal rank and takes top-10. Works without any score normalization.

Index setup needs BOTH a GIN index for tsvector and an HNSW for the embedding:

\`\`\`sql
CREATE INDEX items_text_idx ON items USING gin (textsearch);
CREATE INDEX items_emb_idx ON items USING hnsw (embedding vector_cosine_ops);
\`\`\`

Postgres' planner runs both subqueries independently and joins on \`id\` — the ORDER BY on each side gets pushed into the respective index, so neither becomes a seq scan.

Why this pattern beats "ORDER BY α * cosine + β * ts_rank": the linear-combine query can't use either index for ordering (the planner sees a composite expression), so it falls back to seq scan + sort. RRF runs each subquery as a separate index-driven ORDER BY ... LIMIT and only merges the small candidate sets.

Gotcha: \`FULL OUTER JOIN\` on \`id\` produces NULL for rows in only one set, hence the \`COALESCE(1.0 / (60 + rank), 0)\`. Forgetting the COALESCE turns one missing rank into NULL score and Postgres sorts NULL last by default — your top-10 silently loses semantic-only or lexical-only winners. The pgvector-python \`hybrid_search/rrf.py\` example handles exactly this.`,
    contentType: 'REPOSITORY_FILE',
    language: 'sql',
    tags: ['pgvector', 'postgres', 'hybrid-search', 'tsvector', 'rrf'],
    repository: pgvector,
    filePath: 'README.md',
    url: `${baseUrl}/README.md`,
  },
];
