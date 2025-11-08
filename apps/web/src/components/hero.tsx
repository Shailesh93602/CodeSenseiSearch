"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Zap, ArrowRight } from "lucide-react";
import { useState } from "react";

export function Hero() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <section className="relative overflow-hidden bg-linear-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
      
      <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <Badge variant="secondary" className="mb-6 bg-blue-100 text-blue-700 hover:bg-blue-200">
            <Zap className="mr-1 h-3 w-3" />
            AI-Powered Semantic Search
          </Badge>

          {/* Main Headline */}
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Find{" "}
            <span className="bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Developer Content
            </span>{" "}
            Instantly
          </h1>

          {/* Subheadline */}
          <p className="mt-6 text-lg leading-8 text-slate-300 sm:text-xl">
            Search through millions of GitHub repositories and Stack Overflow answers 
            with AI-powered semantic understanding. Get relevant code snippets, 
            solutions, and documentation in seconds.
          </p>

          {/* Search Bar Preview */}
          <div className="mt-10 flex max-w-2xl mx-auto">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder="Search for React hooks, Python algorithms, API documentation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-14 pl-11 pr-4 text-base bg-white/10 border-white/20 text-white placeholder:text-slate-400 focus:bg-white/20 focus:border-blue-400"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`;
                  }
                }}
              />
            </div>
            <Button 
              size="lg" 
              className="ml-3 h-14 px-8 bg-blue-600 hover:bg-blue-700"
              onClick={() => {
                window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`;
              }}
            >
              Search
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {/* Quick Search Suggestions */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <span className="text-sm text-slate-400">Try:</span>
            {[
              "React useEffect cleanup",
              "Python async/await patterns", 
              "JWT authentication Node.js",
              "CSS Grid responsive layout"
            ].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => {
                  window.location.href = `/search?q=${encodeURIComponent(suggestion)}`;
                }}
                className="rounded-full bg-white/10 px-3 py-1 text-sm text-slate-300 hover:bg-white/20 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-2 gap-8 sm:grid-cols-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-white sm:text-4xl">10M+</div>
              <div className="text-sm text-slate-400">Code Snippets</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-white sm:text-4xl">500K+</div>
              <div className="text-sm text-slate-400">Repositories</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-white sm:text-4xl">2M+</div>
              <div className="text-sm text-slate-400">Stack Overflow Posts</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-white sm:text-4xl">50+</div>
              <div className="text-sm text-slate-400">Programming Languages</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-20 bg-linear-to-t from-white to-transparent" />
    </section>
  );
}