import { SearchQuery, SearchResult } from '@codesenseisearch/types';

// Text processing utilities
export function truncateText(text: string, maxLength: number = 200): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

export function highlightText(text: string, query: string): string {
  if (!query) return text;
  
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

export function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractCodeSnippet(content: string, query: string, contextLines: number = 3): string {
  const lines = content.split('\n');
  const queryRegex = new RegExp(escapeRegex(query), 'i');
  
  // Find lines containing the query
  const matchingLines: number[] = [];
  lines.forEach((line, index) => {
    if (queryRegex.test(line)) {
      matchingLines.push(index);
    }
  });
  
  if (matchingLines.length === 0) {
    return truncateText(content, 300);
  }
  
  // Get context around first match
  const firstMatch = matchingLines[0];
  const start = Math.max(0, firstMatch - contextLines);
  const end = Math.min(lines.length, firstMatch + contextLines + 1);
  
  return lines.slice(start, end).join('\n');
}

// Search utilities
export function buildSearchQuery(
  query: string,
  filters: SearchQuery['filters'] = {},
  pagination: { limit?: number; offset?: number } = {}
): SearchQuery {
  return {
    query: query.trim(),
    filters,
    limit: pagination.limit || 20,
    offset: pagination.offset || 0,
  };
}

export function calculateRelevanceScore(
  result: SearchResult,
  query: string
): number {
  let score = result.score;
  
  // Boost exact matches in title
  if (result.title.toLowerCase().includes(query.toLowerCase())) {
    score *= 1.5;
  }
  
  // Boost recent content
  const daysSinceUpdate = Math.floor(
    (Date.now() - new Date(result.metadata.timestamp).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSinceUpdate < 30) {
    score *= 1.2;
  } else if (daysSinceUpdate < 90) {
    score *= 1.1;
  }
  
  return Math.min(score, 1.0); // Cap at 1.0
}

// Validation utilities
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidGitHubUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'github.com' && parsed.pathname.split('/').length >= 3;
  } catch {
    return false;
  }
}

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
}

// Format utilities
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  
  return date.toLocaleDateString();
}

// Chunk text for embeddings
export function chunkText(
  text: string,
  maxTokens: number = 500,
  overlap: number = 50
): string[] {
  // Simple approximation: ~4 characters per token
  const maxChars = maxTokens * 4;
  const overlapChars = overlap * 4;
  
  if (text.length <= maxChars) {
    return [text];
  }
  
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + maxChars;
    
    // Try to break at word boundary
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end);
      if (lastSpace > start + maxChars * 0.8) {
        end = lastSpace;
      }
    }
    
    chunks.push(text.substring(start, end));
    start = end - overlapChars;
  }
  
  return chunks.filter(chunk => chunk.trim().length > 0);
}

// Error handling
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function createErrorResponse(error: Error | string, statusCode: number = 500) {
  return {
    success: false,
    error: typeof error === 'string' ? error : error.message,
    timestamp: new Date().toISOString(),
  };
}

// Debounce utility for search
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}