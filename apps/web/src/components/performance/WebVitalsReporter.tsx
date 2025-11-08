'use client';

import { useEffect } from 'react';

interface WebVitalMetric {
  name: string;
  value: number;
  id: string;
  delta: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  navigationType: string;
}

export function WebVitalsReporter() {
  useEffect(() => {
    // Only run in production or when explicitly enabled
    if (process.env.NODE_ENV !== 'production' && !process.env.NEXT_PUBLIC_ENABLE_WEB_VITALS) {
      return;
    }

    const vitalsUrl = '/api/web-vitals';

    function sendToAnalytics(metric: WebVitalMetric) {
      // Send to your analytics service
      const body = JSON.stringify({
        name: metric.name,
        value: metric.value,
        id: metric.id,
        delta: metric.delta,
        rating: metric.rating,
        navigationType: metric.navigationType,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: Date.now()
      });

      // Use `navigator.sendBeacon()` if available, falling back to `fetch()`
      if (navigator.sendBeacon) {
        navigator.sendBeacon(vitalsUrl, body);
      } else {
        fetch(vitalsUrl, {
          method: 'POST',
          body,
          headers: {
            'Content-Type': 'application/json',
          },
          keepalive: true,
        }).catch(console.error);
      }
    }

    // Measure Core Web Vitals using PerformanceObserver
    const observeWebVitals = () => {
      // LCP - Largest Contentful Paint
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1] as PerformanceEntry & {
          size: number;
          loadTime: number;
        };
        
        sendToAnalytics({
          name: 'LCP',
          value: lastEntry.startTime,
          id: `LCP-${Date.now()}`,
          delta: lastEntry.startTime,
          rating: lastEntry.startTime <= 2500 ? 'good' : lastEntry.startTime <= 4000 ? 'needs-improvement' : 'poor',
          navigationType: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.type || 'navigate'
        });
      });

      // FCP - First Contentful Paint
      const fcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const fcpEntry = entries.find(entry => entry.name === 'first-contentful-paint');
        
        if (fcpEntry) {
          sendToAnalytics({
            name: 'FCP',
            value: fcpEntry.startTime,
            id: `FCP-${Date.now()}`,
            delta: fcpEntry.startTime,
            rating: fcpEntry.startTime <= 1800 ? 'good' : fcpEntry.startTime <= 3000 ? 'needs-improvement' : 'poor',
            navigationType: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.type || 'navigate'
          });
        }
      });

      try {
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        fcpObserver.observe({ entryTypes: ['paint'] });
      } catch (error) {
        console.error('Performance observer error:', error);
      }

      return () => {
        lcpObserver.disconnect();
        fcpObserver.disconnect();
      };
    };

    if ('PerformanceObserver' in window) {
      const cleanup = observeWebVitals();
      return cleanup;
    }
  }, []);

  return null;
}

// Performance observer for custom metrics
export function usePerformanceObserver() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
      return;
    }

    // Observe long tasks (> 50ms)
    const longTaskObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.duration > 50) {
          console.warn('Long task detected:', {
            duration: entry.duration,
            startTime: entry.startTime,
            name: entry.name
          });
        }
      });
    });

    // Observe layout shifts
    const layoutShiftObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        const layoutShiftEntry = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
          sources?: Array<{
            node: Element;
            currentRect: DOMRectReadOnly;
            previousRect: DOMRectReadOnly;
          }>;
        };
        
        if (layoutShiftEntry.hadRecentInput) return; // Ignore user-initiated shifts
        
        if (layoutShiftEntry.value > 0.1) {
          console.warn('Layout shift detected:', {
            value: layoutShiftEntry.value,
            sources: layoutShiftEntry.sources?.map((source) => ({
              node: source.node,
              currentRect: source.currentRect,
              previousRect: source.previousRect
            }))
          });
        }
      });
    });

    // Observe resource loading
    const resourceObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        const resourceEntry = entry as PerformanceResourceTiming;
        
        // Log slow resources (> 1s)
        if (entry.duration > 1000) {
          console.warn('Slow resource:', {
            name: entry.name,
            duration: entry.duration,
            size: resourceEntry.transferSize
          });
        }
      });
    });

    try {
      longTaskObserver.observe({ entryTypes: ['longtask'] });
      layoutShiftObserver.observe({ entryTypes: ['layout-shift'] });
      resourceObserver.observe({ entryTypes: ['resource'] });
    } catch (error) {
      console.error('Performance observer error:', error);
    }

    return () => {
      longTaskObserver.disconnect();
      layoutShiftObserver.disconnect();
      resourceObserver.disconnect();
    };
  }, []);
}

// Custom hook for measuring page load performance
export function usePageLoadMetrics() {
  useEffect(() => {
    // Wait for page to fully load
    if (document.readyState === 'complete') {
      measurePageLoad();
    } else {
      window.addEventListener('load', measurePageLoad);
      return () => window.removeEventListener('load', measurePageLoad);
    }

    function measurePageLoad() {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      
      if (navigation) {
        const metrics = {
          // Navigation timing
          domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
          load: navigation.loadEventEnd - navigation.loadEventStart,
          
          // Resource timing
          dns: navigation.domainLookupEnd - navigation.domainLookupStart,
          tcp: navigation.connectEnd - navigation.connectStart,
          request: navigation.responseStart - navigation.requestStart,
          response: navigation.responseEnd - navigation.responseStart,
          
          // Page timing
          domComplete: navigation.domComplete - navigation.fetchStart,
          loadComplete: navigation.loadEventEnd - navigation.fetchStart,
          
          // Transfer size
          transferSize: navigation.transferSize,
          encodedBodySize: navigation.encodedBodySize,
          decodedBodySize: navigation.decodedBodySize
        };

        console.log('Page load metrics:', metrics);

        // Send to analytics if in production
        if (process.env.NODE_ENV === 'production') {
          fetch('/api/page-metrics', {
            method: 'POST',
            body: JSON.stringify({
              url: window.location.href,
              metrics,
              timestamp: Date.now()
            }),
            headers: {
              'Content-Type': 'application/json',
            },
          }).catch(console.error);
        }
      }
    }
  }, []);
}