import { Metadata } from 'next';
import { SEOMetadata } from '@/lib/seo';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { StructuredData } from '@/components/seo/StructuredData';

export const metadata: Metadata = SEOMetadata.generateMetadata({
  title: 'API Reference | CodeSenseiSearch',
  description:
    'REST API reference for CodeSenseiSearch — endpoint shapes, request/response schemas, and curl examples.',
  keywords: [
    'API documentation',
    'REST API',
    'code search API',
    'semantic search',
    'pgvector',
  ],
  url: 'https://code-sensei-search-web.vercel.app/docs/api',
});

const API_BASE = 'https://code-sensei-search-api.vercel.app/api';

const breadcrumbs = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'API Reference', href: '/docs/api', current: true },
];

interface Endpoint {
  method: 'GET' | 'POST';
  path: string;
  description: string;
  request: string;
  response: string;
}

const endpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/api/health',
    description:
      'Liveness + dependency reachability probe. Reports DB, Redis, and Gemini status independently. 200 when DB + Redis are up; 503 otherwise.',
    request: `curl ${API_BASE}/health`,
    response: `{
  "status": "ok",
  "timestamp": "2026-04-23T...",
  "service": "CodeSenseiSearch API",
  "version": "0.1.0",
  "uptimeSec": 42,
  "components": {
    "database": { "status": "up", "latencyMs": 21 },
    "redis":    { "status": "up", "latencyMs": 2 },
    "gemini":   { "status": "up" }
  }
}`,
  },
  {
    method: 'POST',
    path: '/api/search/hybrid',
    description:
      'Recommended default. Runs vector + full-text search in parallel, merges them with a configurable weighted score (default 0.6 vector / 0.4 text), and reranks the top K.',
    request: `curl -X POST ${API_BASE}/search/hybrid \\
  -H "content-type: application/json" \\
  -d '{
    "query": "useEffect cleanup",
    "options": {
      "limit": 10,
      "vectorWeight": 0.6,
      "textWeight": 0.4
    }
  }'`,
    response: `{
  "success": true,
  "data": {
    "query": "useEffect cleanup",
    "results": [
      {
        "id": "ckn...",
        "chunkText": "A useEffect cleanup runs on two occasions...",
        "similarity": 0.87,
        "source": "documentation",
        "language": "javascript",
        "title": "How do React useEffect cleanup functions work?"
      }
    ],
    "totalResults": 10,
    "searchTime": 112,
    "searchMethod": "hybrid",
    "metadata": {
      "embeddingGenerated": true,
      "vectorSearchUsed":   true,
      "textSearchUsed":     true,
      "vectorResults": 12,
      "textResults":   8,
      "mergedResults": 10
    }
  }
}`,
  },
  {
    method: 'POST',
    path: '/api/search/semantic',
    description:
      'Vector-only search. Embeds the query with Gemini RETRIEVAL_QUERY and returns top-K by cosine similarity against stored chunk embeddings.',
    request: `curl -X POST ${API_BASE}/search/semantic \\
  -H "content-type: application/json" \\
  -d '{"query": "distributed lock with Redis", "options": {"limit": 5}}'`,
    response: `{
  "success": true,
  "data": {
    "query": "distributed lock with Redis",
    "results": [ /* similar shape to hybrid, but no text-search metadata */ ],
    "totalResults": 5,
    "searchMethod": "semantic"
  }
}`,
  },
  {
    method: 'POST',
    path: '/api/search/text',
    description:
      'Full-text search via Postgres tsvector + ts_rank. Useful when you already know the keywords and want lexical precision.',
    request: `curl -X POST ${API_BASE}/search/text \\
  -H "content-type: application/json" \\
  -d '{"query": "pgvector HNSW", "options": {"limit": 5}}'`,
    response: `{
  "success": true,
  "data": {
    "query": "pgvector HNSW",
    "results": [ /* ... */ ],
    "totalResults": 3,
    "searchMethod": "text"
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/search/suggestions',
    description:
      'Autocomplete hints for the search bar. Returns an array of suggested completions based on the prefix. Pass at least 2 chars.',
    request: `curl "${API_BASE}/search/suggestions?q=react"`,
    response: `{
  "success": true,
  "data": {
    "query": "react",
    "suggestions": ["react useEffect", "react server components"]
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/search/stats',
    description:
      'Corpus-wide counts. Chunks, chunks-with-embeddings, per-content-type split, and the list of languages present in the index.',
    request: `curl ${API_BASE}/search/stats`,
    response: `{
  "success": true,
  "data": {
    "totalChunks": 15,
    "chunksWithEmbeddings": 15,
    "embeddingCoverage": 1.0,
    "repositoryChunks": 0,
    "questionChunks": 0,
    "availableLanguages": ["javascript", "typescript", "python", "go", "rust"]
  }
}`,
  },
];

const errorCodes = [
  { code: 400, name: 'Bad Request', description: 'Missing `query` or invalid options' },
  {
    code: 403,
    name: 'Forbidden',
    description: 'Only applies to guarded operator routes (/api/seed, /api/admin)',
  },
  {
    code: 429,
    name: 'Too Many Requests',
    description:
      'Global rate limit of 60 requests per minute per IP is in effect on all routes',
  },
  { code: 500, name: 'Internal Error', description: 'Unexpected server fault; check /api/health' },
  {
    code: 503,
    name: 'Service Unavailable',
    description:
      'Returned by /api/health when either the DB or Redis is down; transient, worth retrying',
  },
];

export default function APIDocsPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: 'CodeSenseiSearch API Reference',
    description: 'REST API reference for CodeSenseiSearch endpoints',
    url: 'https://code-sensei-search-web.vercel.app/docs/api',
    author: { '@type': 'Person', name: 'Shailesh Chaudhari' },
    mainEntity: {
      '@type': 'ItemList',
      name: 'API Endpoints',
      itemListElement: endpoints.map((endpoint, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: `${endpoint.method} ${endpoint.path}`,
        description: endpoint.description,
      })),
    },
  };

  return (
    <>
      <StructuredData data={structuredData} />
      <div className="min-h-screen bg-white">
        {/* Header */}
        <div className="bg-linear-to-r from-green-600 to-blue-600">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <Breadcrumbs items={breadcrumbs} className="mb-8" />
            <div className="text-center">
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
                API Reference
              </h1>
              <p className="text-lg text-white/90 max-w-3xl mx-auto">
                The deployed API serves all endpoints below at{' '}
                <code className="rounded bg-white/15 px-2 py-0.5 font-mono text-sm">
                  {API_BASE}
                </code>
                . Swagger UI with live schemas is at{' '}
                <a
                  href={`${API_BASE}/docs`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-white"
                >
                  /api/docs
                </a>
                .
              </p>
            </div>
          </div>
        </div>

        {/* Conventions */}
        <section className="py-12 bg-slate-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">
              Conventions
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-lg border border-slate-200">
                <h3 className="font-semibold mb-2">No auth on search</h3>
                <p className="text-sm text-slate-600">
                  The search, suggestions, and stats endpoints are public. Authentication is only required for admin and ingestion trigger routes (not documented here).
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg border border-slate-200">
                <h3 className="font-semibold mb-2">Rate limit</h3>
                <p className="text-sm text-slate-600">
                  Global limit is 60 requests per minute per IP, enforced by NestJS Throttler. Requests that exceed the window get 429 with the standard rate-limit headers.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg border border-slate-200">
                <h3 className="font-semibold mb-2">Response envelope</h3>
                <p className="text-sm text-slate-600">
                  Successful responses wrap the payload in{' '}
                  <code className="font-mono text-xs">{'{ success: true, data: ... }'}</code>. Errors follow NestJS&apos;s standard{' '}
                  <code className="font-mono text-xs">{'{ statusCode, message }'}</code> shape.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg border border-slate-200">
                <h3 className="font-semibold mb-2">CORS</h3>
                <p className="text-sm text-slate-600">
                  Allowed origin is set via the <code className="font-mono text-xs">FRONTEND_URL</code> env var on the API. For local development, add your origin to the same var and redeploy, or run the API locally.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Endpoints */}
        <section className="py-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-10">
              Endpoints
            </h2>
            <div className="space-y-8">
              {endpoints.map((endpoint) => (
                <div
                  key={`${endpoint.method}-${endpoint.path}`}
                  className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden"
                >
                  <div className="p-6 border-b border-slate-100">
                    <div className="flex items-center gap-3 mb-3">
                      <span
                        className={`rounded px-2.5 py-1 text-xs font-semibold ${
                          endpoint.method === 'GET'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {endpoint.method}
                      </span>
                      <code className="font-mono text-base text-slate-900">
                        {endpoint.path}
                      </code>
                    </div>
                    <p className="text-slate-600 leading-relaxed">
                      {endpoint.description}
                    </p>
                  </div>
                  <div className="grid md:grid-cols-2">
                    <div className="p-6 bg-slate-50 border-r border-slate-100">
                      <h4 className="text-sm font-semibold text-slate-700 mb-3">
                        Request
                      </h4>
                      <pre className="overflow-x-auto rounded bg-slate-900 p-4 text-xs text-green-300">
                        <code>{endpoint.request}</code>
                      </pre>
                    </div>
                    <div className="p-6 bg-slate-50">
                      <h4 className="text-sm font-semibold text-slate-700 mb-3">
                        Response
                      </h4>
                      <pre className="overflow-x-auto rounded bg-slate-900 p-4 text-xs text-green-300">
                        <code>{endpoint.response}</code>
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Error Codes */}
        <section className="py-16 bg-slate-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-8">
              Status codes
            </h2>
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <table className="min-w-full">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Code
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {errorCodes.map((error) => (
                    <tr key={error.code}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-900">
                        {error.code}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                        {error.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {error.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
