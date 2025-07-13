"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Github, MessageSquare, BookOpen, Code, Calendar, Star, Filter } from "lucide-react";

interface Filters {
  source: string;
  language: string;
  sortBy: string;
  dateRange: string;
}

interface SearchFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

export function SearchFilters({ filters, onFiltersChange }: SearchFiltersProps) {
  const updateFilter = (key: keyof Filters, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({
      source: "all",
      language: "all", 
      sortBy: "relevance",
      dateRange: "all"
    });
  };

  const hasActiveFilters = Object.values(filters).some(value => value !== "all" && value !== "relevance");

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Filters
        </h3>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear all
          </Button>
        )}
      </div>

      {/* Source Filter */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-slate-700 mb-3">Source</h4>
        <div className="space-y-2">
          {[
            { value: "all", label: "All Sources", icon: null },
            { value: "github", label: "GitHub", icon: Github },
            { value: "stackoverflow", label: "Stack Overflow", icon: MessageSquare },
            { value: "docs", label: "Documentation", icon: BookOpen }
          ].map((source) => {
            const IconComponent = source.icon;
            return (
              <button
                key={source.value}
                onClick={() => updateFilter("source", source.value)}
                className={`flex items-center gap-2 w-full p-2 text-sm rounded-md transition-colors ${
                  filters.source === source.value
                    ? "bg-blue-100 text-blue-700 border border-blue-200"
                    : "hover:bg-slate-100 text-slate-600"
                }`}
              >
                {IconComponent && <IconComponent className="h-4 w-4" />}
                {source.label}
                {filters.source === source.value && (
                  <Badge variant="secondary" className="ml-auto text-xs">
                    Active
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Separator className="my-4" />

      {/* Language Filter */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-slate-700 mb-3">Language</h4>
        <div className="space-y-2">
          {[
            { value: "all", label: "All Languages" },
            { value: "javascript", label: "JavaScript" },
            { value: "typescript", label: "TypeScript" },
            { value: "python", label: "Python" },
            { value: "java", label: "Java" },
            { value: "csharp", label: "C#" },
            { value: "go", label: "Go" },
            { value: "rust", label: "Rust" },
            { value: "php", label: "PHP" }
          ].map((language) => (
            <button
              key={language.value}
              onClick={() => updateFilter("language", language.value)}
              className={`flex items-center gap-2 w-full p-2 text-sm rounded-md transition-colors ${
                filters.language === language.value
                  ? "bg-blue-100 text-blue-700 border border-blue-200"
                  : "hover:bg-slate-100 text-slate-600"
              }`}
            >
              <Code className="h-4 w-4" />
              {language.label}
              {filters.language === language.value && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  Active
                </Badge>
              )}
            </button>
          ))}
        </div>
      </div>

      <Separator className="my-4" />

      {/* Sort By Filter */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-slate-700 mb-3">Sort by</h4>
        <div className="space-y-2">
          {[
            { value: "relevance", label: "Relevance", icon: Star },
            { value: "date", label: "Date", icon: Calendar },
            { value: "stars", label: "Stars", icon: Star }
          ].map((sort) => {
            const IconComponent = sort.icon;
            return (
              <button
                key={sort.value}
                onClick={() => updateFilter("sortBy", sort.value)}
                className={`flex items-center gap-2 w-full p-2 text-sm rounded-md transition-colors ${
                  filters.sortBy === sort.value
                    ? "bg-blue-100 text-blue-700 border border-blue-200"
                    : "hover:bg-slate-100 text-slate-600"
                }`}
              >
                <IconComponent className="h-4 w-4" />
                {sort.label}
                {filters.sortBy === sort.value && (
                  <Badge variant="secondary" className="ml-auto text-xs">
                    Active
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Separator className="my-4" />

      {/* Date Range Filter */}
      <div>
        <h4 className="text-sm font-medium text-slate-700 mb-3">Date Range</h4>
        <div className="space-y-2">
          {[
            { value: "all", label: "All time" },
            { value: "week", label: "Past week" },
            { value: "month", label: "Past month" },
            { value: "year", label: "Past year" }
          ].map((date) => (
            <button
              key={date.value}
              onClick={() => updateFilter("dateRange", date.value)}
              className={`flex items-center gap-2 w-full p-2 text-sm rounded-md transition-colors ${
                filters.dateRange === date.value
                  ? "bg-blue-100 text-blue-700 border border-blue-200"
                  : "hover:bg-slate-100 text-slate-600"
              }`}
            >
              <Calendar className="h-4 w-4" />
              {date.label}
              {filters.dateRange === date.value && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  Active
                </Badge>
              )}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}