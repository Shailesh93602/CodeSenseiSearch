import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

// Job Types for different ingestion operations
export enum JobType {
  GITHUB_DISCOVER_REPOSITORIES = 'github:discover-repositories',
  GITHUB_INGEST_REPOSITORY = 'github:ingest-repository',
  GITHUB_PROCESS_FILE = 'github:process-file',
  GITHUB_PROCESS_CONTENT = 'github:process-content',
  STACKOVERFLOW_DISCOVER_QUESTIONS = 'stackoverflow:discover-questions',
  STACKOVERFLOW_INGEST_QUESTION = 'stackoverflow:ingest-question',
  GENERATE_EMBEDDINGS = 'generate-embeddings',
  CHUNK_CONTENT = 'chunk-content',
}

// Job Data Interfaces
export interface GitHubDiscoverJobData {
  language: string;
  minStars: number;
  maxResults: number;
  query?: string;
}

export interface GitHubIngestRepositoryJobData {
  owner: string;
  name: string;
  fullName: string;
  priority: number;
  repositoryId?: string;
}

export interface GitHubProcessFileJobData {
  repositoryId: string;
  filePath: string;
  fileName: string;
  downloadUrl: string;
  language: string;
  size: number;
}

export interface StackOverflowDiscoverJobData {
  tags: string[];
  minScore: number;
  maxResults: number;
  fromDate?: Date;
}

export interface StackOverflowIngestQuestionJobData {
  questionId: number;
  contentId: string;
  priority: number;
}

export interface GenerateEmbeddingsJobData {
  contentChunkIds: string[];
  model: string;
  batchSize: number;
}

export interface ChunkContentJobData {
  contentId: string;
  chunkSize?: number;
  overlap?: number;
}

