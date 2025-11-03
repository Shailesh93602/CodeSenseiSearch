import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export interface VectorSearchResult {
  id: string;
  content: string;
  similarity: number;
  metadata: {
    repositoryId?: string;
    questionId?: string;
    chunkIndex?: number;
    contentType: 'repository' | 'question';
    language?: string;
    path?: string;
    title?: string;
  };
}

export interface VectorSearchOptions {
  limit?: number;
  threshold?: number;
  contentType?: 'repository' | 'question' | 'all';
  language?: string;
  repositoryId?: string;
}

@Injectable()
export class VectorService {
  private readonly logger = new Logger(VectorService.name);

  constructor(private prisma: PrismaService) {
    this.logger.log('Vector service initialized');
  }

  /**
   * Store embedding vector for a content chunk
   */
  async storeEmbedding(
    chunkId: string,
    embedding: number[],
  ): Promise<void> {
    try {
      // Convert embedding array to PostgreSQL vector format
      const vectorString = `[${embedding.join(',')}]`;

      await this.prisma.$executeRawUnsafe(
        `UPDATE "ContentChunk" 
        SET embedding = $1::vector
        WHERE id = $2
      `,
        vectorString,
        chunkId,
      );

      this.logger.debug(`Stored embedding for chunk ${chunkId}`);
    } catch (error) {
      this.logger.error(
        `Failed to store embedding for chunk ${chunkId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Store multiple embeddings in batch
   */
  async storeEmbeddingsBatch(
    chunks: Array<{
      chunkId: string;
      embedding: number[];
      metadata: {
        repositoryId?: string;
        questionId?: string;
        chunkIndex?: number;
        contentType: 'repository' | 'question';
      };
    }>,
  ): Promise<void> {
    if (chunks.length === 0) return;

    try {
      // Use transaction for batch insert
      await this.prisma.$transaction(async (tx) => {
        for (const chunk of chunks) {
          const vectorString = `[${chunk.embedding.join(',')}]`;
          await tx.$executeRawUnsafe(
            `UPDATE "ContentChunk" 
            SET embedding = $1::vector
            WHERE id = $2`,
            vectorString,
            chunk.chunkId,
          );
        }
      });

      this.logger.log(`Stored ${chunks.length} embeddings in batch`);
    } catch (error) {
      this.logger.error(`Failed to store batch embeddings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Search for similar content using vector similarity
   */
  async searchSimilar(
    queryEmbedding: number[],
    options: VectorSearchOptions = {},
  ): Promise<VectorSearchResult[]> {
    const {
      limit = 10,
      threshold = 0.7,
      contentType = 'all',
      language,
      repositoryId,
    } = options;

    try {
      const vectorString = `[${queryEmbedding.join(',')}]`;
      // Build dynamic WHERE clause
      let whereClause = 'WHERE cc.embedding IS NOT NULL';
      const params: any[] = [vectorString, limit];
      let paramIndex = 3;

      if (threshold > 0) {
        whereClause += ` AND (cc.embedding <=> $1::vector) < $${paramIndex}`;
        params.push(1 - threshold); // Convert similarity to distance
        paramIndex++;
      }

      if (contentType !== 'all') {
        whereClause += ` AND (
          (cc."repositoryId" IS NOT NULL AND $${paramIndex} = 'repository') OR 
          (cc."questionId" IS NOT NULL AND $${paramIndex} = 'question')
        )`;
        params.push(contentType);
        paramIndex++;
      }

      if (language) {
        whereClause += ` AND c.language = $${paramIndex}`;
        params.push(language);
        paramIndex++;
      }

      if (repositoryId) {
        whereClause += ` AND cc."repositoryId" = $${paramIndex}`;
        params.push(repositoryId);
        paramIndex++;
      }

      const query = `
        SELECT 
          cc.id,
          cc.content,
          cc."chunkIndex",
          cc."repositoryId",
          cc."questionId",
          c.language,
          c.path,
          c.title,
          (1 - (cc.embedding <=> $1::vector)) as similarity
        FROM "ContentChunk" cc
        LEFT JOIN "Content" c ON (
          (cc."repositoryId" = c."repositoryId") OR 
          (cc."questionId" = c."questionId")
        )
        ${whereClause}
        ORDER BY cc.embedding <=> $1::vector
        LIMIT $2
      `;

      const results = await this.prisma.$queryRawUnsafe(query, ...params);

      return (results as any[]).map((row) => ({
        id: row.id,
        content: row.content,
        similarity: parseFloat(row.similarity),
        metadata: {
          repositoryId: row.repositoryId,
          questionId: row.questionId,
          chunkIndex: row.chunkIndex,
          contentType: row.repositoryId ? 'repository' : 'question',
          language: row.language,
          path: row.path,
          title: row.title,
        },
      }));
    } catch (error) {
      this.logger.error(`Vector search failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get embedding for a specific chunk
   */
  async getEmbedding(chunkId: string): Promise<number[] | null> {
    try {
      const result = await this.prisma.$queryRawUnsafe(
        `SELECT embedding::text as embedding_text
        FROM "ContentChunk"
        WHERE id = $1 AND embedding IS NOT NULL`,
        chunkId,
      );

      if (!result || (result as any[]).length === 0) {
        return null;
      }

      const embeddingText = (result as any[])[0].embedding_text;
      // Parse vector string back to array
      // Replace regex-based removal of brackets (lint flagged) with safe slicing
      const trimmed = (typeof embeddingText === 'string' && embeddingText.startsWith('[') && embeddingText.endsWith(']'))
        ? embeddingText.slice(1, -1)
        : String(embeddingText);
      const embedding = trimmed
        .split(',')
        .map((val: string) => parseFloat(val.trim()));

      return embedding;
    } catch (error) {
      this.logger.error(`Failed to get embedding for chunk ${chunkId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete embedding for a chunk
   */
  async deleteEmbedding(chunkId: string): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(`
        UPDATE "ContentChunk" 
        SET embedding = NULL
        WHERE id = $1
      `, chunkId);

      this.logger.debug(`Deleted embedding for chunk ${chunkId}`);
    } catch (error) {
      this.logger.error(`Failed to delete embedding for chunk ${chunkId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get statistics about stored embeddings
   */
  async getEmbeddingStats(): Promise<{
    totalChunks: number;
    chunksWithEmbeddings: number;
    embeddingCoverage: number;
    repositoryChunks: number;
    questionChunks: number;
  }> {
    try {
      const stats = await this.prisma.$queryRaw`
        SELECT 
          COUNT(*) as total_chunks,
          COUNT(embedding) as chunks_with_embeddings,
          COUNT(CASE WHEN "repositoryId" IS NOT NULL THEN 1 END) as repository_chunks,
          COUNT(CASE WHEN "questionId" IS NOT NULL THEN 1 END) as question_chunks
        FROM "ContentChunk"
      `;

      const result = (stats as any[])[0];
      const totalChunks = parseInt(result.total_chunks);
      const chunksWithEmbeddings = parseInt(result.chunks_with_embeddings);

      return {
        totalChunks,
        chunksWithEmbeddings,
        embeddingCoverage: totalChunks > 0 ? chunksWithEmbeddings / totalChunks : 0,
        repositoryChunks: parseInt(result.repository_chunks),
        questionChunks: parseInt(result.question_chunks),
      };
    } catch (error) {
      this.logger.error(`Failed to get embedding stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if pgvector extension is available
   */
  async checkVectorExtension(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1::vector`;
      return true;
    } catch {
      this.logger.warn('pgvector extension not available');
      return false;
    }
  }

  /**
   * Create vector index for better performance
   */
  async createVectorIndex(): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS content_chunk_embedding_cosine_idx 
        ON "ContentChunk" USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
      `;
      
      this.logger.log('Vector index created successfully');
    } catch (error) {
      this.logger.warn(`Failed to create vector index: ${error.message}`);
      // Don't throw - index creation is optional optimization
    }
  }

  /**
   * Find duplicate or similar content chunks
   */
  async findSimilarChunks(
    chunkId: string,
    threshold: number = 0.95,
  ): Promise<VectorSearchResult[]> {
    try {
      const embedding = await this.getEmbedding(chunkId);
      if (!embedding) {
        return [];
      }

      const results = await this.searchSimilar(embedding, {
        threshold,
        limit: 20,
      });

      // Filter out the original chunk
      return results.filter(result => result.id !== chunkId);
    } catch (error) {
      this.logger.error(`Failed to find similar chunks: ${error.message}`);
      throw error;
    }
  }
}