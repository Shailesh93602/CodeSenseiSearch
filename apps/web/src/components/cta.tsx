import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen, Code2 } from "lucide-react";

const REPO_URL = "https://github.com/Shailesh93602/CodeSenseiSearch";

export function CTA() {
  return (
    <section className="py-20 sm:py-24 border-t border-border bg-secondary/30">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
          Poke around, break it, read the code
        </h2>
        <p className="mt-4 text-base text-muted-foreground leading-relaxed">
          Try the deployed search, skim the architecture notes in the docs, or
          clone the repo and run it locally — Docker Compose spins up Postgres
          and Redis in one command.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link href="/search" prefetch>
            <Button size="lg" className="h-11 px-5">
              Try the search
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </Link>
          <Link href="/docs" prefetch>
            <Button size="lg" variant="outline" className="h-11 px-5">
              <BookOpen className="mr-1.5 h-4 w-4" />
              Read the docs
            </Button>
          </Link>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            <Button size="lg" variant="outline" className="h-11 px-5">
              <Code2 className="mr-1.5 h-4 w-4" />
              View source
            </Button>
          </a>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Portfolio reference build · no accounts, no email list, no billing —
          just a live deploy of the code in the repo.
        </p>
      </div>
    </section>
  );
}
