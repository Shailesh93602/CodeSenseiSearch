import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SEOMetadata, pageConfigs } from "@/lib/seo";
import { ThemeProvider } from "@/components/theme-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = SEOMetadata.generateMetadata(pageConfigs.home);

/**
 * Inline pre-hydration script: read the persisted theme from
 * localStorage and apply the .dark class to <html> BEFORE the body
 * paints. Prevents the dark→light flash that next-themes alone can't
 * eliminate during SSR. Mirrors the pattern from the owner's other
 * portfolio sites.
 */
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored ?? (prefersDark ? 'dark' : 'light');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (_) {}
})();
`.trim();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const structuredData = SEOMetadata.generateStructuredData(pageConfigs.home);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Theme bootstrap — runs before paint to avoid FOUC. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData.software),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData.organization),
          }}
        />

        <link
          rel="search"
          type="application/opensearchdescription+xml"
          title="CodeSenseiSearch"
          href="/opensearch.xml"
        />

        <link rel="manifest" href="/manifest.json" />

        <meta name="application-name" content="CodeSenseiSearch" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CodeSenseiSearch" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="hsl(240 70% 55%)" />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased min-h-screen flex flex-col`}
      >
        <ThemeProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
          >
            Skip to main content
          </a>
          <Navbar />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
