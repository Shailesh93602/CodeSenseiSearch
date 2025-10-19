export interface SearchResult {
  id: string;
  title: string;
  description: string;
  source: "github" | "stackoverflow" | "docs";
  language?: string;
  url: string;
  author: string;
  avatar?: string;
  stars?: number;
  updatedAt: string;
  code?: string;
  tags: string[];
  difficulty?: "beginner" | "intermediate" | "advanced";
  votes?: number;
  views?: number;
}

export const mockSearchResults: SearchResult[] = [
  // React/JavaScript Results
  {
    id: "1",
    title: "React useEffect Hook - Complete Guide with Cleanup Patterns",
    description: "Comprehensive guide to useEffect hook in React 18+ with cleanup functions, dependency arrays, and advanced patterns. Includes examples for data fetching, subscriptions, and memory leak prevention.",
    source: "github",
    language: "javascript",
    url: "https://github.com/facebook/react",
    author: "facebook",
    avatar: "https://github.com/facebook.png",
    stars: 220453,
    updatedAt: "2 days ago",
    difficulty: "intermediate",
    code: `import { useEffect, useState } from 'react';

function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    
    async function fetchUser() {
      try {
        setLoading(true);
        const response = await fetch(\`/api/users/\${userId}\`);
        const userData = await response.json();
        
        // Prevent setting state if component unmounted
        if (!cancelled) {
          setUser(userData);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch user:', error);
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchUser();

    // Cleanup function to prevent memory leaks
    return () => {
      cancelled = true;
    };
  }, [userId]); // Re-run when userId changes

  if (loading) return <div>Loading...</div>;
  if (!user) return <div>User not found</div>;

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  );
}`,
    tags: ["react", "hooks", "useEffect", "cleanup", "memory-leaks", "async"]
  },
  
  {
    id: "2",
    title: "How to properly handle async operations in useEffect?",
    description: "Best practices for handling asynchronous operations inside useEffect hook. Covers AbortController, cleanup functions, and avoiding race conditions in React applications.",
    source: "stackoverflow",
    language: "javascript",
    url: "https://stackoverflow.com/questions/useeffect-async",
    author: "sarah_dev",
    updatedAt: "1 week ago",
    difficulty: "intermediate",
    votes: 847,
    views: 125300,
    code: `// ❌ DON'T do this - async useEffect directly
useEffect(async () => {
  const data = await fetchData();
  setData(data);
}, []);

// ✅ DO this - create async function inside useEffect
useEffect(() => {
  const controller = new AbortController();
  
  const fetchData = async () => {
    try {
      const response = await fetch('/api/data', {
        signal: controller.signal
      });
      
      if (!response.ok) {
        throw new Error(\`HTTP error! status: \${response.status}\`);
      }
      
      const result = await response.json();
      setData(result);
    } catch (error) {
      if (error.name !== 'AbortError') {
        setError(error.message);
      }
    }
  };

  fetchData();

  return () => {
    controller.abort(); // Cancel the request if component unmounts
  };
}, []);`,
    tags: ["react", "useEffect", "async", "abort-controller", "best-practices"]
  },

  // Python Results
  {
    id: "3",
    title: "Python Async/Await - Modern Concurrency Patterns",
    description: "Complete guide to asynchronous programming in Python using async/await syntax. Covers asyncio, aiohttp, task management, and concurrent execution patterns with real-world examples.",
    source: "docs",
    language: "python",
    url: "https://docs.python.org/3/library/asyncio.html",
    author: "Python Software Foundation",
    updatedAt: "3 days ago",
    difficulty: "advanced",
    code: `import asyncio
import aiohttp
import time
from typing import List, Dict, Any

async def fetch_url(session: aiohttp.ClientSession, url: str) -> Dict[str, Any]:
    """Fetch a single URL and return the JSON response."""
    try:
        async with session.get(url, timeout=5) as response:
            response.raise_for_status()
            return {
                'url': url,
                'status': response.status,
                'data': await response.json()
            }
    except asyncio.TimeoutError:
        return {'url': url, 'error': 'Timeout'}
    except Exception as e:
        return {'url': url, 'error': str(e)}

async def fetch_multiple_urls(urls: List[str]) -> List[Dict[str, Any]]:
    """Fetch multiple URLs concurrently."""
    async with aiohttp.ClientSession() as session:
        # Create tasks for all URLs
        tasks = [fetch_url(session, url) for url in urls]
        
        # Wait for all tasks to complete
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        return [r for r in results if not isinstance(r, Exception)]

async def main():
    urls = [
        'https://api.github.com/users/octocat',
        'https://api.github.com/users/defunkt',
        'https://api.github.com/users/mojombo'
    ]
    
    start_time = time.time()
    results = await fetch_multiple_urls(urls)
    end_time = time.time()
    
    print(f"Fetched {len(results)} URLs in {end_time - start_time:.2f} seconds")
    for result in results:
        print(f"URL: {result['url']}, Status: {result.get('status', 'Error')}")

# Run the async program
if __name__ == "__main__":
    asyncio.run(main())`,
    tags: ["python", "async", "await", "asyncio", "aiohttp", "concurrency"]
  },

  {
    id: "4",
    title: "Efficient data processing with Python generators and async iterators",
    description: "Learn how to process large datasets efficiently using Python generators, async generators, and async iterators. Includes memory-efficient patterns for ETL pipelines.",
    source: "github",
    language: "python",
    url: "https://github.com/aio-libs/aiohttp",
    author: "aio-libs",
    avatar: "https://github.com/aio-libs.png",
    stars: 14572,
    updatedAt: "5 days ago",
    difficulty: "advanced",
    code: `import asyncio
import aiofiles
from typing import AsyncIterator, List
import json

async def read_large_file_async(filename: str) -> AsyncIterator[str]:
    """Async generator to read large files line by line."""
    async with aiofiles.open(filename, 'r') as file:
        async for line in file:
            yield line.strip()

async def process_json_lines(filename: str) -> AsyncIterator[dict]:
    """Process JSONL file asynchronously."""
    async for line in read_large_file_async(filename):
        if line:  # Skip empty lines
            try:
                yield json.loads(line)
            except json.JSONDecodeError as e:
                print(f"Skipping invalid JSON: {e}")
                continue

async def batch_processor(items: AsyncIterator, batch_size: int = 100) -> AsyncIterator[List]:
    """Process items in batches for efficient memory usage."""
    batch = []
    async for item in items:
        batch.append(item)
        if len(batch) >= batch_size:
            yield batch
            batch = []
    
    if batch:  # Don't forget the last batch
        yield batch

async def main():
    # Process a large JSONL file in batches
    async for batch in batch_processor(
        process_json_lines('large_dataset.jsonl'), 
        batch_size=1000
    ):
        # Process batch (e.g., insert into database)
        print(f"Processing batch of {len(batch)} items")
        
        # Simulate async processing
        await asyncio.sleep(0.1)

if __name__ == "__main__":
    asyncio.run(main())`,
    tags: ["python", "generators", "async-iterators", "memory-efficiency", "etl"]
  },

  // TypeScript Results
  {
    id: "5",
    title: "TypeScript Advanced Generics with Conditional Types",
    description: "Master advanced TypeScript features including conditional types, mapped types, and utility types. Build type-safe APIs with complex generic constraints.",
    source: "github",
    language: "typescript",
    url: "https://github.com/microsoft/TypeScript",
    author: "microsoft",
    avatar: "https://github.com/microsoft.png",
    stars: 98234,
    updatedAt: "1 day ago",
    difficulty: "advanced",
    code: `// Advanced TypeScript patterns for API design

// Conditional types for different response formats
type ApiResponse<T, Format = 'json'> = Format extends 'json'
  ? { data: T; status: 'success' } | { error: string; status: 'error' }
  : Format extends 'xml'
  ? \`<response><data>\${string}</data></response>\`
  : never;

// Utility type to extract nested properties
type DeepPropertyPath<T, K extends keyof T = keyof T> = K extends string
  ? T[K] extends Record<string, any>
    ? \`\${K}.\${DeepPropertyPath<T[K]>}\`
    : K
  : never;

// Generic repository pattern with type constraints
interface Entity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

interface User extends Entity {
  name: string;
  email: string;
  profile: {
    avatar: string;
    bio: string;
  };
}

class Repository<T extends Entity> {
  private items: Map<string, T> = new Map();

  async create(data: Omit<T, keyof Entity>): Promise<T> {
    const entity = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as T;

    this.items.set(entity.id, entity);
    return entity;
  }

  async findById(id: string): Promise<T | null> {
    return this.items.get(id) ?? null;
  }

  async update(id: string, updates: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<T | null> {
    const existing = this.items.get(id);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    } as T;

    this.items.set(id, updated);
    return updated;
  }

  // Advanced query method with type-safe property paths
  findByProperty<K extends DeepPropertyPath<T>>(
    path: K,
    value: any
  ): T[] {
    return Array.from(this.items.values()).filter(item => {
      const keys = path.split('.');
      let current: any = item;
      
      for (const key of keys) {
        current = current?.[key];
      }
      
      return current === value;
    });
  }
}

// Usage examples
const userRepo = new Repository<User>();

// Type-safe property path queries
const users = userRepo.findByProperty('profile.avatar', 'avatar.jpg');
const emailUsers = userRepo.findByProperty('email', 'user@example.com');`,
    tags: ["typescript", "generics", "conditional-types", "utility-types", "type-safety"]
  },

  // Node.js/Express Results  
  {
    id: "6",
    title: "JWT Authentication with Refresh Tokens in Node.js",
    description: "Secure JWT authentication implementation with refresh tokens, rate limiting, and proper security headers. Includes middleware for token validation and automatic renewal.",
    source: "stackoverflow",
    language: "javascript",
    url: "https://stackoverflow.com/questions/jwt-refresh-tokens",
    author: "security_expert",
    updatedAt: "4 days ago",
    difficulty: "intermediate",
    votes: 1205,
    views: 89400,
    code: `const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');

// Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.'
});

class AuthService {
  constructor() {
    this.accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
    this.refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET;
    this.accessTokenExpiry = '15m';
    this.refreshTokenExpiry = '7d';
  }

  generateTokens(payload) {
    const accessToken = jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: this.accessTokenExpiry,
      issuer: 'your-app-name',
      audience: 'your-app-users'
    });

    const refreshToken = jwt.sign(payload, this.refreshTokenSecret, {
      expiresIn: this.refreshTokenExpiry,
      issuer: 'your-app-name',
      audience: 'your-app-users'
    });

    return { accessToken, refreshToken };
  }

  verifyAccessToken(token) {
    try {
      return jwt.verify(token, this.accessTokenSecret);
    } catch (error) {
      throw new Error('Invalid access token');
    }
  }

  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, this.refreshTokenSecret);
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const authService = new AuthService();
    const decoded = authService.verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Login route
app.post('/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user and verify password
    const user = await User.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const authService = new AuthService();
    const tokens = authService.generateTokens({ 
      userId: user.id, 
      email: user.email 
    });

    // Store refresh token in httpOnly cookie
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({ accessToken: tokens.accessToken });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Token refresh route
app.post('/auth/refresh', (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  
  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token required' });
  }

  try {
    const authService = new AuthService();
    const decoded = authService.verifyRefreshToken(refreshToken);
    
    const newTokens = authService.generateTokens({
      userId: decoded.userId,
      email: decoded.email
    });

    res.cookie('refreshToken', newTokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ accessToken: newTokens.accessToken });
  } catch (error) {
    res.status(403).json({ error: 'Invalid refresh token' });
  }
});`,
    tags: ["nodejs", "jwt", "authentication", "security", "express", "middleware"]
  },

  // CSS/Frontend Results
  {
    id: "7", 
    title: "Modern CSS Grid Layouts with Container Queries",
    description: "Create responsive layouts using CSS Grid with container queries for component-based responsive design. Includes advanced grid techniques and real-world examples.",
    source: "docs",
    language: "css",
    url: "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Grid_Layout",
    author: "MDN Web Docs",
    updatedAt: "6 days ago",
    difficulty: "intermediate",
    code: `/* Modern CSS Grid with Container Queries */

.card-container {
  container-type: inline-size;
  container-name: card;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  padding: 1rem;
}

/* Container query for adaptive card layouts */
@container card (min-width: 400px) {
  .card {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-areas: 
      "image header"
      "image content"
      "image actions";
    gap: 1rem;
  }
  
  .card__image {
    grid-area: image;
    width: 120px;
    height: 120px;
  }
  
  .card__header { grid-area: header; }
  .card__content { grid-area: content; }
  .card__actions { grid-area: actions; }
}

@container card (max-width: 399px) {
  .card {
    display: grid;
    grid-template-areas:
      "image"
      "header" 
      "content"
      "actions";
    text-align: center;
  }
  
  .card__image {
    grid-area: image;
    justify-self: center;
    width: 80px;
    height: 80px;
  }
}

/* Advanced grid layouts */
.dashboard-grid {
  display: grid;
  grid-template-columns: 
    [sidebar-start] minmax(250px, 300px)
    [sidebar-end main-start] 1fr
    [main-end aside-start] minmax(200px, 250px)
    [aside-end];
  grid-template-rows:
    [header-start] auto
    [header-end content-start] 1fr
    [content-end footer-start] auto
    [footer-end];
  min-height: 100vh;
  gap: 1rem;
}

.header {
  grid-column: sidebar-start / aside-end;
  grid-row: header-start / header-end;
}

.sidebar {
  grid-column: sidebar-start / sidebar-end;
  grid-row: content-start / content-end;
}

.main-content {
  grid-column: main-start / main-end;
  grid-row: content-start / content-end;
}

.aside {
  grid-column: aside-start / aside-end;
  grid-row: content-start / content-end;
}

.footer {
  grid-column: sidebar-start / aside-end;
  grid-row: footer-start / footer-end;
}

/* Responsive breakpoints */
@media (max-width: 768px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
    grid-template-rows:
      [header-start] auto
      [header-end sidebar-start] auto
      [sidebar-end main-start] 1fr
      [main-end aside-start] auto
      [aside-end footer-start] auto
      [footer-end];
  }
  
  .header { grid-column: 1; grid-row: header-start / header-end; }
  .sidebar { grid-column: 1; grid-row: sidebar-start / sidebar-end; }
  .main-content { grid-column: 1; grid-row: main-start / main-end; }
  .aside { grid-column: 1; grid-row: aside-start / aside-end; }
  .footer { grid-column: 1; grid-row: footer-start / footer-end; }
}

/* CSS logical properties for internationalization */
.content-flow {
  margin-block: 1rem;
  margin-inline: 2rem;
  padding-block-start: 0.5rem;
  padding-inline-end: 1rem;
  border-block-start: 2px solid #333;
  border-inline-start: 4px solid #007acc;
}`,
    tags: ["css", "grid", "container-queries", "responsive-design", "layout"]
  },

  // Go Programming Results
  {
    id: "8",
    title: "Concurrent Web Scraper with Worker Pools in Go",
    description: "Build a high-performance web scraper using Go's goroutines and channels. Implements worker pools, rate limiting, and graceful shutdown patterns.",
    source: "github",
    language: "go",
    url: "https://github.com/golang/go",
    author: "golang",
    avatar: "https://github.com/golang.png",
    stars: 118567,
    updatedAt: "1 day ago",
    difficulty: "advanced",
    code: `package main

import (
    "context"
    "fmt"
    "net/http"
    "sync"
    "time"
    "io/ioutil"
    "log"
)

// Job represents a scraping task
type Job struct {
    URL string
    ID  int
}

// Result represents the outcome of a scraping job
type Result struct {
    Job    Job
    Body   string
    Error  error
    Status int
}

// Scraper manages concurrent web scraping
type Scraper struct {
    client      *http.Client
    workers     int
    rateLimiter <-chan time.Time
}

// NewScraper creates a new scraper with specified worker count
func NewScraper(workers int, requestsPerSecond int) *Scraper {
    // Rate limiter using time.Tick
    rateLimiter := time.Tick(time.Second / time.Duration(requestsPerSecond))
    
    client := &http.Client{
        Timeout: 30 * time.Second,
        Transport: &http.Transport{
            MaxIdleConns:        100,
            MaxIdleConnsPerHost: 10,
            IdleConnTimeout:     30 * time.Second,
        },
    }

    return &Scraper{
        client:      client,
        workers:     workers,
        rateLimiter: rateLimiter,
    }
}

// worker processes jobs from the jobs channel
func (s *Scraper) worker(ctx context.Context, jobs <-chan Job, results chan<- Result, wg *sync.WaitGroup) {
    defer wg.Done()

    for {
        select {
        case job, ok := <-jobs:
            if !ok {
                return // Channel closed, exit worker
            }
            
            // Rate limiting
            <-s.rateLimiter
            
            result := s.scrapeURL(ctx, job)
            
            select {
            case results <- result:
            case <-ctx.Done():
                return
            }
            
        case <-ctx.Done():
            return
        }
    }
}

// scrapeURL performs the actual HTTP request
func (s *Scraper) scrapeURL(ctx context.Context, job Job) Result {
    req, err := http.NewRequestWithContext(ctx, "GET", job.URL, nil)
    if err != nil {
        return Result{Job: job, Error: err}
    }

    // Add user agent to be respectful
    req.Header.Set("User-Agent", "Go-Scraper/1.0")

    resp, err := s.client.Do(req)
    if err != nil {
        return Result{Job: job, Error: err}
    }
    defer resp.Body.Close()

    body, err := ioutil.ReadAll(resp.Body)
    if err != nil {
        return Result{Job: job, Error: err, Status: resp.StatusCode}
    }

    return Result{
        Job:    job,
        Body:   string(body),
        Status: resp.StatusCode,
    }
}

// ScrapeURLs scrapes multiple URLs concurrently
func (s *Scraper) ScrapeURLs(ctx context.Context, urls []string) <-chan Result {
    jobs := make(chan Job, len(urls))
    results := make(chan Result, len(urls))

    // Start workers
    var wg sync.WaitGroup
    for i := 0; i < s.workers; i++ {
        wg.Add(1)
        go s.worker(ctx, jobs, results, &wg)
    }

    // Send jobs
    go func() {
        defer close(jobs)
        for i, url := range urls {
            select {
            case jobs <- Job{URL: url, ID: i}:
            case <-ctx.Done():
                return
            }
        }
    }()

    // Close results channel when all workers are done
    go func() {
        wg.Wait()
        close(results)
    }()

    return results
}

func main() {
    urls := []string{
        "https://httpbin.org/delay/1",
        "https://httpbin.org/delay/2", 
        "https://httpbin.org/delay/1",
        "https://httpbin.org/json",
        "https://httpbin.org/user-agent",
    }

    // Create scraper with 3 workers, 2 requests per second
    scraper := NewScraper(3, 2)
    
    // Create context with timeout
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    start := time.Now()
    results := scraper.ScrapeURLs(ctx, urls)

    // Process results
    var successful, failed int
    for result := range results {
        if result.Error != nil {
            log.Printf("Failed to scrape %s: %v", result.Job.URL, result.Error)
            failed++
        } else {
            log.Printf("Successfully scraped %s (status: %d, size: %d bytes)", 
                result.Job.URL, result.Status, len(result.Body))
            successful++
        }
    }

    elapsed := time.Since(start)
    log.Printf("Scraping completed in %v: %d successful, %d failed", elapsed, successful, failed)
}`,
    tags: ["go", "concurrency", "web-scraping", "goroutines", "channels", "worker-pools"]
  }
];

// Filter functions for search
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function filterResults(results: SearchResult[], query: string, filters: any): SearchResult[] {
  return results.filter(result => {
    // Text search
    if (query) {
      const searchText = `${result.title} ${result.description} ${result.tags.join(' ')}`.toLowerCase();
      if (!searchText.includes(query.toLowerCase())) {
        return false;
      }
    }

    // Source filter
    if (filters.source !== "all" && result.source !== filters.source) {
      return false;
    }

    // Language filter
    if (filters.language !== "all" && result.language !== filters.language) {
      return false;
    }

    return true;
  });
}

export function sortResults(results: SearchResult[], sortBy: string): SearchResult[] {
  const sorted = [...results];
  
  switch (sortBy) {
    case "date":
      return sorted.sort((a, b) => {
        const aTime = new Date(a.updatedAt).getTime();
        const bTime = new Date(b.updatedAt).getTime();
        return bTime - aTime; // Most recent first
      });
    
    case "stars":
      return sorted.sort((a, b) => (b.stars || 0) - (a.stars || 0));
    
    case "relevance":
    default:
      return sorted; // Assume results are already in relevance order
  }
}