import { Metadata } from 'next';
import { SEOMetadata } from '@/lib/seo';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';

export const metadata: Metadata = SEOMetadata.generateMetadata({
  title: 'Analytics Dashboard - CodeSenseiSearch',
  description: 'Monitor search performance, user engagement, and SEO metrics for CodeSenseiSearch platform.',
  keywords: ['analytics', 'dashboard', 'metrics', 'performance', 'SEO'],
  url: 'https://codesenseisearch.com/admin/analytics',
  type: 'website'
});

const breadcrumbs = [
  { name: 'Home', href: '/' },
  { name: 'Admin', href: '/admin' },
  { name: 'Analytics Dashboard', href: '/admin/analytics', current: true },
];

// Mock analytics data (in real implementation, this would come from your analytics API)
const analyticsData = {
  overview: {
    totalSearches: 125847,
    uniqueUsers: 23456,
    avgSearchTime: 1.2,
    topResult: 94.3
  },
  searchMetrics: {
    dailySearches: [
      { date: '2024-01-01', searches: 1234, users: 456 },
      { date: '2024-01-02', searches: 1456, users: 523 },
      { date: '2024-01-03', searches: 1678, users: 612 },
      { date: '2024-01-04', searches: 1543, users: 587 },
      { date: '2024-01-05', searches: 1789, users: 643 },
      { date: '2024-01-06', searches: 1654, users: 598 },
      { date: '2024-01-07', searches: 1876, users: 678 }
    ],
    topQueries: [
      { query: 'react hooks example', count: 3456, clickRate: 87.3 },
      { query: 'javascript async await', count: 2987, clickRate: 92.1 },
      { query: 'python data structures', count: 2543, clickRate: 79.6 },
      { query: 'node.js authentication', count: 2234, clickRate: 84.7 },
      { query: 'css grid layout', count: 1987, clickRate: 88.9 }
    ],
    searchTypes: {
      semantic: 67.8,
      keyword: 24.3,
      hybrid: 7.9
    }
  },
  performanceMetrics: {
    coreWebVitals: {
      lcp: { value: 1.2, status: 'good' },
      fid: { value: 45, status: 'good' },
      cls: { value: 0.08, status: 'good' }
    },
    searchPerformance: {
      avgResponseTime: 234,
      p95ResponseTime: 456,
      errorRate: 0.12
    }
  },
  userEngagement: {
    topLanguages: [
      { language: 'JavaScript', usage: 34.5 },
      { language: 'Python', usage: 28.7 },
      { language: 'TypeScript', usage: 18.9 },
      { language: 'Java', usage: 9.8 },
      { language: 'Go', usage: 8.1 }
    ],
    engagementActions: {
      codeCopies: 15234,
      bookmarks: 8965,
      shares: 3456,
      downloads: 12543
    }
  },
  seoMetrics: {
    organicTraffic: {
      currentMonth: 45678,
      previousMonth: 39234,
      growth: 16.4
    },
    topLandingPages: [
      { page: '/search', visits: 12345, bounceRate: 23.4 },
      { page: '/languages/javascript', visits: 8967, bounceRate: 18.7 },
      { page: '/languages/python', visits: 7543, bounceRate: 21.2 },
      { page: '/blog/semantic-search-ai', visits: 6234, bounceRate: 15.6 },
      { page: '/resources', visits: 5432, bounceRate: 28.9 }
    ]
  }
};

