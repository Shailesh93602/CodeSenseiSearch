import { Metadata } from 'next';
import Link from 'next/link';
import { SEOMetadata } from '@/lib/seo';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { StructuredData } from '@/components/seo/StructuredData';

export const metadata: Metadata = SEOMetadata.generateMetadata({
  title: 'Programming Languages | Code Search for All Languages',
  description: 'Search code examples across all programming languages. Find Python, JavaScript, React, Java, C++, Go, Rust, and more with AI-powered semantic search.',
  keywords: [
    'programming languages',
    'code search',
    'multi-language search',
    'Python code',
    'JavaScript examples',
    'Java snippets',
    'C++ code',
    'Go programming',
    'Rust examples'
  ],
  url: 'https://codesenseisearch.com/languages',
});

const breadcrumbs = [
  { name: 'Home', href: '/' },
  { name: 'Languages', href: '/languages', current: true },
];

const languages = [
  {
    name: 'JavaScript',
    description: 'Modern JavaScript, ES6+, Node.js, and browser APIs',
    href: '/javascript',
    color: 'yellow',
    popularity: 95,
    features: ['ES6+ syntax', 'Async/await', 'DOM manipulation', 'Node.js modules'],
    stats: { repos: '2.1M', snippets: '850K' }
  },
  {
    name: 'Python',
    description: 'Django, Flask, data science, and machine learning code',
    href: '/python',
    color: 'blue',
    popularity: 90,
    features: ['Django models', 'Pandas analysis', 'ML algorithms', 'API development'],
    stats: { repos: '1.8M', snippets: '720K' }
  },
  {
    name: 'React',
    description: 'Components, hooks, Next.js, and TypeScript patterns',
    href: '/react',
    color: 'cyan',
    popularity: 85,
    features: ['Custom hooks', 'Component patterns', 'State management', 'SSR/SSG'],
    stats: { repos: '950K', snippets: '420K' }
  },
  {
    name: 'Java',
    description: 'Spring Boot, enterprise patterns, and Android development',
    href: '/java',
    color: 'red',
    popularity: 80,
    features: ['Spring framework', 'Design patterns', 'JPA/Hibernate', 'Android SDK'],
    stats: { repos: '1.5M', snippets: '680K' }
  },
  {
    name: 'TypeScript',
    description: 'Type definitions, interfaces, and advanced type patterns',
    href: '/typescript',
    color: 'blue',
    popularity: 75,
    features: ['Type definitions', 'Generic patterns', 'Utility types', 'Decorators'],
    stats: { repos: '800K', snippets: '350K' }
  },
  {
    name: 'Go',
    description: 'Concurrent programming, web services, and cloud applications',
    href: '/go',
    color: 'cyan',
    popularity: 70,
    features: ['Goroutines', 'HTTP servers', 'CLI tools', 'Microservices'],
    stats: { repos: '450K', snippets: '180K' }
  },
  {
    name: 'Rust',
    description: 'Memory safety, performance, and systems programming',
    href: '/rust',
    color: 'orange',
    popularity: 65,
    features: ['Memory safety', 'Async programming', 'WebAssembly', 'CLI tools'],
    stats: { repos: '250K', snippets: '95K' }
  },
  {
    name: 'C++',
    description: 'Modern C++, STL, algorithms, and performance optimization',
    href: '/cpp',
    color: 'purple',
    popularity: 60,
    features: ['Modern C++17/20', 'STL containers', 'Template patterns', 'Performance'],
    stats: { repos: '1.2M', snippets: '520K' }
  }
];

const categories = [
  {
    name: 'Web Development',
    languages: ['JavaScript', 'TypeScript', 'React', 'Python'],
    description: 'Frontend and backend web development technologies'
  },
  {
    name: 'Data Science',
    languages: ['Python', 'R', 'Julia', 'SQL'],
    description: 'Data analysis, machine learning, and statistical computing'
  },
  {
    name: 'Systems Programming',
    languages: ['Rust', 'C++', 'Go', 'C'],
    description: 'Low-level programming, performance, and systems development'
  },
  {
    name: 'Mobile Development',
    languages: ['Java', 'Kotlin', 'Swift', 'Dart'],
    description: 'Android and iOS mobile application development'
  }
];

