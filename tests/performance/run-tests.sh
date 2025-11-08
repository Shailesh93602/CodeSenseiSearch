#!/bin/bash

# Performance Testing Suite Runner
# Executes comprehensive performance tests for CodeSenseiSearch

set -euo pipefail

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RESULTS_DIR="$PROJECT_DIR/tests/results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging
log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Create results directory
mkdir -p "$RESULTS_DIR"

# Check dependencies
check_dependencies() {
    log "Checking dependencies..."
    
    if ! command -v k6 >/dev/null 2>&1; then
        warn "k6 not found. Installing..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew install k6
        else
            error "Please install k6: https://k6.io/docs/getting-started/installation/"
        fi
    fi
    
    if ! command -v docker >/dev/null 2>&1; then
        error "Docker not found. Please install Docker."
    fi
    
    log "Dependencies check passed ✓"
}

# Start local services for testing
start_services() {
    log "Starting local services..."
    
    cd "$PROJECT_DIR"
    
    # Start development environment
    if [ -f "docker-compose.dev.yml" ]; then
        docker-compose -f docker-compose.dev.yml up -d postgres redis
        sleep 10
    else
        warn "Development docker-compose not found. Assuming services are running."
    fi
    
    log "Services started ✓"
}

# Run database optimization
optimize_database() {
    log "Running database optimization..."
    
    if [ -f "$PROJECT_DIR/tests/performance/db-optimization.sql" ]; then
        # Run optimization script
        if [ -n "${DATABASE_URL:-}" ]; then
            psql "$DATABASE_URL" -f "$PROJECT_DIR/tests/performance/db-optimization.sql" > "$RESULTS_DIR/db-optimization_$TIMESTAMP.log" 2>&1
            log "Database optimization completed ✓"
        else
            warn "DATABASE_URL not set. Skipping database optimization."
        fi
    fi
}

# Run load tests
run_load_tests() {
    log "Running load tests..."
    
    # Basic load test
    k6 run \
        --env BASE_URL="${BASE_URL:-http://localhost:3000}" \
        --env API_URL="${API_URL:-http://localhost:3001}" \
        --out json="$RESULTS_DIR/load-test_$TIMESTAMP.json" \
        "$PROJECT_DIR/tests/performance/k6-load-test.js" \
        > "$RESULTS_DIR/load-test_$TIMESTAMP.log" 2>&1
    
    log "Load tests completed ✓"
}

# Run stress tests
run_stress_tests() {
    log "Running stress tests..."
    
    k6 run \
        --env BASE_URL="${BASE_URL:-http://localhost:3000}" \
        --env API_URL="${API_URL:-http://localhost:3001}" \
        --out json="$RESULTS_DIR/stress-test_$TIMESTAMP.json" \
        "$PROJECT_DIR/tests/performance/k6-stress-test.js" \
        > "$RESULTS_DIR/stress-test_$TIMESTAMP.log" 2>&1
    
    log "Stress tests completed ✓"
}

# API benchmarking with Apache Bench
run_api_benchmarks() {
    log "Running API benchmarks..."
    
    local api_url="${API_URL:-http://localhost:3001}"
    local results_file="$RESULTS_DIR/api-benchmark_$TIMESTAMP.log"
    
    echo "API Benchmark Results - $TIMESTAMP" > "$results_file"
    echo "======================================" >> "$results_file"
    
    # Health endpoint benchmark
    echo "Health Endpoint:" >> "$results_file"
    if command -v ab >/dev/null 2>&1; then
        ab -n 1000 -c 10 "$api_url/health" >> "$results_file" 2>&1 || warn "Health endpoint benchmark failed"
    else
        warn "Apache Bench (ab) not found. Skipping AB tests."
    fi
    
    echo "" >> "$results_file"
    
    # Search endpoint benchmark (if available)
    echo "Search Endpoint:" >> "$results_file"
    if command -v ab >/dev/null 2>&1; then
        ab -n 500 -c 5 "$api_url/api/search?q=javascript" >> "$results_file" 2>&1 || warn "Search endpoint benchmark failed"
    fi
    
    log "API benchmarks completed ✓"
}

# Generate performance report
generate_report() {
    log "Generating performance report..."
    
    local report_file="$RESULTS_DIR/performance-report_$TIMESTAMP.md"
    
    cat > "$report_file" << EOF
# Performance Test Report - $TIMESTAMP

## Test Configuration
- **Date**: $(date)
- **Base URL**: ${BASE_URL:-http://localhost:3000}
- **API URL**: ${API_URL:-http://localhost:3001}
- **Test Duration**: Load test ~15 minutes, Stress test ~10 minutes

## Results Summary

### Load Test Results
$(if [ -f "$RESULTS_DIR/load-test_$TIMESTAMP.log" ]; then
    tail -20 "$RESULTS_DIR/load-test_$TIMESTAMP.log" | grep -E "(✓|✗|scenarios|checks|http_req)"
else
    echo "Load test results not available"
fi)

### Stress Test Results
$(if [ -f "$RESULTS_DIR/stress-test_$TIMESTAMP.log" ]; then
    tail -20 "$RESULTS_DIR/stress-test_$TIMESTAMP.log" | grep -E "(✓|✗|scenarios|checks|http_req)"
else
    echo "Stress test results not available"
fi)

### Database Optimization
$(if [ -f "$RESULTS_DIR/db-optimization_$TIMESTAMP.log" ]; then
    echo "Database optimization completed successfully"
else
    echo "Database optimization skipped or failed"
fi)

## Recommendations

1. **API Response Times**: Target P95 < 500ms for production
2. **Error Rates**: Should be < 1% under normal load
3. **Database**: Monitor slow queries and optimize indexes
4. **Caching**: Implement Redis caching for search results
5. **Monitoring**: Set up alerts for performance degradation

## Files Generated
- Load test results: load-test_$TIMESTAMP.json
- Stress test results: stress-test_$TIMESTAMP.json
- API benchmarks: api-benchmark_$TIMESTAMP.log
- Database optimization: db-optimization_$TIMESTAMP.log

EOF

    log "Performance report generated: $report_file ✓"
}

# Cleanup
cleanup() {
    log "Cleaning up..."
    
    # Stop development services if we started them
    if [ -f "$PROJECT_DIR/docker-compose.dev.yml" ]; then
        cd "$PROJECT_DIR"
        docker-compose -f docker-compose.dev.yml down || warn "Failed to stop development services"
    fi
    
    log "Cleanup completed ✓"
}

# Main execution
main() {
    echo -e "${BLUE}CodeSenseiSearch Performance Testing Suite${NC}"
    echo "=========================================="
    
    # Trap cleanup on exit
    trap cleanup EXIT
    
    check_dependencies
    start_services
    optimize_database
    run_load_tests
    run_stress_tests
    run_api_benchmarks
    generate_report
    
    echo ""
    log "🚀 Performance testing completed successfully!"
    log "📊 Results available in: $RESULTS_DIR"
    log "📝 Report: $RESULTS_DIR/performance-report_$TIMESTAMP.md"
}

# Run main function
main "$@"