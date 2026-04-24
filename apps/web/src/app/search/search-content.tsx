"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/search-bar";
import { SearchFilters, type Filters } from "@/components/search-filters";
import { SearchResults } from "@/components/search-results";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Filter, X } from "lucide-react";

const DEFAULT_FILTERS: Filters = {
  source: "all",
  language: "all",
  sortBy: "relevance",
  dateRange: "all",
};

// Allowed values per filter — anything not in this set falls back to
// the default so a hand-typed `?source=github_or_typo` doesn't put the
// UI in an unrenderable state.
const ALLOWED_SOURCE = new Set(["all", "github", "stackoverflow", "docs"]);
const ALLOWED_LANGUAGE = new Set([
  "all",
  "javascript",
  "typescript",
  "python",
  "go",
  "rust",
  "java",
  "csharp",
  "php",
]);
const ALLOWED_SORT = new Set(["relevance", "date"]);
const ALLOWED_DATE = new Set(["all", "week", "month", "year"]);

/**
 * Read filters from URL search params so reload + share keep state.
 * Also accept legacy/API-style aliases (e.g. ?source=repository)
 * coming from external links so users don't see "no match" without
 * any explanation.
 */
function readFiltersFromParams(params: URLSearchParams): Filters {
  let source = params.get("source") ?? DEFAULT_FILTERS.source;
  // Map API enum values back to FE labels for backwards-compat URLs.
  if (source === "repository") source = "github";
  else if (source === "question") source = "stackoverflow";
  else if (source === "documentation") source = "docs";

  return {
    source: ALLOWED_SOURCE.has(source) ? source : DEFAULT_FILTERS.source,
    language: ALLOWED_LANGUAGE.has(params.get("language") ?? "")
      ? (params.get("language") as string)
      : DEFAULT_FILTERS.language,
    sortBy: ALLOWED_SORT.has(params.get("sortBy") ?? "")
      ? (params.get("sortBy") as string)
      : DEFAULT_FILTERS.sortBy,
    dateRange: ALLOWED_DATE.has(params.get("dateRange") ?? "")
      ? (params.get("dateRange") as string)
      : DEFAULT_FILTERS.dateRange,
  };
}

/** Human-readable label for a filter value, used in the chip strip. */
function labelFor(kind: keyof Filters, value: string): string {
  if (kind === "source") {
    return (
      { github: "GitHub", stackoverflow: "Stack Overflow", docs: "Documentation" }[
        value
      ] ?? value
    );
  }
  if (kind === "language") {
    return (
      {
        javascript: "JavaScript",
        typescript: "TypeScript",
        python: "Python",
        go: "Go",
        rust: "Rust",
        java: "Java",
        csharp: "C#",
        php: "PHP",
      }[value] ?? value
    );
  }
  if (kind === "sortBy") {
    return value === "date" ? "Most recent" : "Relevance";
  }
  if (kind === "dateRange") {
    return (
      { week: "Past week", month: "Past month", year: "Past year" }[value] ??
      value
    );
  }
  return value;
}

function buildSearchUrl(query: string, filters: Filters): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (filters.source !== DEFAULT_FILTERS.source) params.set("source", filters.source);
  if (filters.language !== DEFAULT_FILTERS.language) params.set("language", filters.language);
  if (filters.sortBy !== DEFAULT_FILTERS.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.dateRange !== DEFAULT_FILTERS.dateRange) params.set("dateRange", filters.dateRange);
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

export default function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialFilters = useMemo(
    () => readFiltersFromParams(searchParams),
    [searchParams],
  );

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const hasActiveFilters = useMemo(
    () =>
      filters.source !== "all" ||
      filters.language !== "all" ||
      filters.sortBy !== "relevance" ||
      filters.dateRange !== "all",
    [filters],
  );

  /** Persist a query+filter pair into the URL. */
  const syncToUrl = useCallback(
    (q: string, f: Filters) => {
      router.replace(buildSearchUrl(q, f), { scroll: false });
    },
    [router],
  );

  const handleSubmitQuery = useCallback(() => {
    syncToUrl(query, filters);
  }, [query, filters, syncToUrl]);

  const handleFiltersChange = useCallback(
    (next: Filters) => {
      setFilters(next);
      syncToUrl(query, next);
    },
    [query, syncToUrl],
  );

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    syncToUrl(query, DEFAULT_FILTERS);
    setMobileFiltersOpen(false);
  }, [query, syncToUrl]);

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <div className="flex flex-col md:flex-row gap-6 md:gap-8">
          {/* Desktop Filters Sidebar */}
          <aside className="hidden md:block w-64 shrink-0">
            <div className="sticky top-20">
              <SearchFilters
                filters={filters}
                onFiltersChange={handleFiltersChange}
                onClear={hasActiveFilters ? clearFilters : undefined}
              />
            </div>
          </aside>

          {/* Search Results column */}
          <div className="flex-1 min-w-0">
            <div className="mb-5 flex items-start gap-2">
              <div className="flex-1">
                <SearchBar
                  query={query}
                  onQueryChange={setQuery}
                  onSearch={handleSubmitQuery}
                />
              </div>
              <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="md:hidden h-12 w-12 relative shrink-0"
                    aria-label="Open filters"
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveFilters && (
                      <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80 p-0">
                  <div className="p-4 border-b border-border">
                    <h2 className="text-base font-semibold">Filters</h2>
                  </div>
                  <div className="p-4">
                    <SearchFilters
                      filters={filters}
                      onFiltersChange={handleFiltersChange}
                      onClear={hasActiveFilters ? clearFilters : undefined}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* Active-filter chip strip — shows on every viewport. */}
            {hasActiveFilters && (
              <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Filters:</span>
                {filters.source !== "all" && (
                  <FilterChip
                    label={`Source: ${labelFor("source", filters.source)}`}
                    onClear={() => handleFiltersChange({ ...filters, source: "all" })}
                  />
                )}
                {filters.language !== "all" && (
                  <FilterChip
                    label={`Language: ${labelFor("language", filters.language)}`}
                    onClear={() => handleFiltersChange({ ...filters, language: "all" })}
                  />
                )}
                {filters.sortBy !== "relevance" && (
                  <FilterChip
                    label={`Sort: ${labelFor("sortBy", filters.sortBy)}`}
                    onClear={() => handleFiltersChange({ ...filters, sortBy: "relevance" })}
                  />
                )}
                {filters.dateRange !== "all" && (
                  <FilterChip
                    label={`Date: ${labelFor("dateRange", filters.dateRange)}`}
                    onClear={() => handleFiltersChange({ ...filters, dateRange: "all" })}
                  />
                )}
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Clear all
                </button>
              </div>
            )}

            <SearchResults query={query} filters={filters} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${label} filter`}
        className="rounded-full hover:bg-background/60"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
