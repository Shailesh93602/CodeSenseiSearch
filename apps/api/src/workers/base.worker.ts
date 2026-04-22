import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueService, JobType } from '../services/queue.service';
import { GitHubApiService } from '../services/github-api.service';
import { StackOverflowApiService } from '../services/stackoverflow-api.service';
import { PrismaService } from '../services/prisma.service';
import { BaseWorker } from './worker.base';
import { chunkByAst, isAstSupportedLanguage } from './code-chunker';

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

// GitHub Processing Worker
@Injectable()
export class GitHubProcessingWorker extends BaseWorker {
  constructor(
    queueService: QueueService,
    private readonly githubApiService: GitHubApiService,
    private readonly prismaService: PrismaService,
  ) {
    super(queueService, 'github-processing', 5);
  }

  protected async processJob(job: Job): Promise<any> {
    const { name, data } = job;

    switch (name as JobType) {
      case JobType.GITHUB_PROCESS_FILE:
        return this.processFile(data);
      default:
        throw new Error(`Unknown job type: ${name}`);
    }
  }

  private async processFile(data: any): Promise<any> {
    const { repositoryId, filePath, fileName, downloadUrl, language, size } =
      data;
    this.logger.log(`Processing file: ${filePath} (${fileName})`);

    try {
      // Validate file size (skip files that are too large)
      if (size > 1024 * 1024) {
        // 1MB limit
        this.logger.warn(`Skipping large file: ${filePath} (${size} bytes)`);
        return {
          success: false,
          reason: 'file_too_large',
          filePath,
          size,
        };
      }

      // Download file content
      const content = await this.githubApiService.getFileContent(downloadUrl);
      if (!content || content.trim().length === 0) {
        this.logger.warn(`Empty file content: ${filePath}`);
        return {
          success: false,
          reason: 'empty_content',
          filePath,
        };
      }

      // Validate content (check for binary files, etc.)
      if (this.isBinaryContent(content)) {
        this.logger.warn(`Binary file detected, skipping: ${filePath}`);
        return {
          success: false,
          reason: 'binary_content',
          filePath,
        };
      }

      // Get repository information for metadata
      const repository = await this.prismaService.repository.findUnique({
        where: { id: repositoryId },
        include: { source: true },
      });

      if (!repository) {
        throw new Error(`Repository not found: ${repositoryId}`);
      }

      // Create content record in database
      const contentRecord = await this.prismaService.content.create({
        data: {
          repositoryId,
          title: fileName,
          content,
          contentType: 'REPOSITORY_FILE',
          language,
          filePath,
          fileName,
          fileSize: size,
          downloadUrl,
          contentHash: this.generateContentHash(content),
          processedAt: new Date(),
        },
      });

      // Create content chunks for embedding
      const chunks = this.createContentChunks(content, fileName, language);
      let chunksCreated = 0;

      for (const [index, chunk] of chunks.entries()) {
        try {
          await this.prismaService.contentChunk.create({
            data: {
              contentId: contentRecord.id,
              sequence: index,
              chunkText: chunk.text,
              chunkHash: this.generateContentHash(chunk.text),
              startChar: chunk.startPosition,
              endChar: chunk.endPosition,
              embeddingStatus: 'PENDING',
            },
          });
          chunksCreated++;
        } catch (error) {
          this.logger.error(
            `Failed to create chunk ${index} for ${filePath}: ${error.message}`,
          );
        }
      }

      this.logger.log(
        `Successfully processed ${filePath}: ${chunksCreated} chunks created`,
      );

      return {
        success: true,
        contentId: contentRecord.id,
        filePath,
        contentLength: content.length,
        chunksCreated,
        language,
        repository: repository.fullName,
      };
    } catch (error) {
      this.logger.error(
        `Failed to process file ${filePath}: ${error.message}`,
        error,
      );
      throw error;
    }
  }

