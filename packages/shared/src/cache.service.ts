import Redis from 'ioredis';

export interface CacheConfig {
  ttl: number; // Time to live in seconds
  prefix: string;
  compress?: boolean;
  serialize?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  hitRate: number;
}

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
}

export class CacheService {
  private redis!: Redis;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
    hitRate: 0,
  };

  constructor(config: RedisConfig) {
    this.initializeRedis(config);
  }

  private initializeRedis(config: RedisConfig) {
    const redisConfig = {
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      family: 4,
      keyPrefix: 'codesenseisearch:',
    };

    this.redis = new Redis(redisConfig);

    this.redis.on('connect', () => {
      console.log('Connected to Redis');
    });

    this.redis.on('error', (error: any) => {
      console.error('Redis connection error:', error);
      this.stats.errors++;
    });

    this.redis.on('reconnecting', () => {
      console.warn('Reconnecting to Redis...');
    });
  }

  // Generic cache operations
  async get<T>(key: string, config?: Partial<CacheConfig>): Promise<T | null> {
    try {
      const prefixedKey = this.getPrefixedKey(key, config?.prefix);
      const cached = await this.redis.get(prefixedKey);
      
      if (cached === null) {
        this.stats.misses++;
        this.updateHitRate();
        return null;
      }

      this.stats.hits++;
      this.updateHitRate();

      if (config?.serialize !== false) {
        return JSON.parse(cached);
      }
      return cached as T;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      this.stats.errors++;
      return null;
    }
  }

  async set<T>(
    key: string,
    value: T,
    config?: Partial<CacheConfig>
  ): Promise<boolean> {
    try {
      const prefixedKey = this.getPrefixedKey(key, config?.prefix);
      const ttl = config?.ttl || 3600; // Default 1 hour
      
      let serializedValue: string;
      if (config?.serialize === false) {
        serializedValue = value as string;
      } else {
        serializedValue = JSON.stringify(value);
      }

      if (config?.compress) {
        // Implement compression if needed
        // serializedValue = await this.compress(serializedValue);
      }

      await this.redis.setex(prefixedKey, ttl, serializedValue);
      this.stats.sets++;
      return true;
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
      this.stats.errors++;
      return false;
    }
  }

  async del(key: string, config?: Partial<CacheConfig>): Promise<boolean> {
    try {
      const prefixedKey = this.getPrefixedKey(key, config?.prefix);
      const result = await this.redis.del(prefixedKey);
      this.stats.deletes++;
      return result > 0;
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
      this.stats.errors++;
      return false;
    }
  }

  async exists(key: string, config?: Partial<CacheConfig>): Promise<boolean> {
    try {
      const prefixedKey = this.getPrefixedKey(key, config?.prefix);
      const result = await this.redis.exists(prefixedKey);
      return result === 1;
    } catch (error) {
      console.error(`Cache exists error for key ${key}:`, error);
      this.stats.errors++;
      return false;
    }
  }

  // Search-specific caching methods
  async cacheSearchResults(
    query: string,
    filters: any,
    results: any,
    ttl: number = 1800 // 30 minutes
  ): Promise<void> {
    const cacheKey = this.generateSearchCacheKey(query, filters);
    await this.set(cacheKey, results, { 
      ttl, 
      prefix: 'search',
      compress: true 
    });
  }

  async getCachedSearchResults(
    query: string,
    filters: any
  ): Promise<any | null> {
    const cacheKey = this.generateSearchCacheKey(query, filters);
    return this.get(cacheKey, { prefix: 'search' });
  }

  async invalidateSearchCache(pattern?: string): Promise<number> {
    try {
      const searchPattern = pattern || 'search:*';
      const keys = await this.redis.keys(searchPattern);
      if (keys.length > 0) {
        return await this.redis.del(...keys);
      }
      return 0;
    } catch (error) {
      console.error('Error invalidating search cache:', error);
      return 0;
    }
  }

  // Content caching methods
  async cacheContent(contentId: string, content: any, ttl: number = 7200): Promise<void> {
    await this.set(`content:${contentId}`, content, { ttl, prefix: 'content' });
  }

  async getCachedContent(contentId: string): Promise<any | null> {
    return this.get(`content:${contentId}`, { prefix: 'content' });
  }

  async invalidateContentCache(contentId: string): Promise<boolean> {
    return this.del(`content:${contentId}`, { prefix: 'content' });
  }

  // User session caching
  async cacheUserSession(
    userId: string,
    sessionData: any,
    ttl: number = 86400 // 24 hours
  ): Promise<void> {
    await this.set(`session:${userId}`, sessionData, { ttl, prefix: 'user' });
  }

  async getCachedUserSession(userId: string): Promise<any | null> {
    return this.get(`session:${userId}`, { prefix: 'user' });
  }

  async invalidateUserSession(userId: string): Promise<boolean> {
    return this.del(`session:${userId}`, { prefix: 'user' });
  }

  // Embedding caching (for expensive computations)
  async cacheEmbedding(
    contentHash: string,
    embedding: number[],
    ttl: number = 604800 // 7 days
  ): Promise<void> {
    await this.set(`embedding:${contentHash}`, embedding, { 
      ttl, 
      prefix: 'ml',
      compress: true 
    });
  }

  async getCachedEmbedding(contentHash: string): Promise<number[] | null> {
    return this.get(`embedding:${contentHash}`, { prefix: 'ml' });
  }

  // Rate limiting support
  async incrementRateLimit(
    identifier: string,
    windowSizeSeconds: number = 3600,
    maxRequests: number = 100
  ): Promise<{ count: number; remaining: number; resetTime: number }> {
    try {
      const key = `ratelimit:${identifier}`;
      const current = await this.redis.incr(key);
      
      if (current === 1) {
        await this.redis.expire(key, windowSizeSeconds);
      }
      
      const ttl = await this.redis.ttl(key);
      const resetTime = Date.now() + (ttl * 1000);
      
      return {
        count: current,
        remaining: Math.max(0, maxRequests - current),
        resetTime,
      };
    } catch (error) {
      console.error('Rate limit error:', error);
      return {
        count: 0,
        remaining: maxRequests,
        resetTime: Date.now() + windowSizeSeconds * 1000,
      };
    }
  }

  // Cache warming utilities
  async warmCache(warmingFunctions: (() => Promise<void>)[]): Promise<void> {
    console.log('Starting cache warming...');
    
    const promises = warmingFunctions.map(async (fn, index) => {
      try {
        await fn();
        console.log(`Cache warming function ${index + 1} completed`);
      } catch (error) {
        console.error(`Cache warming function ${index + 1} failed:`, error);
      }
    });

    await Promise.allSettled(promises);
    console.log('Cache warming completed');
  }

  // Statistics and monitoring
  getStats(): CacheStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      hitRate: 0,
    };
  }

  async getRedisInfo(): Promise<any> {
    try {
      const info = await this.redis.info();
      return this.parseRedisInfo(info);
    } catch (error) {
      console.error('Error getting Redis info:', error);
      return null;
    }
  }

  async getRedisMemoryUsage(): Promise<{
    used: string;
    peak: string;
    fragmentation: number;
  }> {
    try {
      const info = await this.redis.info('memory');
      const parsed = this.parseRedisInfo(info);
      
      return {
        used: parsed.used_memory_human,
        peak: parsed.used_memory_peak_human,
        fragmentation: parseFloat(parsed.mem_fragmentation_ratio),
      };
    } catch (error) {
      console.error('Error getting Redis memory usage:', error);
      return {
        used: 'Unknown',
        peak: 'Unknown',
        fragmentation: 0,
      };
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis health check failed:', error);
      return false;
    }
  }

  // Cleanup on shutdown
  async destroy() {
    await this.redis.quit();
  }

  // Private helper methods
  private getPrefixedKey(key: string, prefix?: string): string {
    return prefix ? `${prefix}:${key}` : key;
  }

  private generateSearchCacheKey(query: string, filters: any): string {
    const normalizedQuery = query.toLowerCase().trim();
    const filterStr = JSON.stringify(filters || {});
    const hash = this.simpleHash(normalizedQuery + filterStr);
    return `search:${hash}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
  }

  private parseRedisInfo(info: string): any {
    const lines = info.split('\r\n');
    const result: any = {};
    
    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value !== undefined) {
          result[key] = value;
        }
      }
    }
    
    return result;
  }
}