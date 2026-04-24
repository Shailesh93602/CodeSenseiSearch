// Custom React hooks for search functionality
import { useState, useEffect, useCallback } from 'react';
import { apiClient, SearchResult, SearchFilters, SearchResponse } from '../api-client';

interface UseSearchOptions {
  initialQuery?: string;
  initialFilters?: SearchFilters;
  searchType?: 'hybrid' | 'semantic' | 'text' | 'questions';
  autoSearch?: boolean;
  debounceMs?: number;
}

interface UseSearchReturn {
  query: string;
  setQuery: (query: string) => void;
  filters: SearchFilters;
  setFilters: (filters: SearchFilters) => void;
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  totalResults: number;
  searchTime: number;
  search: () => Promise<void>;
  loadMore: () => Promise<void>;
  clearResults: () => void;
  retry: () => Promise<void>;
}

export function useSearch(options: UseSearchOptions = {}): UseSearchReturn {
  const {
    initialQuery = '',
    initialFilters = {},
    searchType = 'hybrid',
    autoSearch = false,
    debounceMs = 300,
  } = options;

  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [searchTime, setSearchTime] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);

  // Debounced query for auto-search
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  
  useEffect(() => {
    if (debounceMs > 0) {
      const timer = setTimeout(() => {
        setDebouncedQuery(query);
      }, debounceMs);

      return () => clearTimeout(timer);
    }
    // Synchronous fallback when debounceMs is 0 — the intent IS to
    // mirror `query` into `debouncedQuery` immediately. Defer to a
    // microtask so React doesn't see this as a cascading-render
    // (react-hooks/set-state-in-effect).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional pass-through; queueMicrotask defers off the render path
    queueMicrotask(() => setDebouncedQuery(query));
  }, [query, debounceMs]);

  const performSearch = useCallback(async (
    searchQuery: string,
    searchFilters: SearchFilters,
    page: number = 0,
    append: boolean = false
  ) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setHasMore(false);
      setTotalResults(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const searchOptions: SearchFilters = {
        ...searchFilters,
        offset: page * (searchFilters.limit || 20),
      };

      let response: SearchResponse;
      
      switch (searchType) {
        case 'semantic':
          response = await apiClient.searchSemantic(searchQuery, searchOptions);
          break;
        case 'text':
          response = await apiClient.searchText(searchQuery, searchOptions);
          break;
        case 'questions':
          response = await apiClient.searchQuestions(searchQuery, searchOptions);
          break;
        case 'hybrid':
        default:
          response = await apiClient.searchHybrid(searchQuery, searchOptions);
          break;
      }

      if (response.success) {
        // The API returns `totalResults` and `searchTime` (camelCase
        // matching NestJS controller shape), not the `total` / `took`
        // names the typed SearchResponse interface inherited from an
        // earlier mock. Read both to stay forward-compatible if the
        // shape ever flips back.
        const data = response.data as unknown as {
          results: unknown[];
          totalResults?: number;
          total?: number;
          searchTime?: number;
          took?: number;
          hasMore?: boolean;
        };
        const newResults = data.results;
        setResults(prev =>
          append
            ? [...prev, ...(newResults as typeof prev)]
            : (newResults as typeof prev),
        );
        setHasMore(data.hasMore ?? false);
        setTotalResults(data.totalResults ?? data.total ?? newResults.length);
        setSearchTime(data.searchTime ?? data.took ?? 0);
        setCurrentPage(page);
      } else {
        throw new Error(response.error || 'Search failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred while searching';
      setError(errorMessage);
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, [searchType]);

  const search = useCallback(() => {
    return performSearch(query, filters, 0, false);
  }, [query, filters, performSearch]);

  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      return performSearch(query, filters, currentPage + 1, true);
    }
    return Promise.resolve();
  }, [query, filters, currentPage, hasMore, loading, performSearch]);

  const clearResults = useCallback(() => {
    setResults([]);
    setHasMore(false);
    setTotalResults(0);
    setSearchTime(0);
    setCurrentPage(0);
    setError(null);
  }, []);

  const retry = useCallback(() => {
    return search();
  }, [search]);

  // Auto-search when debounced query changes. search() does setState
  // internally; we defer it off the current render with queueMicrotask
  // so React doesn't see it as a same-render cascade.
  useEffect(() => {
    if (autoSearch && debouncedQuery.trim()) {
      queueMicrotask(() => {
        void search();
      });
    }
  }, [debouncedQuery, filters, autoSearch, search]);

  return {
    query,
    setQuery,
    filters,
    setFilters,
    results,
    loading,
    error,
    hasMore,
    totalResults,
    searchTime,
    search,
    loadMore,
    clearResults,
    retry,
  };
}

// Hook for search suggestions
interface UseSuggestionsReturn {
  suggestions: string[];
  loading: boolean;
  error: string | null;
  getSuggestions: (query: string) => Promise<void>;
}

export function useSuggestions(): UseSuggestionsReturn {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getSuggestions = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.getSearchSuggestions(query);
      if (response.success) {
        setSuggestions(response.data.suggestions ?? []);
      } else {
        throw new Error('Failed to get suggestions');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get suggestions';
      setError(errorMessage);
      console.error('Suggestions error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    suggestions,
    loading,
    error,
    getSuggestions,
  };
}

// Hook for search stats
interface UseSearchStatsReturn {
  stats: {
    totalChunks: number;
    chunksWithEmbeddings: number;
    embeddingCoverage: number;
    repositoryChunks: number;
    questionChunks: number;
    availableLanguages: string[];
  } | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSearchStats(): UseSearchStatsReturn {
  const [stats, setStats] = useState<UseSearchStatsReturn['stats']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.getSearchStats();
      if (response.success) {
        setStats(response.data);
      } else {
        throw new Error('Failed to fetch search stats');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch search stats';
      setError(errorMessage);
      console.error('Search stats error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    return fetchStats();
  }, [fetchStats]);

  // Initial fetch on mount. Defer off the render path so the initial
  // setState fires after React finishes the current commit.
  useEffect(() => {
    queueMicrotask(() => {
      void fetchStats();
    });
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refresh,
  };
}

// Export all hooks
export type { UseSearchOptions, UseSearchReturn, UseSuggestionsReturn, UseSearchStatsReturn };