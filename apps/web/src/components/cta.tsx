import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Code2, BookOpen } from "lucide-react";

const REPO_URL = "https://github.com/Shailesh93602/CodeSenseiSearch";

export function CTA() {
  return (
    <section className="py-24 bg-slate-900">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Poke around, break it, read the code
          </h2>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            Try the deployed search, skim the architecture notes in the docs,
            or clone the repo and run it locally — Docker Compose spins up
            Postgres + Redis in one command. Pull requests and honest
            feedback welcome.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/search" prefetch={false}>
              <Button
                size="lg"
                className="h-12 px-6 bg-blue-600 hover:bg-blue-700"
              >
                Try the search
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/docs" prefetch={false}>
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-6 border-white/20 text-white hover:bg-white/10"
              >
                <BookOpen className="mr-2 h-4 w-4" />
                Read the docs
              </Button>
            </Link>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-6 border-white/20 text-white hover:bg-white/10"
              >
                <Code2 className="mr-2 h-4 w-4" />
                View source
              </Button>
            </a>
          </div>

          <p className="mt-8 text-sm text-slate-500">
            This is a portfolio reference build. No accounts, no email list,
            no billing — just a live deploy of the code in the repo.
          </p>
        </div>
      </div>
    </section>
  );
}
