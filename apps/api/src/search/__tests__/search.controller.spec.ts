import { Test } from '@nestjs/testing';
import { SearchController } from '../search.controller';
import { SearchService } from '../../services/search.service';

const buildModule = (svc: Partial<SearchService>) =>
  Test.createTestingModule({
    controllers: [SearchController],
    providers: [{ provide: SearchService, useValue: svc }],
  }).compile();

describe('SearchController', () => {
  describe('POST /search/semantic', () => {
    it('returns 400-shape when query is empty', async () => {
      const app = await buildModule({});
      const controller = app.get(SearchController);

      const res = await controller.semanticSearch({ query: '' });

      expect(res).toEqual({ error: 'Query is required', status: 400 });
    });

    it('returns 400-shape when query is whitespace only', async () => {
      const app = await buildModule({});
      const controller = app.get(SearchController);

      const res = await controller.semanticSearch({ query: '   ' });

      expect(res).toMatchObject({ status: 400 });
    });

    it('passes query + options through to SearchService.semanticSearch', async () => {
      const semanticSearch = jest.fn().mockResolvedValue({
        results: [{ id: 'c1', similarity: 0.92 }],
        totalResults: 1,
      });
      const app = await buildModule({ semanticSearch } as any);
      const controller = app.get(SearchController);

      const res = await controller.semanticSearch({
        query: 'where is auth refreshed',
        options: { limit: 5 },
      });

      expect(semanticSearch).toHaveBeenCalledWith('where is auth refreshed', {
        limit: 5,
      });
      expect(res).toMatchObject({
        success: true,
        data: { results: expect.any(Array) },
      });
    });

    it('catches service errors and returns 500-shape', async () => {
      const app = await buildModule({
        semanticSearch: jest
          .fn()
          .mockRejectedValue(new Error('pgvector is offline')),
      } as any);
      const controller = app.get(SearchController);

      const res = await controller.semanticSearch({ query: 'foo' });

      expect(res).toMatchObject({
        status: 500,
        error: 'Search failed',
        message: expect.stringContaining('pgvector'),
      });
    });
  });

  describe('POST /search/hybrid', () => {
    it('delegates to SearchService.hybridSearch', async () => {
      const hybridSearch = jest.fn().mockResolvedValue({
        results: [{ id: 'c1', vectorScore: 0.9, textScore: 0.8 }],
      });
      const app = await buildModule({ hybridSearch } as any);
      const controller = app.get(SearchController);

      const res = await controller.hybridSearch({
        query: 'redlock acquire',
        options: { limit: 10 },
      });

      expect(hybridSearch).toHaveBeenCalledWith('redlock acquire', {
        limit: 10,
      });
      expect(res).toMatchObject({ success: true });
    });

    it('rejects empty query without calling the service', async () => {
      const hybridSearch = jest.fn();
      const app = await buildModule({ hybridSearch } as any);
      const controller = app.get(SearchController);

      const res = await controller.hybridSearch({ query: '' });

      expect(hybridSearch).not.toHaveBeenCalled();
      expect(res).toMatchObject({ status: 400 });
    });
  });

  describe('POST /search/text', () => {
    it('wraps results with totalResults + searchMethod metadata', async () => {
      const textSearch = jest
        .fn()
        .mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
      const app = await buildModule({ textSearch } as any);
      const controller = app.get(SearchController);

      const res = await controller.textSearch({ query: 'redlock' });

      expect(res).toMatchObject({
        success: true,
        data: {
          query: 'redlock',
          totalResults: 3,
          searchMethod: 'text',
        },
      });
    });
  });

  describe('GET /search/quick', () => {
    it('parses ?limit and ?source query params', async () => {
      const semanticSearch = jest
        .fn()
        .mockResolvedValue({ results: [], totalResults: 0 });
      const app = await buildModule({ semanticSearch } as any);
      const controller = app.get(SearchController);

      await controller.quickSearch('hello', '25', 'repository', 'typescript');

      expect(semanticSearch).toHaveBeenCalledWith('hello', {
        limit: 25,
        source: 'repository',
        language: 'typescript',
      });
    });

    it('defaults limit to 10 and source to all when omitted', async () => {
      const semanticSearch = jest.fn().mockResolvedValue({ results: [] });
      const app = await buildModule({ semanticSearch } as any);
      const controller = app.get(SearchController);

      await controller.quickSearch('hello');

      expect(semanticSearch).toHaveBeenCalledWith('hello', {
        limit: 10,
        source: 'all',
        language: undefined,
      });
    });

    it('rejects empty q with 400-shape', async () => {
      const semanticSearch = jest.fn();
      const app = await buildModule({ semanticSearch } as any);
      const controller = app.get(SearchController);

      const res = await controller.quickSearch('');

      expect(semanticSearch).not.toHaveBeenCalled();
      expect(res).toMatchObject({ status: 400 });
    });
  });

  describe('GET /search/suggestions', () => {
    it('returns empty suggestions for queries shorter than 2 chars', async () => {
      const getSearchSuggestions = jest.fn();
      const app = await buildModule({ getSearchSuggestions } as any);
      const controller = app.get(SearchController);

      const res = await controller.getSearchSuggestions('a');

      expect(getSearchSuggestions).not.toHaveBeenCalled();
      expect(res).toMatchObject({
        success: true,
        data: { suggestions: [] },
      });
    });

    it('delegates queries of 2+ chars to the service', async () => {
      const getSearchSuggestions = jest
        .fn()
        .mockResolvedValue(['redlock', 'redis adapter']);
      const app = await buildModule({ getSearchSuggestions } as any);
      const controller = app.get(SearchController);

      const res = await controller.getSearchSuggestions('red');

      expect(getSearchSuggestions).toHaveBeenCalledWith('red');
      expect(res).toMatchObject({
        data: {
          query: 'red',
          suggestions: ['redlock', 'redis adapter'],
        },
      });
    });
  });

  describe('GET /search/stats', () => {
    it('returns the stats payload from the service', async () => {
      const getSearchStats = jest.fn().mockResolvedValue({
        repositories: 5,
        questions: 100,
        chunks: 12_345,
      });
      const app = await buildModule({ getSearchStats } as any);
      const controller = app.get(SearchController);

      const res = await controller.getSearchStats();

      expect(res).toEqual({
        success: true,
        data: { repositories: 5, questions: 100, chunks: 12_345 },
      });
    });
  });
});
