// Sentry instrumentation MUST be imported before anything else so the
// SDK can monkey-patch http / express / undici before they're loaded.
import './instrument';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { SentryExceptionFilter } from './sentry-exception.filter';

async function bootstrap() {
  // Validate env BEFORE Nest constructs the module graph. If a required
  // var is missing or malformed we exit non-zero with the full list of
  // problems printed — much friendlier than discovering the gap at the
  // first failing request.
  try {
    loadEnv();
  } catch {
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  // Wire pino as the Nest logger — every Logger.log() call now emits
  // a structured JSON record (or coloured pretty-print in dev).
  app.useLogger(app.get(PinoLogger));

  // Helmet — sane default security headers (X-Content-Type-Options,
  // Referrer-Policy, Strict-Transport-Security, X-DNS-Prefetch-Control,
  // etc.). The default Content-Security-Policy is loosened slightly so
  // Swagger's UI keeps working on /api/docs (it loads its own bundles
  // and inline scripts); production-with-no-Swagger gets the strict
  // default automatically because the docs route isn't mounted.
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === 'production' &&
        process.env.SWAGGER_ENABLED !== 'true'
          ? undefined
          : {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:'],
              },
            },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Enable CORS for frontend communication
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  // Enable global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Set global API prefix
  app.setGlobalPrefix('api');

  // Sentry global exception capture. The filter only ships to Sentry
  // when SENTRY_DSN was set at boot; otherwise instrument.ts skipped
  // Sentry.init() and the filter's captureException calls are no-ops.
  if (process.env.SENTRY_DSN) {
    app.useGlobalFilters(new SentryExceptionFilter());
  }

  // OpenAPI / Swagger documentation. Mounted at /api/docs and the raw
  // OpenAPI JSON at /api/docs-json. Skipped in production unless the
  // SWAGGER_ENABLED env is truthy — keeps the docs out of public-prod
  // by default so endpoint structure isn't a free reconnaissance map.
  const swaggerEnabled =
    process.env.NODE_ENV !== 'production' ||
    process.env.SWAGGER_ENABLED === 'true';

  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('CodeSenseiSearch API')
      .setDescription(
        'Semantic code search backend. JWT bearer required for protected routes; ' +
          'global rate limit is 60 req/min per IP with tighter caps on auth endpoints.',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .addTag('auth', 'Registration, login, password change, GitHub OAuth')
      .addTag('search', 'Hybrid / semantic / fulltext search endpoints')
      .addTag('admin', 'Operational dashboards and stats (JWT required)')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.API_PORT ?? 3001;
  await app.listen(port);

  console.log(
    `🚀 CodeSenseiSearch API is running on: http://localhost:${port}/api`,
  );
  if (swaggerEnabled) {
    console.log(`📖 OpenAPI docs at:           http://localhost:${port}/api/docs`);
  }
  console.log(
    `📊 Health check available at: http://localhost:${port}/api/health`,
  );
}
void bootstrap();
