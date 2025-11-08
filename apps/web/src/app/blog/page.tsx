import { Metadata } from 'next';
import Link from 'next/link';
import { SEOMetadata, pageConfigs } from '@/lib/seo';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { StructuredData } from '@/components/seo/StructuredData';

export const metadata: Metadata = SEOMetadata.generateMetadata(pageConfigs.blog);

const breadcrumbs = [
  { name: 'Home', href: '/' },
  { name: 'Blog', href: '/blog', current: true },
];

const featuredPosts = [
  {
    id: 'semantic-search-ai',
    title: 'How AI-Powered Semantic Search is Revolutionizing Code Discovery',
    excerpt: 'Traditional keyword-based code search is becoming obsolete. Learn how semantic search understands context and intent to find exactly what you need.',
    author: 'Sarah Chen',
    publishedDate: '2024-01-15',
    readTime: '8 min read',
    category: 'AI & Technology',
    tags: ['AI', 'semantic search', 'developer tools'],
    imageUrl: '/blog/semantic-search-hero.jpg',
    featured: true
  },
  {
    id: 'best-practices-code-search',
    title: '10 Best Practices for Effective Code Search',
    excerpt: 'Master the art of finding code snippets faster with these proven techniques and search strategies used by top developers.',
    author: 'Mike Rodriguez',
    publishedDate: '2024-01-12',
    readTime: '6 min read',
    category: 'Best Practices',
    tags: ['productivity', 'search techniques', 'developer workflow'],
    imageUrl: '/blog/best-practices-hero.jpg',
    featured: true
  }
];

const recentPosts = [
  {
    id: 'javascript-async-patterns',
    title: 'Modern JavaScript Async Patterns: From Callbacks to Async/Await',
    excerpt: 'A comprehensive guide to handling asynchronous operations in JavaScript, with real-world examples and performance considerations.',
    author: 'Alex Thompson',
    publishedDate: '2024-01-10',
    readTime: '12 min read',
    category: 'JavaScript',
    tags: ['JavaScript', 'async programming', 'promises'],
    imageUrl: '/blog/js-async-patterns.jpg'
  },
  {
    id: 'python-data-science-toolkit',
    title: 'Essential Python Data Science Toolkit: Pandas, NumPy, and Beyond',
    excerpt: 'Discover the most important Python libraries for data science and learn how to use them effectively in your projects.',
    author: 'Dr. Emily Watson',
    publishedDate: '2024-01-08',
    readTime: '10 min read',
    category: 'Python',
    tags: ['Python', 'data science', 'pandas', 'numpy'],
    imageUrl: '/blog/python-data-science.jpg'
  },
  {
    id: 'react-performance-optimization',
    title: 'React Performance Optimization: Techniques That Actually Matter',
    excerpt: 'Learn practical React optimization techniques that will make a real difference in your application performance.',
    author: 'Jordan Kim',
    publishedDate: '2024-01-05',
    readTime: '9 min read',
    category: 'React',
    tags: ['React', 'performance', 'optimization'],
    imageUrl: '/blog/react-performance.jpg'
  },
  {
    id: 'api-design-principles',
    title: 'RESTful API Design Principles for Modern Applications',
    excerpt: 'Build better APIs with these time-tested design principles and best practices from industry experts.',
    author: 'Chris Martinez',
    publishedDate: '2024-01-03',
    readTime: '7 min read',
    category: 'API Design',
    tags: ['API', 'REST', 'backend', 'design patterns'],
    imageUrl: '/blog/api-design.jpg'
  },
  {
    id: 'debugging-techniques',
    title: 'Advanced Debugging Techniques Every Developer Should Know',
    excerpt: 'Go beyond console.log with these professional debugging strategies and tools that will save you hours.',
    author: 'Lisa Park',
    publishedDate: '2024-01-01',
    readTime: '11 min read',
    category: 'Development',
    tags: ['debugging', 'tools', 'productivity'],
    imageUrl: '/blog/debugging-techniques.jpg'
  }
];

const categories = [
  { name: 'JavaScript', count: 15, color: 'yellow' },
  { name: 'Python', count: 12, color: 'blue' },
  { name: 'React', count: 18, color: 'cyan' },
  { name: 'API Design', count: 8, color: 'green' },
  { name: 'Best Practices', count: 10, color: 'purple' },
  { name: 'AI & Technology', count: 6, color: 'red' }
];

