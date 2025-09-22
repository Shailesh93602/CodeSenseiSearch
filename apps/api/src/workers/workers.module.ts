import { Module } from '@nestjs/common';
import { QueueService } from '../services/queue.service';
import { GitHubApiService } from '../services/github-api.service';
import { PrismaService } from '../services/prisma.service';
import {
  GitHubDiscoveryWorker,
  GitHubIngestionWorker,
  GitHubProcessingWorker,
  StackOverflowDiscoveryWorker,
  StackOverflowIngestionWorker,
  ContentChunkingWorker,
  EmbeddingGenerationWorker,
} from './base.worker';

/**
 * Workers Module
 * This module provides all the background workers for content ingestion,
 * processing, and embedding generation. It integrates with the BullMQ
 * job queue system and Redis for distributed processing.
 * Workers included:
 * - GitHubDiscoveryWorker: Discovers GitHub repositories
 * - GitHubIngestionWorker: Ingests repository content
 * - GitHubProcessingWorker: Processes raw content into structured data
 * - StackOverflowDiscoveryWorker: Discovers StackOverflow questions
 * - StackOverflowIngestionWorker: Ingests question and answer content
 * - ContentChunkingWorker: Chunks content for embedding generation
 * - EmbeddingGenerationWorker: Generates vector embeddings using OpenAI
 */
@Module({
  providers: [
    QueueService,
    GitHubApiService,
    PrismaService,
    GitHubDiscoveryWorker,
    GitHubIngestionWorker,
    GitHubProcessingWorker,
    StackOverflowDiscoveryWorker,
    StackOverflowIngestionWorker,
    ContentChunkingWorker,
    EmbeddingGenerationWorker,
  ],
  exports: [
    QueueService,
    GitHubApiService,
    PrismaService,
    GitHubDiscoveryWorker,
    GitHubIngestionWorker,
    GitHubProcessingWorker,
    StackOverflowDiscoveryWorker,
    StackOverflowIngestionWorker,
    ContentChunkingWorker,
    EmbeddingGenerationWorker,
  ],
})
export class WorkersModule {
  constructor(
    private readonly githubDiscoveryWorker: GitHubDiscoveryWorker,
    private readonly githubIngestionWorker: GitHubIngestionWorker,
    private readonly githubProcessingWorker: GitHubProcessingWorker,
    private readonly stackoverflowDiscoveryWorker: StackOverflowDiscoveryWorker,
    private readonly stackoverflowIngestionWorker: StackOverflowIngestionWorker,
    private readonly contentChunkingWorker: ContentChunkingWorker,
    private readonly embeddingGenerationWorker: EmbeddingGenerationWorker,
  ) {
    // Workers are automatically initialized through their constructors
    // The BullMQ Worker instances are created and start listening for jobs
    console.log('All workers initialized and ready to process jobs');
  }

  /**
   * Gracefully shut down all workers
   * This should be called when the application is shutting down
   */
  async onModuleDestroy() {
    const workers = [
      this.githubDiscoveryWorker,
      this.githubIngestionWorker,
      this.githubProcessingWorker,
      this.stackoverflowDiscoveryWorker,
      this.stackoverflowIngestionWorker,
      this.contentChunkingWorker,
      this.embeddingGenerationWorker,
    ];

    // Close all workers gracefully
    await Promise.all(
      workers.map(async (worker) => {
        await worker.close();
      }),
    );

    console.log('All workers shut down gracefully');
  }
}