  private isBinaryContent(content: string): boolean {
    // Check for null bytes which indicate binary content
    if (content.includes('\0')) return true;

    // Check the ratio of non-printable characters
    const printableChars = content.match(/[\x20-\x7E\r\n\t]/g) || [];
    const ratio = printableChars.length / content.length;

    // If less than 80% printable characters, consider it binary
    return ratio < 0.8;
  }

  private countWords(content: string): number {
    // Simple word count - split by whitespace and filter empty strings
    return content.split(/\s+/).filter((word) => word.length > 0).length;
  }

  private generateContentHash(content: string): string {
    // Generate a simple hash for content deduplication
    // In production, you'd use a proper hashing library like crypto
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private createContentChunks(
    content: string,
    fileName: string,
    language: string,
  ): Array<{
    text: string;
    startPosition: number;
    endPosition: number;
  }> {
    // Different chunking strategies based on content type
    if (language === 'markdown') {
      return this.chunkMarkdown(content);
    } else if (this.isCodeLanguage(language)) {
      return this.chunkCode(content);
    } else {
      return this.chunkPlainText(content);
    }
  }

  private chunkMarkdown(content: string): Array<{
    text: string;
    startPosition: number;
    endPosition: number;
  }> {
    const chunks: Array<{
      text: string;
      startPosition: number;
      endPosition: number;
    }> = [];
    const sections = content.split(/^#+\s/m); // Split by markdown headers
    let currentPosition = 0;

    for (const section of sections) {
      const trimmedSection = section.trim();
      if (trimmedSection.length > 0) {
        const startPos = currentPosition;
        const endPos = currentPosition + trimmedSection.length;

        chunks.push({
          text: trimmedSection,
          startPosition: startPos,
          endPosition: endPos,
        });

        currentPosition = endPos;
      }
    }

    return chunks.length > 0 ? chunks : this.chunkPlainText(content);
  }

  private chunkCode(content: string): Array<{
    text: string;
    startPosition: number;
    endPosition: number;
  }> {
    const chunks: Array<{
      text: string;
      startPosition: number;
      endPosition: number;
    }> = [];
    const lines = content.split('\n');
    const maxChunkSize = 1000; // Characters per chunk

    let currentChunk = '';
    let currentPosition = 0;
    let chunkStartPosition = 0;

    for (const line of lines) {
      const lineWithNewline = line + '\n';

      if (
        currentChunk.length + lineWithNewline.length > maxChunkSize &&
        currentChunk.length > 0
      ) {
        // Create chunk from current content
        chunks.push({
          text: currentChunk.trim(),
          startPosition: chunkStartPosition,
          endPosition: currentPosition,
        });

        // Start new chunk
        currentChunk = lineWithNewline;
        chunkStartPosition = currentPosition;
      } else {
        currentChunk += lineWithNewline;
      }

      currentPosition += lineWithNewline.length;
    }

    // Add final chunk if any content remains
    if (currentChunk.trim().length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        startPosition: chunkStartPosition,
        endPosition: currentPosition,
      });
    }

    return chunks;
  }

  private chunkPlainText(content: string): Array<{
    text: string;
    startPosition: number;
    endPosition: number;
  }> {
    const chunks: Array<{
      text: string;
      startPosition: number;
      endPosition: number;
    }> = [];
    const maxChunkSize = 1000;
    const overlapSize = 100;

    let currentPosition = 0;

    while (currentPosition < content.length) {
      const endPosition = Math.min(
        currentPosition + maxChunkSize,
        content.length,
      );
      let chunkText = content.substring(currentPosition, endPosition);

      // Try to break at word boundaries
      if (endPosition < content.length) {
        const lastSpaceIndex = chunkText.lastIndexOf(' ');
        if (lastSpaceIndex > maxChunkSize * 0.8) {
          // Only if we're not cutting too much
          chunkText = chunkText.substring(0, lastSpaceIndex);
        }
      }

      chunks.push({
        text: chunkText.trim(),
        startPosition: currentPosition,
        endPosition: currentPosition + chunkText.length,
      });

      currentPosition += chunkText.length - overlapSize;
      if (currentPosition <= 0) break; // Prevent infinite loop
    }

    return chunks;
  }

