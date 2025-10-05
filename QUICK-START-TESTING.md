# 🚀 Quick Start Testing Guide

## TL;DR - Get Running in 5 Minutes

### 1. Setup Environment
```bash
# Copy environment file and edit with your GitHub token
cp apps/api/.env.example apps/api/.env
# Edit .env and set GITHUB_TOKEN="your_token_here"
```

### 2. Start Infrastructure
```bash
docker-compose up -d postgres redis
```

### 3. Setup Database
```bash
cd apps/api
npx prisma generate
npx prisma migrate deploy
cd ../..
```

### 4. Start API Server
```bash
cd apps/api
npm run start:dev
```

### 5. Run Tests
```bash
# Quick automated test
./quick-test.sh

# OR manual testing
curl http://localhost:3001/health
curl http://localhost:3001/admin/dashboard
```

## 📋 Essential Test Commands

### Basic Health Checks
```bash
curl http://localhost:3001/health                          # API health
curl http://localhost:3001/test/health                     # Test endpoints
curl http://localhost:3001/test/database/connection        # Database
curl http://localhost:3001/test/queues/health             # Queue system
```

### API Services
```bash
curl http://localhost:3001/test/github/rate-limit          # GitHub API
curl http://localhost:3001/test/stackoverflow/validate     # StackOverflow API
```

### Admin Dashboard
```bash
curl http://localhost:3001/admin/dashboard                 # System overview
curl http://localhost:3001/admin/system-health            # Health status
```

### Content Processing Test
```bash
curl -X POST http://localhost:3001/test/content-chunking/test \
  -H "Content-Type: application/json" \
  -d '{"content": "# Test\nSample content", "contentType": "MARKDOWN"}'
```

## ✅ Expected Results

**All endpoints should return `"success": true` or valid data**

### Healthy Response Examples:
- Health: `{"status": "ok"}`
- Database: `{"success": true, "message": "Database connection successful"}`
- GitHub API: `{"success": true, "authenticated": true}`
- Admin Dashboard: `{"success": true, "statistics": {...}}`

## 🔧 Troubleshooting

### Issue: Connection Failed
```bash
# Check if services are running
docker-compose ps
# Restart if needed
docker-compose restart postgres redis
```

### Issue: GitHub API Failed
```bash
# Check your token in .env file
cat apps/api/.env | grep GITHUB_TOKEN
# Get token from: GitHub Settings → Developer settings → Personal access tokens
```

### Issue: Port 3001 in use
```bash
# Find what's using port 3001
lsof -i :3001
# Kill the process or change PORT in .env
```

## 🎯 Success Criteria

**✅ Ready for Phase 3 when:**
- All health checks pass
- GitHub API authenticates successfully
- Content chunking works
- Admin dashboard shows data
- No errors in API startup logs

## 📚 Detailed Guides

- **Complete Testing**: `TESTING-STEP-BY-STEP.md`
- **Production Setup**: `setup-production.sh`
- **Checklist**: `PRODUCTION-READINESS-CHECKLIST.md`

---

**🎉 Phase 2 Complete - Ready for Phase 3!**