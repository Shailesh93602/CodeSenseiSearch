/**
 * Structured Logging Library for CodeSenseiSearch
 * Provides consistent, structured logging across all application services
 */

import winston from 'winston';
import { Request } from 'express';

// Log levels
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  DEBUG = 'debug'
}

// Log categories for better organization
export enum LogCategory {
  APPLICATION = 'application',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  BUSINESS = 'business',
  INFRASTRUCTURE = 'infrastructure',
  SEARCH = 'search',
  API = 'api',
  DATABASE = 'database',
  CACHE = 'cache',
  AUTH = 'auth'
}

// Base log entry interface
export interface BaseLogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  service: string;
  version: string;
  environment: string;
  message: string;
  metadata?: Record<string, any>;
}

// Specific log entry types
export interface RequestLogEntry extends BaseLogEntry {
  request_id: string;
  user_id?: string;
  method: string;
  url: string;
  ip_address: string;
  user_agent: string;
  status_code?: number;
  response_time?: number;
}

export interface ErrorLogEntry extends BaseLogEntry {
  error: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  request_id?: string;
  user_id?: string;
  context?: Record<string, any>;
}

export interface SecurityLogEntry extends BaseLogEntry {
  event_type: 'login' | 'logout' | 'access_denied' | 'permission_check' | 'suspicious_activity';
  user_id?: string;
  ip_address: string;
  user_agent: string;
  success: boolean;
  details?: Record<string, any>;
}

export interface SearchLogEntry extends BaseLogEntry {
  query: string;
  results_count: number;
  response_time: number;
  user_id?: string;
  search_type: 'semantic' | 'keyword' | 'hybrid';
  filters?: Record<string, any>;
}

export interface PerformanceLogEntry extends BaseLogEntry {
  operation: string;
  duration: number;
  success: boolean;
  resource_usage?: {
    memory?: number;
    cpu?: number;
  };
  details?: Record<string, any>;
}

// Winston logger configuration
const createLogger = (service: string) => {
  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: {
      service,
      version: process.env.APP_VERSION || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      hostname: process.env.HOSTNAME || require('os').hostname()
    },
    transports: [
      // Console output for development
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }),
      
      // File outputs for production
      new winston.transports.File({
        filename: `/app/logs/${service}/error.log`,
        level: 'error',
        maxsize: 100 * 1024 * 1024, // 100MB
        maxFiles: 10,
        tailable: true
      }),
      
      new winston.transports.File({
        filename: `/app/logs/${service}/combined.log`,
        maxsize: 100 * 1024 * 1024, // 100MB
        maxFiles: 10,
        tailable: true
      }),
      
      // Separate files for different categories
      new winston.transports.File({
        filename: `/app/logs/security/security.log`,
        level: 'info',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
          winston.format((info) => {
            return info.category === LogCategory.SECURITY ? info : false;
          })()
        ),
        maxsize: 50 * 1024 * 1024, // 50MB
        maxFiles: 20,
        tailable: true
      }),
      
      new winston.transports.File({
        filename: `/app/logs/search/search.log`,
        level: 'info',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
          winston.format((info) => {
            return info.category === LogCategory.SEARCH ? info : false;
          })()
        ),
        maxsize: 50 * 1024 * 1024, // 50MB
        maxFiles: 15,
        tailable: true
      })
    ]
  });

  return logger;
};

// Main Logger class
export class Logger {
  private winston: winston.Logger;
  private service: string;

  constructor(service: string) {
    this.service = service;
    this.winston = createLogger(service);
  }

  // Generic log method
  private log(level: LogLevel, category: LogCategory, message: string, metadata?: Record<string, any>) {
    const logEntry: BaseLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      service: this.service,
      version: process.env.APP_VERSION || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      message,
      metadata
    };

