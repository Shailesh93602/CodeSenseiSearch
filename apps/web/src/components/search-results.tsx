"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSearch } from "@/lib/hooks/use-search";
import { Github, MessageSquare, BookOpen, Copy, Check } from "lucide-react";

interface Filters {
  source: string;
  language: string;
  sortBy: string;
  dateRange: string;
}

interface SearchResultsProps {
  query: string;
  filters: Filters;
}

/**
 * The deployed API returns chunks (cmobr2uys..., content, similarity,
 * metadata). The shape DOES NOT match the rich Stack Overflow / GitHub
 * mock objects this component used to consume — it has no stars,
 * tags, code field, author, etc. So we render exactly what's there:
 * a title (parsed from the chunk's first line), the body content, the
 * similarity score, and source/language badges.
 *
 * The TypeScript types in lib/api-client.ts still describe the old
 * mock shape; we tolerate that mismatch with a single cast at the
 * useSearch boundary instead of refactoring every type that depends
 * on SearchResult.
 */
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

function parseChunk(raw: ChunkResult): { title: string; body: string } {
  // Items the seed inserted are stored as `${title}\n\n${body}`. Split
  // on the first blank line so the title shows once at the top instead
  // of being repeated inside the body block.
  const text = raw.content ?? "";
  const split = text.indexOf("\n\n");
  if (split === -1) return { title: text.slice(0, 120), body: "" };
  return {
    title: text.slice(0, split).trim() || "Untitled chunk",
    body: text.slice(split + 2).trim(),
  };
}

function getSourceLabel(source?: string): {
  label: string;
  Icon: typeof Github;
  className: string;
} {
  switch (source) {
    case "repository":
      return {
        label: "GitHub",
        Icon: Github,
        className: "bg-slate-100 text-slate-700",
      };
    case "question":
      return {
        label: "Stack Overflow",
        Icon: MessageSquare,
        className: "bg-orange-100 text-orange-700",
      };
    default:
      return {
        label: "Documentation",
        Icon: BookOpen,
        className: "bg-blue-100 text-blue-700",
      };
  }
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
    if (query.trim()) {
      search();
    }
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

  if (
    !query &&
    Object.values(filters).every((v) => v === "all" || v === "relevance")
  ) {
    return (
      <div className="text-center py-12">
        <div className="text-slate-600">
          Enter a search query to find code, snippets, and documentation
          across the indexed corpus.
        </div>
      </div>
    );
  }

  if (loading && results.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
        <div className="text-slate-600">
          Searching for &ldquo;{query}&rdquo;…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">Search failed: {error}</div>
        <Button onClick={retry} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  if (!loading && results.length === 0 && query) {
    return (
      <div className="text-center py-12">
        <div className="text-slate-600 mb-2">
          No results for &ldquo;{query}&rdquo;
        </div>
        <div className="text-sm text-slate-500">
          The seeded corpus is small — try one of the example queries on the
          home page, or check &nbsp;
          <a href="/docs" className="text-blue-600 hover:underline">
            /docs
          </a>{" "}
          for what&apos;s indexed.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">
          {totalResults} {totalResults === 1 ? "result" : "results"}
          {query && (
            <span className="text-slate-500"> for &ldquo;{query}&rdquo;</span>
          )}
          {searchTime > 0 && (
            <span className="text-sm text-slate-500 ml-2">
              ({searchTime}ms)
            </span>
          )}
        </h2>
      </div>

      <div className="space-y-5">
        {results.map((raw) => {
          const { title, body } = parseChunk(raw);
          const meta = raw.metadata ?? {};
          const sourceInfo = getSourceLabel(meta.source);
          const isCopied = copiedId === raw.id;
          const fullText = `${title}\n\n${body}`;

          return (
            <Card
              key={raw.id}
              className="p-6 hover:shadow-md transition-shadow border-l-4 border-l-blue-500"
            >
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge
                  variant="secondary"
                  className={sourceInfo.className}
                >
                  <sourceInfo.Icon className="h-3 w-3 mr-1" />
                  {sourceInfo.label}
                </Badge>
                {meta.language && (
                  <Badge variant="outline" className="font-mono text-xs">
                    {meta.language}
                  </Badge>
                )}
                {typeof raw.similarity === "number" && (
                  <Badge variant="outline" className="font-mono text-xs">
                    similarity {raw.similarity.toFixed(3)}
                  </Badge>
                )}
                {typeof raw.score === "number" && (
                  <Badge variant="outline" className="font-mono text-xs">
                    score {raw.score.toFixed(3)}
                  </Badge>
                )}
              </div>

              <h3 className="text-lg font-semibold text-slate-900 mb-3 leading-snug">
                {title}
              </h3>

              {body && (
                <pre className="whitespace-pre-wrap break-words text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-md p-4 overflow-x-auto leading-relaxed font-mono">
                  {body}
                </pre>
              )}

              <div className="mt-3 flex items-center justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
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
