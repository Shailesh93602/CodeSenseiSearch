import {
  Controller,
  ForbiddenException,
  Headers,
  Post,
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
  async seedDemo(@Headers('x-seed-secret') providedSecret?: string) {
    const expected = process.env.SEED_SECRET;
    if (!expected) {
      throw new ServiceUnavailableException(
        'Seeding is disabled — SEED_SECRET is not configured.',
      );
    }
    if (providedSecret !== expected) {
      throw new ForbiddenException('Invalid seed secret.');
    }

    try {
      const result = await this.seedService.seedDemoCorpus();
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
