import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { GeminiService } from '../services/gemini.service';
import { DEMO_CORPUS } from './demo-corpus';
import { ALL_BATCH_ITEMS } from './batches';
import type { SeedItem } from './types';

interface SeedResult {
  created: number;
  skipped: number;
  embedded: number;
  alreadyEmbedded: number;
  failed: Array<{ title: string; error: string }>;
  totalItems: number;
  elapsedMs: number;
  byContentType: Record<string, number>;
}

/**
 * SeedService
 *
 * Pushes the curated demo corpus + every additional batch into the
 * live DB so /search/hybrid returns real results across all source
 * filters. Wired as a one-shot HTTP route for operator use — the
 * function body is idempotent, so re-running only embeds items whose
 * chunks don't already have a vector.
 *
 * Design notes:
 * - Fingerprint via sha256(title + body) so re-runs are safe.
 * - One chunk per item — corpus entries are short enough to fit
 *   inside Gemini's 2048-token input budget comfortably.
 * - Embed sequentially (not in parallel) to stay under the Gemini
 *   free-tier rate limit and to give a predictable runtime.
 * - REPOSITORY_FILE entries auto-upsert a Repository row so the
 *   source filter has a real FK to match against. Same pattern for
 *   STACKOVERFLOW_QUESTION via the questions table.
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  // Cache of upserted Repository / Question rows keyed by (owner+name)
  // or questionId, scoped to one seed run. Avoids the same upsert
  // firing 30 times for entries pointing at the same repo.
  private readonly repoCache = new Map<string, { id: string }>();
  private readonly questionCache = new Map<number, { id: string }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
  ) {}

  /** Combined corpus from the documentation baseline + every batch. */
  private getAllItems(): SeedItem[] {
    return [...DEMO_CORPUS, ...ALL_BATCH_ITEMS];
  }

  async seedDemoCorpus(opts: {
    /** Max number of NEW embeddings to generate this call. Lets the
     * operator chunk the work so a 200-item batch doesn't hit Vercel's
     * 60s function timeout. Default: no limit. */
    limit?: number;
  } = {}): Promise<SeedResult> {
    const startedAt = Date.now();
    const embedLimit = opts.limit ?? Number.POSITIVE_INFINITY;

    if (!this.gemini.isAvailable()) {
      throw new Error(
        'Gemini is not available — set GEMINI_API_KEY before seeding.',
      );
    }

    this.repoCache.clear();
    this.questionCache.clear();

    const items = this.getAllItems();

    const result: SeedResult = {
      created: 0,
      skipped: 0,
      embedded: 0,
      alreadyEmbedded: 0,
      failed: [],
      totalItems: items.length,
      elapsedMs: 0,
      byContentType: {},
    };

    for (const item of items) {
      result.byContentType[item.contentType] =
        (result.byContentType[item.contentType] ?? 0) + 1;

      // Stop generating new embeddings once we hit the per-call cap.
      // We still walk the rest of the list so the byContentType
      // count is accurate for the whole corpus.
      const reachedLimit = result.embedded >= embedLimit;
      if (reachedLimit) continue;

      try {
        await this.seedOne(item, result);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'unknown seed error';
        this.logger.error(`Failed item "${item.title}": ${message}`);
        result.failed.push({ title: item.title, error: message });
      }
    }

    result.elapsedMs = Date.now() - startedAt;
    this.logger.log(
      `Seed done: created=${result.created} skipped=${result.skipped} ` +
        `embedded=${result.embedded} alreadyEmbedded=${result.alreadyEmbedded} ` +
        `failed=${result.failed.length} in ${result.elapsedMs}ms`,
    );
    return result;
  }

  /**
   * Idempotently insert + chunk + embed one corpus item.
   * Side-effects on `result` (counters, failures).
   */
  private async seedOne(item: SeedItem, result: SeedResult): Promise<void> {
    const fullText = `${item.title}\n\n${item.body}`;
    const contentHash = sha256(fullText);

    const existing = await this.prisma.content.findUnique({
      where: { contentHash },
      include: { chunks: true },
    });

    let content;
    if (existing) {
      content = existing;
      result.skipped += 1;
    } else {
      // Upsert the Repository / Question row first so we have an FK
      // to attach. These tables exist in the migrated schema; if the
      // call fails (table missing), we let it bubble — the operator
      // needs to know the schema is partial.
      const repositoryId = item.repository
        ? await this.upsertRepository(item.repository)
        : undefined;
      const questionId = item.questionId
        ? await this.upsertQuestion(item)
        : undefined;

      content = await this.prisma.content.create({
        data: {
          title: item.title,
          content: fullText,
          contentType: item.contentType,
          language: item.language,
          contentHash,
          processedAt: new Date(),
          filePath: item.filePath,
          fileName: item.filePath?.split('/').pop(),
          downloadUrl: item.url,
          isAnswer: item.contentType === 'STACKOVERFLOW_ANSWER',
          isAccepted: item.isAccepted ?? false,
          score: item.score,
          repositoryId,
          questionId,
        },
        include: { chunks: true },
      });
      result.created += 1;
    }

    const chunkHash = sha256(`${contentHash}:0`);
    let chunk = content.chunks.find((c) => c.chunkHash === chunkHash);
    if (!chunk) {
      chunk = await this.prisma.contentChunk.create({
        data: {
          contentId: content.id,
          chunkText: fullText,
          chunkHash,
          sequence: 0,
          tokenCount: Math.ceil(fullText.length / 4),
        },
      });
    }

    const [row] = await this.prisma.$queryRaw<
      Array<{ has_embedding: boolean }>
    >`SELECT (embedding IS NOT NULL) as has_embedding FROM content_chunks WHERE id = ${chunk.id}`;

    if (row?.has_embedding) {
      result.alreadyEmbedded += 1;
      return;
    }

    try {
      const { embedding } = await this.gemini.generateEmbedding(fullText);
      const vectorLiteral = `[${embedding.join(',')}]`;
      await this.prisma.$executeRaw`
        UPDATE content_chunks
        SET embedding = ${vectorLiteral}::vector,
            "embeddingStatus" = 'COMPLETED',
            "embeddedAt" = NOW()
        WHERE id = ${chunk.id}
      `;
      result.embedded += 1;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'unknown embedding error';
      result.failed.push({ title: item.title, error: message });
      await this.prisma.contentChunk.update({
        where: { id: chunk.id },
        data: {
          embeddingStatus: 'FAILED',
          embeddingError: message,
        },
      });
    }
  }

  /**
   * Upsert the GitHub source row + the repository row, returning the
   * Repository.id we can attach to a Content row. Caches the result
   * for the duration of one seed run.
   */
  private async upsertRepository(repo: {
    owner: string;
    name: string;
  }): Promise<string> {
    const key = `${repo.owner}/${repo.name}`;
    const cached = this.repoCache.get(key);
    if (cached) return cached.id;

    const source = await this.prisma.source.upsert({
      where: { name: 'github' },
      update: {},
      create: {
        name: 'github',
        displayName: 'GitHub',
        type: 'GITHUB',
        baseUrl: 'https://api.github.com',
      },
    });

    // We don't have a real githubId for hand-curated entries; derive
    // a stable synthetic one from the slug so re-runs hit the same
    // row. The negative range avoids collision with any real
    // GitHub-supplied id we ingest later.
    const syntheticId = -Math.abs(hashToInt(key));

    const row = await this.prisma.repository.upsert({
      where: { fullName: key },
      update: {},
      create: {
        sourceId: source.id,
        githubId: syntheticId,
        fullName: key,
        owner: repo.owner,
        name: repo.name,
        description: `${key} (curated entry)`,
        htmlUrl: `https://github.com/${key}`,
        cloneUrl: `https://github.com/${key}.git`,
        defaultBranch: 'main',
        ingestionStatus: 'SKIPPED',
      },
    });

    this.repoCache.set(key, { id: row.id });
    return row.id;
  }

  /**
   * Upsert the StackOverflow source row + the Question row.
   * questionId is the SO-supplied integer id; we use it as the
   * unique key.
   */
  private async upsertQuestion(item: SeedItem): Promise<string | undefined> {
    if (!item.questionId) return undefined;
    const cached = this.questionCache.get(item.questionId);
    if (cached) return cached.id;

    const source = await this.prisma.source.upsert({
      where: { name: 'stackoverflow' },
      update: {},
      create: {
        name: 'stackoverflow',
        displayName: 'Stack Overflow',
        type: 'STACKOVERFLOW',
        baseUrl: 'https://api.stackexchange.com',
      },
    });

    const row = await this.prisma.question.upsert({
      where: { questionId: item.questionId },
      update: {},
      create: {
        sourceId: source.id,
        questionId: item.questionId,
        title: item.title,
        body: item.body.slice(0, 4000),
        tags: item.tags ?? [],
        score: item.score ?? 0,
        isAnswered: item.isAnswered ?? false,
        hasAcceptedAnswer: item.isAccepted ?? false,
        htmlUrl: item.url,
      },
    });

    this.questionCache.set(item.questionId, { id: row.id });
    return row.id;
  }
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * Cheap deterministic 31-bit hash. Used to derive synthetic
 * githubIds for hand-curated repos so the unique constraint can
 * match across re-runs without storing extra state.
 */
/**
 * Cheap deterministic hash, clamped to the positive 31-bit range so
 * the result fits INT4 in Postgres (the Repository.githubId column).
 * The seed service then negates it (so synthetic ids never collide
 * with real GitHub-supplied ones, which are positive). Final values
 * sit in [-2_147_483_647, -1].
 */
function hashToInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.trunc((h * 31 + (s.codePointAt(i) ?? 0)) % 2_147_483_647);
  }
  return Math.abs(h);
}
