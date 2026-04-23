import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueService, JobType } from '../services/queue.service';
import { GitHubApiService } from '../services/github-api.service';
import { PrismaService } from '../services/prisma.service';
import { BaseWorker } from './worker.base';
import {
  chunkPlainText,
  generateContentHash,
  isCodeLanguage,
} from './chunking-helpers';

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
          contentHash: generateContentHash(content),
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
              chunkHash: generateContentHash(chunk.text),
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

  // generateContentHash now lives in ./chunking-helpers and is used
  // via the named import at the top of this file.

  private createContentChunks(
    content: string,
    fileName: string,
    language: string,
  ): Array<{
    text: string;
    startPosition: number;
    endPosition: number;
  }> {
    // Hard-coded chunk sizes used by the legacy GitHub-processing path.
    // ContentChunkingWorker is the modern caller and passes these
    // explicitly; this worker is kept for the file-discovery → first-pass
    // chunking flow before the AST chunker re-processes code files.
    const CHUNK_SIZE = 1000;
    const OVERLAP = 100;

    if (language === 'markdown') {
      return this.chunkMarkdown(content);
    }
    if (isCodeLanguage(language)) {
      return this.chunkCode(content);
    }
    return chunkPlainText(content, CHUNK_SIZE, OVERLAP);
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

    return chunks.length > 0 ? chunks : chunkPlainText(content, 1000, 100);
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

  // chunkPlainText + isCodeLanguage moved to ./chunking-helpers and
  // imported at the top of this file. (chunkMarkdown + chunkCode stay
  // here because their signatures and bodies differ from the
  // ContentChunkingWorker versions — section-split-only and
  // line-aware-no-overlap, respectively.)
}
