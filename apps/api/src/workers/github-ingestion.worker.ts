import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueService, JobType } from '../services/queue.service';
import { GitHubApiService } from '../services/github-api.service';
import { PrismaService } from '../services/prisma.service';
import { BaseWorker } from './worker.base';

// GitHub Ingestion Worker
@Injectable()
export class GitHubIngestionWorker extends BaseWorker {
  constructor(
    queueService: QueueService,
    private readonly githubApiService: GitHubApiService,
    private readonly prismaService: PrismaService,
  ) {
    super(queueService, 'github-ingestion', 3);
  }

  protected async processJob(job: Job): Promise<any> {
    const { name, data } = job;

    switch (name as JobType) {
      case JobType.GITHUB_INGEST_REPOSITORY:
        return this.ingestRepository(data);
      default:
        throw new Error(`Unknown job type: ${name}`);
    }
  }

  private async ingestRepository(data: any): Promise<any> {
    const { owner, name, fullName, repositoryId } = data;
    this.logger.log(`Ingesting repository: ${fullName}`);

    try {
      // Update repository status to IN_PROGRESS
      await this.prismaService.repository.update({
        where: { id: repositoryId },
        data: { ingestionStatus: 'IN_PROGRESS' },
      });

      // Check rate limit before making requests
      const canProceed = await this.githubApiService.checkRateLimit(10);
      if (!canProceed) {
        throw new Error('GitHub rate limit exceeded - postponing ingestion');
      }

      // Get repository details for branch info
      const repository = await this.githubApiService.getRepository(owner, name);
      const defaultBranch = repository.defaultBranch || 'main';

      // Get file tree for the repository
      const fileTree = await this.githubApiService.getRepositoryTree(
        owner,
        name,
        defaultBranch,
      );

      // Filter for supported file types
      const supportedExtensions = [
        '.md',
        '.txt',
        '.js',
        '.ts',
        '.jsx',
        '.tsx',
        '.py',
        '.java',
        '.go',
        '.rs',
        '.c',
        '.cpp',
        '.h',
        '.hpp',
        '.css',
        '.scss',
        '.html',
        '.vue',
        '.svelte',
        '.php',
        '.rb',
        '.scala',
        '.kt',
        '.swift',
        '.sql',
        '.yaml',
        '.yml',
        '.json',
        '.xml',
      ];

      const filesToProcess = fileTree.filter((file) => {
        // Only process files, not directories
        if (file.type !== 'file') return false;

        // Check file size (skip very large files)
        if (file.size && file.size > 1024 * 1024) return false; // Skip > 1MB files

        // Check file extension
        const hasExtension = supportedExtensions.some((ext) =>
          file.name.toLowerCase().endsWith(ext),
        );

        // Include README files even without extension
        const isReadme = /^readme/i.test(file.name);

        return hasExtension || isReadme;
      });

      this.logger.log(
        `Found ${filesToProcess.length} files to process in ${fullName}`,
      );

      // Create processing jobs for each file
      let jobsCreated = 0;
      for (const file of filesToProcess) {
        try {
          await this.queueService.addGitHubFileProcessingJob({
            repositoryId,
            filePath: file.path,
            fileName: file.name,
            downloadUrl: file.downloadUrl || file.url || '',
            language: this.detectLanguage(file.name),
            size: file.size || 0,
          });
          jobsCreated++;
        } catch (error) {
          this.logger.error(
            `Failed to create processing job for ${file.path}: ${error.message}`,
          );
        }
      }

      // Update repository status
      await this.prismaService.repository.update({
        where: { id: repositoryId },
        data: {
          ingestionStatus: 'IN_PROGRESS',
          lastIngestionAt: new Date(),
        },
      });

      return {
        success: true,
        repositoryId,
        totalFiles: fileTree.length,
        filesToProcess: filesToProcess.length,
        jobsCreated,
        status: 'processing',
      };
    } catch (error) {
      this.logger.error(
        `Repository ingestion failed for ${fullName}: ${error.message}`,
        error,
      );

      // Update repository status to ERROR
      await this.prismaService.repository.update({
        where: { id: repositoryId },
        data: { ingestionStatus: 'FAILED' },
      });

      throw error;
    }
  }

  private detectLanguage(fileName: string): string {
    const extension = fileName.toLowerCase().split('.').pop() || '';

    const languageMap: Record<string, string> = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      java: 'java',
      go: 'go',
      rs: 'rust',
      c: 'c',
      cpp: 'cpp',
      cc: 'cpp',
      cxx: 'cpp',
      h: 'c',
      hpp: 'cpp',
      cs: 'csharp',
      php: 'php',
      rb: 'ruby',
      scala: 'scala',
      kt: 'kotlin',
      swift: 'swift',
      sql: 'sql',
      html: 'html',
      css: 'css',
      scss: 'css',
      sass: 'css',
      vue: 'vue',
      svelte: 'svelte',
      yaml: 'yaml',
      yml: 'yaml',
      json: 'json',
      xml: 'xml',
      md: 'markdown',
      txt: 'text',
    };

    return languageMap[extension] || 'text';
  }
}