  private isCodeLanguage(language: string): boolean {
    const codeLanguages = [
      'javascript',
      'typescript',
      'python',
      'java',
      'go',
      'rust',
      'c',
      'cpp',
      'csharp',
      'php',
      'ruby',
      'scala',
      'kotlin',
      'swift',
    ];
    return codeLanguages.includes(language.toLowerCase());
  }
}

// StackOverflow Discovery Worker
@Injectable()
export class StackOverflowDiscoveryWorker extends BaseWorker {
  constructor(
    queueService: QueueService,
    private readonly stackOverflowApiService: StackOverflowApiService,
    private readonly prismaService: PrismaService,
  ) {
    super(queueService, 'stackoverflow-discovery', 2);
  }

  protected async processJob(job: Job): Promise<any> {
    const { name, data } = job;

    switch (name as JobType) {
      case JobType.STACKOVERFLOW_DISCOVER_QUESTIONS:
        return this.discoverQuestions(data);
      default:
        throw new Error(`Unknown job type: ${name}`);
    }
  }

  private async discoverQuestions(data: any): Promise<any> {
    this.logger.log(
      `Discovering StackOverflow questions for tags: ${data.tags.join(', ')}`,
    );

    const { tags, minScore = 10, maxResults = 100 } = data;

    try {
      // Check API quota before making requests
      const quotaStatus = await this.stackOverflowApiService.checkQuotaStatus();
      if (quotaStatus.remaining < 50) {
        throw new Error(
          `StackOverflow API quota too low: ${quotaStatus.remaining} remaining`,
        );
      }

      // Get StackOverflow source record
      const stackOverflowSource = await this.prismaService.source.findUnique({
        where: { name: 'stackoverflow' },
      });

      if (!stackOverflowSource) {
        throw new Error('StackOverflow source not found in database');
      }

      // Search for popular questions
      const questions =
        await this.stackOverflowApiService.getPopularQuestionsByTags(
          tags,
          minScore,
          maxResults,
        );

      // Process discovered questions
      const processedQuestions: Array<{ action: string; question: any }> = [];
      for (const question of questions) {
        try {
          // Check if question already exists
          const existingQuestion = await this.prismaService.question.findUnique(
            { where: { questionId: question.question_id } },
          );

          if (existingQuestion) {
            // Update existing question metadata
            const updatedQuestion = await this.prismaService.question.update({
              where: { questionId: question.question_id },
              data: {
                title: question.title,
                body: question.body,
                score: question.score,
                viewCount: question.view_count,
                answerCount: question.answer_count,
                isAnswered: question.is_answered,
                tags: question.tags,
                updatedAt: new Date(),
              },
            });
            processedQuestions.push({
              action: 'updated',
              question: updatedQuestion,
            });
          } else {
            // Create new question record
            const newQuestion = await this.prismaService.question.create({
              data: {
                sourceId: stackOverflowSource.id,
                questionId: question.question_id,
                title: question.title,
                body: question.body,
                tags: question.tags,
                score: question.score,
                viewCount: question.view_count,
                answerCount: question.answer_count,
                isAnswered: question.is_answered,
                hasAcceptedAnswer: !!question.accepted_answer_id,
                htmlUrl: question.link,
                ingestionStatus: 'PENDING',
              },
            });

            // Queue question for ingestion (to get answers)
            await this.queueService.addStackOverflowIngestionJob(
              {
                questionId: question.question_id,
                contentId: newQuestion.id,
                priority: this.calculatePriority(
                  question.score,
                  question.answer_count,
                ),
              },
              {
                priority: this.calculatePriority(
                  question.score,
                  question.answer_count,
                ),
              },
            );

            processedQuestions.push({
              action: 'created',
              question: newQuestion,
            });
          }
        } catch (error) {
          this.logger.error(
            `Failed to process question ${question.question_id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      return {
        success: true,
        discovered: questions.length,
        processed: processedQuestions.length,
        questions: processedQuestions,
        quotaRemaining: quotaStatus.remaining,
      };
    } catch (error) {
      this.logger.error(
        `StackOverflow question discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error,
      );
      throw error;
    }
  }

  private detectPrimaryLanguage(tags: string[]): string | null {
    const languageTags = [
      'javascript',
      'typescript',
      'python',
      'java',
      'csharp',
      'cpp',
      'go',
      'rust',
      'php',
      'ruby',
      'swift',
      'kotlin',
      'scala',
      'r',
      'matlab',
    ];

    for (const tag of tags) {
      if (languageTags.includes(tag.toLowerCase())) {
        return tag.toLowerCase();
      }
    }

    return null;
  }

  private calculatePriority(score: number, answerCount: number): number {
    let priority = 5; // Base priority

    // Higher priority for higher scored questions
    if (score > 100) priority += 3;
    else if (score > 50) priority += 2;
    else if (score > 20) priority += 1;

    // Higher priority for questions with good answers
    if (answerCount > 5) priority += 2;
    else if (answerCount > 2) priority += 1;

    return Math.min(priority, 10); // Cap at 10
  }
}

// StackOverflow Ingestion Worker
@Injectable()
export class StackOverflowIngestionWorker extends BaseWorker {
  constructor(
    queueService: QueueService,
    private readonly stackOverflowApiService: StackOverflowApiService,
    private readonly prismaService: PrismaService,
  ) {
    super(queueService, 'stackoverflow-ingestion', 3);
  }

  protected async processJob(job: Job): Promise<any> {
    const { name, data } = job;

    switch (name as JobType) {
      case JobType.STACKOVERFLOW_INGEST_QUESTION:
        return this.ingestQuestion(data);
      default:
        throw new Error(`Unknown job type: ${name}`);
    }
  }

  private async ingestQuestion(data: any): Promise<any> {
    this.logger.log(`Ingesting StackOverflow question: ${data.questionId}`);

    const { questionId, contentId } = data;

    try {
      // Get question with answers from StackOverflow API
      const { question, answers } =
        await this.stackOverflowApiService.getQuestionWithAnswers(questionId);

      // Update the question with latest data
      await this.prismaService.question.update({
        where: { id: contentId },
        data: {
          title: question.title,
          body: question.body,
          score: question.score,
          viewCount: question.view_count,
          answerCount: question.answer_count,
          isAnswered: question.is_answered,
          hasAcceptedAnswer: !!question.accepted_answer_id,
          tags: question.tags,
          ingestionStatus: 'IN_PROGRESS',
        },
      });

      // Create content record for the question
      const questionContent = await this.prismaService.content.create({
        data: {
          title: question.title,
          content: this.stackOverflowApiService.cleanHtmlContent(question.body),
          contentType: 'STACKOVERFLOW_QUESTION',
          language: this.detectPrimaryLanguage(question.tags),
          questionId: contentId,
          contentHash: this.generateContentHash(question.body),
          isAnswer: false,
          score: question.score,
        },
      });

      // Create content records for answers
      const processedAnswers: any[] = [];
      for (const answer of answers) {
        try {
          // Check if answer content already exists
          const answerContentHash = this.generateContentHash(answer.body);
          const existingAnswer = await this.prismaService.content.findUnique({
            where: { contentHash: answerContentHash },
          });

          if (!existingAnswer) {
            const answerContent = await this.prismaService.content.create({
              data: {
                title: `Answer to: ${question.title}`,
                content: this.stackOverflowApiService.cleanHtmlContent(
                  answer.body,
                ),
                contentType: 'STACKOVERFLOW_ANSWER',
                language: this.detectPrimaryLanguage(question.tags),
                questionId: contentId,
                contentHash: answerContentHash,
                isAnswer: true,
                isAccepted: answer.is_accepted,
                score: answer.score,
              },
            });

            // Queue answer for chunking if it has substantial content
            if (answerContent.content.length > 100) {
              await this.queueService.addContentChunkingJob({
                contentId: answerContent.id,
                chunkSize: 1000,
                overlap: 200,
              });
            }

            processedAnswers.push(answerContent);
          }
        } catch (error) {
          this.logger.error(
            `Failed to process answer ${answer.answer_id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      // Queue the main question content for chunking
      await this.queueService.addContentChunkingJob({
        contentId: questionContent.id,
        chunkSize: 1000,
        overlap: 200,
      });

      // Update ingestion status
      await this.prismaService.question.update({
        where: { id: contentId },
        data: {
          ingestionStatus: 'COMPLETED',
          contentCount: 1 + processedAnswers.length,
        },
      });

      return Promise.resolve({
        questionId,
        contentId,
        answersProcessed: processedAnswers.length,
        status: 'completed',
        codeBlocksFound:
          this.stackOverflowApiService.extractCodeBlocks(question.body).length +
          answers.reduce(
            (total, answer) =>
              total +
              this.stackOverflowApiService.extractCodeBlocks(answer.body)
                .length,
            0,
          ),
      });
    } catch (error) {
      // Update ingestion status to failed
      await this.prismaService.question.update({
        where: { id: contentId },
        data: {
          ingestionStatus: 'FAILED',
          ingestionError:
            error instanceof Error ? error.message : 'Unknown error',
        },
      });

      this.logger.error(
        `StackOverflow question ingestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error,
      );
      throw error;
    }
  }

  private detectPrimaryLanguage(tags: string[]): string | null {
    const languageTags = [
      'javascript',
      'typescript',
      'python',
      'java',
      'csharp',
      'cpp',
      'go',
      'rust',
      'php',
      'ruby',
      'swift',
      'kotlin',
      'scala',
      'r',
      'matlab',
    ];

    for (const tag of tags) {
      if (languageTags.includes(tag.toLowerCase())) {
        return tag.toLowerCase();
      }
    }

    return null;
  }

  private generateContentHash(content: string): string {
    // Simple hash function for content deduplication
    // In production, you'd want to use a proper crypto library
    return Buffer.from(content).toString('base64').slice(0, 32);
  }

  private async getStackOverflowSource() {
    const source = await this.prismaService.source.findUnique({
      where: { name: 'stackoverflow' },
    });

    if (!source) {
      throw new Error('StackOverflow source not found in database');
    }

    return source;
  }
}

// Content Chunking Worker
@Injectable()
export class ContentChunkingWorker extends BaseWorker {
  constructor(
    queueService: QueueService,
    private readonly prismaService: PrismaService,
  ) {
    super(queueService, 'content-chunking', 10);
  }

  protected async processJob(job: Job): Promise<any> {
    const { name, data } = job;

    switch (name as JobType) {
      case JobType.CHUNK_CONTENT:
        return this.chunkContent(data);
      default:
        throw new Error(`Unknown job type: ${name}`);
    }
  }

  private async chunkContent(data: any): Promise<any> {
    const { contentId, chunkSize = 1000, overlap = 200 } = data;
    this.logger.log(`Chunking content: ${contentId}`);

    try {
      // Load content from database
      const content = await this.prismaService.content.findUnique({
        where: { id: contentId },
        include: {
          repository: true,
          question: true,
        },
      });

      if (!content) {
        throw new Error(`Content not found: ${contentId}`);
      }

      // Apply content-type specific chunking strategy
      const chunks = this.createContentChunks(
        content.content,
        content.contentType,
        content.language || 'text',
        chunkSize,
        overlap,
      );

      // Create chunk records in database
      let chunksCreated = 0;
      for (const [index, chunk] of chunks.entries()) {
        try {
          await this.prismaService.contentChunk.create({
            data: {
              contentId,
              sequence: index,
              chunkText: chunk.text,
              chunkHash: this.generateContentHash(chunk.text),
              startChar: chunk.startPosition,
              endChar: chunk.endPosition,
              embeddingStatus: 'PENDING',
              tokenCount: this.estimateTokenCount(chunk.text),
            },
          });
          chunksCreated++;
        } catch (error) {
          this.logger.error(
            `Failed to create chunk ${index} for content ${contentId}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
        }
      }

      // Update content record with chunk count and processing timestamp
      await this.prismaService.content.update({
        where: { id: contentId },
        data: {
          chunkCount: chunksCreated,
          processedAt: new Date(),
        },
      });

      this.logger.log(
        `Successfully chunked content ${contentId}: ${chunksCreated} chunks created`,
      );

      return {
        success: true,
        contentId,
        chunksCreated,
        contentType: content.contentType,
        contentLength: content.content.length,
        repository: content.repository?.fullName,
        questionTitle: content.question?.title,
      };
    } catch (error) {
      // Update content with processing error
      await this.prismaService.content.update({
        where: { id: contentId },
        data: {
          processingError:
            error instanceof Error ? error.message : 'Unknown error',
        },
      });

      this.logger.error(
        `Content chunking failed for ${contentId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        error,
      );
      throw error;
    }
  }

  private createContentChunks(
    content: string,
    contentType: string,
    language: string,
    chunkSize: number,
    overlap: number,
  ): Array<{
    text: string;
    startPosition: number;
    endPosition: number;
  }> {
    // Apply different chunking strategies based on content type
    switch (contentType) {
      case 'STACKOVERFLOW_QUESTION':
      case 'STACKOVERFLOW_ANSWER':
        return this.chunkStackOverflowContent(content, chunkSize, overlap);
      case 'REPOSITORY_FILE':
        return this.chunkRepositoryFile(content, language, chunkSize, overlap);
      default:
        return this.chunkPlainText(content, chunkSize, overlap);
    }
  }

  private chunkStackOverflowContent(
    content: string,
    chunkSize: number,
    overlap: number,
  ): Array<{
    text: string;
    startPosition: number;
    endPosition: number;
  }> {
    const chunks: Array<{
      text: string;
      startPosition: number;
      endPosition: number;
    }> = [];

    // For StackOverflow content, try to preserve semantic structure
    // Split by code blocks and paragraphs for better context
    const sections = this.splitByCodeBlocks(content);
    let currentPosition = 0;

    for (const section of sections) {
      if (section.isCode) {
        // Keep code blocks together if possible
        if (section.content.length <= chunkSize) {
          chunks.push({
            text: section.content,
            startPosition: currentPosition,
            endPosition: currentPosition + section.content.length,
          });
        } else {
          // Split large code blocks by lines
          const codeChunks = this.chunkCodeBlock(
            section.content,
            chunkSize,
            overlap,
          );
          for (const codeChunk of codeChunks) {
            chunks.push({
              text: codeChunk.text,
              startPosition: currentPosition + codeChunk.startPosition,
              endPosition: currentPosition + codeChunk.endPosition,
            });
          }
        }
      } else {
        // Regular text - use paragraph-aware chunking
        const textChunks = this.chunkByParagraphs(
          section.content,
          chunkSize,
          overlap,
        );
        for (const textChunk of textChunks) {
          chunks.push({
            text: textChunk.text,
            startPosition: currentPosition + textChunk.startPosition,
            endPosition: currentPosition + textChunk.endPosition,
          });
        }
      }
      currentPosition += section.content.length;
    }

    return chunks.filter((chunk) => chunk.text.trim().length > 0);
  }

  private chunkRepositoryFile(
    content: string,
    language: string,
    chunkSize: number,
    overlap: number,
  ): Array<{
    text: string;
    startPosition: number;
    endPosition: number;
  }> {
    // AST-aware chunking for TypeScript / JavaScript / JSX / TSX. Emits
    // one chunk per top-level function / method / class plus module-scope
    // segments, so embeddings correspond to meaningful semantic units
    // and search results can point at a real function signature rather
    // than a fixed-size window that slices it in half.
    if (isAstSupportedLanguage(language)) {
      const astChunks = chunkByAst(content, language);
      if (astChunks.length > 0) {
        return astChunks.map((c) => ({
          text: c.text,
          startPosition: c.startChar,
          endPosition: c.endChar,
        }));
      }
      // Empty AST output (rare — empty source or no declarations)
      // falls through to the generic chunker below.
    }

    if (language === 'markdown') {
      return this.chunkMarkdown(content, chunkSize, overlap);
    }
    if (this.isCodeLanguage(language)) {
      return this.chunkCode(content, chunkSize, overlap);
    }
    return this.chunkPlainText(content, chunkSize, overlap);
  }

  private splitByCodeBlocks(content: string): Array<{
    content: string;
    isCode: boolean;
  }> {
    const sections: Array<{ content: string; isCode: boolean }> = [];

    // Simple regex to split by common code block patterns
    const codeBlockRegex =
      /(```[\s\S]*?```|<pre>[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>)/g;

    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        const textContent = content.substring(lastIndex, match.index);
        if (textContent.trim()) {
          sections.push({ content: textContent, isCode: false });
        }
      }

      // Add code block
      sections.push({ content: match[0], isCode: true });
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      const textContent = content.substring(lastIndex);
      if (textContent.trim()) {
        sections.push({ content: textContent, isCode: false });
      }
    }

    return sections;
  }

  private chunkCodeBlock(
    codeContent: string,
    chunkSize: number,
    overlap: number,
  ): Array<{
    text: string;
    startPosition: number;
    endPosition: number;
  }> {
    // For large code blocks, split by lines while maintaining context
    const lines = codeContent.split('\n');
    const chunks: Array<{
      text: string;
      startPosition: number;
      endPosition: number;
    }> = [];

    let currentChunk = '';
    let currentPosition = 0;
    let chunkStartPosition = 0;

    for (const line of lines) {
      const lineWithNewline = line + '\n';

      if (
        currentChunk.length + lineWithNewline.length > chunkSize &&
        currentChunk.length > 0
      ) {
        // Create chunk
        chunks.push({
          text: currentChunk.trim(),
          startPosition: chunkStartPosition,
          endPosition: currentPosition,
        });

        // Start new chunk with overlap
        const overlapLines = currentChunk
          .split('\n')
          .slice(-Math.ceil(overlap / 50));
        currentChunk = overlapLines.join('\n') + '\n' + lineWithNewline;
        chunkStartPosition = currentPosition - overlapLines.join('\n').length;
      } else {
        currentChunk += lineWithNewline;
      }

      currentPosition += lineWithNewline.length;
    }

    // Add final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        startPosition: chunkStartPosition,
        endPosition: currentPosition,
      });
    }

    return chunks;
  }

  private chunkByParagraphs(
    content: string,
    chunkSize: number,
    overlap: number,
  ): Array<{
    text: string;
    startPosition: number;
    endPosition: number;
  }> {
    const chunks: Array<{
      text: string;
      startPosition: number;
      endPosition: number;
    }> = [];

    const paragraphs = content.split(/\n\s*\n/);
    let currentChunk = '';
    let currentPosition = 0;
    let chunkStartPosition = 0;

    for (const paragraph of paragraphs) {
      const paragraphWithSpacing = paragraph + '\n\n';

      if (
        currentChunk.length + paragraphWithSpacing.length > chunkSize &&
        currentChunk.length > 0
      ) {
        // Create chunk
        chunks.push({
          text: currentChunk.trim(),
          startPosition: chunkStartPosition,
          endPosition: currentPosition,
        });

        // Start new chunk with potential overlap
        if (paragraph.length < overlap) {
          currentChunk = paragraph + '\n\n';
          chunkStartPosition = currentPosition;
        } else {
          currentChunk = paragraphWithSpacing;
          chunkStartPosition = currentPosition;
        }
      } else {
        currentChunk += paragraphWithSpacing;
      }

      currentPosition += paragraphWithSpacing.length;
    }

    // Add final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        startPosition: chunkStartPosition,
        endPosition: currentPosition,
      });
    }

    return chunks.filter((chunk) => chunk.text.length > 0);
  }

