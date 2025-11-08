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

const sections = [
  {
    title: 'Getting Started',
    description: 'Quick start guide to using CodeSenseiSearch effectively',
    href: '/docs/getting-started',
    icon: '🚀',
    topics: [
      'Basic search techniques',
      'Understanding search results',
      'Filtering and sorting',
      'Creating your first search'
    ]
  },
  {
    title: 'API Reference',
    description: 'Complete REST API documentation with examples',
    href: '/docs/api',
    icon: '📚',
    topics: [
      'Authentication',
      'Search endpoints',
      'Rate limiting',
      'Response formats'
    ]
  },
  {
    title: 'Integration Guide',
    description: 'Integrate CodeSenseiSearch into your development workflow',
    href: '/docs/integration',
    icon: '🔧',
    topics: [
      'IDE extensions',
      'CLI tools',
      'Webhook integration',
      'Custom implementations'
    ]
  },
  {
    title: 'Advanced Search',
    description: 'Master advanced search techniques and operators',
    href: '/docs/advanced-search',
    icon: '🎯',
    topics: [
      'Search operators',
      'Language-specific filters',
      'Code pattern matching',
      'Semantic queries'
    ]
  },
  {
    title: 'Use Cases',
    description: 'Real-world examples and common usage patterns',
    href: '/docs/use-cases',
    icon: '💡',
    topics: [
      'Code review assistance',
      'Learning new frameworks',
      'Bug fixing workflows',
      'API discovery'
    ]
  },
  {
    title: 'Troubleshooting',
    description: 'Common issues and their solutions',
    href: '/docs/troubleshooting',
    icon: '🛠️',
    topics: [
      'Search not returning results',
      'Performance issues',
      'Authentication problems',
      'Feature requests'
    ]
  }
];

const quickLinks = [
  { name: 'Search JavaScript Code', href: '/javascript' },
  { name: 'Search Python Examples', href: '/python' },
  { name: 'Search React Components', href: '/react' },
  { name: 'API Endpoints', href: '/docs/api' },
  { name: 'Code Examples', href: '/docs/examples' },
  { name: 'Community Forum', href: '/community' }
];

export default function DocsPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: 'CodeSenseiSearch Documentation',
    description: 'Complete documentation for CodeSenseiSearch API and integration guides',
    url: 'https://codesenseisearch.com/docs',
    author: {
      '@type': 'Organization',
      name: 'CodeSenseiSearch Team'
    },
    publisher: {
      '@type': 'Organization',
      name: 'CodeSenseiSearch',
      logo: {
        '@type': 'ImageObject',
        url: 'https://codesenseisearch.com/logo.png'
      }
    },
    mainEntity: {
      '@type': 'ItemList',
      name: 'Documentation Sections',
      itemListElement: sections.map((section, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: section.title,
        description: section.description,
        url: `https://codesenseisearch.com${section.href}`
      }))
    }
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
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
                Documentation
              </h1>
              <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-8">
                Everything you need to know about using CodeSenseiSearch effectively. 
                From basic searches to advanced API integration.
              </p>
              
              {/* Search Documentation */}
              <div className="max-w-2xl mx-auto">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search documentation..."
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

        {/* Quick Start */}
        <section className="py-12 bg-blue-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Quick Start</h2>
              <p className="text-gray-600">Get up and running in minutes</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
                <div className="flex items-center mb-4">
                  <span className="text-2xl mr-3">1️⃣</span>
                  <h3 className="font-semibold">Search Code</h3>
                </div>
                <p className="text-gray-600 text-sm">
                  Enter your search query using natural language or specific code patterns
                </p>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
                <div className="flex items-center mb-4">
                  <span className="text-2xl mr-3">2️⃣</span>
                  <h3 className="font-semibold">Filter Results</h3>
                </div>
                <p className="text-gray-600 text-sm">
                  Use language filters, repository sources, and relevance sorting
                </p>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow border-l-4 border-purple-500">
                <div className="flex items-center mb-4">
                  <span className="text-2xl mr-3">3️⃣</span>
                  <h3 className="font-semibold">Integrate & Use</h3>
                </div>
                <p className="text-gray-600 text-sm">
                  Copy code snippets or integrate via API into your development workflow
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Documentation Sections */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
              Documentation Sections
            </h2>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {sections.map((section) => (
                <Link
                  key={section.href}
                  href={section.href}
                  className="group bg-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 overflow-hidden border hover:border-blue-300"
                >
                  <div className="p-6">
                    <div className="flex items-center mb-4">
                      <span className="text-3xl mr-4">{section.icon}</span>
                      <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {section.title}
                      </h3>
                    </div>
                    
                    <p className="text-gray-600 mb-4">{section.description}</p>
                    
                    <ul className="space-y-1">
                      {section.topics.map((topic) => (
                        <li key={topic} className="text-sm text-gray-500 flex items-center">
                          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mr-2"></span>
                          {topic}
                        </li>
                      ))}
                    </ul>
                    
                    <div className="mt-4 text-blue-600 font-medium group-hover:text-blue-800 transition-colors">
                      Read documentation →
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Quick Links */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
              Popular Documentation Topics
            </h2>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow border border-gray-200 hover:border-blue-300 text-center"
                >
                  <span className="text-blue-600 font-medium hover:text-blue-800 transition-colors">
                    {link.name}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Help Section */}
        <section className="py-16 bg-slate-800 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold mb-6">Need More Help?</h2>
            <p className="text-xl mb-8 text-gray-300">
              Can&apos;t find what you&apos;re looking for? We&apos;re here to help.
            </p>
            
            <div className="grid md:grid-cols-3 gap-6">
              <div className="p-6 bg-slate-700 rounded-lg">
                <h3 className="font-semibold mb-2">📧 Email Support</h3>
                <p className="text-gray-300 text-sm mb-3">
                  Get help from our technical team
                </p>
                <a href="mailto:support@codesenseisearch.com" className="text-blue-400 hover:text-blue-300">
                  support@codesenseisearch.com
                </a>
              </div>
              
              <div className="p-6 bg-slate-700 rounded-lg">
                <h3 className="font-semibold mb-2">💬 Community Forum</h3>
                <p className="text-gray-300 text-sm mb-3">
                  Join discussions with other developers
                </p>
                <a href="/community" className="text-blue-400 hover:text-blue-300">
                  Visit Forum
                </a>
              </div>
              
              <div className="p-6 bg-slate-700 rounded-lg">
                <h3 className="font-semibold mb-2">📚 API Status</h3>
                <p className="text-gray-300 text-sm mb-3">
                  Check service status and uptime
                </p>
                <a href="/status" className="text-blue-400 hover:text-blue-300">
                  View Status
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}