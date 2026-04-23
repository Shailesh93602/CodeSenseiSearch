import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueService, JobType } from '../services/queue.service';
import { StackOverflowApiService } from '../services/stackoverflow-api.service';
import { PrismaService } from '../services/prisma.service';
import { BaseWorker } from './worker.base';

// StackOverflow Ingestion Worker
@Injectable()
export class StackOverflowIngestionWorker extends BaseWorker {
  constructor(
    queueService: QueueService,
    private readonly stackOverflowApiService: StackOverflowApiService,
    private readonly prismaService: PrismaService,
  ) {
    super(queueService, 'stackoverflow-ingestion', 3);
  }

  protected async processJob(job: Job): Promise<any> {
    const { name, data } = job;

    switch (name as JobType) {
      case JobType.STACKOVERFLOW_INGEST_QUESTION:
        return this.ingestQuestion(data);
      default:
        throw new Error(`Unknown job type: ${name}`);
    }
  }

  private async ingestQuestion(data: any): Promise<any> {
    this.logger.log(`Ingesting StackOverflow question: ${data.questionId}`);

    const { questionId, contentId } = data;

    try {
      // Get question with answers from StackOverflow API
      const { question, answers } =
        await this.stackOverflowApiService.getQuestionWithAnswers(questionId);

      // Update the question with latest data
      await this.prismaService.question.update({
        where: { id: contentId },
        data: {
          title: question.title,
          body: question.body,
          score: question.score,
          viewCount: question.view_count,
          answerCount: question.answer_count,
          isAnswered: question.is_answered,
          hasAcceptedAnswer: !!question.accepted_answer_id,
          tags: question.tags,
          ingestionStatus: 'IN_PROGRESS',
        },
      });

      // Create content record for the question
      const questionContent = await this.prismaService.content.create({
        data: {
          title: question.title,
          content: this.stackOverflowApiService.cleanHtmlContent(question.body),
          contentType: 'STACKOVERFLOW_QUESTION',
          language: this.detectPrimaryLanguage(question.tags),
          questionId: contentId,
          contentHash: this.generateContentHash(question.body),
          isAnswer: false,
          score: question.score,
        },
      });

      // Create content records for answers
      const processedAnswers: any[] = [];
      for (const answer of answers) {
        try {
          // Check if answer content already exists
          const answerContentHash = this.generateContentHash(answer.body);
          const existingAnswer = await this.prismaService.content.findUnique({
            where: { contentHash: answerContentHash },
          });

          if (!existingAnswer) {
            const answerContent = await this.prismaService.content.create({
              data: {
                title: `Answer to: ${question.title}`,
                content: this.stackOverflowApiService.cleanHtmlContent(
                  answer.body,
                ),
                contentType: 'STACKOVERFLOW_ANSWER',
                language: this.detectPrimaryLanguage(question.tags),
                questionId: contentId,
                contentHash: answerContentHash,
                isAnswer: true,
                isAccepted: answer.is_accepted,
                score: answer.score,
              },
            });

            // Queue answer for chunking if it has substantial content
            if (answerContent.content.length > 100) {
              await this.queueService.addContentChunkingJob({
                contentId: answerContent.id,
                chunkSize: 1000,
                overlap: 200,
              });
            }

            processedAnswers.push(answerContent);
          }
        } catch (error) {
          this.logger.error(
            `Failed to process answer ${answer.answer_id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      // Queue the main question content for chunking
      await this.queueService.addContentChunkingJob({
        contentId: questionContent.id,
        chunkSize: 1000,
        overlap: 200,
      });

      // Update ingestion status
      await this.prismaService.question.update({
        where: { id: contentId },
        data: {
          ingestionStatus: 'COMPLETED',
          contentCount: 1 + processedAnswers.length,
        },
      });

      return Promise.resolve({
        questionId,
        contentId,
        answersProcessed: processedAnswers.length,
        status: 'completed',
        codeBlocksFound:
          this.stackOverflowApiService.extractCodeBlocks(question.body).length +
          answers.reduce(
            (total, answer) =>
              total +
              this.stackOverflowApiService.extractCodeBlocks(answer.body)
                .length,
            0,
          ),
      });
    } catch (error) {
      // Update ingestion status to failed
      await this.prismaService.question.update({
        where: { id: contentId },
        data: {
          ingestionStatus: 'FAILED',
          ingestionError:
            error instanceof Error ? error.message : 'Unknown error',
        },
      });

      this.logger.error(
        `StackOverflow question ingestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error,
      );
      throw error;
    }
  }

  private detectPrimaryLanguage(tags: string[]): string | null {
    const languageTags = [
      'javascript',
      'typescript',
      'python',
      'java',
      'csharp',
      'cpp',
      'go',
      'rust',
      'php',
      'ruby',
      'swift',
      'kotlin',
      'scala',
      'r',
      'matlab',
    ];

    for (const tag of tags) {
      if (languageTags.includes(tag.toLowerCase())) {
        return tag.toLowerCase();
      }
    }

    return null;
  }

  private generateContentHash(content: string): string {
    // Simple hash function for content deduplication
    // In production, you'd want to use a proper crypto library
    return Buffer.from(content).toString('base64').slice(0, 32);
  }

  private async getStackOverflowSource() {
    const source = await this.prismaService.source.findUnique({
      where: { name: 'stackoverflow' },
    });

    if (!source) {
      throw new Error('StackOverflow source not found in database');
    }

    return source;
  }
}
