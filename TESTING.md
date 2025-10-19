# 🧪 CodeSenseiSearch Phase 2 - Production Testing Guide

## 📋 Pre-Testing Setup Requirements

### 1. Environment Variables Setup
Copy `.env.example` to `.env` and configure:

```bash
# Required for testing:
DATABASE_URL="postgresql://username:password@localhost:5432/codesenseisearch_dev"
REDIS_URL="redis://localhost:6379"
GITHUB_TOKEN="your_github_personal_access_token_here"
NODE_ENV="development"
PORT=3001
LOG_LEVEL="debug"

# Optional for Phase 2:
OPENAI_API_KEY="your_openai_api_key_here"  # Will be needed for Phase 3
```

### 2. Infrastructure Setup
Ensure these services are running:

**PostgreSQL Database:**
```bash
# Option 1: Local PostgreSQL
createdb codesenseisearch_dev

# Option 2: Docker
docker run --name postgres-codesense \
  -e POSTGRES_DB=codesenseisearch_dev \
  -e POSTGRES_USER=username \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 -d postgres:15
```

**Redis Server:**
```bash
# Option 1: Local Redis
redis-server

# Option 2: Docker
docker run --name redis-codesense \
  -p 6379:6379 -d redis:7-alpine
```

### 3. Database Setup
```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed initial data
npm run db:seed
```

### 4. GitHub Token Setup
Create a GitHub Personal Access Token with these permissions:
- `public_repo` (for reading public repositories)
- `repo` (if you want to test with private repos)
- Rate limit: 5000 requests/hour

---

## 🚀 Testing Protocol

### Phase 1: Basic Health Checks

Start the server:
```bash
npm run dev
```

**1.1 Application Health**
```bash
curl http://localhost:3001/test/health
```
✅ Expected: `{"status":"healthy","timestamp":"...","environment":"development"}`

**1.2 Database Connection**
```bash
curl http://localhost:3001/test/database/connection
```
✅ Expected: Connection successful with table counts

**1.3 Queue System Status**
```bash
curl http://localhost:3001/test/queues/status
```
✅ Expected: All 7 queues initialized (may have connection errors if Redis not running)

---

### Phase 2: API Service Testing

**2.1 GitHub API Integration**
```bash
# Check rate limits
curl http://localhost:3001/test/github/rate-limit

# Search repositories
curl "http://localhost:3001/test/github/search?language=typescript&minStars=100"

# Test specific repository
curl http://localhost:3001/test/github/repository/microsoft/TypeScript
```

**2.2 StackOverflow API Integration**
```bash
# Check quota
curl http://localhost:3001/test/stackoverflow/quota

# Search questions
curl "http://localhost:3001/test/stackoverflow/questions?tags=typescript,javascript&minScore=10"

# Test specific question (use a real question ID from search results)
curl http://localhost:3001/test/stackoverflow/question/47989485
```

---

### Phase 3: End-to-End Pipeline Testing

**3.1 GitHub Pipeline Test**
```bash
curl -X POST http://localhost:3001/test/pipeline/github \
  -H "Content-Type: application/json" \
  -d '{
    "language": "typescript",
    "minStars": 100,
    "maxResults": 1,
    "testMode": true
  }'
```

**3.2 StackOverflow Pipeline Test**
```bash
curl -X POST http://localhost:3001/test/pipeline/stackoverflow \
  -H "Content-Type: application/json" \
  -d '{
    "tags": ["typescript"],
    "minScore": 20,
    "maxResults": 2
  }'
```

**3.3 Monitor Processing Results**
```bash
# Check recent content
curl http://localhost:3001/test/content/recent?limit=10

# Check recent chunks
curl http://localhost:3001/test/chunks/recent?limit=5

# Check queue status
curl http://localhost:3001/test/queues/status
```

---

## ✅ Production Readiness Checklist

