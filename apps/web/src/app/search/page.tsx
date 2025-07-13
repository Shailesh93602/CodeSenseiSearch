"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/search-bar";
import { SearchFilters } from "@/components/search-filters";
import { SearchResults } from "@/components/search-results";

export default function SearchPage() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({
    source: "all", // all, github, stackoverflow, docs
    language: "all",
    sortBy: "relevance", // relevance, date, stars
    dateRange: "all" // all, week, month, year
  });

  // Set initial query from URL params
  useEffect(() => {
    const qParam = searchParams.get('q');
    if (qParam) {
      setQuery(qParam);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <h1 className="text-xl font-bold text-slate-900">
                CodeSensei<span className="text-blue-600">Search</span>
              </h1>
              <nav className="hidden md:flex space-x-4">
                <Link href="/" className="text-slate-600 hover:text-slate-900 px-3 py-2 text-sm font-medium">
                  Home
                </Link>
                <Link href="/search" className="text-blue-600 px-3 py-2 text-sm font-medium">
                  Search
                </Link>
                <Link href="/docs" className="text-slate-600 hover:text-slate-900 px-3 py-2 text-sm font-medium">
                  Docs
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <button className="text-slate-600 hover:text-slate-900 text-sm font-medium">
                Sign In
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Filters Sidebar */}
          <aside className="w-64 shrink-0">
            <SearchFilters filters={filters} onFiltersChange={setFilters} />
          </aside>

          {/* Search Results */}
          <div className="flex-1 min-w-0">
            <div className="mb-6">
              <SearchBar query={query} onQueryChange={setQuery} />
            </div>
            <SearchResults query={query} filters={filters} />
          </div>
        </div>
      </main>
    </div>
  );
}