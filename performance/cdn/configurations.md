# CDN Configuration for CodeSenseiSearch
# This configuration optimizes content delivery and caching

# Cloudflare Workers configuration (example)
worker_script = '''
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const cache = caches.default
  
  // Custom cache keys for different content types
  const cacheKey = getCacheKey(url, request)
  
  // Check if we have cached response
  let response = await cache.match(cacheKey)
  
  if (!response) {
    // Fetch from origin
    response = await fetch(request)
    
    // Clone response for caching
    const responseToCache = response.clone()
    
    // Add custom headers and cache based on content type
    const modifiedResponse = new Response(responseToCache.body, {
      status: responseToCache.status,
      statusText: responseToCache.statusText,
      headers: {
        ...responseToCache.headers,
        'Cache-Control': getCacheControl(url.pathname),
        'X-CDN-Cache': 'MISS',
        'X-Cache-Time': new Date().toISOString()
      }
    })
    
    // Cache the response
    event.waitUntil(cache.put(cacheKey, modifiedResponse.clone()))
    
    return modifiedResponse
  }
  
  // Return cached response with modified headers
  const cachedResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...response.headers,
      'X-CDN-Cache': 'HIT',
      'X-Cache-Age': getCacheAge(response.headers.get('date'))
    }
  })
  
  return cachedResponse
}

function getCacheKey(url, request) {
  // Create cache key based on URL and relevant headers
  const cacheUrl = new URL(url)
  
  // Remove tracking parameters
  const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid']
  paramsToRemove.forEach(param => cacheUrl.searchParams.delete(param))
  
  // Include relevant headers in cache key
  const acceptEncoding = request.headers.get('accept-encoding') || ''
  const userAgent = request.headers.get('user-agent') || ''
  const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent)
  
  return `${cacheUrl.toString()}:${acceptEncoding}:mobile=${isMobile}`
}

function getCacheControl(pathname) {
  // Static assets - long cache
  if (/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/.test(pathname)) {
    return 'public, max-age=31536000, immutable' // 1 year
  }
  
  // API responses - short cache
  if (pathname.startsWith('/api/')) {
    return 'public, max-age=300, stale-while-revalidate=600' // 5 minutes
  }
  
  // HTML pages - moderate cache
  if (pathname.endsWith('/') || pathname.endsWith('.html') || !pathname.includes('.')) {
    return 'public, max-age=1800, stale-while-revalidate=3600' // 30 minutes
  }
  
  // Default
  return 'public, max-age=600, stale-while-revalidate=1200' // 10 minutes
}

function getCacheAge(dateHeader) {
  if (!dateHeader) return 'unknown'
  
  const cacheTime = new Date(dateHeader)
  const now = new Date()
  const ageInSeconds = Math.floor((now - cacheTime) / 1000)
  
  return ageInSeconds.toString()
}
'''

