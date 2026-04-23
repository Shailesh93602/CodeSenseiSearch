import { Metadata } from 'next';
import { SEOMetadata } from '@/lib/seo';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { StructuredData } from '@/components/seo/StructuredData';

export const metadata: Metadata = SEOMetadata.generateMetadata({
  title: 'Integration Guide | CodeSenseiSearch',
  description:
    'How to call the CodeSenseiSearch API from your own app, and how to run the full stack locally with Docker Compose.',
  keywords: [
    'integration',
    'fetch API',
    'curl examples',
    'local development',
    'docker compose',
  ],
  url: 'https://code-sensei-search-web.vercel.app/docs/integration',
});

const API_BASE = 'https://code-sensei-search-api.vercel.app/api';
const REPO_URL = 'https://github.com/Shailesh93602/CodeSenseiSearch';

const breadcrumbs = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'Integration Guide', href: '/docs/integration', current: true },
];

export default function IntegrationPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: 'CodeSenseiSearch Integration Guide',
    description:
      'Calling the CodeSenseiSearch API from client apps, and running the stack locally.',
    url: 'https://code-sensei-search-web.vercel.app/docs/integration',
    author: { '@type': 'Person', name: 'Shailesh Chaudhari' },
  };

  return (
    <>
      <StructuredData data={structuredData} />
      <div className="min-h-screen bg-white">
        {/* Header */}
        <div className="bg-linear-to-r from-purple-600 to-blue-600">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <Breadcrumbs items={breadcrumbs} className="mb-8" />
            <div className="text-center">
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
                Integration Guide
              </h1>
              <p className="text-lg text-white/90 max-w-3xl mx-auto">
                This is a portfolio reference build — there&apos;s no SDK to
                install. Integration is &ldquo;call the REST API over HTTPS
                from your own code.&rdquo; These examples walk through the
                common client flows and show how to run the full stack
                locally.
              </p>
            </div>
          </div>
        </div>

        {/* Calling the API */}
        <section className="py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-8">
              Calling the deployed API
            </h2>

            <div className="space-y-10">
              <Snippet
                title="Browser / fetch"
                description="From the browser or any fetch-compatible runtime. Same origin to the deployed web app OR an origin allow-listed via the API's FRONTEND_URL env var."
                code={`const res = await fetch(
  "${API_BASE}/search/hybrid",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: "useEffect cleanup",
      options: { limit: 10 },
    }),
  },
);

const { data } = await res.json();
console.log(data.results);`}
              />

              <Snippet
                title="Node.js (without next/react)"
                description="Pure Node script. No SDK — just native fetch (Node 18+)."
                code={`import { setTimeout as sleep } from "node:timers/promises";

async function search(q) {
  const res = await fetch("${API_BASE}/search/hybrid", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: q, options: { limit: 5 } }),
  });
  if (!res.ok) throw new Error(\`\${res.status}\`);
  return (await res.json()).data;
}

const { results } = await search("pgvector HNSW");
results.forEach((r) => console.log(r.title, r.similarity));`}
              />

              <Snippet
                title="Python"
                description="Python 3.10+ with `requests` or `httpx`."
                code={`import requests

r = requests.post(
    "${API_BASE}/search/hybrid",
    json={"query": "async await vs promises", "options": {"limit": 5}},
    timeout=15,
)
r.raise_for_status()
for hit in r.json()["data"]["results"]:
    print(hit["title"], hit.get("similarity"))`}
              />

              <Snippet
                title="curl"
                description="For one-off sanity checks or shell pipelines."
                code={`curl -X POST ${API_BASE}/search/hybrid \\
  -H "content-type: application/json" \\
  -d '{"query":"JWT refresh token rotation","options":{"limit":5}}' \\
  | jq '.data.results[] | {title, similarity}'`}
              />
            </div>
          </div>
        </section>

        {/* Local dev */}
        <section className="py-16 bg-slate-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-3">
              Running the stack locally
            </h2>
            <p className="text-slate-600 mb-8">
              You can clone the repo and run everything end-to-end on your
              machine. You&apos;ll need Docker, Node 20+, and pnpm 10.
            </p>

            <div className="space-y-8">
              <Snippet
                title="1. Clone and install"
                description="The monorepo uses pnpm workspaces."
                code={`git clone ${REPO_URL}.git
cd CodeSenseiSearch
pnpm install`}
              />

              <Snippet
                title="2. Start Postgres (pgvector) + Redis"
                description="docker-compose.yml at the repo root brings up both. Ports map to the defaults (5432 / 6379)."
                code={`docker compose up -d

# Check they're running
docker compose ps`}
              />

              <Snippet
                title="3. Configure env vars for the API"
                description={`Copy the example file, fill in your Gemini API key. Leave the other defaults unless you changed the docker-compose ports.`}
                code={`cd apps/api
cp .env.example .env

# Edit .env:
#   GEMINI_API_KEY=...           (required for embeddings)
#   DATABASE_URL=...             (defaults match docker-compose)
#   DIRECT_URL=...               (same host as DATABASE_URL)
#   REDIS_HOST=localhost REDIS_PORT=6379`}
              />

              <Snippet
                title="4. Generate Prisma client + apply migrations"
                description="Writes the client to apps/api/src/generated/prisma. Migrations create the tables + the pgvector extension."
                code={`pnpm --filter api db:generate
pnpm --filter api db:migrate`}
              />

              <Snippet
                title="5. Run both apps in parallel"
                description="The web app assumes the API is on http://localhost:3001/api (set via NEXT_PUBLIC_API_URL). If you changed ports, edit apps/web/.env.local."
                code={`# From the repo root
pnpm dev

# Or run them individually
pnpm --filter api dev     # http://localhost:3001
pnpm --filter web dev     # http://localhost:3000`}
              />
            </div>
          </div>
        </section>

        {/* What's NOT here */}
        <section className="py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-6">
              What this project intentionally doesn&apos;t ship
            </h2>
            <p className="text-slate-600 mb-6">
              Keeping the scope honest: there&apos;s no VS Code extension, no
              JetBrains plugin, no Slack bot, no hosted SDK package. Those
              would be separate projects. The contract is the REST API
              documented at{' '}
              <a
                href="/docs/api"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                /docs/api
              </a>
              — anything you&apos;d want to build on top lives in your own
              code.
            </p>
            <p className="text-slate-600">
              If you need autocomplete while building against the API, hit
              the live Swagger UI at{' '}
              <a
                href={`${API_BASE}/docs`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                {API_BASE}/docs
              </a>{' '}
              and generate a client from the OpenAPI spec with whatever
              tool you prefer (openapi-typescript, openapi-generator, etc).
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

function Snippet({
  title,
  description,
  code,
}: {
  title: string;
  description: string;
  code: string;
}) {
  return (
    <div>
      <h3 className="text-xl font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-600 mb-3 leading-relaxed">
        {description}
      </p>
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-5 text-sm text-green-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}
