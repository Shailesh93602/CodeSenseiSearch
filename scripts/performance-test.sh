#!/bin/bash

# Performance testing script for CodeSenseiSearch
# This script runs various performance tests using k6

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
API_URL="${API_URL:-http://localhost:3001}"
WEB_URL="${WEB_URL:-http://localhost:3000}"
OUTPUT_DIR="${OUTPUT_DIR:-./performance/results}"
TEST_TYPE="${1:-all}"
DURATION="${DURATION:-5m}"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

print_header() {
    echo -e "${BLUE}===============================================${NC}"
    echo -e "${BLUE}  CodeSenseiSearch Performance Testing Suite  ${NC}"
    echo -e "${BLUE}===============================================${NC}"
    echo ""
}

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_dependencies() {
    print_status "Checking dependencies..."
    
    if ! command -v k6 &> /dev/null; then
        print_error "k6 is not installed. Please install k6 first:"
        echo "  brew install k6"
        echo "  or visit: https://k6.io/docs/getting-started/installation/"
        exit 1
    fi
    
    print_status "k6 version: $(k6 version)"
}

check_services() {
    print_status "Checking if services are running..."
    
    # Check API
    if curl -s "$API_URL/health" > /dev/null 2>&1; then
        print_status "API is running at $API_URL"
    else
        print_warning "API might not be running at $API_URL"
        print_warning "Consider starting the API first: cd apps/api && npm run dev"
    fi
    
    # Check Web
    if curl -s "$WEB_URL" > /dev/null 2>&1; then
        print_status "Web app is running at $WEB_URL"
    else
        print_warning "Web app might not be running at $WEB_URL"
        print_warning "Consider starting the web app first: cd apps/web && npm run dev"
    fi
}

run_api_load_test() {
    print_status "Running API load test..."
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local output_file="$OUTPUT_DIR/api_load_test_$timestamp.json"
    
    API_URL="$API_URL" k6 run \
        --out json="$output_file" \
        ./performance/k6/api-load-test.js
    
    print_status "API load test completed. Results saved to: $output_file"
}

run_frontend_load_test() {
    print_status "Running frontend load test..."
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local output_file="$OUTPUT_DIR/frontend_load_test_$timestamp.json"
    
    WEB_URL="$WEB_URL" k6 run \
        --out json="$output_file" \
        ./performance/k6/frontend-load-test.js
    
    print_status "Frontend load test completed. Results saved to: $output_file"
}

run_spike_test() {
    print_status "Running spike test..."
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local output_file="$OUTPUT_DIR/spike_test_$timestamp.json"
    
    API_URL="$API_URL" WEB_URL="$WEB_URL" k6 run \
        --out json="$output_file" \
        ./performance/k6/spike-test.js
    
    print_status "Spike test completed. Results saved to: $output_file"
}

run_stress_test() {
    print_status "Running extended stress test..."
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local output_file="$OUTPUT_DIR/stress_test_$timestamp.json"
    
    # Use API load test with extended duration
    API_URL="$API_URL" k6 run \
        --duration "$DURATION" \
        --vus 50 \
        --out json="$output_file" \
        ./performance/k6/api-load-test.js
    
    print_status "Stress test completed. Results saved to: $output_file"
}

generate_report() {
    print_status "Generating performance report..."
    
    local latest_results=$(ls -t "$OUTPUT_DIR"/*.json 2>/dev/null | head -5)
    if [ -z "$latest_results" ]; then
        print_warning "No test results found in $OUTPUT_DIR"
        return
    fi
    
    local report_file="$OUTPUT_DIR/performance_report_$(date +%Y%m%d_%H%M%S).md"
    
    cat > "$report_file" << EOF
# Performance Test Report

Generated: $(date)

## Test Configuration
- API URL: $API_URL
- Web URL: $WEB_URL
- Test Duration: $DURATION

## Recent Test Results

EOF

    for result_file in $latest_results; do
        local test_name=$(basename "$result_file" .json)
        echo "### $test_name" >> "$report_file"
        echo "" >> "$report_file"
        
        # Extract key metrics if jq is available
        if command -v jq &> /dev/null && [ -f "$result_file" ]; then
            echo "**Key Metrics:**" >> "$report_file"
            
            # Get summary metrics
            local avg_duration=$(jq -r 'select(.type=="Point" and .metric=="http_req_duration") | .data.value' "$result_file" | awk '{sum+=$1; count++} END {if(count>0) print sum/count; else print "N/A"}')
            local error_rate=$(jq -r 'select(.type=="Point" and .metric=="http_req_failed") | .data.value' "$result_file" | awk '{sum+=$1; count++} END {if(count>0) print (sum/count)*100; else print "N/A"}')
            
            echo "- Average Response Time: ${avg_duration}ms" >> "$report_file"
            echo "- Error Rate: ${error_rate}%" >> "$report_file"
            echo "" >> "$report_file"
        fi
        
        echo "Result file: \`$result_file\`" >> "$report_file"
        echo "" >> "$report_file"
    done
    
    print_status "Performance report generated: $report_file"
}

show_usage() {
    echo "Usage: $0 [test_type] [options]"
    echo ""
    echo "Test Types:"
    echo "  all          Run all performance tests (default)"
    echo "  api          Run API load test only"
    echo "  frontend     Run frontend load test only"
    echo "  spike        Run spike test only"
    echo "  stress       Run extended stress test"
    echo ""
    echo "Environment Variables:"
    echo "  API_URL      API base URL (default: http://localhost:3001)"
    echo "  WEB_URL      Web app URL (default: http://localhost:3000)"
    echo "  OUTPUT_DIR   Results output directory (default: ./performance/results)"
    echo "  DURATION     Stress test duration (default: 5m)"
    echo ""
    echo "Examples:"
    echo "  $0 api                    # Run API tests only"
    echo "  $0 stress DURATION=10m    # Run 10-minute stress test"
    echo "  API_URL=https://api.example.com $0 all"
}

main() {
    print_header
    
    if [ "$TEST_TYPE" = "help" ] || [ "$TEST_TYPE" = "--help" ] || [ "$TEST_TYPE" = "-h" ]; then
        show_usage
        exit 0
    fi
    
    check_dependencies
    check_services
    
    case "$TEST_TYPE" in
        "api")
            run_api_load_test
            ;;
        "frontend")
            run_frontend_load_test
            ;;
        "spike")
            run_spike_test
            ;;
        "stress")
            run_stress_test
            ;;
        "all")
            run_api_load_test
            sleep 2
            run_frontend_load_test
            sleep 2
            run_spike_test
            ;;
        *)
            print_error "Unknown test type: $TEST_TYPE"
            show_usage
            exit 1
            ;;
    esac
    
    generate_report
    
    print_status "Performance testing completed!"
    print_status "View results in: $OUTPUT_DIR"
}

# Run main function
main "$@"