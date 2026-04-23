import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueService, JobType } from '../services/queue.service';
import { GitHubApiService } from '../services/github-api.service';
import { PrismaService } from '../services/prisma.service';
import { BaseWorker } from './worker.base';
// GitHub Discovery Worker
@Injectable()
export class GitHubDiscoveryWorker extends BaseWorker {
  constructor(
    queueService: QueueService,
    private readonly githubApiService: GitHubApiService,
    private readonly prismaService: PrismaService,
  ) {
    super(queueService, 'github-discovery', 2); // Lower concurrency for API limits
  }

  protected async processJob(job: Job): Promise<any> {
    const { name, data } = job;

    switch (name as JobType) {
      case JobType.GITHUB_DISCOVER_REPOSITORIES:
        return this.discoverRepositories(data);
      default:
        throw new Error(`Unknown job type: ${name}`);
    }
  }

  private async discoverRepositories(data: any): Promise<any> {
    this.logger.log(
      `Discovering GitHub repositories with criteria: ${JSON.stringify(data)}`,
    );

    const { language, minStars = 100, maxResults = 50, query } = data;

    try {
      // Check rate limit before making requests
      const canProceed = await this.githubApiService.checkRateLimit(5);
      if (!canProceed) {
        throw new Error('GitHub rate limit exceeded - postponing discovery');
      }

      // Search repositories using GitHub API
      let searchResult;
      if (query) {
        // Custom query search
        const searchQuery = `${query} language:${language} stars:>=${minStars} is:public archived:false`;
        searchResult = await this.githubApiService.searchRepositories({
          query: searchQuery,
          sort: 'stars',
          order: 'desc',
          perPage: Math.min(maxResults, 100),
        });
      } else {
        // Language-based search
        searchResult = await this.githubApiService.searchRepositoriesByLanguage(
          language,
          minStars,
          maxResults,
        );
      }

      // Get GitHub source record
      const githubSource = await this.prismaService.source.findUnique({
        where: { name: 'github' },
      });

      if (!githubSource) {
        throw new Error('GitHub source not found in database');
      }

      // Process discovered repositories
      const processedRepos: Array<{ action: string; repository: any }> = [];
      for (const repo of searchResult.items) {
        try {
          // Check if repository already exists
          const existingRepo = await this.prismaService.repository.findUnique({
            where: { githubId: repo.id },
          });

          if (existingRepo) {
            // Update existing repository metadata
            const updatedRepo = await this.prismaService.repository.update({
              where: { githubId: repo.id },
              data: {
                name: repo.name,
                owner: repo.owner.login,
                description: repo.description,
                starCount: repo.stargazersCount,
                forkCount: repo.forksCount,
                language: repo.language,
                size: repo.size,
                htmlUrl: repo.htmlUrl,
                cloneUrl: repo.cloneUrl,
                defaultBranch: repo.defaultBranch,
                updatedAt: new Date(),
              },
            });
            processedRepos.push({ action: 'updated', repository: updatedRepo });
          } else {
            // Create new repository record
            const newRepo = await this.prismaService.repository.create({
              data: {
                sourceId: githubSource.id,
                githubId: repo.id,
                fullName: repo.fullName,
                name: repo.name,
                owner: repo.owner.login,
                description: repo.description,
                starCount: repo.stargazersCount,
                forkCount: repo.forksCount,
                language: repo.language,
                size: repo.size,
                htmlUrl: repo.htmlUrl,
                cloneUrl: repo.cloneUrl,
                defaultBranch: repo.defaultBranch,
                ingestionStatus: 'PENDING',
              },
            });

            // Queue repository for ingestion
            await this.queueService.addGitHubIngestionJob(
              {
                owner: repo.owner.login,
                name: repo.name,
                fullName: repo.fullName,
                repositoryId: newRepo.id,
                priority: this.calculatePriority(
                  repo.stargazersCount,
                  repo.language,
                ),
              },
              {
                priority: this.calculatePriority(
                  repo.stargazersCount,
                  repo.language,
                ),
              },
            );

            processedRepos.push({ action: 'created', repository: newRepo });
          }
        } catch (error) {
          this.logger.error(
            `Failed to process repository ${repo.fullName}: ${error.message}`,
          );
        }
      }

      return {
        success: true,
        discovered: searchResult.totalCount,
        processed: processedRepos.length,
        repositories: processedRepos,
        rateLimit: searchResult.rateLimit,
      };
    } catch (error) {
      this.logger.error(`Repository discovery failed: ${error.message}`, error);
      throw error;
    }
  }

  private calculatePriority(stars: number, language: string | null): number {
    let priority = 5; // Base priority

    // Higher priority for more popular repositories
    if (stars > 10000) priority += 3;
    else if (stars > 1000) priority += 2;
    else if (stars > 100) priority += 1;

    // Higher priority for popular languages
    const popularLanguages = [
      'typescript',
      'javascript',
      'python',
      'java',
      'go',
      'rust',
    ];
    if (language && popularLanguages.includes(language.toLowerCase())) {
      priority += 1;
    }

    return Math.min(priority, 10); // Cap at 10
  }
}
