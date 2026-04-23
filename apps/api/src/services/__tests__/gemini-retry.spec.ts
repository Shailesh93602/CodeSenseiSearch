/**
 * Tests for GeminiService.generateEmbedding retry/backoff behaviour.
 *
 * GeminiService is a thin wrapper around the Google Generative AI SDK.
 * Constructor builds a model instance only when GEMINI_API_KEY is set.
 * For these tests we instantiate the service then poke the private
 * `embeddingModelInstance` and `genAI` flag so we can drive the SDK's
 * `embedContent` with mocks.
 */
import { GeminiService } from '../gemini.service';
import { ConfigService } from '@nestjs/config';

function buildService() {
  const configService = {
    get: jest.fn().mockReturnValue('test-key-not-real'),
  } as unknown as ConfigService;

  const service = new GeminiService(configService);

  // Replace the SDK pieces with controllable mocks. The constructor
  // populated them from a real GoogleGenerativeAI instance using the
  // fake API key — that's fine because we never call the real API.
  const embedContent = jest.fn();
  (service as any).embeddingModelInstance = { embedContent };
  // genAI is non-null after construction with a key; leave it.

  return { service, embedContent };
}

describe('GeminiService retry/backoff', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns immediately on success — single call, no retries', async () => {
    const { service, embedContent } = buildService();
    embedContent.mockResolvedValue({
      embedding: { values: new Array(768).fill(0.1) },
    });

    const result = await service.generateEmbedding('hello');

    expect(embedContent).toHaveBeenCalledTimes(1);
    expect(result.embedding).toHaveLength(768);
    expect(result.model).toBe('text-embedding-004');
  });

  it('retries transient errors then succeeds (rate limit → ok)', async () => {
    const { service, embedContent } = buildService();
    embedContent
      .mockRejectedValueOnce(new Error('rate limit exceeded'))
      .mockResolvedValueOnce({
        embedding: { values: new Array(768).fill(0.2) },
      });

    const result = await service.generateEmbedding('hello');

    expect(embedContent).toHaveBeenCalledTimes(2);
    expect(result.embedding[0]).toBe(0.2);
  }, 10_000);

  it('gives up after MAX_RETRIES on persistent transient error', async () => {
    const { service, embedContent } = buildService();
    embedContent.mockRejectedValue(new Error('500 internal server error'));

    await expect(service.generateEmbedding('hello')).rejects.toThrow(
      /500 internal server error/,
    );

    // 3 attempts total (initial + 2 retries; INITIAL_BACKOFF_MS doubled).
    expect(embedContent).toHaveBeenCalledTimes(3);
  }, 15_000);

  it('does not retry non-retryable errors (4xx-shape, fail fast)', async () => {
    const { service, embedContent } = buildService();
    embedContent.mockRejectedValue(
      new Error('invalid argument: content must not be empty'),
    );

    await expect(service.generateEmbedding('hello')).rejects.toThrow(
      /invalid argument/,
    );

    expect(embedContent).toHaveBeenCalledTimes(1);
  });

  it('generateQueryEmbedding uses the same retry path', async () => {
    const { service, embedContent } = buildService();
    embedContent
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        embedding: { values: new Array(768).fill(0.3) },
      });

    const vec = await service.generateQueryEmbedding('search me');

    expect(embedContent).toHaveBeenCalledTimes(2);
    expect(vec).toHaveLength(768);
    // RETRIEVAL_QUERY task type, not RETRIEVAL_DOCUMENT — important
    // for cosine-space alignment.
    expect(embedContent.mock.calls[0][0].taskType).toBe('RETRIEVAL_QUERY');
  }, 10_000);
});
