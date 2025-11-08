import { Metadata } from 'next';
import { SEOMetadata } from '@/lib/seo';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { StructuredData } from '@/components/seo/StructuredData';

export const metadata: Metadata = SEOMetadata.generateMetadata({
  title: 'Integration Guide | CodeSenseiSearch Developer Integration',
  description: 'Learn how to integrate CodeSenseiSearch into VS Code, IntelliJ, CLI tools, and custom applications with comprehensive guides.',
  keywords: [
    'IDE integration',
    'VS Code extension',
    'IntelliJ plugin',
    'CLI tool',
    'developer integration',
    'workflow automation',
    'code search integration'
  ],
  url: 'https://codesenseisearch.com/docs/integration',
});

const breadcrumbs = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'Integration Guide', href: '/docs/integration', current: true },
];

const integrations = [
  {
    name: 'VS Code Extension',
    description: 'Search code directly from your editor with intelligent suggestions',
    icon: '🎨',
    features: [
      'Inline search results',
      'Code snippet insertion',
      'Context-aware suggestions',
      'Keyboard shortcuts'
    ],
    installation: `# Install from VS Code Marketplace
code --install-extension codesenseisearch.vscode-extension

# Or search "CodeSenseiSearch" in Extensions panel`,
    usage: `// Use Ctrl+Shift+S to open search
// Or right-click and select "Search with CodeSensei"
const result = await fetchUserData();`,
    status: 'Available'
  },
  {
    name: 'CLI Tool',
    description: 'Command-line interface for terminal-based development workflows',
    icon: '⌨️',
    features: [
      'Search from terminal',
      'JSON output format',
      'Configurable output',
      'Shell integration'
    ],
    installation: `# Install via npm
npm install -g @codesenseisearch/cli

# Or download binary
curl -L https://releases.codesenseisearch.com/cli/latest/linux.tar.gz`,
    usage: `# Basic search
codesenseisearch "async await error handling"

# With language filter
codesenseisearch "pandas dataframe" --language python

# JSON output
codesenseisearch "react hooks" --format json`,
    status: 'Available'
  },
  {
    name: 'IntelliJ Plugin',
    description: 'Native integration for JetBrains IDEs including IntelliJ, PyCharm, WebStorm',
    icon: '🧩',
    features: [
      'IDE-native search panel',
      'Smart code completion',
      'Project context awareness',
      'Multiple IDE support'
    ],
    installation: `# Install from JetBrains Marketplace
# Go to Settings → Plugins → Marketplace
# Search for "CodeSenseiSearch"`,
    usage: `// Use Tools → CodeSenseiSearch → Search
// Or Alt+Shift+C shortcut
// Results appear in dedicated tool window`,
    status: 'Beta'
  },
  {
    name: 'Vim/Neovim Plugin',
    description: 'Lightweight plugin for Vim and Neovim users',
    icon: '📝',
    features: [
      'Fuzzy search integration',
      'Result preview',
      'Minimal configuration',
      'Async operations'
    ],
    installation: `" Using vim-plug
Plug 'codesenseisearch/vim-codesenseisearch'

" Using packer.nvim
use 'codesenseisearch/vim-codesenseisearch'`,
    usage: `" Search with :CS command
:CS async await

" Search current word
<leader>cs

" Search visual selection
<leader>cv`,
    status: 'Coming Soon'
  }
];

const customIntegrations = [
  {
    title: 'Webhook Integration',
    description: 'Receive notifications about new code matching your interests',
    code: `{
  "webhook_url": "https://your-app.com/webhook",
  "events": ["new_match", "trending_code"],
  "filters": {
    "languages": ["javascript", "python"],
    "keywords": ["authentication", "security"]
  }
}`
  },
  {
    title: 'Slack Bot',
    description: 'Search code directly from Slack channels',
    code: `/codesensesearch async await error handling

# Bot responds with top results
🔍 Found 5 results for "async await error handling"
1. Error handling best practices (⭐ 4.9)
2. Try-catch with async/await (⭐ 4.7)
3. Promise rejection handling (⭐ 4.5)`
  },
  {
    title: 'GitHub Action',
    description: 'Automatically search for similar code in pull requests',
    code: `name: Code Review Assistant
on: [pull_request]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: codesenseisearch/github-action@v1
        with:
          api_key: \${{ secrets.CODESENSEISEARCH_API_KEY }}
          comment_on_pr: true`
  }
];

