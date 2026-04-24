// API Client for CodeSenseiSearch Frontend
// Provides typed, configured API calls to the backend services

export interface SearchResult {
  id: string;
  title: string;
  description: string;
  source: "github" | "stackoverflow" | "docs";
  language?: string;
  url: string;
  author: string;
  avatar?: string;
  stars?: number;
  updatedAt: string;
  code?: string;
  tags: string[];
  difficulty?: "beginner" | "intermediate" | "advanced";
  votes?: number;
  views?: number;
  repository?: {
    owner: string;
    name: string;
    description: string;
  };
  chunk?: {
    content: string;
    path: string;
    lineStart?: number;
    lineEnd?: number;
  };
}

export interface SearchFilters {
  source?: "all" | "github" | "stackoverflow" | "docs";
  language?: string;
  sortBy?: "relevance" | "date" | "stars" | "votes";
  dateRange?: "all" | "week" | "month" | "year";
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  success: boolean;
  data: {
    results: SearchResult[];
    total: number;
    page: number;
    hasMore: boolean;
    took: number;
    suggestions?: string[];
  };
  error?: string;
}

export interface SearchStats {
  success: boolean;
  data: {
    totalChunks: number;
    chunksWithEmbeddings: number;
    embeddingCoverage: number;
    repositoryChunks: number;
    questionChunks: number;
    availableLanguages: string[];
  };
}

export interface SearchSuggestions {
  success: boolean;
  data: {
    suggestions: string[];
  };
}

export interface ApiError {
  success: false;
  error: string;
  details?: Record<string, unknown>;
}

class ApiClient {
  private baseUrl: string;
  private defaultHeaders: HeadersInit;

  constructor() {
    // Use environment variable for API URL, fallback to localhost for development
    this.baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retries: number = 2
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const config: RequestInit = {
      ...options,
      headers: {
        ...this.defaultHeaders,
        ...options.headers,
      },
    };

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, config);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
      } catch (error) {
        const isLastAttempt = attempt === retries;
        const isNetworkError = error instanceof TypeError && error.message.includes('fetch');
        
        if (isNetworkError && !isLastAttempt) {
          console.warn(`API request failed for ${endpoint} (attempt ${attempt + 1}/${retries + 1}), retrying...`);
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }
        
        console.error(`API request failed for ${endpoint}:`, error);
        throw error;
      }
    }
    
    // This should never be reached, but TypeScript requires it
    throw new Error('Unexpected error in request method');
  }

  // Health check
  async healthCheck() {
    return this.request<{ status: string; timestamp: string; service: string; version: string }>('/health');
  }

  // Search operations.
  //
  // The NestJS controller signature is:
  //   @Post('hybrid') (@Body() body: { query: string; options?: SearchOptions })
  // so we MUST nest the filter params under `options` — spreading at
  // the top level (the previous bug) made the controller see them as
  // unknown root keys and silently ignore every filter.
  //
  // We also map FE-flavored source names ("github" / "stackoverflow"
  // / "docs") to the API enum the search service understands
  // ("repository" / "question" / "documentation"). The two vocabularies
  // shouldn't be merged: the FE labels are user-facing while the API
  // enum mirrors a Prisma type.
  async searchSemantic(
    query: string,
    options: SearchFilters = {}
  ): Promise<SearchResponse> {
    return this.request<SearchResponse>('/search/semantic', {
      method: 'POST',
      body: JSON.stringify({ query, options: toApiOptions(options) }),
    });
  }

  async searchHybrid(
    query: string,
    options: SearchFilters = {}
  ): Promise<SearchResponse> {
    return this.request<SearchResponse>('/search/hybrid', {
      method: 'POST',
      body: JSON.stringify({ query, options: toApiOptions(options) }),
    });
  }

  async searchText(
    query: string,
    options: SearchFilters = {}
  ): Promise<SearchResponse> {
    return this.request<SearchResponse>('/search/text', {
      method: 'POST',
      body: JSON.stringify({ query, options: toApiOptions(options) }),
    });
  }

  async searchQuestions(
    query: string,
    options: SearchFilters = {}
  ): Promise<SearchResponse> {
    return this.request<SearchResponse>('/search/questions', {
      method: 'POST',
      body: JSON.stringify({ query, options: toApiOptions(options) }),
    });
  }

  async getSearchStats(): Promise<SearchStats> {
    return this.request<SearchStats>('/search/stats');
  }

  async getSearchSuggestions(query?: string): Promise<SearchSuggestions> {
    const params = query ? `?q=${encodeURIComponent(query)}` : '';
    return this.request<SearchSuggestions>(`/search/suggestions${params}`);
  }

  async getQuickSearch(query: string): Promise<SearchSuggestions> {
    const params = `?q=${encodeURIComponent(query)}`;
    return this.request<SearchSuggestions>(`/search/quick${params}`);
  }

  // GitHub integration
  async getGitHubRateLimit() {
    return this.request('/test/github/rate-limit');
  }

  async searchGitHub(query: string, options: Record<string, string> = {}) {
    const params = new URLSearchParams({ q: query, ...options });
    return this.request(`/test/github/search?${params}`);
  }

  // StackOverflow integration
  async getStackOverflowQuota() {
    return this.request('/test/stackoverflow/quota');
  }

  async getStackOverflowQuestions(options: Record<string, string> = {}) {
    const params = new URLSearchParams(options);
    return this.request(`/test/stackoverflow/questions?${params}`);
  }

  // AI/Gemini integration
  async getGeminiStatus() {
    return this.request('/test/gemini/status');
  }

  async generateEmbedding(text: string) {
    return this.request('/test/gemini/embedding', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }

  // Content processing
  async processGitHubContent(options: { owner: string; repo: string }) {
    return this.request('/test/pipeline/github', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  async processStackOverflowContent(options: { tags?: string[]; limit?: number }) {
    return this.request('/test/pipeline/stackoverflow', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  // Admin operations
  async getSystemHealth() {
    return this.request('/admin/system-health');
  }

  async getProcessingStats() {
    return this.request('/admin/processing-stats');
  }
}

// Create singleton instance
export const apiClient = new ApiClient();

/**
 * Map FE-flavored filter values into the API's option shape.
 * - source: "github" | "stackoverflow" | "docs" → "repository" |
 *   "question" | "documentation" (the API's enum). "all" passes
 *   through to mean "no filter."
 * - language: passes through; the API does case-sensitive matching
 *   on the lowercase enum values, which match what the UI uses.
 * - sortBy / dateRange: not implemented server-side yet; documented
 *   in TODO.md item A.1.
 *
 * Drops any field that's the default ("all" / "relevance") so the
 * outgoing JSON stays compact and the API doesn't see noise.
 */
function toApiOptions(opts: SearchFilters): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (opts.limit) out.limit = opts.limit;
  if (opts.offset) out.offset = opts.offset;

  if (opts.source && opts.source !== "all") {
    const map: Record<string, string> = {
      github: "repository",
      stackoverflow: "question",
      docs: "documentation",
    };
    out.source = map[opts.source] ?? opts.source;
  }
  if (opts.language && opts.language !== "all") {
    out.language = opts.language;
  }
  // sortBy + dateRange are accepted into the request body so the
  // controller can adopt them without an FE change. Until the
  // server supports them, they're effectively no-ops.
  if (opts.sortBy && opts.sortBy !== "relevance") {
    out.sortBy = opts.sortBy;
  }
  if (opts.dateRange && opts.dateRange !== "all") {
    out.dateRange = opts.dateRange;
  }
  return out;
}

// Export default
export default apiClient;