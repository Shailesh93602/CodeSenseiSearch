import { Metadata } from 'next';
import { SEOMetadata } from '@/lib/seo';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { StructuredData } from '@/components/seo/StructuredData';

export const metadata: Metadata = SEOMetadata.generateMetadata({
  title: 'API Documentation | CodeSenseiSearch REST API Reference',
  description: 'Complete REST API documentation for CodeSenseiSearch. Learn authentication, endpoints, rate limits, and integration examples.',
  keywords: [
    'API documentation',
    'REST API',
    'API reference',
    'developer API',
    'code search API',
    'integration guide',
    'API examples',
    'authentication'
  ],
  url: 'https://codesenseisearch.com/docs/api',
});

const breadcrumbs = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'API Reference', href: '/docs/api', current: true },
];

const endpoints = [
  {
    method: 'GET',
    path: '/api/v1/search',
    description: 'Search for code snippets and documentation',
    parameters: [
      { name: 'q', type: 'string', required: true, description: 'Search query' },
      { name: 'language', type: 'string', required: false, description: 'Programming language filter' },
      { name: 'limit', type: 'integer', required: false, description: 'Number of results (1-100, default: 20)' },
      { name: 'offset', type: 'integer', required: false, description: 'Result offset for pagination' },
      { name: 'sort', type: 'string', required: false, description: 'Sort order: relevance, date, popularity' },
    ],
    example: {
      request: `curl -X GET "https://api.codesenseisearch.com/v1/search?q=async+await&language=javascript&limit=10" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
      response: `{
  "query": "async await",
  "total": 1247,
  "results": [
    {
      "id": "abc123",
      "title": "Async/Await Error Handling Pattern",
      "description": "Best practices for error handling with async/await",
      "language": "javascript",
      "repository": "github.com/user/repo",
      "file_path": "src/utils/api.js",
      "code_snippet": "try {\\n  const result = await fetchData();\\n  return result;\\n} catch (error) {\\n  console.error('Error:', error);\\n  throw error;\\n}",
      "url": "https://github.com/user/repo/blob/main/src/utils/api.js#L15-25",
      "score": 0.95,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "facets": {
    "languages": {
      "javascript": 847,
      "typescript": 400
    },
    "repositories": {
      "github.com": 1200,
      "stackoverflow.com": 47
    }
  },
  "took_ms": 23
}`
    }
  },
  {
    method: 'POST',
    path: '/api/v1/search/feedback',
    description: 'Provide feedback on search results',
    parameters: [
      { name: 'query_id', type: 'string', required: true, description: 'Search query ID' },
      { name: 'result_id', type: 'string', required: true, description: 'Result ID that was clicked' },
      { name: 'action', type: 'string', required: true, description: 'Action: click, copy, helpful, not_helpful' },
    ],
    example: {
      request: `curl -X POST "https://api.codesenseisearch.com/v1/search/feedback" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query_id": "qry_abc123",
    "result_id": "res_def456",
    "action": "click"
  }'`,
      response: `{
  "status": "success",
  "message": "Feedback recorded"
}`
    }
  },
  {
    method: 'GET',
    path: '/api/v1/suggestions',
    description: 'Get search suggestions for autocomplete',
    parameters: [
      { name: 'q', type: 'string', required: true, description: 'Partial query for suggestions' },
      { name: 'limit', type: 'integer', required: false, description: 'Number of suggestions (1-10, default: 5)' },
    ],
    example: {
      request: `curl -X GET "https://api.codesenseisearch.com/v1/suggestions?q=async&limit=5" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
      response: `{
  "suggestions": [
    "async await",
    "async function",
    "async/await error handling",
    "async forEach",
    "async map"
  ]
}`
    }
  }
];

const errorCodes = [
  { code: 400, name: 'Bad Request', description: 'Invalid request parameters' },
  { code: 401, name: 'Unauthorized', description: 'Missing or invalid API key' },
  { code: 403, name: 'Forbidden', description: 'API key does not have required permissions' },
  { code: 429, name: 'Rate Limited', description: 'Too many requests, please slow down' },
  { code: 500, name: 'Internal Error', description: 'Something went wrong on our end' },
];

export default function APIDocsPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: 'CodeSenseiSearch API Documentation',
    description: 'Complete REST API reference for integrating CodeSenseiSearch',
    url: 'https://codesenseisearch.com/docs/api',
    author: {
      '@type': 'Organization',
      name: 'CodeSenseiSearch Team'
    },
    mainEntity: {
      '@type': 'ItemList',
      name: 'API Endpoints',
      itemListElement: endpoints.map((endpoint, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: `${endpoint.method} ${endpoint.path}`,
        description: endpoint.description
      }))
    }
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
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
                API Reference
              </h1>
              <p className="text-xl text-white/90 max-w-3xl mx-auto mb-8">
                RESTful API for integrating CodeSenseiSearch into your applications. 
                Search millions of code examples programmatically.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Start */}
        <section className="py-12 bg-green-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Quick Start</h2>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-semibold mb-4">1. Get Your API Key</h3>
                <div className="bg-white p-4 rounded-lg border">
                  <code className="text-sm text-gray-800">
                    # Sign up and get your API key<br />
                    curl -X POST https://api.codesenseisearch.com/auth/register<br />
                    -d &quot;email=you@example.com&quot;
                  </code>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-4">2. Make Your First Request</h3>
                <div className="bg-white p-4 rounded-lg border">
                  <code className="text-sm text-gray-800">
                    curl -H &quot;Authorization: Bearer YOUR_API_KEY&quot;<br />
                    &quot;https://api.codesenseisearch.com/v1/search?q=hello+world&quot;
                  </code>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Authentication */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Authentication</h2>
            
            <div className="bg-gray-50 p-6 rounded-lg mb-8">
              <p className="text-gray-700 mb-4">
                All API requests require authentication using an API key sent in the Authorization header:
              </p>
              <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-sm">
                Authorization: Bearer YOUR_API_KEY
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-white p-6 rounded-lg border">
                <h3 className="font-semibold mb-3">🔒 Security</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Keep your API key secure and private</li>
                  <li>• Use HTTPS for all requests</li>
                  <li>• Rotate keys regularly</li>
                  <li>• Monitor usage in your dashboard</li>
                </ul>
              </div>
              
              <div className="bg-white p-6 rounded-lg border">
                <h3 className="font-semibold mb-3">📊 Rate Limits</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Free tier: 1,000 requests/month</li>
                  <li>• Pro tier: 100,000 requests/month</li>
                  <li>• Enterprise: Custom limits</li>
                  <li>• Rate limit headers included in responses</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Endpoints */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">API Endpoints</h2>
            
            <div className="space-y-12">
              {endpoints.map((endpoint, index) => (
                <div key={index} className="bg-white rounded-lg shadow-lg overflow-hidden">
                  <div className="p-6 border-b">
                    <div className="flex items-center mb-4">
                      <span className={`px-3 py-1 rounded text-sm font-medium ${
                        endpoint.method === 'GET' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {endpoint.method}
                      </span>
                      <code className="ml-3 text-lg font-mono">{endpoint.path}</code>
                    </div>
                    <p className="text-gray-600">{endpoint.description}</p>
                  </div>
                  
                  <div className="p-6">
                    <h4 className="font-semibold mb-4">Parameters</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">Name</th>
                            <th className="text-left py-2">Type</th>
                            <th className="text-left py-2">Required</th>
                            <th className="text-left py-2">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {endpoint.parameters.map((param, idx) => (
                            <tr key={idx} className="border-b">
                              <td className="py-2 font-mono text-sm">{param.name}</td>
                              <td className="py-2 text-sm text-gray-600">{param.type}</td>
                              <td className="py-2 text-sm">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  param.required ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {param.required ? 'Required' : 'Optional'}
                                </span>
                              </td>
                              <td className="py-2 text-sm text-gray-600">{param.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  <div className="p-6 bg-gray-50">
                    <h4 className="font-semibold mb-4">Example</h4>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <h5 className="text-sm font-medium mb-2">Request</h5>
                        <pre className="bg-gray-900 text-green-400 p-4 rounded text-xs overflow-x-auto">
                          <code>{endpoint.example.request}</code>
                        </pre>
                      </div>
                      <div>
                        <h5 className="text-sm font-medium mb-2">Response</h5>
                        <pre className="bg-gray-900 text-green-400 p-4 rounded text-xs overflow-x-auto">
                          <code>{endpoint.example.response}</code>
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Error Codes */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Error Codes</h2>
            
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Code
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {errorCodes.map((error) => (
                    <tr key={error.code}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {error.code}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {error.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {error.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* SDKs and Libraries */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
              SDKs & Libraries
            </h2>
            
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-white p-6 rounded-lg shadow text-center">
                <h3 className="font-semibold mb-2">JavaScript/Node.js</h3>
                <code className="text-sm bg-gray-100 px-2 py-1 rounded">npm install @codesenseisearch/sdk</code>
                <a href="/docs/sdk/javascript" className="block mt-3 text-blue-600 hover:text-blue-800">
                  View Documentation →
                </a>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow text-center">
                <h3 className="font-semibold mb-2">Python</h3>
                <code className="text-sm bg-gray-100 px-2 py-1 rounded">pip install codesenseisearch</code>
                <a href="/docs/sdk/python" className="block mt-3 text-blue-600 hover:text-blue-800">
                  View Documentation →
                </a>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow text-center">
                <h3 className="font-semibold mb-2">cURL</h3>
                <code className="text-sm bg-gray-100 px-2 py-1 rounded">Direct HTTP requests</code>
                <a href="/docs/examples/curl" className="block mt-3 text-blue-600 hover:text-blue-800">
                  View Examples →
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}