import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../services/prisma.service';
import {
  SearchFilters,
  FilterOptions,
  AppliedFilters,
  FilterValidationResult,
  SearchFilterQuery,
  ContentType,
  ContentSource,
  RepositoryInfo,
} from '../interfaces/search-filters.interface';

@Injectable()
export class SearchFilterService {
  private readonly logger = new Logger(SearchFilterService.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.log('Search filter service initialized');
  }

  /**
   * Validate and sanitize search filters
   */
  validateFilters(filters: SearchFilters): Promise<FilterValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sanitizedFilters: SearchFilters = { ...filters };

    try {
      // Validate date ranges
      if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
        errors.push('dateFrom cannot be after dateTo');
      }

      if (filters.lastModifiedFrom && filters.lastModifiedTo && 
          filters.lastModifiedFrom > filters.lastModifiedTo) {
        errors.push('lastModifiedFrom cannot be after lastModifiedTo');
      }

      // Validate size ranges
      if (filters.minSize !== undefined && filters.maxSize !== undefined && 
          filters.minSize > filters.maxSize) {
        errors.push('minSize cannot be greater than maxSize');
      }

      // Validate score ranges
      if (filters.minScore !== undefined && filters.maxScore !== undefined && 
          filters.minScore > filters.maxScore) {
        errors.push('minScore cannot be greater than maxScore');
      }

      // Sanitize arrays
      if (filters.languages) {
        sanitizedFilters.languages = filters.languages
          .filter(lang => lang && lang.trim().length > 0)
          .map(lang => lang.toLowerCase().trim());
      }

      if (filters.fileTypes) {
        sanitizedFilters.fileTypes = filters.fileTypes
          .filter(type => type && type.trim().length > 0)
          .map(type => type.toLowerCase().trim());
      }