// Queue Configuration
export interface QueueConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  defaultJobOptions: {
    removeOnComplete: number;
    removeOnFail: number;
    attempts: number;
    backoff: {
      type: string;
      delay: number;
    };
  };
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private redis: Redis;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();

  constructor(private configService: ConfigService) {
    this.initializeRedis();
    this.initializeQueues();
  }

  private initializeRedis() {
    const redisConfig = {
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get('REDIS_DB', 0),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: null, // Required for BullMQ
      lazyConnect: true,
    };

    this.redis = new Redis(redisConfig);

    this.redis.on('connect', () => {
      this.logger.log('Connected to Redis');
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error:', error);
    });
  }

  private initializeQueues() {
    const queueConfig = {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    };

    // Initialize different queues for different job types
    const queueNames = [
      'github-discovery',
      'github-ingestion',
      'github-processing',
      'stackoverflow-discovery',
      'stackoverflow-ingestion',
      'embedding-generation',
      'content-chunking',
    ];

    queueNames.forEach((queueName) => {
      const queue = new Queue(queueName, queueConfig);
      this.queues.set(queueName, queue);
      this.logger.log(`Initialized queue: ${queueName}`);
    });
  }

  // GitHub Discovery Jobs
  async addGitHubDiscoveryJob(
    data: GitHubDiscoverJobData,
    options?: { priority?: number; delay?: number },
  ): Promise<Job> {
    const queue = this.queues.get('github-discovery');
    if (!queue) {
      throw new Error('GitHub discovery queue not found');
    }
    return queue.add(JobType.GITHUB_DISCOVER_REPOSITORIES, data, {
      priority: options?.priority || 1,
      delay: options?.delay || 0,
    });
  }

  // GitHub Repository Ingestion Jobs
  async addGitHubIngestionJob(
    data: GitHubIngestRepositoryJobData,
    options?: { priority?: number; delay?: number },
  ): Promise<Job> {
    const queue = this.queues.get('github-ingestion');
    if (!queue) {
      throw new Error('GitHub ingestion queue not found');
    }
    return queue.add(JobType.GITHUB_INGEST_REPOSITORY, data, {
      priority: options?.priority || 1,
      delay: options?.delay || 0,
    });
  }

  // GitHub File Processing Jobs
  async addGitHubFileProcessingJob(
    data: GitHubProcessFileJobData,
    options?: { priority?: number; delay?: number },
  ): Promise<Job> {
    const queue = this.queues.get('github-processing');
    if (!queue) {
      throw new Error('GitHub processing queue not found');
    }
    return queue.add(JobType.GITHUB_PROCESS_FILE, data, {
      priority: options?.priority || 1,
      delay: options?.delay || 0,
    });
  }

  // StackOverflow Discovery Jobs
  async addStackOverflowDiscoveryJob(
    data: StackOverflowDiscoverJobData,
    options?: { priority?: number; delay?: number },
  ): Promise<Job> {
    const queue = this.queues.get('stackoverflow-discovery');
    if (!queue) {
      throw new Error('StackOverflow discovery queue not found');
    }
    return queue.add(JobType.STACKOVERFLOW_DISCOVER_QUESTIONS, data, {
      priority: options?.priority || 1,
      delay: options?.delay || 0,
    });
  }

  // StackOverflow Question Ingestion Jobs
  async addStackOverflowIngestionJob(
    data: StackOverflowIngestQuestionJobData,
    options?: { priority?: number; delay?: number },
  ): Promise<Job> {
    const queue = this.queues.get('stackoverflow-ingestion');
    if (!queue) {
      throw new Error('StackOverflow ingestion queue not found');
    }
    return queue.add(JobType.STACKOVERFLOW_INGEST_QUESTION, data, {
      priority: options?.priority || 1,
      delay: options?.delay || 0,
    });
  }

  // Embedding Generation Jobs
  async addEmbeddingGenerationJob(
    data: GenerateEmbeddingsJobData,
    options?: { priority?: number; delay?: number },
  ): Promise<Job> {
    const queue = this.queues.get('embedding-generation');
    if (!queue) {
      throw new Error('Embedding generation queue not found');
    }
    return queue.add(JobType.GENERATE_EMBEDDINGS, data, {
      priority: options?.priority || 1,
      delay: options?.delay || 0,
    });
  }

  // Content Chunking Jobs
  async addContentChunkingJob(
    data: ChunkContentJobData,
    options?: { priority?: number; delay?: number },
  ): Promise<Job> {
    const queue = this.queues.get('content-chunking');
    if (!queue) {
      throw new Error('Content chunking queue not found');
    }
    return queue.add(JobType.CHUNK_CONTENT, data, {
      priority: options?.priority || 1,
      delay: options?.delay || 0,
    });
  }

  // Queue Management Methods
  async getQueueStatus(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      name: queueName,
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  async getAllQueuesStatus() {
    const statuses = await Promise.all(
      Array.from(this.queues.keys()).map((queueName) =>
        this.getQueueStatus(queueName),
      ),
    );
    return statuses;
  }

  async pauseQueue(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    await queue.pause();
    this.logger.log(`Paused queue: ${queueName}`);
  }

  async resumeQueue(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    await queue.resume();
    this.logger.log(`Resumed queue: ${queueName}`);
  }

  async cleanQueue(
    queueName: string,
    options: {
      grace?: number;
      count?: number;
      type?: 'completed' | 'failed' | 'active' | 'waiting';
    } = {},
  ) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.clean(
      options.grace || 24 * 60 * 60 * 1000, // 24 hours default
      options.count || 100,
      options.type || 'completed',
    );

    this.logger.log(`Cleaned queue: ${queueName}`);
  }

  async getJob(queueName: string, jobId: string) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    return queue.getJob(jobId);
  }

  async removeJob(queueName: string, jobId: string) {
    const job = await this.getJob(queueName, jobId);
    if (job) {
      await job.remove();
      this.logger.log(`Removed job ${jobId} from queue ${queueName}`);
    }
  }

  // Graceful shutdown
  async shutdown() {
    this.logger.log('Shutting down queue service...');

    // Close all workers
    for (const [name, worker] of this.workers) {
      await worker.close();
      this.logger.log(`Closed worker: ${name}`);
    }

    // Close all queues
    for (const [name, queue] of this.queues) {
      await queue.close();
      this.logger.log(`Closed queue: ${name}`);
    }

    // Close Redis connection
    await this.redis.quit();
    this.logger.log('Queue service shutdown complete');
  }

  // Get Redis connection for workers
  getRedisConnection(): Redis {
    return this.redis;
  }

  // Register a worker
  registerWorker(queueName: string, worker: Worker) {
    this.workers.set(queueName, worker);
    this.logger.log(`Registered worker for queue: ${queueName}`);
  }
}
