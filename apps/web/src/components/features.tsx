import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
 * of the deployed stack — no speculative / marketing claims. When the
 * underlying implementation changes, update the matching card so the
 * page doesn't drift into lies.
 */
const FEATURES = [
  {
    icon: Brain,
    title: "Hybrid retrieval",
    description:
      "Every query is dispatched to both a Gemini-powered vector search (cosine over pgvector) and a Postgres full-text search. The two result sets are merged with a configurable weighted score (defaults: 0.6 vector / 0.4 text) and reranked before returning.",
    badge: "Core",
    color: "bg-purple-100 text-purple-700",
  },
  {
    icon: Search,
    title: "Semantic understanding",
    description:
      "Query embeddings are generated with Gemini text-embedding-004 using the RETRIEVAL_QUERY task type; documents use RETRIEVAL_DOCUMENT. Asymmetric task types give measurably better recall than using the same type on both sides.",
    badge: "Gemini",
    color: "bg-yellow-100 text-yellow-700",
  },
  {
    icon: Database,
    title: "pgvector storage",
    description:
      "768-dim embeddings stored alongside the content chunks in Postgres. Dimensions are pinned in both the schema and the Gemini client — a mismatch silently truncates at insert time, so they're kept in sync explicitly.",
    badge: "Postgres",
    color: "bg-green-100 text-green-700",
  },
  {
    icon: Workflow,
    title: "BullMQ ingestion",
    description:
      "Discovery → ingestion → chunking → embedding is modelled as a queue graph. Each stage is its own worker with its own concurrency and retry config. Failed jobs park in a DLQ with the error recorded for replay.",
    badge: "Queues",
    color: "bg-orange-100 text-orange-700",
  },
  {
    icon: Waypoints,
    title: "AST-aware chunking",
    description:
      "Code files are split on syntactic boundaries where a tree-sitter grammar is available (functions, classes, methods) and fall back to paragraph / line-count splits otherwise. Chunks are deduplicated on SHA-256 of the chunk text.",
    badge: "Chunker",
    color: "bg-blue-100 text-blue-700",
  },
  {
    icon: Layers,
    title: "Serverless by default",
    description:
      "Next.js web + NestJS API both deploy to Vercel functions. Workers run against Upstash Redis with TLS; health checks at /api/health report DB + Redis + Gemini reachability for uptime probes.",
    badge: "Ops",
    color: "bg-pink-100 text-pink-700",
  },
];

export function Features() {
  return (
    <section className="py-24 bg-slate-50">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            What actually ships
          </h2>
          <p className="mt-6 text-lg leading-8 text-slate-600">
            This is a working reference implementation of a semantic code
            search stack. Every card below maps to code in the repo — no
            feature is listed unless it&apos;s wired up.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const IconComponent = feature.icon;
            return (
              <Card
                key={feature.title}
                className="p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                    <IconComponent className="h-5 w-5 text-white" />
                  </div>
                  <Badge variant="secondary" className={feature.color}>
                    {feature.badge}
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  {feature.description}
                </p>
              </Card>
            );
          })}
        </div>

        {/* Query flow diagram — three steps, honestly described */}
        <div className="mt-24">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              What happens when you press Search
            </h3>
            <p className="mt-4 text-lg text-slate-600">
              Three stages, end to end in a single request.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white font-semibold">
                  1
                </div>
              </div>
              <h4 className="text-lg font-semibold text-slate-900 mb-2">
                Embed the query
              </h4>
              <p className="text-slate-600">
                The query is sent to Gemini{" "}
                <span className="font-mono text-sm">text-embedding-004</span>{" "}
                with task type <span className="font-mono text-sm">RETRIEVAL_QUERY</span>, returning a 768-dim vector.
              </p>
            </div>

            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white font-semibold">
                  2
                </div>
              </div>
              <h4 className="text-lg font-semibold text-slate-900 mb-2">
                Two searches in parallel
              </h4>
              <p className="text-slate-600">
                pgvector cosine similarity against stored chunk embeddings,
                and <span className="font-mono text-sm">ts_rank</span>-scored full-text search — run in parallel and awaited together.
              </p>
            </div>

            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white font-semibold">
                  3
                </div>
              </div>
              <h4 className="text-lg font-semibold text-slate-900 mb-2">
                Merge and rerank
              </h4>
              <p className="text-slate-600">
                Results are deduplicated by chunk id, scored with the weighted
                blend, and the top K are reranked before the API sends them
                back to the browser.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
