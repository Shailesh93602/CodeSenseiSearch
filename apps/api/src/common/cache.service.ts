import { Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import * as crypto from 'crypto';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis;

  constructor() {
    // Initialize Redis connection
    this.redis = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
    });
  }

  /**
   * Get cached value by key
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        this.logger.debug(`Cache hit for key: ${key}`);
        return JSON.parse(cached);
      }
      this.logger.debug(`Cache miss for key: ${key}`);
      return null;
    } catch (error) {
      this.logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set cache value with TTL
   */
  async set(key: string, value: any, ttl = 3600): Promise<void> {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value));
      this.logger.debug(`Cache set for key: ${key}, TTL: ${ttl}s`);
    } catch (error) {
      this.logger.error(`Cache set error for key ${key}:`, error);
    }
  }

  /**
   * Delete cache entry
   */
  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      this.logger.debug(`Cache deleted for key: ${key}`);
    } catch (error) {
      this.logger.error(`Cache delete error for key ${key}:`, error);
    }
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.debug(
          `Invalidated ${keys.length} cache entries matching: ${pattern}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Cache pattern invalidation error for ${pattern}:`,
        error,
      );
    }
  }

  /**
   * Get or set cache with a factory function
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl = 3600,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Cache search results
   */
  async cacheSearchResults(
    query: string,
    filters: any,
    results: any[],
    ttl = 1800, // 30 minutes
  ): Promise<void> {
    const key = this.generateSearchCacheKey(query, filters);
    await this.set(key, results, ttl);
  }

  /**
   * Get cached search results
   */
  async getCachedSearchResults(
    query: string,
    filters: any,
  ): Promise<any[] | null> {
    const key = this.generateSearchCacheKey(query, filters);
    return this.get<any[]>(key);
  }

  /**
   * Cache user data
   */
  async cacheUserData(
    userId: string,
    userData: any,
    ttl = 7200,
  ): Promise<void> {
    const key = `user:${userId}`;
    await this.set(key, userData, ttl);
  }

  /**
   * Get cached user data
   */
  async getCachedUserData(userId: string): Promise<unknown> {
    const key = `user:${userId}`;
    return this.get(key);
  }

  /**
   * Cache content metadata
   */
  async cacheContentMetadata(
    contentId: string,
    metadata: any,
    ttl = 3600,
  ): Promise<void> {
    const key = `content:${contentId}`;
    await this.set(key, metadata, ttl);
  }

  /**
   * Invalidate user-related caches
   */
  async invalidateUserCache(userId: string): Promise<void> {
    await this.invalidatePattern(`user:${userId}*`);
    await this.invalidatePattern(`search:*:user:${userId}`);
  }

  /**
   * Invalidate content-related caches
   */
  async invalidateContentCache(contentId?: string): Promise<void> {
    if (contentId) {
      await this.del(`content:${contentId}`);
    }
    // Invalidate all search caches when content changes
    await this.invalidatePattern('search:*');
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    hits: number;
    misses: number;
    hitRate: number;
    memoryUsage: string;
  }> {
    try {
      const info = await this.redis.info('stats');
      const memory = await this.redis.info('memory');

      const hits = this.extractStatValue(info, 'keyspace_hits');
      const misses = this.extractStatValue(info, 'keyspace_misses');
      const total = hits + misses;
      const hitRate = total > 0 ? (hits / total) * 100 : 0;

      const memoryUsage = this.extractStatValue(memory, 'used_memory_human');

      return {
        hits,
        misses,
        hitRate: Math.round(hitRate * 100) / 100,
        memoryUsage: String(memoryUsage ?? 'Unknown'),
      };
    } catch (error) {
      this.logger.error('Error getting cache stats:', error);
      return { hits: 0, misses: 0, hitRate: 0, memoryUsage: 'Error' };
    }
  }

  /**
   * Generate cache key for search queries
   */
  private generateSearchCacheKey(query: string, filters: any): string {
    const searchData = { query: query.toLowerCase().trim(), filters };
    const hash = crypto
      .createHash('md5')
      .update(JSON.stringify(searchData))
      .digest('hex');
    return `search:${hash}`;
  }

  /**
   * Extract value from Redis info string
   */
  private extractStatValue(info: string, key: string): number {
    const match = info.match(new RegExp(`${key}:(\\d+)`));
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    latency?: number;
  }> {
    try {
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;

      return { status: 'healthy', latency };
    } catch (error) {
      this.logger.error('Redis health check failed:', error);
      return { status: 'unhealthy' };
    }
  }
}
