import { Card } from "@/components/ui/card";
import {
  Brain,
  Database,
  Layers,
  Search,
  Workflow,
  Waypoints,
} from "lucide-react";

/**
 * Landing-page feature grid. Each card describes an actual component
 * of the deployed stack — no speculative / marketing claims.
 */
const FEATURES = [
  {
    icon: Brain,
    title: "Hybrid retrieval",
    description:
      "Every query is dispatched to both a Gemini-powered vector search (cosine over pgvector) and a Postgres full-text search. Results are merged with a configurable weighted score (defaults: 0.6 vector / 0.4 text) and reranked.",
  },
  {
    icon: Search,
    title: "Asymmetric embeddings",
    description:
      "Query embeddings use Gemini's RETRIEVAL_QUERY task type; documents use RETRIEVAL_DOCUMENT. Asymmetric task types give measurably better recall than the same type on both sides.",
  },
  {
    icon: Database,
    title: "pgvector storage",
    description:
      "768-dim embeddings stored alongside content chunks in Postgres. Dimensions are pinned in the schema and the Gemini client — a mismatch silently truncates at insert time.",
  },
  {
    icon: Workflow,
    title: "BullMQ ingestion",
    description:
      "Discovery → ingestion → chunking → embedding modelled as a queue graph. Each stage is its own worker with its own concurrency and retry config; failed jobs park in a DLQ for replay.",
  },
  {
    icon: Waypoints,
    title: "AST-aware chunking",
    description:
      "Code files split on syntactic boundaries via tree-sitter when available (functions, classes, methods); paragraph fallback otherwise. Chunks deduplicated on SHA-256.",
  },
  {
    icon: Layers,
    title: "Serverless by default",
    description:
      "Web + API both deploy to Vercel functions. Workers run against Upstash Redis with TLS; /api/health reports DB + Redis + Gemini reachability for uptime probes.",
  },
];

export function Features() {
  return (
    <section className="py-20 sm:py-28 bg-background">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            What actually ships
          </h2>
          <p className="mt-4 text-base text-muted-foreground leading-relaxed">
            A working reference implementation of a semantic code search stack.
            Every card below maps to code in the repo.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const IconComponent = feature.icon;
            return (
              <Card
                key={feature.title}
                className="p-6 bg-card border-border hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <IconComponent className="h-4 w-4" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </Card>
            );
          })}
        </div>

        {/* Query flow */}
        <div className="mt-20">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              What happens when you press Search
            </h3>
            <p className="mt-3 text-base text-muted-foreground">
              Three stages, end-to-end in a single request.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              {
                n: 1,
                title: "Embed the query",
                body: (
                  <>
                    Gemini{" "}
                    <span className="font-mono text-foreground">
                      gemini-embedding-001
                    </span>{" "}
                    (RETRIEVAL_QUERY) returns a 768-dim vector.
                  </>
                ),
              },
              {
                n: 2,
                title: "Two searches in parallel",
                body: (
                  <>
                    pgvector cosine similarity against stored chunks AND
                    Postgres{" "}
                    <span className="font-mono text-foreground">ts_rank</span>{" "}
                    full-text — awaited together.
                  </>
                ),
              },
              {
                n: 3,
                title: "Merge and rerank",
                body: (
                  <>
                    Deduplicate by chunk id, blend with weighted score, return
                    the top K to the browser.
                  </>
                ),
              },
            ].map((step) => (
              <div
                key={step.n}
                className="text-center sm:text-left rounded-lg border border-border bg-card p-6"
              >
                <div className="mb-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  {step.n}
                </div>
                <h4 className="text-base font-semibold text-foreground mb-2">
                  {step.title}
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
