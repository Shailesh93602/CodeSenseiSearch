"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/code-block";
import { useSearch } from "@/lib/hooks/use-search";
import { Github, MessageSquare, BookOpen, Star, ExternalLink, Copy, User, Calendar, TrendingUp } from "lucide-react";

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

export function SearchResults({ query, filters }: SearchResultsProps) {
  const [selectedResult, setSelectedResult] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Convert filters to API format
  const apiFilters = {
    source: filters.source === "all" ? undefined : (filters.source as "github" | "stackoverflow" | "docs"),
    language: filters.language === "all" ? undefined : filters.language,
    sortBy: filters.sortBy as "relevance" | "date" | "stars" | "votes",
    dateRange: filters.dateRange === "all" ? undefined : (filters.dateRange as "week" | "month" | "year"),
    limit: 20,
  };

  const {
    results,
    loading,
    error,
    hasMore,
    totalResults,
    searchTime,
    search,
    loadMore,
    retry
  } = useSearch({
    initialQuery: query,
    initialFilters: apiFilters,
    searchType: 'hybrid', // Default to hybrid search
    autoSearch: false, // Manual search trigger
  });

  // Trigger search when query or filters change
  const filtersString = JSON.stringify(filters);
  useEffect(() => {
    if (query.trim()) {
      search();
    }
  }, [query, filtersString, search]);

  const copyCode = async (code: string, resultId: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(resultId);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case "github": return Github;
      case "stackoverflow": return MessageSquare;
      case "docs": return BookOpen;
      default: return Github;
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case "github": return "bg-gray-100 text-gray-700 hover:bg-gray-200";
      case "stackoverflow": return "bg-orange-100 text-orange-700 hover:bg-orange-200";
      case "docs": return "bg-blue-100 text-blue-700 hover:bg-blue-200";
      default: return "bg-gray-100 text-gray-700 hover:bg-gray-200";
    }
  };

  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty) {
      case "beginner": return "bg-green-100 text-green-700";
      case "intermediate": return "bg-yellow-100 text-yellow-700";
      case "advanced": return "bg-red-100 text-red-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  if (!query && Object.values(filters).every(v => v === "all" || v === "relevance")) {
    return (
      <div className="text-center py-12">
        <div className="text-slate-600 mb-4">Enter a search query to find code examples, solutions, and documentation</div>
        <div className="flex flex-wrap gap-2 justify-center">
          {["React hooks", "Python async", "JWT auth", "CSS Grid"].map((term) => (
            <Badge key={term} variant="outline" className="cursor-pointer hover:bg-slate-100">
              {term}
            </Badge>
          ))}
        </div>
      </div>
    );
  }

  // Show loading state
  if (loading && results.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <div className="text-slate-600">Searching for &ldquo;{query}&rdquo;...</div>
      </div>
    );
  }

  // Show error state
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

  // Show no results state
  if (!loading && results.length === 0 && query) {
    return (
      <div className="text-center py-12">
        <div className="text-slate-600 mb-4">No results found for &ldquo;{query}&rdquo;</div>
        <div className="text-sm text-slate-500">Try different keywords or check your spelling</div>
      </div>
    );
  }

  return (
    <div>
      {/* Results Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {totalResults} results {query && `for "${query}"`}
            {searchTime > 0 && (
              <span className="text-sm text-slate-500 ml-2">
                ({searchTime}ms)
              </span>
            )}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Showing results from {filters.source === "all" ? "all sources" : filters.source}
            {filters.language !== "all" && ` • ${filters.language}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Sort by:</span>
          <Badge variant="secondary" className="capitalize">{filters.sortBy}</Badge>
        </div>
      </div>

      {/* Results List */}
      <div className="space-y-6">
        {results.map((result) => {
          const SourceIcon = getSourceIcon(result.source);
          const isExpanded = selectedResult === result.id;
          const isCopied = copiedCode === result.id;
          
          return (
            <Card key={result.id} className="p-6 hover:shadow-lg transition-all duration-200 border-l-4 border-l-blue-500">
              {/* Header Section */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="secondary" className={getSourceColor(result.source)}>
                    <SourceIcon className="h-3 w-3 mr-1" />
                    {result.source}
                  </Badge>
                  {result.language && (
                    <Badge variant="outline" className="font-mono text-xs">
                      {result.language}
                    </Badge>
                  )}
                  {result.difficulty && (
                    <Badge variant="secondary" className={getDifficultyColor(result.difficulty)}>
                      {result.difficulty}
                    </Badge>
                  )}
                  {result.stars && (
                    <div className="flex items-center gap-1 text-sm text-slate-600">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      {result.stars.toLocaleString()}
                    </div>
                  )}
                  {result.votes && (
                    <div className="flex items-center gap-1 text-sm text-slate-600">
                      <TrendingUp className="h-3 w-3" />
                      {result.votes} votes
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Calendar className="h-3 w-3" />
                  {result.updatedAt}
                </div>
              </div>

              {/* Title */}
              <h3 className="text-lg font-semibold text-slate-900 mb-2 hover:text-blue-600 cursor-pointer">
                <a href={result.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2">
                  {result.title}
                  <ExternalLink className="h-4 w-4 mt-1 shrink-0" />
                </a>
              </h3>

              {/* Description */}
              <p className="text-slate-600 mb-4 leading-relaxed">{result.description}</p>

              {/* Author & Metadata */}
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                  {result.avatar ? (
                    <img 
                      src={result.avatar} 
                      alt={result.author}
                      className="w-6 h-6 rounded-full"
                    />
                  ) : (
                    <User className="h-4 w-4 text-slate-400" />
                  )}
                  <span className="text-sm font-medium text-slate-700">{result.author}</span>
                </div>
                {result.views && (
                  <span className="text-sm text-slate-500">
                    {result.views.toLocaleString()} views
                  </span>
                )}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-4">
                {result.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs hover:bg-slate-100 cursor-pointer">
                    #{tag}
                  </Badge>
                ))}
              </div>

              {/* Code Preview */}
              {result.code && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between bg-slate-50 px-4 py-2 border-b">
                    <span className="text-sm font-medium text-slate-700">Code Preview</span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyCode(result.code!, result.id)}
                        className="h-8 text-xs"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        {isCopied ? "Copied!" : "Copy"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedResult(isExpanded ? null : result.id)}
                        className="h-8 text-xs"
                      >
                        {isExpanded ? "Collapse" : "Expand"}
                      </Button>
                    </div>
                  </div>
                  <div className={`transition-all duration-300 ${isExpanded ? "" : "max-h-64 overflow-hidden"}`}>
                    <CodeBlock 
                      code={result.code} 
                      language={result.language || "javascript"}
                    />
                  </div>
                  {!isExpanded && result.code.split('\n').length > 12 && (
                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-slate-900 to-transparent pointer-events-none" />
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="text-center mt-8">
          <Button 
            variant="outline" 
            size="lg" 
            className="px-8"
            onClick={loadMore}
            disabled={loading}
          >
            {loading ? "Loading..." : "Load more results"}
          </Button>
        </div>
      )}
    </div>
  );
}