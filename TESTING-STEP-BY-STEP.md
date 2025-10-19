# 🧪 CodeSenseiSearch Phase 2 Testing Guide

## 📋 Complete Testing Protocol with Commands & Expected Outputs

This guide provides step-by-step instructions to test all Phase 2 features with exact commands and expected responses.

## 🚀 Setup & Prerequisites

### 1. Environment Setup
```bash
# Navigate to project root
cd /Users/shaileshchaudhary/Desktop/Coding/CodeSenseiSearch

# Copy environment template (if not done already)
cp apps/api/.env.example apps/api/.env

# Edit .env file - YOU MUST SET THESE VALUES:
# DATABASE_URL="postgresql://codesenseisearch:devpassword@localhost:5432/codesenseisearch"
# REDIS_URL="redis://localhost:6379"
# GITHUB_TOKEN="your_github_personal_access_token_here"  # GET THIS FROM GITHUB
```

**Important**: Get your GitHub Personal Access Token:
1. Go to GitHub.com → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with these permissions: `repo`, `read:user`
3. Copy the token and paste it in your `.env` file

### 2. Start Infrastructure
```bash
# Start PostgreSQL and Redis with Docker
docker-compose up -d postgres redis

# Wait for services to be ready (30-60 seconds)
# Check if services are running:
docker-compose ps
```

**Expected Output:**
```
NAME                              COMMAND                  SERVICE             STATUS              PORTS
codesenseisearch-postgres-1       "docker-entrypoint.s…"   postgres            running             0.0.0.0:5432->5432/tcp
codesenseisearch-redis-1          "docker-entrypoint.s…"   redis               running             0.0.0.0:6379->6379/tcp
```

### 3. Database Setup
```bash
# Navigate to API directory
cd apps/api

# Generate Prisma client
npx prisma generate

# Apply database migrations
npx prisma migrate deploy
```

**Expected Output:**
```
✔ Generated Prisma Client (5.21.1) to ./node_modules/@prisma/client
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "codesenseisearch"

3 migrations found in prisma/migrations

Applying migration `xxx_init`
Applying migration `xxx_add_content_models`
Applying migration `xxx_add_chunk_model`

The following migration(s) have been applied:
migrations/
  └─ xxx_init/
    └─ migration.sql
  └─ xxx_add_content_models/
    └─ migration.sql
  └─ xxx_add_chunk_model/
    └─ migration.sql

All migrations have been successfully applied.
```

### 4. Install Dependencies & Build
```bash
# Go back to project root
cd ../..

# Install dependencies
pnpm install

# Build the project
pnpm build
```

### 5. Start API Server
```bash
# Navigate to API directory
cd apps/api

# Start the development server
npm run start:dev
```

**Expected Output:**
```
[Nest] 12345  - 11/02/2025, 10:30:45 AM     LOG [NestFactory] Starting Nest application...
[Nest] 12345  - 11/02/2025, 10:30:45 AM     LOG [InstanceLoader] AppModule dependencies initialized
[Nest] 12345  - 11/02/2025, 10:30:45 AM     LOG [InstanceLoader] ConfigModule dependencies initialized
[Nest] 12345  - 11/02/2025, 10:30:45 AM     LOG [InstanceLoader] WorkersModule dependencies initialized
[Nest] 12345  - 11/02/2025, 10:30:45 AM     LOG [InstanceLoader] TestModule dependencies initialized
[Nest] 12345  - 11/02/2025, 10:30:45 AM     LOG [InstanceLoader] AdminModule dependencies initialized
[Nest] 12345  - 11/02/2025, 10:30:45 AM     LOG [RoutesResolver] AppController {/}:
[Nest] 12345  - 11/02/2025, 10:30:45 AM     LOG [RouterExplorer] Mapped {/, GET} route
[Nest] 12345  - 11/02/2025, 10:30:45 AM     LOG [RouterExplorer] Mapped {/health, GET} route
[Nest] 12345  - 11/02/2025, 10:30:45 AM     LOG [RoutesResolver] TestController {/test}:
[Nest] 12345  - 11/02/2025, 10:30:45 AM     LOG [RoutesResolver] AdminController {/admin}:
[Nest] 12345  - 11/02/2025, 10:30:45 AM     LOG [NestApplication] Nest application successfully started
[Nest] 12345  - 11/02/2025, 10:30:45 AM     LOG Application is running on: http://localhost:3001
```

