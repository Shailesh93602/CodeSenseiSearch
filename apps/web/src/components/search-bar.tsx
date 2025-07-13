"use client";

import { useState, useRef, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Search, X, Clock, TrendingUp } from "lucide-react";

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
}

export function SearchBar({ query, onQueryChange }: SearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const recentSearches = [
    "useEffect cleanup",
    "Python list comprehension", 
    "JavaScript async patterns"
  ];

  const trendingSearches = [
    "Next.js 14 features",
    "React Server Components",
    "AI code generation"
  ];

  // Mock suggestions based on query
  const suggestions = useMemo(() => {
    const allSuggestions = [
      "React hooks tutorial",
      "Python async/await patterns",
      "JWT authentication Node.js",
      "CSS Grid responsive layout",
      "Docker container setup",
      "GraphQL query optimization",
      "TypeScript generics examples",
      "REST API best practices",
      "MongoDB aggregation pipeline",
      "Vue.js composition API"
    ];

    if (query.length > 0) {
      const filtered = allSuggestions.filter(suggestion =>
        suggestion.toLowerCase().includes(query.toLowerCase())
      );
      return filtered.slice(0, 5);
    }
    return [];
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
    if (e.key === 'Enter') {
      setIsOpen(false);
      // Trigger search
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onQueryChange(suggestion);
    setIsOpen(false);
  };

  const clearQuery = () => {
    onQueryChange("");
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search for code, solutions, documentation..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(query.length === 0)}
          className="h-12 pl-10 pr-20 text-base bg-white border-slate-200 focus:border-blue-500 focus:ring-blue-500"
        />
        {query && (
          <button
            onClick={clearQuery}
            className="absolute right-12 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <Button
          size="sm"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-10 px-4 bg-blue-600 hover:bg-blue-700"
        >
          Search
        </Button>
      </div>

      {/* Search Suggestions Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-96 overflow-hidden">
          <Command className="h-full">
            <CommandList>
              {query.length === 0 && (
                <>
                  {/* Recent Searches */}
                  <CommandGroup heading="Recent searches">
                    {recentSearches.map((search) => (
                      <CommandItem
                        key={search}
                        value={search}
                        onSelect={() => handleSuggestionClick(search)}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <Clock className="h-4 w-4 text-slate-400" />
                        <span>{search}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>

                  {/* Trending Searches */}
                  <CommandGroup heading="Trending">
                    {trendingSearches.map((search) => (
                      <CommandItem
                        key={search}
                        value={search}
                        onSelect={() => handleSuggestionClick(search)}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <TrendingUp className="h-4 w-4 text-slate-400" />
                        <span>{search}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {query.length > 0 && (
                <>
                  {suggestions.length > 0 ? (
                    <CommandGroup heading="Suggestions">
                      {suggestions.map((suggestion) => (
                        <CommandItem
                          key={suggestion}
                          value={suggestion}
                          onSelect={() => handleSuggestionClick(suggestion)}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <Search className="h-4 w-4 text-slate-400" />
                          <span>{suggestion}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : (
                    <CommandEmpty>
                      No suggestions found for &ldquo;{query}&rdquo;
                    </CommandEmpty>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <span className="text-sm text-slate-500">Try:</span>
        {["React hooks", "Python algorithms", "API authentication", "CSS layouts"].map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => handleSuggestionClick(suggestion)}
            className="inline-flex items-center px-2 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200 transition-colors"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}