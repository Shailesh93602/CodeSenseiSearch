import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../services/prisma.service';
import { QueueService } from '../services/queue.service';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  @ApiOperation({
    summary: 'Aggregate dashboard counters',
    description:
      'Returns counts of repositories, questions, content, chunks, ' +
      'pending/failed processing, plus the 5 most recent ingested ' +
      'items per source. Drives the admin home page.',
  })
  @Get('dashboard')
  async getDashboard() {
    try {
      // Get database statistics
      const [
        repositories,
        questions,
        content,
        chunks,
        pendingContent,
        processingRepositories,
        failedJobs,
      ] = await Promise.all([
        this.prismaService.repository.count(),
        this.prismaService.question.count(),
        this.prismaService.content.count(),
        this.prismaService.contentChunk.count(),
        this.prismaService.content.count({
          where: { processedAt: null },
        }),
        this.prismaService.repository.count({
          where: { ingestionStatus: 'IN_PROGRESS' },
        }),
        this.prismaService.repository.count({
          where: { ingestionStatus: 'FAILED' },
        }),
      ]);

      // Get recent activity
      const recentRepositories = await this.prismaService.repository.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          fullName: true,
          language: true,
          starCount: true,
          ingestionStatus: true,
          createdAt: true,
        },
      });

      const recentQuestions = await this.prismaService.question.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          title: true,
          tags: true,
          score: true,
          ingestionStatus: true,
          createdAt: true,
        },
      });

      // Get content statistics by type
      const contentByType = await this.prismaService.content.groupBy({
        by: ['contentType'],
        _count: {
          id: true,
        },
      });

      // Get language distribution
      const languageDistribution = await this.prismaService.content.groupBy({
        by: ['language'],
        _count: {
          id: true,
        },
        where: {
          language: { not: null },
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
        take: 10,
      });

      return {
        success: true,
        timestamp: new Date().toISOString(),
        statistics: {
          total: {
            repositories,
            questions,
            content,
            chunks,
          },
          processing: {
            pendingContent,
            processingRepositories,
            failedJobs,
          },
          contentByType: contentByType.map((item) => ({
            type: item.contentType,
            count: item._count.id,
          })),
          languageDistribution: languageDistribution.map((item) => ({
            language: item.language,
            count: item._count.id,
          })),
        },
        recentActivity: {
          repositories: recentRepositories,
          questions: recentQuestions,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
    }
  }

  @ApiOperation({
    summary: 'Database + queue health probes',
    description:
      'Pings Postgres with `SELECT 1` and queries the github-discovery, ' +
      'github-processing, and content-chunking BullMQ queues. Returns ' +
      'overallHealth: "healthy" | "degraded".',
  })
  @Get('system-health')
  async getSystemHealth() {
    const checks: Array<{
      service: string;
      status: 'healthy' | 'unhealthy';
      message: string;
    }> = [];

    // Database health
    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      checks.push({
        service: 'database',
        status: 'healthy',
        message: 'Connected',
      });
    } catch (error) {
      checks.push({
        service: 'database',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Connection failed',
      });
    }

    // Queue health (check a few key queues)
    const queueNames = [
      'github-discovery',
      'github-processing',
      'content-chunking',
    ];
    for (const queueName of queueNames) {
      try {
        const status = await this.queueService.getQueueStatus(queueName);
        checks.push({
          service: `queue-${queueName}`,
          status: 'healthy',
          message: `Active: ${status.active || 0}, Waiting: ${status.waiting || 0}`,
        });
      } catch (error) {
        checks.push({
          service: `queue-${queueName}`,
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Queue error',
        });
      }
    }

    // Overall health assessment
    const unhealthyServices = checks.filter(
      (check) => check.status === 'unhealthy',
    );

    const overallHealth =
      unhealthyServices.length === 0 ? 'healthy' : 'degraded';

    return {
      overallHealth,
      timestamp: new Date().toISOString(),
      services: checks,
      summary: {
        total: checks.length,
        healthy: checks.filter((c) => c.status === 'healthy').length,
        unhealthy: unhealthyServices.length,
      },
    };
  }

  @ApiOperation({
    summary: 'Last 24h ingestion + processing throughput',
    description:
      'Counts of repositories, questions, content, and chunks created ' +
      'in the past 24 hours, plus a status-distribution histogram so ' +
      'failed pipelines surface immediately.',
  })
  @Get('processing-stats')
  async getProcessingStats() {
    try {
      // Get processing statistics for the last 24 hours
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);

      const [recentRepositories, recentQuestions, recentContent, recentChunks] =
        await Promise.all([
          this.prismaService.repository.count({
            where: { createdAt: { gte: yesterday } },
          }),
          this.prismaService.question.count({
            where: { createdAt: { gte: yesterday } },
          }),
          this.prismaService.content.count({
            where: { createdAt: { gte: yesterday } },
          }),
          this.prismaService.contentChunk.count({
            where: { createdAt: { gte: yesterday } },
          }),
        ]);

      // Get status distribution
      const repositoryStatuses = await this.prismaService.repository.groupBy({
        by: ['ingestionStatus'],
        _count: { id: true },
      });

      const questionStatuses = await this.prismaService.question.groupBy({
        by: ['ingestionStatus'],
        _count: { id: true },
      });

      return {
        success: true,
        period: '24 hours',
        timestamp: new Date().toISOString(),
        processed: {
          repositories: recentRepositories,
          questions: recentQuestions,
          content: recentContent,
          chunks: recentChunks,
        },
        statusDistribution: {
          repositories: repositoryStatuses.map((s) => ({
            status: s.ingestionStatus,
            count: s._count.id,
          })),
          questions: questionStatuses.map((s) => ({
            status: s.ingestionStatus,
            count: s._count.id,
          })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
