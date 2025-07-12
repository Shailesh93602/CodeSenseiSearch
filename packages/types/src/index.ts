// Search related types
export interface SearchQuery {
  query: string;
  filters?: {
    language?: string[];
    repo?: string[];
    dateRange?: {
      from: Date;
      to: Date;
    };
    tags?: string[];
  };
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  snippet: string;
  score: number;
  metadata: ContentMetadata;
  highlights?: string[];
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  took: number; // milliseconds
  page: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// Content types
export interface ContentMetadata {
  repo: string;
  path: string;
  language: string;
  timestamp: Date;
  author?: string;
  branch?: string;
  size: number;
  type: 'file' | 'stackoverflow' | 'documentation';
}

export interface Content {
  id: string;
  content: string;
  metadata: ContentMetadata;
  embedding?: number[];
  chunks?: ContentChunk[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentChunk {
  id: string;
  contentId: string;
  text: string;
  startIndex: number;
  endIndex: number;
  embedding?: number[];
  tokens: number;
}

// User types
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  githubId?: string;
  preferences: UserPreferences;
  favorites: string[]; // Content IDs
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  languages: string[];
  repositories: string[];
  emailNotifications: boolean;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface HealthCheck {
  status: 'ok' | 'error';
  timestamp: string;
  service: string;
  version: string;
  database?: 'connected' | 'disconnected';
  redis?: 'connected' | 'disconnected';
}

// Ingestion types
export interface IngestionJob {
  id: string;
  type: 'github' | 'stackoverflow';
  status: 'pending' | 'running' | 'completed' | 'failed';
  source: string; // repo URL or stackoverflow tag
  progress: number; // 0-100
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}