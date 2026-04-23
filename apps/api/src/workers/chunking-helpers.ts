/**
 * Pure chunking helpers shared by ContentChunkingWorker +
 * GitHubProcessingWorker.
 *
 * Both workers used to carry their own copies of these — the audit
 * flagged them as identical-implementation duplicates (S4144). Lifting
 * them out kills ~150 lines of dead-weight duplication and means a
 * future bug fix (e.g. the `Math.max(1, ...)` advance fix that was
 * applied to both copies) only needs to land in one place.
 *
 * Everything here is intentionally framework-agnostic — no `this`,
 * no Nest decorators, no Prisma — so it's trivially unit-testable.
 */

export interface PositionedChunk {
  text: string;
  startPosition: number;
  endPosition: number;
}

const CODE_LANGUAGES = new Set([
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
]);

/**
 * Tier-1 language whitelist for the "is this a programming-language
 * file" check. Used to route content to the code chunker vs the
 * plain-text chunker.
 */
export function isCodeLanguage(language: string): boolean {
  return CODE_LANGUAGES.has(language.toLowerCase());
}

/**
 * Sliding-window plain-text chunker with word-boundary snapping.
 *
 * Always advances by at least one character per iteration even when
 * the trailing chunk happens to equal `overlap` in length — the
 * earlier `length - overlap` formula could produce 0-advance and hang
 * the worker indefinitely on certain inputs.
 */
export function chunkPlainText(
  content: string,
  chunkSize: number,
  overlap: number,
): PositionedChunk[] {
  const chunks: PositionedChunk[] = [];
  let currentPosition = 0;

  while (currentPosition < content.length) {
    const endPosition = Math.min(currentPosition + chunkSize, content.length);
    let chunkText = content.substring(currentPosition, endPosition);

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

    // If we've consumed the entire input, stop. This catches the case
    // where the last chunk is smaller than `overlap` — the old
    // `length - overlap` arithmetic would either go negative (caught
    // by an early-break upstream) or stay zero (infinite loop).
    if (currentPosition + chunkText.length >= content.length) break;

    // Always advance by at least one char as a final safety net for
    // pathological chunkText.length === overlap inputs in the middle
    // of the content.
    const advance = Math.max(1, chunkText.length - overlap);
    currentPosition += advance;
  }

  return chunks.filter((c) => c.text.length > 0);
}

/**
 * 32-bit FNV-ish hash for chunk deduplication. Not cryptographic —
 * collisions are fine; we only need distinctness for the unique
 * constraint on content_chunks.chunkHash. Replace with sha256 if /
 * when content needs an integrity guarantee.
 */
export function generateContentHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // force 32-bit int
  }
  return Math.abs(hash).toString(16);
}

/**
 * Rough token estimator (~4 chars per token for English / English-like
 * text). For exact counts use tiktoken or the model's tokenizer.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
