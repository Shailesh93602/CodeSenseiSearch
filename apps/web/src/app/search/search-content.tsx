"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/search-bar";
import { SearchFilters } from "@/components/search-filters";
import { SearchResults } from "@/components/search-results";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Filter } from "lucide-react";

export default function SearchContent() {
  const searchParams = useSearchParams();
  const qParam = searchParams.get('q');
  const [query, setQuery] = useState(qParam || "");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    source: "all", // all, github, stackoverflow, docs
    language: "all",
    sortBy: "relevance", // relevance, date, stars
    dateRange: "all" // all, week, month, year
  });

  const hasActiveFilters = Object.values(filters).some(value => value !== "all" && value !== "relevance");

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-50 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 sm:h-16 items-center justify-between">
            <div className="flex items-center gap-4 sm:gap-8">
              <Link href="/" className="text-lg sm:text-xl font-bold text-slate-900">
                CodeSensei<span className="text-blue-600">Search</span>
              </Link>
              <nav className="hidden md:flex space-x-4">
                <Link href="/" className="text-slate-600 hover:text-slate-900 px-3 py-2 text-sm font-medium transition-colors">
                  Home
                </Link>
                <Link href="/search" className="text-blue-600 px-3 py-2 text-sm font-medium">
                  Search
                </Link>
                <Link href="/docs" className="text-slate-600 hover:text-slate-900 px-3 py-2 text-sm font-medium transition-colors">
                  Docs
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Mobile Filter Toggle */}
              <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                <SheetTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="md:hidden relative"
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveFilters && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 bg-blue-600 rounded-full" />
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80 p-0">
                  <div className="p-4 border-b">
                    <h2 className="text-lg font-semibold">Filters</h2>
                  </div>
                  <div className="p-4">
                    <SearchFilters filters={filters} onFiltersChange={setFilters} />
                  </div>
                </SheetContent>
              </Sheet>
              
              <button className="text-slate-600 hover:text-slate-900 text-sm font-medium transition-colors">
                Sign In
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          {/* Desktop Filters Sidebar */}
          <aside className="hidden md:block w-64 shrink-0">
            <div className="sticky top-24">
              <SearchFilters filters={filters} onFiltersChange={setFilters} />
            </div>
          </aside>

          {/* Search Results */}
          <div className="flex-1 min-w-0">
            <div className="mb-4 sm:mb-6">
              <SearchBar 
                query={query} 
                onQueryChange={setQuery}
                onSearch={() => {
                  // Force search trigger when user clicks search or presses enter
                  // The SearchResults component will handle the actual search
                }}
              />
            </div>
            
            {/* Mobile Filter Summary */}
            {hasActiveFilters && (
              <div className="md:hidden mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-blue-700 font-medium">Filters applied</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMobileFiltersOpen(true)}
                    className="text-blue-600 h-auto p-1"
                  >
                    Edit filters
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {filters.source !== "all" && (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-100 text-blue-700">
                      {filters.source}
                    </span>
                  )}
                  {filters.language !== "all" && (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-100 text-blue-700">
                      {filters.language}
                    </span>
                  )}
                  {filters.sortBy !== "relevance" && (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-100 text-blue-700">
                      Sort: {filters.sortBy}
                    </span>
                  )}
                  {filters.dateRange !== "all" && (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-100 text-blue-700">
                      {filters.dateRange}
                    </span>
                  )}
                </div>
              </div>
            )}
            
            <SearchResults query={query} filters={filters} />
          </div>
        </div>
      </main>
    </div>
  );
}