import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueService, JobType } from '../services/queue.service';
import { StackOverflowApiService } from '../services/stackoverflow-api.service';
import { PrismaService } from '../services/prisma.service';
import { BaseWorker } from './worker.base';

// StackOverflow Discovery Worker
@Injectable()
export class StackOverflowDiscoveryWorker extends BaseWorker {
  constructor(
    queueService: QueueService,
    private readonly stackOverflowApiService: StackOverflowApiService,
    private readonly prismaService: PrismaService,
  ) {
    super(queueService, 'stackoverflow-discovery', 2);
  }

  protected async processJob(job: Job): Promise<any> {
    const { name, data } = job;

    switch (name as JobType) {
      case JobType.STACKOVERFLOW_DISCOVER_QUESTIONS:
        return this.discoverQuestions(data);
      default:
        throw new Error(`Unknown job type: ${name}`);
    }
  }

  private async discoverQuestions(data: any): Promise<any> {
    this.logger.log(
      `Discovering StackOverflow questions for tags: ${data.tags.join(', ')}`,
    );

    const { tags, minScore = 10, maxResults = 100 } = data;

    try {
      // Check API quota before making requests
      const quotaStatus = await this.stackOverflowApiService.checkQuotaStatus();
      if (quotaStatus.remaining < 50) {
        throw new Error(
          `StackOverflow API quota too low: ${quotaStatus.remaining} remaining`,
        );
      }

      // Get StackOverflow source record
      const stackOverflowSource = await this.prismaService.source.findUnique({
        where: { name: 'stackoverflow' },
      });

      if (!stackOverflowSource) {
        throw new Error('StackOverflow source not found in database');
      }

      // Search for popular questions
      const questions =
        await this.stackOverflowApiService.getPopularQuestionsByTags(
          tags,
          minScore,
          maxResults,
        );

      // Process discovered questions
      const processedQuestions: Array<{ action: string; question: any }> = [];
      for (const question of questions) {
        try {
          // Check if question already exists
          const existingQuestion = await this.prismaService.question.findUnique(
            { where: { questionId: question.question_id } },
          );

          if (existingQuestion) {
            // Update existing question metadata
            const updatedQuestion = await this.prismaService.question.update({
              where: { questionId: question.question_id },
              data: {
                title: question.title,
                body: question.body,
                score: question.score,
                viewCount: question.view_count,
                answerCount: question.answer_count,
                isAnswered: question.is_answered,
                tags: question.tags,
                updatedAt: new Date(),
              },
            });
            processedQuestions.push({
              action: 'updated',
              question: updatedQuestion,
            });
          } else {
            // Create new question record
            const newQuestion = await this.prismaService.question.create({
              data: {
                sourceId: stackOverflowSource.id,
                questionId: question.question_id,
                title: question.title,
                body: question.body,
                tags: question.tags,
                score: question.score,
                viewCount: question.view_count,
                answerCount: question.answer_count,
                isAnswered: question.is_answered,
                hasAcceptedAnswer: !!question.accepted_answer_id,
                htmlUrl: question.link,
                ingestionStatus: 'PENDING',
              },
            });

            // Queue question for ingestion (to get answers)
            await this.queueService.addStackOverflowIngestionJob(
              {
                questionId: question.question_id,
                contentId: newQuestion.id,
                priority: this.calculatePriority(
                  question.score,
                  question.answer_count,
                ),
              },
              {
                priority: this.calculatePriority(
                  question.score,
                  question.answer_count,
                ),
              },
            );

            processedQuestions.push({
              action: 'created',
              question: newQuestion,
            });
          }
        } catch (error) {
          this.logger.error(
            `Failed to process question ${question.question_id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      return {
        success: true,
        discovered: questions.length,
        processed: processedQuestions.length,
        questions: processedQuestions,
        quotaRemaining: quotaStatus.remaining,
      };
    } catch (error) {
      this.logger.error(
        `StackOverflow question discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

  private calculatePriority(score: number, answerCount: number): number {
    let priority = 5; // Base priority

    // Higher priority for higher scored questions
    if (score > 100) priority += 3;
    else if (score > 50) priority += 2;
    else if (score > 20) priority += 1;

    // Higher priority for questions with good answers
    if (answerCount > 5) priority += 2;
    else if (answerCount > 2) priority += 1;

    return Math.min(priority, 10); // Cap at 10
  }
}
