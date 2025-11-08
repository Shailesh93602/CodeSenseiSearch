import { Metadata } from 'next';

export interface SEOConfig {
  title: string;
  description: string;
  keywords?: string[];
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
  section?: string;
  tags?: string[];
}

export class SEOMetadata {
  private static defaultConfig: SEOConfig = {
    title: 'CodeSenseiSearch - AI-Powered Code Search Engine',
    description: 'Advanced semantic search for developer content. Find code snippets, solutions, and documentation with AI-powered relevance ranking.',
    keywords: [
      'code search',
      'developer tools',
      'semantic search',
      'programming',
      'AI search',
      'code snippets',
      'developer documentation',
      'software development',
      'API search',
      'technical documentation'
    ],
    image: '/og-image.png',
    url: 'https://codesenseisearch.com',
    type: 'website'
  };

  static generateMetadata(config: Partial<SEOConfig> = {}): Metadata {
    const seoConfig = { ...this.defaultConfig, ...config };
    
    return {
      title: seoConfig.title,
      description: seoConfig.description,
      keywords: seoConfig.keywords?.join(', '),
      authors: seoConfig.authors?.map(name => ({ name })),
      
      // Open Graph
      openGraph: {
        title: seoConfig.title,
        description: seoConfig.description,
        url: seoConfig.url,
        siteName: 'CodeSenseiSearch',
        images: [
          {
            url: seoConfig.image || '/og-image.png',
            width: 1200,
            height: 630,
            alt: seoConfig.title,
          },
        ],
        locale: 'en_US',
        type: seoConfig.type,
        ...(seoConfig.publishedTime && { publishedTime: seoConfig.publishedTime }),
        ...(seoConfig.modifiedTime && { modifiedTime: seoConfig.modifiedTime }),
        ...(seoConfig.section && { section: seoConfig.section }),
        ...(seoConfig.tags && { tags: seoConfig.tags }),
      },
      
      // Twitter
      twitter: {
        card: 'summary_large_image',
        title: seoConfig.title,
        description: seoConfig.description,
        images: [seoConfig.image || '/og-image.png'],
        creator: '@codesenseisearch',
        site: '@codesenseisearch',
      },
      
      // Additional meta tags
      robots: {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          'max-video-preview': -1,
          'max-image-preview': 'large',
          'max-snippet': -1,
        },
      },
      
      // Canonical URL
      alternates: {
        canonical: seoConfig.url,
      },
      
      // Additional SEO tags
      other: {
        'application-name': 'CodeSenseiSearch',
        'apple-mobile-web-app-title': 'CodeSenseiSearch',
        'format-detection': 'telephone=no',
        'mobile-web-app-capable': 'yes',
        'apple-mobile-web-app-capable': 'yes',
        'apple-mobile-web-app-status-bar-style': 'default',
      },
    };
  }

  static generateStructuredData(config: Partial<SEOConfig> = {}) {
    const seoConfig = { ...this.defaultConfig, ...config };
    
    const baseStructuredData = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'CodeSenseiSearch',
      description: seoConfig.description,
      url: seoConfig.url,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web Browser',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      creator: {
        '@type': 'Organization',
        name: 'CodeSenseiSearch Team',
        url: seoConfig.url,
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.8',
        ratingCount: '150',
        bestRating: '5',
        worstRating: '1',
      },
      featureList: [
        'AI-powered semantic search',
        'Code snippet discovery',
        'Documentation search',
        'GitHub integration',
        'Stack Overflow integration',
        'Personalized results',
        'Advanced filtering',
        'Real-time search'
      ],
    };

    // Add organization structured data
    const organizationData = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'CodeSenseiSearch',
      url: seoConfig.url,
      logo: {
        '@type': 'ImageObject',
        url: `${seoConfig.url}/logo.png`,
        width: 512,
        height: 512,
      },
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'Customer Service',
        email: 'support@codesenseisearch.com',
        url: `${seoConfig.url}/contact`,
      },
      sameAs: [
        'https://github.com/Shailesh93602/CodeSenseiSearch',
        'https://twitter.com/codesenseisearch',
      ],
    };

    return {
      software: baseStructuredData,
      organization: organizationData,
    };
  }

  static generateBreadcrumbStructuredData(breadcrumbs: Array<{ name: string; url: string }>) {
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: crumb.url,
      })),
    };
  }

  static generateArticleStructuredData(article: {
    title: string;
    description: string;
    url: string;
    publishedTime: string;
    modifiedTime?: string;
    author: string;
    section?: string;
    tags?: string[];
    image?: string;
  }) {
    return {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: article.title,
      description: article.description,
      url: article.url,
      datePublished: article.publishedTime,
      dateModified: article.modifiedTime || article.publishedTime,
      author: {
        '@type': 'Person',
        name: article.author,
      },
      publisher: {
        '@type': 'Organization',
        name: 'CodeSenseiSearch',
        logo: {
          '@type': 'ImageObject',
          url: 'https://codesenseisearch.com/logo.png',
        },
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': article.url,
      },
      image: article.image ? {
        '@type': 'ImageObject',
        url: article.image,
        width: 1200,
        height: 630,
      } : undefined,
      keywords: article.tags?.join(', '),
      articleSection: article.section,
    };
  }
}

// Pre-defined page configurations
export const pageConfigs = {
  home: {
    title: 'CodeSenseiSearch - AI-Powered Code Search Engine',
    description: 'Advanced semantic search for developer content. Find code snippets, solutions, and documentation with AI-powered relevance ranking.',
    url: 'https://codesenseisearch.com',
  },
  
  search: {
    title: 'Search Results | CodeSenseiSearch',
    description: 'Search results for your code and documentation queries with AI-powered relevance ranking.',
    url: 'https://codesenseisearch.com/search',
  },
  
  docs: {
    title: 'Documentation | CodeSenseiSearch',
    description: 'Complete documentation for CodeSenseiSearch API, integration guides, and developer resources.',
    url: 'https://codesenseisearch.com/docs',
    type: 'article' as const,
  },
  
  about: {
    title: 'About CodeSenseiSearch | AI-Powered Developer Tools',
    description: 'Learn about CodeSenseiSearch mission to revolutionize how developers find and use code through AI-powered semantic search.',
    url: 'https://codesenseisearch.com/about',
  },
  
  blog: {
    title: 'Developer Blog | CodeSenseiSearch',
    description: 'Technical articles, tutorials, and insights about code search, AI, and developer productivity.',
    url: 'https://codesenseisearch.com/blog',
    type: 'article' as const,
  },
  
  contact: {
    title: 'Contact Us | CodeSenseiSearch',
    description: 'Get in touch with the CodeSenseiSearch team for support, partnerships, or feedback.',
    url: 'https://codesenseisearch.com/contact',
  },
};