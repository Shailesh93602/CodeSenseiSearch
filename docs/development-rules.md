# CodeSenseiSearch Development Rules & Best Practices

## Database Management

### Prisma Migration Rules
1. **NEVER create manual SQL migration files** - Always use Prisma's migration system
2. **Use Prisma CLI for all database changes**: `pnpm prisma migrate dev --name descriptive_name`
3. **Generate client after schema changes**: `pnpm prisma generate`
4. **Test migrations locally first**: Always test in development before production
5. **Use descriptive migration names**: e.g., `add_github_repositories`, `enhance_content_schema`

### Schema Management
- **Schema changes must be in `prisma/schema.prisma`** - Never edit generated files
- **Use proper Prisma types** - Leverage enum types, constraints, and relationships
- **Include proper indexes** - Add `@@index()` for frequently queried fields
- **Document schema changes** - Add comments explaining complex relationships

## TypeScript Standards

### Type Safety
1. **Avoid `any` types** - Use proper interfaces and type annotations
2. **Strict mode enabled** - Follow strict TypeScript configuration
3. **Proper error handling** - Use typed error objects and proper exception handling
4. **Interface definitions** - Create proper interfaces for all data structures

### Code Quality
- **ESLint + Prettier** - Auto-format code with consistent style
- **Import organization** - Group imports (Node modules, local modules, types)
- **Naming conventions** - Use camelCase for variables, PascalCase for types/classes
- **Comments for complex logic** - Document business logic and API integrations

## API Integration Standards

### GitHub API
- **Use official Octokit libraries** - `@octokit/graphql`, `@octokit/rest`
- **Implement rate limiting** - Check limits before requests, handle 429 responses
- **Proper error handling** - Retry logic with exponential backoff
- **Token validation** - Validate API tokens on service initialization

### Third-party APIs
- **Centralized error handling** - Consistent error response format
- **Request/response logging** - Log important API calls for debugging
- **Configuration management** - Use environment variables for API keys
- **Timeout handling** - Set reasonable timeouts for all external requests

## Worker System Rules

### BullMQ Workers
1. **Extend BaseWorker class** - Use consistent worker pattern
2. **Proper job typing** - Define interfaces for job data
3. **Error handling in workers** - Catch and log errors properly
4. **Progress tracking** - Update job progress for long-running tasks
5. **Graceful shutdown** - Implement proper cleanup in worker lifecycle

### Queue Management
- **Use specific queue methods** - Call `addGitHubIngestionJob()` instead of generic `addJob()`
- **Priority handling** - Set appropriate job priorities based on business logic
- **Job retry logic** - Configure retries for transient failures
- **Dead letter handling** - Process failed jobs appropriately

## Testing Standards

### Unit Testing
- **Test business logic** - Focus on core functionality, not framework code
- **Mock external dependencies** - Use Jest mocks for APIs, databases
- **Test error scenarios** - Include negative test cases
- **Maintain test coverage** - Aim for >80% coverage on critical paths

### Integration Testing
- **Docker test environment** - Use containers for consistent testing
- **Database seeding** - Create reproducible test data
- **API endpoint testing** - Test complete request/response cycles
- **Worker testing** - Test job processing end-to-end

## Performance Guidelines

### Database Operations
- **Use proper indexes** - Index frequently queried columns
- **Batch operations** - Use batch inserts/updates for large datasets
- **Query optimization** - Use Prisma includes wisely, avoid N+1 queries
- **Connection pooling** - Configure appropriate connection limits

### API Optimization
- **Caching strategy** - Cache expensive API calls (GitHub rate limits)
- **Pagination** - Implement cursor-based pagination for large results
- **Data transformation** - Process data efficiently in workers
- **Memory management** - Monitor memory usage in long-running processes

## Security Practices

### Authentication & Authorization
- **Environment variables** - Never commit API keys or secrets
- **Token rotation** - Implement token refresh where possible
- **Principle of least privilege** - Request minimum required API permissions
- **Input validation** - Validate all external input data

### Data Protection
- **Sanitize logs** - Remove sensitive data from log outputs
- **Secure headers** - Use appropriate HTTP security headers
- **Rate limiting** - Implement application-level rate limiting
- **Error message safety** - Don't expose internal details in error responses

## Git Workflow

### Commit Standards
- **Conventional commits** - Use `feat:`, `fix:`, `docs:`, `refactor:` prefixes
- **Atomic commits** - One logical change per commit
- **Descriptive messages** - Explain what and why, not just what changed
- **Todo tracking** - Update todo lists with each major change

### Branch Management
- **Feature branches** - Use descriptive branch names
- **Regular commits** - Commit frequently with meaningful messages
- **Clean history** - Squash commits when appropriate before merging
- **Documentation updates** - Update README and docs with code changes

## Documentation Requirements

### Code Documentation
- **JSDoc comments** - Document public methods and complex logic
- **README updates** - Keep setup and usage instructions current
- **API documentation** - Document all endpoints and data structures
- **Architecture decisions** - Record important technical decisions

### Process Documentation
- **Migration guides** - Document database and deployment changes
- **Troubleshooting guides** - Include common issues and solutions
- **Development setup** - Complete setup instructions for new developers
- **Performance monitoring** - Document key metrics and alerting

## Error Handling Standards

### Application Errors
- **Structured logging** - Use consistent log format with context
- **Error categorization** - Distinguish between user errors, system errors, external errors
- **Graceful degradation** - Handle service outages gracefully
- **Monitoring integration** - Ensure errors are captured by monitoring systems

### Recovery Procedures
- **Rollback procedures** - Document how to revert changes safely
- **Data recovery** - Procedures for recovering from data corruption
- **Service recovery** - Steps to restore services after outages
- **Communication protocols** - How to communicate issues to stakeholders

## Deployment Standards

### Environment Management
- **Environment parity** - Keep dev, staging, prod environments similar
- **Configuration management** - Use environment-specific configs
- **Secret management** - Use secure secret storage solutions
- **Health checks** - Implement comprehensive health check endpoints

### Release Process
- **Staged deployments** - Deploy to staging before production
- **Database migrations** - Run migrations before deploying application code
- **Rollback readiness** - Always have a rollback plan ready
- **Post-deployment validation** - Verify deployments with automated tests

## Monitoring & Observability

### Application Monitoring
- **Performance metrics** - Track response times, throughput, error rates
- **Business metrics** - Monitor ingestion rates, search performance, user activity
- **Resource monitoring** - Track CPU, memory, disk usage
- **External dependency monitoring** - Monitor GitHub API, database performance

### Alerting
- **Alert on symptoms** - Alert on user-facing issues first
- **Actionable alerts** - Only alert on issues that require human intervention
- **Alert fatigue prevention** - Tune alerts to reduce noise
- **Escalation procedures** - Clear escalation paths for different alert types

These rules should be followed consistently across all development work to maintain code quality, reliability, and team productivity.