// Sentry instrumentation MUST be imported before anything else so the
// SDK can monkey-patch http / express / undici before they're loaded.
import './instrument';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { SentryExceptionFilter } from './sentry-exception.filter';

/**
 * Build a fully-configured Nest app without listening on a port.
 * Reused by both `main.ts` (Railway / docker / local — calls listen)
 * and `api/index.ts` (Vercel serverless wrapper — caches the app
 * instance across invocations and lets serverless-express drive it).
 */
export async function createApp(): Promise<INestApplication> {
  loadEnv();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

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

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  if (process.env.SENTRY_DSN) {
    app.useGlobalFilters(new SentryExceptionFilter());
  }

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

  return app;
}

async function bootstrap() {
  try {
    const app = await createApp();
    const port = process.env.API_PORT ?? 3001;
    await app.listen(port);

    console.log(
      `🚀 CodeSenseiSearch API is running on: http://localhost:${port}/api`,
    );
    console.log(
      `📊 Health check available at: http://localhost:${port}/api/health`,
    );
  } catch (err) {
    // loadEnv() already printed the offence list
    console.error(err);
    process.exit(1);
  }
}

// Skip listen() when running on Vercel — the serverless handler in
// api/index.ts boots the same app and feeds it requests directly.
if (!process.env.VERCEL) {
  void bootstrap();
}
