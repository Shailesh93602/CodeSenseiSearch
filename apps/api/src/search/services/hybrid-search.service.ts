import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '../../services/gemini.service';
import {
  VectorService,
  VectorSearchResult,
} from '../../services/vector.service';
import {
  FullTextSearchService,
  FullTextSearchResult,
} from './fulltext-search.service';
import { SearchFilterService } from './search-filter.service';
import { PrismaService } from '../../services/prisma.service';
import {
  SearchFilters,
  AppliedFilters,
} from '../interfaces/search-filters.interface';

export interface HybridSearchResult {
  id: string;
  content: string;
  title: string;
  score: number;
  vectorSimilarity?: number;
  textRank?: number;
  combinedRank: number;
  searchMethod: 'vector' | 'text' | 'both';
  metadata: {
    source: 'repository' | 'question' | 'documentation';
    repositoryId?: string;
    questionId?: string;
    contentType?: string;
    language?: string;
    path?: string;
    repositoryName?: string;
    url?: string;
  };
}

export interface HybridSearchOptions {
  limit?: number;
  vectorThreshold?: number;
  vectorWeight?: number;
  textWeight?: number;
  source?: 'repository' | 'question' | 'all';
  language?: string;
  contentType?: string;
  repository?: string;
  repositoryId?: string;
  filters?: SearchFilters;
}

export interface HybridSearchResponse {
  query: string;
  results: HybridSearchResult[];
  totalResults: number;
  searchTime: number;
  searchMethod: 'hybrid';
  metadata: {
    embeddingGenerated: boolean;
    vectorSearchUsed: boolean;
    textSearchUsed: boolean;
    vectorResults: number;
    textResults: number;
    mergedResults: number;
  };
  filterInfo?: AppliedFilters;
}

@Injectable()
export class HybridSearchService {
  private readonly logger = new Logger(HybridSearchService.name);

  constructor(
    private readonly geminiService: GeminiService,
    private readonly vectorService: VectorService,
    private readonly fullTextSearchService: FullTextSearchService,
    private readonly searchFilterService: SearchFilterService,
    private readonly prisma: PrismaService,
  ) {
    this.logger.log('Hybrid search service initialized');
  }

  /**
   * Perform hybrid search combining vector similarity and full-text search
   */
  async hybridSearch(
    query: string,
    options: HybridSearchOptions = {},
  ): Promise<HybridSearchResponse> {
    const startTime = Date.now();
    const {
      limit = 20,
      vectorThreshold = 0.7,
      vectorWeight = 0.6,
      textWeight = 0.4,
      source = 'all',
      language,
      contentType,
      repository,
      repositoryId,
    } = options;

    let embeddingGenerated = false;
    let vectorSearchUsed = false;
    let textSearchUsed = false;
    let vectorResults: VectorSearchResult[] = [];
    let textResults: FullTextSearchResult[] = [];

    try {
      // Execute both searches in parallel for better performance
      const searchPromises: Promise<any>[] = [];

      // 1. Vector Search (if Gemini is available)
      if (this.geminiService.isAvailable()) {
        searchPromises.push(
          this.performVectorSearch(query, {
            limit: Math.ceil(limit * 1.5), // Get more results for merging
            threshold: vectorThreshold,
            source,
            language,
            repositoryId,
          })
            .then((result) => {
              vectorResults = result.results;
              embeddingGenerated = result.embeddingGenerated;
              vectorSearchUsed = result.used;
            })
            .catch((error) => {
              this.logger.warn(`Vector search failed: ${error.message}`);
            }),
        );
      }

      // 2. Full-Text Search
      searchPromises.push(
        this.performFullTextSearch(query, {
          limit: Math.ceil(limit * 1.5), // Get more results for merging
          language,
          contentType,
          repository,
        })
          .then((result) => {
            textResults = result.results;
            textSearchUsed = result.used;
          })
          .catch((error) => {
            this.logger.warn(`Full-text search failed: ${error.message}`);
          }),
      );

      // Wait for both searches to complete
      await Promise.all(searchPromises);

      // 3. Merge and rank results
      let mergedResults = this.mergeAndRankResults(
        vectorResults,
        textResults,
        vectorWeight,
        textWeight,
        limit,
      );

      // 4. Apply filters if provided
      let filterInfo: AppliedFilters | undefined;
      if (options.filters) {
        const validation = await this.searchFilterService.validateFilters(
          options.filters,
        );
        if (validation.isValid) {
          filterInfo = this.searchFilterService.applyFiltersToResults(
            mergedResults,
            validation.sanitizedFilters,
          );
          mergedResults = mergedResults.slice(
            0,
            filterInfo.totalResultsAfterFiltering,
          );
        } else {
          this.logger.warn(
            `Filter validation failed: ${validation.errors.join(', ')}`,
          );
        }
      }

      const searchTime = Date.now() - startTime;

      this.logger.log(
        `Hybrid search completed in ${searchTime}ms: ${vectorResults.length} vector + ${textResults.length} text → ${mergedResults.length} merged results`,
      );

      return {
        query,
        results: mergedResults,
        totalResults: mergedResults.length,
        searchTime,
        searchMethod: 'hybrid',
        metadata: {
          embeddingGenerated,
          vectorSearchUsed,
          textSearchUsed,
          vectorResults: vectorResults.length,
          textResults: textResults.length,
          mergedResults: mergedResults.length,
        },
        filterInfo,
      };
    } catch (error) {
      this.logger.error(`Hybrid search failed: ${error.message}`);
      throw new Error(`Hybrid search failed: ${error.message}`);
    }
  }

