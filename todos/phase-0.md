# Phase 0: Project Setup & Scaffolding

**Goal**: Create production-ready monorepo foundation with TypeScript, Docker, and CI/CD pipeline

**Timeline**: 2-4 days  
**Status**: 🚧 In Progress  
**Priority**: P0 (Blocking)

---

## Acceptance Criteria

✅ **Must Have**:
- [ ] Monorepo with `apps/web` (Next.js) and `apps/api` (NestJS) working locally
- [ ] Docker Compose environment (Postgres + Redis + dev services)
- [ ] Basic CI/CD pipeline (lint, test, build) in GitHub Actions
- [ ] Health check endpoints responding (`GET /api/health`)
- [ ] README with quick start instructions

🎯 **Success Metrics**:
- [ ] `pnpm dev` starts all services without errors
- [ ] Frontend accessible at `http://localhost:3000`
- [ ] Backend API accessible at `http://localhost:3001/api/health`
- [ ] Docker Compose brings up all dependencies
- [ ] CI pipeline passes on sample PR

---

## Task Breakdown

### 1. Monorepo Scaffolding
**Estimate**: 4-6 hours

- [ ] **Initialize pnpm workspace**
  - [ ] Create `package.json` with workspaces config
  - [ ] Set up pnpm workspace structure
  - [ ] Configure shared dependencies and dev tools

- [ ] **Create Next.js frontend app**
  - [ ] `pnpm create next-app apps/web --typescript --tailwind --app`
  - [ ] Configure shadcn/ui components
  - [ ] Add basic layout and routing structure
  - [ ] Test dev server and build process

- [ ] **Create NestJS backend app**
  - [ ] `nest new apps/api` with TypeScript
  - [ ] Configure environment variables and validation
  - [ ] Add health check controller (`/api/health`)
  - [ ] Set up CORS for frontend communication

- [ ] **Shared packages setup**
  - [ ] Create `packages/types` for shared TypeScript types
  - [ ] Create `packages/utils` for shared utilities
  - [ ] Configure proper imports between packages

### 2. Database & Infrastructure
**Estimate**: 3-4 hours

- [ ] **PostgreSQL setup**
  - [ ] Docker Compose service for local Postgres
  - [ ] Install and configure Prisma ORM
  - [ ] Create initial schema (`User`, `Content`, `Embedding` models)
  - [ ] Set up migration workflow

- [ ] **Redis setup**
  - [ ] Docker Compose service for Redis
  - [ ] Configure Redis client in backend
  - [ ] Test basic cache operations

- [ ] **pgvector extension**
  - [ ] Add pgvector to Postgres Docker image
  - [ ] Test vector similarity queries
  - [ ] Document vector operations

### 3. Development Environment
**Estimate**: 2-3 hours

- [ ] **Docker Compose configuration**
  - [ ] Services: postgres, redis, pgadmin (optional)
  - [ ] Proper networking and volume mounts
  - [ ] Environment variable management
  - [ ] Health checks for all services

- [ ] **Development scripts**
  - [ ] `pnpm dev` - Start all services concurrently
  - [ ] `pnpm build` - Build all apps
  - [ ] `pnpm test` - Run all tests
  - [ ] `pnpm db:migrate` - Run database migrations
  - [ ] `pnpm db:studio` - Open Prisma Studio

- [ ] **Code quality tools**
  - [ ] ESLint configuration across workspace
  - [ ] Prettier with consistent formatting
  - [ ] Husky pre-commit hooks
  - [ ] TypeScript strict mode configuration

### 4. CI/CD Pipeline
**Estimate**: 2-3 hours

- [ ] **GitHub Actions workflow**
  - [ ] Trigger on PR and push to main
  - [ ] Matrix strategy for frontend/backend testing
  - [ ] Dependency caching for faster builds
  - [ ] Parallel job execution where possible

- [ ] **Quality checks**
  - [ ] Lint all packages
  - [ ] Type checking with TypeScript
  - [ ] Unit test execution
  - [ ] Build verification

- [ ] **Docker integration**
  - [ ] Multi-stage Dockerfiles for production
  - [ ] Docker Compose for CI testing
  - [ ] Image building and registry push (future)

### 5. Documentation & Testing
**Estimate**: 1-2 hours

- [ ] **README documentation**
  - [ ] Project overview and architecture
  - [ ] Local development setup instructions
  - [ ] Available scripts and commands
  - [ ] Environment variable documentation

- [ ] **Basic test setup**
  - [ ] Jest configuration for backend
  - [ ] React Testing Library for frontend
  - [ ] Sample unit tests for core functionality
  - [ ] Test database setup for integration tests

---

## Implementation Notes

### Technology Decisions
- **Package Manager**: pnpm (faster, better workspace support)
- **Database**: PostgreSQL 15+ with pgvector extension
- **ORM**: Prisma (better TypeScript DX than TypeORM)
- **Cache**: Redis 7+ for sessions and query caching
- **Deployment**: Separate containers for scalability

### File Structure
```
CodeSenseiSearch/
├── apps/
│   ├── web/                 # Next.js frontend
│   │   ├── app/            # App Router structure
│   │   ├── components/     # React components
│   │   └── lib/           # Frontend utilities
│   └── api/                # NestJS backend
│       ├── src/
│       │   ├── modules/   # Feature modules
│       │   ├── common/    # Shared backend code
│       │   └── main.ts    # Application entry
│       └── test/          # Backend tests
├── packages/
│   ├── types/              # Shared TypeScript types
│   └── utils/              # Shared utilities
├── docker-compose.yml      # Local development environment
├── package.json           # Workspace root
└── pnpm-workspace.yaml    # pnpm workspace config
```

### Environment Variables
```env
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/codesenseisearch"
REDIS_URL="redis://localhost:6379"

# API Configuration
API_PORT=3001
FRONTEND_URL="http://localhost:3000"

# Future: External APIs
OPENAI_API_KEY=""
GITHUB_TOKEN=""
```

---

## Dependencies

### Frontend (`apps/web`)
```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "tailwindcss": "^3.0.0",
    "@radix-ui/react-*": "latest",
    "lucide-react": "latest"
  }
}
```

### Backend (`apps/api`)
```json
{
  "dependencies": {
    "@nestjs/core": "^10.0.0",
    "@nestjs/common": "^10.0.0",
    "@nestjs/config": "^3.0.0",
    "prisma": "^5.0.0",
    "@prisma/client": "^5.0.0",
    "redis": "^4.0.0"
  }
}
```

---

## Validation Checklist

Before marking Phase 0 complete:

- [ ] **Smoke Tests**
  - [ ] `pnpm install` succeeds without errors
  - [ ] `pnpm dev` starts all services
  - [ ] Frontend loads at localhost:3000
  - [ ] API health check returns 200
  - [ ] Database connection established
  - [ ] Redis connection working

- [ ] **Build Tests**
  - [ ] `pnpm build` succeeds for all apps
  - [ ] No TypeScript errors
  - [ ] No linting errors
  - [ ] Tests pass in CI

- [ ] **Documentation**
  - [ ] README has clear setup instructions
  - [ ] Environment variables documented
  - [ ] Architecture decisions recorded

---

**Next Phase**: Phase 1 - Landing page and search UI with mocked results

**Estimated Total Time**: 12-18 hours over 2-4 days