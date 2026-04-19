export interface SearchFilters {
  // Language filters
  languages?: string[];

  // Repository filters
  repositories?: string[];
  repositoryOwners?: string[];

  // Date range filters
  dateFrom?: Date;
  dateTo?: Date;
  lastModifiedFrom?: Date;
  lastModifiedTo?: Date;

  // File type filters
  fileTypes?: string[];
  extensions?: string[];

  // Content type filters
  contentTypes?: ContentType[];
  sources?: ContentSource[];

  // Size filters
  minSize?: number;
  maxSize?: number;

  // Score filters
  minScore?: number;
  maxScore?: number;

  // Tag filters
  tags?: string[];
  excludeTags?: string[];

  // Path filters
  pathIncludes?: string[];
  pathExcludes?: string[];

  // Advanced filters
  hasCode?: boolean;
  hasDocumentation?: boolean;
  hasTests?: boolean;
  isPublic?: boolean;
}

export enum ContentType {
  CODE = 'code',
  DOCUMENTATION = 'documentation',
  README = 'readme',
  CONFIG = 'config',
  TEST = 'test',
  EXAMPLE = 'example',
  TUTORIAL = 'tutorial',
  API_DOC = 'api_doc',
}

export enum ContentSource {
  GITHUB = 'github',
  STACKOVERFLOW = 'stackoverflow',
  DOCUMENTATION = 'documentation',
  BLOG = 'blog',
  FORUM = 'forum',
}

export interface FilterOptions {
  // Available filter values
  availableLanguages: string[];
  availableRepositories: RepositoryInfo[];
  availableFileTypes: string[];
  availableExtensions: string[];
  availableContentTypes: ContentType[];
  availableSources: ContentSource[];
  availableTags: string[];

  // Filter counts (for UI)
  languageCounts: Record<string, number>;
  repositoryCounts: Record<string, number>;
  fileTypeCounts: Record<string, number>;
  sourceCounts: Record<string, number>;

  // Date ranges
  dateRange: {
    earliest: Date;
    latest: Date;
  };

  // Size ranges
  sizeRange: {
    min: number;
    max: number;
  };
}

export interface RepositoryInfo {
  id: string;
  name: string;
  owner: string;
  fullName: string;
  description?: string;
  isPublic: boolean;
  stars?: number;
  language?: string;
}

export interface AppliedFilters {
  filters: SearchFilters;
  totalResultsBeforeFiltering: number;
  totalResultsAfterFiltering: number;
  filteringTime: number;
  appliedFilterCount: number;
  removedResultsCount: number;
}

export interface FilterValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedFilters: SearchFilters;
}

export interface SearchFilterQuery {
  // Database query components
  whereClause: string;
  parameters: any[];
  joins: string[];
  orderBy?: string;

  // Vector search modifications
  vectorFilters?: Record<string, any>;

  // Full-text search modifications
  textSearchFilters?: string;
}