export default function LanguagesPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Programming Languages Code Search',
    description: 'Search code examples across all programming languages',
    url: 'https://codesenseisearch.com/languages',
    mainEntity: {
      '@type': 'ItemList',
      name: 'Programming Languages',
      itemListElement: languages.map((lang, index) => ({
        '@type': 'SoftwareApplication',
        position: index + 1,
        name: lang.name,
        description: lang.description,
        url: `https://codesenseisearch.com${lang.href}`,
        applicationCategory: 'Programming Language'
      }))
    }
  };

  return (
    <>
      <StructuredData data={structuredData} />
      <div className="min-h-screen bg-white">
        {/* Header */}
        <div className="bg-linear-to-r from-indigo-600 to-purple-600">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <Breadcrumbs items={breadcrumbs} className="mb-8" />
            <div className="text-center">
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
                Programming Languages
              </h1>
              <p className="text-xl text-white/90 max-w-3xl mx-auto mb-8">
                Search code examples across all programming languages with AI-powered 
                semantic understanding. From Python to Rust, find the perfect code snippet.
              </p>
            </div>
          </div>
        </div>

        {/* Language Grid */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
              Supported Programming Languages
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {languages.map((language) => (
                <Link
                  key={language.name}
                  href={language.href}
                  className="group bg-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 overflow-hidden border hover:border-indigo-300"
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
                        {language.name}
                      </h3>
                      <div className="text-right">
                        <div className="text-sm text-gray-500">Popularity</div>
                        <div className="font-semibold text-indigo-600">{language.popularity}%</div>
                      </div>
                    </div>
                    
                    <p className="text-gray-600 mb-4">{language.description}</p>
                    
                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                      <div className="text-center p-2 bg-gray-50 rounded">
                        <div className="font-semibold text-gray-900">{language.stats.repos}</div>
                        <div className="text-gray-500">Repositories</div>
                      </div>
                      <div className="text-center p-2 bg-gray-50 rounded">
                        <div className="font-semibold text-gray-900">{language.stats.snippets}</div>
                        <div className="text-gray-500">Snippets</div>
                      </div>
                    </div>
                    
                    {/* Features */}
                    <div className="space-y-1">
                      {language.features.map((feature) => (
                        <div key={feature} className="text-sm text-gray-600 flex items-center">
                          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full mr-2"></span>
                          {feature}
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-4 text-indigo-600 font-medium group-hover:text-indigo-800 transition-colors">
                      Search {language.name} code →
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Categories */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
              Browse by Category
            </h2>
            <div className="grid md:grid-cols-2 gap-8">
              {categories.map((category) => (
                <div key={category.name} className="bg-white p-6 rounded-lg shadow">
                  <h3 className="text-xl font-semibold mb-3">{category.name}</h3>
                  <p className="text-gray-600 mb-4">{category.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {category.languages.map((lang) => (
                      <span 
                        key={lang}
                        className="px-3 py-1 bg-indigo-100 text-indigo-800 text-sm rounded-full"
                      >
                        {lang}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Search Features */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                Why Choose CodeSenseiSearch?
              </h2>
              <p className="text-xl text-gray-600 max-w-3xl mx-auto">
                Our AI understands code across all languages, providing contextual 
                search results that match your programming intent.
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🧠</span>
                </div>
                <h3 className="text-lg font-semibold mb-2">AI-Powered Understanding</h3>
                <p className="text-gray-600">
                  Semantic search that understands programming concepts, not just keywords
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">⚡</span>
                </div>
                <h3 className="text-lg font-semibold mb-2">Lightning Fast</h3>
                <p className="text-gray-600">
                  Get results in milliseconds across millions of code repositories
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🎯</span>
                </div>
                <h3 className="text-lg font-semibold mb-2">Highly Relevant</h3>
                <p className="text-gray-600">
                  Advanced ranking algorithms ensure the most relevant results first
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 bg-indigo-600 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold mb-6">
              Start Searching Any Programming Language
            </h2>
            <p className="text-xl mb-8 opacity-90">
              Join developers worldwide who trust CodeSenseiSearch for finding better code faster
            </p>
            <div className="flex justify-center space-x-4">
              <button className="bg-white text-indigo-600 px-8 py-3 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors">
                Start Searching
              </button>
              <button className="border-2 border-white text-white px-8 py-3 rounded-lg font-semibold text-lg hover:bg-white hover:text-indigo-600 transition-colors">
                View Documentation
              </button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}