import { MetadataRoute } from 'next';

export interface SitemapEntry {
  url: string;
  lastModified?: Date;
  changeFrequency?:
    | 'always'
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'never';
  priority?: number;
}

/**
 * Sitemap generator.
 *
 * The entry list is intentionally limited to pages that actually exist
 * in `apps/web/src/app`. Adding a URL here that doesn't resolve to a
 * real route is worse than not listing it — it teaches search crawlers
 * to hit 404s, hurting rankings and wasting their budget.
 */
export class SitemapGenerator {
  private static baseUrl = 'https://code-sensei-search-web.vercel.app';

  static generateStaticSitemap(): MetadataRoute.Sitemap {
    const now = new Date();

    const staticPages: SitemapEntry[] = [
      {
        url: this.baseUrl,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 1.0,
      },
      {
        url: `${this.baseUrl}/search`,
        lastModified: now,
        changeFrequency: 'daily',
        priority: 0.9,
      },
      {
        url: `${this.baseUrl}/docs`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.8,
      },
      {
        url: `${this.baseUrl}/docs/api`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.8,
      },
      {
        url: `${this.baseUrl}/docs/integration`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.7,
      },
      {
        url: `${this.baseUrl}/blog`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.6,
      },
    ];

    return staticPages;
  }

  static async generateFullSitemap(): Promise<MetadataRoute.Sitemap> {
    return this.generateStaticSitemap();
  }

  static generateRobotsTxt(): string {
    return `User-agent: *
Allow: /

Sitemap: ${this.baseUrl}/sitemap.xml

Disallow: /api/
Disallow: /admin/
Disallow: /_next/
`;
  }

  static generateSearchXml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/"
                       xmlns:moz="http://www.mozilla.org/2006/browser/search/">
  <ShortName>CodeSenseiSearch</ShortName>
  <Description>Search code snippets and developer documentation with AI</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Image width="16" height="16" type="image/x-icon">${this.baseUrl}/favicon.ico</Image>
  <Url type="text/html" template="${this.baseUrl}/search?q={searchTerms}"/>
  <Url type="application/opensearchdescription+xml" rel="self" template="${this.baseUrl}/opensearch.xml"/>
  <moz:SearchForm>${this.baseUrl}/search</moz:SearchForm>
  <Developer>Shailesh Chaudhari</Developer>
  <SyndicationRight>open</SyndicationRight>
  <AdultContent>false</AdultContent>
  <Language>en-us</Language>
</OpenSearchDescription>`;
  }
}
