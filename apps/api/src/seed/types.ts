/**
 * Shared shape every seed batch must conform to. Lives in its own
 * module so each batch file can import the type without dragging in
 * the existing batch arrays.
 */

export type SeedContentType =
  | 'REPOSITORY_FILE'
  | 'STACKOVERFLOW_QUESTION'
  | 'STACKOVERFLOW_ANSWER'
  | 'DOCUMENTATION_PAGE'
  | 'BLOG_POST';

export interface SeedItem {
  /** Short, human-readable headline. Used as the result-card title. */
  title: string;
  /** 200–600 word body. Embedded as one chunk. */
  body: string;
  /** Drives the `source` badge in the FE. */
  contentType: SeedContentType;
  /** Programming language for the language facet. */
  language?: string;
  /** Tags / keywords (used downstream when we wire faceted filters). */
  tags?: string[];
  /** Canonical URL for the source — must resolve. */
  url: string;
  /**
   * For REPOSITORY_FILE entries: the GitHub repo slug. The seed
   * upserts a Repository row with this owner/name pair so the
   * source filter has a real FK to match against.
   */
  repository?: { owner: string; name: string };
  /** For REPOSITORY_FILE entries: relative path inside the repo. */
  filePath?: string;
  /** For STACKOVERFLOW_* entries: the SO question id. */
  questionId?: number;
  /** For STACKOVERFLOW_* entries: the score (votes). */
  score?: number;
  /** For STACKOVERFLOW_QUESTION: whether the question is marked answered. */
  isAnswered?: boolean;
  /** For STACKOVERFLOW_ANSWER: whether this answer is the accepted one. */
  isAccepted?: boolean;
}
