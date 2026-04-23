/**
 * Sentry instrumentation. Imported at the very top of main.ts before
 * anything else so Sentry can monkey-patch http / express / undici
 * before the app constructs anything that uses them.
 *
 * Skipped entirely when SENTRY_DSN is unset — the API still boots and
 * runs, just without error capture. This keeps local dev free of an
 * "you must set X" wall.
 */
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    // Performance traces — sample at 10% by default in production,
    // 100% in dev. Tune via SENTRY_TRACES_SAMPLE_RATE if costs spike.
    tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE
      ? Number(process.env.SENTRY_TRACES_SAMPLE_RATE)
      : process.env.NODE_ENV === 'production'
        ? 0.1
        : 1.0,
    // Ignore the 404-shape errors that ValidationPipe throws on
    // bad input — those are the user's problem, not an outage.
    ignoreErrors: [
      /BadRequestException/,
      /UnauthorizedException/,
      /ForbiddenException/,
      /NotFoundException/,
    ],
  });
}

export { Sentry };
