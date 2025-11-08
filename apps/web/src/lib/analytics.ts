// Google Analytics 4 and Search Console integration utilities

// GA4 Configuration
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';

// Event tracking interface
export interface GAEvent {
  action: string;
  category: string;
  label?: string;
  value?: number;
  custom_parameters?: Record<string, string | number | boolean>;
}

// Search-specific events
export interface SearchEvent {
  search_term: string;
  search_type: 'semantic' | 'keyword' | 'hybrid';
  results_count: number;
  search_duration_ms: number;
  user_language?: string;
  programming_language?: string;
  filters_applied?: string[];
}

// User engagement events
export interface EngagementEvent {
  event_type: 'code_copy' | 'bookmark_add' | 'share' | 'download' | 'view_result';
  content_id?: string;
  content_type?: string;
  programming_language?: string;
  source?: string;
}

// Performance monitoring events
export interface PerformanceEvent {
  metric_name: 'CLS' | 'FID' | 'FCP' | 'LCP' | 'TTFB';
  metric_value: number;
  page_path: string;
  user_agent?: string;
}

// Google Analytics global interface
declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

export class Analytics {
  private static isInitialized = false;
  private static debugMode = process.env.NODE_ENV === 'development';

  // Initialize analytics
  static initialize() {
    if (this.isInitialized || !GA_MEASUREMENT_ID) return;

    // Configure GA4
    if (typeof window !== 'undefined') {
      // Google Analytics 4 setup
      window.gtag = window.gtag || function (...args: unknown[]) {
        (window.dataLayer = window.dataLayer || []).push(args);
      };
      window.gtag('js', new Date());
      window.gtag('config', GA_MEASUREMENT_ID, {
        // Enhanced ecommerce for tracking downloads/resources
        enhanced_ecommerce: true,
        // Custom dimensions for developer-specific tracking
        custom_map: {
          programming_language: 'custom_dimension_1',
          search_type: 'custom_dimension_2',
          user_experience_level: 'custom_dimension_3',
          content_category: 'custom_dimension_4'
        },
        // Performance monitoring
        send_page_view: true,
        allow_google_signals: true,
        allow_ad_personalization_signals: false // Privacy-focused
      });

      this.isInitialized = true;
      this.log('Analytics initialized');
    }
  }

  // Track search events
  static trackSearch(event: SearchEvent) {
    if (!this.isInitialized) return;

    const searchEvent = {
      event_name: 'search',
      search_term: event.search_term,
      search_type: event.search_type,
      results_count: event.results_count,
      search_duration: event.search_duration_ms,
      programming_language: event.programming_language,
      filters_applied: event.filters_applied?.join(','),
      value: event.results_count > 0 ? 1 : 0 // Success metric
    };

    this.sendEvent('search', searchEvent);
    this.log('Search tracked:', searchEvent);
  }

  // Track user engagement
  static trackEngagement(event: EngagementEvent) {
    if (!this.isInitialized) return;

    const engagementEvent = {
      event_name: 'engagement',
      engagement_type: event.event_type,
      content_id: event.content_id,
      content_type: event.content_type,
      programming_language: event.programming_language,
      source: event.source,
      value: 1
    };

    this.sendEvent('engagement', engagementEvent);
    this.log('Engagement tracked:', engagementEvent);
  }

  // Track performance metrics (Core Web Vitals)
  static trackPerformance(event: PerformanceEvent) {
    if (!this.isInitialized) return;

    const performanceEvent = {
      event_name: 'web_vitals',
      metric_name: event.metric_name,
      metric_value: Math.round(event.metric_value),
      page_path: event.page_path,
      user_agent: event.user_agent
    };

    this.sendEvent('web_vitals', performanceEvent);
    this.log('Performance tracked:', performanceEvent);
  }

  // Track page views with custom parameters
  static trackPageView(pagePath: string, pageTitle: string, customParams?: Record<string, string | number | boolean>) {
    if (!this.isInitialized) return;

    const pageEvent = {
      page_path: pagePath,
      page_title: pageTitle,
      ...customParams
    };

    this.sendEvent('page_view', pageEvent);
    this.log('Page view tracked:', pageEvent);
  }

  // Track resource downloads
  static trackDownload(resourceId: string, resourceType: string, resourceCategory: string) {
    if (!this.isInitialized) return;

    const downloadEvent = {
      event_name: 'file_download',
      file_name: resourceId,
      file_extension: resourceType,
      content_category: resourceCategory,
      value: 1
    };

    this.sendEvent('file_download', downloadEvent);
    this.log('Download tracked:', downloadEvent);
  }

