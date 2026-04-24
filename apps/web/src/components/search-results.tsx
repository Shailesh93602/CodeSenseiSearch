"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSearch } from "@/lib/hooks/use-search";
import {
  Code2,
  MessageSquare,
  BookOpen,
  Copy,
  Check,
  AlertTriangle,
  SearchX,
  Filter,
} from "lucide-react";
import type { Filters } from "@/components/search-filters";
import { cn } from "@/lib/utils";

interface SearchResultsProps {
  query: string;
  filters: Filters;
}

interface ChunkResult {
  id: string;
  content: string;
  similarity?: number;
  score?: number;
  metadata?: {
    source?: string;
    chunkIndex?: number;
    language?: string;
    title?: string | null;
    owner?: string | null;
  };
}

const EXAMPLE_QUERIES = [
  "useEffect cleanup",
  "async await vs promises",
  "pgvector HNSW",
  "JWT refresh token rotation",
];

function parseChunk(raw: ChunkResult): { title: string; body: string } {
  const text = raw.content ?? "";
  const split = text.indexOf("\n\n");
  if (split === -1) return { title: text.slice(0, 120), body: "" };
  return {
    title: text.slice(0, split).trim() || "Untitled chunk",
    body: text.slice(split + 2).trim(),
  };
}

function getSourceInfo(source?: string): {
  label: string;
  Icon: typeof Code2;
  /** Token-based color so dark mode works automatically. */
  className: string;
} {
  switch (source) {
    case "repository":
    case "REPOSITORY_FILE":
      return {
        label: "GitHub",
        Icon: Code2,
        className:
          "bg-secondary text-secondary-foreground border-border",
      };
    case "question":
    case "STACKOVERFLOW_QUESTION":
    case "STACKOVERFLOW_ANSWER":
      return {
        label: "Stack Overflow",
        Icon: MessageSquare,
        className:
          "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-900",
      };
    case "documentation":
    case "DOCUMENTATION_PAGE":
    case "BLOG_POST":
    default:
      return {
        label: "Documentation",
        Icon: BookOpen,
        className:
          "bg-primary/10 text-primary border-primary/20 dark:bg-primary/15 dark:text-primary",
      };
  }
}

/**
 * Highlight occurrences of any query term inside the body. Splits on
 * each token (>= 2 chars), wraps matches with `<mark.search-mark>`.
 * Case-insensitive. Escapes regex special chars in the query so a
 * paste like `(useState` doesn't crash the regex compiler.
 */
