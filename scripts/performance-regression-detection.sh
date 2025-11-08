#!/bin/bash

# Performance Regression Detection Script
# Monitors performance metrics and detects regressions

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASELINE_DIR="${BASELINE_DIR:-./performance/baselines}"
RESULTS_DIR="${RESULTS_DIR:-./performance/results}"
REPORTS_DIR="${REPORTS_DIR:-./performance/reports}"
THRESHOLDS_FILE="${THRESHOLDS_FILE:-./performance/thresholds.json}"
API_URL="${API_URL:-http://localhost:3001}"
WEB_URL="${WEB_URL:-http://localhost:3000}"

# Create directories
mkdir -p "$BASELINE_DIR" "$RESULTS_DIR" "$REPORTS_DIR"

print_header() {
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}  Performance Regression Detection Suite   ${NC}"
    echo -e "${BLUE}============================================${NC}"
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

print_regression() {
    echo -e "${RED}[REGRESSION]${NC} $1"
}

print_improvement() {
    echo -e "${GREEN}[IMPROVEMENT]${NC} $1"
}

# Default thresholds if file doesn't exist
create_default_thresholds() {
    if [ ! -f "$THRESHOLDS_FILE" ]; then
        print_status "Creating default thresholds file..."
        
        cat > "$THRESHOLDS_FILE" << 'EOF'
{
  "response_time": {
    "p95_threshold_ms": 500,
    "p99_threshold_ms": 1000,
    "regression_percentage": 20
  },
  "error_rate": {
    "max_error_rate_percent": 5,
    "regression_threshold_percent": 2
  },
  "throughput": {
    "min_requests_per_second": 50,
    "regression_percentage": 15
  },
  "memory": {
    "max_memory_mb": 512,
    "regression_percentage": 25
  },
  "cpu": {
    "max_cpu_percent": 80,
    "regression_percentage": 30
  }
}
EOF
    fi
}

# Run performance test and capture metrics
run_performance_test() {
    local test_type="$1"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local output_file="$RESULTS_DIR/${test_type}_${timestamp}.json"
    
    print_status "Running $test_type performance test..."
    
    case "$test_type" in
        "api")
            API_URL="$API_URL" k6 run --quiet --out json="$output_file" ./performance/k6/api-load-test.js
            ;;
        "frontend")
            WEB_URL="$WEB_URL" k6 run --quiet --out json="$output_file" ./performance/k6/frontend-load-test.js
            ;;
        "spike")
            API_URL="$API_URL" WEB_URL="$WEB_URL" k6 run --quiet --out json="$output_file" ./performance/k6/spike-test.js
            ;;
        *)
            print_error "Unknown test type: $test_type"
            return 1
            ;;
    esac
    
    echo "$output_file"
}