export default function IntegrationPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: 'CodeSenseiSearch Integration Guide',
    description: 'Complete guide for integrating CodeSenseiSearch into development workflows',
    url: 'https://codesenseisearch.com/docs/integration',
    author: {
      '@type': 'Organization',
      name: 'CodeSenseiSearch Team'
    }
  };

  return (
    <>
      <StructuredData data={structuredData} />
      <div className="min-h-screen bg-white">
        {/* Header */}
        <div className="bg-linear-to-r from-purple-600 to-indigo-600">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <Breadcrumbs items={breadcrumbs} className="mb-8" />
            <div className="text-center">
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
                Integration Guide
              </h1>
              <p className="text-xl text-white/90 max-w-3xl mx-auto mb-8">
                Integrate CodeSenseiSearch into your development workflow with IDE extensions, 
                CLI tools, and custom integrations.
              </p>
            </div>
          </div>
        </div>

        {/* Overview */}
        <section className="py-12 bg-purple-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Choose Your Integration</h2>
              <p className="text-gray-600">Multiple ways to bring CodeSenseiSearch into your development environment</p>
            </div>
            
            <div className="grid md:grid-cols-4 gap-6">
              <div className="text-center p-6 bg-white rounded-lg shadow">
                <span className="text-3xl mb-2 block">🎨</span>
                <h3 className="font-semibold">IDE Extensions</h3>
                <p className="text-sm text-gray-600">Native editor integration</p>
              </div>
              
              <div className="text-center p-6 bg-white rounded-lg shadow">
                <span className="text-3xl mb-2 block">⌨️</span>
                <h3 className="font-semibold">CLI Tools</h3>
                <p className="text-sm text-gray-600">Terminal-based access</p>
              </div>
              
              <div className="text-center p-6 bg-white rounded-lg shadow">
                <span className="text-3xl mb-2 block">🔧</span>
                <h3 className="font-semibold">API Integration</h3>
                <p className="text-sm text-gray-600">Custom applications</p>
              </div>
              
              <div className="text-center p-6 bg-white rounded-lg shadow">
                <span className="text-3xl mb-2 block">🤖</span>
                <h3 className="font-semibold">Automation</h3>
                <p className="text-sm text-gray-600">Workflows & bots</p>
              </div>
            </div>
          </div>
        </section>

        {/* IDE and Tool Integrations */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
              IDE & Editor Integrations
            </h2>
            
            <div className="space-y-12">
              {integrations.map((integration, index) => (
                <div key={index} className="bg-white rounded-lg shadow-lg overflow-hidden">
                  <div className="p-6 border-b">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        <span className="text-3xl mr-4">{integration.icon}</span>
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">{integration.name}</h3>
                          <p className="text-gray-600">{integration.description}</p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded text-sm font-medium ${
                        integration.status === 'Available' ? 'bg-green-100 text-green-800' :
                        integration.status === 'Beta' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {integration.status}
                      </span>
                    </div>
                    
                    <div className="grid md:grid-cols-4 gap-4 mb-6">
                      {integration.features.map((feature, idx) => (
                        <div key={idx} className="flex items-center text-sm text-gray-600">
                          <span className="w-1.5 h-1.5 bg-purple-400 rounded-full mr-2"></span>
                          {feature}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="p-6">
                    <div className="grid md:grid-cols-2 gap-8">
                      <div>
                        <h4 className="font-semibold mb-3">Installation</h4>
                        <pre className="bg-gray-900 text-green-400 p-4 rounded text-sm overflow-x-auto">
                          <code>{integration.installation}</code>
                        </pre>
                      </div>
                      
                      <div>
                        <h4 className="font-semibold mb-3">Usage</h4>
                        <pre className="bg-gray-900 text-green-400 p-4 rounded text-sm overflow-x-auto">
                          <code>{integration.usage}</code>
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Custom Integrations */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
              Custom Integrations
            </h2>
            
            <div className="grid md:grid-cols-3 gap-8">
              {customIntegrations.map((integration, index) => (
                <div key={index} className="bg-white rounded-lg shadow-lg overflow-hidden">
                  <div className="p-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-3">
                      {integration.title}
                    </h3>
                    <p className="text-gray-600 mb-4">{integration.description}</p>
                    
                    <div className="bg-gray-900 text-green-400 p-4 rounded text-sm overflow-x-auto">
                      <pre><code>{integration.code}</code></pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Configuration */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Configuration</h2>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="font-semibold mb-4">Environment Variables</h3>
                <div className="bg-gray-900 text-green-400 p-4 rounded text-sm">
                  <code>
                    # Required<br />
                    CODESENSEISEARCH_API_KEY=your_api_key_here<br />
                    <br />
                    # Optional<br />
                    CODESENSEISEARCH_API_URL=https://api.codesenseisearch.com<br />
                    CODESENSEISEARCH_TIMEOUT=5000<br />
                    CODESENSEISEARCH_MAX_RESULTS=20
                  </code>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="font-semibold mb-4">Configuration File</h3>
                <div className="bg-gray-900 text-green-400 p-4 rounded text-sm">
                  <code>
                    {`{
  "apiKey": "your_api_key",
  "defaultLanguage": "javascript",
  "maxResults": 10,
  "autoComplete": true,
  "cacheResults": true,
  "timeout": 5000
}`}
                  </code>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Support */}
        <section className="py-16 bg-purple-600 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold mb-6">Need Help with Integration?</h2>
            <p className="text-xl mb-8 opacity-90">
              Our team is here to help you integrate CodeSenseiSearch successfully
            </p>
            
            <div className="grid md:grid-cols-3 gap-6">
              <div className="p-6 bg-purple-500 rounded-lg">
                <h3 className="font-semibold mb-2">📧 Integration Support</h3>
                <p className="text-purple-100 text-sm mb-3">
                  Get help with custom integrations
                </p>
                <a href="mailto:integrations@codesenseisearch.com" className="text-purple-200 hover:text-white">
                  integrations@codesenseisearch.com
                </a>
              </div>
              
              <div className="p-6 bg-purple-500 rounded-lg">
                <h3 className="font-semibold mb-2">💬 Developer Community</h3>
                <p className="text-purple-100 text-sm mb-3">
                  Join other developers building integrations
                </p>
                <a href="/community" className="text-purple-200 hover:text-white">
                  Join Community
                </a>
              </div>
              
              <div className="p-6 bg-purple-500 rounded-lg">
                <h3 className="font-semibold mb-2">📖 Examples Repository</h3>
                <p className="text-purple-100 text-sm mb-3">
                  Browse integration examples and templates
                </p>
                <a href="https://github.com/codesenseisearch/examples" className="text-purple-200 hover:text-white">
                  View Examples
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}