import { Test, TestingModule } from '@nestjs/testing';
import { SearchRerankerService } from '../services/search-reranker.service';
import { GeminiService } from '../../services/gemini.service';

describe('SearchRerankerService - Basic Functionality', () => {
  let service: SearchRerankerService;
  let geminiService: jest.Mocked<GeminiService>;

  const mockResults = [
    {
      id: '1',
      title: 'TypeScript Interface Guide',
      content: 'TypeScript interface definition',
      score: 0.9,
      combinedRank: 0.85,
      searchMethod: 'vector' as const,
      metadata: { source: 'repository' as const, language: 'typescript' },
    },
    {
      id: '2',
      title: 'JavaScript Object Patterns',
      content: 'JavaScript object patterns',
      score: 0.8,
      combinedRank: 0.75,
      searchMethod: 'text' as const,
      metadata: { source: 'question' as const, language: 'javascript' },
    },
  ];

  beforeEach(async () => {
    const mockGeminiService = {
      isAvailable: jest.fn().mockReturnValue(true),
      generateText: jest.fn().mockResolvedValue('Based on relevance: 1, 2'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchRerankerService,
        { provide: GeminiService, useValue: mockGeminiService },
      ],
    }).compile();

    service = module.get<SearchRerankerService>(SearchRerankerService);
    geminiService = module.get(GeminiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should rerank results successfully', async () => {
    const query = 'TypeScript interfaces';

    // Ensure Gemini generates text to trigger reranking
    geminiService.generateText.mockResolvedValue('Based on relevance: 1, 2');

    const result = await service.rerank(query, mockResults);

    expect(result).toBeDefined();
    expect(result.results).toBeDefined();
    expect(result.rerankerTime).toBeGreaterThanOrEqual(0); // Allow 0ms for mocked tests
    expect(result.originalResultsCount).toBe(2);
    expect(result.rerankerUsed).toBe(true);
  });

  it('should handle empty results', async () => {
    const query = 'TypeScript interfaces';
    const result = await service.rerank(query, []);

    expect(result.results).toEqual([]);
    expect(result.originalResultsCount).toBe(0);
    expect(result.rerankedResultsCount).toBe(0);
  });

  it('should fallback when Gemini unavailable', async () => {
    geminiService.isAvailable.mockReturnValue(false);

    const query = 'TypeScript interfaces';
    const result = await service.rerank(query, mockResults);

    expect(result.rerankerUsed).toBe(false);
    expect(result.results).toBeDefined();
  });

  it('should provide health status', async () => {
    const health = await service.healthCheck();

    expect(health).toBeDefined();
    expect(health.available).toBe(true);
    expect(health.geminiAvailable).toBe(true);
  });
});
