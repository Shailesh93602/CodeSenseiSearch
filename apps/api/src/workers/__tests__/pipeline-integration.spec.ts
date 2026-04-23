/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/require-await --
   Test file: jest mocks return Promises by convention even when their
   bodies are synchronous, and the unbound-method rule is irrelevant
   on mock objects. */
/**
 * End-to-end pipeline integration test.
 *
 * Walks a real source file through the full chain we ship:
 *
 *   chunkByAst (real)
 *      → simulated PrismaService persistence (in-memory store)
 *      → EmbeddingGenerationWorker.generateEmbeddings (real)
 *      → mocked GeminiService (deterministic 768-dim vectors)
 *      → mocked VectorService (records what would have hit pgvector)
 *
 * Uses no Postgres, no Redis, no Gemini key. Catches: chunker output
 * shape vs worker expectations, idempotency replay safety, status
 * transitions PENDING → IN_PROGRESS → COMPLETED, batch-failure
 * isolation when one chunk's embedding throws.
 */
import { chunkByAst } from '../code-chunker';
import { EmbeddingGenerationWorker } from '../embedding-generation.worker';
import { QueueService } from '../../services/queue.service';
import { PrismaService } from '../../services/prisma.service';
import { GeminiService } from '../../services/gemini.service';
import { VectorService } from '../../services/vector.service';

type ChunkRow = {
  id: string;
  chunkText: string;
  embeddingStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  embeddingError: string | null;
  embeddedAt: Date | null;
  tokenCount: number | null;
};

function makeInMemoryPrisma(initialChunks: ChunkRow[]) {
  const chunks = new Map<string, ChunkRow>();
  for (const c of initialChunks) chunks.set(c.id, { ...c });

  return {
    contentChunk: {
      findMany: jest.fn(async (args: any) => {
        const ids: string[] = args.where.id.in;
        const allowedStatuses: string[] = args.where.embeddingStatus.in;
        return ids
          .map((id) => chunks.get(id))
          .filter((c): c is ChunkRow => !!c)
          .filter((c) => allowedStatuses.includes(c.embeddingStatus))
          .map((c) => ({ id: c.id, chunkText: c.chunkText }));
      }),
      updateMany: jest.fn(async (args: any) => {
        const ids: string[] = args.where.id.in;
        for (const id of ids) {
          const c = chunks.get(id);
          if (c) Object.assign(c, args.data);
        }
        return { count: ids.length };
      }),
      update: jest.fn(async (args: any) => {
        const c = chunks.get(args.where.id);
        if (c) Object.assign(c, args.data);
        return c;
      }),
    },
    _store: chunks, // exposed for test assertions
  };
}

function buildPipeline(prisma: ReturnType<typeof makeInMemoryPrisma>) {
  const queueService = {
    getRedisConnection: jest.fn().mockReturnValue({}),
    registerWorker: jest.fn(),
  } as unknown as QueueService;

  const geminiService = {
    generateEmbedding: jest.fn(async (content: string) => ({
      content,
      // Deterministic vector keyed on content length so we can assert on it.
      embedding: new Array(768).fill(content.length / 1000),
      tokenCount: Math.ceil(content.length / 4),
      model: 'text-embedding-004',
      timestamp: new Date(),
    })),
  } as unknown as GeminiService;

  const stored: Array<{ chunkId: string; embedding: number[] }> = [];
  const vectorService = {
    storeEmbedding: jest.fn(async (chunkId: string, embedding: number[]) => {
      stored.push({ chunkId, embedding });
    }),
  } as unknown as VectorService;

  const worker = new EmbeddingGenerationWorker(
    queueService,
    prisma as unknown as PrismaService,
    geminiService,
    vectorService,
  );

  return { worker, geminiService, vectorService, stored };
}

const SAMPLE_TS = `
import { z } from 'zod';

export function add(a: number, b: number): number {
  return a + b;
}

export class Greeter {
  greet(name: string): string {
    return \`hi, \${name}\`;
  }
}

export const isEven = (n: number) => n % 2 === 0;
`.trim();

