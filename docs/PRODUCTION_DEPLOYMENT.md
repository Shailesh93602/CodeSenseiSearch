# 🚀 Production Deployment Guide

This document provides comprehensive instructions for deploying CodeSenseiSearch to production environments.

## 🎯 Current Deployment Status

> **✅ VERCEL DEPLOYMENT CONFIGURED**  
> The application is already set up for deployment on Vercel platform. This guide covers additional infrastructure components and local/self-hosted alternatives.

## 📋 Prerequisites

### Vercel Deployment (Current Setup)
- **Frontend**: Deployed on Vercel with automatic deployments
- **Database**: External PostgreSQL with pgvector support
- **API**: Serverless functions or containerized backend
- **Domain**: Custom domain configured through Vercel

### Self-Hosted Alternative (Optional)
- **OS**: Ubuntu 20.04+ or CentOS 8+ (Linux x86_64)
- **RAM**: Minimum 4GB, Recommended 8GB+
- **Storage**: Minimum 20GB free space, SSD recommended
- **CPU**: 2+ cores recommended for production workloads

### Required Software (Self-Hosted)
- **Docker Engine**: 20.10+
- **Docker Compose**: 2.0+
- **Git**: 2.25+
- **SSL Certificate**: For HTTPS (Let's Encrypt recommended)

### Domain Setup
- Primary domain: Already configured with Vercel
- API subdomain: `api.codesenseisearch.com` (if self-hosting backend)
- Staging domain: Vercel preview deployments

## 🔧 Server Setup

### 1. Initial Server Configuration
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y curl wget git htop unzip

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Reboot to apply Docker group changes
sudo reboot
```

### 2. Create Deployment Directory
```bash
# Create application directory
sudo mkdir -p /opt/codesenseisearch
sudo chown $USER:$USER /opt/codesenseisearch

# Create backup directory
sudo mkdir -p /opt/backups/codesenseisearch
sudo chown $USER:$USER /opt/backups/codesenseisearch

# Create log directory
sudo mkdir -p /var/log/codesenseisearch
sudo chown $USER:$USER /var/log/codesenseisearch
```

### 3. Clone Repository
```bash
cd /opt/codesenseisearch
git clone https://github.com/yourusername/CodeSenseiSearch.git .
```

## 🔐 Environment Configuration

### 1. Create Production Environment File
```bash
cp .env.production.template .env.production
```

### 2. Configure Environment Variables
Edit `.env.production` with your production values:

```bash
# Critical: Update these values for production
DATABASE_URL="postgresql://codesenseisearch:STRONG_DB_PASSWORD@postgres:5432/codesenseisearch?schema=public&sslmode=disable"
REDIS_URL="redis://:STRONG_REDIS_PASSWORD@redis:6379"
JWT_SECRET="your-super-strong-jwt-secret-min-32-chars"

# API Keys (obtain from respective services)
GEMINI_API_KEY="your_actual_gemini_api_key"
GITHUB_TOKEN="your_actual_github_token"
GITHUB_CLIENT_ID="your_github_oauth_client_id"
GITHUB_CLIENT_SECRET="your_github_oauth_client_secret"

# Production URLs
FRONTEND_URL="https://codesenseisearch.com"
API_URL="https://api.codesenseisearch.com"

# SSL Certificate email for Let's Encrypt
ACME_EMAIL="admin@yourdomain.com"
```

### 3. Secure Environment File
```bash
chmod 600 .env.production
```

## 🚀 Deployment Methods

### Method 1: Automated Deployment Script (Recommended)
```bash
# Run the deployment script
sudo ./scripts/deploy.sh

# Check deployment status
sudo ./scripts/deploy.sh --health-check
```

### Method 2: Manual Deployment
```bash
# Start database services first
docker-compose -f docker-compose.prod.yml up -d postgres redis

# Wait for database to be ready
sleep 10

# Run database migrations
docker-compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy

# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Verify deployment
docker-compose -f docker-compose.prod.yml ps
```

## 🔍 Health Checks & Monitoring

### Service Health Endpoints
- **API Health**: `https://api.codesenseisearch.com/health`
- **Frontend Health**: `https://codesenseisearch.com/api/health`
- **Traefik Dashboard**: `https://codesenseisearch.com:8080` (disable in production)

### System Monitoring
```bash
# Check service status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f api
docker-compose -f docker-compose.prod.yml logs -f web

# Check resource usage
docker stats

# Database status
docker-compose -f docker-compose.prod.yml exec postgres pg_isready -U codesenseisearch
```

### Log Locations
- **Application Logs**: `/var/log/codesenseisearch/`
- **Docker Logs**: `docker-compose logs`
- **System Logs**: `/var/log/syslog`

## 📊 Performance Tuning

### Database Optimization
```sql
-- Connect to database and run these optimizations
ALTER SYSTEM SET shared_buffers = '25% of RAM';
ALTER SYSTEM SET effective_cache_size = '75% of RAM';
ALTER SYSTEM SET maintenance_work_mem = '256MB';
SELECT pg_reload_conf();
```

### Redis Optimization
```bash
# Add to docker-compose.prod.yml redis command
--maxmemory 512mb
--maxmemory-policy allkeys-lru
```

### Nginx/Traefik Optimization
- Enable gzip compression
- Configure caching headers
- Set up rate limiting
- Enable HTTP/2

## 🔒 Security Hardening

### 1. Firewall Configuration
```bash
# Install UFW
sudo apt install ufw

# Configure firewall rules
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 2. SSL Certificate Setup
```bash
# Certificates are automatically obtained via Traefik Let's Encrypt
# Ensure ACME_EMAIL is set in .env.production
```

### 3. Regular Security Updates
```bash
# Create automated update script
sudo crontab -e

# Add this line for weekly updates
0 2 * * 0 apt update && apt upgrade -y
```

## 💾 Backup & Recovery

### Automated Backups
```bash
# Create backup script
cat > /opt/codesenseisearch/scripts/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups/codesenseisearch"
DATE=$(date +%Y%m%d_%H%M%S)

# Database backup
docker-compose -f /opt/codesenseisearch/docker-compose.prod.yml exec -T postgres \
  pg_dump -U codesenseisearch codesenseisearch > "$BACKUP_DIR/db_backup_$DATE.sql"

# Remove backups older than 7 days
find "$BACKUP_DIR" -name "db_backup_*.sql" -mtime +7 -delete
EOF

chmod +x /opt/codesenseisearch/scripts/backup.sh

# Schedule daily backups
echo "0 2 * * * /opt/codesenseisearch/scripts/backup.sh" | sudo crontab -
```

### Manual Backup
```bash
# Create full backup
sudo ./scripts/deploy.sh --backup

# Database backup only
docker-compose -f docker-compose.prod.yml exec postgres pg_dump \
  -U codesenseisearch codesenseisearch > backup_$(date +%Y%m%d).sql
```

### Recovery
```bash
# Rollback to previous version
sudo ./scripts/deploy.sh --rollback

# Restore database from backup
docker-compose -f docker-compose.prod.yml exec -T postgres \
  psql -U codesenseisearch -d codesenseisearch < backup_file.sql
```

## 🔄 CI/CD Integration

### GitHub Actions Setup
1. Configure repository secrets:
   - `PRODUCTION_HOST`: Server IP/domain
   - `PRODUCTION_USER`: SSH username
   - `PRODUCTION_SSH_KEY`: Private SSH key
   - `PRODUCTION_DATABASE_URL`: Database connection string

2. Push to `main` branch triggers automatic deployment

### Manual CI/CD Trigger
```bash
# Force deployment of specific commit
git checkout main
git pull origin main
sudo ./scripts/deploy.sh
```

## 🐛 Troubleshooting

### Common Issues

#### Service Won't Start
```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs api
docker-compose -f docker-compose.prod.yml logs web

# Check environment variables
docker-compose -f docker-compose.prod.yml config
```

#### Database Connection Issues
```bash
# Test database connectivity
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U codesenseisearch -d codesenseisearch -c "SELECT 1;"

# Check database logs
docker-compose -f docker-compose.prod.yml logs postgres
```

#### SSL Certificate Issues
```bash
# Check Traefik logs
docker-compose -f docker-compose.prod.yml logs traefik

# Verify domain DNS
nslookup codesenseisearch.com
```

#### Memory Issues
```bash
# Check memory usage
free -h
docker stats

# Restart services if needed
docker-compose -f docker-compose.prod.yml restart
```

### Emergency Procedures

#### Complete System Recovery
```bash
# Stop all services
docker-compose -f docker-compose.prod.yml down

# Clear all data (DANGEROUS!)
docker system prune -a --volumes

# Restore from backup
sudo ./scripts/deploy.sh --rollback
```

#### Database Corruption Recovery
```bash
# Stop application
docker-compose -f docker-compose.prod.yml stop api web

# Backup current state
docker-compose -f docker-compose.prod.yml exec postgres pg_dump \
  -U codesenseisearch codesenseisearch > corrupted_backup.sql

# Reset database
docker-compose -f docker-compose.prod.yml stop postgres
docker volume rm codesenseisearch_postgres_data
docker-compose -f docker-compose.prod.yml up -d postgres

# Restore from clean backup
cat clean_backup.sql | docker-compose -f docker-compose.prod.yml exec -T postgres \
  psql -U codesenseisearch -d codesenseisearch
```

## 📈 Scaling Considerations

### Horizontal Scaling
- Use multiple application instances behind load balancer
- Separate database to dedicated server
- Implement Redis clustering
- Use CDN for static assets

### Vertical Scaling
- Increase server resources (CPU, RAM, Storage)
- Optimize database queries and indexes
- Implement caching layers
- Use read replicas for database

## 📞 Support & Maintenance

### Regular Maintenance Tasks
- [ ] Weekly security updates
- [ ] Monthly backup verification
- [ ] Quarterly performance review
- [ ] Annual security audit

### Monitoring Setup
- **Uptime Monitoring**: UptimeRobot, Pingdom
- **Error Tracking**: Sentry, Rollbar
- **Performance Monitoring**: New Relic, DataDog
- **Log Aggregation**: ELK Stack, Grafana Loki

### Support Contacts
- **Technical Lead**: [Your Email]
- **DevOps Team**: [Team Email]
- **Emergency Contact**: [Emergency Number]

---

## 🎯 Production Checklist

Before going live, ensure:

- [ ] Environment variables configured
- [ ] SSL certificates working
- [ ] Database migrations applied
- [ ] Health checks passing
- [ ] Monitoring setup
- [ ] Backup strategy implemented
- [ ] Security hardening complete
- [ ] Performance testing done
- [ ] Documentation updated
- [ ] Team trained on procedures

---

**🚨 Remember**: Always test deployments in staging environment before production!