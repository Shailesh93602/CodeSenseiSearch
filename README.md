# CodeSenseiSearch 🔍

> AI-powered semantic search engine for developer content

A production-ready, TypeScript-first monorepo that provides intelligent semantic search across GitHub repositories, StackOverflow Q&A, and technical documentation. Built with Next.js, NestJS, and powered by vector embeddings for superior relevance.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- pnpm 8+
- Docker and Docker Compose

### Local Development Setup

1. **Clone and install dependencies**
   ```bash
   git clone https://github.com/Shailesh93602/CodeSenseiSearch.git
   cd CodeSenseiSearch
   pnpm install
   ```

2. **Start local services**
   ```bash
   # Start PostgreSQL + Redis + pgAdmin
   docker-compose up -d
   
   # Or start with admin tools
   docker-compose --profile admin up -d
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Run database migrations**
   ```bash
   pnpm db:migrate
   ```

5. **Start all development servers**
   ```bash
   pnpm dev
   ```

6. **Access the application**
   - Frontend: http://localhost:3000
   - API: http://localhost:3001/api
   - Health Check: http://localhost:3001/api/health
   - pgAdmin: http://localhost:5050 (admin@codesenseisearch.com / devpassword)

## 🏗️ Architecture

### Monorepo Structure
```
CodeSenseiSearch/
├── apps/
│   ├── web/                 # Next.js frontend (App Router + Tailwind)
│   └── api/                 # NestJS backend (REST + GraphQL)
├── packages/
│   ├── types/               # Shared TypeScript types
│   └── utils/               # Shared utilities
├── todos/                   # Phase-based development tracking
├── scripts/                 # Database init and utility scripts
└── docker-compose.yml       # Local development environment
```

### Technology Stack

**Frontend**
- **Framework**: Next.js 14+ (App Router)
- **UI**: React 18, Tailwind CSS, shadcn/ui
- **Code Highlighting**: Monaco Editor / Prism.js
- **State Management**: React Query, Zustand

**Backend**
- **Framework**: NestJS (TypeScript)
- **Database**: PostgreSQL 15+ with pgvector extension
- **ORM**: Prisma (with vector support)
- **Cache**: Redis 7+
- **Queue**: BullMQ (for async jobs)

**AI & Search**
- **Embeddings**: OpenAI text-embedding-3-small/large
- **Vector DB**: pgvector (PostgreSQL extension)
- **Search Strategy**: Hybrid (BM25 + Vector Similarity + LLM Reranking)

## 🎯 Current Status: Phase 0 Complete ✅

**Phase 0 Deliverables** (Production-ready foundation):
- ✅ Monorepo setup with pnpm workspaces
- ✅ Next.js frontend with TypeScript + Tailwind
- ✅ NestJS backend with health checks
- ✅ PostgreSQL + pgvector + Redis via Docker
- ✅ Prisma ORM with vector schema
- ✅ Shared TypeScript packages
- ✅ ESLint + Prettier + CI/CD pipeline
- ✅ Comprehensive documentation

**Next**: Phase 1 - Landing page + search UI with mocked results

## 📋 Available Scripts

### Workspace Root
```bash
pnpm dev                    # Start all services (frontend + backend)
pnpm build                  # Build all packages and apps
pnpm test                   # Run all tests
pnpm lint                   # Lint all packages
pnpm type-check            # TypeScript checks across workspace
pnpm format                # Format code with Prettier
```

### Database Operations
```bash
pnpm db:migrate            # Run Prisma migrations
pnpm db:studio             # Open Prisma Studio
pnpm --filter api db:generate  # Generate Prisma client
```

### Development Tools
```bash
docker-compose up -d                    # Start local services
docker-compose --profile admin up -d   # Start with admin tools
docker-compose logs -f postgres         # View database logs
docker-compose down -v                  # Stop and remove volumes
```

## 🗂️ Project Management

### Phase-Based Development
This project follows an 8-phase delivery approach with production-ready iterations:

1. **Phase 0**: ✅ Project setup & scaffolding  
2. **Phase 1**: 🚧 Landing page + search UI  
3. **Phase 2**: ⏳ Content ingestion pipeline  
4. **Phase 3**: ⏳ Vector embeddings + search  
5. **Phase 4**: ⏳ Hybrid search + reranking  
6. **Phase 5**: ⏳ Authentication + personalization  
7. **Phase 6**: ⏳ Production deployment  
8. **Phase 7**: ⏳ SEO content + documentation  

### Todo Management
- **Master Tracker**: `todos/master-tracker.md` - Overall progress
- **Phase Files**: `todos/phase-X.md` - Detailed task breakdowns
- **Templates**: `todos/templates/` - Consistent structure

```bash
# Check current phase progress
cat todos/phase-1.md

