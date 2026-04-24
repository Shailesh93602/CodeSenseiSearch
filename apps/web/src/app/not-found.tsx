import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-24 sm:py-32 text-center">
      <p className="text-sm font-mono text-primary mb-3">404</p>
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
        That page isn&apos;t in the index
      </h1>
      <p className="mt-4 max-w-xl mx-auto text-base text-muted-foreground leading-relaxed">
        The link you followed might be stale, or the URL may be off by a
        character. Try the search, or head back to the home page.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Link href="/">
          <Button size="lg" className="h-11 px-5">
            <Home className="mr-1.5 h-4 w-4" />
            Home
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </Link>
        <Link href="/search">
          <Button size="lg" variant="outline" className="h-11 px-5">
            <Search className="mr-1.5 h-4 w-4" />
            Search
          </Button>
        </Link>
      </div>
    </div>
  );
}