function highlightMatches(body: string, query: string): React.ReactNode {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$1"))
    .filter((t) => t.length >= 2);

  if (tokens.length === 0) return body;

  const pattern = new RegExp(`(${tokens.join("|")})`, "gi");
  const parts = body.split(pattern);
  return parts.map((part, i) =>
    pattern.test(part) ? (
      <mark key={i} className="search-mark">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function SearchResults({ query, filters }: SearchResultsProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const apiFilters = useMemo(
    () => ({
      source:
        filters.source === "all"
          ? undefined
          : (filters.source as "github" | "stackoverflow" | "docs"),
      language: filters.language === "all" ? undefined : filters.language,
      sortBy: filters.sortBy as "relevance" | "date" | "stars" | "votes",
      dateRange:
        filters.dateRange === "all"
          ? undefined
          : (filters.dateRange as "week" | "month" | "year"),
      limit: 20,
    }),
    [filters],
  );

  const {
    results: rawResults,
    loading,
    error,
    totalResults,
    searchTime,
    search,
    retry,
  } = useSearch({
    initialQuery: query,
    initialFilters: apiFilters,
    searchType: "hybrid",
    autoSearch: false,
  });

  const results = (rawResults as unknown as ChunkResult[]) ?? [];

  const filtersString = JSON.stringify(filters);
  useEffect(() => {
    if (query.trim()) search();
  }, [query, filtersString, search]);

  const copyChunk = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch (err) {
      console.error("Clipboard write failed:", err);
    }
  };

  // ----- Empty (no query yet) -----
  if (!query.trim()) {
    return (
      <EmptyState
        Icon={SearchX}
        heading="Search the corpus"
        body="Ask a question in plain English. The hybrid retrieval engine returns the closest matches from the indexed snippets."
        cta={
          <ExampleQueries
            onPick={(q) => {
              const url = new URL(window.location.href);
              url.searchParams.set("q", q);
              window.location.href = url.pathname + url.search;
            }}
          />
        }
      />
    );
  }

  // ----- Loading (skeleton matches the shape of result cards) -----
  if (loading && results.length === 0) {
    return (
      <div>
        <div className="mb-5 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Searching for</span>
          <span className="text-sm font-medium">&ldquo;{query}&rdquo;</span>
        </div>
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          {[0, 1, 2].map((i) => (
            <ResultSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // ----- Error -----
  if (error) {
    return (
      <EmptyState
        Icon={AlertTriangle}
        heading="Search failed"
        body={error}
        cta={
          <Button onClick={retry} variant="outline">
            Try again
          </Button>
        }
        tone="error"
      />
    );
  }

  // ----- No results for this query -----
  if (!loading && results.length === 0 && query) {
    // Branch the empty state based on WHY there are no results. If a
    // filter is active, the user almost certainly excluded everything
    // — tell them so and give a one-click escape. Without a filter,
    // the corpus simply doesn't cover this query.
    const filterIsActive =
      filters.source !== "all" ||
      filters.language !== "all" ||
      filters.dateRange !== "all";

    if (filterIsActive) {
      const filterSummary = describeActiveFilter(filters);
      return (
        <EmptyState
          Icon={Filter}
          heading={`No ${filterSummary} matches for "${query}"`}
          body={
            filters.source === "github"
              ? "The seeded demo corpus is owner-authored documentation, not GitHub repositories. Try removing the source filter or pick a Documentation match."
              : filters.source === "stackoverflow"
                ? "The seeded demo corpus has no Stack Overflow content yet. Remove the source filter to see what's indexed."
                : "Loosen one of the filters to see what the corpus does cover."
          }
          cta={
            <button
              type="button"
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.delete("source");
                url.searchParams.delete("language");
                url.searchParams.delete("dateRange");
                window.location.href = url.pathname + url.search;
              }}
              className="inline-flex items-center rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Clear filters
            </button>
          }
        />
      );
    }

    return (
      <EmptyState
        Icon={SearchX}
        heading={`No results for "${query}"`}
        body="The seeded demo corpus is small (15 hand-curated entries). Try one of the topics it covers:"
        cta={
          <ExampleQueries
            onPick={(q) => {
              const url = new URL(window.location.href);
              url.searchParams.set("q", q);
              window.location.href = url.pathname + url.search;
            }}
          />
        }
      />
    );
  }

  // ----- Results -----
  return (
    <div>
      <div className="mb-5 flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-foreground">
          {totalResults} {totalResults === 1 ? "result" : "results"}
          {query && (
            <span className="ml-1 font-normal text-muted-foreground">
              for &ldquo;{query}&rdquo;
            </span>
          )}
        </h2>
        {searchTime > 0 && (
          <span className="text-xs font-mono text-muted-foreground">
            {searchTime}ms
          </span>
        )}
      </div>

      <div className="space-y-4">
        {results.map((raw) => {
          const { title, body } = parseChunk(raw);
          const meta = raw.metadata ?? {};
          const source = getSourceInfo(meta.source);
          const isCopied = copiedId === raw.id;
          const fullText = `${title}\n\n${body}`;

          return (
            <Card
              key={raw.id}
              className="group p-5 sm:p-6 bg-card text-card-foreground border-border hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                <Badge
                  variant="outline"
                  className={cn("font-medium", source.className)}
                >
                  <source.Icon className="h-3 w-3 mr-1" />
                  {source.label}
                </Badge>
                {meta.language && (
                  <Badge variant="outline" className="font-mono text-xs">
                    {meta.language}
                  </Badge>
                )}
                {typeof raw.similarity === "number" && (
                  <Badge
                    variant="outline"
                    className="font-mono text-xs text-muted-foreground"
                    title="Cosine similarity to the query embedding"
                  >
                    sim {raw.similarity.toFixed(2)}
                  </Badge>
                )}
                {typeof raw.score === "number" && (
                  <Badge
                    variant="outline"
                    className="font-mono text-xs text-muted-foreground"
                    title="Hybrid score (vector + text reranked)"
                  >
                    score {raw.score.toFixed(2)}
                  </Badge>
                )}
              </div>

              <h3 className="text-lg font-semibold leading-snug mb-3">
                {highlightMatches(title, query)}
              </h3>

              {body && (
                <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono bg-muted/40 border border-border rounded-md p-4 overflow-x-auto max-h-[28rem] overflow-y-auto">
                  {highlightMatches(body, query)}
                </div>
              )}

              <div className="mt-3 flex items-center justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => copyChunk(fullText, raw.id)}
                >
                  {isCopied ? (
                    <>
                      <Check className="h-3 w-3 mr-1" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** Short human label for whichever filter is the most "informative." */
function describeActiveFilter(f: Filters): string {
  if (f.source === "github") return "GitHub";
  if (f.source === "stackoverflow") return "Stack Overflow";
  if (f.source === "docs") return "Documentation";
  if (f.language !== "all") return f.language;
  if (f.dateRange !== "all") return `${f.dateRange}-recent`;
  return "filtered";
}

function ResultSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-5 sm:p-6">
      <div className="flex gap-2 mb-4">
        <div className="h-5 w-24 rounded skeleton-shimmer bg-muted" />
        <div className="h-5 w-16 rounded skeleton-shimmer bg-muted" />
      </div>
      <div className="h-6 w-3/4 rounded skeleton-shimmer bg-muted mb-3" />
      <div className="h-32 w-full rounded skeleton-shimmer bg-muted" />
    </div>
  );
}

function EmptyState({
  Icon,
  heading,
  body,
  cta,
  tone = "neutral",
}: {
  Icon: typeof SearchX;
  heading: string;
  body: string;
  cta?: React.ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed p-10 text-center",
        tone === "error"
          ? "border-destructive/40 bg-destructive/5"
          : "border-border bg-muted/30",
      )}
    >
      <div
        className={cn(
          "mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full",
          tone === "error"
            ? "bg-destructive/10 text-destructive"
            : "bg-secondary text-muted-foreground",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <h2 className="text-base font-semibold text-foreground mb-1">{heading}</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
        {body}
      </p>
      {cta}
    </div>
  );
}

function ExampleQueries({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {EXAMPLE_QUERIES.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onPick(q)}
          className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
        >
          {q}
        </button>
      ))}
    </div>
  );
}