  /**
   * Perform vector similarity search
   */
  private async performVectorSearch(
    query: string,
    options: {
      limit: number;
      threshold: number;
      source: string;
      language?: string;
      repositoryId?: string;
    },
  ): Promise<{
    results: VectorSearchResult[];
    embeddingGenerated: boolean;
    used: boolean;
  }> {
    try {
      // Generate embedding for the search query
      const queryEmbedding =
        await this.geminiService.generateQueryEmbedding(query);

      // Perform vector search
      const results = await this.vectorService.searchSimilar(queryEmbedding, {
        limit: options.limit,
        threshold: options.threshold,
        contentType: options.source === 'all' ? 'all' : (options.source as any),
        language: options.language,
        repositoryId: options.repositoryId,
      });

      return {
        results,
        embeddingGenerated: true,
        used: true,
      };
    } catch (error) {
      this.logger.warn(`Vector search component failed: ${error.message}`);
      return {
        results: [],
        embeddingGenerated: false,
        used: false,
      };
    }
  }

  /**
   * Perform full-text search
   */
  private async performFullTextSearch(
    query: string,
    options: {
      limit: number;
      language?: string;
      contentType?: string;
      repository?: string;
    },
  ): Promise<{
    results: FullTextSearchResult[];
    used: boolean;
  }> {
    try {
      const searchResponse = await this.fullTextSearchService.search({
        query,
        limit: options.limit,
        language: options.language,
        contentType: options.contentType,
        repository: options.repository,
      });

      return {
        results: searchResponse.results,
        used: true,
      };
    } catch (error) {
      this.logger.warn(`Full-text search component failed: ${error.message}`);
      return {
        results: [],
        used: false,
      };
    }
  }

  /**
   * Merge and rank results from vector and text search
   */
  private mergeAndRankResults(
    vectorResults: VectorSearchResult[],
    textResults: FullTextSearchResult[],
    vectorWeight: number,
    textWeight: number,
    limit: number,
  ): HybridSearchResult[] {
    const mergedMap = new Map<string, HybridSearchResult>();

    // Process vector search results
    vectorResults.forEach((result, index) => {
      const normalizedScore = this.normalizeVectorScore(
        result.similarity,
        index,
        vectorResults.length,
      );

      mergedMap.set(result.id, {
        id: result.id,
        content: result.content,
        title: result.metadata.title ?? '',
        score: normalizedScore,
        vectorSimilarity: result.similarity,
        textRank: undefined,
        combinedRank: normalizedScore * vectorWeight,
        searchMethod: 'vector',
        metadata: {
          source: contentTypeToSource(result.metadata.contentType),
          repositoryId: result.metadata.repositoryId,
          questionId: result.metadata.questionId,
          contentType: result.metadata.contentType,
          language: result.metadata.language,
          path: result.metadata.path,
          repositoryName: undefined, // Will be filled from text results if available
        },
      });
    });

    // Process text search results and merge
    textResults.forEach((result, index) => {
      const normalizedScore = this.normalizeTextScore(
        result.rank,
        index,
        textResults.length,
      );
      const existingResult = mergedMap.get(result.id);

      if (existingResult) {
        // Merge with existing vector result
        existingResult.textRank = result.rank;
        existingResult.combinedRank =
          existingResult.score * vectorWeight + normalizedScore * textWeight;
        existingResult.searchMethod = 'both';
        existingResult.metadata.repositoryName =
          result.repositoryName ?? undefined;
      } else {
        // Add as new text-only result
        mergedMap.set(result.id, {
          id: result.id,
          content: result.content,
          title: result.title,
          score: normalizedScore,
          vectorSimilarity: undefined,
          textRank: result.rank,
          combinedRank: normalizedScore * textWeight,
          searchMethod: 'text',
          metadata: {
            source: contentTypeToSource(result.contentType),
            language: result.language ?? undefined,
            contentType: result.contentType,
            repositoryName: result.repositoryName ?? undefined,
          },
        });
      }
    });

    // Sort by combined rank and return top results
    return Array.from(mergedMap.values())
      .sort((a, b) => b.combinedRank - a.combinedRank)
      .slice(0, limit);
  }