### Core Functionality
- [ ] **Database Connection**: PostgreSQL connected, migrations applied
- [ ] **Redis Connection**: Queue system operational
- [ ] **GitHub API**: Rate limits checked, repository search working
- [ ] **StackOverflow API**: Quota sufficient, question search working
- [ ] **Worker System**: All 7 workers initialized and processing jobs

### Data Pipeline Integrity
- [ ] **GitHub Discovery**: Can find and queue repositories
- [ ] **GitHub Ingestion**: Can fetch file trees and create processing jobs
- [ ] **GitHub Processing**: Can download files, detect binary content, create content records
- [ ] **StackOverflow Discovery**: Can find and queue questions
- [ ] **StackOverflow Ingestion**: Can fetch Q&A content with answers
- [ ] **Content Chunking**: Can intelligently chunk all content types
- [ ] **Database Storage**: Content and chunks properly stored with metadata

### Performance & Monitoring
- [ ] **Rate Limiting**: Respects GitHub (5000/hour) and StackOverflow quotas
- [ ] **Error Handling**: Failed jobs logged, status tracked in database
- [ ] **Memory Usage**: No memory leaks during processing
- [ ] **Job Processing**: Queues process jobs without backing up
- [ ] **Concurrent Processing**: Multiple workers can run simultaneously

### Data Quality
- [ ] **Content Deduplication**: Duplicate content detected via hashing
- [ ] **Language Detection**: Files properly categorized by programming language
- [ ] **Chunk Quality**: Code blocks preserved, context maintained
- [ ] **Metadata Accuracy**: Repository info, question data correctly stored
- [ ] **Binary File Filtering**: Binary files skipped appropriately

---

## 🐛 Common Issues & Solutions

### Issue: "GitHub rate limit exceeded"
**Solution**: Wait for rate limit reset or check token permissions
```bash
curl http://localhost:3001/test/github/rate-limit
```

### Issue: "StackOverflow quota exceeded"
**Solution**: Wait for daily quota reset (10,000 requests/day)
```bash
curl http://localhost:3001/test/stackoverflow/quota
```

### Issue: "Queue connection failed"
**Solution**: Ensure Redis is running and accessible
```bash
redis-cli ping  # Should return "PONG"
```

### Issue: "Database connection failed"
**Solution**: Check PostgreSQL connection and run migrations
```bash
npm run db:migrate
npm run db:seed
```

### Issue: "Workers not processing jobs"
**Solution**: Check worker initialization in logs:
```bash
# Look for these log messages:
# "Worker initialized for queue: github-discovery"
# "Worker initialized for queue: github-ingestion"
# etc.
```

---

## 📊 Expected Test Results

After running the full test suite, you should see:

1. **API Services**: All external APIs accessible with proper credentials
2. **Database**: 2 sources created, content and chunks being stored
3. **Queues**: Jobs being created, processed, and completed
4. **Workers**: All 6 workers operational (7th for Phase 3)
5. **Content**: GitHub files and StackOverflow Q&A properly chunked
6. **Monitoring**: All test endpoints returning successful responses

## 🎯 Performance Benchmarks

- **GitHub Repository Processing**: <30 seconds for small repos (<100 files)
- **StackOverflow Question Processing**: <10 seconds per question with answers
- **Content Chunking**: <5 seconds per content piece
- **Memory Usage**: <512MB for typical processing workload
- **Queue Throughput**: >100 jobs/minute across all queues

---

## 🚀 Ready for Production When:

✅ All test endpoints return success responses  
✅ Full GitHub pipeline completes without errors  
✅ Full StackOverflow pipeline completes without errors  
✅ Content is properly chunked and stored in database  
✅ Queue system handles job failures gracefully  
✅ Performance meets benchmarks under load  
✅ Error handling prevents system crashes  
✅ Monitoring shows healthy system state  

---

## 📞 Need Help?

If any tests fail, check:
1. Environment variables are correctly set
2. Required services (PostgreSQL, Redis) are running
3. API tokens have proper permissions
4. Database migrations are up to date
5. Log output for specific error messages