// Global Jest setup. Wired via "setupFilesAfterEach" in package.json
// so it runs after the test framework is loaded but before any spec.
import 'reflect-metadata';

// Stub bullmq so workers instantiated in unit tests don't open real
// Redis connections. Without this, every Worker constructor flooded
// CI logs with ECONNREFUSED on 127.0.0.1:6379, kept the event loop
// busy reconnecting, and eventually tripped the 10-min job timeout.
jest.mock('bullmq', () => {
  const mockWorker = {
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    waitUntilReady: jest.fn().mockResolvedValue(undefined),
  };

  return {
    Worker: jest.fn().mockImplementation(() => mockWorker),
    Queue: jest.fn().mockImplementation(() => ({
      add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
      addBulk: jest.fn().mockResolvedValue([]),
      getActive: jest.fn().mockResolvedValue([]),
      getWaiting: jest.fn().mockResolvedValue([]),
      getCompleted: jest.fn().mockResolvedValue([]),
      getFailed: jest.fn().mockResolvedValue([]),
      close: jest.fn().mockResolvedValue(undefined),
    })),
    QueueEvents: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    })),
    FlowProducer: jest.fn().mockImplementation(() => ({
      add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
      close: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

// Stub ioredis for the same reason — anything that constructs a Redis
// client directly (queue.service.getRedisConnection, cache.service)
// gets a no-op back instead of a TCP connection.
jest.mock('ioredis', () => {
  const RedisMock = jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
    duplicate: jest.fn(function (this: unknown) {
      return this;
    }),
  }));
  return { __esModule: true, default: RedisMock, Redis: RedisMock };
});

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? 'test-api-key';

jest.setTimeout(30_000);
