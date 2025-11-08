import { Metadata } from 'next';
import { SEOMetadata } from '@/lib/seo';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { StructuredData } from '@/components/seo/StructuredData';

export const metadata: Metadata = SEOMetadata.generateMetadata({
  title: 'Free Developer Resources & Code Templates',
  description: 'Download free code templates, cheat sheets, and resources for JavaScript, Python, React, and more. Boost your productivity with ready-to-use snippets.',
  keywords: [
    'developer resources',
    'code templates',
    'programming cheat sheets',
    'free downloads',
    'JavaScript templates',
    'React boilerplate',
    'Python snippets'
  ],
  url: 'https://codesenseisearch.com/resources',
  type: 'website'
});

const breadcrumbs = [
  { name: 'Home', href: '/' },
  { name: 'Developer Resources', href: '/resources', current: true },
];

const resources = [
  {
    id: 1,
    title: 'JavaScript ES6+ Cheat Sheet',
    description: 'Complete reference for modern JavaScript features including arrow functions, destructuring, async/await, and more.',
    category: 'JavaScript',
    type: 'PDF',
    size: '2.1 MB',
    downloads: 12543,
    featured: true,
    downloadUrl: '/downloads/javascript-es6-cheat-sheet.pdf',
    previewUrl: '/previews/javascript-cheat-sheet.png'
  },
  {
    id: 2,
    title: 'React Hooks Complete Guide',
    description: 'Comprehensive guide covering all React hooks with practical examples and best practices.',
    category: 'React',
    type: 'PDF',
    size: '3.4 MB',
    downloads: 8967,
    featured: true,
    downloadUrl: '/downloads/react-hooks-guide.pdf',
    previewUrl: '/previews/react-hooks-guide.png'
  },
  {
    id: 3,
    title: 'Python Data Structures Templates',
    description: 'Ready-to-use Python templates for common data structures and algorithms implementations.',
    category: 'Python',
    type: 'ZIP',
    size: '1.8 MB',
    downloads: 6742,
    featured: true,
    downloadUrl: '/downloads/python-data-structures.zip',
    previewUrl: '/previews/python-templates.png'
  },
  {
    id: 4,
    title: 'Node.js Express Boilerplate',
    description: 'Production-ready Express.js boilerplate with authentication, middleware, and best practices.',
    category: 'Node.js',
    type: 'ZIP',
    size: '4.2 MB',
    downloads: 15234,
    featured: false,
    downloadUrl: '/downloads/nodejs-express-boilerplate.zip',
    previewUrl: '/previews/nodejs-boilerplate.png'
  },
  {
    id: 5,
    title: 'CSS Grid & Flexbox Cheat Sheet',
    description: 'Visual guide to CSS Grid and Flexbox with examples and browser support information.',
    category: 'CSS',
    type: 'PDF',
    size: '1.5 MB',
    downloads: 9876,
    featured: false,
    downloadUrl: '/downloads/css-grid-flexbox-cheat-sheet.pdf',
    previewUrl: '/previews/css-cheat-sheet.png'
  },
  {
    id: 6,
    title: 'TypeScript Configuration Templates',
    description: 'Pre-configured TypeScript setups for different project types and frameworks.',
    category: 'TypeScript',
    type: 'ZIP',
    size: '0.8 MB',
    downloads: 5432,
    featured: false,
    downloadUrl: '/downloads/typescript-configs.zip',
    previewUrl: '/previews/typescript-configs.png'
  },
  {
    id: 7,
    title: 'API Testing with Postman Collection',
    description: 'Complete Postman collection for testing REST APIs with authentication and error handling.',
    category: 'Testing',
    type: 'JSON',
    size: '0.3 MB',
    downloads: 3456,
    featured: false,
    downloadUrl: '/downloads/api-testing-postman.json',
    previewUrl: '/previews/postman-collection.png'
  },
  {
    id: 8,
    title: 'Git Workflow Cheat Sheet',
    description: 'Essential Git commands and workflows for solo and team development.',
    category: 'DevOps',
    type: 'PDF',
    size: '1.2 MB',
    downloads: 11234,
    featured: false,
    downloadUrl: '/downloads/git-workflow-cheat-sheet.pdf',
    previewUrl: '/previews/git-cheat-sheet.png'
  }
];

const categories = [
  { name: 'All', count: resources.length },
  { name: 'JavaScript', count: resources.filter(r => r.category === 'JavaScript').length },
  { name: 'React', count: resources.filter(r => r.category === 'React').length },
  { name: 'Python', count: resources.filter(r => r.category === 'Python').length },
  { name: 'Node.js', count: resources.filter(r => r.category === 'Node.js').length },
  { name: 'CSS', count: resources.filter(r => r.category === 'CSS').length },
  { name: 'TypeScript', count: resources.filter(r => r.category === 'TypeScript').length },
  { name: 'Testing', count: resources.filter(r => r.category === 'Testing').length },
  { name: 'DevOps', count: resources.filter(r => r.category === 'DevOps').length }
];

