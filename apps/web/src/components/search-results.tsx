"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Github, MessageSquare, BookOpen, Star, ExternalLink, Copy, Eye } from "lucide-react";

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

interface SearchResult {
  id: string;
  title: string;
  description: string;
  source: "github" | "stackoverflow" | "docs";
  language?: string;
  url: string;
  author: string;
  stars?: number;
  updatedAt: string;
  code?: string;
  tags: string[];
}

export function SearchResults({ query, filters }: SearchResultsProps) {
  const [selectedResult, setSelectedResult] = useState<string | null>(null);

  // Mock search results
  const mockResults: SearchResult[] = [
    {
      id: "1",
      title: "React useEffect Hook - Complete Guide with Examples",
      description: "Learn how to use the useEffect hook in React for side effects, data fetching, and cleanup. Includes advanced patterns and best practices.",
      source: "github",
      language: "javascript",
      url: "https://github.com/facebook/react",
      author: "facebook",
      stars: 220000,
      updatedAt: "2 days ago",
      code: `useEffect(() => {
  const fetchData = async () => {
    const response = await fetch('/api/data');
    const result = await response.json();
    setData(result);
  };
  
  fetchData();
  
  return () => {
    // Cleanup
  };
}, []);`,
      tags: ["react", "hooks", "useEffect", "javascript"]
    },
    {
      id: "2", 
      title: "How to properly cleanup useEffect in React?",
      description: "When using useEffect with async operations, it's important to handle cleanup properly to avoid memory leaks and race conditions.",
      source: "stackoverflow",
      language: "javascript",
      url: "https://stackoverflow.com/questions/useeffect-cleanup",
      author: "john_doe",
      updatedAt: "1 week ago",
      code: `useEffect(() => {
  let cancelled = false;
  
  async function fetchData() {
    const result = await api.getData();
    if (!cancelled) {
      setData(result);
    }
  }
  
  fetchData();
  
  return () => {
    cancelled = true;
  };
}, []);`,
      tags: ["react", "useEffect", "cleanup", "memory-leaks"]
    },
    {
      id: "3",
      title: "Python Async/Await - Modern Concurrency Guide",
      description: "Complete guide to asynchronous programming in Python using async/await syntax. Covers asyncio, aiohttp, and common patterns.",
      source: "docs",
      language: "python",
      url: "https://docs.python.org/3/library/asyncio.html",
      author: "Python Software Foundation",
      updatedAt: "3 days ago",
      code: `import asyncio
import aiohttp

async def fetch_data(session, url):
    async with session.get(url) as response:
        return await response.json()

async def main():
    async with aiohttp.ClientSession() as session:
        tasks = [
            fetch_data(session, f'https://api.example.com/data/{i}')
            for i in range(10)
        ]
        results = await asyncio.gather(*tasks)
        return results

# Run the async function
results = asyncio.run(main())`,
      tags: ["python", "async", "await", "asyncio", "concurrency"]
    }
  ];

  // Filter results based on current filters
  const filteredResults = mockResults.filter(result => {
    if (filters.source !== "all" && result.source !== filters.source) return false;
    if (filters.language !== "all" && result.language !== filters.language) return false;
    if (query && !result.title.toLowerCase().includes(query.toLowerCase()) && 
        !result.description.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
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
      case "github": return "bg-gray-100 text-gray-700";
      case "stackoverflow": return "bg-orange-100 text-orange-700";
      case "docs": return "bg-blue-100 text-blue-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  if (!query && Object.values(filters).every(v => v === "all" || v === "relevance")) {
    return (
      <div className="text-center py-12">
        <div className="text-slate-400 mb-4">
          <Eye className="h-12 w-12 mx-auto mb-4" />
        </div>
        <h3 className="text-lg font-medium text-slate-900 mb-2">Start searching</h3>
        <p className="text-slate-600">
          Enter a search query to find code, solutions, and documentation.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Results Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {filteredResults.length} results {query && `for "${query}"`}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Showing results from {filters.source === "all" ? "all sources" : filters.source}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Sort by:</span>
          <Badge variant="secondary">{filters.sortBy}</Badge>
        </div>
      </div>

      {/* Results List */}
      <div className="space-y-6">
        {filteredResults.map((result) => {
          const SourceIcon = getSourceIcon(result.source);
          const isExpanded = selectedResult === result.id;
          
          return (
            <Card key={result.id} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className={getSourceColor(result.source)}>
                    <SourceIcon className="h-3 w-3 mr-1" />
                    {result.source}
                  </Badge>
                  {result.language && (
                    <Badge variant="outline">{result.language}</Badge>
                  )}
                  {result.stars && (
                    <div className="flex items-center gap-1 text-sm text-slate-600">
                      <Star className="h-3 w-3" />
                      {result.stars.toLocaleString()}
                    </div>
                  )}
                </div>
                <span className="text-sm text-slate-500">{result.updatedAt}</span>
              </div>

              <h3 className="text-lg font-semibold text-slate-900 mb-2 hover:text-blue-600 cursor-pointer">
                <a href={result.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                  {result.title}
                  <ExternalLink className="h-4 w-4" />
                </a>
              </h3>

              <p className="text-slate-600 mb-4">{result.description}</p>

              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm text-slate-500">by {result.author}</span>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-4">
                {result.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
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
                        onClick={() => copyCode(result.code!)}
                        className="h-8"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedResult(isExpanded ? null : result.id)}
                        className="h-8"
                      >
                        {isExpanded ? "Collapse" : "Expand"}
                      </Button>
                    </div>
                  </div>
                  <div className={`bg-slate-900 text-slate-100 p-4 overflow-x-auto ${isExpanded ? "" : "max-h-32 overflow-hidden"}`}>
                    <pre className="text-sm">
                      <code>{result.code}</code>
                    </pre>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Load More */}
      {filteredResults.length > 0 && (
        <div className="text-center mt-8">
          <Button variant="outline" size="lg">
            Load more results
          </Button>
        </div>
      )}

      {/* No Results */}
      {filteredResults.length === 0 && query && (
        <div className="text-center py-12">
          <div className="text-slate-400 mb-4">
            <Eye className="h-12 w-12 mx-auto mb-4" />
          </div>
          <h3 className="text-lg font-medium text-slate-900 mb-2">No results found</h3>
          <p className="text-slate-600">
            Try adjusting your search query or filters to find what you&apos;re looking for.
          </p>
        </div>
      )}
    </div>
  );
}