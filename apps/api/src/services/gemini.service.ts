import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface EmbeddingResult {
  content: string;
  embedding: number[];
  tokenCount: number;
  model: string;
  timestamp: Date;
}

export interface EmbeddingBatchResult {
  embeddings: EmbeddingResult[];
  totalTokens: number;
  cost: number;
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly embeddingModel = 'text-embedding-004';
  private readonly textModel = 'gemini-1.5-flash';
  private readonly maxTokensPerChunk = 2048; // Gemini embedding model limit
  private embeddingModelInstance: any;
  private textModelInstance: any;

  // Retry configuration. Lives on the service so the worker, the search
  // service's query-embedding path, and any future caller all get the
  // same backoff behaviour for free.
  private static readonly MAX_RETRIES = 3;
  private static readonly INITIAL_BACKOFF_MS = 500;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      this.logger.warn(
        'Gemini API key not found. Embedding generation will be disabled.',
      );
      return;
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.embeddingModelInstance = this.genAI.getGenerativeModel({
      model: this.embeddingModel,
    });
    this.textModelInstance = this.genAI.getGenerativeModel({
      model: this.textModel,
    });

    this.logger.log('Gemini service initialized');
  }

  /**
   * Generate embedding for a single text chunk. Retries on transient
   * errors (rate limit, timeout, 5xx) with exponential backoff.
   */
  async generateEmbedding(content: string): Promise<EmbeddingResult> {
    if (!this.genAI) {
      throw new Error('Gemini service not initialized. Check GEMINI_API_KEY.');
    }

    const truncatedContent = this.truncateContent(content);

    const result = await this.withRetry<{ embedding: { values: number[] } }>(
      () =>
        this.embeddingModelInstance.embedContent({
          content: { parts: [{ text: truncatedContent }] },
          taskType: 'RETRIEVAL_DOCUMENT', // Optimized for search/retrieval
        }),
    );

    const embedding = result.embedding.values;
    const tokenCount = this.estimateTokenCount(truncatedContent);

    this.logger.debug(`Generated embedding for ~${tokenCount} tokens`);

    return {
      content: truncatedContent,
      embedding,
      tokenCount,
      model: this.embeddingModel,
      timestamp: new Date(),
    };
  }

  /**
   * Generate embeddings for multiple text chunks (batch processing)
   */
  async generateEmbeddingsBatch(
    contents: string[],
  ): Promise<EmbeddingBatchResult> {
    if (!this.genAI) {
      throw new Error('Gemini service not initialized. Check GEMINI_API_KEY.');
    }

    if (contents.length === 0) {
      return { embeddings: [], totalTokens: 0, cost: 0 };
    }

    try {
      // Truncate all content
      const truncatedContents = contents.map((content) =>
        this.truncateContent(content),
      );

      // Gemini doesn't have batch embedding API, so we process sequentially
      // with small delays to respect rate limits
      const embeddings: EmbeddingResult[] = [];
      let totalTokens = 0;

      for (let i = 0; i < truncatedContents.length; i++) {
        const content = truncatedContents[i];
        try {
          const result = await this.embeddingModelInstance.embedContent({
            content: { parts: [{ text: content }] },
            taskType: 'RETRIEVAL_DOCUMENT',
          });

          const tokenCount = this.estimateTokenCount(content);
          totalTokens += tokenCount;

          embeddings.push({
            content,
            embedding: result.embedding.values,
            tokenCount,
            model: this.embeddingModel,
            timestamp: new Date(),
          });

          // Small delay to respect rate limits (Gemini is generous but let's be respectful)
          if (i < truncatedContents.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } catch (error) {
          this.logger.error(
            `Failed to generate embedding for chunk ${i}: ${error.message}`,
          );
          // Continue with other chunks instead of failing the entire batch
          continue;
        }
      }

      const cost = this.calculateCost(totalTokens);

      this.logger.log(
        `Generated ${embeddings.length}/${contents.length} embeddings using ~${totalTokens} tokens (cost: $${cost.toFixed(6)})`,
      );

      return {
        embeddings,
        totalTokens,
        cost,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate batch embeddings: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Generate embedding for a search query. Same retry behaviour as
   * generateEmbedding but uses the RETRIEVAL_QUERY task type so the
   * vectors land on the query side of the cosine space.
   */
  async generateQueryEmbedding(query: string): Promise<number[]> {
    if (!this.genAI) {
      throw new Error('Gemini service not initialized. Check GEMINI_API_KEY.');
    }

    const result = await this.withRetry<{ embedding: { values: number[] } }>(
      () =>
        this.embeddingModelInstance.embedContent({
          content: { parts: [{ text: query }] },
          taskType: 'RETRIEVAL_QUERY',
        }),
    );

    return result.embedding.values;
  }

  /**
   * Generate text using Gemini's generative model
   */
  async generateText(prompt: string): Promise<string> {
    if (!this.genAI || !this.textModelInstance) {
      throw new Error('Gemini service not initialized. Check GEMINI_API_KEY.');
    }

    try {
      this.logger.debug(`Generating text for prompt length: ${prompt.length}`);

      const result = await this.textModelInstance.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      this.logger.debug(`Generated text response length: ${text.length}`);
      return text;
    } catch (error) {
      this.logger.error(`Failed to generate text: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  calculateCosineSimilarity(
    embedding1: number[],
    embedding2: number[],
  ): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimension');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  /**
   * Get embedding model information
   */
  getModelInfo() {
    return {
      model: this.embeddingModel,
      dimensions: 768, // text-embedding-004 dimensions
      maxTokens: this.maxTokensPerChunk,
      costPer1kTokens: 0.0000125, // $0.0000125 per 1K tokens (much cheaper than OpenAI)
    };
  }

  /**
   * Truncate content to fit within token limits
   */
  private truncateContent(content: string): string {
    // Rough estimation: ~4 characters per token
    const maxChars = this.maxTokensPerChunk * 4;

    if (content.length <= maxChars) {
      return content;
    }

    // Truncate and add indicator
    const truncated = content.substring(0, maxChars - 100);
    return truncated + '\n\n[Content truncated for embedding...]';
  }

  /**
   * Calculate cost based on token usage
   */
  private calculateCost(tokens: number): number {
    const costPer1kTokens = 0.0000125; // Gemini text-embedding-004 pricing
    return (tokens / 1000) * costPer1kTokens;
  }

  /**
   * Estimate token count (Gemini doesn't provide exact counts)
   */
  private estimateTokenCount(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if Gemini service is available
   */
  isAvailable(): boolean {
    return !!this.genAI;
  }

  /**
   * Run `op` with exponential backoff on transient Gemini errors —
   * rate limit, timeout, ECONNRESET, 5xx. 4xx-shape errors fall
   * through immediately because retrying them would just burn the
   * quota for the same answer.
   */
  private async withRetry<T>(op: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < GeminiService.MAX_RETRIES; attempt++) {
      try {
        return await op();
      } catch (error) {
        lastError = error;
        const message =
          error instanceof Error ? error.message.toLowerCase() : '';
        const retryable =
          message.includes('rate') ||
          message.includes('timeout') ||
          message.includes('econnreset') ||
          message.includes('5');

        if (!retryable) {
          this.logger.error(`Gemini call failed (non-retryable): ${message}`);
          break;
        }

        const delay =
          GeminiService.INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        this.logger.warn(
          `Gemini transient error on attempt ${attempt + 1}/${GeminiService.MAX_RETRIES}, retrying in ${delay}ms: ${message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Get rate limit information (if available)
   */
  async getRateLimitInfo(): Promise<any> {
    if (!this.genAI) {
      throw new Error('Gemini service not initialized');
    }

    try {
      // Make a small test request
      await this.embeddingModelInstance.embedContent({
        content: { parts: [{ text: 'test' }] },
        taskType: 'RETRIEVAL_QUERY',
      });

      return {
        available: true,
        model: this.embeddingModel,
        lastTest: new Date(),
        rateLimits: {
          requestsPerMinute: 1500, // Gemini free tier limits
          requestsPerDay: 50000,
        },
      };
    } catch (error) {
      this.logger.warn(`Rate limit check failed: ${error.message}`);
      return {
        available: false,
        error: error.message,
      };
    }
  }
}
