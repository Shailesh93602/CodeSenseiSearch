import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { VectorService } from './vector.service';
import { PrismaService } from './prisma.service';

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  similarity?: number;
  metadata: {
    source: 'repository' | 'question' | 'documentation';
    repositoryId?: string;
    questionId?: string;
    chunkIndex?: number;
    language?: string;
    path?: string;
    title?: string;
    owner?: string;
    url?: string;
  };
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  source?: 'repository' | 'question' | 'all';
  language?: string;
  repositoryId?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  totalResults: number;
  searchTime: number;
  searchMethod: 'semantic' | 'text' | 'hybrid';
  metadata: {
    embeddingGenerated: boolean;
    vectorSearchUsed: boolean;
    textSearchUsed: boolean;
  };
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private geminiService: GeminiService,
    private vectorService: VectorService,
    private prisma: PrismaService,
  ) {
    this.logger.log('Search service initialized');
  }

  /**
   * Perform semantic search using embeddings
   */
  async semanticSearch(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    const { limit = 10, threshold = 0.7, source = 'all' } = options;

    let embeddingGenerated = false;
    let vectorSearchUsed = false;

    try {
      // Generate embedding for the search query
      let queryEmbedding: number[] | null = null;

      if (this.geminiService.isAvailable()) {
        try {
          queryEmbedding =
            await this.geminiService.generateQueryEmbedding(query);
          embeddingGenerated = true;
          this.logger.debug('Generated query embedding');
        } catch (error) {
          this.logger.warn(`
            Failed to generate query embedding: ${error.message}`);
        }
      }

      let results: SearchResult[] = [];

      // Use vector search if embedding was generated
      if (queryEmbedding) {
        try {
          const vectorResults = await this.vectorService.searchSimilar(
            queryEmbedding,
            {
              limit,
              threshold,
              contentType: source,
              ...options,
            },
          );

          results = await this.enrichSearchResults(vectorResults, 'semantic');
          vectorSearchUsed = true;
          this.logger.debug(`Vector search returned ${results.length} results`);
        } catch (error) {
          this.logger.warn(`Vector search failed: ${error.message}`);
        }
      }

      // Fallback to text search if vector search failed or no results
      if (results.length === 0) {
        results = await this.textSearch(query, options);
        this.logger.debug(`Text search returned ${results.length} results`);
      }

      const searchTime = Date.now() - startTime;

      return {
        query,
        results,
        totalResults: results.length,
        searchTime,
        searchMethod: vectorSearchUsed ? 'semantic' : 'text',
        metadata: {
          embeddingGenerated,
          vectorSearchUsed,
          textSearchUsed: !vectorSearchUsed,
        },
      };
    } catch (error) {
      this.logger.error(`Semantic search failed: ${error.message}`);
      // Ultimate fallback to text search
      const results = await this.textSearch(query, options);
      const searchTime = Date.now() - startTime;

      return {
        query,
        results,
        totalResults: results.length,
        searchTime,
        searchMethod: 'text',
        metadata: {
          embeddingGenerated: false,
          vectorSearchUsed: false,
          textSearchUsed: true,
        },
      };
    }
  }

  /**
   * Perform text-based search using PostgreSQL full-text search
   */
  async textSearch(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    const { limit = 10, source = 'all', language, repositoryId } = options;

    try {
      // Prepare search query for PostgreSQL full-text search
      const searchTerms = query
        .split(' ')
        .map((term) => term.trim())
        .filter((term) => term.length > 0)
        .join(' & ');

      // Build WHERE conditions
      const conditions: string[] = [];
      const params: any[] = [searchTerms, limit];
      let paramIndex = 3;

      if (source !== 'all') {
        if (source === 'repository') {
          conditions.push('cc."repositoryId" IS NOT NULL');
        } else if (source === 'question') {
          conditions.push('cc."questionId" IS NOT NULL');
        }
      }

      if (language) {
        conditions.push(`cc.language = $${paramIndex}`);
        params.push(language);
        paramIndex++;
      }

      if (repositoryId) {
        conditions.push(`cc."repositoryId" = $${paramIndex}`);
        params.push(repositoryId);
        paramIndex++;
      }

      const whereClause =
        conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

      const query_sql = `
        SELECT 
          cc.id,
          cc."chunkText" as content,
          cc.sequence as "chunkIndex",
          c."repositoryId",
          c."questionId",
          c.language,
          r."fullName" as repository_name,
          r."owner" as repository_owner,
          r."htmlUrl" as repository_url,
          q."title" as question_title,
          q."questionId" as question_so_id,
          ts_rank(to_tsvector('english', cc."chunkText"), to_tsquery('english', $1)) as rank
        FROM "content_chunks" cc
        LEFT JOIN "contents" c ON cc."contentId" = c.id
        LEFT JOIN "repositories" r ON c."repositoryId" = r.id
        LEFT JOIN "questions" q ON c."questionId" = q.id
        WHERE to_tsvector('english', cc."chunkText") @@ to_tsquery('english', $1)
        ${whereClause}
        ORDER BY rank DESC
        LIMIT $2
      `;

      const rows = await this.prisma.$queryRawUnsafe(query_sql, ...params);

      return (rows as any[]).map((row) => ({
        id: row.id,
        content: row.content,
        score: parseFloat(row.rank),
        metadata: {
          source: row.repositoryId ? 'repository' : 'question',
          repositoryId: row.repositoryId?.toString(),
          questionId: row.questionId?.toString(),
          chunkIndex: row.chunkIndex,
          language: row.language,
          title: row.repository_name ?? row.question_title,
          owner: row.repository_owner,
          url: row.repositoryId
            ? row.repository_url
            : `https://stackoverflow.com/questions/${row.question_so_id}`,
        },
      }));
    } catch (error) {
      this.logger.error(`Text search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Hybrid search combining semantic and text search
   */
  async hybridSearch(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    const { limit = 10 } = options;

    try {
      // Perform both searches in parallel
      const [semanticResponse, textResults] = await Promise.all([
        this.semanticSearch(query, {
          ...options,
          limit: Math.ceil(limit * 0.7),
        }),
        this.textSearch(query, { ...options, limit: Math.ceil(limit * 0.5) }),
      ]);

      // Combine and deduplicate results
      const combinedResults = this.combineAndRankResults(
        semanticResponse.results,
        textResults,
        limit,
      );

      const searchTime = Date.now() - startTime;

      return {
        query,
        results: combinedResults,
        totalResults: combinedResults.length,
        searchTime,
        searchMethod: 'hybrid',
        metadata: {
          embeddingGenerated: semanticResponse.metadata.embeddingGenerated,
          vectorSearchUsed: semanticResponse.metadata.vectorSearchUsed,
          textSearchUsed: true,
        },
      };
    } catch (error) {
      this.logger.error(`Hybrid search failed: ${error.message}`);
      // Fallback to semantic search only
      return this.semanticSearch(query, options);
    }
  }

  /**
   * Search specifically within a repository
   */
  async searchInRepository(
    repositoryId: string,
    query: string,
    options: Omit<SearchOptions, 'repositoryId'> = {},
  ): Promise<SearchResponse> {
    return this.semanticSearch(query, {
      ...options,
      repositoryId,
      source: 'repository',
    });
  }

  /**
   * Search across questions
   */
  async searchQuestions(
    query: string,
    options: Omit<SearchOptions, 'source'> = {},
  ): Promise<SearchResponse> {
    return this.semanticSearch(query, {
      ...options,
      source: 'question',
    });
  }

  /**
   * Get search suggestions based on partial query
   */
  async getSearchSuggestions(partialQuery: string): Promise<string[]> {
    if (partialQuery.length < 2) {
      return [];
    }

    try {
      // Get common terms from content chunks
      const suggestions = await this.prisma.$queryRawUnsafe(
        `WITH word_list AS (
          SELECT UNNEST(regexp_split_to_array("chunkText", '\\W+')) as term
          FROM "content_chunks"
          WHERE "chunkText" ILIKE $1
        )
        SELECT DISTINCT term 
        FROM word_list
        WHERE LENGTH(term) > 2
        AND term ILIKE $2
        ORDER BY term
        LIMIT 10
      `,
        `%${partialQuery}%`,
        `${partialQuery}%`,
      );

      return (suggestions as any[])
        .map((row) => row.term)
        .filter((term) =>
          term?.toLowerCase().startsWith(partialQuery.toLowerCase()),
        );
    } catch (error) {
      this.logger.error(`Failed to get suggestions: ${error.message}`);
      return [];
    }
  }

  /**
   * Get search analytics/stats
   */
  async getSearchStats(): Promise<{
    totalChunks: number;
    chunksWithEmbeddings: number;
    embeddingCoverage: number;
    repositoryChunks: number;
    questionChunks: number;
    availableLanguages: string[];
  }> {
    try {
      const [embeddingStats, languageStats] = await Promise.all([
        this.vectorService.getEmbeddingStats(),
        this.prisma.$queryRaw`
          SELECT DISTINCT c.language
          FROM "contents" c
          JOIN "content_chunks" cc ON c.id = cc."contentId"
          WHERE c.language IS NOT NULL
          ORDER BY c.language
        `,
      ]);

      const languages = (languageStats as any[])
        .map((row) => row.language)
        .filter(Boolean);

      return {
        ...embeddingStats,
        availableLanguages: languages,
      };
    } catch (error) {
      this.logger.error(`Failed to get search stats: ${error.message}`);
      return {
        totalChunks: 0,
        chunksWithEmbeddings: 0,
        embeddingCoverage: 0,
        repositoryChunks: 0,
        questionChunks: 0,
        availableLanguages: [],
      };
    }
  }

  /**
   * Enrich vector search results with additional metadata
   */
  private async enrichSearchResults(
    vectorResults: any[],
    searchType: 'semantic' | 'text',
  ): Promise<SearchResult[]> {
    if (vectorResults.length === 0) return [];

    try {
      const chunkIds = vectorResults.map((result) => result.id);
      const enrichedData = await this.prisma.$queryRawUnsafe(
        `SELECT 
          cc.id,
          c."repositoryId",
          c."questionId",
          c.language,
          r."fullName" as repository_name,
          r."owner" as repository_owner,
          r."htmlUrl" as repository_url,
          q."title" as question_title,
          q."questionId" as question_so_id
        FROM "content_chunks" cc
        LEFT JOIN "contents" c ON cc."contentId" = c.id
        LEFT JOIN "repositories" r ON c."repositoryId" = r.id
        LEFT JOIN "questions" q ON c."questionId" = q.id
        WHERE cc.id = ANY($1)
      `,
        chunkIds,
      );

      const enrichmentMap = new Map(
        (enrichedData as any[]).map((row) => [row.id, row]),
      );

      return vectorResults.map((result) => {
        const enrichment = enrichmentMap.get(result.id);
        return {
          id: result.id,
          content: result.content,
          score: searchType === 'semantic' ? result.similarity : 1.0,
          similarity: result.similarity,
          metadata: {
            source: contentTypeToSource(result.metadata.contentType),
            repositoryId: enrichment?.repositoryId?.toString(),
            questionId: enrichment?.questionId?.toString(),
            chunkIndex: result.metadata.chunkIndex,
            language: enrichment?.language,
            title: enrichment?.repository_name ?? enrichment?.question_title,
            owner: enrichment?.repository_owner,
            url: enrichment?.repositoryId
              ? enrichment.repository_url
              : enrichment?.question_so_id
                ? `https://stackoverflow.com/questions/${enrichment.question_so_id}`
                : undefined,
          },
        };
      });
    } catch (error) {
      this.logger.error(`Failed to enrich search results: ${error.message}`);
      return vectorResults.map((result) => ({
        id: result.id,
        content: result.content,
        score: result.similarity ?? 1.0,
        metadata: {
          source: result.metadata.contentType,
          chunkIndex: result.metadata.chunkIndex,
        },
      }));
    }
  }

  /**
   * Combine and rank results from semantic and text search
   */
  private combineAndRankResults(
    semanticResults: SearchResult[],
    textResults: SearchResult[],
    limit: number,
  ): SearchResult[] {
    const resultMap = new Map<string, SearchResult>();

    // Add semantic results with higher weight
    semanticResults.forEach((result) => {
      resultMap.set(result.id, {
        ...result,
        score: (result.score || 0) * 1.2, // Boost semantic results
      });
    });

    // Add text results, combining scores if already exists
    textResults.forEach((result) => {
      const existing = resultMap.get(result.id);
      if (existing) {
        // Combine scores
        existing.score = (existing.score + result.score) / 2;
      } else {
        resultMap.set(result.id, result);
      }
    });

    // Sort by combined score and limit
    return Array.from(resultMap.values())
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, limit);
  }
}

/**
 * Map a Content.contentType (Prisma enum string) into the coarse
 * `source` label the search response exposes. Mirrors the same helper
 * in hybrid-search.service.ts — kept duplicated rather than moved to
 * a shared module because both files independently shape the search
 * response and a future refactor will likely consolidate them.
 */
function contentTypeToSource(
  contentType?: string | null,
): 'repository' | 'question' | 'documentation' {
  if (contentType === 'REPOSITORY_FILE' || contentType === 'repository') {
    return 'repository';
  }
  if (
    contentType === 'STACKOVERFLOW_QUESTION' ||
    contentType === 'STACKOVERFLOW_ANSWER' ||
    contentType === 'question'
  ) {
    return 'question';
  }
  return 'documentation';
}
