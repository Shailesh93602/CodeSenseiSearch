import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// StackOverflow API Response Types
export interface StackOverflowQuestion {
  question_id: number;
  title: string;
  body: string;
  tags: string[];
  score: number;
  view_count: number;
  answer_count: number;
  creation_date: number;
  last_activity_date: number;
  owner: {
    user_id: number;
    display_name: string;
    reputation: number;
  };
  is_answered: boolean;
  accepted_answer_id?: number;
  link: string;
}

export interface StackOverflowAnswer {
  answer_id: number;
  question_id: number;
  body: string;
  score: number;
  creation_date: number;
  last_activity_date: number;
  owner: {
    user_id: number;
    display_name: string;
    reputation: number;
  };
  is_accepted: boolean;
}

export interface StackOverflowSearchOptions {
  tags?: string[];
  sort?: 'relevance' | 'activity' | 'votes' | 'creation';
  order?: 'asc' | 'desc';
  pagesize?: number;
  page?: number;
  minScore?: number;
  fromDate?: Date;
  toDate?: Date;
}

export interface StackOverflowApiResponse<T> {
  items: T[];
  has_more: boolean;
  quota_max: number;
  quota_remaining: number;
  total: number;
  page: number;
  pagesize: number;
}

@Injectable()
export class StackOverflowApiService {
  private readonly logger = new Logger(StackOverflowApiService.name);
  private readonly baseUrl = 'https://api.stackexchange.com/2.3';
  private readonly site = 'stackoverflow';
  private readonly maxRetries = 3;
  private readonly requestDelay = 100; // 100ms between requests to avoid rate limiting

  constructor(private readonly configService: ConfigService) {}

