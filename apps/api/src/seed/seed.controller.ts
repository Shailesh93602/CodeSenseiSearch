import {
  Controller,
  ForbiddenException,
  Headers,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { SeedService } from './seed.service';

/**
 * One-shot seeding route. Authorization is a simple shared secret in
 * the `x-seed-secret` header — deliberately not wired into the full
 * JWT + roles guard stack, because an operator needs to call this
 * before any users exist.
 *
 *   curl -X POST https://<api>/api/seed/demo -H "x-seed-secret: $SECRET"
 *
 * Idempotent. Safe to call multiple times; only items missing a
 * chunk embedding do any real work on the second run.
 */
@ApiExcludeController()
@Controller('seed')
@SkipThrottle()
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post('demo')
  async seedDemo(
    @Headers('x-seed-secret') providedSecret?: string,
    /**
     * Cap how many NEW embeddings this call generates. Useful when
     * the corpus has > ~50 unembedded items (Vercel function timeout
     * is 60s; one embedding ~1.2s). Operator calls the endpoint in
     * a loop until {embedded: 0} is returned, indicating the corpus
     * is fully embedded.
     */
    @Query('limit') limitParam?: string,
  ) {
    const expected = process.env.SEED_SECRET;
    if (!expected) {
      throw new ServiceUnavailableException(
        'Seeding is disabled — SEED_SECRET is not configured.',
      );
    }
    if (providedSecret !== expected) {
      throw new ForbiddenException('Invalid seed secret.');
    }

    const limit = limitParam ? Math.max(1, Number(limitParam)) : undefined;

    try {
      const result = await this.seedService.seedDemoCorpus({ limit });
      return { success: true, ...result };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        stack:
          err instanceof Error
            ? err.stack?.split('\n').slice(0, 5).join(' | ')
            : undefined,
      };
    }
  }
}
