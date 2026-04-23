"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Zap, ArrowRight } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLE_QUERIES = [
  "useEffect cleanup",
  "async await vs promises",
  "pgvector HNSW vs IVFFlat",
  "JWT refresh token rotation",
];

export function Hero() {
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  const runSearch = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <section className="relative overflow-hidden bg-linear-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />

      <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <Badge
            variant="secondary"
            className="mb-6 bg-blue-100 text-blue-700 hover:bg-blue-200"
          >
            <Zap className="mr-1 h-3 w-3" />
            Semantic code search — portfolio build
          </Badge>

          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Search code by{" "}
            <span className="bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              meaning
            </span>{" "}
            — not keywords
          </h1>

          <p className="mt-6 text-lg leading-8 text-slate-300 sm:text-xl">
            Ask for what you need in plain English. A hybrid retrieval engine
            combines Gemini embeddings over{" "}
            <span className="font-mono text-slate-100">pgvector</span> with
            Postgres full-text to return the closest matches from the corpus.
          </p>

          {/* Search Input */}
          <div className="mt-10 flex max-w-2xl mx-auto">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder="Try: 'how to debounce a React hook without stale closures'"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search query"
                className="h-14 pl-11 pr-4 text-base bg-white/10 border-white/20 text-white placeholder:text-slate-400 focus:bg-white/20 focus:border-blue-400"
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch(searchQuery);
                }}
              />
            </div>
            <Button
              size="lg"
              type="button"
              className="ml-3 h-14 px-8 bg-blue-600 hover:bg-blue-700"
              onClick={() => runSearch(searchQuery)}
            >
              Search
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {/* Example Queries */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <span className="text-sm text-slate-400">Try:</span>
            {EXAMPLE_QUERIES.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => runSearch(suggestion)}
                className="rounded-full bg-white/10 px-3 py-1 text-sm text-slate-300 hover:bg-white/20 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {/* Stack callouts — honest technical summary, not vanity metrics */}
          <div className="mt-16 grid grid-cols-2 gap-8 sm:grid-cols-4 text-left sm:text-center">
            <div>
              <div className="text-sm font-mono text-blue-300">Retrieval</div>
              <div className="text-slate-200">Vector + full-text</div>
              <div className="text-xs text-slate-400 mt-1">
                Hybrid reranked with configurable weights
              </div>
            </div>
            <div>
              <div className="text-sm font-mono text-blue-300">Embeddings</div>
              <div className="text-slate-200">Gemini text-embedding-004</div>
              <div className="text-xs text-slate-400 mt-1">768 dimensions</div>
            </div>
            <div>
              <div className="text-sm font-mono text-blue-300">Storage</div>
              <div className="text-slate-200">Postgres + pgvector</div>
              <div className="text-xs text-slate-400 mt-1">
                Supabase-hosted; HNSW-ready
              </div>
            </div>
            <div>
              <div className="text-sm font-mono text-blue-300">Runtime</div>
              <div className="text-slate-200">NestJS on Vercel</div>
              <div className="text-xs text-slate-400 mt-1">
                BullMQ + Upstash Redis for ingestion
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-20 bg-linear-to-t from-white to-transparent" />
    </section>
  );
}
