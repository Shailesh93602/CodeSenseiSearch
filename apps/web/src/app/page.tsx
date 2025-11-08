import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { CTA } from "@/components/cta";
import { SearchActionStructuredData } from "@/components/seo/StructuredData";

export default function Home() {
  return (
    <>
      <SearchActionStructuredData searchUrl="https://codesenseisearch.com/search" />
      <main className="min-h-screen">
        {/* Hero Section with Primary Value Proposition */}
        <Hero />
        
        {/* Features showcase for SEO and user understanding */}
        <Features />
        
        {/* Trust indicators and social proof */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-8">
                Trusted by Developers Worldwide
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">50K+</div>
                  <div className="text-gray-600">Code Snippets</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">1M+</div>
                  <div className="text-gray-600">Searches Per Month</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">99.9%</div>
                  <div className="text-gray-600">Uptime</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">10ms</div>
                  <div className="text-gray-600">Average Response</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SEO Content Section */}
        <section className="py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="prose prose-lg mx-auto">
              <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
                Revolutionary Code Search Technology
              </h2>
              <div className="grid md:grid-cols-2 gap-12">
                <div>
                  <h3 className="text-xl font-semibold mb-4">AI-Powered Semantic Search</h3>
                  <p className="text-gray-600 mb-6">
                    Our advanced AI understands context and intent, not just keywords. 
                    Find exactly what you need with natural language queries that 
                    understand programming concepts, frameworks, and coding patterns.
                  </p>
                  
                  <h3 className="text-xl font-semibold mb-4">Multi-Source Integration</h3>
                  <p className="text-gray-600">
                    Search across GitHub repositories, Stack Overflow answers, 
                    official documentation, and curated code examples in one 
                    unified interface. No more switching between multiple platforms.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-4">Smart Code Understanding</h3>
                  <p className="text-gray-600 mb-6">
                    CodeSenseiSearch analyzes code structure, function signatures, 
                    dependencies, and usage patterns to provide the most relevant 
                    results for your specific programming language and framework.
                  </p>
                  
                  <h3 className="text-xl font-semibold mb-4">Developer-First Experience</h3>
                  <p className="text-gray-600">
                    Built by developers, for developers. Fast search results, 
                    syntax highlighting, easy code copying, and integration with 
                    your favorite development tools and IDEs.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <CTA />
      </main>
    </>
  );
}
