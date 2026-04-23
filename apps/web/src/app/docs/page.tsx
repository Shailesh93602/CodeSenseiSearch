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
      <div className="min-h-screen bg-white">
        {/* Header */}
        <div className="bg-linear-to-r from-slate-900 to-slate-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <Breadcrumbs items={breadcrumbs} className="mb-8" />
            <div className="text-center">
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
                Documentation
              </h1>
              <p className="text-lg text-slate-300 max-w-3xl mx-auto">
                How the stack is put together, how to call the API, and how
                to run it yourself. The source of truth is the repo — these
                pages are summaries with runnable examples.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 transition-colors"
                >
                  View repo on GitHub
                </a>
                <Link
                  href="/search"
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 transition-colors"
                >
                  Try the search
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Stack summary */}
        <section className="py-12 bg-slate-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6 text-center">
              What&apos;s running behind this site
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
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
                value="Gemini text-embedding-004"
                detail="768 dimensions. RETRIEVAL_DOCUMENT task type at ingest, RETRIEVAL_QUERY at search time."
              />
              <StackRow
                label="Ingestion workers"
                value="BullMQ on Upstash Redis"
                detail="Workers skipped in serverless mode; ingestion runs from a laptop or a Vercel cron POST against a trigger endpoint."
              />
              <StackRow
                label="Observability"
                value="pino structured logs + Sentry"
                detail="One JSON line per request. Health endpoint reports DB, Redis, and Gemini reachability separately."
              />
            </div>
          </div>
        </section>

        {/* Documentation Sections */}
        <section className="py-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-10 text-center">
              Guides
            </h2>

            <div className="grid md:grid-cols-2 gap-6">
              {sections.map((section) => (
                <Link
                  key={section.href}
                  href={section.href}
                  className="group block rounded-lg border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xl font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {section.title}
                    </h3>
                    <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {section.badge}
                    </span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    {section.description}
                  </p>
                  <div className="mt-4 text-sm font-medium text-blue-600 group-hover:text-blue-800">
                    Read &rarr;
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Quick commands */}
        <section className="py-16 bg-slate-900 text-slate-100">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold mb-6 text-center">
              Run it locally
            </h2>
            <pre className="overflow-x-auto rounded-lg bg-black/40 p-6 text-sm text-slate-100">
              <code>{`git clone ${REPO_URL}.git
cd CodeSenseiSearch

# Spin up Postgres (with pgvector) + Redis
docker compose up -d

# Install + generate Prisma client + migrate
pnpm install
pnpm --filter api db:migrate

# Run the API and the web UI in parallel
pnpm dev`}</code>
            </pre>
            <p className="mt-4 text-sm text-slate-400 text-center">
              Full setup notes including Gemini API key and env vars are in
              the repo&apos;s README.
            </p>
          </div>
        </section>
      </div>
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
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="text-xs font-mono uppercase tracking-wide text-blue-600">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold text-slate-900">
        {value}
      </div>
      <p className="mt-2 text-sm text-slate-600 leading-relaxed">{detail}</p>
    </div>
  );
}