# Nginx CDN configuration
nginx_config = '''
# Nginx configuration for CDN functionality
server {
    listen 80;
    server_name cdn.codesenseisearch.com;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/xml+rss
        application/json;
    
    # Brotli compression (if module available)
    brotli on;
    brotli_comp_level 6;
    brotli_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/xml+rss
        application/json;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Static assets with long cache
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header X-Cache-Type "static";
        
        # CORS for fonts and assets
        add_header Access-Control-Allow-Origin "*";
        add_header Access-Control-Allow-Methods "GET, OPTIONS";
        add_header Access-Control-Allow-Headers "Origin, X-Requested-With, Content-Type, Accept";
        
        # Optimize for static files
        tcp_nodelay off;
        tcp_nopush on;
        sendfile on;
        
        # Handle missing files gracefully
        try_files $uri =404;
    }
    
    # API responses with short cache
    location /api/ {
        expires 5m;
        add_header Cache-Control "public, max-age=300, stale-while-revalidate=600";
        add_header X-Cache-Type "api";
        
        # Proxy to API server
        proxy_pass http://api-backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Cache based on URL and accept headers
        proxy_cache_key "$scheme$proxy_host$request_uri$http_accept";
        proxy_cache api_cache;
        proxy_cache_valid 200 302 5m;
        proxy_cache_valid 404 1m;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    }
    
    # HTML pages with moderate cache
    location / {
        expires 30m;
        add_header Cache-Control "public, max-age=1800, stale-while-revalidate=3600";
        add_header X-Cache-Type "page";
        
        # Proxy to web server
        proxy_pass http://web-backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Cache based on URL and user agent (mobile/desktop)
        set $mobile "";
        if ($http_user_agent ~* "(Mobile|Android|iPhone|iPad)") {
            set $mobile "mobile";
        }
        proxy_cache_key "$scheme$proxy_host$request_uri$mobile";
        proxy_cache page_cache;
        proxy_cache_valid 200 30m;
        proxy_cache_valid 404 5m;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    }
    
    # Health check endpoint
    location /cdn-health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}

# Cache zones
proxy_cache_path /var/cache/nginx/api levels=1:2 keys_zone=api_cache:10m max_size=100m inactive=60m use_temp_path=off;
proxy_cache_path /var/cache/nginx/pages levels=1:2 keys_zone=page_cache:10m max_size=500m inactive=120m use_temp_path=off;

# Upstream servers
upstream api-backend {
    server api:3001;
    keepalive 32;
}

upstream web-backend {
    server web:3000;
    keepalive 32;
}
'''

# AWS CloudFront configuration (terraform)
cloudfront_config = '''
# CloudFront distribution configuration
resource "aws_cloudfront_distribution" "codesenseisearch_cdn" {
  origin {
    domain_name = "codesenseisearch.com"
    origin_id   = "codesenseisearch-origin"
    
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }
  
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "CodeSenseiSearch CDN"
  default_root_object = "index.html"
  
  # Static assets cache behavior
  ordered_cache_behavior {
    path_pattern     = "/_next/static/*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "codesenseisearch-origin"
    
    forwarded_values {
      query_string = false
      headers      = ["Accept-Encoding"]
      
      cookies {
        forward = "none"
      }
    }
    
    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 31536000  # 1 year
    default_ttl            = 31536000  # 1 year
    max_ttl                = 31536000  # 1 year
    compress               = true
  }
  
  # API cache behavior
  ordered_cache_behavior {
    path_pattern     = "/api/*"
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "codesenseisearch-origin"
    
    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Accept", "Content-Type"]
      
      cookies {
        forward = "all"
      }
    }
    
    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 300       # 5 minutes
    max_ttl                = 3600      # 1 hour
    compress               = true
  }
  
  # Default cache behavior (HTML pages)
  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "codesenseisearch-origin"
    
    forwarded_values {
      query_string = true
      headers      = ["User-Agent"]
      
      cookies {
        forward           = "whitelist"
        whitelisted_names = ["session", "auth-token"]
      }
    }
    
    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 1800      # 30 minutes
    max_ttl                = 86400     # 24 hours
    compress               = true
  }
  
  price_class = "PriceClass_100"  # US, Canada, Europe
  
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  
  viewer_certificate {
    acm_certificate_arn      = var.ssl_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
  
  tags = {
    Name        = "CodeSenseiSearch CDN"
    Environment = var.environment
  }
}

# CloudFront response headers policy
resource "aws_cloudfront_response_headers_policy" "security_headers" {
  name    = "codesenseisearch-security-headers"
  comment = "Security headers for CodeSenseiSearch"
  
  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
    }
    
    content_type_options {
      override = true
    }
    
    frame_options {
      frame_option = "SAMEORIGIN"
      override     = true
    }
    
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }
  
  custom_headers_config {
    items {
      header   = "X-Cache-Status"
      value    = "CloudFront"
      override = false
    }
  }
}
'''