  // Track custom events
  static trackCustomEvent(eventName: string, parameters: Record<string, string | number | boolean>) {
    if (!this.isInitialized) return;

    this.sendEvent(eventName, parameters);
    this.log('Custom event tracked:', { eventName, parameters });
  }

  // Send event to Google Analytics
  private static sendEvent(eventName: string, parameters: Record<string, unknown>) {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', eventName, parameters);
    }
  }

  // Debug logging
  private static log(...args: unknown[]) {
    if (this.debugMode) {
      console.log('[Analytics]', ...args);
    }
  }

  // Get user session data
  static getSessionData(): Record<string, string | number> {
    if (typeof window === 'undefined') return {};

    return {
      session_id: this.getSessionId(),
      user_id: this.getUserId(),
      timestamp: Date.now(),
      user_agent: navigator.userAgent,
      language: navigator.language,
      screen_resolution: `${screen.width}x${screen.height}`,
      viewport_size: `${window.innerWidth}x${window.innerHeight}`
    };
  }

  // Generate or retrieve session ID
  private static getSessionId(): string {
    if (typeof window === 'undefined') return '';
    
    let sessionId = sessionStorage.getItem('analytics_session_id');
    if (!sessionId) {
      sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('analytics_session_id', sessionId);
    }
    return sessionId;
  }

  // Generate or retrieve user ID (anonymous)
  private static getUserId(): string {
    if (typeof window === 'undefined') return '';
    
    let userId = localStorage.getItem('analytics_user_id');
    if (!userId) {
      userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('analytics_user_id', userId);
    }
    return userId;
  }
}

// Extended Performance Entry interface for FID
interface ExtendedPerformanceEntry extends PerformanceEntry {
  processingStart?: number;
}

// Search Console integration utilities
export class SearchConsole {
  private static readonly SEARCH_CONSOLE_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://codesenseisearch.com';

  // Track search console metrics
  static trackSearchConsoleMetrics() {
    // This would typically be done server-side with Search Console API
    // For client-side, we can track user search behavior that correlates with Search Console data
    
    const searchQuery = this.extractSearchQuery();
    const searchMetrics = {
      organic_traffic_source: document.referrer.includes('google') ? 'google' : 'other',
      landing_page: window.location.pathname,
      search_query: searchQuery || '',
      timestamp: new Date().toISOString()
    };

    Analytics.trackCustomEvent('organic_search_landing', searchMetrics);
  }

  // Extract search query from referrer (when available)
  private static extractSearchQuery(): string | null {
    if (typeof window === 'undefined') return null;
    
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('q') || urlParams.get('query') || null;
    } catch {
      return null;
    }
  }

  // Track Core Web Vitals for Search Console correlation
  static trackCoreWebVitals() {
    if (typeof window === 'undefined') return;

    // Track Largest Contentful Paint
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.entryType === 'largest-contentful-paint') {
          Analytics.trackPerformance({
            metric_name: 'LCP',
            metric_value: entry.startTime,
            page_path: window.location.pathname
          });
        }
      });
    });

    observer.observe({ entryTypes: ['largest-contentful-paint'] });

    // Track First Input Delay
    const fidObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        const extendedEntry = entry as ExtendedPerformanceEntry;
        if (extendedEntry.processingStart && extendedEntry.startTime) {
          Analytics.trackPerformance({
            metric_name: 'FID',
            metric_value: extendedEntry.processingStart - extendedEntry.startTime,
            page_path: window.location.pathname
          });
        }
      });
    });

    fidObserver.observe({ entryTypes: ['first-input'] });
  }
}

// React hook for tracking search events
export function useSearchTracking() {
  const trackSearch = (searchTerm: string, searchType: 'semantic' | 'keyword' | 'hybrid', resultsCount: number, duration: number) => {
    Analytics.trackSearch({
      search_term: searchTerm,
      search_type: searchType,
      results_count: resultsCount,
      search_duration_ms: duration
    });
  };

  const trackEngagement = (type: EngagementEvent['event_type'], contentId?: string, programmingLanguage?: string) => {
    Analytics.trackEngagement({
      event_type: type,
      content_id: contentId,
      programming_language: programmingLanguage
    });
  };

  return { trackSearch, trackEngagement };
}

// Initialize analytics on app load
export function initializeAnalytics() {
  if (typeof window !== 'undefined') {
    Analytics.initialize();
    SearchConsole.trackCoreWebVitals();
    
    // Track page load
    window.addEventListener('load', () => {
      SearchConsole.trackSearchConsoleMetrics();
    });
  }
}

export default Analytics;