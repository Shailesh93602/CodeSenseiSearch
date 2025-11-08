# Security Hardening and Testing Guide

## Overview
This document outlines comprehensive security measures, hardening procedures, and testing protocols for CodeSenseiSearch production deployment.

## Security Assessment Checklist

### 🔐 Application Security

#### Authentication & Authorization
- [ ] **JWT Security**: Strong secret keys (256-bit minimum)
- [ ] **Token Expiration**: Short-lived access tokens (15 minutes)
- [ ] **Refresh Token Rotation**: Automatic rotation on use
- [ ] **Session Management**: Secure session handling
- [ ] **Password Security**: bcrypt with 12+ salt rounds
- [ ] **OAuth Security**: Secure GitHub OAuth implementation
- [ ] **Rate Limiting**: API endpoint protection
- [ ] **CORS Configuration**: Strict origin policies

#### Input Validation & Sanitization
- [ ] **SQL Injection**: Parameterized queries (Prisma ORM)
- [ ] **XSS Protection**: Input sanitization and CSP headers
- [ ] **Path Traversal**: File access validation
- [ ] **Command Injection**: Input validation for system commands
- [ ] **JSON Parsing**: Safe JSON handling
- [ ] **File Upload**: Secure file handling (if applicable)

#### Data Protection
- [ ] **Encryption at Rest**: Database encryption
- [ ] **Encryption in Transit**: TLS/SSL for all connections
- [ ] **Sensitive Data**: No secrets in logs or responses
- [ ] **PII Protection**: Data minimization and anonymization
- [ ] **Secret Management**: Environment-based secrets only

### 🛡️ Infrastructure Security

#### Container Security
- [ ] **Base Images**: Official, minimal base images
- [ ] **Non-Root Users**: Containers run as non-root
- [ ] **Resource Limits**: Memory and CPU constraints
- [ ] **Security Scanning**: Container vulnerability scanning
- [ ] **Read-Only Filesystems**: Where possible
- [ ] **Capability Dropping**: Remove unnecessary privileges

#### Network Security
- [ ] **Network Segmentation**: Isolated container networks
- [ ] **Firewall Rules**: Restricted port access
- [ ] **Service Mesh**: mTLS between services (if applicable)
- [ ] **Load Balancer**: Security headers and rate limiting
- [ ] **VPN Access**: Secure administrative access

#### Database Security
- [ ] **Access Controls**: Principle of least privilege
- [ ] **Connection Security**: Encrypted connections only
- [ ] **Backup Encryption**: Encrypted database backups
- [ ] **Audit Logging**: Database access monitoring
- [ ] **User Management**: Separate app and admin users

### 📊 Monitoring & Alerting Security
- [ ] **Log Security**: Secure log transmission and storage
- [ ] **Metrics Protection**: Authenticated metric endpoints
- [ ] **Alert Security**: Secure notification channels
- [ ] **Access Logging**: Monitor administrative access
- [ ] **Anomaly Detection**: Unusual activity monitoring

## Security Testing Procedures

### 1. Automated Security Scanning

#### Container Scanning with Trivy
```bash
# Scan API container
docker build -t codesenseisearch-api:test -f apps/api/Dockerfile .
trivy image --severity HIGH,CRITICAL codesenseisearch-api:test

# Scan Web container  
docker build -t codesenseisearch-web:test -f apps/web/Dockerfile .
trivy image --severity HIGH,CRITICAL codesenseisearch-web:test

# Scan filesystem
trivy fs --severity HIGH,CRITICAL .
```

#### Dependency Scanning
```bash
# Node.js dependency audit
cd apps/api && npm audit --audit-level=high
cd apps/web && npm audit --audit-level=high

# Check for known vulnerabilities
npx audit-ci --high
```

#### SAST (Static Application Security Testing)
```bash
# ESLint security plugin
npx eslint . --ext .js,.ts,.tsx --config .eslintrc.security.js

# Semgrep security analysis
semgrep --config=auto .

# CodeQL analysis (GitHub)
# Configured in .github/workflows/security.yml
```

### 2. Dynamic Security Testing

#### OWASP ZAP Baseline Scan
```bash
# Basic security scan
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://your-staging-url.com \
  -J zap-report.json

# Full scan (longer)
docker run -t owasp/zap2docker-stable zap-full-scan.py \
  -t https://your-staging-url.com \
  -J zap-full-report.json
```

#### API Security Testing
```bash
# Test API endpoints
curl -X POST https://api.staging.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}'

# Test authentication bypass
curl -X GET https://api.staging.com/admin/users \
  -H "Authorization: Bearer invalid-token"

# Test rate limiting
for i in {1..100}; do
  curl -X POST https://api.staging.com/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
done
```

### 3. Penetration Testing

#### Network Penetration Testing
```bash
# Port scanning
nmap -sS -O -T4 target-server.com

# Service enumeration
nmap -sV -p- target-server.com

# Vulnerability scanning
nmap --script vuln target-server.com
```

#### Web Application Testing
```bash
# Directory brute forcing
dirb https://target-server.com /usr/share/wordlists/dirb/common.txt

# SQL injection testing
sqlmap -u "https://api.target.com/search?q=test" --batch

# XSS testing
# Manual testing with payloads in search forms and parameters
```

## Security Hardening Implementation

### 1. Environment Hardening

