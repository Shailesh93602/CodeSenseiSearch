/**
 * Tests for EmbeddingGenerationWorker.generateEmbeddings.
 *
 * BaseWorker spins up a real BullMQ Worker in its constructor that needs
 * Redis. We can't easily skip that, so each test mocks
 * QueueService#getRedisConnection + #registerWorker; the BullMQ Worker
 * still constructs but doesn't connect to anything until it processes
 * a job, which never happens in these unit tests.
 */
import { EmbeddingGenerationWorker } from '../embedding-generation.worker';
import { QueueService } from '../../services/queue.service';
import { PrismaService } from '../../services/prisma.service';
import { GeminiService } from '../../services/gemini.service';
import { VectorService } from '../../services/vector.service';

type Mock<T> = { [K in keyof T]: T[K] extends (...args: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function buildWorker() {
  const queueService = {
    getRedisConnection: jest.fn().mockReturnValue({}),
    registerWorker: jest.fn(),
  } as unknown as QueueService;

  const prismaService = {
    contentChunk: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as Mock<PrismaService> & PrismaService;

  const geminiService = {
    generateEmbedding: jest.fn(),
  } as unknown as Mock<GeminiService> & GeminiService;

  const vectorService = {
    storeEmbedding: jest.fn().mockResolvedValue(undefined),
  } as unknown as Mock<VectorService> & VectorService;

  const worker = new EmbeddingGenerationWorker(
    queueService,
    prismaService,
    geminiService,
    vectorService,
  );

  return { worker, prismaService, geminiService, vectorService };
}

// Worker.processJob is protected — expose for tests.
type WorkerInternals = {
  generateEmbeddings(data: { contentChunkIds: string[] }): Promise<{
    processedChunks: number;
    embeddingsGenerated: number;
    failedChunks: number;
  }>;
};

const asInternals = (w: EmbeddingGenerationWorker): WorkerInternals =>
  w as unknown as WorkerInternals;

describe('EmbeddingGenerationWorker', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns zero counts when given an empty chunk list', async () => {
    const { worker, prismaService, geminiService } = buildWorker();

    const result = await asInternals(worker).generateEmbeddings({
      contentChunkIds: [],
    });

    expect(result).toEqual({
      processedChunks: 0,
      embeddingsGenerated: 0,
      failedChunks: 0,
    });
    expect(prismaService.contentChunk.findMany).not.toHaveBeenCalled();
    expect(geminiService.generateEmbedding).not.toHaveBeenCalled();
  });

  it('skips chunks that are already COMPLETED or IN_PROGRESS', async () => {
    const { worker, prismaService, geminiService } = buildWorker();
    (prismaService.contentChunk.findMany as jest.Mock).mockResolvedValue([]);

    const result = await asInternals(worker).generateEmbeddings({
      contentChunkIds: ['c1', 'c2'],
    });

    expect(prismaService.contentChunk.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['c1', 'c2'] },
        embeddingStatus: { in: ['PENDING', 'FAILED'] },
      },
      select: { id: true, chunkText: true },
    });
    expect(geminiService.generateEmbedding).not.toHaveBeenCalled();
    expect(result.embeddingsGenerated).toBe(0);
  });

  it('marks the batch IN_PROGRESS, then COMPLETED on success', async () => {
    const { worker, prismaService, geminiService, vectorService } = buildWorker();

    (prismaService.contentChunk.findMany as jest.Mock).mockResolvedValue([
      { id: 'c1', chunkText: 'function add(a, b) { return a + b; }' },
    ]);
    (geminiService.generateEmbedding as jest.Mock).mockResolvedValue({
      content: 'function add...',
      embedding: new Array(768).fill(0.1),
      tokenCount: 12,
      model: 'text-embedding-004',
      timestamp: new Date(),
    });

    const result = await asInternals(worker).generateEmbeddings({
      contentChunkIds: ['c1'],
    });

    expect(prismaService.contentChunk.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c1'] } },
      data: { embeddingStatus: 'IN_PROGRESS' },
    });
    expect(vectorService.storeEmbedding).toHaveBeenCalledWith(
      'c1',
      expect.arrayContaining([0.1]),
    );
    expect(prismaService.contentChunk.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({
          embeddingStatus: 'COMPLETED',
          tokenCount: 12,
          embeddingError: null,
        }),
      }),
    );
    expect(result).toEqual({
      processedChunks: 1,
      embeddingsGenerated: 1,
      failedChunks: 0,
    });
  });

  it('marks chunk FAILED and continues when Gemini throws non-retryable', async () => {
    const { worker, prismaService, geminiService, vectorService } = buildWorker();

    (prismaService.contentChunk.findMany as jest.Mock).mockResolvedValue([
      { id: 'c1', chunkText: 'short' },
      { id: 'c2', chunkText: 'longer chunk text here' },
    ]);
    (geminiService.generateEmbedding as jest.Mock)
      .mockRejectedValueOnce(new Error('invalid argument: content empty'))
      .mockResolvedValueOnce({
        content: 'longer chunk text here',
        embedding: new Array(768).fill(0.2),
        tokenCount: 5,
        model: 'text-embedding-004',
        timestamp: new Date(),
      });

    const result = await asInternals(worker).generateEmbeddings({
      contentChunkIds: ['c1', 'c2'],
    });

    expect(result).toEqual({
      processedChunks: 2,
      embeddingsGenerated: 1,
      failedChunks: 1,
    });

    // c1 marked FAILED with truncated error
    expect(prismaService.contentChunk.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({
          embeddingStatus: 'FAILED',
          embeddingError: expect.stringContaining('invalid argument'),
        }),
      }),
    );

    // c2 still got embedded — failure didn't abort the batch
    expect(vectorService.storeEmbedding).toHaveBeenCalledWith(
      'c2',
      expect.arrayContaining([0.2]),
    );
  });

  it('retries on transient errors and succeeds on the second attempt', async () => {
    const { worker, prismaService, geminiService } = buildWorker();

    (prismaService.contentChunk.findMany as jest.Mock).mockResolvedValue([
      { id: 'c1', chunkText: 'retry me' },
    ]);
    (geminiService.generateEmbedding as jest.Mock)
      .mockRejectedValueOnce(new Error('rate limit exceeded'))
      .mockResolvedValueOnce({
        content: 'retry me',
        embedding: new Array(768).fill(0.3),
        tokenCount: 3,
        model: 'text-embedding-004',
        timestamp: new Date(),
      });

    const result = await asInternals(worker).generateEmbeddings({
      contentChunkIds: ['c1'],
    });

    expect(geminiService.generateEmbedding).toHaveBeenCalledTimes(2);
    expect(result.embeddingsGenerated).toBe(1);
    expect(result.failedChunks).toBe(0);
  }, 10_000);
});
