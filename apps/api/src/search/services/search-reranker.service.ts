import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '../../services/gemini.service';
import { HybridSearchResult } from './hybrid-search.service';

export interface RerankedResult extends HybridSearchResult {
  originalRank: number;
  rerankedScore: number;
  rerankedRank: number;
  rerankedReason?: string;
}

export interface RerankerOptions {
  maxResults?: number;
  rerankerPrompt?: string;
  includeReasonlng?: boolean;
}

export interface RerankerResponse {
  results: RerankedResult[];
  rerankerUsed: boolean;
  rerankerTime: number;
  originalResultsCount: number;
  rerankedResultsCount: number;
}

@Injectable()
export class SearchRerankerService {
  private readonly logger = new Logger(SearchRerankerService.name);

  constructor(private readonly geminiService: GeminiService) {
    this.logger.log('Search reranker service initialized');
  }

  /**
   * Rerank search results using Gemini LLM for improved relevance
   */
  async rerank(
    query: string,
    results: HybridSearchResult[],
    options: RerankerOptions = {},
  ): Promise<RerankerResponse> {
    const startTime = Date.now();
    const { maxResults = 10, includeReasonlng = false } = options;

    let rerankerUsed = false;

    try {
      // If no results or Gemini not available, return original results
      if (results.length === 0 || !this.geminiService.isAvailable()) {
        return {
          results: results.slice(0, maxResults).map((result, index) => ({
            ...result,
            originalRank: index + 1,
            rerankedScore: result.combinedRank,
            rerankedRank: index + 1,
          })),
          rerankerUsed: false,
          rerankerTime: Date.now() - startTime,
          originalResultsCount: results.length,
          rerankedResultsCount: Math.min(results.length, maxResults),
        };
      }

      // Limit results to process (reranking is expensive)
      const resultsToRerank = results.slice(0, Math.min(results.length, 20));

      // Generate reranking using Gemini
      const rerankedResults = await this.rerankeWithGemini(
        query,
        resultsToRerank,
        includeReasonlng,
      );

      rerankerUsed = true;

      return {
        results: rerankedResults.slice(0, maxResults),
        rerankerUsed,
        rerankerTime: Date.now() - startTime,
        originalResultsCount: results.length,
        rerankedResultsCount: Math.min(rerankedResults.length, maxResults),
      };
    } catch (error) {
      this.logger.warn(
        `Reranking failed, using original order: ${error.message}`,
      );

      // Fallback to original results on error
      return {
        results: results.slice(0, maxResults).map((result, index) => ({
          ...result,
          originalRank: index + 1,
          rerankedScore: result.combinedRank,
          rerankedRank: index + 1,
        })),
        rerankerUsed: false,
        rerankerTime: Date.now() - startTime,
        originalResultsCount: results.length,
        rerankedResultsCount: Math.min(results.length, maxResults),
      };
    }
  }

