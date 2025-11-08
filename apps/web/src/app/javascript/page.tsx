import { Metadata } from 'next';
import { SEOMetadata } from '@/lib/seo';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { StructuredData } from '@/components/seo/StructuredData';

export const metadata: Metadata = SEOMetadata.generateMetadata({
  title: 'JavaScript Code Search | Find JS Functions, Libraries & Examples',
  description: 'Search JavaScript code snippets, React components, Node.js modules, and TypeScript examples. AI-powered search across GitHub repos and Stack Overflow.',
  keywords: [
    'JavaScript search',
    'React code examples',
    'Node.js snippets',
    'TypeScript search',
    'JS functions',
    'JavaScript libraries',
    'React components',
    'ES6 examples'
  ],
  url: 'https://codesenseisearch.com/javascript',
});

const breadcrumbs = [
  { name: 'Home', href: '/' },
  { name: 'Languages', href: '/languages' },
  { name: 'JavaScript', href: '/javascript', current: true },
];

const popularSearches = [
  'async await examples',
  'React hooks patterns',
  'Express.js middleware',
  'JavaScript array methods',
  'Promise error handling',
  'TypeScript interfaces',
  'React state management',
  'Node.js file upload'
];

const codeExamples = [
  {
    title: 'Async/Await Error Handling',
    description: 'Best practices for error handling with async/await in JavaScript',
    code: `try {
  const result = await fetchData();
  return result;
} catch (error) {
  console.error('Error:', error);
  throw error;
}`,
    tags: ['async', 'error-handling', 'promises']
  },
  {
    title: 'React Custom Hook',
    description: 'Reusable custom hook for API data fetching',
    code: `function useApi(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetch(url)
      .then(res => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [url]);
  
  return { data, loading };
}`,
    tags: ['react', 'hooks', 'api']
  }
];

export default function JavaScriptPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'JavaScript Code Search',
    description: 'Search JavaScript code snippets, examples, and documentation',
    url: 'https://codesenseisearch.com/javascript',
    mainEntity: {
      '@type': 'ItemList',
      name: 'JavaScript Code Examples',
      itemListElement: codeExamples.map((example, index) => ({
        '@type': 'SoftwareSourceCode',
        position: index + 1,
        name: example.title,
        description: example.description,
        programmingLanguage: 'JavaScript',
        codeRepository: 'https://codesenseisearch.com',
        keywords: example.tags.join(', ')
      }))
    }
  };

  return (
    <>
      <StructuredData data={structuredData} />
      <div className="min-h-screen bg-white">
        {/* Header */}
        <div className="bg-linear-to-r from-yellow-400 to-orange-500">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <Breadcrumbs items={breadcrumbs} className="mb-8" />
            <div className="text-center">
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
                JavaScript Code Search
              </h1>
              <p className="text-xl text-white/90 max-w-3xl mx-auto mb-8">
                Find JavaScript functions, React components, Node.js modules, and TypeScript examples 
                with AI-powered semantic search across millions of code repositories.
              </p>
              
              {/* Search Bar */}
              <div className="max-w-2xl mx-auto">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search JavaScript code examples..."
                    className="w-full px-6 py-4 text-lg rounded-lg border-0 shadow-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <button className="absolute right-2 top-2 bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors">
                    Search
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Popular Searches */}
        <section className="py-12 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Popular JavaScript Searches</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {popularSearches.map((search, index) => (
                <button
                  key={index}
                  className="text-left p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow border border-gray-200 hover:border-blue-300"
                >
                  <span className="text-blue-600 font-medium">{search}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Code Examples */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
              Featured JavaScript Examples
            </h2>
            <div className="grid md:grid-cols-2 gap-8">
              {codeExamples.map((example, index) => (
                <div key={index} className="bg-white rounded-lg shadow-lg overflow-hidden">
                  <div className="p-6">
                    <h3 className="text-xl font-semibold mb-2">{example.title}</h3>
                    <p className="text-gray-600 mb-4">{example.description}</p>
                    <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                      <pre className="text-green-400 text-sm">
                        <code>{example.code}</code>
                      </pre>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {example.tags.map((tag) => (
                        <span 
                          key={tag}
                          className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Framework Sections */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
              JavaScript Frameworks & Libraries
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-xl font-semibold mb-4 text-blue-600">React</h3>
                <p className="text-gray-600 mb-4">
                  Find React components, hooks patterns, state management solutions, 
                  and performance optimization techniques.
                </p>
                <ul className="text-sm text-gray-500 space-y-1">
                  <li>• Custom hooks examples</li>
                  <li>• Component patterns</li>
                  <li>• State management</li>
                  <li>• Performance optimization</li>
                </ul>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-xl font-semibold mb-4 text-green-600">Node.js</h3>
                <p className="text-gray-600 mb-4">
                  Discover Node.js modules, Express.js middleware, API patterns, 
                  and server-side JavaScript solutions.
                </p>
                <ul className="text-sm text-gray-500 space-y-1">
                  <li>• Express middleware</li>
                  <li>• Database integration</li>
                  <li>• Authentication patterns</li>
                  <li>• File system operations</li>
                </ul>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-xl font-semibold mb-4 text-purple-600">TypeScript</h3>
                <p className="text-gray-600 mb-4">
                  Explore TypeScript interfaces, generic patterns, utility types, 
                  and type-safe coding examples.
                </p>
                <ul className="text-sm text-gray-500 space-y-1">
                  <li>• Interface definitions</li>
                  <li>• Generic patterns</li>
                  <li>• Utility types</li>
                  <li>• Type guards</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 bg-blue-600 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold mb-6">
              Start Searching JavaScript Code Now
            </h2>
            <p className="text-xl mb-8 opacity-90">
              Join thousands of developers using CodeSenseiSearch to find better code faster
            </p>
            <button className="bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors">
              Try JavaScript Search
            </button>
          </div>
        </section>
      </div>
    </>
  );
}