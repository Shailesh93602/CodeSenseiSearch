import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WorkersModule } from './workers/workers.module';
import { TestModule } from './test/test.module';
import { AdminModule } from './admin/admin.module';
import { SearchModule } from './search/search.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Structured logging via pino. In production we emit one JSON
    // record per log line so a log aggregator (Datadog / Loki / etc.)
    // can parse fields directly. In development we pipe through
    // pino-pretty for human-readable output. Every HTTP request gets
    // a unique requestId (also returned to the client) so a single
    // trace can be followed across services.
    LoggerModule.forRoot({
      pinoHttp: {
        level:
          process.env.LOG_LEVEL ??
          (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                  translateTime: 'HH:MM:ss.l',
                  ignore: 'pid,hostname,context',
                },
              },
        // Strip auth tokens + Cookie + obvious secret-shaped fields
        // from request logs. Pino's redact takes a path list.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-api-key"]',
            'req.body.password',
            'req.body.newPassword',
            'req.body.currentPassword',
          ],
          censor: '***REDACTED***',
        },
        // Quiet routine probes from the log stream.
        autoLogging: {
          ignore: (req) => {
            const url = req.url ?? '';
            return url.includes('/health') || url === '/';
          },
        },
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
      },
    }),
    // Global rate limit: 60 requests per minute per IP. Applies to every
    // controller unless an individual handler opts out with @SkipThrottle
    // or overrides with its own @Throttle decorator. Sensitive paths
    // (login, ingestion triggers) re-declare tighter limits locally.
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 60,
      },
    ]),
    AuthModule,
    WorkersModule,
    TestModule,
    AdminModule,
    SearchModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