---

## 🧪 Testing Protocol

### Phase 1: Basic Health Checks

#### Test 1.1: API Server Health
```bash
curl http://localhost:3001/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-02T10:30:45.123Z"
}
```

#### Test 1.2: Test Endpoints Health
```bash
curl http://localhost:3001/test/health
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Test endpoints are operational",
  "timestamp": "2025-11-02T10:30:45.123Z"
}
```

#### Test 1.3: Database Connection
```bash
curl http://localhost:3001/test/database/connection
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Database connection successful",
  "timestamp": "2025-11-02T10:30:45.123Z"
}
```

#### Test 1.4: Queue System Health
```bash
curl http://localhost:3001/test/queues/health
```

**Expected Response:**
```json
{
  "success": true,
  "queues": {
    "github-discovery": { "status": "connected" },
    "github-ingestion": { "status": "connected" },
    "github-processing": { "status": "connected" },
    "stackoverflow-discovery": { "status": "connected" },
    "stackoverflow-ingestion": { "status": "connected" },
    "content-chunking": { "status": "connected" }
  },
  "timestamp": "2025-11-02T10:30:45.123Z"
}
```

---

### Phase 2: API Service Validation

#### Test 2.1: GitHub API Rate Limit
```bash
curl http://localhost:3001/test/github/rate-limit
```

**Expected Response (with valid token):**
```json
{
  "success": true,
  "rateLimit": {
    "limit": 5000,
    "used": 150,
    "remaining": 4850,
    "reset": "2025-11-02T11:30:45.123Z"
  },
  "canMakeRequests": true,
  "timestamp": "2025-11-02T10:30:45.123Z"
}
```

**Expected Response (with invalid/missing token):**
```json
{
  "success": false,
  "error": "GitHub API authentication failed",
  "timestamp": "2025-11-02T10:30:45.123Z"
}
```

#### Test 2.2: GitHub API Validation
```bash
curl http://localhost:3001/test/github/validate
```

**Expected Response (success):**
```json
{
  "success": true,
  "authenticated": true,
  "user": "YourGitHubUsername",
  "rateLimit": {
    "remaining": 4850,
    "limit": 5000
  },
  "timestamp": "2025-11-02T10:30:45.123Z"
}
```

#### Test 2.3: StackOverflow API Validation
```bash
curl http://localhost:3001/test/stackoverflow/validate
```

**Expected Response:**
```json
{
  "success": true,
  "quota": {
    "remaining": 299,
    "max": 300
  },
  "timestamp": "2025-11-02T10:30:45.123Z"
}
```

---

### Phase 3: Content Processing Pipeline

#### Test 3.1: GitHub Repository Search
```bash
curl "http://localhost:3001/test/github/search?language=javascript&limit=3"
```

**Expected Response:**
```json
{
  "success": true,
  "repositories": [
    {
      "fullName": "facebook/react",
      "language": "JavaScript",
      "starCount": 220000,
      "description": "The library for web and native user interfaces"
    },
    {
      "fullName": "microsoft/vscode",
      "language": "JavaScript", 
      "starCount": 160000,
      "description": "Visual Studio Code"
    }
  ],
  "count": 3,
  "timestamp": "2025-11-02T10:30:45.123Z"
}
```

#### Test 3.2: StackOverflow Questions Search
```bash
curl "http://localhost:3001/test/stackoverflow/search?tag=javascript&limit=3"
```

