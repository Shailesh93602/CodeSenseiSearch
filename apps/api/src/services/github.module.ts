import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GitHubApiService } from './github-api.service';

/**
 * GitHub Integration Module
 * 
 * Provides GitHub API integration services for repository discovery
 * and content ingestion. This module encapsulates all GitHub-specific
 * functionality including authentication, rate limiting, and data fetching.
 * 
 * Services:
 * - GitHubApiService: Core GitHub API integration
 * 
 * Configuration:
 * - GITHUB_TOKEN: Personal access token for authentication
 * - GitHub API rate limiting and retry logic
 * - GraphQL and REST API client configuration
 */
@Module({
  imports: [ConfigModule],
  providers: [GitHubApiService],
  exports: [GitHubApiService],
})
export class GitHubModule {
  constructor(private readonly githubApiService: GitHubApiService) {
    // Validate GitHub integration on module initialization
    this.validateGitHubIntegration();
  }

  private async validateGitHubIntegration() {
    try {
      const isValid = await this.githubApiService.validateToken();
      if (isValid) {
        console.log('✅ GitHub API integration validated successfully');
      } else {
        console.warn('⚠️  GitHub API token not configured or invalid - using public API limits');
      }
    } catch (error) {
      console.error('❌ GitHub API integration failed:', error.message);
    }
  }
}