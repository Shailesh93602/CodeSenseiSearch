import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { graphql } from '@octokit/graphql';
import { Octokit } from '@octokit/rest';

/**
 * GitHub API Service
 * 
 * Provides comprehensive GitHub API integration using GraphQL v4 and REST v3.
 * Implements rate limiting, error handling, and efficient data fetching for
 * repository discovery and content ingestion.
 * 
 * Key Features:
 * - Repository search and discovery
 * - Content fetching with pagination
 * - Rate limit management and monitoring
 * - Retry logic with exponential backoff
 * - Authentication handling
 * - Error handling and logging
 */

export interface GitHubRepository {
  id: number;
  nodeId: string;
  name: string;
  fullName: string;
  owner: {
    login: string;
    id: number;
    type: string;
  };
  description: string | null;
  isPrivate: boolean;
  htmlUrl: string;
  cloneUrl: string;
  sshUrl: string;
  stargazersCount: number;
  forksCount: number;
  language: string | null;
  size: number;
  defaultBranch: string;
  topics: string[];
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  hasIssues: boolean;
  hasProjects: boolean;
  hasWiki: boolean;
  hasPages: boolean;
  hasDownloads: boolean;
  archived: boolean;
  disabled: boolean;
  license: {
    key: string;
    name: string;
    spdxId: string | null;
  } | null;
}

export interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  htmlUrl: string;
  gitUrl: string;
  downloadUrl: string | null;
  type: 'file' | 'dir';
  content?: string; // Base64 encoded for files
  encoding?: string;
}

export interface GitHubSearchOptions {
  query: string;
  sort?: 'stars' | 'forks' | 'help-wanted-issues' | 'updated';
  order?: 'asc' | 'desc';
  perPage?: number;
  page?: number;
}

export interface GitHubRateLimit {
  limit: number;
  remaining: number;
  reset: number;
  used: number;
  resource: string;
}

export interface GitHubRepositorySearchResult {
  totalCount: number;
  incompleteResults: boolean;
  items: GitHubRepository[];
  rateLimit: GitHubRateLimit;
}

export interface GitHubContentFetchResult {
  files: GitHubFile[];
  totalFiles: number;
  rateLimit: GitHubRateLimit;
}

@Injectable()
export class GitHubApiService {
  private readonly logger = new Logger(GitHubApiService.name);
  private readonly graphqlClient: typeof graphql;
  private readonly restClient: Octokit;
  private readonly authToken: string;
  private readonly maxRetries: number = 3;
  private readonly baseRetryDelay: number = 1000; // 1 second

  constructor(private readonly configService: ConfigService) {
    this.authToken = this.configService.get<string>('GITHUB_TOKEN') || '';
    
    if (!this.authToken) {
      this.logger.warn('GitHub token not configured - API requests will be limited');
    }

    // Initialize GraphQL client
    this.graphqlClient = graphql.defaults({
      headers: {
        authorization: this.authToken ? `token ${this.authToken}` : '',
        'User-Agent': 'CodeSenseiSearch/1.0',
      },
    });

    // Initialize REST client
    this.restClient = new Octokit({
      auth: this.authToken,
      userAgent: 'CodeSenseiSearch/1.0',
    });

    this.logger.log('GitHub API service initialized');
  }

  /**
   * Search repositories using GitHub's powerful search API
   * Combines multiple criteria for optimal discovery
   */
  async searchRepositories(options: GitHubSearchOptions): Promise<GitHubRepositorySearchResult> {
    const { query, sort = 'stars', order = 'desc', perPage = 30, page = 1 } = options;
    
    this.logger.log(`Searching repositories: "${query}" (${sort} ${order}, page ${page})`);

    try {
      const response = await this.withRetry(async () => {
        return await this.restClient.search.repos({
          q: query,
          sort,
          order,
          per_page: Math.min(perPage, 100), // GitHub max is 100
          page,
        });
      });

      const repositories: GitHubRepository[] = response.data.items.map(item => ({
        id: item.id,
        nodeId: item.node_id,
        name: item.name,
        fullName: item.full_name,
        owner: {
          login: item.owner?.login || '',
          id: item.owner?.id || 0,
          type: item.owner?.type || '',
        },
        description: item.description,
        isPrivate: item.private,
        htmlUrl: item.html_url,
        cloneUrl: item.clone_url,
        sshUrl: item.ssh_url,
        stargazersCount: item.stargazers_count,
        forksCount: item.forks_count,
        language: item.language,
        size: item.size,
        defaultBranch: item.default_branch,
        topics: item.topics || [],
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        pushedAt: item.pushed_at,
        hasIssues: item.has_issues,
        hasProjects: item.has_projects,
        hasWiki: item.has_wiki,
        hasPages: item.has_pages,
        hasDownloads: item.has_downloads,
        archived: item.archived,
        disabled: item.disabled,
        license: item.license ? {
          key: item.license.key,
          name: item.license.name,
          spdxId: item.license.spdx_id,
        } : null,
      }));

      const rateLimit = await this.getRateLimit();

      return {
        totalCount: response.data.total_count,
        incompleteResults: response.data.incomplete_results,
        items: repositories,
        rateLimit,
      };

    } catch (error) {
      this.logger.error(`Repository search failed: ${error.message}`, error);
      throw new Error(`GitHub repository search failed: ${error.message}`);
    }
  }