      if (filters.extensions) {
        sanitizedFilters.extensions = filters.extensions
          .filter(ext => ext && ext.trim().length > 0)
          .map(ext => ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`);
      }

      // Validate enum values
      if (filters.contentTypes) {
        const validContentTypes = Object.values(ContentType);
        sanitizedFilters.contentTypes = filters.contentTypes.filter(type => 
          validContentTypes.includes(type)
        );
        
        const invalidTypes = filters.contentTypes.filter(type => 
          !validContentTypes.includes(type)
        );
        if (invalidTypes.length > 0) {
          warnings.push(`Invalid content types removed: ${invalidTypes.join(', ')}`);
        }
      }

      if (filters.sources) {
        const validSources = Object.values(ContentSource);
        sanitizedFilters.sources = filters.sources.filter(source => 
          validSources.includes(source)
        );
        
        const invalidSources = filters.sources.filter(source => 
          !validSources.includes(source)
        );
        if (invalidSources.length > 0) {
          warnings.push(`Invalid sources removed: ${invalidSources.join(', ')}`);
        }
      }

      return Promise.resolve({
        isValid: errors.length === 0,
        errors,
        warnings,
        sanitizedFilters,
      });
    } catch (error) {
      this.logger.error(`Filter validation failed: ${error.message}`);
      return Promise.resolve({
        isValid: false,
        errors: [`Validation failed: ${error.message}`],
        warnings,
        sanitizedFilters: {},
      });
    }
  }

  /**
   * Build database query from search filters
   */
  buildFilterQuery(filters: SearchFilters): SearchFilterQuery {
    const whereConditions: string[] = [];
    const parameters: any[] = [];
    const joins: string[] = [];
    let paramIndex = 1;

    try {
      // Language filters
      if (filters.languages && filters.languages.length > 0) {
        whereConditions.push(`c.language = ANY($${paramIndex})`);
        parameters.push(filters.languages);
        paramIndex++;
      }

      // Repository filters
      if (filters.repositories && filters.repositories.length > 0) {
        whereConditions.push(`c.repository = ANY($${paramIndex})`);
        parameters.push(filters.repositories);
        paramIndex++;
      }

      if (filters.repositoryOwners && filters.repositoryOwners.length > 0) {
        whereConditions.push(`c.repository_owner = ANY($${paramIndex})`);
        parameters.push(filters.repositoryOwners);
        paramIndex++;
      }

      // Date filters
      if (filters.dateFrom) {
        whereConditions.push(`c.created_at >= $${paramIndex}`);
        parameters.push(filters.dateFrom);
        paramIndex++;
      }

      if (filters.dateTo) {
        whereConditions.push(`c.created_at <= $${paramIndex}`);
        parameters.push(filters.dateTo);
        paramIndex++;
      }

      if (filters.lastModifiedFrom) {
        whereConditions.push(`c.updated_at >= $${paramIndex}`);
        parameters.push(filters.lastModifiedFrom);
        paramIndex++;
      }

      if (filters.lastModifiedTo) {
        whereConditions.push(`c.updated_at <= $${paramIndex}`);
        parameters.push(filters.lastModifiedTo);
        paramIndex++;
      }

      // File type and extension filters
      if (filters.fileTypes && filters.fileTypes.length > 0) {
        whereConditions.push(`c.file_type = ANY($${paramIndex})`);
        parameters.push(filters.fileTypes);
        paramIndex++;
      }

      if (filters.extensions && filters.extensions.length > 0) {
        whereConditions.push(`c.file_extension = ANY($${paramIndex})`);
        parameters.push(filters.extensions);
        paramIndex++;
      }

      // Content type filters
      if (filters.contentTypes && filters.contentTypes.length > 0) {
        whereConditions.push(`c.content_type = ANY($${paramIndex})`);
        parameters.push(filters.contentTypes);
        paramIndex++;
      }

      // Source filters
      if (filters.sources && filters.sources.length > 0) {
        whereConditions.push(`c.source = ANY($${paramIndex})`);
        parameters.push(filters.sources);
        paramIndex++;
      }

      // Size filters
      if (filters.minSize !== undefined) {
        whereConditions.push(`LENGTH(c.content) >= $${paramIndex}`);
        parameters.push(filters.minSize);
        paramIndex++;
      }

      if (filters.maxSize !== undefined) {
        whereConditions.push(`LENGTH(c.content) <= $${paramIndex}`);
        parameters.push(filters.maxSize);
        paramIndex++;
      }

      // Path filters
      if (filters.pathIncludes && filters.pathIncludes.length > 0) {
        const pathConditions = filters.pathIncludes.map(() => {
          const condition = `c.file_path ILIKE $${paramIndex}`;
          paramIndex++;
          return condition;
        });
        whereConditions.push(`(${pathConditions.join(' OR ')})`);
        parameters.push(...filters.pathIncludes.map(path => `%${path}%`));
      }

      if (filters.pathExcludes && filters.pathExcludes.length > 0) {
        const pathConditions = filters.pathExcludes.map(() => {
          const condition = `c.file_path NOT ILIKE $${paramIndex}`;
          paramIndex++;
          return condition;
        });
        whereConditions.push(`(${pathConditions.join(' AND ')})`);
        parameters.push(...filters.pathExcludes.map(path => `%${path}%`));
      }

      // Boolean filters
      if (filters.hasCode !== undefined) {
        whereConditions.push(`c.has_code = $${paramIndex}`);
        parameters.push(filters.hasCode);
        paramIndex++;
      }

      if (filters.hasDocumentation !== undefined) {
        whereConditions.push(`c.has_documentation = $${paramIndex}`);
        parameters.push(filters.hasDocumentation);
        paramIndex++;
      }

      if (filters.hasTests !== undefined) {
        whereConditions.push(`c.has_tests = $${paramIndex}`);
        parameters.push(filters.hasTests);
        paramIndex++;
      }

      if (filters.isPublic !== undefined) {
        whereConditions.push(`c.is_public = $${paramIndex}`);
        parameters.push(filters.isPublic);
        paramIndex++;
      }

      // Tag filters (assuming tags are stored in a separate table)
      if (filters.tags && filters.tags.length > 0) {
        joins.push('LEFT JOIN content_tags ct ON c.id = ct.content_id');
        joins.push('LEFT JOIN tags t ON ct.tag_id = t.id');
        whereConditions.push(`t.name = ANY($${paramIndex})`);
        parameters.push(filters.tags);
        paramIndex++;
      }

      if (filters.excludeTags && filters.excludeTags.length > 0) {
        whereConditions.push(`c.id NOT IN (
          SELECT ct2.content_id FROM content_tags ct2 
          JOIN tags t2 ON ct2.tag_id = t2.id 
          WHERE t2.name = ANY($${paramIndex})
        )`);
        parameters.push(filters.excludeTags);
        paramIndex++;
      }

      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

      // Build full-text search filters
      let textSearchFilters = '';
      if (filters.languages && filters.languages.length > 0) {
        textSearchFilters += ` & language:(${filters.languages.join('|')})`;
      }

      return {
        whereClause,
        parameters,
        joins: [...new Set(joins)], // Remove duplicates
        textSearchFilters: textSearchFilters.trim(),
      };
    } catch (error) {
      this.logger.error(`Failed to build filter query: ${error.message}`);
      return {
        whereClause: '',
        parameters: [],
        joins: [],
      };
    }
  }

  /**
   * Get available filter options from the database
   */
  async getFilterOptions(): Promise<FilterOptions> {
    try {
      const [
        languages,
        repositories,
        fileTypes,
        extensions,
        sources,
        dateRange,
        sizeRange,
      ] = await Promise.all([
        this.getAvailableLanguages(),
        this.getAvailableRepositories(),
        this.getAvailableFileTypes(),
        this.getAvailableExtensions(),
        this.getAvailableSources(),
        this.getDateRange(),
        this.getSizeRange(),
      ]);

      return {
        availableLanguages: languages.map(l => l.language),
        availableRepositories: repositories,
        availableFileTypes: fileTypes.map(f => f.fileType),
        availableExtensions: extensions.map(e => e.extension),
        availableContentTypes: Object.values(ContentType),
        availableSources: Object.values(ContentSource),
        availableTags: [], // TODO: Implement when tags table exists
        
        languageCounts: languages.reduce((acc, l) => ({ ...acc, [l.language]: l.count }), {}),
        repositoryCounts: repositories.reduce((acc, r) => ({ ...acc, [r.fullName]: 0 }), {}), // TODO: Add counts
        fileTypeCounts: fileTypes.reduce((acc, f) => ({ ...acc, [f.fileType]: f.count }), {}),
        sourceCounts: sources.reduce((acc, s) => ({ ...acc, [s.source]: s.count }), {}),
        
        dateRange,
        sizeRange,
      };
    } catch (error) {
      this.logger.error(`Failed to get filter options: ${error.message}`);
      return {
        availableLanguages: [],
        availableRepositories: [],
        availableFileTypes: [],
        availableExtensions: [],
        availableContentTypes: Object.values(ContentType),
        availableSources: Object.values(ContentSource),
        availableTags: [],
        languageCounts: {},
        repositoryCounts: {},
        fileTypeCounts: {},
        sourceCounts: {},
        dateRange: {
          earliest: new Date(),
          latest: new Date(),
        },
        sizeRange: {
          min: 0,
          max: 0,
        },
      };
    }
  }

  /**
   * Apply filters to search results in memory (for small result sets)
   */
  applyFiltersToResults<T extends { metadata?: any }>(
    results: T[],
    filters: SearchFilters,
  ): AppliedFilters {
    const startTime = Date.now();
    const totalResultsBeforeFiltering = results.length;

    try {
      let filteredResults = results;

      // Apply score filters
      if (filters.minScore !== undefined) {
        filteredResults = filteredResults.filter(result => 
          (result as any).score >= filters.minScore!
        );
      }

      if (filters.maxScore !== undefined) {
        filteredResults = filteredResults.filter(result => 
          (result as any).score <= filters.maxScore!
        );
      }

      // Apply metadata-based filters
      if (filters.languages && filters.languages.length > 0) {
        filteredResults = filteredResults.filter(result => 
          result.metadata?.language && 
          filters.languages!.includes(result.metadata.language.toLowerCase())
        );
      }

      if (filters.sources && filters.sources.length > 0) {
        filteredResults = filteredResults.filter(result => 
          result.metadata?.source && 
          filters.sources!.includes(result.metadata.source)
        );
      }

      const filteringTime = Date.now() - startTime;
      const appliedFilterCount = this.countAppliedFilters(filters);

      return {
        filters,
        totalResultsBeforeFiltering,
        totalResultsAfterFiltering: filteredResults.length,
        filteringTime,
        appliedFilterCount,
        removedResultsCount: totalResultsBeforeFiltering - filteredResults.length,
      };
    } catch (error) {
      this.logger.error(`Failed to apply filters: ${error.message}`);
      return {
        filters,
        totalResultsBeforeFiltering,
        totalResultsAfterFiltering: totalResultsBeforeFiltering,
        filteringTime: Date.now() - startTime,
        appliedFilterCount: 0,
        removedResultsCount: 0,
      };
    }
  }

  /**
   * Count the number of applied filters
   */
  private countAppliedFilters(filters: SearchFilters): number {
    let count = 0;
    
    Object.entries(filters).forEach(([, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value) && value.length > 0) {
          count++;
        } else if (!Array.isArray(value)) {
          count++;
        }
      }
    });
    
    return count;
  }

  /**
   * Helper methods for getting filter options from database
   */
  private async getAvailableLanguages(): Promise<Array<{ language: string; count: number }>> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ language: string; count: bigint }>>`
        SELECT language, COUNT(*) as count
        FROM content
        WHERE language IS NOT NULL AND language != ''
        GROUP BY language
        ORDER BY count DESC
        LIMIT 50
      `;

      return result.map(r => ({
        language: r.language,
        count: Number(r.count),
      }));
    } catch (error) {
      this.logger.warn(`Failed to get available languages: ${error.message}`);
      return [];
    }
  }

  private async getAvailableRepositories(): Promise<RepositoryInfo[]> {
    try {
      const result = await this.prisma.$queryRaw<Array<{
        repository: string;
        repository_owner: string;
        is_public: boolean;
      }>>`
        SELECT DISTINCT repository, repository_owner, is_public
        FROM content
        WHERE repository IS NOT NULL AND repository != ''
        ORDER BY repository
        LIMIT 100
      `;

      return result.map(r => ({
        id: `${r.repository_owner}/${r.repository}`,
        name: r.repository,
        owner: r.repository_owner,
        fullName: `${r.repository_owner}/${r.repository}`,
        isPublic: r.is_public,
      }));
    } catch (error) {
      this.logger.warn(`Failed to get available repositories: ${error.message}`);
      return [];
    }
  }

  private async getAvailableFileTypes(): Promise<Array<{ fileType: string; count: number }>> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ file_type: string; count: bigint }>>`
        SELECT file_type, COUNT(*) as count
        FROM content
        WHERE file_type IS NOT NULL AND file_type != ''
        GROUP BY file_type
        ORDER BY count DESC
        LIMIT 30
      `;

      return result.map(r => ({
        fileType: r.file_type,
        count: Number(r.count),
      }));
    } catch (error) {
      this.logger.warn(`Failed to get available file types: ${error.message}`);
      return [];
    }
  }

  private async getAvailableExtensions(): Promise<Array<{ extension: string; count: number }>> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ file_extension: string; count: bigint }>>`
        SELECT file_extension, COUNT(*) as count
        FROM content
        WHERE file_extension IS NOT NULL AND file_extension != ''
        GROUP BY file_extension
        ORDER BY count DESC
        LIMIT 30
      `;

      return result.map(r => ({
        extension: r.file_extension,
        count: Number(r.count),
      }));
    } catch (error) {
      this.logger.warn(`Failed to get available extensions: ${error.message}`);
      return [];
    }
  }

  private async getAvailableSources(): Promise<Array<{ source: string; count: number }>> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ source: string; count: bigint }>>`
        SELECT source, COUNT(*) as count
        FROM content
        WHERE source IS NOT NULL AND source != ''
        GROUP BY source
        ORDER BY count DESC
      `;

      return result.map(r => ({
        source: r.source,
        count: Number(r.count),
      }));
    } catch (error) {
      this.logger.warn(`Failed to get available sources: ${error.message}`);
      return [];
    }
  }

  private async getDateRange(): Promise<{ earliest: Date; latest: Date }> {
    try {
      const result = await this.prisma.$queryRaw<Array<{
        earliest: Date;
        latest: Date;
      }>>`
        SELECT 
          MIN(created_at) as earliest,
          MAX(created_at) as latest
        FROM content
        WHERE created_at IS NOT NULL
      `;

      return result[0] || {
        earliest: new Date(),
        latest: new Date(),
      };
    } catch (error) {
      this.logger.warn(`Failed to get date range: ${error.message}`);
      return {
        earliest: new Date(),
        latest: new Date(),
      };
    }
  }

  private async getSizeRange(): Promise<{ min: number; max: number }> {
    try {
      const result = await this.prisma.$queryRaw<Array<{
        min_size: number;
        max_size: number;
      }>>`
        SELECT 
          MIN(LENGTH(content)) as min_size,
          MAX(LENGTH(content)) as max_size
        FROM content
        WHERE content IS NOT NULL
      `;

      return {
        min: result[0]?.min_size || 0,
        max: result[0]?.max_size || 0,
      };
    } catch (error) {
      this.logger.warn(`Failed to get size range: ${error.message}`);
      return {
        min: 0,
        max: 0,
      };
    }
  }

  /**
   * Health check for filter service
   */
  async healthCheck(): Promise<{
    available: boolean;
    databaseConnected: boolean;
    filterOptionsCount: number;
  }> {
    try {
      const filterOptions = await this.getFilterOptions();
      
      return {
        available: true,
        databaseConnected: true,
        filterOptionsCount: filterOptions.availableLanguages.length +
                          filterOptions.availableRepositories.length +
                          filterOptions.availableFileTypes.length +
                          filterOptions.availableExtensions.length,
      };
    } catch {
      return {
        available: false,
        databaseConnected: false,
        filterOptionsCount: 0,
      };
    }
  }
}