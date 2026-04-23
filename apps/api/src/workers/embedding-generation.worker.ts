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
        // GeminiService handles transient-error backoff internally now;
        // we just propagate any failure so the chunk gets marked FAILED.
        const result = await this.geminiService.generateEmbedding(chunk.chunkText);
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

}
