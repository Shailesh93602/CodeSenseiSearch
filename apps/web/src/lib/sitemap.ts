import { MetadataRoute } from 'next';

export interface SitemapEntry {
  url: string;
  lastModified?: Date;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

export class SitemapGenerator {
  private static baseUrl = 'https://codesenseisearch.com';

  static generateStaticSitemap(): MetadataRoute.Sitemap {
    const staticPages: SitemapEntry[] = [
      {
        url: this.baseUrl,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 1.0,
      },
      {
        url: `${this.baseUrl}/search`,
        lastModified: new Date(),
        changeFrequency: 'hourly',
        priority: 0.9,
      },
      {
        url: `${this.baseUrl}/languages`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      },
      {
        url: `${this.baseUrl}/javascript`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      },
      {
        url: `${this.baseUrl}/python`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      },
      {
        url: `${this.baseUrl}/react`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      },
      {
        url: `${this.baseUrl}/docs`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      },
      {
        url: `${this.baseUrl}/docs/getting-started`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      },
      {
        url: `${this.baseUrl}/docs/api`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      },
      {
        url: `${this.baseUrl}/docs/integration`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.7,
      },
      {
        url: `${this.baseUrl}/about`,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.6,
      },
      {
        url: `${this.baseUrl}/blog`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.7,
      },
      {
        url: `${this.baseUrl}/contact`,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.5,
      },
      {
        url: `${this.baseUrl}/privacy`,
        lastModified: new Date(),
        changeFrequency: 'yearly',
        priority: 0.3,
      },
      {
        url: `${this.baseUrl}/terms`,
        lastModified: new Date(),
        changeFrequency: 'yearly',
        priority: 0.3,
      },
    ];

    return staticPages;
  }

  static async generateDynamicSitemap(): Promise<SitemapEntry[]> {
    // This would be populated with dynamic content from the database
    // For now, we'll return an empty array and implement this in Phase 7
    const dynamicPages: SitemapEntry[] = [];

    try {
      // TODO: Fetch blog posts from database
      // const blogPosts = await getBlogPosts();
      // dynamicPages.push(
      //   ...blogPosts.map(post => ({
      //     url: `${this.baseUrl}/blog/${post.slug}`,
      //     lastModified: new Date(post.updatedAt),
      //     changeFrequency: 'monthly' as const,
      //     priority: 0.6,
      //   }))
      // );

      // TODO: Fetch documentation pages from database
      // const docPages = await getDocPages();
      // dynamicPages.push(
      //   ...docPages.map(doc => ({
      //     url: `${this.baseUrl}/docs/${doc.slug}`,
      //     lastModified: new Date(doc.updatedAt),
      //     changeFrequency: 'weekly' as const,
      //     priority: 0.7,
      //   }))
      // );

    } catch (error) {
      console.error('Error generating dynamic sitemap:', error);
    }

    return dynamicPages;
  }

  static async generateFullSitemap(): Promise<MetadataRoute.Sitemap> {
    const staticPages = this.generateStaticSitemap();
    const dynamicPages = await this.generateDynamicSitemap();
    
    return [...staticPages, ...dynamicPages];
  }

  static generateRobotsTxt(): string {
    return `User-agent: *
Allow: /

# Sitemap
Sitemap: ${this.baseUrl}/sitemap.xml

# Crawl-delay for common bots
User-agent: Googlebot
Crawl-delay: 1

User-agent: Bingbot
Crawl-delay: 1

# Block sensitive areas
Disallow: /api/
Disallow: /admin/
Disallow: /_next/
Disallow: /private/

# Allow important static assets
Allow: /api/sitemap
Allow: /_next/static/
Allow: /favicon.ico
Allow: /robots.txt

# Cache directives (informational)
# Cache-Control: max-age=86400`;
  }

  static generateSearchXml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/"
                       xmlns:moz="http://www.mozilla.org/2006/browser/search/">
  <ShortName>CodeSenseiSearch</ShortName>
  <Description>Search code snippets and developer documentation with AI</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Image width="16" height="16" type="image/x-icon">${this.baseUrl}/favicon.ico</Image>
  <Image width="32" height="32" type="image/png">${this.baseUrl}/icon-32.png</Image>
  <Url type="text/html" template="${this.baseUrl}/search?q={searchTerms}"/>
  <Url type="application/opensearchdescription+xml" rel="self" template="${this.baseUrl}/opensearch.xml"/>
  <moz:SearchForm>${this.baseUrl}/search</moz:SearchForm>
  <Developer>CodeSenseiSearch Team</Developer>
  <Contact>support@codesenseisearch.com</Contact>
  <Attribution>Search powered by CodeSenseiSearch AI</Attribution>
  <SyndicationRight>open</SyndicationRight>
  <AdultContent>false</AdultContent>
  <Language>en-us</Language>
</OpenSearchDescription>`;
  }
}