#### Production Environment Variables
```bash
# .env.production.security
# Strong secrets (generate with openssl rand -base64 32)
JWT_SECRET="$(openssl rand -base64 32)"
SESSION_SECRET="$(openssl rand -base64 32)"
DB_PASSWORD="$(openssl rand -base64 24)"
REDIS_PASSWORD="$(openssl rand -base64 24)"

# Security headers
ENABLE_SECURITY_HEADERS=true
ENABLE_RATE_LIMITING=true
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=900000

# CORS strict configuration
CORS_ORIGINS="https://codesenseisearch.com,https://www.codesenseisearch.com"
```

#### Security Headers Configuration
```typescript
// security.middleware.ts
import helmet from 'helmet';

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "https://api.codesenseisearch.com"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});
```

### 2. Database Hardening

#### PostgreSQL Security Configuration
```sql
-- Create dedicated application user
CREATE USER codesenseisearch_app WITH PASSWORD 'strong_password_here';

-- Grant minimal permissions
GRANT CONNECT ON DATABASE codesenseisearch TO codesenseisearch_app;
GRANT USAGE ON SCHEMA public TO codesenseisearch_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO codesenseisearch_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO codesenseisearch_app;

-- Revoke dangerous permissions
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA information_schema FROM PUBLIC;
REVOKE ALL ON pg_catalog FROM PUBLIC;

-- Enable row level security (if needed)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
```

### 3. Container Hardening

#### Docker Security Configuration
```dockerfile
# Security-hardened Dockerfile example
FROM node:18-alpine AS base

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Set security-focused build args
ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

# Remove unnecessary packages
RUN apk del --purge curl wget

# Set read-only root filesystem
USER nextjs
WORKDIR /app

# Copy with proper ownership
COPY --chown=nextjs:nodejs . .

# Security: no shell access
USER 1001
ENTRYPOINT ["node", "server.js"]
```

## Incident Response Plan

### 1. Security Incident Detection
- **Automated Alerts**: Critical security events trigger immediate alerts
- **Log Monitoring**: Suspicious activity patterns in logs
- **Performance Anomalies**: Unusual traffic patterns or response times
- **User Reports**: Security issues reported by users

### 2. Incident Response Procedures

#### Immediate Response (0-15 minutes)
1. **Assess Severity**: Determine impact level
2. **Isolate Systems**: Block suspicious traffic if needed
3. **Preserve Evidence**: Capture logs and system state
4. **Notify Team**: Alert security team and stakeholders

#### Investigation Phase (15 minutes - 2 hours)
1. **Root Cause Analysis**: Identify attack vector
2. **Impact Assessment**: Determine data/system compromise
3. **Evidence Collection**: Gather forensic evidence
4. **Containment**: Prevent further damage

#### Recovery Phase (2-24 hours)
1. **System Restoration**: Restore from clean backups if needed
2. **Security Patches**: Apply necessary security updates
3. **Monitoring Enhancement**: Improve detection capabilities
4. **Communication**: Update stakeholders and users

#### Post-Incident (24+ hours)
1. **Documentation**: Complete incident report
2. **Lessons Learned**: Update security procedures
3. **Testing**: Verify security improvements
4. **Training**: Update team training based on incident

## Compliance and Audit

### Regular Security Tasks

#### Daily
- [ ] Review security alerts and logs
- [ ] Check for new vulnerability reports
- [ ] Monitor authentication failures
- [ ] Verify backup integrity

#### Weekly
- [ ] Update security patches
- [ ] Review access logs
- [ ] Test backup restoration
- [ ] Update security documentation

#### Monthly
- [ ] Conduct security scans
- [ ] Review user access permissions
- [ ] Update incident response procedures
- [ ] Security training for team

#### Quarterly
- [ ] Full penetration testing
- [ ] Security audit and compliance review
- [ ] Update security policies
- [ ] Disaster recovery testing

### Security Metrics and KPIs
- **Mean Time to Detection (MTTD)**: Average time to detect security incidents
- **Mean Time to Response (MTTR)**: Average time to respond to incidents
- **Vulnerability Remediation Time**: Time to patch security vulnerabilities
- **Failed Authentication Rate**: Percentage of failed login attempts
- **Security Scan Results**: Number of high/critical vulnerabilities found

---

## Security Testing Scripts

### Automated Security Test Suite
```bash
#!/bin/bash
# security-test-suite.sh

echo "🔍 Starting comprehensive security testing..."

# 1. Container vulnerability scanning
echo "📦 Scanning containers for vulnerabilities..."
trivy image --severity HIGH,CRITICAL codesenseisearch-api:latest
trivy image --severity HIGH,CRITICAL codesenseisearch-web:latest

# 2. Dependency auditing
echo "📚 Auditing dependencies..."
cd apps/api && npm audit --audit-level=high
cd ../web && npm audit --audit-level=high

# 3. SAST scanning
echo "🔍 Running static analysis..."
npx eslint . --ext .js,.ts,.tsx
semgrep --config=auto .

# 4. API security testing
echo "🌐 Testing API security..."
./scripts/api-security-tests.sh

# 5. Web application security
echo "🕷️ Running web security scan..."
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://staging.codesenseisearch.com

echo "✅ Security testing complete!"
```

This comprehensive security guide ensures your production deployment is hardened against common threats and follows security best practices.