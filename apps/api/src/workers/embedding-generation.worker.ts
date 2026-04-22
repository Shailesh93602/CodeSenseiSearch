import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueService, JobType } from '../services/queue.service';
import { PrismaService } from '../services/prisma.service';
import { GeminiService } from '../services/gemini.service';
import { VectorService } from '../services/vector.service';
import { BaseWorker } from './worker.base';

/**
 * Pulls PENDING content_chunks from a job payload, asks GeminiService
 * for embeddings, writes them to the pgvector column via VectorService,
 * and flips each chunk's embeddingStatus to COMPLETED (or FAILED with
 * an error message).
 *
 * Concurrency is 3 because Gemini's free-tier RPM is generous but not
 * unlimited. If you hit the per-minute cap, lower this.
 *
 * Idempotency: loading only chunks with status PENDING or FAILED means
 * replaying the same job won't double-embed. Marking the batch
 * IN_PROGRESS up front prevents concurrent workers from racing on the
 * same chunk.
 */
@Injectable()
export class EmbeddingGenerationWorker extends BaseWorker {
  private static readonly MAX_RETRIES = 3;
  private static readonly INITIAL_BACKOFF_MS = 500;

  constructor(
    queueService: QueueService,
    private readonly prismaService: PrismaService,
    private readonly geminiService: GeminiService,
    private readonly vectorService: VectorService,
  ) {
    super(queueService, 'embedding-generation', 3);
  }

  protected async processJob(job: Job): Promise<any> {
    const { name, data } = job;

    switch (name as JobType) {
      case JobType.GENERATE_EMBEDDINGS:
        return this.generateEmbeddings(data);
      default:
        throw new Error(`Unknown job type: ${name}`);
    }
  }

  async generateEmbeddings(data: {
    contentChunkIds: string[];
  }): Promise<{
    processedChunks: number;
    embeddingsGenerated: number;
    failedChunks: number;
  }> {
    const chunkIds = data.contentChunkIds ?? [];
    this.logger.log(`Generating embeddings for ${chunkIds.length} chunks`);

    if (chunkIds.length === 0) {
      return { processedChunks: 0, embeddingsGenerated: 0, failedChunks: 0 };
    }

    const chunks = await this.prismaService.contentChunk.findMany({
      where: {
        id: { in: chunkIds },
        embeddingStatus: { in: ['PENDING', 'FAILED'] },
      },
      select: { id: true, chunkText: true },
    });

    if (chunks.length === 0) {
      this.logger.log('No chunks in PENDING/FAILED state — nothing to do');
      return {
        processedChunks: chunkIds.length,
        embeddingsGenerated: 0,
        failedChunks: 0,
      };
    }

    await this.prismaService.contentChunk.updateMany({
      where: { id: { in: chunks.map((c) => c.id) } },
      data: { embeddingStatus: 'IN_PROGRESS' },
    });

    let embeddingsGenerated = 0;
    let failedChunks = 0;

    for (const chunk of chunks) {
      try {
        const result = await this.embedWithRetry(chunk.chunkText);
        await this.vectorService.storeEmbedding(chunk.id, result.embedding);

        await this.prismaService.contentChunk.update({
          where: { id: chunk.id },
          data: {
            embeddingStatus: 'COMPLETED',
            embeddedAt: new Date(),
            embeddingError: null,
            tokenCount: result.tokenCount,
          },
        });

        embeddingsGenerated += 1;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown embedding error';
        this.logger.error(`Chunk ${chunk.id} failed: ${message}`);

        await this.prismaService.contentChunk.update({
          where: { id: chunk.id },
          data: {
            embeddingStatus: 'FAILED',
            embeddingError: message.slice(0, 500),
          },
        });

        failedChunks += 1;
      }
    }

    this.logger.log(
      `Embedded ${embeddingsGenerated}/${chunks.length} chunks (${failedChunks} failed)`,
    );

    return {
      processedChunks: chunks.length,
      embeddingsGenerated,
      failedChunks,
    };
  }

  /**
   * geminiService.generateEmbedding with exponential backoff. Gemini's
   * transient errors (5xx, ECONNRESET, quota-ish 429s) are retry-safe;
   * 4xx on input shape is not. The SDK doesn't give us clean status codes,
   * so we match on message.
   */
  private async embedWithRetry(content: string) {
    let lastError: unknown;

    for (
      let attempt = 0;
      attempt < EmbeddingGenerationWorker.MAX_RETRIES;
      attempt++
    ) {
      try {
        return await this.geminiService.generateEmbedding(content);
      } catch (error) {
        lastError = error;
        const message =
          error instanceof Error ? error.message.toLowerCase() : '';
        const retryable =
          message.includes('rate') ||
          message.includes('timeout') ||
          message.includes('econnreset') ||
          message.includes('5');

        if (!retryable) break;

        const delay =
          EmbeddingGenerationWorker.INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        this.logger.warn(
          `Gemini transient error on attempt ${attempt + 1}/${EmbeddingGenerationWorker.MAX_RETRIES}, retrying in ${delay}ms: ${message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}
