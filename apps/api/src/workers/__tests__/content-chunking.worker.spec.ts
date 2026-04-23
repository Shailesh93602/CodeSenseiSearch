/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/require-await --
   Test file: jest mocks return Promises by convention even when their
   bodies are synchronous; unbound-method is irrelevant on mock
   objects. */
/**
 * Tests for ContentChunkingWorker.chunkContent.
 *
 * The worker reads a content row, dispatches to a chunking strategy
 * keyed on contentType + language, then persists each chunk to
 * content_chunks. We verify:
 *   - Routing: REPOSITORY_FILE + ts language → AST chunks; markdown
 *     → markdown chunker; arbitrary text → plain text fallback;
 *     STACKOVERFLOW_QUESTION → splitByCodeBlocks path
 *   - Persistence: every chunk gets a hash + sequence + token count
 *   - Status: content row is marked processed with chunkCount on success
 *   - Error path: missing contentId throws and writes the error to the row
 */
import { ContentChunkingWorker } from '../content-chunking.worker';
import { QueueService } from '../../services/queue.service';
import { PrismaService } from '../../services/prisma.service';

const TS_SOURCE = `
export function add(a: number, b: number): number {
  return a + b;
}

export class Greeter {
  greet(name: string): string {
    return 'hi, ' + name;
  }
}
`.trim();

const MARKDOWN_SOURCE = `
# Heading

Some prose.

## Subheading

More prose.

\`\`\`ts
console.log('code');
\`\`\`
`.trim();

const PLAIN_TEXT = 'a long paragraph repeated many times. '.repeat(60);

function buildWorker(opts: {
  content?: any;
  createImpl?: jest.Mock;
} = {}) {
  const queueService = {
    getRedisConnection: jest.fn().mockReturnValue({}),
    registerWorker: jest.fn(),
  } as unknown as QueueService;

  const created: any[] = [];
  const updates: any[] = [];

  const prismaService = {
    content: {
      findUnique: jest.fn().mockResolvedValue(opts.content ?? null),
      update: jest.fn(async (args: any) => {
        updates.push(args);
        return args.data;
      }),
    },
    contentChunk: {
      create:
        opts.createImpl ??
        jest.fn(async (args: any) => {
          created.push(args.data);
          return { id: `chunk_${created.length}` };
        }),
    },
  } as unknown as PrismaService;

  const worker = new ContentChunkingWorker(queueService, prismaService);
  return { worker, prismaService, created, updates };
}

const callChunkContent = async (
  worker: ContentChunkingWorker,
  data: { contentId: string; chunkSize?: number; overlap?: number },
) => {
  // chunkContent is private — invoke through the same path as the BullMQ
  // job dispatcher would (processJob), but with a synthetic Job object.
  return (worker as any).chunkContent(data);
};

describe('ContentChunkingWorker.chunkContent', () => {
  it('routes a TypeScript REPOSITORY_FILE through the AST chunker and persists each chunk', async () => {
    const { worker, created, updates } = buildWorker({
      content: {
        id: 'c1',
        content: TS_SOURCE,
        contentType: 'REPOSITORY_FILE',
        language: 'typescript',
        repository: { fullName: 'acme/util' },
        question: null,
      },
    });

    const result = await callChunkContent(worker, { contentId: 'c1' });

    expect(result.success).toBe(true);
    expect(result.chunksCreated).toBeGreaterThanOrEqual(2);

    // Each persisted chunk has a hash + sequence + tokenCount
    for (const c of created) {
      expect(c.contentId).toBe('c1');
      expect(c.chunkText).toBeTruthy();
      expect(c.chunkHash).toMatch(/^[0-9a-f]+$/);
      expect(c.tokenCount).toBeGreaterThan(0);
      expect(c.embeddingStatus).toBe('PENDING');
      expect(typeof c.sequence).toBe('number');
    }

    // The Greeter class body should appear in one of the chunks
    expect(created.some((c: any) => c.chunkText.includes('Greeter'))).toBe(true);

    // Content row marked processed with the chunk count
    const final = updates.at(-1)!.data;
    expect(final.chunkCount).toBe(created.length);
    expect(final.processedAt).toBeInstanceOf(Date);
  });

  it('routes a markdown REPOSITORY_FILE through the markdown chunker', async () => {
    const { worker, created } = buildWorker({
      content: {
        id: 'c-md',
        content: MARKDOWN_SOURCE,
        contentType: 'REPOSITORY_FILE',
        language: 'markdown',
        repository: { fullName: 'acme/docs' },
      },
    });

    await callChunkContent(worker, { contentId: 'c-md' });

    expect(created.length).toBeGreaterThan(0);
    expect(
      created.some((c: any) => c.chunkText.toLowerCase().includes('heading')),
    ).toBe(true);
  });

  it('falls back to plain-text chunker for non-code, non-markdown content', async () => {
    const { worker, created } = buildWorker({
      content: {
        id: 'c-txt',
        content: PLAIN_TEXT,
        contentType: 'REPOSITORY_FILE',
        language: 'text',
      },
    });

    await callChunkContent(worker, {
      contentId: 'c-txt',
      chunkSize: 200,
      overlap: 40,
    });

    // Plain text > chunkSize → multiple chunks; each within size budget.
    expect(created.length).toBeGreaterThan(1);
    for (const c of created) {
      expect(c.chunkText.length).toBeLessThanOrEqual(220); // chunkSize + slack
    }
  });

  it('routes STACKOVERFLOW_QUESTION through the SO splitter', async () => {
    const { worker, created } = buildWorker({
      content: {
        id: 'c-so',
        content:
          'Here is the problem.\n```js\nconsole.log("x")\n```\nAnd why it matters.',
        contentType: 'STACKOVERFLOW_QUESTION',
        language: null,
      },
    });

    await callChunkContent(worker, { contentId: 'c-so' });

    expect(created.length).toBeGreaterThanOrEqual(1);
    // Code block preserved as its own chunk
    expect(
      created.some((c: any) => c.chunkText.includes('console.log')),
    ).toBe(true);
  });

  it('throws and records the error on the content row when contentId is missing', async () => {
    const { worker, prismaService } = buildWorker({ content: null });

    await expect(
      callChunkContent(worker, { contentId: 'does-not-exist' }),
    ).rejects.toThrow(/Content not found/);

    expect(prismaService.content.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'does-not-exist' },
        data: expect.objectContaining({
          processingError: expect.stringContaining('Content not found'),
        }),
      }),
    );
  });

  it('continues persisting remaining chunks if one .create() throws', async () => {
    let callCount = 0;
    const createImpl = jest.fn(async () => {
      callCount++;
      if (callCount === 2) throw new Error('unique constraint violation');
      return { id: `chunk_${callCount}` };
    });

    const { worker } = buildWorker({
      content: {
        id: 'c-resilient',
        content: TS_SOURCE,
        contentType: 'REPOSITORY_FILE',
        language: 'typescript',
      },
      createImpl,
    });

    const result = await callChunkContent(worker, { contentId: 'c-resilient' });

    expect(result.success).toBe(true);
    // Total .create() calls = number of chunks; chunksCreated = total - 1.
    expect(createImpl.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(result.chunksCreated).toBe(createImpl.mock.calls.length - 1);
  });
});
