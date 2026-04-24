"use client";

// Next.js requires this file to be a client component — it's the
// outer error boundary, mounted around the entire route tree.

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Home, RotateCw } from "lucide-react";

const REPO_URL = "https://github.com/Shailesh93602/CodeSenseiSearch";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Useful for spotting render bugs in production logs. When Sentry
    // is wired (TODO.md item E.1), forward `error` here.
    console.error("[error.tsx] route render threw:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-24 sm:py-32 text-center">
      <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
        Something broke on this page
      </h1>
      <p className="mt-4 max-w-xl mx-auto text-base text-muted-foreground leading-relaxed">
        The render threw — most likely a transient issue. Reload to try again.
        If it keeps happening, the digest below helps me trace it.
      </p>
      {error.digest && (
        <p className="mt-3 text-xs font-mono text-muted-foreground">
          digest: {error.digest}
        </p>
      )}
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Button size="lg" className="h-11 px-5" onClick={reset}>
          <RotateCw className="mr-1.5 h-4 w-4" />
          Try again
        </Button>
        <Link href="/">
          <Button size="lg" variant="outline" className="h-11 px-5">
            <Home className="mr-1.5 h-4 w-4" />
            Home
          </Button>
        </Link>
        <a
          href={`${REPO_URL}/issues/new`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button size="lg" variant="outline" className="h-11 px-5">
            Report on GitHub
          </Button>
        </a>
      </div>
    </div>
  );
}
