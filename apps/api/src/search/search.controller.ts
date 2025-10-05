import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  Logger,
} from '@nestjs/common';
import { SearchService, SearchOptions } from '../services/search.service';

@Controller('search')
export class SearchController {
  private readonly logger = new Logger(SearchController.name);

  constructor(private searchService: SearchService) {}

  /**
   * Semantic search endpoint
   */
  @Post('semantic')
  async semanticSearch(
    @Body() body: { query: string; options?: SearchOptions },
  ) {
    const { query, options = {} } = body;

    if (!query || query.trim().length === 0) {
      return {
        error: 'Query is required',
        status: 400,
      };
    }

    try {
      const result = await this.searchService.semanticSearch(query, options);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Semantic search failed: ${error.message}`);
      return {
        error: 'Search failed',
        message: error.message,
        status: 500,
      };
    }
  }

  /**
   * Text search endpoint
   */
  @Post('text')
  async textSearch(@Body() body: { query: string; options?: SearchOptions }) {
    const { query, options = {} } = body;

    if (!query || query.trim().length === 0) {
      return {
        error: 'Query is required',
        status: 400,
      };
    }

    try {
      const results = await this.searchService.textSearch(query, options);
      return {
        success: true,
        data: {
          query,
          results,
          totalResults: results.length,
          searchMethod: 'text',
        },
      };
    } catch (error) {
      this.logger.error(`Text search failed: ${error.message}`);
      return {
        error: 'Search failed',
        message: error.message,
        status: 500,
      };
    }
  }

  /**
   * Hybrid search endpoint
   */
  @Post('hybrid')
  async hybridSearch(@Body() body: { query: string; options?: SearchOptions }) {
    const { query, options = {} } = body;

    if (!query || query.trim().length === 0) {
      return {
        error: 'Query is required',
        status: 400,
      };
    }

    try {
      const result = await this.searchService.hybridSearch(query, options);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Hybrid search failed: ${error.message}`);
      return {
        error: 'Search failed',
        message: error.message,
        status: 500,
      };
    }
  }

  /**
   * Repository-specific search
   */
  @Post('repository/:repositoryId')
  async searchInRepository(
    @Param('repositoryId') repositoryId: string,
    @Body()
    body: { query: string; options?: Omit<SearchOptions, 'repositoryId'> },
  ) {
    const { query, options = {} } = body;

    if (!query || query.trim().length === 0) {
      return {
        error: 'Query is required',
        status: 400,
      };
    }

    try {
      const result = await this.searchService.searchInRepository(
        repositoryId,
        query,
        options,
      );
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Repository search failed: ${error.message}`);
      return {
        error: 'Search failed',
        message: error.message,
        status: 500,
      };
    }
  }

  /**
   * Question search endpoint
   */
  @Post('questions')
  async searchQuestions(
    @Body() body: { query: string; options?: Omit<SearchOptions, 'source'> },
  ) {
    const { query, options = {} } = body;

    if (!query || query.trim().length === 0) {
      return {
        error: 'Query is required',
        status: 400,
      };
    }

    try {
      const result = await this.searchService.searchQuestions(query, options);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Question search failed: ${error.message}`);
      return {
        error: 'Search failed',
        message: error.message,
        status: 500,
      };
    }
  }

  /**
   * Get search suggestions
   */
  @Get('suggestions')
  async getSearchSuggestions(@Query('q') partialQuery: string) {
    if (!partialQuery || partialQuery.trim().length < 2) {
      return {
        success: true,
        data: {
          suggestions: [],
        },
      };
    }

    try {
      const suggestions = await this.searchService.getSearchSuggestions(
        partialQuery.trim(),
      );
      return {
        success: true,
        data: {
          query: partialQuery,
          suggestions,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get suggestions: ${error.message}`);
      return {
        error: 'Failed to get suggestions',
        message: error.message,
        status: 500,
      };
    }
  }

  /**
   * Get search statistics
   */
  @Get('stats')
  async getSearchStats() {
    try {
      const stats = await this.searchService.getSearchStats();
      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      this.logger.error(`Failed to get search stats: ${error.message}`);
      return {
        error: 'Failed to get statistics',
        message: error.message,
        status: 500,
      };
    }
  }

  /**
   * Quick search endpoint (GET for simple queries)
   */
  @Get('quick')
  async quickSearch(
    @Query('q') query: string,
    @Query('limit') limit?: string,
    @Query('source') source?: 'repository' | 'question' | 'all',
    @Query('language') language?: string,
  ) {
    if (!query || query.trim().length === 0) {
      return {
        error: 'Query parameter q is required',
        status: 400,
      };
    }

    try {
      const options: SearchOptions = {
        limit: limit ? parseInt(limit, 10) : 10,
        source: source ?? 'all',
        language: language ?? undefined,
      };

      const result = await this.searchService.semanticSearch(query, options);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Quick search failed: ${error.message}`);
      return {
        error: 'Search failed',
        message: error.message,
        status: 500,
      };
    }
  }
}