  /**
   * Normalize vector similarity scores (0-1 range)
   */
  private normalizeVectorScore(
    similarity: number,
    position: number,
    total: number,
  ): number {
    // Combine similarity score with position-based decay
    const positionPenalty = 1 - (position / total) * 0.1; // Small position penalty
    return Math.max(0, Math.min(1, similarity * positionPenalty));
  }

  /**
   * Normalize text search rank scores
   */
  private normalizeTextScore(
    rank: number,
    position: number,
    total: number,
  ): number {
    // Convert rank to 0-1 score with position-based decay
    const maxRank = Math.max(rank, 1); // Avoid division by zero
    const baseScore = Math.min(1, rank / maxRank);
    const positionPenalty = 1 - (position / total) * 0.1; // Small position penalty
    return Math.max(0, Math.min(1, baseScore * positionPenalty));
  }

  /**
   * Get hybrid search suggestions combining both vector and text suggestions
   */
  async getHybridSearchSuggestions(
    partialQuery: string,
    limit = 10,
  ): Promise<string[]> {
    try {
      const suggestions = new Set<string>();

      // Get text-based suggestions
      try {
        const textSuggestions = await this.fullTextSearchService.getSuggestions(
          partialQuery,
          limit,
        );
        textSuggestions.forEach((s) => suggestions.add(s));
      } catch (error) {
        this.logger.warn(`Text suggestions failed: ${error.message}`);
      }

      // TODO: Add vector-based suggestions (semantic similarity for query expansion)
      // This could involve finding similar queries from search history or content titles

      return Array.from(suggestions).slice(0, limit);
    } catch (error) {
      this.logger.error(`Hybrid suggestions failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Health check for hybrid search components
   */
  async healthCheck(): Promise<{
    available: boolean;
    components: {
      gemini: boolean;
      vector: boolean;
      fulltext: boolean;
    };
    errors?: string[];
  }> {
    const errors: string[] = [];
    let geminiAvailable = false;
    let vectorAvailable = false;
    let fulltextAvailable = false;

    try {
      // Check Gemini service
      geminiAvailable = this.geminiService.isAvailable();
      if (!geminiAvailable) {
        errors.push('Gemini service not available');
      }

      // Check vector service (basic check)
      try {
        // Simple test - we could add a proper health check method to VectorService
        vectorAvailable = true;
      } catch (error) {
        errors.push(`Vector service error: ${error.message}`);
      }

      // Check full-text search
      try {
        const ftHealth = await this.fullTextSearchService.healthCheck();
        fulltextAvailable = ftHealth.available;
        if (!fulltextAvailable && ftHealth.error) {
          errors.push(`Full-text search error: ${ftHealth.error}`);
        }
      } catch (error) {
        errors.push(`Full-text search health check failed: ${error.message}`);
      }

      const available = geminiAvailable && fulltextAvailable; // Vector is optional

      return {
        available,
        components: {
          gemini: geminiAvailable,
          vector: vectorAvailable,
          fulltext: fulltextAvailable,
        },
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        available: false,
        components: {
          gemini: false,
          vector: false,
          fulltext: false,
        },
        errors: [`Health check failed: ${error.message}`],
      };
    }
  }
}

/**
 * Map a Content.contentType (Prisma enum string) into the coarse
 * `source` label the search response exposes. The FE renders this as
 * a badge: "GitHub" for repos, "Stack Overflow" for SO content,
 * "Documentation" for everything else (curated docs, blog posts).
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

