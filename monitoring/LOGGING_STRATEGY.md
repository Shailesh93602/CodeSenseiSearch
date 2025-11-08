# Logging Configuration for CodeSenseiSearch

## Overview
This document outlines the comprehensive logging strategy for production monitoring, debugging, and compliance.

## Log Levels and Structure

### Application Logs (Structured JSON)
```json
{
  "timestamp": "2025-11-08T10:30:00.000Z",
  "level": "info|warn|error|debug",
  "service": "api|web|worker",
  "component": "auth|search|ingestion|etc",
  "message": "Human readable message",
  "userId": "user-uuid-if-applicable",
  "requestId": "req-uuid-for-tracing",
  "metadata": {
    "additional": "context-specific-data"
  },
  "performance": {
    "duration": 150,
    "memory": 125.5
  }
}
```

### Log Categories

#### 1. Application Logs
- **API Requests**: All HTTP requests with response times, status codes
- **Authentication**: Login attempts, token validation, session management
- **Search Operations**: Query performance, result relevance, user interactions
- **Data Processing**: Ingestion jobs, embedding generation, vector operations
- **Errors**: Application errors with stack traces and context

#### 2. Security Logs
- **Access Control**: Permission checks, unauthorized access attempts
- **Authentication Events**: Login/logout, password changes, token refresh
- **Data Access**: Sensitive data access patterns
- **Security Violations**: Rate limiting triggers, suspicious activity

#### 3. Performance Logs
- **Database Queries**: Slow queries, connection pool status
- **Cache Operations**: Hit/miss rates, eviction patterns
- **API Performance**: Response times, throughput metrics
- **Resource Usage**: Memory, CPU, disk I/O patterns

#### 4. Business Logs
- **User Activity**: Search patterns, feature usage
- **Content Metrics**: Ingestion success rates, content quality scores
- **System Health**: Service availability, dependency status

## Log Storage and Retention

### Production Setup
- **Primary Storage**: Centralized logging system (ELK Stack or Loki)
- **Retention Policy**: 
  - Application logs: 30 days hot, 90 days warm, 1 year cold
  - Security logs: 90 days hot, 1 year warm, 7 years archive
  - Performance logs: 7 days hot, 30 days warm
- **Backup**: Daily snapshots to object storage

### Local Development
- **Storage**: Local files with rotation
- **Format**: Pretty-printed JSON for readability
- **Retention**: 7 days maximum

## Logging Configuration by Service

### NestJS API Service
```typescript
// winston.config.ts
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

export const loggerConfig = WinstonModule.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    }),
    new winston.transports.File({
      filename: '/app/logs/app.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    })
  ],
  level: process.env.LOG_LEVEL || 'info'
});
```

### Next.js Web Service
```javascript
// logger.js
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: '/app/logs/web.log' 
    })
  ]
});
```

## Monitoring Integration

### Prometheus Metrics from Logs
- **Log Rate**: Logs per second by level and service
- **Error Rate**: Error logs percentage
- **Response Time**: Extracted from request logs
- **User Activity**: Active users, search frequency

### Alerting Rules
- **High Error Rate**: > 5% error logs in 5 minutes
- **Log Volume Spike**: > 200% increase in log volume
- **Critical Errors**: Any CRITICAL level logs
- **Service Silent**: No logs from service for > 5 minutes

## Log Analysis and Querying

### Common Queries

#### Find Authentication Issues
```
{
  "query": {
    "bool": {
      "must": [
        {"match": {"component": "auth"}},
        {"match": {"level": "error"}},
        {"range": {"timestamp": {"gte": "now-1h"}}}
      ]
    }
  }
}
```

#### Performance Analysis
```
{
  "query": {
    "bool": {
      "must": [
        {"exists": {"field": "performance.duration"}},
        {"range": {"performance.duration": {"gte": 1000}}}
      ]
    }
  }
}
```

#### User Activity Tracking
```
{
  "query": {
    "bool": {
      "must": [
        {"exists": {"field": "userId"}},
        {"match": {"component": "search"}},
        {"range": {"timestamp": {"gte": "now-24h"}}}
      ]
    }
  }
}
```

## Security and Compliance

### Data Privacy
- **PII Scrubbing**: Automatic removal of sensitive data
- **User Consent**: Log only with user permission for analytics
- **Data Minimization**: Log only necessary information
- **Encryption**: Logs encrypted at rest and in transit

### Compliance Requirements
- **GDPR**: User data logging consent and right to deletion
- **SOX**: Financial data access logging (if applicable)
- **HIPAA**: Healthcare data protection (if applicable)

### Access Controls
- **Log Access**: Role-based access to different log levels
- **Audit Trail**: Who accessed what logs when
- **Data Export**: Controlled export capabilities

## Troubleshooting Guide

### Common Issues

#### High Log Volume
1. Check for log storms from specific components
2. Verify log level configuration
3. Review log rotation settings
4. Analyze error patterns

#### Missing Logs
1. Verify service connectivity to log aggregator
2. Check log agent configuration
3. Review file permissions and disk space
4. Validate log format compatibility

#### Performance Impact
1. Monitor log writing performance
2. Optimize log format and frequency
3. Use asynchronous logging where possible
4. Implement log sampling for high-volume events

## Development Guidelines

### What to Log
- **DO**: Log business events, errors, performance metrics
- **DO**: Include correlation IDs for request tracing
- **DO**: Log at appropriate levels (debug, info, warn, error)
- **DON'T**: Log sensitive data (passwords, tokens, PII)
- **DON'T**: Log in tight loops without throttling
- **DON'T**: Use console.log in production code

### Log Message Best Practices
```javascript
// Good: Structured with context
logger.info('User search completed', {
  component: 'search',
  userId: user.id,
  query: sanitizedQuery,
  resultCount: results.length,
  duration: Date.now() - startTime,
  requestId: req.id
});

// Bad: Unstructured and verbose
console.log(`User ${user.email} searched for "${query}" and got ${results.length} results in ${duration}ms`);
```

## Maintenance Tasks

### Daily
- [ ] Check log ingestion rates and errors
- [ ] Review critical and error log summaries
- [ ] Verify log retention compliance

### Weekly  
- [ ] Analyze log volume trends
- [ ] Review slow query logs
- [ ] Check log storage usage and costs

### Monthly
- [ ] Audit log access patterns
- [ ] Review and update log retention policies
- [ ] Performance optimization based on log analysis

---

## Implementation Checklist

- [ ] Set up centralized logging infrastructure
- [ ] Configure structured logging in all services
- [ ] Implement log correlation and tracing
- [ ] Set up log-based alerting rules
- [ ] Create log analysis dashboards
- [ ] Document troubleshooting procedures
- [ ] Train team on log analysis tools
- [ ] Test log retention and backup procedures