# View overall project status  
cat todos/master-tracker.md

# Update todos after completing work
git add todos/ && git commit -m "Update todos: Phase X progress"
```

## 🔧 Configuration

### Environment Variables
Key configuration options (see `.env.example`):

```bash
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/codesenseisearch"
REDIS_URL="redis://localhost:6379"

# API
API_PORT=3001
FRONTEND_URL="http://localhost:3000"

# External APIs (add when implementing)
OPENAI_API_KEY=""
GITHUB_TOKEN=""
```

### Docker Services
- **PostgreSQL**: Port 5432 (with pgvector extension)
- **Redis**: Port 6379 (caching + job queues)
- **pgAdmin**: Port 5050 (database admin, optional)
- **Redis Commander**: Port 8081 (Redis admin, optional)

## 🧪 Testing

### Test Strategy
- **Unit Tests**: Jest for business logic
- **Integration Tests**: Supertest for API endpoints  
- **E2E Tests**: Playwright for user flows (Phase 1+)
- **Database Tests**: Test database with migrations

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:cov

# Run specific app tests
pnpm --filter api test
pnpm --filter web test
```

### CI/CD Pipeline
GitHub Actions automatically runs:
- ✅ Linting and formatting checks
- ✅ TypeScript type checking
- ✅ Build verification (all packages)
- ✅ Test suite with PostgreSQL + Redis
- ✅ Security audit
- ✅ Artifact generation

## 🚀 Deployment

### Development
- **Frontend**: `pnpm dev` (localhost:3000)
- **Backend**: `pnpm --filter api dev` (localhost:3001)
- **Database**: Docker Compose PostgreSQL + Redis

### Production (Phase 6)
- **Frontend**: Vercel (planned)
- **Backend**: Railway/Render (planned)
- **Database**: Managed PostgreSQL with pgvector
- **Cache**: Managed Redis instance

## 📚 API Documentation

### Health Check
```bash
GET /api/health
```
```json
{
  "status": "ok",
  "timestamp": "2025-11-02T12:00:00.000Z",
  "service": "CodeSenseiSearch API",
  "version": "0.1.0"
}
```

More endpoints will be documented as they're implemented in subsequent phases.

## 🤝 Contributing

### Development Workflow
1. **Pick a Phase**: Check `todos/master-tracker.md` for current phase
2. **Create Branch**: `git checkout -b feature/phase-X-feature-name`
3. **Follow Todos**: Use `todos/phase-X.md` for task guidance
4. **Update Progress**: Mark todos complete as you work
5. **Submit PR**: All CI checks must pass

### Quality Standards
- **TypeScript**: Strict mode, proper typing
- **Testing**: >80% coverage for new features
- **Documentation**: Update README and API docs
- **Performance**: Meet latency targets (<300ms search)

## 📖 Learning Resources

### Key Technologies
- [Next.js App Router](https://nextjs.org/docs/app)
- [NestJS Documentation](https://docs.nestjs.com/)
- [Prisma with PostgreSQL](https://www.prisma.io/docs/)
- [pgvector Extension](https://github.com/pgvector/pgvector)
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)

### Architecture Decisions
- **Monorepo**: Shared code, unified tooling, easier development
- **pgvector**: Cost-effective vector storage, SQL familiarity
- **TypeScript-first**: Better DX, fewer runtime errors
- **Phase-based**: Deployable increments, early feedback

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: GitHub Issues for bugs and feature requests
- **Discussions**: GitHub Discussions for questions
- **Documentation**: Check `todos/` for development guidance
- **Health Check**: `/api/health` for service status

---

**Built with ❤️ for developers who love intelligent search**

Current Phase: **Phase 0 Complete** ✅ | Next: **Phase 1 - Landing Page + Search UI** 🚧