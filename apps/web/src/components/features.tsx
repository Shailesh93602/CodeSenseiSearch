import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Brain, 
  Zap, 
  Filter, 
  Code2, 
  Database,
  Github,
  MessageSquare,
  Sparkles
} from "lucide-react";

export function Features() {
  const features = [
    {
      icon: Brain,
      title: "AI-Powered Semantic Search",
      description: "Understanding context and meaning, not just keywords. Find solutions even when you don't know the exact terms.",
      badge: "Smart",
      color: "bg-purple-100 text-purple-700"
    },
    {
      icon: Zap,
      title: "Lightning Fast Results",
      description: "Get relevant code snippets and solutions in milliseconds with our optimized vector search engine.",
      badge: "Fast",
      color: "bg-yellow-100 text-yellow-700"
    },
    {
      icon: Filter,
      title: "Advanced Filtering",
      description: "Filter by programming language, repository stars, date, and more to find exactly what you need.",
      badge: "Precise",
      color: "bg-green-100 text-green-700"
    },
    {
      icon: Code2,
      title: "Syntax Highlighting",
      description: "Beautiful code previews with full syntax highlighting for 50+ programming languages.",
      badge: "Visual",
      color: "bg-blue-100 text-blue-700"
    },
    {
      icon: Database,
      title: "Multiple Data Sources",
      description: "Search across GitHub repositories, Stack Overflow answers, and curated documentation.",
      badge: "Comprehensive",
      color: "bg-orange-100 text-orange-700"
    },
    {
      icon: Sparkles,
      title: "Smart Recommendations",
      description: "Get personalized suggestions based on your search history and preferences.",
      badge: "Personalized",
      color: "bg-pink-100 text-pink-700"
    }
  ];

  const dataSources = [
    {
      icon: Github,
      name: "GitHub",
      description: "10M+ repositories",
      stats: "500K+ active repos"
    },
    {
      icon: MessageSquare,
      name: "Stack Overflow",
      description: "2M+ Q&A posts",
      stats: "Verified solutions"
    },
    {
      icon: Database,
      name: "Documentation",
      description: "Official docs",
      stats: "Always up-to-date"
    }
  ];

  return (
    <section className="py-24 bg-slate-50">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Features Grid */}
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Everything you need to find code faster
          </h2>
          <p className="mt-6 text-lg leading-8 text-slate-600">
            Powerful features designed specifically for developers who need accurate, 
            contextual search results.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const IconComponent = feature.icon;
            return (
              <Card key={feature.title} className="p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                    <IconComponent className="h-5 w-5 text-white" />
                  </div>
                  <Badge variant="secondary" className={feature.color}>
                    {feature.badge}
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-slate-600">
                  {feature.description}
                </p>
              </Card>
            );
          })}
        </div>

        {/* Data Sources */}
        <div className="mt-24">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Search across the best developer resources
            </h3>
            <p className="mt-4 text-lg text-slate-600">
              We aggregate content from the most trusted sources in the developer community.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {dataSources.map((source) => {
              const IconComponent = source.icon;
              return (
                <Card key={source.name} className="p-8 text-center hover:shadow-lg transition-shadow">
                  <div className="flex justify-center mb-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-900">
                      <IconComponent className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <h4 className="text-lg font-semibold text-slate-900 mb-2">
                    {source.name}
                  </h4>
                  <p className="text-slate-600 mb-1">
                    {source.description}
                  </p>
                  <p className="text-sm text-slate-500">
                    {source.stats}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>

        {/* How It Works */}
        <div className="mt-24">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              How it works
            </h3>
            <p className="mt-4 text-lg text-slate-600">
              Simple, powerful, and designed for developers.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white font-semibold">
                  1
                </div>
              </div>
              <h4 className="text-lg font-semibold text-slate-900 mb-2">
                Describe what you need
              </h4>
              <p className="text-slate-600">
                Type your query in natural language. No need for exact keywords.
              </p>
            </div>

            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white font-semibold">
                  2
                </div>
              </div>
              <h4 className="text-lg font-semibold text-slate-900 mb-2">
                AI finds relevant matches
              </h4>
              <p className="text-slate-600">
                Our semantic search understands context and finds the best solutions.
              </p>
            </div>

            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white font-semibold">
                  3
                </div>
              </div>
              <h4 className="text-lg font-semibold text-slate-900 mb-2">
                Copy and implement
              </h4>
              <p className="text-slate-600">
                Get working code with explanations, ready to use in your project.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}