    this.winston.log(level, logEntry);
  }

  // Request logging
  logRequest(req: Request, statusCode?: number, responseTime?: number) {
    const requestLog: RequestLogEntry = {
      timestamp: new Date().toISOString(),
      level: statusCode && statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO,
      category: LogCategory.API,
      service: this.service,
      version: process.env.APP_VERSION || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      message: `${req.method} ${req.originalUrl}`,
      request_id: req.headers['x-request-id'] as string || 'unknown',
      user_id: (req as any).user?.id,
      method: req.method,
      url: req.originalUrl,
      ip_address: req.ip || req.connection.remoteAddress || 'unknown',
      user_agent: req.get('User-Agent') || 'unknown',
      status_code: statusCode,
      response_time: responseTime
    };

    this.winston.log(requestLog.level, requestLog);
  }

  // Error logging
  logError(error: Error, context?: Record<string, any>, requestId?: string, userId?: string) {
    const errorLog: ErrorLogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      category: LogCategory.APPLICATION,
      service: this.service,
      version: process.env.APP_VERSION || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      message: error.message,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code
      },
      request_id: requestId,
      user_id: userId,
      context
    };

    this.winston.log(LogLevel.ERROR, errorLog);
  }

  // Security logging
  logSecurity(
    eventType: SecurityLogEntry['event_type'],
    success: boolean,
    ipAddress: string,
    userAgent: string,
    userId?: string,
    details?: Record<string, any>
  ) {
    const securityLog: SecurityLogEntry = {
      timestamp: new Date().toISOString(),
      level: success ? LogLevel.INFO : LogLevel.WARN,
      category: LogCategory.SECURITY,
      service: this.service,
      version: process.env.APP_VERSION || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      message: `Security event: ${eventType}`,
      event_type: eventType,
      user_id: userId,
      ip_address: ipAddress,
      user_agent: userAgent,
      success,
      details
    };

    this.winston.log(securityLog.level, securityLog);
  }

  // Search logging
  logSearch(
    query: string,
    resultsCount: number,
    responseTime: number,
    searchType: SearchLogEntry['search_type'],
    userId?: string,
    filters?: Record<string, any>
  ) {
    const searchLog: SearchLogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      category: LogCategory.SEARCH,
      service: this.service,
      version: process.env.APP_VERSION || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      message: `Search executed: "${query}"`,
      query,
      results_count: resultsCount,
      response_time: responseTime,
      user_id: userId,
      search_type: searchType,
      filters
    };

    this.winston.log(LogLevel.INFO, searchLog);
  }

  // Performance logging
  logPerformance(
    operation: string,
    duration: number,
    success: boolean,
    resourceUsage?: PerformanceLogEntry['resource_usage'],
    details?: Record<string, any>
  ) {
    const performanceLog: PerformanceLogEntry = {
      timestamp: new Date().toISOString(),
      level: duration > 5000 ? LogLevel.WARN : LogLevel.INFO,
      category: LogCategory.PERFORMANCE,
      service: this.service,
      version: process.env.APP_VERSION || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      message: `Performance: ${operation}`,
      operation,
      duration,
      success,
      resource_usage: resourceUsage,
      details
    };

    this.winston.log(performanceLog.level, performanceLog);
  }

  // Generic category logging methods
  info(message: string, category: LogCategory = LogCategory.APPLICATION, metadata?: Record<string, any>) {
    this.log(LogLevel.INFO, category, message, metadata);
  }

  warn(message: string, category: LogCategory = LogCategory.APPLICATION, metadata?: Record<string, any>) {
    this.log(LogLevel.WARN, category, message, metadata);
  }

  error(message: string, category: LogCategory = LogCategory.APPLICATION, metadata?: Record<string, any>) {
    this.log(LogLevel.ERROR, category, message, metadata);
  }

  debug(message: string, category: LogCategory = LogCategory.APPLICATION, metadata?: Record<string, any>) {
    this.log(LogLevel.DEBUG, category, message, metadata);
  }

  // Business logic logging
  logBusiness(message: string, level: LogLevel = LogLevel.INFO, metadata?: Record<string, any>) {
    this.log(level, LogCategory.BUSINESS, message, metadata);
  }

  // Database operation logging
  logDatabase(operation: string, duration: number, success: boolean, details?: Record<string, any>) {
    this.log(
      success ? LogLevel.INFO : LogLevel.ERROR,
      LogCategory.DATABASE,
      `Database ${operation}`,
      { duration, success, ...details }
    );
  }

  // Cache operation logging
  logCache(operation: string, hit: boolean, key?: string, details?: Record<string, any>) {
    this.log(
      LogLevel.DEBUG,
      LogCategory.CACHE,
      `Cache ${operation}`,
      { hit, key, ...details }
    );
  }
}

// Express middleware for request logging
export const requestLoggingMiddleware = (logger: Logger) => {
  return (req: Request, res: any, next: any) => {
    const startTime = Date.now();
    
    // Add request ID if not present
    if (!req.headers['x-request-id']) {
      req.headers['x-request-id'] = require('crypto').randomUUID();
    }

    // Log request completion
    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      logger.logRequest(req, res.statusCode, responseTime);
    });

    next();
  };
};

// Error handling middleware
export const errorLoggingMiddleware = (logger: Logger) => {
  return (error: Error, req: Request, res: any, next: any) => {
    logger.logError(
      error,
      {
        url: req.originalUrl,
        method: req.method,
        body: req.body,
        query: req.query,
        params: req.params
      },
      req.headers['x-request-id'] as string,
      (req as any).user?.id
    );
    
    next(error);
  };
};

// Create logger instances for different services
export const createApiLogger = () => new Logger('codesenseisearch-api');
export const createWebLogger = () => new Logger('codesenseisearch-web');
export const createSearchLogger = () => new Logger('search-engine');
export const createAuthLogger = () => new Logger('auth-service');

// Export default instance
export const logger = new Logger('codesenseisearch');
export default logger;