import { Metadata } from 'next';
import { SEOMetadata } from '@/lib/seo';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { StructuredData } from '@/components/seo/StructuredData';

export const metadata: Metadata = SEOMetadata.generateMetadata({
  title: 'React Code Search | Find Components, Hooks & Next.js Examples',
  description: 'Search React components, custom hooks, Next.js patterns, and TypeScript examples. AI-powered search across GitHub repos and developer resources.',
  keywords: [
    'React components',
    'React hooks',
    'Next.js examples',
    'React patterns',
    'custom hooks',
    'React TypeScript',
    'component library',
    'React state management'
  ],
  url: 'https://codesenseisearch.com/react',
});

const breadcrumbs = [
  { name: 'Home', href: '/' },
  { name: 'Frameworks', href: '/frameworks' },
  { name: 'React', href: '/react', current: true },
];

const popularSearches = [
  'useEffect cleanup',
  'custom hook patterns',
  'React context provider',
  'Next.js API routes',
  'React form validation',
  'useReducer examples',
  'React lazy loading',
  'error boundary pattern'
];

const codeExamples = [
  {
    title: 'Custom Data Fetching Hook',
    description: 'Reusable hook for API calls with loading and error states',
    code: `function useApiData<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch');
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [url]);

  return { data, loading, error };
}`,
    tags: ['hooks', 'typescript', 'api']
  },
  {
    title: 'React Context with Reducer',
    description: 'Global state management pattern using Context and useReducer',
    code: `interface State {
  user: User | null;
  theme: 'light' | 'dark';
}

type Action = 
  | { type: 'SET_USER'; payload: User }
  | { type: 'TOGGLE_THEME' };

const AppContext = createContext<{
  state: State;
  dispatch: Dispatch<Action>;
} | null>(null);

function appReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'TOGGLE_THEME':
      return { 
        ...state, 
        theme: state.theme === 'light' ? 'dark' : 'light' 
      };
    default:
      return state;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, {
    user: null,
    theme: 'light'
  });

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}`,
    tags: ['context', 'state-management', 'patterns']
  }
];

const frameworks = [
  {
    name: 'Next.js',
    description: 'Full-stack React framework with SSR, routing, and API routes',
    color: 'black',
    features: ['App Router patterns', 'Server Components', 'API routes', 'Middleware']
  },
  {
    name: 'Gatsby',
    description: 'Static site generator for blazing fast React websites',
    color: 'purple',
    features: ['GraphQL queries', 'Plugin ecosystem', 'Static generation', 'Image optimization']
  },
  {
    name: 'Remix',
    description: 'Full-stack web framework focused on web standards',
    color: 'blue',
    features: ['Nested routing', 'Data loading', 'Form handling', 'Error boundaries']
  }
];

export default function ReactPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'React Code Search',
    description: 'Search React components, hooks, and framework examples',
    url: 'https://codesenseisearch.com/react',
    mainEntity: {
      '@type': 'ItemList',
      name: 'React Code Examples',
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
        <div className="bg-linear-to-r from-cyan-500 to-blue-600">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <Breadcrumbs items={breadcrumbs} className="mb-8" />
            <div className="text-center">
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
                React Code Search
              </h1>
              <p className="text-xl text-white/90 max-w-3xl mx-auto mb-8">
                Find React components, custom hooks, Next.js patterns, and TypeScript examples 
                with AI-powered search across the React ecosystem.
              </p>
              
              {/* Search Bar */}
              <div className="max-w-2xl mx-auto">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search React components and hooks..."
                    className="w-full px-6 py-4 text-lg rounded-lg border-0 shadow-lg focus:ring-2 focus:ring-cyan-500"
                  />
                  <button className="absolute right-2 top-2 bg-cyan-600 text-white px-6 py-2 rounded-md hover:bg-cyan-700 transition-colors">
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
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Popular React Searches</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {popularSearches.map((search, index) => (
                <button
                  key={index}
                  className="text-left p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow border border-gray-200 hover:border-cyan-300"
                >
                  <span className="text-cyan-600 font-medium">{search}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Code Examples */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
              Featured React Examples
            </h2>
            <div className="space-y-8">
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
                          className="px-3 py-1 bg-cyan-100 text-cyan-800 text-sm rounded-full"
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

        {/* React Frameworks */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
              React Frameworks & Metaframeworks
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              {frameworks.map((framework) => (
                <div key={framework.name} className="bg-white p-6 rounded-lg shadow">
                  <h3 className={`text-xl font-semibold mb-4 text-${framework.color}-600`}>
                    {framework.name}
                  </h3>
                  <p className="text-gray-600 mb-4">{framework.description}</p>
                  <ul className="text-sm text-gray-500 space-y-1">
                    {framework.features.map((feature) => (
                      <li key={feature}>• {feature}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* React Patterns */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
              Common React Patterns
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                'Custom Hooks',
                'Higher-Order Components',
                'Render Props',
                'Compound Components',
                'Provider Pattern',
                'Error Boundaries',
                'Code Splitting',
                'Lazy Loading'
              ].map((pattern) => (
                <div key={pattern} className="text-center p-6 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">{pattern}</h3>
                  <p className="text-sm text-gray-600">Find examples and implementations</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 bg-cyan-600 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold mb-6">
              Start Searching React Code Now
            </h2>
            <p className="text-xl mb-8 opacity-90">
              Join React developers worldwide using CodeSenseiSearch for component discovery
            </p>
            <button className="bg-white text-cyan-600 px-8 py-3 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors">
              Try React Search
            </button>
          </div>
        </section>
      </div>
    </>
  );
}