"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Code2, MessageSquare, BookOpen, Calendar, Star, Filter, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Filters {
  source: string;
  language: string;
  sortBy: string;
  dateRange: string;
}

interface SearchFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  /** Optional clear handler — only rendered when there's something to clear. */
  onClear?: () => void;
}

const SOURCE_OPTIONS = [
  { value: "all", label: "All sources", Icon: null },
  { value: "github", label: "GitHub", Icon: Code2 },
  { value: "stackoverflow", label: "Stack Overflow", Icon: MessageSquare },
  { value: "docs", label: "Documentation", Icon: BookOpen },
] as const;

const LANGUAGE_OPTIONS = [
  { value: "all", label: "All languages" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "java", label: "Java" },
  { value: "csharp", label: "C#" },
  { value: "php", label: "PHP" },
] as const;

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance", Icon: Star },
  { value: "date", label: "Most recent", Icon: Calendar },
] as const;

const DATE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
  { value: "year", label: "Past year" },
] as const;

export function SearchFilters({
  filters,
  onFiltersChange,
  onClear,
}: SearchFiltersProps) {
  const update = (key: keyof Filters, value: string) =>
    onFiltersChange({ ...filters, [key]: value });

  return (
    <Card className="p-5 bg-card text-card-foreground border-border">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          Filters
        </h3>
        {onClear && (
          <Button variant="ghost" size="sm" onClick={onClear} className="h-7 text-xs">
            Clear
          </Button>
        )}
      </div>

      <FilterGroup label="Source">
        {SOURCE_OPTIONS.map((opt) => (
          <FilterOption
            key={opt.value}
            label={opt.label}
            Icon={opt.Icon}
            active={filters.source === opt.value}
            onClick={() => update("source", opt.value)}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Language">
        {LANGUAGE_OPTIONS.map((opt) => (
          <FilterOption
            key={opt.value}
            label={opt.label}
            active={filters.language === opt.value}
            onClick={() => update("language", opt.value)}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Sort by">
        {SORT_OPTIONS.map((opt) => (
          <FilterOption
            key={opt.value}
            label={opt.label}
            Icon={opt.Icon}
            active={filters.sortBy === opt.value}
            onClick={() => update("sortBy", opt.value)}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Date" hideDivider>
        {DATE_OPTIONS.map((opt) => (
          <FilterOption
            key={opt.value}
            label={opt.label}
            active={filters.dateRange === opt.value}
            onClick={() => update("dateRange", opt.value)}
          />
        ))}
      </FilterGroup>
    </Card>
  );
}

function FilterGroup({
  label,
  hideDivider,
  children,
}: {
  label: string;
  hideDivider?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "py-4 first:pt-0",
        !hideDivider && "border-b border-border last:border-b-0",
      )}
    >
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {label}
      </h4>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function FilterOption({
  label,
  Icon,
  active,
  onClick,
}: {
  label: string;
  Icon?: React.ComponentType<{ className?: string }> | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary/10 text-foreground font-medium"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      <span className="flex-1 text-left">{label}</span>
      {active && <Check className="h-3.5 w-3.5 text-primary" />}
    </button>
  );
}
