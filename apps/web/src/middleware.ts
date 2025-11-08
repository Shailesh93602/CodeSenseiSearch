import { NextRequest, NextResponse } from 'next/server';
import { PerformanceOptimizer } from './lib/performance';

export function middleware(request: NextRequest) {
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

  // Add preload hints for critical resources
  const preloadHints = [
    '</app/globals.css>; rel=preload; as=style',
    '<https://fonts.googleapis.com>; rel=preconnect',
    '<https://fonts.gstatic.com>; rel=preconnect; crossorigin'
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