# Extract metrics from k6 JSON output
extract_metrics() {
    local result_file="$1"
    
    if [ ! -f "$result_file" ] || ! command -v jq &> /dev/null; then
        print_error "Result file not found or jq not available"
        return 1
    fi
    
    # Extract key metrics using jq
    local p95_response_time=$(jq -r '
        [.[] | select(.type=="Point" and .metric=="http_req_duration" and .data.tags.expected_response=="true")] 
        | map(.data.value) 
        | sort 
        | .[length * 0.95 | floor]
    ' "$result_file")
    
    local p99_response_time=$(jq -r '
        [.[] | select(.type=="Point" and .metric=="http_req_duration" and .data.tags.expected_response=="true")] 
        | map(.data.value) 
        | sort 
        | .[length * 0.99 | floor]
    ' "$result_file")
    
    local avg_response_time=$(jq -r '
        [.[] | select(.type=="Point" and .metric=="http_req_duration" and .data.tags.expected_response=="true")] 
        | map(.data.value) 
        | add / length
    ' "$result_file")
    
    local error_rate=$(jq -r '
        ([.[] | select(.type=="Point" and .metric=="http_req_failed")] | map(.data.value) | add / length) * 100
    ' "$result_file" 2>/dev/null || echo "0")
    
    local total_requests=$(jq -r '
        [.[] | select(.type=="Point" and .metric=="http_reqs")] | length
    ' "$result_file")
    
    local throughput=$(jq -r '
        [.[] | select(.type=="Point" and .metric=="http_reqs")] 
        | map(.data.value) 
        | add
    ' "$result_file" 2>/dev/null || echo "0")
    
    # Create metrics JSON
    cat << EOF
{
  "timestamp": "$(date -Iseconds)",
  "test_file": "$result_file",
  "metrics": {
    "response_time": {
      "avg_ms": $avg_response_time,
      "p95_ms": $p95_response_time,
      "p99_ms": $p99_response_time
    },
    "error_rate": {
      "percentage": $error_rate
    },
    "throughput": {
      "total_requests": $total_requests,
      "requests_per_second": $throughput
    }
  }
}
EOF
}

# Compare current metrics with baseline
compare_with_baseline() {
    local current_metrics="$1"
    local test_type="$2"
    local baseline_file="$BASELINE_DIR/${test_type}_baseline.json"
    
    if [ ! -f "$baseline_file" ]; then
        print_warning "No baseline found for $test_type. Creating baseline..."
        echo "$current_metrics" > "$baseline_file"
        return 0
    fi
    
    print_status "Comparing with baseline for $test_type..."
    
    # Load thresholds
    local response_time_threshold=$(jq -r '.response_time.regression_percentage' "$THRESHOLDS_FILE")
    local error_rate_threshold=$(jq -r '.error_rate.regression_threshold_percent' "$THRESHOLDS_FILE")
    local throughput_threshold=$(jq -r '.throughput.regression_percentage' "$THRESHOLDS_FILE")
    
    # Extract baseline metrics
    local baseline_p95=$(jq -r '.metrics.response_time.p95_ms' "$baseline_file")
    local baseline_p99=$(jq -r '.metrics.response_time.p99_ms' "$baseline_file")
    local baseline_error_rate=$(jq -r '.metrics.error_rate.percentage' "$baseline_file")
    local baseline_throughput=$(jq -r '.metrics.throughput.requests_per_second' "$baseline_file")
    
    # Extract current metrics
    local current_p95=$(echo "$current_metrics" | jq -r '.metrics.response_time.p95_ms')
    local current_p99=$(echo "$current_metrics" | jq -r '.metrics.response_time.p99_ms')
    local current_error_rate=$(echo "$current_metrics" | jq -r '.metrics.error_rate.percentage')
    local current_throughput=$(echo "$current_metrics" | jq -r '.metrics.throughput.requests_per_second')
    
    # Calculate changes
    local p95_change=$(echo "scale=2; ($current_p95 - $baseline_p95) / $baseline_p95 * 100" | bc -l 2>/dev/null || echo "0")
    local p99_change=$(echo "scale=2; ($current_p99 - $baseline_p99) / $baseline_p99 * 100" | bc -l 2>/dev/null || echo "0")
    local error_rate_change=$(echo "scale=2; $current_error_rate - $baseline_error_rate" | bc -l 2>/dev/null || echo "0")
    local throughput_change=$(echo "scale=2; ($current_throughput - $baseline_throughput) / $baseline_throughput * 100" | bc -l 2>/dev/null || echo "0")
    
    # Initialize regression flags
    local has_regression=false
    local regression_details=""
    
    # Check for regressions
    if (( $(echo "$p95_change > $response_time_threshold" | bc -l) )); then
        print_regression "P95 response time increased by ${p95_change}% (threshold: ${response_time_threshold}%)"
        regression_details="$regression_details\n- P95 response time: +${p95_change}%"
        has_regression=true
    elif (( $(echo "$p95_change < -5" | bc -l) )); then
        print_improvement "P95 response time improved by ${p95_change}%"
    fi
    
    if (( $(echo "$p99_change > $response_time_threshold" | bc -l) )); then
        print_regression "P99 response time increased by ${p99_change}% (threshold: ${response_time_threshold}%)"
        regression_details="$regression_details\n- P99 response time: +${p99_change}%"
        has_regression=true
    elif (( $(echo "$p99_change < -5" | bc -l) )); then
        print_improvement "P99 response time improved by ${p99_change}%"
    fi
    
    if (( $(echo "$error_rate_change > $error_rate_threshold" | bc -l) )); then
        print_regression "Error rate increased by ${error_rate_change}% (threshold: ${error_rate_threshold}%)"
        regression_details="$regression_details\n- Error rate: +${error_rate_change}%"
        has_regression=true
    elif (( $(echo "$error_rate_change < -1" | bc -l) )); then
        print_improvement "Error rate improved by ${error_rate_change}%"
    fi
    
    if (( $(echo "$throughput_change < -$throughput_threshold" | bc -l) )); then
        print_regression "Throughput decreased by ${throughput_change}% (threshold: ${throughput_threshold}%)"
        regression_details="$regression_details\n- Throughput: ${throughput_change}%"
        has_regression=true
    elif (( $(echo "$throughput_change > 5" | bc -l) )); then
        print_improvement "Throughput improved by ${throughput_change}%"
    fi
    
    # Generate comparison report
    local report_file="$REPORTS_DIR/regression_report_${test_type}_$(date +%Y%m%d_%H%M%S).json"
    cat > "$report_file" << EOF
{
  "test_type": "$test_type",
  "timestamp": "$(date -Iseconds)",
  "has_regression": $has_regression,
  "baseline": {
    "p95_ms": $baseline_p95,
    "p99_ms": $baseline_p99,
    "error_rate": $baseline_error_rate,
    "throughput": $baseline_throughput
  },
  "current": {
    "p95_ms": $current_p95,
    "p99_ms": $current_p99,
    "error_rate": $current_error_rate,
    "throughput": $current_throughput
  },
  "changes": {
    "p95_change_percent": $p95_change,
    "p99_change_percent": $p99_change,
    "error_rate_change": $error_rate_change,
    "throughput_change_percent": $throughput_change
  },
  "thresholds": {
    "response_time_threshold": $response_time_threshold,
    "error_rate_threshold": $error_rate_threshold,
    "throughput_threshold": $throughput_threshold
  }
}
EOF
    
    print_status "Regression report saved to: $report_file"
    
    if [ "$has_regression" = true ]; then
        echo -e "${RED}PERFORMANCE REGRESSION DETECTED!${NC}"
        echo -e "$regression_details"
        return 1
    else
        print_status "No performance regressions detected"
        return 0
    fi
}

# Update baseline with current metrics
update_baseline() {
    local current_metrics="$1"
    local test_type="$2"
    local baseline_file="$BASELINE_DIR/${test_type}_baseline.json"
    
    print_status "Updating baseline for $test_type..."
    echo "$current_metrics" > "$baseline_file"
    print_status "Baseline updated successfully"
}

# Generate comprehensive report
generate_summary_report() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local summary_file="$REPORTS_DIR/performance_summary_$timestamp.md"
    
    print_status "Generating performance summary report..."
    
    cat > "$summary_file" << EOF
# Performance Test Summary Report

Generated: $(date)

## Test Overview

This report summarizes the performance testing results and regression analysis.

## Test Results

EOF

    # Add individual test results
    for report in "$REPORTS_DIR"/regression_report_*_$(date +%Y%m%d)*.json; do
        if [ -f "$report" ]; then
            local test_type=$(jq -r '.test_type' "$report")
            local has_regression=$(jq -r '.has_regression' "$report")
            
            echo "### $test_type Test" >> "$summary_file"
            echo "" >> "$summary_file"
            
            if [ "$has_regression" = "true" ]; then
                echo "🔴 **REGRESSION DETECTED**" >> "$summary_file"
            else
                echo "✅ **NO REGRESSIONS**" >> "$summary_file"
            fi
            
            echo "" >> "$summary_file"
            echo "**Metrics:**" >> "$summary_file"
            
            # Extract and format metrics
            local p95_current=$(jq -r '.current.p95_ms' "$report")
            local p95_change=$(jq -r '.changes.p95_change_percent' "$report")
            local error_rate=$(jq -r '.current.error_rate' "$report")
            local throughput=$(jq -r '.current.throughput' "$report")
            
            echo "- P95 Response Time: ${p95_current}ms (${p95_change}% change)" >> "$summary_file"
            echo "- Error Rate: ${error_rate}%" >> "$summary_file"
            echo "- Throughput: ${throughput} req/s" >> "$summary_file"
            echo "" >> "$summary_file"
        fi
    done
    
    # Add recommendations
    cat >> "$summary_file" << EOF

## Recommendations

### If Regressions Detected:
1. Review recent code changes that might impact performance
2. Check database query performance and indexes
3. Monitor resource usage (CPU, memory, disk I/O)
4. Verify caching configurations are optimal
5. Consider rolling back recent changes if regression is severe

### Performance Optimization:
1. Implement or optimize caching strategies
2. Review and optimize database queries
3. Consider CDN implementation for static assets
4. Monitor and tune JVM/Node.js settings
5. Implement connection pooling where applicable

### Monitoring:
1. Set up continuous performance monitoring
2. Create alerts for performance threshold violations
3. Regular baseline updates with verified improvements
4. Implement automated regression testing in CI/CD

## Next Steps

1. Address any identified regressions immediately
2. Update performance baselines after verified improvements
3. Schedule regular performance review meetings
4. Consider load testing with higher user volumes

---
*This report was generated automatically by the performance regression detection system.*
EOF

    print_status "Summary report generated: $summary_file"
}

# Main execution
main() {
    print_header
    
    local test_types=("api" "frontend" "spike")
    local update_baselines=false
    local regression_detected=false
    
    # Parse command line arguments
    for arg in "$@"; do
        case $arg in
            --update-baseline)
                update_baselines=true
                shift
                ;;
            --test=*)
                test_types=("${arg#*=}")
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [options]"
                echo "Options:"
                echo "  --update-baseline    Update baselines with current results"
                echo "  --test=TYPE          Run specific test type (api|frontend|spike)"
                echo "  --help               Show this help"
                exit 0
                ;;
        esac
    done
    
    create_default_thresholds
    
    # Check dependencies
    if ! command -v k6 &> /dev/null; then
        print_error "k6 is required for performance testing"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        print_error "jq is required for JSON processing"
        exit 1
    fi
    
    if ! command -v bc &> /dev/null; then
        print_error "bc is required for calculations"
        exit 1
    fi
    
    # Run tests and detect regressions
    for test_type in "${test_types[@]}"; do
        print_status "Processing $test_type tests..."
        
        # Run performance test
        local result_file=$(run_performance_test "$test_type")
        
        if [ $? -eq 0 ] && [ -f "$result_file" ]; then
            # Extract metrics
            local current_metrics=$(extract_metrics "$result_file")
            
            if [ "$update_baselines" = true ]; then
                update_baseline "$current_metrics" "$test_type"
            else
                # Compare with baseline
                if ! compare_with_baseline "$current_metrics" "$test_type"; then
                    regression_detected=true
                fi
            fi
        else
            print_error "Failed to run $test_type test"
            regression_detected=true
        fi
    done
    
    # Generate summary report
    generate_summary_report
    
    if [ "$regression_detected" = true ]; then
        print_error "Performance regressions detected! Check the reports for details."
        exit 1
    else
        print_status "All performance tests passed without regressions"
        exit 0
    fi
}

# Run main function
main "$@"