export default function ResourcesPage() {
  const pageStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Free Developer Resources & Code Templates',
    description: 'Download free code templates, cheat sheets, and resources for JavaScript, Python, React, and more.',
    url: 'https://codesenseisearch.com/resources',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: resources.length,
      itemListElement: resources.map((resource, index) => ({
        '@type': 'DigitalDocument',
        position: index + 1,
        name: resource.title,
        description: resource.description,
        downloadUrl: `https://codesenseisearch.com${resource.downloadUrl}`,
        fileFormat: resource.type,
        contentSize: resource.size
      }))
    }
  };

  return (
    <>
      <StructuredData data={pageStructuredData} />
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-linear-to-r from-purple-600 to-blue-600">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <Breadcrumbs items={breadcrumbs} className="mb-8" />
            <div className="text-center text-white">
              <h1 className="text-4xl md:text-5xl font-bold mb-6">
                Free Developer Resources
              </h1>
              <p className="text-xl text-purple-100 max-w-3xl mx-auto">
                Boost your productivity with our collection of free code templates, cheat sheets, 
                and boilerplates for popular programming languages and frameworks.
              </p>
              <div className="mt-8 flex items-center justify-center space-x-8 text-purple-200">
                <div className="text-center">
                  <div className="text-2xl font-bold">{resources.length}</div>
                  <div className="text-sm">Resources</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {resources.reduce((sum, r) => sum + r.downloads, 0).toLocaleString()}
                  </div>
                  <div className="text-sm">Downloads</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">100%</div>
                  <div className="text-sm">Free</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Featured Resources */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Featured Resources</h2>
            <div className="grid md:grid-cols-3 gap-8">
              {resources.filter(r => r.featured).map((resource) => (
                <div key={resource.id} className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
                  <div className="h-48 bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <div className="text-white text-center">
                      <div className="text-4xl mb-2">📄</div>
                      <div className="text-sm font-medium">{resource.category}</div>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                        {resource.category}
                      </span>
                      <span className="text-gray-500 text-sm">
                        {resource.downloads.toLocaleString()} downloads
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {resource.title}
                    </h3>
                    <p className="text-gray-600 text-sm mb-4">
                      {resource.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-500">
                        {resource.type} • {resource.size}
                      </div>
                      <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        Download
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* All Resources */}
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-bold text-gray-900">All Resources</h2>
              <div className="flex items-center space-x-4">
                <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option>Sort by: Most Downloaded</option>
                  <option>Sort by: Newest</option>
                  <option>Sort by: Name</option>
                  <option>Sort by: Size</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
              {/* Sidebar */}
              <div className="lg:w-64 shrink-0">
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h3 className="font-semibold text-gray-900 mb-4">Categories</h3>
                  <div className="space-y-2">
                    {categories.map((category) => (
                      <button
                        key={category.name}
                        className="flex items-center justify-between w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors"
                      >
                        <span>{category.name}</span>
                        <span className="text-gray-400">({category.count})</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-blue-50 p-6 rounded-lg mt-6">
                  <h3 className="font-semibold text-blue-900 mb-3">💡 Need Something Specific?</h3>
                  <p className="text-sm text-blue-800 mb-4">
                    Can&apos;t find what you&apos;re looking for? Request a custom template or guide.
                  </p>
                  <button className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                    Request Resource
                  </button>
                </div>
              </div>

              {/* Resources Grid */}
              <div className="flex-1">
                <div className="grid md:grid-cols-2 gap-6">
                  {resources.map((resource) => (
                    <div key={resource.id} className="bg-gray-50 rounded-lg p-6 hover:bg-gray-100 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-linear-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-xl">
                            {resource.type === 'PDF' ? '📄' : resource.type === 'ZIP' ? '📁' : '📊'}
                          </div>
                          <div>
                            <span className="px-2 py-1 bg-white text-gray-700 text-xs rounded-full border">
                              {resource.category}
                            </span>
                          </div>
                        </div>
                        <div className="text-right text-sm text-gray-500">
                          <div>{resource.downloads.toLocaleString()} downloads</div>
                          <div>{resource.type} • {resource.size}</div>
                        </div>
                      </div>
                      
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {resource.title}
                      </h3>
                      
                      <p className="text-gray-600 text-sm mb-4">
                        {resource.description}
                      </p>
                      
                      <div className="flex items-center space-x-3">
                        <button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                          Download
                        </button>
                        <button className="px-4 py-2 text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors">
                          Preview
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Newsletter Signup */}
        <section className="py-16 bg-gray-900">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold text-white mb-4">
              Get New Resources First
            </h2>
            <p className="text-xl text-gray-300 mb-8">
              Subscribe to our newsletter and be the first to know when we release new 
              templates, guides, and developer resources.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
              <input
                type="email"
                placeholder="Enter your email"
                className="flex-1 px-4 py-3 rounded-lg border border-gray-600 bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors">
                Subscribe
              </button>
            </div>
            <p className="text-sm text-gray-400 mt-4">
              No spam, unsubscribe anytime. We respect your privacy.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}