  // Reuse methods from GitHubProcessingWorker
  private chunkMarkdown(
    content: string,
    chunkSize: number,
    overlap: number,
  ): Array<{
    text: string;
    startPosition: number;
    endPosition: number;
  }> {
    const chunks: Array<{
      text: string;
      startPosition: number;
      endPosition: number;
    }> = [];
    const sections = content.split(/^#+\s/m);
    let currentPosition = 0;

    for (const section of sections) {
      const trimmedSection = section.trim();
      if (trimmedSection.length > 0) {
        if (trimmedSection.length <= chunkSize) {
          chunks.push({
            text: trimmedSection,
            startPosition: currentPosition,
            endPosition: currentPosition + trimmedSection.length,
          });
        } else {
          // Split large sections
          const subChunks = this.chunkPlainText(
            trimmedSection,
            chunkSize,
            overlap,
          );
          for (const subChunk of subChunks) {
            chunks.push({
              text: subChunk.text,
              startPosition: currentPosition + subChunk.startPosition,
              endPosition: currentPosition + subChunk.endPosition,
            });
          }
        }
        currentPosition += trimmedSection.length;
      }
    }

    return chunks.length > 0
      ? chunks
      : this.chunkPlainText(content, chunkSize, overlap);
  }

  private chunkCode(
    content: string,
    chunkSize: number,
    overlap: number,
  ): Array<{
    text: string;
    startPosition: number;
    endPosition: number;
  }> {
    return this.chunkCodeBlock(content, chunkSize, overlap);
  }

  private chunkPlainText(
    content: string,
    chunkSize: number,
    overlap: number,
  ): Array<{
    text: string;
    startPosition: number;
    endPosition: number;
  }> {
    const chunks: Array<{
      text: string;
      startPosition: number;
      endPosition: number;
    }> = [];

    let currentPosition = 0;

    while (currentPosition < content.length) {
      const endPosition = Math.min(currentPosition + chunkSize, content.length);
      let chunkText = content.substring(currentPosition, endPosition);

      // Try to break at word boundaries
      if (endPosition < content.length) {
        const lastSpaceIndex = chunkText.lastIndexOf(' ');
        if (lastSpaceIndex > chunkSize * 0.8) {
          chunkText = chunkText.substring(0, lastSpaceIndex);
        }
      }

      chunks.push({
        text: chunkText.trim(),
        startPosition: currentPosition,
        endPosition: currentPosition + chunkText.length,
      });

      currentPosition += chunkText.length - overlap;
      if (currentPosition <= 0) break;
    }

    return chunks.filter((chunk) => chunk.text.length > 0);
  }

  private isCodeLanguage(language: string): boolean {
    const codeLanguages = [
      'javascript',
      'typescript',
      'python',
      'java',
      'go',
      'rust',
      'c',
      'cpp',
      'csharp',
      'php',
      'ruby',
      'scala',
      'kotlin',
      'swift',
    ];
    return codeLanguages.includes(language.toLowerCase());
  }

  private generateContentHash(content: string): string {
    // Simple hash function for content deduplication
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private estimateTokenCount(text: string): number {
    // Rough estimate: ~4 characters per token for English text
    // This is approximate - for production you'd use tiktoken or similar
    return Math.ceil(text.length / 4);
  }
}

// BaseWorker + EmbeddingGenerationWorker were extracted into their own
// files so specs can import them without pulling in Octokit/Google SDKs
// via the sibling GitHub/StackOverflow workers. Re-export here keeps
// existing imports (workers.module.ts) working.
export { BaseWorker } from './worker.base';
export { EmbeddingGenerationWorker } from './embedding-generation.worker';
