import { Metadata } from 'next';
import { SEOMetadata } from '@/lib/seo';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { StructuredData } from '@/components/seo/StructuredData';

export const metadata: Metadata = SEOMetadata.generateMetadata({
  title: 'Python Code Search | Find Functions, Libraries & Django Examples',
  description: 'Search Python code snippets, Django views, Flask apps, and machine learning examples. AI-powered search across GitHub repos and Stack Overflow.',
  keywords: [
    'Python search',
    'Django examples',
    'Flask snippets',
    'Python functions',
    'machine learning code',
    'data science Python',
    'Python libraries',
    'pandas examples'
  ],
  url: 'https://codesenseisearch.com/python',
});

const breadcrumbs = [
  { name: 'Home', href: '/' },
  { name: 'Languages', href: '/languages' },
  { name: 'Python', href: '/python', current: true },
];

const popularSearches = [
  'list comprehension examples',
  'Django model queries',
  'pandas data manipulation',
  'Flask REST API',
  'async Python functions',
  'numpy array operations',
  'Python error handling',
  'matplotlib plotting'
];

const codeExamples = [
  {
    title: 'Django Model with Relationships',
    description: 'Example Django model with foreign keys and many-to-many relationships',
    code: `class Author(models.Model):
    name = models.CharField(max_length=100)
    email = models.EmailField()
    
class Book(models.Model):
    title = models.CharField(max_length=200)
    authors = models.ManyToManyField(Author)
    published_date = models.DateField()
    
    def __str__(self):
        return self.title`,
    tags: ['django', 'models', 'relationships']
  },
  {
    title: 'Pandas Data Analysis',
    description: 'Common pandas operations for data cleaning and analysis',
    code: `import pandas as pd

# Load and clean data
df = pd.read_csv('data.csv')
df = df.dropna()
df['date'] = pd.to_datetime(df['date'])

# Group and analyze
result = df.groupby('category').agg({
    'sales': ['sum', 'mean'],
    'quantity': 'count'
}).round(2)`,
    tags: ['pandas', 'data-analysis', 'python']
  }
];

export default function PythonPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Python Code Search',
    description: 'Search Python code snippets, examples, and documentation',
    url: 'https://codesenseisearch.com/python',
    mainEntity: {
      '@type': 'ItemList',
      name: 'Python Code Examples',
      itemListElement: codeExamples.map((example, index) => ({
        '@type': 'SoftwareSourceCode',
        position: index + 1,
        name: example.title,
        description: example.description,
        programmingLanguage: 'Python',
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
        <div className="bg-linear-to-r from-blue-500 to-purple-600">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <Breadcrumbs items={breadcrumbs} className="mb-8" />
            <div className="text-center">
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
                Python Code Search
              </h1>
              <p className="text-xl text-white/90 max-w-3xl mx-auto mb-8">
                Discover Python functions, Django models, Flask routes, and data science examples 
                with intelligent semantic search across millions of repositories.
              </p>
              
              {/* Search Bar */}
              <div className="max-w-2xl mx-auto">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search Python code examples..."
                    className="w-full px-6 py-4 text-lg rounded-lg border-0 shadow-lg focus:ring-2 focus:ring-purple-500"
                  />
                  <button className="absolute right-2 top-2 bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700 transition-colors">
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
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Popular Python Searches</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {popularSearches.map((search, index) => (
                <button
                  key={index}
                  className="text-left p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow border border-gray-200 hover:border-purple-300"
                >
                  <span className="text-purple-600 font-medium">{search}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Code Examples */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
              Featured Python Examples
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
                          className="px-3 py-1 bg-purple-100 text-purple-800 text-sm rounded-full"
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
              Python Frameworks & Libraries
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-xl font-semibold mb-4 text-green-600">Django</h3>
                <p className="text-gray-600 mb-4">
                  Find Django models, views, templates, and authentication patterns 
                  for building robust web applications.
                </p>
                <ul className="text-sm text-gray-500 space-y-1">
                  <li>• Model relationships</li>
                  <li>• Class-based views</li>
                  <li>• Template patterns</li>
                  <li>• Authentication & permissions</li>
                </ul>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-xl font-semibold mb-4 text-blue-600">Data Science</h3>
                <p className="text-gray-600 mb-4">
                  Explore pandas, numpy, matplotlib, and scikit-learn examples 
                  for data analysis and machine learning.
                </p>
                <ul className="text-sm text-gray-500 space-y-1">
                  <li>• Pandas data manipulation</li>
                  <li>• NumPy operations</li>
                  <li>• Matplotlib visualization</li>
                  <li>• ML model training</li>
                </ul>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-xl font-semibold mb-4 text-red-600">Flask</h3>
                <p className="text-gray-600 mb-4">
                  Discover Flask routes, blueprints, API patterns, and 
                  microservice architectures.
                </p>
                <ul className="text-sm text-gray-500 space-y-1">
                  <li>• Route definitions</li>
                  <li>• Blueprint organization</li>
                  <li>• RESTful APIs</li>
                  <li>• Database integration</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 bg-purple-600 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold mb-6">
              Start Searching Python Code Now
            </h2>
            <p className="text-xl mb-8 opacity-90">
              Join Python developers worldwide using CodeSenseiSearch for better code discovery
            </p>
            <button className="bg-white text-purple-600 px-8 py-3 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors">
              Try Python Search
            </button>
          </div>
        </section>
      </div>
    </>
  );
}