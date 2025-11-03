import { Test, TestingModule } from '@nestjs/testing';
import { FullTextSearchService } from '../services/fulltext-search.service';
import { PrismaService } from '../../services/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('FullTextSearchService - Basic Functionality', () => {
  let service: FullTextSearchService;
  let prismaService: any;

  beforeEach(async () => {
    const mockPrismaService = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: '1',
          title: 'TypeScript Interface Guide',
          content: 'TypeScript interface definition',
          ts_rank: 0.8,
          language: 'typescript',
          content_type: 'documentation',
          repository_name: 'ts-guide',
        },
      ]),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue('test-value'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FullTextSearchService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<FullTextSearchService>(FullTextSearchService);
    prismaService = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should perform full-text search', async () => {
    // Mock the count query too
    prismaService.$queryRaw
      .mockResolvedValueOnce([
        {
          id: '1',
          title: 'TypeScript Interface Guide',
          content: 'TypeScript interface definition',
          ts_rank: 0.8,
          language: 'typescript',
          content_type: 'documentation',
          repository_name: 'ts-guide',
        },
      ])
      .mockResolvedValueOnce([{ count: '1' }]); // Mock count query

    const options = { 
      query: 'TypeScript interfaces',
      limit: 10 
    };

    const result = await service.search(options);

    expect(result).toBeDefined();
    expect(result.results).toBeDefined();
    expect(result.total).toBe(1);
    expect(result.took).toBeGreaterThanOrEqual(0); // Allow 0ms for mocked tests
    expect(result.query).toBe(options.query);
  });

  it('should handle empty queries', async () => {
    // Mock empty results for empty query
    prismaService.$queryRaw
      .mockResolvedValueOnce([]) // Empty results
      .mockResolvedValueOnce([{ count: '0' }]); // Count query

    const result = await service.search({ query: '', limit: 10 });

    expect(result.results).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('should respect search options', async () => {
    // Mock both search and count queries
    prismaService.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: '0' }]);

    const options = { 
      query: 'TypeScript interfaces',
      language: 'typescript',
      limit: 5 
    };

    const result = await service.search(options);

    expect(result.query).toBe('TypeScript interfaces');
    expect(prismaService.$queryRaw).toHaveBeenCalledTimes(2); // Search + count queries
  });

  it('should provide health status', async () => {
    // Mock health check queries
    prismaService.$queryRaw
      .mockResolvedValueOnce([{ exists: true }]) // Index check
      .mockResolvedValueOnce([{ result: 'test' }]); // Sample query

    const health = await service.healthCheck();

    expect(health).toBeDefined();
    expect(health.available).toBe(true);
  });

  it('should get search suggestions', async () => {
    prismaService.$queryRaw.mockResolvedValue([
      { suggestion: 'typescript interface' },
      { suggestion: 'typescript class' },
    ]);

    const suggestions = await service.getSuggestions('typescript');

    expect(suggestions).toBeDefined();
    expect(Array.isArray(suggestions)).toBe(true);
  });
});