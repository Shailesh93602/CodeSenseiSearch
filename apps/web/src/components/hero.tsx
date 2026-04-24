"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ArrowRight } from "lucide-react";
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
    <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-background via-background to-secondary/30">
      {/* Subtle grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-40 [mask-image:radial-gradient(ellipse_at_center,white,transparent_70%)]"
      />

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
        <div className="text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-background/60 backdrop-blur px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            Semantic code search · portfolio reference build
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.1]">
            Search code by{" "}
            <span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">
              meaning
            </span>{" "}
            — not keywords
          </h1>

          <p className="mt-5 mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            Ask in plain English. Hybrid retrieval combines Gemini embeddings
            over <span className="font-mono text-foreground/80">pgvector</span>{" "}
            with Postgres full-text to return the closest matches from the
            indexed corpus.
          </p>

          {/* Search input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runSearch(searchQuery);
            }}
            className="mt-8 mx-auto flex max-w-xl gap-2"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="e.g. how to debounce a React hook"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search query"
                className="h-12 pl-10 pr-4 text-base bg-background border-input focus:border-ring"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="h-12 px-5 shrink-0"
            >
              Search
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </form>

          {/* Example pills */}
          <div className="mt-5 flex flex-wrap justify-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1 self-center">
              Try:
            </span>
            {EXAMPLE_QUERIES.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => runSearch(suggestion)}
                className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-primary/5 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {/* Keyboard hint */}
          <div className="mt-4 text-xs text-muted-foreground/70">
            Tip: press{" "}
            <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-foreground">
              ⌘ K
            </kbd>{" "}
            anywhere to focus search.
          </div>
        </div>

        {/* Honest stack callouts */}
        <div className="mt-16 grid grid-cols-2 gap-px sm:grid-cols-4 rounded-lg border border-border overflow-hidden bg-border">
          <StackCell
            label="Retrieval"
            value="Vector + full-text"
            detail="Hybrid reranked"
          />
          <StackCell
            label="Embeddings"
            value="Gemini 768-dim"
            detail="text-embedding-001"
          />
          <StackCell
            label="Storage"
            value="Postgres + pgvector"
            detail="Supabase-hosted"
          />
          <StackCell
            label="Runtime"
            value="NestJS on Vercel"
            detail="BullMQ + Upstash"
          />
        </div>
      </div>
    </section>
  );
}

function StackCell({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="bg-background p-4 text-left">
      <div className="text-[10px] font-mono uppercase tracking-wider text-primary mb-1">
        {label}
      </div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>
    </div>
  );
}
