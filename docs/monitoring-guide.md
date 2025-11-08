# CodeSenseiSearch Monitoring Guide

## Overview

This guide covers the complete monitoring setup for CodeSenseiSearch, including Prometheus metrics collection, Grafana visualization, Alertmanager notifications, and comprehensive health monitoring.

## Architecture

### Monitoring Stack Components

```mermaid
graph TB
    subgraph "Application Services"
        API[API Service :3001]
        WEB[Web Service :3000]
        DB[(PostgreSQL :5432)]
        REDIS[(Redis :6379)]
        NGINX[Nginx :80/443]
    end
    
    subgraph "Monitoring Stack"
        PROM[Prometheus :9090]
        GRAF[Grafana :3001]
        ALERT[Alertmanager :9093]
        NODE[Node Exporter :9100]
        BLACKBOX[Blackbox Exporter :9115]
    end
    
    subgraph "External Integrations"
        SLACK[Slack Notifications]
        EMAIL[Email Alerts]
        PAGER[PagerDuty]
    end
    
    API --> PROM
    WEB --> PROM
    DB --> PROM
    REDIS --> PROM
    NGINX --> PROM
    NODE --> PROM
    BLACKBOX --> PROM
    
    PROM --> GRAF
    PROM --> ALERT
    
    ALERT --> SLACK
    ALERT --> EMAIL
    ALERT --> PAGER
```

## Quick Start

### 1. Setup Monitoring Stack

```bash
# Complete monitoring setup
./scripts/setup-monitoring.sh

# Or individual commands
./scripts/setup-monitoring.sh start    # Start services
./scripts/setup-monitoring.sh test     # Test setup
./scripts/setup-monitoring.sh stop     # Stop services
```

### 2. Access Monitoring Interfaces

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)
- **Alertmanager**: http://localhost:9093
- **Node Exporter**: http://localhost:9100/metrics

### 3. Health Check

```bash
# Run comprehensive health check
./scripts/monitoring-health-check.sh

# View monitoring logs
./scripts/setup-monitoring.sh logs

# View specific service logs
./scripts/setup-monitoring.sh logs prometheus
```

## Dashboards

### 1. System Overview Dashboard
- **Purpose**: High-level system health and performance
- **Metrics**: CPU, Memory, Network, Disk usage
- **Alerts**: System resource thresholds
- **Refresh**: 30 seconds

### 2. Application Metrics Dashboard
- **Purpose**: Application-specific performance monitoring
- **Metrics**: Search performance, API response times, error rates
- **Alerts**: Performance degradation, high error rates
- **Refresh**: 30 seconds

### 3. Database Monitoring Dashboard
- **Purpose**: Database health and performance
- **Metrics**: Connection pools, query performance, replication lag
- **Alerts**: Connection limits, slow queries, replication issues
- **Refresh**: 30 seconds

## Alerting Rules

### System Resource Alerts

| Alert Name | Condition | Severity | Duration |
|------------|-----------|----------|----------|
| HighCPUUsage | CPU > 80% | Warning | 5 minutes |
| CriticalCPUUsage | CPU > 95% | Critical | 2 minutes |
| HighMemoryUsage | Memory > 85% | Warning | 5 minutes |
| CriticalMemoryUsage | Memory > 95% | Critical | 2 minutes |
| HighDiskUsage | Disk > 85% | Warning | 5 minutes |
| CriticalDiskUsage | Disk > 95% | Critical | 2 minutes |

### Application Alerts

| Alert Name | Condition | Severity | Duration |
|------------|-----------|----------|----------|
| ServiceDown | Service unavailable | Critical | 1 minute |
| HighHTTPErrorRate | 5xx errors > 5% | Warning | 5 minutes |
| CriticalHTTPErrorRate | 5xx errors > 15% | Critical | 2 minutes |
| HighResponseTime | Response time > 2s | Warning | 5 minutes |
| CriticalResponseTime | Response time > 5s | Critical | 2 minutes |

### Database Alerts

| Alert Name | Condition | Severity | Duration |
|------------|-----------|----------|----------|
| PostgreSQLDown | Database unavailable | Critical | 1 minute |
| HighDatabaseConnections | Connections > 80% | Warning | 5 minutes |
| CriticalDatabaseConnections | Connections > 95% | Critical | 2 minutes |
| SlowQueries | Query time > 5s | Warning | 10 minutes |
| DatabaseReplicationLag | Lag > 100MB | Warning | 5 minutes |

### Security Alerts

| Alert Name | Condition | Severity | Duration |
|------------|-----------|----------|----------|
| HighFailedLoginAttempts | Failed logins > 10/min | Warning | 2 minutes |
| CriticalFailedLoginAttempts | Failed logins > 50/min | Critical | 1 minute |
| SSLCertificateExpiringSoon | Expires in < 7 days | Warning | 1 hour |
| SSLCertificateExpiring | Expires in < 24 hours | Critical | 1 hour |

## Notification Channels

### Email Notifications
- **Recipients**: DevOps team, on-call engineer
- **Alerts**: All critical alerts, warning alerts during business hours
- **Format**: Detailed alert information with runbook links

### Slack Integration
- **Channels**: #alerts (critical), #monitoring (warnings)
- **Alerts**: Real-time notifications with context
- **Format**: Formatted messages with severity indicators

