import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../services/prisma.service';
import { ConfigService } from '@nestjs/config';

export interface FullTextSearchOptions {
  query: string;
  language?: string;
  contentType?: string;
  repository?: string;
  limit?: number;
  offset?: number;
}

export interface FullTextSearchResult {
  id: string;
  title: string;
  content: string;
  language: string | null;
  contentType: string;
  repositoryName: string | null;
  rank: number;
}

export interface FullTextSearchResponse {
  results: FullTextSearchResult[];
  total: number;
  took: number;
  query: string;
  filters: {
    language?: string;
    contentType?: string;
    repository?: string;
  };
}

@Injectable()
export class FullTextSearchService {
  private readonly logger = new Logger(FullTextSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Perform full-text search using PostgreSQL's built-in text search
   */
  async search(options: FullTextSearchOptions): Promise<FullTextSearchResponse> {
    const startTime = Date.now();
    const {
      query,
      language,
      contentType,
      repository,
      limit = 50,
      offset = 0,
    } = options;

    try {
      this.logger.log(`Performing full-text search for: "${query}"`);

      // Use the custom search function we created in the migration
      const results = await this.prisma.$queryRaw<FullTextSearchResult[]>`
        SELECT * FROM search_content(
          ${query},
          ${language ?? null},
          ${contentType ?? null},
          ${repository ?? null},
          ${limit},
          ${offset}
        )
      `;

      // Get total count for pagination
      const totalCount = await this.getSearchCount(options);

      const took = Date.now() - startTime;

      this.logger.log(
        `Full-text search completed in ${took}ms, found ${results.length} results`,
      );

      return {
        results,
        total: totalCount,
        took,
        query,
        filters: {
          language,
          contentType,
          repository,
        },
      };
    } catch (error) {
      this.logger.error('Full-text search failed:', error);
      throw new Error(`Full-text search failed: ${error.message}`);
    }
  }

  /**
   * Get count of search results for pagination
   */
  private async getSearchCount(options: FullTextSearchOptions): Promise<number> {
    const { query, language, contentType, repository } = options;

    try {
      const result = await this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count
        FROM "contents" c
        LEFT JOIN "repositories" r ON c."repositoryId" = r.id
        WHERE 
          c.search_vector @@ plainto_tsquery('english', ${query})
          AND (${language}::text IS NULL OR c.language = ${language})
          AND (${contentType}::text IS NULL OR c."contentType"::text = ${contentType})
          AND (${repository}::text IS NULL OR r."fullName" = ${repository})
      `;

      return Number(result[0].count);
    } catch (error) {
      this.logger.warn('Failed to get search count:', error);
      return 0;
    }
  }

  /**
   * Search content chunks using full-text search
   */
  async searchChunks(options: FullTextSearchOptions): Promise<{
    results: Array<{
      id: string;
      chunkText: string;
      sequence: number;
      contentId: string;
      rank: number;
    }>;
    total: number;
    took: number;
  }> {
    const startTime = Date.now();
    const { query, limit = 50, offset = 0 } = options;

    try {
      this.logger.log(`Performing chunk search for: "${query}"`);

      const results = await this.prisma.$queryRaw<Array<{
        id: string;
        chunkText: string;
        sequence: number;
        contentId: string;
        rank: number;
      }>>`
        SELECT 
          cc.id,
          cc."chunkText",
          cc.sequence,
          cc."contentId",
          ts_rank(cc.search_vector, plainto_tsquery('english', ${query})) as rank
        FROM "content_chunks" cc
        WHERE cc.search_vector @@ plainto_tsquery('english', ${query})
        ORDER BY rank DESC, cc.sequence ASC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      const totalResult = await this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count
        FROM "content_chunks" cc
        WHERE cc.search_vector @@ plainto_tsquery('english', ${query})
      `;

      const took = Date.now() - startTime;

      return {
        results,
        total: Number(totalResult[0].count),
        took,
      };
    } catch (error) {
      this.logger.error('Chunk search failed:', error);
      throw new Error(`Chunk search failed: ${error.message}`);
    }
  }

  /**
   * Get search suggestions based on existing content
   */
  async getSuggestions(partialQuery: string, limit = 10): Promise<string[]> {
    try {
      const results = await this.prisma.$queryRaw<Array<{ title: string }>>`
        SELECT DISTINCT c.title
        FROM "contents" c
        WHERE c.title_vector @@ to_tsquery('english', ${partialQuery + ':*'})
        ORDER BY ts_rank(c.title_vector, to_tsquery('english', ${partialQuery + ':*'})) DESC
        LIMIT ${limit}
      `;

      return results.map(r => r.title).filter(Boolean);
    } catch (error) {
      this.logger.warn('Failed to get search suggestions:', error);
      return [];
    }
  }

  /**
   * Get available filter values for search
   */
  async getFilterOptions(): Promise<{
    languages: string[];
    contentTypes: string[];
    repositories: string[];
  }> {
    try {
      const [languages, contentTypes, repositories] = await Promise.all([
        this.prisma.$queryRaw<Array<{ language: string }>>`
          SELECT DISTINCT language
          FROM "contents"
          WHERE language IS NOT NULL
          ORDER BY language
        `,
        this.prisma.$queryRaw<Array<{ contentType: string }>>`
          SELECT DISTINCT "contentType"
          FROM "contents"
          ORDER BY "contentType"
        `,
        this.prisma.$queryRaw<Array<{ fullName: string }>>`
          SELECT DISTINCT r."fullName"
          FROM "repositories" r
          INNER JOIN "contents" c ON c."repositoryId" = r.id
          ORDER BY r."fullName"
        `,
      ]);

      return {
        languages: languages.map(l => l.language).filter(Boolean),
        contentTypes: contentTypes.map(c => c.contentType),
        repositories: repositories.map(r => r.fullName),
      };
    } catch (error) {
      this.logger.error('Failed to get filter options:', error);
      return {
        languages: [],
        contentTypes: [],
        repositories: [],
      };
    }
  }

  /**
   * Health check for full-text search functionality
   */
  async healthCheck(): Promise<{
    available: boolean;
    indexesExist: boolean;
    sampleQuery: boolean;
    error?: string;
  }> {
    try {
      // Check if search indexes exist
      const indexResult = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1 
          FROM pg_indexes 
          WHERE indexname = 'idx_contents_search_vector'
        ) as exists
      `;

      const indexesExist = indexResult[0]?.exists ?? false;

      // Test a simple search query
      let sampleQuery = false;
      try {
        await this.prisma.$queryRaw`
          SELECT 1
          FROM "contents"
          WHERE search_vector @@ plainto_tsquery('english', 'test')
          LIMIT 1
        `;
        sampleQuery = true;
      } catch (error) {
        this.logger.warn('Sample query failed:', error);
      }

      return {
        available: indexesExist && sampleQuery,
        indexesExist,
        sampleQuery,
      };
    } catch (error) {
      this.logger.error('Full-text search health check failed:', error);
      return {
        available: false,
        indexesExist: false,
        sampleQuery: false,
        error: error.message,
      };
    }
  }
}