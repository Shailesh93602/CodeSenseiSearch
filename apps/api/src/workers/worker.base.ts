import { Injectable, Logger } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { QueueService } from '../services/queue.service';

/**
 * Shared BullMQ worker base.
 *
 * Constructs a BullMQ Worker bound to the given queue name + concurrency
 * and forwards jobs to `processJob`. Subclasses implement `processJob`
 * with the queue's specific routing logic. Lifecycle events (completed,
 * failed, stalled, errored) are logged.
 *
 * Extracted out of the monolithic base.worker.ts so individual worker
 * specs can import only what they need (without pulling in Octokit /
 * Google SDKs via sibling workers).
 */
@Injectable()
export abstract class BaseWorker {
  protected readonly logger = new Logger(this.constructor.name);
  protected worker: Worker;

  constructor(
    protected queueService: QueueService,
    protected queueName: string,
    protected concurrency: number = 5,
  ) {
    this.initializeWorker();
  }

  private initializeWorker() {
    this.worker = new Worker(
      this.queueName,
      async (job: Job) => {
        this.logger.log(`Processing job ${job.id} of type ${job.name}`);
        try {
          const result = await this.processJob(job);
          this.logger.log(`Completed job ${job.id} successfully`);
          return result;
        } catch (error) {
          this.logger.error(`Failed to process job ${job.id}:`, error);
          throw error;
        }
      },
      {
        connection: this.queueService.getRedisConnection(),
        concurrency: this.concurrency,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed:`, err);
    });

    this.worker.on('stalled', (jobId) => {
      this.logger.warn(`Job ${jobId} stalled`);
    });

    this.worker.on('error', (err) => {
      this.logger.error('Worker error:', err);
    });

    this.queueService.registerWorker(this.queueName, this.worker);
    this.logger.log(`Worker initialized for queue: ${this.queueName}`);
  }

  protected abstract processJob(job: Job): Promise<any>;

  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.logger.log(`Worker ${this.queueName} closed successfully`);
    }
  }
}
