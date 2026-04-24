import Link from "next/link";

const REPO_URL = "https://github.com/Shailesh93602/CodeSenseiSearch";
const PORTFOLIO_URL = "https://shaileshchaudhari.vercel.app";

const FOOTER_LINKS = [
  { href: "/search", label: "Search" },
  { href: "/docs", label: "Docs" },
  { href: "/docs/api", label: "API" },
  { href: "/docs/integration", label: "Integration" },
];

/**
 * Site footer. Tiny on purpose — recruiters scan, they don't read.
 * Two horizontal rows: nav links + meta line ("built by … / view source
 * / portfolio"). Renders on every route via app/layout.tsx.
 */
export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span>
              Built by{" "}
              <a
                href={PORTFOLIO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground hover:underline underline-offset-4"
              >
                Shailesh Chaudhari
              </a>
            </span>
            <span aria-hidden="true">·</span>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              View source
            </a>
            <span aria-hidden="true">·</span>
            <span>MIT licensed</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
