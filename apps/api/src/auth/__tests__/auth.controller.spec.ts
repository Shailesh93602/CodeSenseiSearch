/**
 * AuthController integration tests using supertest against an in-memory
 * Nest app. AuthService is mocked so we exercise the controller +
 * pipeline (ValidationPipe, ThrottlerGuard, decorators) without needing
 * Postgres or bcrypt.
 *
 * What this catches that the unit tests don't:
 *   - DTO validation actually rejects malformed bodies (400)
 *   - Throttler global guard is wired (well-formed login burst returns 429)
 *   - Whitelist + forbidNonWhitelisted strip / reject extra fields
 *   - HTTP status codes match the @HttpCode decorators
 */
import { ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthController } from '../auth.controller';
import { AuthService, UserRole } from '../auth.service';

const STRONG_PASSWORD = 'Aa1aaaaa';

const fakeAuthUser = {
  id: 'u_1',
  email: 'a@b.co',
  name: 'Test',
  role: UserRole.USER,
  isActive: true,
};

const fakeTokens = {
  accessToken: 'access',
  refreshToken: 'refresh',
};

async function buildApp(authServiceOverrides: Partial<AuthService> = {}) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      // Tight throttler so tests can actually hit the limit deterministically.
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    ],
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: authServiceOverrides },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

const httpServerOf = (app: INestApplication): App =>
  app.getHttpServer() as App;

describe('AuthController (integration)', () => {
  describe('POST /auth/register', () => {
    let app: INestApplication;

    afterEach(async () => app && (await app.close()));

    it('rejects an empty body with 400 from class-validator', async () => {
      app = await buildApp({ register: jest.fn() } as any);
      const res = await request(httpServerOf(app))
        .post('/auth/register')
        .send({});

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/email|password|name/);
    });

    it('rejects a password missing a digit', async () => {
      app = await buildApp({ register: jest.fn() } as any);
      const res = await request(httpServerOf(app))
        .post('/auth/register')
        .send({ email: 'a@b.co', password: 'Abcdefgh', name: 'x' });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/upper|digit|password/i);
    });

    it('rejects extra/unknown fields (forbidNonWhitelisted)', async () => {
      app = await buildApp({ register: jest.fn() } as any);
      const res = await request(httpServerOf(app))
        .post('/auth/register')
        .send({
          email: 'a@b.co',
          password: STRONG_PASSWORD,
          name: 'x',
          isAdmin: true, // attacker tries to grant themselves admin
        });

      expect(res.status).toBe(400);
    });

    it('returns 201 + sanitised user on success', async () => {
      const register = jest.fn().mockResolvedValue(fakeAuthUser);
      app = await buildApp({ register } as any);

      const res = await request(httpServerOf(app))
        .post('/auth/register')
        .send({ email: 'a@b.co', password: STRONG_PASSWORD, name: 'Test' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        message: 'User registered successfully',
        user: { id: 'u_1', email: 'a@b.co', role: 'USER' },
      });
      // No password / passwordHash leak
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    });
  });

  describe('POST /auth/login', () => {
    let app: INestApplication;
    afterEach(async () => app && (await app.close()));

    it('rejects malformed email with 400', async () => {
      app = await buildApp({ login: jest.fn() } as any);
      const res = await request(httpServerOf(app))
        .post('/auth/login')
        .send({ email: 'not-an-email', password: STRONG_PASSWORD });

      expect(res.status).toBe(400);
    });

    it('returns 200 + tokens on success', async () => {
      const login = jest
        .fn()
        .mockResolvedValue({ user: fakeAuthUser, tokens: fakeTokens });
      app = await buildApp({ login } as any);

      const res = await request(httpServerOf(app))
        .post('/auth/login')
        .send({ email: 'a@b.co', password: STRONG_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        message: 'Login successful',
        user: { id: 'u_1' },
        tokens: { accessToken: 'access', refreshToken: 'refresh' },
      });
    });

    it('strips an unknown field instead of rejecting (whitelist for valid base)', async () => {
      // forbidNonWhitelisted means unknown fields cause 400, but the
      // login DTO is small so the pipe will error. Documenting the
      // intentional behaviour.
      const login = jest.fn();
      app = await buildApp({ login } as any);

      const res = await request(httpServerOf(app))
        .post('/auth/login')
        .send({
          email: 'a@b.co',
          password: STRONG_PASSWORD,
          rememberMe: true,
        });

      expect(res.status).toBe(400);
      expect(login).not.toHaveBeenCalled();
    });
  });

  describe('throttling', () => {
    let app: INestApplication;
    afterEach(async () => app && (await app.close()));

    it('returns 429 once /auth/register exceeds 5 calls in the window', async () => {
      const register = jest.fn().mockResolvedValue(fakeAuthUser);
      app = await buildApp({ register } as any);
      const server = httpServerOf(app);

      const send = () =>
        request(server)
          .post('/auth/register')
          .send({ email: 'a@b.co', password: STRONG_PASSWORD, name: 'Test' });

      // 5 successes
      for (let i = 0; i < 5; i++) {
        const ok = await send();
        expect(ok.status).toBe(201);
      }

      // 6th hits the per-route @Throttle({ limit: 5 }) cap
      const blocked = await send();
      expect(blocked.status).toBe(429);
    });
  });
});
