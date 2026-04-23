import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueService, JobType } from '../services/queue.service';
import { PrismaService } from '../services/prisma.service';
import { BaseWorker } from './worker.base';
import { chunkByAst, isAstSupportedLanguage } from './code-chunker';

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
