import { Metadata } from 'next';
import Link from 'next/link';
import { SEOMetadata, pageConfigs } from '@/lib/seo';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { StructuredData } from '@/components/seo/StructuredData';

export const metadata: Metadata = SEOMetadata.generateMetadata(pageConfigs.docs);

const breadcrumbs = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs', current: true },
];

const REPO_URL = 'https://github.com/Shailesh93602/CodeSenseiSearch';
const SITE_URL = 'https://code-sensei-search-web.vercel.app';

const sections = [
  {
    title: 'API Reference',
    description:
      'REST endpoints: /search/hybrid, /search/semantic, /search/text, /search/suggestions, /search/stats. Each with request/response shape and a curl example.',
    href: '/docs/api',
    badge: 'REST',
  },
  {
    title: 'Integration Guide',
    description:
      'Calling the deployed API from a client app, wiring the JS SDK shim, running the full stack locally with Docker Compose.',
    href: '/docs/integration',
    badge: 'How-to',
  },
];

export default function DocsPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: 'CodeSenseiSearch Documentation',
    description:
      'Documentation for the CodeSenseiSearch REST API and local development setup.',
    url: `${SITE_URL}/docs`,
    author: {
      '@type': 'Person',
      name: 'Shailesh Chaudhari',
    },
    mainEntity: {
      '@type': 'ItemList',
      name: 'Documentation Sections',
      itemListElement: sections.map((section, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: section.title,
        description: section.description,
        url: `${SITE_URL}${section.href}`,
      })),
    },
  };

  return (
    <>
      <StructuredData data={structuredData} />

      {/* Page hero */}
      <div className="border-b border-border bg-secondary/30">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <Breadcrumbs items={breadcrumbs} className="mb-6" />
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Documentation
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground leading-relaxed">
            How the stack is put together, how to call the API, and how to
            run it yourself. The source of truth is the repo — these pages
            are summaries with runnable examples.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/search"
              className="inline-flex items-center rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Try the search
            </Link>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
            >
              View repo
            </a>
          </div>
        </div>
      </div>

      {/* Stack summary */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl font-semibold text-foreground mb-6">
            What&apos;s running behind this site
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <StackRow
              label="Frontend"
              value="Next.js 16 (App Router) on Vercel"
              detail="Server components where possible; client components only for the search bar, results, and filter sheet."
            />
            <StackRow
              label="API"
              value="NestJS on Vercel serverless functions"
              detail="Express handler bootstraps Nest once per cold start and reuses the app across warm invocations. Swagger at /api/docs."
            />
            <StackRow
              label="Database"
              value="Supabase Postgres with pgvector"
              detail="Pooled connection (pgbouncer, port 6543) for runtime queries; direct (5432) for Prisma migrations. HNSW-ready vector column."
            />
            <StackRow
              label="Embeddings"
              value="Gemini gemini-embedding-001"
              detail="768 dimensions via outputDimensionality. RETRIEVAL_DOCUMENT at ingest, RETRIEVAL_QUERY at search."
            />
            <StackRow
              label="Ingestion workers"
              value="BullMQ on Upstash Redis"
              detail="Workers skipped in serverless mode; ingestion runs from a laptop or a Vercel cron POST against a trigger endpoint."
            />
            <StackRow
              label="Observability"
              value="pino structured logs"
              detail="One JSON line per request. Health endpoint reports DB, Redis, and Gemini reachability separately."
            />
          </div>
        </div>
      </section>

      {/* Documentation Sections */}
      <section className="py-12 sm:py-16 border-t border-border bg-secondary/20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl font-semibold text-foreground mb-6">
            Guides
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {sections.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="group block rounded-lg border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                    {section.title}
                  </h3>
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {section.badge}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {section.description}
                </p>
                <div className="mt-3 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Read &rarr;
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Quick commands */}
      <section className="py-12 sm:py-16 border-t border-border bg-background">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl font-semibold text-foreground mb-4">
            Run it locally
          </h2>
          <pre className="overflow-x-auto rounded-lg border border-border bg-secondary/50 p-5 text-sm font-mono text-foreground leading-relaxed">
            <code>{`git clone ${REPO_URL}.git
cd CodeSenseiSearch
docker compose up -d            # Postgres (pgvector) + Redis
pnpm install
pnpm --filter api db:migrate
pnpm dev                        # web on :3000, api on :3001`}</code>
          </pre>
          <p className="mt-3 text-sm text-muted-foreground">
            Full setup including the Gemini API key and other env vars is in
            the repo&apos;s README.
          </p>
        </div>
      </section>
    </>
  );
}

function StackRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="text-[10px] font-mono uppercase tracking-wider text-primary mb-1">
        {label}
      </div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
        {detail}
      </p>
    </div>
  );
}
