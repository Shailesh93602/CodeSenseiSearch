#!/bin/bash

# Quick Test Script for CodeSenseiSearch Phase 2
# This script runs through all the essential tests automatically

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

API_URL="http://localhost:3001"

# Helper functions
success() {
    echo -e "${GREEN}✅ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Test function
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_key="$3"
    
    echo -n "Testing $name... "
    
    response=$(curl -s "$url" || echo '{"error": "connection_failed"}')
    
    if echo "$response" | grep -q "\"$expected_key\""; then
        success "$name ✓"
        return 0
    else
        error "$name ✗"
        echo "Response: $response"
        return 1
    fi
}

echo "🧪 CodeSenseiSearch Phase 2 - Quick Test Suite"
echo "=============================================="
echo ""

# Check if API server is running
info "Checking if API server is running on $API_URL..."
if ! curl -s "$API_URL/health" > /dev/null; then
    error "API server is not running on $API_URL"
    echo ""
    info "To start the API server:"
    echo "1. cd apps/api"
    echo "2. npm run start:dev"
    echo ""
    exit 1
fi

success "API server is running!"
echo ""

# Phase 1: Basic Health Checks
info "Phase 1: Basic Health Checks"
echo "----------------------------"

test_endpoint "API Health" "$API_URL/health" "status"
test_endpoint "Test Endpoints" "$API_URL/test/health" "success"
test_endpoint "Database Connection" "$API_URL/test/database/connection" "success"
test_endpoint "Queue System" "$API_URL/test/queues/health" "success"

echo ""

# Phase 2: API Services
info "Phase 2: API Service Validation"
echo "-------------------------------"

test_endpoint "GitHub Rate Limit" "$API_URL/test/github/rate-limit" "success"
test_endpoint "GitHub API" "$API_URL/test/github/validate" "success"
test_endpoint "StackOverflow API" "$API_URL/test/stackoverflow/validate" "success"

echo ""

# Phase 3: Content Processing
info "Phase 3: Content Processing Services"
echo "------------------------------------"

test_endpoint "Content Chunking" "$API_URL/test/content-chunking/validate" "success"

# Test content chunking with sample data
echo -n "Testing Content Chunking with sample data... "
chunking_response=$(curl -s -X POST "$API_URL/test/content-chunking/test" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "# Test\nThis is a test.\n```js\nconsole.log(\"hello\");\n```",
    "contentType": "MARKDOWN",
    "language": "javascript"
  }' || echo '{"error": "failed"}')

if echo "$chunking_response" | grep -q '"success".*true'; then
    success "Content Chunking with data ✓"
else
    error "Content Chunking with data ✗"
    echo "Response: $chunking_response"
fi

echo ""

# Phase 4: Admin & Monitoring
info "Phase 4: Admin Dashboard & Monitoring"
echo "-------------------------------------"

test_endpoint "System Health" "$API_URL/admin/system-health" "overallHealth"
test_endpoint "Admin Dashboard" "$API_URL/admin/dashboard" "success"
test_endpoint "Processing Stats" "$API_URL/admin/processing-stats" "success"

echo ""

# Phase 5: Quick Pipeline Test (Optional)
info "Phase 5: Optional Pipeline Test"
echo "-------------------------------"

read -p "Do you want to test the GitHub discovery pipeline? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -n "Triggering GitHub repository discovery... "
    
    pipeline_response=$(curl -s -X POST "$API_URL/test/pipeline/github/discover" \
      -H "Content-Type: application/json" \
      -d '{
        "language": "typescript",
        "limit": 1
      }' || echo '{"error": "failed"}')
    
    if echo "$pipeline_response" | grep -q '"success".*true'; then
        success "Pipeline triggered ✓"
        info "Job started. Check progress with: curl $API_URL/admin/dashboard"
        warning "Wait 2-5 minutes for processing to complete"
    else
        error "Pipeline trigger ✗"
        echo "Response: $pipeline_response"
    fi
else
    info "Skipping pipeline test"
fi

echo ""

# Summary
echo "🎯 Test Summary"
echo "==============="

# Count successful tests by checking the log
success_count=$(grep -c "✅" <<< "$(cat)")
total_tests=11

if [ -f "/tmp/test_results.tmp" ]; then
    rm "/tmp/test_results.tmp"
fi

# Re-run essential tests and count
essential_tests=(
    "$API_URL/health"
    "$API_URL/test/health" 
    "$API_URL/test/database/connection"
    "$API_URL/test/queues/health"
    "$API_URL/admin/system-health"
)

passed=0
total=${#essential_tests[@]}

for url in "${essential_tests[@]}"; do
    if curl -s "$url" | grep -q -E '"(success|status|overallHealth)"'; then
        ((passed++))
    fi
done

echo "Essential Tests: $passed/$total passed"

if [ $passed -eq $total ]; then
    success "🎉 All essential tests passed! Phase 2 is working correctly."
    echo ""
    info "Next steps:"
    echo "1. Review the admin dashboard: $API_URL/admin/dashboard"
    echo "2. Monitor system health: $API_URL/admin/system-health"
    echo "3. Ready for Phase 3: Embedding Generation & Vector Search"
else
    warning "Some tests failed. Please check the output above and troubleshoot."
    echo ""
    info "Common issues:"
    echo "- Check if .env file has correct GITHUB_TOKEN"
    echo "- Ensure PostgreSQL and Redis are running: docker-compose ps"
    echo "- Verify database migrations: cd apps/api && npx prisma migrate deploy"
fi

echo ""
info "Full testing guide: TESTING-STEP-BY-STEP.md"
info "Admin Dashboard: $API_URL/admin/dashboard"
info "System Health: $API_URL/admin/system-health"