  /**
   * Get repository details using GraphQL for efficient data fetching
   */
  async getRepository(owner: string, name: string): Promise<GitHubRepository> {
    this.logger.log(`Fetching repository details: ${owner}/${name}`);

    const query = `
      query GetRepository($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          id
          databaseId
          name
          nameWithOwner
          description
          isPrivate
          url
          sshUrl
          cloneUrl
          stargazerCount
          forkCount
          primaryLanguage {
            name
          }
          diskUsage
          defaultBranchRef {
            name
          }
          repositoryTopics(first: 20) {
            nodes {
              topic {
                name
              }
            }
          }
          createdAt
          updatedAt
          pushedAt
          hasIssuesEnabled
          hasProjectsEnabled
          hasWikiEnabled
          homepageUrl
          isArchived
          isDisabled
          licenseInfo {
            key
            name
            spdxId
          }
          owner {
            login
            ... on User {
              databaseId
            }
            ... on Organization {
              databaseId
            }
          }
        }
        rateLimit {
          limit
          remaining
          resetAt
        }
      }
    `;

    try {
      const response: any = await this.withRetry(async () => {
        return await this.graphqlClient(query, { owner, name });
      });

      const repo = response.repository;
      if (!repo) {
        throw new Error(`Repository ${owner}/${name} not found`);
      }

      return {
        id: repo.databaseId,
        nodeId: repo.id,
        name: repo.name,
        fullName: repo.nameWithOwner,
        owner: {
          login: repo.owner.login,
          id: repo.owner.databaseId,
          type: repo.owner.__typename,
        },
        description: repo.description,
        isPrivate: repo.isPrivate,
        htmlUrl: repo.url,
        cloneUrl: repo.cloneUrl,
        sshUrl: repo.sshUrl,
        stargazersCount: repo.stargazerCount,
        forksCount: repo.forkCount,
        language: repo.primaryLanguage?.name || null,
        size: repo.diskUsage || 0,
        defaultBranch: repo.defaultBranchRef?.name || 'main',
        topics: repo.repositoryTopics.nodes.map((node: any) => node.topic.name),
        createdAt: repo.createdAt,
        updatedAt: repo.updatedAt,
        pushedAt: repo.pushedAt,
        hasIssues: repo.hasIssuesEnabled,
        hasProjects: repo.hasProjectsEnabled,
        hasWiki: repo.hasWikiEnabled,
        hasPages: false, // Not available in GraphQL
        hasDownloads: false, // Not available in GraphQL
        archived: repo.isArchived,
        disabled: repo.isDisabled,
        license: repo.licenseInfo ? {
          key: repo.licenseInfo.key,
          name: repo.licenseInfo.name,
          spdxId: repo.licenseInfo.spdxId,
        } : null,
      };

    } catch (error) {
      this.logger.error(`Failed to fetch repository ${owner}/${name}: ${error.message}`, error);
      throw new Error(`GitHub repository fetch failed: ${error.message}`);
    }
  }

  /**
   * Get repository contents recursively with efficient tree traversal
   */
  async getRepositoryContents(
    owner: string,
    repo: string,
    path: string = '',
    ref: string = 'main'
  ): Promise<GitHubContentFetchResult> {
    this.logger.log(`Fetching contents: ${owner}/${repo}/${path} (ref: ${ref})`);

    try {
      const response = await this.withRetry(async () => {
        return await this.restClient.repos.getContent({
          owner,
          repo,
          path,
          ref,
        });
      });

      const rateLimit = await this.getRateLimit();

      // Handle single file
      if (!Array.isArray(response.data)) {
        const file = response.data as any;
        return {
          files: [{
            name: file.name,
            path: file.path,
            sha: file.sha,
            size: file.size,
            url: file.url,
            htmlUrl: file.html_url,
            gitUrl: file.git_url,
            downloadUrl: file.download_url,
            type: file.type,
            content: file.content,
            encoding: file.encoding,
          }],
          totalFiles: 1,
          rateLimit,
        };
      }

      // Handle directory contents
      const files: GitHubFile[] = response.data.map((item: any) => ({
        name: item.name,
        path: item.path,
        sha: item.sha,
        size: item.size,
        url: item.url,
        htmlUrl: item.html_url,
        gitUrl: item.git_url,
        downloadUrl: item.download_url,
        type: item.type,
      }));

      return {
        files,
        totalFiles: files.length,
        rateLimit,
      };

    } catch (error) {
      this.logger.error(`Failed to fetch contents for ${owner}/${repo}/${path}: ${error.message}`, error);
      throw new Error(`GitHub content fetch failed: ${error.message}`);
    }
  }

