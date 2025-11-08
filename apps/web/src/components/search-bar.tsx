"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Search, X, Clock, TrendingUp } from "lucide-react";
import { useSuggestions } from "@/lib/hooks/use-search";

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSearch?: () => void;
}

export function SearchBar({ query, onQueryChange, onSearch }: SearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { suggestions, getSuggestions } = useSuggestions();

  // Local recent searches (could be persisted to localStorage)
  const recentSearches = [
    "React useEffect cleanup", 
    "Python async generators",
    "TypeScript conditional types"
  ];

  const trendingSearches = [
    "Go concurrency patterns",
    "CSS container queries", 
    "JWT refresh tokens"
  ];

  // Get suggestions when query changes
  useEffect(() => {
    if (query.length > 2) {
      const timeoutId = setTimeout(() => {
        getSuggestions(query);
      }, 300); // Debounce suggestions

      return () => clearTimeout(timeoutId);
    }
  }, [query, getSuggestions]);

  // Filter suggestions to avoid duplicates and limit results
  const filteredSuggestions = useMemo(() => {
    if (query.length > 0) {
      return suggestions.slice(0, 5);
    }
    return [];
  }, [query, suggestions]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
    if (e.key === 'Enter') {
      setIsOpen(false);
      onSearch?.();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onQueryChange(suggestion);
    setIsOpen(false);
    onSearch?.();
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
                  {filteredSuggestions.length > 0 ? (
                    <CommandGroup heading="Suggestions">
                      {filteredSuggestions.map((suggestion) => (
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
        {["React hooks", "Python async", "TypeScript generics", "Go concurrency"].map((suggestion) => (
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