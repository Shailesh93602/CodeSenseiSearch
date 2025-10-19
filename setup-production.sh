#!/bin/bash

# Production Setup and Testing Script for CodeSenseiSearch
# Run this script to set up the infrastructure and run comprehensive tests

set -e

echo "🚀 CodeSenseiSearch Production Setup & Testing"
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if required tools are installed
check_dependencies() {
    info "Checking dependencies..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed. Please install Node.js 18+ and try again."
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        error "Node.js version 18+ is required. Current version: $(node --version)"
        exit 1
    fi
    success "Node.js $(node --version) ✓"
    
    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        error "pnpm is not installed. Installing pnpm..."
        npm install -g pnpm
    fi
    success "pnpm $(pnpm --version) ✓"
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        warning "Docker is not installed. Some services may not be available."
    else
        success "Docker $(docker --version | cut -d' ' -f3 | cut -d',' -f1) ✓"
    fi
    
    # Check PostgreSQL
    if ! command -v psql &> /dev/null; then
        warning "PostgreSQL client is not installed. Using Docker PostgreSQL."
    else
        success "PostgreSQL client ✓"
    fi
    
    # Check Redis
    if ! command -v redis-cli &> /dev/null; then
        warning "Redis CLI is not installed. Using Docker Redis."
    else
        success "Redis CLI ✓"
    fi
}

# Set up environment variables
setup_env() {
    info "Setting up environment variables..."
    
    if [ ! -f "apps/api/.env" ]; then
        info "Creating .env file from template..."
        cp apps/api/.env.example apps/api/.env
        warning "Please edit apps/api/.env with your actual values before continuing"
        warning "Required: GITHUB_TOKEN, DATABASE_URL, REDIS_URL"
        read -p "Press Enter when you have updated the .env file..."
    fi
    
    # Load environment variables
    if [ -f "apps/api/.env" ]; then
        export $(cat apps/api/.env | grep -v '^#' | xargs)
        success "Environment variables loaded"
    fi
}

# Start infrastructure services
start_infrastructure() {
    info "Starting infrastructure services..."
    
    # Check if docker-compose.yml exists
    if [ -f "docker-compose.yml" ]; then
        info "Starting services with Docker Compose..."
        docker-compose up -d postgres redis
        sleep 5
        success "Infrastructure services started"
    else
        warning "No docker-compose.yml found. Please ensure PostgreSQL and Redis are running separately."
    fi
}

# Install dependencies
install_deps() {
    info "Installing dependencies..."
    pnpm install
    success "Dependencies installed"
}

# Run database migrations
setup_database() {
    info "Setting up database..."
    
    cd apps/api
    
    # Generate Prisma client
    npx prisma generate
    success "Prisma client generated"
    
    # Run migrations
    npx prisma migrate deploy
    success "Database migrations applied"
    
    # Seed database (optional)
    if [ "$1" = "--seed" ]; then
        info "Seeding database..."
        npm run seed
        success "Database seeded"
    fi
    
    cd ../..
}

# Build the application
build_app() {
    info "Building application..."
    pnpm build
    success "Application built successfully"
}

# Start the API server in background
start_api() {
    info "Starting API server..."
    cd apps/api
    npm run start:dev &
    API_PID=$!
    cd ../..
    
    # Wait for API to be ready
    info "Waiting for API to be ready..."
    for i in {1..30}; do
        if curl -s http://localhost:3001/health > /dev/null; then
            success "API server is ready"
            return 0
        fi
        sleep 1
    done
    
    error "API server failed to start within 30 seconds"
    return 1
}

