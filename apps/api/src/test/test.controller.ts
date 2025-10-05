import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { GitHubApiService } from '../services/github-api.service';
import { StackOverflowApiService } from '../services/stackoverflow-api.service';
import { QueueService } from '../services/queue.service';
import { PrismaService } from '../services/prisma.service';
import { GeminiService } from '../services/gemini.service';
import { VectorService } from '../services/vector.service';
import { SearchService } from '../services/search.service';

@Controller('test')
export class TestController {
  constructor(
    private readonly githubApiService: GitHubApiService,
    private readonly stackOverflowApiService: StackOverflowApiService,
    private readonly queueService: QueueService,
    private readonly prismaService: PrismaService,
    private readonly geminiService: GeminiService,
    private readonly vectorService: VectorService,
    private readonly searchService: SearchService,
  ) {}

  @Get('health')
  healthCheck() {
    return {
      success: true,
      message: 'Test endpoints are operational',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('github/rate-limit')
  async checkGitHubRateLimit() {
    try {
      const rateLimit = await this.githubApiService.getRateLimit();
      const canMakeRequests = await this.githubApiService.checkRateLimit(10);

      return {
        success: true,
        rateLimit,
        canMakeRequests,
        recommendation: canMakeRequests
          ? 'Safe to proceed with API calls'
          : 'Rate limit too low, wait before making requests',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        recommendation: 'Check GitHub token configuration',
      };
    }
  }

  @Get('github/search')
  async testGitHubSearch(
    @Query('language') language: string = 'typescript',
    @Query('minStars') minStars: string = '100',
  ) {
    try {
      const repositories =
        await this.githubApiService.searchRepositoriesByLanguage(
          language,
          parseInt(minStars),
          5, // Limit to 5 for testing
        );

      return {
        success: true,
        query: { language, minStars },
        found: repositories.totalCount,
        repositories: repositories.items.slice(0, 3), // Show first 3
        rateLimit: repositories.rateLimit,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('github/repository/:owner/:repo')
  async testGitHubRepository(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
  ) {
    try {
      const repository = await this.githubApiService.getRepository(owner, repo);
      const tree = await this.githubApiService.getRepositoryTree(
        owner,
        repo,
        repository.defaultBranch,
      );

      return {
        success: true,
        repository: {
          name: repository.name,
          owner: repository.owner.login,
          stars: repository.stargazersCount,
          language: repository.language,
          defaultBranch: repository.defaultBranch,
        },
        fileCount: tree.length,
        sampleFiles: tree.slice(0, 10), // Show first 10 files
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('stackoverflow/quota')
  async checkStackOverflowQuota() {
    try {
      const quota = await this.stackOverflowApiService.checkQuotaStatus();

      return {
        success: true,
        quota,
        recommendation:
          quota.remaining > 100
            ? 'Safe to proceed with API calls'
            : 'Quota low, consider rate limiting',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('stackoverflow/questions')
  async testStackOverflowQuestions(
    @Query('tags') tags: string = 'typescript,javascript',
    @Query('minScore') minScore: string = '10',
  ) {
    try {
      const tagArray = tags.split(',');
      const questions =
        await this.stackOverflowApiService.getPopularQuestionsByTags(
          tagArray,
          parseInt(minScore),
          5, // Limit to 5 for testing
        );

      return {
        success: true,
        query: { tags: tagArray, minScore },
        questions: questions.map((q) => ({
          id: q.question_id,
          title: q.title,
          score: q.score,
          answerCount: q.answer_count,
          tags: q.tags,
          isAnswered: q.is_answered,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('stackoverflow/question/:questionId')
  async testStackOverflowQuestion(@Param('questionId') questionId: string) {
    try {
      const result = await this.stackOverflowApiService.getQuestionWithAnswers(
        parseInt(questionId),
      );

      return {
        success: true,
        question: {
          id: result.question.question_id,
          title: result.question.title,
          score: result.question.score,
          bodyLength: result.question.body.length,
          tags: result.question.tags,
        },
        answers: result.answers.map((a) => ({
          id: a.answer_id,
          score: a.score,
          isAccepted: a.is_accepted,
          bodyLength: a.body.length,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('database/connection')
  async testDatabaseConnection() {
    try {
      // Test basic connection
      await this.prismaService.$queryRaw`SELECT 1`;

      // Test schema - check if our tables exist
      const sources = await this.prismaService.source.count();
      const repositories = await this.prismaService.repository.count();
      const questions = await this.prismaService.question.count();
      const content = await this.prismaService.content.count();
      const chunks = await this.prismaService.contentChunk.count();

      return {
        success: true,
        connection: 'Connected',
        schema: 'Tables accessible',
        counts: {
          sources,
          repositories,
          questions,
          content,
          chunks,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        recommendation: 'Check database connection and migrations',
      };
    }
  }

  @Get('queues/status')
  async testQueuesStatus() {
    try {
      const queueNames = [
        'github-discovery',
        'github-ingestion',
        'github-processing',
        'stackoverflow-discovery',
        'stackoverflow-ingestion',
        'content-chunking',
        'embedding-generation',
      ];

      const queueStatuses = {};
      for (const queueName of queueNames) {
        try {
          const status = await this.queueService.getQueueStatus(queueName);
          queueStatuses[queueName] = status;
        } catch (error) {
          queueStatuses[queueName] = {
            error: error instanceof Error ? error.message : 'Queue not found',
          };
        }
      }

      return {
        success: true,
        queues: queueStatuses,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Post('pipeline/github')
  async testGitHubPipeline(
    @Body()
    body: {
      language?: string;
      minStars?: number;
      maxResults?: number;
      testMode?: boolean;
    },
  ) {
    const {
      language = 'typescript',
      minStars = 100,
      maxResults = 1,
      testMode = true,
    } = body;

    try {
      // Start GitHub discovery job
      const job = await this.queueService.addGitHubDiscoveryJob({
        language,
        minStars,
        maxResults,
        query: testMode ? `${language} test tutorial` : undefined,
      });

      return {
        success: true,
        message: 'GitHub pipeline test started',
        jobId: job.id,
        jobName: job.name,
        jobData: job.data,
        recommendation: 'Monitor queue status and database for results',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Post('pipeline/stackoverflow')
  async testStackOverflowPipeline(
    @Body() body: { tags?: string[]; minScore?: number; maxResults?: number },
  ) {
    const { tags = ['typescript'], minScore = 20, maxResults = 2 } = body;

    try {
      // Start StackOverflow discovery job
      const job = await this.queueService.addStackOverflowDiscoveryJob({
        tags,
        minScore,
        maxResults,
      });

      return {
        success: true,
        message: 'StackOverflow pipeline test started',
        jobId: job.id,
        jobName: job.name,
        jobData: job.data,
        recommendation: 'Monitor queue status and database for results',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('content/recent')
  async getRecentContent(@Query('limit') limit: string = '10') {
    try {
      const content = await this.prismaService.content.findMany({
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          repository: {
            select: { fullName: true, language: true },
          },
          question: {
            select: { title: true, tags: true },
          },
          _count: {
            select: { chunks: true },
          },
        },
      });

      return {
        success: true,
        content: content.map((c) => ({
          id: c.id,
          title: c.title,
          contentType: c.contentType,
          language: c.language,
          chunkCount: c._count.chunks,
          repository: c.repository?.fullName,
          question: c.question?.title,
          createdAt: c.createdAt,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('chunks/recent')
  async getRecentChunks(@Query('limit') limit: string = '5') {
    try {
      const chunks = await this.prismaService.contentChunk.findMany({
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          content: {
            select: {
              title: true,
              contentType: true,
              repository: { select: { fullName: true } },
              question: { select: { title: true } },
            },
          },
        },
      });

      return {
        success: true,
        chunks: chunks.map((chunk) => ({
          id: chunk.id,
          sequence: chunk.sequence,
          textLength: chunk.chunkText.length,
          embeddingStatus: chunk.embeddingStatus,
          tokenCount: chunk.tokenCount,
          contentTitle: chunk.content.title,
          contentType: chunk.content.contentType,
          createdAt: chunk.createdAt,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============ Phase 3: Semantic Search Test Endpoints ============

  @Get('gemini/status')
  async testGeminiConnection() {
    try {
      const isAvailable = this.geminiService.isAvailable();
      if (!isAvailable) {
        return {
          success: false,
          error: 'Gemini service not available - check GEMINI_API_KEY',
          recommendation: 'Set GEMINI_API_KEY environment variable',
        };
      }

      const modelInfo = this.geminiService.getModelInfo();
      const rateLimitInfo = await this.geminiService.getRateLimitInfo();

      return {
        success: true,
        available: isAvailable,
        modelInfo,
        rateLimitInfo,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Post('gemini/embedding')
  async testEmbeddingGeneration(@Body() body: { text: string }) {
    try {
      if (!body.text || body.text.trim().length === 0) {
        return {
          success: false,
          error: 'Text is required',
        };
      }

      const result = await this.geminiService.generateEmbedding(body.text);

      return {
        success: true,
        embedding: {
          model: result.model,
          tokenCount: result.tokenCount,
          dimensions: result.embedding.length,
          sampleValues: result.embedding.slice(0, 5), // Show first 5 dimensions
          timestamp: result.timestamp,
        },
        cost: (result.tokenCount / 1000) * 0.0000125, // Gemini cost
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('vector/stats')
  async testVectorStats() {
    try {
      const isAvailable = await this.vectorService.checkVectorExtension();
      const stats = await this.vectorService.getEmbeddingStats();

      return {
        success: true,
        vectorExtensionAvailable: isAvailable,
        embeddingStats: stats,
        recommendation: isAvailable
          ? 'Vector search is ready'
          : 'pgvector extension not installed - using fallback storage',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Post('search/semantic')
  async testSemanticSearch(@Body() body: { query: string; limit?: number }) {
    try {
      if (!body.query || body.query.trim().length === 0) {
        return {
          success: false,
          error: 'Query is required',
        };
      }

      const result = await this.searchService.semanticSearch(body.query, {
        limit: body.limit ?? 5,
      });

      return {
        success: true,
        searchResult: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Post('search/text')
  async testTextSearch(@Body() body: { query: string; limit?: number }) {
    try {
      if (!body.query || body.query.trim().length === 0) {
        return {
          success: false,
          error: 'Query is required',
        };
      }

      const results = await this.searchService.textSearch(body.query, {
        limit: body.limit ?? 5,
      });

      return {
        success: true,
        query: body.query,
        results,
        totalResults: results.length,
        searchMethod: 'text',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('search/stats')
  async testSearchStats() {
    try {
      const stats = await this.searchService.getSearchStats();

      return {
        success: true,
        searchStats: stats,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('search/suggestions')
  async testSearchSuggestions(@Query('q') query: string) {
    try {
      if (!query || query.trim().length < 2) {
        return {
          success: true,
          suggestions: [],
          message: 'Query too short (minimum 2 characters)',
        };
      }

      const suggestions = await this.searchService.getSearchSuggestions(query);

      return {
        success: true,
        query,
        suggestions,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
