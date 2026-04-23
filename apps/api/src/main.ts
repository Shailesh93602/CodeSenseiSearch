import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
