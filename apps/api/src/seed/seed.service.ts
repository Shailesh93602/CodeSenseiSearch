import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { GeminiService } from '../services/gemini.service';
import { DEMO_CORPUS } from './demo-corpus';

interface SeedResult {
  created: number;
  skipped: number;
  embedded: number;
  alreadyEmbedded: number;
  failed: Array<{ title: string; error: string }>;
  totalItems: number;
  elapsedMs: number;
}

/**
 * SeedService
 *
 * Pushes the curated demo corpus (src/seed/demo-corpus.ts) into the
 * live DB so the deployed /search/hybrid endpoint returns real
 * results. Wired as a one-shot HTTP route for operator use — the
 * function body is idempotent, so re-running only embeds items whose
 * chunks don't already have a vector.
 *
 * Design notes:
 * - Fingerprint via sha256(title + body) so re-runs are safe.
 * - One chunk per item — corpus entries are short enough to fit
 *   inside Gemini's 2048-token input budget comfortably.
 * - Embed sequentially (not in parallel) to stay under the Gemini
 *   free-tier rate limit and to give a predictable runtime.
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
  ) {}

  async seedDemoCorpus(): Promise<SeedResult> {
    const startedAt = Date.now();

    if (!this.gemini.isAvailable()) {
      throw new Error(
        'Gemini is not available — set GEMINI_API_KEY before seeding.',
      );
    }

    // Note: we deliberately don't create a Source row here — the curated
    // corpus is owner-authored (not scraped) and Content rows don't
    // carry a sourceId FK anyway. If the Source table is missing in
    // prod (pre-Phase-2 migration), skipping this keeps the seed
    // operational on partially-migrated databases.

    const result: SeedResult = {
      created: 0,
      skipped: 0,
      embedded: 0,
      alreadyEmbedded: 0,
      failed: [],
      totalItems: DEMO_CORPUS.length,
      elapsedMs: 0,
    };

    for (const item of DEMO_CORPUS) {
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
        content = await this.prisma.content.create({
          data: {
            title: item.title,
            content: fullText,
            contentType: 'DOCUMENTATION_PAGE',
            language: item.language,
            contentHash,
            processedAt: new Date(),
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
        continue;
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

    result.elapsedMs = Date.now() - startedAt;
    this.logger.log(
      `Seed done: created=${result.created} skipped=${result.skipped} embedded=${result.embedded} alreadyEmbedded=${result.alreadyEmbedded} failed=${result.failed.length} in ${result.elapsedMs}ms`,
    );
    return result;
  }
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