describe('Pipeline integration: chunkByAst → EmbeddingGenerationWorker', () => {
  it('chunks real TypeScript source and embeds every PENDING chunk', async () => {
    const astChunks = chunkByAst(SAMPLE_TS, 'typescript');
    expect(astChunks.length).toBeGreaterThanOrEqual(3);

    // Persist (mock) — exactly what ContentChunkingWorker would do.
    const initial: ChunkRow[] = astChunks.map((c, i) => ({
      id: `chunk_${i}`,
      chunkText: c.text,
      embeddingStatus: 'PENDING',
      embeddingError: null,
      embeddedAt: null,
      tokenCount: null,
    }));
    const prisma = makeInMemoryPrisma(initial);
    const { worker, geminiService, vectorService, stored } = buildPipeline(prisma);

    const ids = initial.map((c) => c.id);
    const result = await worker.generateEmbeddings({ contentChunkIds: ids });

    expect(result.processedChunks).toBe(astChunks.length);
    expect(result.embeddingsGenerated).toBe(astChunks.length);
    expect(result.failedChunks).toBe(0);

    expect(geminiService.generateEmbedding).toHaveBeenCalledTimes(
      astChunks.length,
    );
    expect(vectorService.storeEmbedding).toHaveBeenCalledTimes(
      astChunks.length,
    );
    expect(stored.every((s) => s.embedding.length === 768)).toBe(true);

    // Every chunk in the store should be COMPLETED
    for (const id of ids) {
      const row = prisma._store.get(id)!;
      expect(row.embeddingStatus).toBe('COMPLETED');
      expect(row.embeddedAt).toBeInstanceOf(Date);
      expect(row.tokenCount).toBeGreaterThan(0);
      expect(row.embeddingError).toBeNull();
    }
  });

  it('is idempotent: replaying the job is a no-op once chunks are COMPLETED', async () => {
    const astChunks = chunkByAst(SAMPLE_TS, 'typescript');
    const initial: ChunkRow[] = astChunks.map((c, i) => ({
      id: `chunk_${i}`,
      chunkText: c.text,
      embeddingStatus: 'PENDING',
      embeddingError: null,
      embeddedAt: null,
      tokenCount: null,
    }));
    const prisma = makeInMemoryPrisma(initial);
    const { worker, geminiService } = buildPipeline(prisma);
    const ids = initial.map((c) => c.id);

    await worker.generateEmbeddings({ contentChunkIds: ids });
    expect(geminiService.generateEmbedding).toHaveBeenCalledTimes(ids.length);

    (geminiService.generateEmbedding as jest.Mock).mockClear();
    const replay = await worker.generateEmbeddings({ contentChunkIds: ids });

    // Second pass: nothing PENDING/FAILED, so Gemini never called.
    expect(geminiService.generateEmbedding).not.toHaveBeenCalled();
    expect(replay.embeddingsGenerated).toBe(0);
  });

  it('isolates per-chunk failures: one bad chunk does not abort the batch', async () => {
    const astChunks = chunkByAst(SAMPLE_TS, 'typescript');
    const initial: ChunkRow[] = astChunks.map((c, i) => ({
      id: `chunk_${i}`,
      chunkText: c.text,
      embeddingStatus: 'PENDING',
      embeddingError: null,
      embeddedAt: null,
      tokenCount: null,
    }));
    const prisma = makeInMemoryPrisma(initial);
    const { worker, geminiService } = buildPipeline(prisma);

    // Make the second chunk's embedding throw a non-retryable error
    (geminiService.generateEmbedding as jest.Mock).mockImplementation(
      async (content: string) => {
        if (content === initial[1].chunkText) {
          throw new Error('invalid argument: content empty');
        }
        return {
          content,
          embedding: new Array(768).fill(0.1),
          tokenCount: 5,
          model: 'text-embedding-004',
          timestamp: new Date(),
        };
      },
    );

    const result = await worker.generateEmbeddings({
      contentChunkIds: initial.map((c) => c.id),
    });

    expect(result.failedChunks).toBe(1);
    expect(result.embeddingsGenerated).toBe(initial.length - 1);

    expect(prisma._store.get('chunk_1')!.embeddingStatus).toBe('FAILED');
    expect(prisma._store.get('chunk_1')!.embeddingError).toMatch(
      /invalid argument/,
    );

    // Other chunks succeeded
    for (const id of ['chunk_0', 'chunk_2']) {
      if (prisma._store.has(id)) {
        expect(prisma._store.get(id)!.embeddingStatus).toBe('COMPLETED');
      }
    }
  });

  it('preserves chunk text fidelity: stored chunks match what was embedded', async () => {
    const astChunks = chunkByAst(SAMPLE_TS, 'typescript');
    const initial: ChunkRow[] = astChunks.map((c, i) => ({
      id: `chunk_${i}`,
      chunkText: c.text,
      embeddingStatus: 'PENDING',
      embeddingError: null,
      embeddedAt: null,
      tokenCount: null,
    }));
    const prisma = makeInMemoryPrisma(initial);
    const { worker, geminiService } = buildPipeline(prisma);

    await worker.generateEmbeddings({
      contentChunkIds: initial.map((c) => c.id),
    });

    // Every chunk that AST produced should have been passed verbatim
    // to generateEmbedding — no truncation, no transformation between
    // chunker and embedder.
    const passedToGemini = (geminiService.generateEmbedding as jest.Mock).mock
      .calls.map((c) => c[0]);
    for (const chunk of astChunks) {
      expect(passedToGemini).toContain(chunk.text);
    }
  });
});
