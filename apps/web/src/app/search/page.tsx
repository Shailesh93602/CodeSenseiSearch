"use client";

import { Suspense } from "react";
import SearchContent from "./search-content";

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading search...</p>
        </div>
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}