**Expected Response:**
```json
{
  "success": true,
  "questions": [
    {
      "questionId": 12345,
      "title": "How to use async/await in JavaScript?",
      "tags": ["javascript", "async-await"],
      "score": 150,
      "answerCount": 5
    }
  ],
  "count": 3,
  "timestamp": "2025-11-02T10:30:45.123Z"
}
```

#### Test 3.3: Content Chunking Test
```bash
curl -X POST http://localhost:3001/test/content-chunking/test \
  -H "Content-Type: application/json" \
  -d '{
    "content": "# JavaScript Tutorial\n\nJavaScript is a programming language.\n\n```js\nfunction hello() {\n  console.log('\''Hello World'\'');\n}\n```\n\nThis is a code example.",
    "contentType": "MARKDOWN",
    "language": "javascript"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "chunks": [
    {
      "content": "# JavaScript Tutorial\n\nJavaScript is a programming language.",
      "chunkIndex": 0,
      "tokenCount": 12
    },
    {
      "content": "```js\nfunction hello() {\n  console.log('Hello World');\n}\n```",
      "chunkIndex": 1,
      "tokenCount": 15
    },
    {
      "content": "This is a code example.",
      "chunkIndex": 2,
      "tokenCount": 6
    }
  ],
  "totalChunks": 3,
  "timestamp": "2025-11-02T10:30:45.123Z"
}
```

#### Test 3.4: Content Chunking Validation
```bash
curl http://localhost:3001/test/content-chunking/validate
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Content chunking service is operational",
  "strategies": {
    "markdown": "available",
    "code": "available", 
    "stackoverflow": "available",
    "github": "available"
  },
  "timestamp": "2025-11-02T10:30:45.123Z"
}
```

---

### Phase 4: Admin Dashboard & Monitoring

#### Test 4.1: System Health Overview
```bash
curl http://localhost:3001/admin/system-health
```

**Expected Response:**
```json
{
  "overallHealth": "healthy",
  "timestamp": "2025-11-02T10:30:45.123Z",
  "services": [
    {
      "service": "database",
      "status": "healthy",
      "message": "Connected"
    },
    {
      "service": "queue-github-discovery",
      "status": "healthy", 
      "message": "Active: 0, Waiting: 0"
    },
    {
      "service": "queue-github-processing",
      "status": "healthy",
      "message": "Active: 0, Waiting: 0"
    },
    {
      "service": "queue-content-chunking",
      "status": "healthy",
      "message": "Active: 0, Waiting: 0"
    }
  ],
  "summary": {
    "total": 4,
    "healthy": 4,
    "unhealthy": 0
  }
}
```

#### Test 4.2: Admin Dashboard
```bash
curl http://localhost:3001/admin/dashboard
```

**Expected Response:**
```json
{
  "success": true,
  "timestamp": "2025-11-02T10:30:45.123Z",
  "statistics": {
    "total": {
      "repositories": 0,
      "questions": 0,
      "content": 0,
      "chunks": 0
    },
    "processing": {
      "pendingContent": 0,
      "processingRepositories": 0,
      "failedJobs": 0
    },
    "contentByType": [],
    "languageDistribution": []
  },
  "recentActivity": {
    "repositories": [],
    "questions": []
  }
}
```

#### Test 4.3: Processing Statistics
```bash
curl http://localhost:3001/admin/processing-stats
```

**Expected Response:**
```json
{
  "success": true,
  "period": "24 hours",
  "timestamp": "2025-11-02T10:30:45.123Z",
  "processed": {
    "repositories": 0,
    "questions": 0,
    "content": 0,
    "chunks": 0
  },
  "statusDistribution": {
    "repositories": [],
    "questions": []
  }
}
```

---

### Phase 5: End-to-End Pipeline Testing

#### Test 5.1: Trigger GitHub Repository Processing
```bash
# Start a repository discovery job
curl -X POST http://localhost:3001/test/pipeline/github/discover \
  -H "Content-Type: application/json" \
  -d '{
    "language": "typescript",
    "limit": 2
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "GitHub discovery job started",
  "jobId": "github-discovery-abc123",
  "estimatedTime": "2-5 minutes",
  "timestamp": "2025-11-02T10:30:45.123Z"
}
```

