import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  Logger,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SearchService, SearchOptions } from '../services/search.service';

@ApiTags('search')
@Controller('search')
export class SearchController {
  private readonly logger = new Logger(SearchController.name);

  constructor(private searchService: SearchService) {}

  @ApiOperation({
    summary: 'Vector-only semantic search',
    description:
      'Embeds the query with Gemini text-embedding-004 and runs a cosine ' +
      'similarity search over content_chunks.embedding (pgvector). Use this ' +
      'when you want pure semantic matches and no keyword bias.',
  })
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

  @ApiOperation({
    summary: 'Postgres full-text search',
    description:
      'Runs Postgres tsvector matching over content_chunks.chunkText. Best for ' +
      'literal symbol / keyword queries where you know the exact term.',
  })
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

  @ApiOperation({
    summary: 'Hybrid (vector + full-text) search with reranking',
    description:
      'Recommended default. Combines semantic and full-text scores ' +
      '(0.6 * vector + 0.4 * text by default), reranks the top-K results, ' +
      'and returns chunks with file path + line range so a UI can deep-link.',
  })
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

  @ApiOperation({
    summary: 'Hybrid search scoped to a single repository',
  })
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

  @ApiOperation({
    summary: 'Hybrid search restricted to StackOverflow questions',
  })
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

  @ApiOperation({
    summary: 'Autocomplete suggestions for the search bar',
    description:
      'Pass `q` as a partial query (≥2 chars). Returns frequently-seen ' +
      'completions; safe to call on every keystroke (debounced client-side).',
  })
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

  @ApiOperation({
    summary: 'Aggregate search-corpus statistics',
    description:
      'Counts of indexed repositories, questions, content chunks, and ' +
      'embedding-status breakdown. Useful for the admin dashboard.',
  })
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

  @ApiOperation({
    summary: 'Hybrid search via GET (URL-shareable / linkable)',
  })
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