### PagerDuty Integration
- **Escalation**: Critical alerts only
- **Schedule**: 24/7 on-call rotation
- **Format**: Alert details with escalation policies

## Metrics Collection

### Application Metrics

```typescript
// Example: Express.js metrics middleware
import { register, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

// Collect default Node.js metrics
collectDefaultMetrics({ prefix: 'codesenseisearch_' });

// Custom metrics
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status']
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route']
});

// Search-specific metrics
const searchRequestsTotal = new Counter({
  name: 'search_requests_total',
  help: 'Total search requests'
});

const searchRequestDuration = new Histogram({
  name: 'search_request_duration_seconds',
  help: 'Search request duration in seconds',
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 1.5, 2, 3, 5]
});

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### Database Metrics

```sql
-- PostgreSQL monitoring queries
SELECT 
  datname,
  numbackends,
  xact_commit,
  xact_rollback,
  blks_read,
  blks_hit,
  tup_returned,
  tup_fetched,
  tup_inserted,
  tup_updated,
  tup_deleted
FROM pg_stat_database;

-- Connection monitoring
SELECT count(*) as active_connections,
       max_conn,
       max_conn - count(*) as available_connections
FROM pg_stat_activity, 
     (SELECT setting::int as max_conn FROM pg_settings WHERE name='max_connections') mc;

-- Slow query monitoring
SELECT query, mean_time, calls, total_time
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;
```

## Maintenance

### Regular Tasks

1. **Weekly**:
   - Review alert fatigue and tune thresholds
   - Check disk space usage for metrics storage
   - Verify backup integrity

2. **Monthly**:
   - Update Grafana dashboards based on new requirements
   - Review and optimize Prometheus retention policies
   - Security updates for monitoring stack

3. **Quarterly**:
   - Disaster recovery testing
   - Performance baseline updates
   - Monitoring stack capacity planning

### Troubleshooting

#### Prometheus Issues

```bash
# Check Prometheus targets
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.health != "up")'

# Check Prometheus configuration
curl -s http://localhost:9090/api/v1/status/config

# View Prometheus logs
docker-compose -f docker-compose.prod-enhanced.yml logs prometheus
```

#### Grafana Issues

```bash
# Check Grafana health
curl -s http://localhost:3001/api/health

# Check datasources
curl -s -u admin:admin http://localhost:3001/api/datasources

# View Grafana logs
docker-compose -f docker-compose.prod-enhanced.yml logs grafana
```

#### Alertmanager Issues

```bash
# Check Alertmanager status
curl -s http://localhost:9093/api/v1/status

# View active alerts
curl -s http://localhost:9093/api/v1/alerts

# View Alertmanager logs
docker-compose -f docker-compose.prod-enhanced.yml logs alertmanager
```

## Security Considerations

### Access Control
- Change default Grafana admin password
- Implement LDAP/OAuth integration for Grafana
- Use reverse proxy with SSL termination
- Restrict network access to monitoring ports

### Data Protection
- Encrypt metrics data in transit and at rest
- Implement data retention policies
- Regular security updates
- Monitor for unauthorized access

### Compliance
- Log access to monitoring systems
- Implement audit trails
- Document security procedures
- Regular security assessments

## Performance Optimization

### Prometheus Configuration
```yaml
# Optimize storage retention
storage:
  tsdb:
    retention.time: 30d
    retention.size: 50GB

# Optimize scrape intervals
global:
  scrape_interval: 15s
  evaluation_interval: 15s

# Use recording rules for expensive queries
rule_files:
  - "/etc/prometheus/rules/*.yml"
```

### Grafana Optimization
- Use query caching
- Optimize dashboard refresh intervals
- Implement dashboard folders for organization
- Use template variables for dynamic dashboards

## Backup and Recovery

### Prometheus Data Backup
```bash
# Backup Prometheus data
docker exec prometheus_container tar -czf /tmp/prometheus-backup.tar.gz /prometheus

# Restore Prometheus data
docker exec prometheus_container tar -xzf /tmp/prometheus-backup.tar.gz -C /
```

### Grafana Configuration Backup
```bash
# Export all dashboards
curl -s "http://admin:admin@localhost:3001/api/search?query=&" | \
jq -r '.[] | select(.type == "dash-db") | .uid' | \
xargs -I {} curl -s "http://admin:admin@localhost:3001/api/dashboards/uid/{}" | \
jq '.dashboard' > grafana-dashboards-backup.json
```

## Advanced Features

### Custom Alerting Rules
- Create application-specific alerting rules
- Implement business logic alerts
- Use inhibition rules to reduce alert fatigue
- Implement alert routing based on severity and team

### Advanced Dashboards
- Create custom panels for business metrics
- Implement drill-down capabilities
- Use annotations for deployment tracking
- Create alerting dashboards

### Integration with CI/CD
- Automated dashboard deployment
- Alerting rule validation in CI
- Performance regression detection
- Automated monitoring setup

## Support and Documentation

### Internal Documentation
- Runbook procedures for common alerts
- Escalation procedures
- Contact information for on-call engineers
- Knowledge base for troubleshooting

### External Resources
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Alertmanager Documentation](https://prometheus.io/docs/alerting/latest/alertmanager/)
- [Node Exporter Documentation](https://github.com/prometheus/node_exporter)

---

**Last Updated**: December 2024  
**Version**: 1.0  
**Maintained by**: CodeSenseiSearch DevOps Team