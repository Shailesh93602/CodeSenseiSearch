import { Test, TestingModule } from '@nestjs/testing';
import { SearchFilterService } from '../services/search-filter.service';
import { PrismaService } from '../../services/prisma.service';
import { SearchFilters } from '../interfaces/search-filters.interface';

describe('SearchFilterService - Basic Functionality', () => {
  let service: SearchFilterService;

  const mockSearchResults = [
    {
      id: '1',
      title: 'TypeScript Interface Guide',
      content: 'TypeScript interface definition',
      score: 0.9,
      combinedRank: 0.85,
      searchMethod: 'vector' as const,
      metadata: {
        source: 'repository' as const,
        language: 'typescript',
        repositoryName: 'ts-guide',
      },
    },
    {
      id: '2',
      title: 'JavaScript Object Patterns',
      content: 'JavaScript object patterns',
      score: 0.7,
      combinedRank: 0.65,
      searchMethod: 'text' as const,
      metadata: {
        source: 'question' as const,
        language: 'javascript',
      },
    },
  ];

  beforeEach(async () => {
    const mockPrismaService = {
      $queryRaw: jest.fn(),
      content: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      repository: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchFilterService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SearchFilterService>(SearchFilterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should validate filters successfully', async () => {
    const filters: SearchFilters = {
      languages: ['typescript'],
      repositories: ['test-repo'],
    };

    const result = await service.validateFilters(filters);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should apply language filters correctly', () => {
    const filters: SearchFilters = {
      languages: ['typescript'],
    };

    const result = service.applyFiltersToResults(mockSearchResults, filters);

    expect(result.totalResultsAfterFiltering).toBe(1);
    expect(result.appliedFilterCount).toBe(1);
    expect(result.removedResultsCount).toBe(1);
  });

  it('should apply score filters correctly', () => {
    const filters: SearchFilters = {
      minScore: 0.8,
    };

    const result = service.applyFiltersToResults(mockSearchResults, filters);

    expect(result.totalResultsAfterFiltering).toBe(1); // Only the 0.9 score result
    expect(result.appliedFilterCount).toBe(1);
  });

  it('should handle empty filters gracefully', () => {
    const result = service.applyFiltersToResults(mockSearchResults, {});

    expect(result.totalResultsAfterFiltering).toBe(2); // All results pass
    expect(result.appliedFilterCount).toBe(0);
    expect(result.removedResultsCount).toBe(0);
  });

  it('should provide health status', async () => {
    const health = await service.healthCheck();

    expect(health).toBeDefined();
    expect(health.available).toBe(true);
  });

  it('should build filter queries', () => {
    const filters: SearchFilters = {
      languages: ['typescript'],
      repositories: ['test-repo'],
    };

    const query = service.buildFilterQuery(filters);

    expect(query).toBeDefined();
    expect(query.whereClause).toBeDefined();
    expect(query.parameters).toBeDefined();
  });
});
