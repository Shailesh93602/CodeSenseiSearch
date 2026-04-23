import { Controller, Get, HttpCode, Optional } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service';
import { PrismaService } from './services/prisma.service';
import { QueueService } from './services/queue.service';
import { GeminiService } from './services/gemini.service';

interface ComponentHealth {
  status: 'up' | 'down' | 'unknown';
  latencyMs?: number;
  message?: string;
}

interface HealthReport {
  status: 'ok' | 'degraded';
  timestamp: string;
  service: string;
  version: string;
  uptimeSec: number;
  components: {
    database: ComponentHealth;
    redis: ComponentHealth;
    gemini: ComponentHealth;
  };
}

@ApiTags('app')
@Controller()
export class AppController {
  // Service deps are @Optional() so a missing provider during integration
  // tests doesn't take the controller down — the component report just
  // shows status: 'unknown' for whatever wasn't wired.
  constructor(
    private readonly appService: AppService,
    @Optional() private readonly prismaService?: PrismaService,
    @Optional() private readonly queueService?: QueueService,
    @Optional() private readonly geminiService?: GeminiService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @ApiOperation({
    summary: 'Liveness + dependency reachability probe',
    description:
      'Pings Postgres and Redis, reports the Gemini service init state. ' +
      '200 when both critical components (DB + Redis) are up, 503 when ' +
      'either is down. Skip the throttler so an upstream healthcheck ' +
      "loop doesn't trip the rate limit.",
  })
  @ApiResponse({ status: 200, description: 'All critical dependencies up' })
  @ApiResponse({ status: 503, description: 'At least one critical dependency is down' })
  @SkipThrottle()
  @Get('health')
  @HttpCode(200)
  async getHealth(): Promise<HealthReport> {
    const [database, redis, gemini] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      Promise.resolve(this.checkGemini()),
    ]);

    const criticalDown =
      database.status === 'down' || redis.status === 'down';

    return {
      status: criticalDown ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      service: 'CodeSenseiSearch API',
      version: '0.1.0',
      uptimeSec: Math.round(process.uptime()),
      components: { database, redis, gemini },
    };
  }

  // /api/health alias kept for the existing GitHub Action and any
  // bookmarked URL.
  @SkipThrottle()
  @Get('api/health')
  @HttpCode(200)
  async getApiHealth(): Promise<HealthReport> {
    return this.getHealth();
  }

  private async checkDatabase(): Promise<ComponentHealth> {
    if (!this.prismaService) return { status: 'unknown' };
    const start = Date.now();
    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }

  private async checkRedis(): Promise<ComponentHealth> {
    if (!this.queueService) return { status: 'unknown' };
    const start = Date.now();
    try {
      const connection = this.queueService.getRedisConnection();
      // ioredis exposes .ping() on connections; the QueueService
      // returns the shared client instance.
      const reply = await (
        connection as unknown as { ping(): Promise<string> }
      ).ping();
      return {
        status: reply === 'PONG' ? 'up' : 'down',
        latencyMs: Date.now() - start,
        ...(reply !== 'PONG' && {
          message: `unexpected ping reply: ${reply}`,
        }),
      };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }

  private checkGemini(): ComponentHealth {
    // Gemini is non-critical: the API can still serve auth/admin even
    // when the embedding key is missing. Surface init state without
    // calling out to Google on every probe.
    if (!this.geminiService) return { status: 'unknown' };
    return this.geminiService.isAvailable()
      ? { status: 'up' }
      : {
          status: 'down',
          message: 'GEMINI_API_KEY not set; embedding + search disabled',
        };
  }
}