#### Test 5.2: Monitor Job Progress
```bash
# Check job status (repeat every 30 seconds)
curl "http://localhost:3001/test/queues/status?queue=github-discovery"
```

**Expected Response (in progress):**
```json
{
  "success": true,
  "queue": "github-discovery",
  "status": {
    "active": 1,
    "waiting": 0,
    "completed": 0,
    "failed": 0
  },
  "timestamp": "2025-11-02T10:30:45.123Z"
}
```

**Expected Response (completed):**
```json
{
  "success": true,
  "queue": "github-discovery",
  "status": {
    "active": 0,
    "waiting": 0,
    "completed": 1,
    "failed": 0
  },
  "timestamp": "2025-11-02T10:32:15.123Z"
}
```

#### Test 5.3: Verify Data Ingestion
```bash
# Check if repositories were discovered and ingested
curl http://localhost:3001/admin/dashboard
```

**Expected Response (after successful processing):**
```json
{
  "success": true,
  "timestamp": "2025-11-02T10:35:45.123Z",
  "statistics": {
    "total": {
      "repositories": 2,
      "questions": 0,
      "content": 15,
      "chunks": 45
    },
    "processing": {
      "pendingContent": 0,
      "processingRepositories": 0,
      "failedJobs": 0
    },
    "contentByType": [
      {
        "type": "FILE",
        "count": 15
      }
    ],
    "languageDistribution": [
      {
        "language": "typescript",
        "count": 12
      },
      {
        "language": "javascript",
        "count": 3
      }
    ]
  },
  "recentActivity": {
    "repositories": [
      {
        "fullName": "microsoft/typescript",
        "language": "TypeScript",
        "starCount": 95000,
        "ingestionStatus": "COMPLETED",
        "createdAt": "2025-11-02T10:32:00.000Z"
      }
    ],
    "questions": []
  }
}
```

---

## 🎯 Browser Testing (Optional)

You can also test using your browser:

### Test in Browser
1. **Basic Health**: `http://localhost:3001/health`
2. **Admin Dashboard**: `http://localhost:3001/admin/dashboard`
3. **System Health**: `http://localhost:3001/admin/system-health`
4. **GitHub Rate Limit**: `http://localhost:3001/test/github/rate-limit`

---

## ⚠️ Troubleshooting Common Issues

### Issue 1: "Database connection failed"
```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# Restart if needed
docker-compose restart postgres

# Check logs
docker-compose logs postgres
```

### Issue 2: "GitHub API authentication failed"
```bash
# Verify your GitHub token is set
cat apps/api/.env | grep GITHUB_TOKEN

# Test token manually
curl -H "Authorization: token YOUR_TOKEN" https://api.github.com/user
```

### Issue 3: "Queue connection failed"
```bash
# Check if Redis is running
docker-compose ps redis

# Restart if needed
docker-compose restart redis
```

### Issue 4: "Port 3001 already in use"
```bash
# Find what's using the port
lsof -i :3001

# Kill the process or change the port in .env
```

---

## ✅ Success Criteria

**Phase 2 is working correctly when:**

1. ✅ All health checks return `success: true`
2. ✅ GitHub API shows valid authentication
3. ✅ StackOverflow API responds successfully
4. ✅ Content chunking processes test data correctly
5. ✅ Admin dashboard shows system statistics
6. ✅ End-to-end pipeline processes repositories
7. ✅ Database contains ingested content and chunks

**You're ready for Phase 3 when all tests pass and data processing works end-to-end!**

---

## 📞 Next Steps

Once all tests pass:
1. Document any issues encountered
2. Note performance metrics (response times)
3. Confirm data quality in admin dashboard
4. Ready to proceed to **Phase 3: Embedding Generation & Vector Search**

Let me know the results of your testing and any issues you encounter!