  /**
   * Search for questions by tags and criteria
   */
  async searchQuestions(
    options: StackOverflowSearchOptions = {},
  ): Promise<StackOverflowApiResponse<StackOverflowQuestion>> {
    const {
      tags = [],
      sort = 'votes',
      order = 'desc',
      pagesize = 50,
      page = 1,
      minScore = 5,
      fromDate,
      toDate,
    } = options;

    this.logger.log(
      `Searching questions: tags=${tags.join(',')} sort=${sort} page=${page}`,
    );

    const params = new URLSearchParams({
      site: this.site,
      sort,
      order,
      pagesize: pagesize.toString(),
      page: page.toString(),
      filter: 'withbody', // Include question body
    });

    if (tags.length > 0) {
      params.append('tagged', tags.join(';'));
    }

    if (minScore > 0) {
      params.append('min', minScore.toString());
    }

    if (fromDate) {
      params.append(
        'fromdate',
        Math.floor(fromDate.getTime() / 1000).toString(),
      );
    }

    if (toDate) {
      params.append('todate', Math.floor(toDate.getTime() / 1000).toString());
    }

    const url = `${this.baseUrl}/questions?${params.toString()}`;

    try {
      const response = await this.makeApiRequest<StackOverflowQuestion>(url);

      this.logger.log(
        `Found ${response.items.length} questions (quota: ${response.quota_remaining}/${response.quota_max})`,
      );

      return response;
    } catch (error) {
      this.logger.error(
        `Failed to search questions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get detailed question with answers
   */
  async getQuestionWithAnswers(questionId: number): Promise<{
    question: StackOverflowQuestion;
    answers: StackOverflowAnswer[];
  }> {
    this.logger.log(`Fetching question ${questionId} with answers`);

    try {
      // Get question details
      const questionUrl = `${this.baseUrl}/questions/${questionId}?site=${this.site}&filter=withbody`;
      const questionResponse =
        await this.makeApiRequest<StackOverflowQuestion>(questionUrl);

      if (questionResponse.items.length === 0) {
        throw new Error(`Question ${questionId} not found`);
      }

      const question = questionResponse.items[0];

      // Get answers if the question has any
      let answers: StackOverflowAnswer[] = [];
      if (question.answer_count > 0) {
        const answersUrl = `${this.baseUrl}/questions/${questionId}/answers?site=${this.site}&filter=withbody&sort=votes&order=desc`;
        const answersResponse =
          await this.makeApiRequest<StackOverflowAnswer>(answersUrl);
        answers = answersResponse.items;
      }

      this.logger.log(
        `Retrieved question ${questionId} with ${answers.length} answers`,
      );

      return { question, answers };
    } catch (error) {
      this.logger.error(
        `Failed to fetch question ${questionId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get popular questions for specific tags
   */
  async getPopularQuestionsByTags(
    tags: string[],
    minScore: number = 10,
    maxResults: number = 100,
  ): Promise<StackOverflowQuestion[]> {
    this.logger.log(
      `Fetching popular questions for tags: ${tags.join(', ')} (minScore: ${minScore})`,
    );

    const allQuestions: StackOverflowQuestion[] = [];
    const pageSize = 100;
    let page = 1;
    let hasMore = true;

    while (hasMore && allQuestions.length < maxResults) {
      try {
        const response = await this.searchQuestions({
          tags,
          sort: 'votes',
          order: 'desc',
          pagesize: pageSize,
          page,
          minScore,
        });

        allQuestions.push(...response.items);
        hasMore = response.has_more && allQuestions.length < maxResults;
        page++;

        // Respect rate limits
        if (hasMore) {
          await this.delay(this.requestDelay);
        }

        // Check quota
        if (response.quota_remaining < 100) {
          this.logger.warn(
            `StackOverflow API quota running low: ${response.quota_remaining} remaining`,
          );
          break;
        }
      } catch (error) {
        this.logger.error(
          `Error fetching page ${page}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        break;
      }
    }

    return allQuestions.slice(0, maxResults);
  }

  /**
   * Check API quota status
   */
  async checkQuotaStatus(): Promise<{
    remaining: number;
    max: number;
    percentage: number;
  }> {
    try {
      const url = `${this.baseUrl}/info?site=${this.site}`;
      const response = await this.makeApiRequest(url);

      return {
        remaining: response.quota_remaining,
        max: response.quota_max,
        percentage: (response.quota_remaining / response.quota_max) * 100,
      };
    } catch (error) {
      this.logger.error(
        `Failed to check quota status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Extract code blocks from StackOverflow content
   */
  extractCodeBlocks(htmlContent: string): Array<{
    language?: string;
    code: string;
  }> {
    const codeBlocks: Array<{ language?: string; code: string }> = [];

    // Extract <code> blocks (inline and block)
    const codeRegex =
      /<code(?:\s+class="lang-(\w+)")?[^>]*>([\s\S]*?)<\/code>/gi;
    let match;

    while ((match = codeRegex.exec(htmlContent)) !== null) {
      const language = match[1] || undefined;
      const code = match[2]
        ?.replace(/&lt;/g, '<')
        ?.replace(/&gt;/g, '>')
        ?.replace(/&amp;/g, '&')
        ?.replace(/&quot;/g, '"')
        ?.trim();

      if (code && code.length > 10) {
        // Only include substantial code blocks
        codeBlocks.push({ language: language as string, code: code as string });
      }
    }

    return codeBlocks;
  }

  /**
   * Clean HTML content and extract plain text
   */
  cleanHtmlContent(htmlContent: string): string {
    return htmlContent
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Make API request with retry logic
   */
  private async makeApiRequest<T>(
    url: string,
  ): Promise<StackOverflowApiResponse<T>> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.debug(`API request attempt ${attempt}: ${url}`);

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'CodeSenseiSearch/1.0 (Content Indexing Service)',
          },
        });

        if (!response.ok) {
          if (response.status === 429) {
            // Rate limited
            const retryAfter = response.headers.get('retry-after');
            const delayMs = retryAfter ? parseInt(retryAfter) * 1000 : 60000;

            this.logger.warn(
              `Rate limited, retrying in ${delayMs}ms (attempt ${attempt}/${this.maxRetries})`,
            );

            if (attempt < this.maxRetries) {
              await this.delay(delayMs);
              continue;
            }
          }

          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Check for API errors
        if (data.error_id) {
          throw new Error(`StackOverflow API Error: ${data.error_message}`);
        }

        return data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt < this.maxRetries) {
          const delayMs = Math.pow(2, attempt) * 1000; // Exponential backoff
          this.logger.warn(
            `Request failed, retrying in ${delayMs}ms (attempt ${attempt}/${this.maxRetries}): ${lastError.message}`,
          );
          await this.delay(delayMs);
        }
      }
    }

    throw lastError!;
  }

  /**
   * Delay helper for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
