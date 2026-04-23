// Renamed from middleware.ts → proxy.ts in Next.js 16.1. The function
// export was also renamed (middleware → proxy). The matcher config
// stays the same.
// See https://nextjs.org/docs/messages/middleware-to-proxy

import { NextRequest, NextResponse } from 'next/server';
import { PerformanceOptimizer } from './lib/performance';

export function proxy(request: NextRequest) {
  const startTime = Date.now();
  const url = request.nextUrl.clone();
  const pathname = url.pathname;

  // Skip middleware for Next.js internal routes
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  // Add security headers
  const isDevelopment = process.env.NODE_ENV === 'development';
  response.headers.set('Content-Security-Policy', PerformanceOptimizer.getCSPHeader(isDevelopment));
  
  // Add performance headers
  const cacheHeaders = PerformanceOptimizer.getCacheHeaders('dynamic');
  Object.entries(cacheHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  // Add HSTS header for security
  if (!isDevelopment) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Add performance monitoring
  PerformanceOptimizer.addPerformanceHeaders(response, startTime);

  // Preconnect hints only — don't preload /app/globals.css: Next.js
  // emits the stylesheet under a content-hashed /_next/static path, so
  // the literal path 404s and the browser downgrades rendering to
  // unstyled HTML while it retries.
  const preloadHints = [
    '<https://fonts.googleapis.com>; rel=preconnect',
    '<https://fonts.gstatic.com>; rel=preconnect; crossorigin',
  ];
  response.headers.set('Link', preloadHints.join(', '));

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)',
  ],
};