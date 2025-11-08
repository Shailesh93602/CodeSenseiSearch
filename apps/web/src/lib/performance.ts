import { NextRequest, NextResponse } from 'next/server';

/**
 * Performance optimization utilities for CodeSenseiSearch
 */

export class PerformanceOptimizer {
  /**
   * Generate optimized cache headers for different content types
   */
  static getCacheHeaders(contentType: 'static' | 'dynamic' | 'api' | 'image') {
    const headers: Record<string, string> = {};
    
    switch (contentType) {
      case 'static':
        // Static assets: long cache with immutable
        headers['Cache-Control'] = 'public, max-age=31536000, immutable';
        headers['Expires'] = new Date(Date.now() + 31536000000).toUTCString();
        break;
      
      case 'image':
        // Images: medium cache with revalidation
        headers['Cache-Control'] = 'public, max-age=2592000, stale-while-revalidate=86400';
        headers['Expires'] = new Date(Date.now() + 2592000000).toUTCString();
        break;
      
      case 'api':
        // API responses: short cache with revalidation
        headers['Cache-Control'] = 'public, max-age=300, stale-while-revalidate=60';
        headers['Expires'] = new Date(Date.now() + 300000).toUTCString();
        break;
      
      case 'dynamic':
        // Dynamic pages: very short cache
        headers['Cache-Control'] = 'public, max-age=60, stale-while-revalidate=30';
        headers['Expires'] = new Date(Date.now() + 60000).toUTCString();
        break;
    }
    
    // Security headers
    headers['X-Content-Type-Options'] = 'nosniff';
    headers['X-Frame-Options'] = 'DENY';
    headers['X-XSS-Protection'] = '1; mode=block';
    headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
    
    return headers;
  }

  /**
   * Generate CSP header for security and performance
   */
  static getCSPHeader(isDevelopment = false): string {
    const directives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
      "font-src 'self' fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "connect-src 'self' api.codesenseisearch.com"
    ];
    
    if (isDevelopment) {
      // More permissive for development
      directives[1] = "script-src 'self' 'unsafe-inline' 'unsafe-eval' localhost:* 127.0.0.1:*";
      directives.push("connect-src 'self' localhost:* 127.0.0.1:* ws: wss:");
    }
    
    return directives.join('; ');
  }

  /**
   * Compress response if client supports it
   */
  static shouldCompress(request: NextRequest, contentType: string): boolean {
    const acceptEncoding = request.headers.get('accept-encoding') || '';
    const compressibleTypes = [
      'text/',
      'application/json',
      'application/javascript',
      'application/xml',
      'image/svg+xml'
    ];
    
    return acceptEncoding.includes('gzip') && 
           compressibleTypes.some(type => contentType.startsWith(type));
  }

  /**
   * Add performance monitoring headers
   */
  static addPerformanceHeaders(response: NextResponse, startTime: number) {
    const duration = Date.now() - startTime;
    response.headers.set('Server-Timing', `total;dur=${duration}`);
    response.headers.set('X-Response-Time', `${duration}ms`);
    
    // Add Core Web Vitals hints
    response.headers.set('Link', [
      '</fonts/geist-sans.woff2>; rel=preload; as=font; type=font/woff2; crossorigin',
      '</fonts/geist-mono.woff2>; rel=preload; as=font; type=font/woff2; crossorigin'
    ].join(', '));
    
    return response;
  }
}

/**
 * Resource hints for critical resources
 */
export const criticalResourceHints = {
  fonts: [
    {
      href: '/fonts/geist-sans.woff2',
      rel: 'preload',
      as: 'font',
      type: 'font/woff2',
      crossOrigin: 'anonymous'
    },
    {
      href: '/fonts/geist-mono.woff2',
      rel: 'preload',
      as: 'font',
      type: 'font/woff2',
      crossOrigin: 'anonymous'
    }
  ],
  
  styles: [
    {
      href: 'https://fonts.googleapis.com',
      rel: 'preconnect'
    },
    {
      href: 'https://fonts.gstatic.com',
      rel: 'preconnect',
      crossOrigin: 'anonymous'
    }
  ],
  
  api: [
    {
      href: '//api.codesenseisearch.com',
      rel: 'dns-prefetch'
    }
  ]
};

/**
 * Image optimization configuration
 */
export const imageOptimization = {
  // Default next/image configuration
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  
  // Responsive image breakpoints
  breakpoints: {
    mobile: '(max-width: 768px)',
    tablet: '(max-width: 1024px)',
    desktop: '(min-width: 1025px)'
  },
  
  // Quality settings by content type
  quality: {
    hero: 85,
    content: 75,
    thumbnail: 60,
    avatar: 80
  },
  
  // Format preferences
  formats: ['image/avif', 'image/webp', 'image/jpeg'],
  
  // Lazy loading thresholds
  loading: {
    eager: 2, // First 2 images load eagerly
    lazy: 'lazy' // Rest load lazily
  }
};

/**
 * Core Web Vitals optimization thresholds
 */
export const webVitalsThresholds = {
  // Largest Contentful Paint (LCP)
  lcp: {
    good: 2500,
    needsImprovement: 4000
  },
  
  // First Input Delay (FID)
  fid: {
    good: 100,
    needsImprovement: 300
  },
  
  // Cumulative Layout Shift (CLS)
  cls: {
    good: 0.1,
    needsImprovement: 0.25
  },
  
  // First Contentful Paint (FCP)
  fcp: {
    good: 1800,
    needsImprovement: 3000
  },
  
  // Time to Interactive (TTI)
  tti: {
    good: 3800,
    needsImprovement: 7300
  }
};

/**
 * Bundle splitting strategy
 */
export const bundleStrategy = {
  // Critical chunks that should be inlined
  inline: [
    'runtime',
    'critical-css'
  ],
  
  // Chunks to preload
  preload: [
    'main',
    'vendor'
  ],
  
  // Chunks to prefetch
  prefetch: [
    'search',
    'documentation'
  ],
  
  // Size limits
  limits: {
    maxInitialChunkSize: 244000, // ~244kb
    maxAsyncChunkSize: 244000,
    maxTotalSize: 512000 // ~512kb initial
  }
};