  /**
   * Get file content by download URL for large files
   */
  async getFileContent(downloadUrl: string): Promise<string> {
    this.logger.log(`Fetching file content from: ${downloadUrl}`);

    try {
      const response = await this.withRetry(async () => {
        return await fetch(downloadUrl);
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();
      this.logger.log(`Fetched ${content.length} characters`);
      
      return content;

    } catch (error) {
      this.logger.error(`Failed to fetch file content: ${error.message}`, error);
      throw new Error(`File content fetch failed: ${error.message}`);
    }
  }

  /**
   * Get current rate limit status for all API endpoints
   */
  async getRateLimit(): Promise<GitHubRateLimit> {
    try {
      const response = await this.restClient.rateLimit.get();
      const coreLimit = response.data.resources.core;

      return {
        limit: coreLimit.limit,
        remaining: coreLimit.remaining,
        reset: coreLimit.reset,
        used: coreLimit.used,
        resource: 'core',
      };

    } catch (error) {
      this.logger.error(`Failed to fetch rate limit: ${error.message}`, error);
      // Return conservative defaults on error
      return {
        limit: 60,
        remaining: 30,
        reset: Date.now() + 3600000, // 1 hour from now
        used: 30,
        resource: 'core',
      };
    }
  }

  /**
   * Search repositories by programming language and popularity
   */
  async searchRepositoriesByLanguage(
    language: string,
    minStars: number = 100,
    maxResults: number = 100
  ): Promise<GitHubRepositorySearchResult> {
    const query = `language:${language} stars:>=${minStars} is:public archived:false`;
    
    return this.searchRepositories({
      query,
      sort: 'stars',
      order: 'desc',
      perPage: Math.min(maxResults, 100),
      page: 1,
    });
  }

  /**
   * Search repositories by topic with quality filters
   */
  async searchRepositoriesByTopic(
    topic: string,
    minStars: number = 50,
    maxResults: number = 100
  ): Promise<GitHubRepositorySearchResult> {
    const query = `topic:${topic} stars:>=${minStars} is:public archived:false`;
    
    return this.searchRepositories({
      query,
      sort: 'stars',
      order: 'desc',
      perPage: Math.min(maxResults, 100),
      page: 1,
    });
  }

  /**
   * Check if rate limit allows for operation
   */
  async checkRateLimit(requiredRequests: number = 1): Promise<boolean> {
    const rateLimit = await this.getRateLimit();
    const canProceed = rateLimit.remaining >= requiredRequests;
    
    if (!canProceed) {
      const resetTime = new Date(rateLimit.reset * 1000);
      this.logger.warn(`Rate limit exceeded. Reset at: ${resetTime.toISOString()}`);
    }
    
    return canProceed;
  }

  /**
   * Retry wrapper with exponential backoff
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry for certain error types
        if (error && typeof error === 'object' && 'status' in error) {
          const status = (error as any).status;
          if (status === 401 || status === 403 || status === 404) {
            throw error;
          }

          // Handle rate limiting
          if (status === 429) {
            const response = (error as any).response;
            const retryAfter = response?.headers?.['retry-after'];
            const delayMs = retryAfter ? parseInt(retryAfter) * 1000 : this.baseRetryDelay * Math.pow(2, attempt);
            
            this.logger.warn(`Rate limited, retrying in ${delayMs}ms (attempt ${attempt}/${this.maxRetries})`);
            await this.delay(delayMs);
            continue;
          }
        }

        if (attempt === this.maxRetries) {
          break;
        }

        const delayMs = this.baseRetryDelay * Math.pow(2, attempt - 1);
        this.logger.warn(`Request failed, retrying in ${delayMs}ms (attempt ${attempt}/${this.maxRetries}): ${(error as Error).message}`);
        await this.delay(delayMs);
      }
    }

    if (lastError) {
      throw lastError;
    }
    throw new Error('Operation failed after all retries');
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate GitHub token and permissions
   */
  async validateToken(): Promise<boolean> {
    try {
      const response = await this.restClient.users.getAuthenticated();
      this.logger.log(`GitHub token validated for user: ${response.data.login}`);
      return true;
    } catch (error) {
      this.logger.error(`GitHub token validation failed: ${error.message}`);
      return false;
    }
  }
}