export default function AnalyticsDashboard() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Breadcrumbs items={breadcrumbs} className="mb-6" />
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
              <p className="text-gray-600 mt-2">Monitor search performance and user engagement</p>
            </div>
            <div className="flex items-center space-x-4">
              <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option>Last 7 days</option>
                <option>Last 30 days</option>
                <option>Last 3 months</option>
                <option>Last year</option>
              </select>
              <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                Export Data
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 rounded-lg">
                <span className="text-2xl">🔍</span>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Total Searches</p>
                <p className="text-2xl font-bold text-gray-900">
                  {analyticsData.overview.totalSearches.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-3 bg-green-100 rounded-lg">
                <span className="text-2xl">👥</span>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Unique Users</p>
                <p className="text-2xl font-bold text-gray-900">
                  {analyticsData.overview.uniqueUsers.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-3 bg-yellow-100 rounded-lg">
                <span className="text-2xl">⏱️</span>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Avg Search Time</p>
                <p className="text-2xl font-bold text-gray-900">
                  {analyticsData.overview.avgSearchTime}s
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-3 bg-purple-100 rounded-lg">
                <span className="text-2xl">🎯</span>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Top Result Click Rate</p>
                <p className="text-2xl font-bold text-gray-900">
                  {analyticsData.overview.topResult}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Search Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Daily Searches Chart */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Search Volume</h3>
            <div className="h-64 flex items-end space-x-2">
              {analyticsData.searchMetrics.dailySearches.map((day, index) => (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div 
                    className="w-full bg-blue-500 rounded-t"
                    style={{ height: `${(day.searches / 2000) * 100}%` }}
                  ></div>
                  <div className="text-xs text-gray-600 mt-2">
                    {new Date(day.date).getDate()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Search Types Distribution */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Search Types</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Semantic Search</span>
                  <span>{analyticsData.searchMetrics.searchTypes.semantic}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full" 
                    style={{ width: `${analyticsData.searchMetrics.searchTypes.semantic}%` }}
                  ></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Keyword Search</span>
                  <span>{analyticsData.searchMetrics.searchTypes.keyword}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full" 
                    style={{ width: `${analyticsData.searchMetrics.searchTypes.keyword}%` }}
                  ></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Hybrid Search</span>
                  <span>{analyticsData.searchMetrics.searchTypes.hybrid}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-purple-600 h-2 rounded-full" 
                    style={{ width: `${analyticsData.searchMetrics.searchTypes.hybrid}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Queries and Performance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Top Search Queries */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Search Queries</h3>
            <div className="space-y-4">
              {analyticsData.searchMetrics.topQueries.map((query, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{query.query}</p>
                    <p className="text-xs text-gray-600">{query.count} searches</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-green-600">{query.clickRate}%</p>
                    <p className="text-xs text-gray-600">click rate</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Core Web Vitals */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Core Web Vitals</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Largest Contentful Paint</p>
                  <p className="text-xs text-gray-600">{analyticsData.performanceMetrics.coreWebVitals.lcp.value}s</p>
                </div>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                  {analyticsData.performanceMetrics.coreWebVitals.lcp.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">First Input Delay</p>
                  <p className="text-xs text-gray-600">{analyticsData.performanceMetrics.coreWebVitals.fid.value}ms</p>
                </div>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                  {analyticsData.performanceMetrics.coreWebVitals.fid.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Cumulative Layout Shift</p>
                  <p className="text-xs text-gray-600">{analyticsData.performanceMetrics.coreWebVitals.cls.value}</p>
                </div>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                  {analyticsData.performanceMetrics.coreWebVitals.cls.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* User Engagement and SEO */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Programming Language Usage */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Programming Language Usage</h3>
            <div className="space-y-3">
              {analyticsData.userEngagement.topLanguages.map((lang, index) => (
                <div key={index}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{lang.language}</span>
                    <span>{lang.usage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-linear-to-r from-blue-500 to-purple-600 h-2 rounded-full" 
                      style={{ width: `${lang.usage}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SEO Performance */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">SEO Performance</h3>
            <div className="space-y-4">
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-900">Organic Traffic</span>
                  <span className="text-sm font-bold text-green-600">
                    +{analyticsData.seoMetrics.organicTraffic.growth}%
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {analyticsData.seoMetrics.organicTraffic.currentMonth.toLocaleString()}
                </p>
                <p className="text-xs text-gray-600">This month</p>
              </div>
              
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Top Landing Pages</h4>
                <div className="space-y-2">
                  {analyticsData.seoMetrics.topLandingPages.slice(0, 3).map((page, index) => (
                    <div key={index} className="flex justify-between text-xs">
                      <span className="truncate">{page.page}</span>
                      <span>{page.visits.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}