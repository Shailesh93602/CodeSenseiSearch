"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Search, X, Clock } from "lucide-react";
import { useSuggestions } from "@/lib/hooks/use-search";

const RECENT_SEARCHES_KEY = "codesensei.recent-searches";
const MAX_RECENT = 6;

/**
 * Example queries shown under the input as pills. Chosen to match
 * topics present in the seeded demo corpus — clicking a pill should
 * return actual results, not "no matches found".
 */
const EXAMPLE_QUERIES = [
  "useEffect cleanup",
  "async await vs promises",
  "pgvector HNSW",
  "JWT refresh token rotation",
];

function loadRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string").slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  if (typeof window === "undefined" || !query.trim()) return;
  const current = loadRecentSearches();
  const filtered = current.filter((q) => q.toLowerCase() !== query.toLowerCase());
  const next = [query, ...filtered].slice(0, MAX_RECENT);
  try {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // Storage quota or disabled — silently ignore; recents are non-critical.
  }
}

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSearch?: () => void;
}

export function SearchBar({ query, onQueryChange, onSearch }: SearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { suggestions, getSuggestions } = useSuggestions();

  // Hydrate recents from localStorage on mount (client-only). Deferred
  // to a microtask so React doesn't flag this as a cascading render.
  useEffect(() => {
    queueMicrotask(() => setRecentSearches(loadRecentSearches()));
  }, []);

  // Debounced autocomplete hints from the API.
  useEffect(() => {
    if (query.length > 2) {
      const timeoutId = setTimeout(() => {
        getSuggestions(query);
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [query, getSuggestions]);

  const filteredSuggestions = useMemo(() => {
    if (query.length > 0) return suggestions.slice(0, 5);
    return [];
  }, [query, suggestions]);

  const submitQuery = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      saveRecentSearch(trimmed);
      setRecentSearches(loadRecentSearches());
      setIsOpen(false);
      onSearch?.();
    },
    [onSearch],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
    if (e.key === "Enter") {
      submitQuery(query);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onQueryChange(suggestion);
    submitQuery(suggestion);
  };

  const clearQuery = () => {
    onQueryChange("");
    inputRef.current?.focus();
  };

  const clearRecents = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(RECENT_SEARCHES_KEY);
    }
    setRecentSearches([]);
  };

  return (
    <div className="relative">
      {/* Search Input */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          // Two-tier placeholder: a short one for narrow viewports, a
          // longer one for everything else. CSS-only switch via two
          // separate elements would be fancier; setting it once at
          // mount + relying on text-overflow is good enough.
          placeholder="Search snippets, docs, examples…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(query.length === 0)}
          aria-label="Search query"
          data-search-input="true"
          className="h-12 pl-10 pr-28 text-base bg-background text-foreground border-input focus:border-ring focus-visible:ring-ring"
        />
        {query && (
          <button
            type="button"
            onClick={clearQuery}
            aria-label="Clear search"
            className="absolute right-[6.5rem] top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <Button
          type="button"
          size="sm"
          onClick={() => submitQuery(query)}
          className="absolute right-1 top-1/2 -translate-y-1/2 h-10 px-4"
        >
          Search
        </Button>
      </div>

      {/* Suggestions Dropdown */}
      {isOpen && (query.length === 0 ? recentSearches.length > 0 : true) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover text-popover-foreground border border-border rounded-lg shadow-lg z-50 max-h-96 overflow-hidden">
          <Command className="h-full">
            <CommandList>
              {query.length === 0 && recentSearches.length > 0 && (
                <CommandGroup
                  heading={
                    <div className="flex items-center justify-between">
                      <span>Recent searches</span>
                      <button
                        type="button"
                        onClick={clearRecents}
                        className="text-xs text-slate-500 hover:text-slate-700"
                      >
                        Clear
                      </button>
                    </div>
                  }
                >
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
              )}

              {query.length > 0 &&
                (filteredSuggestions.length > 0 ? (
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
                    No suggestions for &ldquo;{query}&rdquo;
                  </CommandEmpty>
                ))}
            </CommandList>
          </Command>
        </div>
      )}

      {/* Example queries — chosen to match the seeded corpus */}
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        <span className="text-xs text-muted-foreground mr-1">Try:</span>
        {EXAMPLE_QUERIES.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => handleSuggestionClick(suggestion)}
            className="inline-flex items-center rounded-full border border-border bg-secondary/60 px-2.5 py-0.5 text-xs font-medium text-secondary-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
