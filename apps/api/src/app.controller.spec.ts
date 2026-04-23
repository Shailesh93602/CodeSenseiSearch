import { Test } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './services/prisma.service';
import { QueueService } from './services/queue.service';
import { GeminiService } from './services/gemini.service';

function buildModule(overrides: {
  prisma?: Partial<PrismaService>;
  queue?: Partial<QueueService>;
  gemini?: Partial<GeminiService>;
} = {}) {
  return Test.createTestingModule({
    controllers: [AppController],
    providers: [
      AppService,
      { provide: PrismaService, useValue: overrides.prisma ?? null },
      { provide: QueueService, useValue: overrides.queue ?? null },
      { provide: GeminiService, useValue: overrides.gemini ?? null },
    ],
  }).compile();
}

describe('AppController', () => {
  describe('root', () => {
    it('returns Hello World', async () => {
      const app = await buildModule();
      const controller = app.get(AppController);
      expect(controller.getHello()).toBe('Hello World!');
    });
  });

  describe('GET /health', () => {
    it('reports status: ok when DB + Redis ping succeed', async () => {
      const app = await buildModule({
        prisma: { $queryRaw: jest.fn().mockResolvedValue([{ '1': 1 }]) } as any,
        queue: {
          getRedisConnection: jest.fn().mockReturnValue({
            ping: jest.fn().mockResolvedValue('PONG'),
          }),
        } as any,
        gemini: { isAvailable: jest.fn().mockReturnValue(true) } as any,
      });
      const controller = app.get(AppController);

      const report = await controller.getHealth();

      expect(report.status).toBe('ok');
      expect(report.components.database.status).toBe('up');
      expect(report.components.redis.status).toBe('up');
      expect(report.components.gemini.status).toBe('up');
      expect(report.uptimeSec).toBeGreaterThanOrEqual(0);
    });

    it('reports status: degraded when the database query throws', async () => {
      const app = await buildModule({
        prisma: {
          $queryRaw: jest.fn().mockRejectedValue(new Error('connection refused')),
        } as any,
        queue: {
          getRedisConnection: jest.fn().mockReturnValue({
            ping: jest.fn().mockResolvedValue('PONG'),
          }),
        } as any,
        gemini: { isAvailable: jest.fn().mockReturnValue(true) } as any,
      });
      const controller = app.get(AppController);

      const report = await controller.getHealth();

      expect(report.status).toBe('degraded');
      expect(report.components.database.status).toBe('down');
      expect(report.components.database.message).toMatch(/connection refused/);
    });

    it('reports status: degraded when Redis ping returns unexpected reply', async () => {
      const app = await buildModule({
        prisma: { $queryRaw: jest.fn().mockResolvedValue([]) } as any,
        queue: {
          getRedisConnection: jest.fn().mockReturnValue({
            ping: jest.fn().mockResolvedValue('NOT-PONG'),
          }),
        } as any,
        gemini: { isAvailable: jest.fn().mockReturnValue(true) } as any,
      });
      const controller = app.get(AppController);

      const report = await controller.getHealth();

      expect(report.components.redis.status).toBe('down');
      expect(report.components.redis.message).toMatch(/unexpected ping reply/);
      expect(report.status).toBe('degraded');
    });

    it('marks Gemini down without flipping overall status (non-critical)', async () => {
      const app = await buildModule({
        prisma: { $queryRaw: jest.fn().mockResolvedValue([]) } as any,
        queue: {
          getRedisConnection: jest.fn().mockReturnValue({
            ping: jest.fn().mockResolvedValue('PONG'),
          }),
        } as any,
        gemini: { isAvailable: jest.fn().mockReturnValue(false) } as any,
      });
      const controller = app.get(AppController);

      const report = await controller.getHealth();

      expect(report.status).toBe('ok');
      expect(report.components.gemini.status).toBe('down');
      expect(report.components.gemini.message).toMatch(/GEMINI_API_KEY/);
    });

    it('reports status: unknown for missing optional service deps', async () => {
      const app = await buildModule(); // no prisma / queue / gemini wired
      const controller = app.get(AppController);

      const report = await controller.getHealth();

      expect(report.components.database.status).toBe('unknown');
      expect(report.components.redis.status).toBe('unknown');
      expect(report.components.gemini.status).toBe('unknown');
      // No component is "down", so overall is ok.
      expect(report.status).toBe('ok');
    });
  });
});