  /**
   * Perform reranking using Gemini LLM
   */
  private async rerankeWithGemini(
    query: string,
    results: HybridSearchResult[],
    includeReasoning: boolean,
  ): Promise<RerankedResult[]> {
    try {
      // Prepare the prompt for reranking
      const prompt = this.buildRerankerPrompt(query, results, includeReasoning);

      // Get Gemini's reranking response
      const response = await this.geminiService.generateText(prompt);

      // Parse the response and apply reranking
      const rerankedResults = this.parseRerankerResponse(
        response,
        results,
        includeReasoning,
      );

      return rerankedResults;
    } catch (error) {
      this.logger.error(`Gemini reranking failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build prompt for Gemini reranking
   */
  private buildRerankerPrompt(
    query: string,
    results: HybridSearchResult[],
    includeReasoning: boolean,
  ): string {
    const resultsText = results
      .map((result, index) => {
        const snippet = result.content.substring(0, 200).replace(/\n/g, ' ');
        return `${index + 1}. Title: "${result.title}"
Content: "${snippet}..."
Language: ${result.metadata.language ?? 'Unknown'}
Source: ${result.metadata.source}`;
      })
      .join('\n\n');

    const basePrompt = `You are a search result reranker. Given a user query and search results, rerank them by relevance to the query.

Query: "${query}"

Search Results:
${resultsText}

Instructions:
1. Analyze each result's relevance to the query
2. Consider title relevance, content relevance, and language appropriateness
3. Return ONLY a comma-separated list of result numbers in order of relevance (most relevant first)
4. Use only the numbers 1-${results.length}, no other text${includeReasoning ? '\n5. After the ranking, provide a brief explanation for the top 3 choices on new lines starting with "Reason:"' : ''}

Example format: 3,1,5,2,4${includeReasoning ? '\nReason: Result 3 most directly answers the query about...' : ''}

Ranking:`;

    return basePrompt;
  }

  /**
   * Parse Gemini's reranking response
   */
  private parseRerankerResponse(
    response: string,
    originalResults: HybridSearchResult[],
    includeReasoning: boolean,
  ): RerankedResult[] {
    try {
      const lines = response.trim().split('\n');
      const rankingLine = lines[0].trim();

      // Parse the ranking (e.g., "3,1,5,2,4")
      const rankedIndices = rankingLine
        .split(',')
        .map((num) => parseInt(num.trim()) - 1) // Convert to 0-based index
        .filter((index) => index >= 0 && index < originalResults.length);

      // Extract reasoning if requested
      let reasoning: string | undefined;
      if (includeReasoning && lines.length > 1) {
        reasoning = lines
          .slice(1)
          .filter((line) => line.toLowerCase().startsWith('reason:'))
          .join(' ')
          .replace(/^reason:\s*/i, '');
      }

      // Build reranked results
      const rerankedResults: RerankedResult[] = [];
      const usedIndices = new Set<number>();

      // Add reranked results in new order
      rankedIndices.forEach((originalIndex, newRank) => {
        if (usedIndices.has(originalIndex)) return; // Skip duplicates

        const originalResult = originalResults[originalIndex];
        if (originalResult) {
          usedIndices.add(originalIndex);
          rerankedResults.push({
            ...originalResult,
            originalRank: originalIndex + 1,
            rerankedScore: 1 - newRank / rankedIndices.length, // Higher score for better rank
            rerankedRank: newRank + 1,
            rerankedReason: newRank < 3 ? reasoning : undefined,
          });
        }
      });

      // Add any remaining results that weren't reranked
      originalResults.forEach((result, index) => {
        if (!usedIndices.has(index)) {
          rerankedResults.push({
            ...result,
            originalRank: index + 1,
            rerankedScore: result.combinedRank,
            rerankedRank: rerankedResults.length + 1,
          });
        }
      });

      return rerankedResults;
    } catch (error) {
      this.logger.warn(`Failed to parse reranker response: ${error.message}`);

      // Fallback: return original order with reranked structure
      return originalResults.map((result, index) => ({
        ...result,
        originalRank: index + 1,
        rerankedScore: result.combinedRank,
        rerankedRank: index + 1,
      }));
    }
  }

  /**
   * Simple statistical reranker as fallback (when Gemini not available)
   */
  rerankWithStatistics(
    query: string,
    results: HybridSearchResult[],
    maxResults = 10,
  ): Promise<RerankerResponse> {
    const startTime = Date.now();

    try {
      const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((term) => term.length > 2);

      // Score results based on query term frequency and position
      const scoredResults = results.map((result, index) => {
        const titleWords = result.title.toLowerCase().split(/\s+/);
        const contentWords = result.content.toLowerCase().split(/\s+/);

        let score = result.combinedRank; // Start with original score

        // Boost for query terms in title
        const titleMatches = queryTerms.filter((term) =>
          titleWords.some((word) => word.includes(term)),
        ).length;
        score += titleMatches * 0.3;

        // Boost for query terms in content
        const contentMatches = queryTerms.filter((term) =>
          contentWords.some((word) => word.includes(term)),
        ).length;
        score += contentMatches * 0.1;

        // Boost for exact query term matches
        const exactTitleMatches = queryTerms.filter((term) =>
          titleWords.includes(term),
        ).length;
        score += exactTitleMatches * 0.2;

        return {
          ...result,
          originalRank: index + 1,
          rerankedScore: score,
          rerankedRank: 0, // Will be set after sorting
        };
      });

      // Sort by reranked score and assign ranks
      scoredResults.sort((a, b) => b.rerankedScore - a.rerankedScore);
      scoredResults.forEach((result, index) => {
        result.rerankedRank = index + 1;
      });

      return Promise.resolve({
        results: scoredResults.slice(0, maxResults),
        rerankerUsed: true,
        rerankerTime: Date.now() - startTime,
        originalResultsCount: results.length,
        rerankedResultsCount: Math.min(scoredResults.length, maxResults),
      });
    } catch (error) {
      this.logger.error(`Statistical reranking failed: ${error.message}`);

      // Return original results
      return Promise.resolve({
        results: results.slice(0, maxResults).map((result, index) => ({
          ...result,
          originalRank: index + 1,
          rerankedScore: result.combinedRank,
          rerankedRank: index + 1,
        })),
        rerankerUsed: false,
        rerankerTime: Date.now() - startTime,
        originalResultsCount: results.length,
        rerankedResultsCount: Math.min(results.length, maxResults),
      });
    }
  }

  /**
   * Health check for reranker
   */
  healthCheck(): Promise<{
    available: boolean;
    geminiAvailable: boolean;
    statisticalFallback: boolean;
  }> {
    try {
      const geminiAvailable = this.geminiService.isAvailable();

      return Promise.resolve({
        available: true, // Statistical fallback is always available
        geminiAvailable,
        statisticalFallback: !geminiAvailable,
      });
    } catch {
      return Promise.resolve({
        available: false,
        geminiAvailable: false,
        statisticalFallback: false,
      });
    }
  }
}