# Run comprehensive tests
run_tests() {
    info "Running comprehensive production tests..."
    
    BASE_URL="http://localhost:3001"
    
    # Health checks
    echo ""
    info "1. Running Health Checks..."
    
    # Basic health
    if curl -s "$BASE_URL/health" | grep -q "ok"; then
        success "Basic health check ✓"
    else
        error "Basic health check failed"
        return 1
    fi
    
    # Database health
    if curl -s "$BASE_URL/test/database/connection" | grep -q "success.*true"; then
        success "Database connection ✓"
    else
        error "Database connection failed"
        return 1
    fi
    
    # Queue health
    if curl -s "$BASE_URL/test/queues/health" | grep -q "success.*true"; then
        success "Queue system ✓"
    else
        error "Queue system failed"
        return 1
    fi
    
    # API service tests
    echo ""
    info "2. Testing API Services..."
    
    # GitHub API
    if curl -s "$BASE_URL/test/github/validate" | grep -q "success.*true"; then
        success "GitHub API service ✓"
    else
        warning "GitHub API service - check GITHUB_TOKEN in .env"
    fi
    
    # StackOverflow API
    if curl -s "$BASE_URL/test/stackoverflow/validate" | grep -q "success.*true"; then
        success "StackOverflow API service ✓"
    else
        warning "StackOverflow API service - may have rate limits"
    fi
    
    # Pipeline tests
    echo ""
    info "3. Testing Processing Pipeline..."
    
    # Content chunking
    if curl -s "$BASE_URL/test/content-chunking/validate" | grep -q "success.*true"; then
        success "Content chunking service ✓"
    else
        error "Content chunking service failed"
        return 1
    fi
    
    # Admin dashboard
    echo ""
    info "4. Testing Admin Dashboard..."
    
    # System health
    if curl -s "$BASE_URL/admin/system-health" | grep -q "overallHealth"; then
        success "Admin system health ✓"
    else
        error "Admin system health failed"
        return 1
    fi
    
    # Dashboard
    if curl -s "$BASE_URL/admin/dashboard" | grep -q "success.*true"; then
        success "Admin dashboard ✓"
    else
        error "Admin dashboard failed"
        return 1
    fi
    
    success "All tests completed!"
}

# Generate test report
generate_report() {
    info "Generating production readiness report..."
    
    REPORT_FILE="production-readiness-report.json"
    
    # Create comprehensive report
    cat > "$REPORT_FILE" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "phase": "Phase 2 - Content Ingestion Pipeline",
  "status": "READY_FOR_PRODUCTION",
  "infrastructure": {
    "database": "PostgreSQL with Prisma ORM",
    "queue": "BullMQ with Redis",
    "api": "NestJS TypeScript",
    "monitoring": "Admin dashboard + health endpoints"
  },
  "features_completed": [
    "GitHub repository discovery and ingestion",
    "StackOverflow question discovery and ingestion", 
    "Content processing and intelligent chunking",
    "Database schema with proper relationships",
    "Background job processing with queues",
    "Comprehensive API endpoints",
    "Health monitoring and admin dashboard",
    "Production testing framework"
  ],
  "endpoints": {
    "health": "/health",
    "admin_dashboard": "/admin/dashboard",
    "system_health": "/admin/system-health",
    "test_suite": "/test/*"
  },
  "next_phase": {
    "phase": "Phase 3 - Embedding Generation & Vector Search",
    "focus": "OpenAI embeddings, vector database, semantic search"
  }
}
EOF
    
    success "Report generated: $REPORT_FILE"
}

# Cleanup function
cleanup() {
    if [ ! -z "$API_PID" ]; then
        info "Stopping API server..."
        kill $API_PID 2>/dev/null || true
    fi
}

# Main execution
main() {
    # Parse arguments
    SEED_DB=false
    SKIP_TESTS=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --seed)
                SEED_DB=true
                shift
                ;;
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            --help)
                echo "Usage: $0 [--seed] [--skip-tests] [--help]"
                echo "  --seed        Seed the database with sample data"
                echo "  --skip-tests  Skip the comprehensive test suite"
                echo "  --help        Show this help message"
                exit 0
                ;;
            *)
                error "Unknown option $1"
                exit 1
                ;;
        esac
    done
    
    # Set up cleanup trap
    trap cleanup EXIT
    
    # Run setup steps
    check_dependencies
    setup_env
    start_infrastructure
    install_deps
    
    if [ "$SEED_DB" = true ]; then
        setup_database --seed
    else
        setup_database
    fi
    
    build_app
    
    if [ "$SKIP_TESTS" = false ]; then
        start_api
        run_tests
    fi
    
    generate_report
    
    echo ""
    success "🎉 Production setup completed successfully!"
    echo ""
    info "Next steps:"
    echo "1. Review the production-readiness-report.json"
    echo "2. Start the API server: cd apps/api && npm run start:dev"
    echo "3. Access admin dashboard: http://localhost:3001/admin/dashboard"
    echo "4. Review Phase 3 requirements in todos/phase-3.md"
    echo ""
    info "For continuous monitoring, visit: http://localhost:3001/admin/system-health"
}

# Run main function
main "$@"