export default function BlogPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'CodeSenseiSearch Developer Blog',
    description: 'Technical articles, tutorials, and insights for developers',
    url: 'https://codesenseisearch.com/blog',
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
      name: 'Blog Posts',
      itemListElement: [...featuredPosts, ...recentPosts].map((post, index) => ({
        '@type': 'BlogPosting',
        position: index + 1,
        headline: post.title,
        description: post.excerpt,
        author: {
          '@type': 'Person',
          name: post.author
        },
        datePublished: post.publishedDate,
        url: `https://codesenseisearch.com/blog/${post.id}`
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
                Developer Blog
              </h1>
              <p className="text-xl text-white/90 max-w-3xl mx-auto mb-8">
                Technical insights, coding tutorials, and best practices from 
                our team and the developer community.
              </p>
              
              {/* Newsletter Signup */}
              <div className="max-w-md mx-auto">
                <div className="flex">
                  <input
                    type="email"
                    placeholder="Enter your email for updates"
                    className="flex-1 px-4 py-3 rounded-l-lg border-0 text-gray-900 focus:ring-2 focus:ring-purple-300"
                  />
                  <button className="bg-white text-purple-600 px-6 py-3 rounded-r-lg font-semibold hover:bg-gray-100 transition-colors">
                    Subscribe
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Featured Posts */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Featured Articles</h2>
            
            <div className="grid md:grid-cols-2 gap-8">
              {featuredPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/blog/${post.id}`}
                  className="group bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-all duration-200"
                >
                  <div className="aspect-w-16 aspect-h-9 bg-gray-200">
                    <div className="w-full h-48 bg-linear-to-r from-indigo-500 to-purple-500 flex items-center justify-center">
                      <span className="text-white text-lg font-medium">{post.category}</span>
                    </div>
                  </div>
                  
                  <div className="p-6">
                    <div className="flex items-center text-sm text-gray-500 mb-3">
                      <span>{post.author}</span>
                      <span className="mx-2">•</span>
                      <span>{new Date(post.publishedDate).toLocaleDateString()}</span>
                      <span className="mx-2">•</span>
                      <span>{post.readTime}</span>
                    </div>
                    
                    <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-purple-600 transition-colors">
                      {post.title}
                    </h3>
                    
                    <p className="text-gray-600 mb-4">{post.excerpt}</p>
                    
                    <div className="flex flex-wrap gap-2">
                      {post.tags.map((tag) => (
                        <span 
                          key={tag}
                          className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Recent Posts and Sidebar */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-3 gap-12">
              {/* Main Content */}
              <div className="lg:col-span-2">
                <h2 className="text-3xl font-bold text-gray-900 mb-8">Recent Posts</h2>
                
                <div className="space-y-8">
                  {recentPosts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/blog/${post.id}`}
                      className="group block bg-white rounded-lg shadow hover:shadow-md transition-shadow overflow-hidden"
                    >
                      <div className="md:flex">
                        <div className="md:w-1/3 bg-linear-to-r from-blue-500 to-cyan-500 h-48 md:h-auto flex items-center justify-center">
                          <span className="text-white font-medium">{post.category}</span>
                        </div>
                        
                        <div className="md:w-2/3 p-6">
                          <div className="flex items-center text-sm text-gray-500 mb-2">
                            <span>{post.author}</span>
                            <span className="mx-2">•</span>
                            <span>{new Date(post.publishedDate).toLocaleDateString()}</span>
                            <span className="mx-2">•</span>
                            <span>{post.readTime}</span>
                          </div>
                          
                          <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                            {post.title}
                          </h3>
                          
                          <p className="text-gray-600 mb-3">{post.excerpt}</p>
                          
                          <div className="flex flex-wrap gap-1">
                            {post.tags.map((tag) => (
                              <span 
                                key={tag}
                                className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Sidebar */}
              <div className="lg:col-span-1">
                <div className="sticky top-8 space-y-8">
                  {/* Categories */}
                  <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Categories</h3>
                    <div className="space-y-2">
                      {categories.map((category) => (
                        <Link
                          key={category.name}
                          href={`/blog/category/${category.name.toLowerCase()}`}
                          className="flex items-center justify-between p-2 rounded hover:bg-gray-50 transition-colors"
                        >
                          <span className="text-gray-700">{category.name}</span>
                          <span className="text-sm text-gray-500">({category.count})</span>
                        </Link>
                      ))}
                    </div>
                  </div>

                  {/* Popular Tags */}
                  <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Popular Tags</h3>
                    <div className="flex flex-wrap gap-2">
                      {['JavaScript', 'React', 'Python', 'API', 'Performance', 'Debugging', 'TypeScript', 'Node.js'].map((tag) => (
                        <Link
                          key={tag}
                          href={`/blog/tag/${tag.toLowerCase()}`}
                          className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full hover:bg-gray-200 transition-colors"
                        >
                          {tag}
                        </Link>
                      ))}
                    </div>
                  </div>

                  {/* Newsletter */}
                  <div className="bg-indigo-600 p-6 rounded-lg text-white">
                    <h3 className="text-lg font-bold mb-2">Stay Updated</h3>
                    <p className="text-indigo-100 text-sm mb-4">
                      Get the latest articles and coding insights delivered to your inbox.
                    </p>
                    <div className="space-y-3">
                      <input
                        type="email"
                        placeholder="Your email"
                        className="w-full px-3 py-2 rounded text-gray-900 text-sm"
                      />
                      <button className="w-full bg-white text-indigo-600 py-2 rounded font-medium text-sm hover:bg-gray-100 transition-colors">
                        Subscribe
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 bg-indigo-600 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold mb-6">Write for Our Blog</h2>
            <p className="text-xl mb-8 opacity-90">
              Share your knowledge with the developer community. We welcome technical articles and tutorials.
            </p>
            <div className="flex justify-center space-x-4">
              <button className="bg-white text-indigo-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
                Submit Article
              </button>
              <button className="border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white hover:text-indigo-600 transition-colors">
                Writing Guidelines
              </button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}