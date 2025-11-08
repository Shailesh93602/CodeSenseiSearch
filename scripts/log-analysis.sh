#!/bin/bash

# CodeSenseiSearch Log Analysis and Processing Script
# This script provides log analysis, pattern detection, and reporting capabilities

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="/app/logs"
ANALYSIS_DIR="/tmp/log-analysis"
LOKI_URL="http://localhost:3100"

# Print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "SUCCESS")
            echo -e "${GREEN}✅ $message${NC}"
            ;;
        "ERROR")
            echo -e "${RED}❌ $message${NC}"
            ;;
        "WARNING")
            echo -e "${YELLOW}⚠️  $message${NC}"
            ;;
        "INFO")
            echo -e "${BLUE}ℹ️  $message${NC}"
            ;;
    esac
}

# Create analysis directory
create_analysis_dir() {
    mkdir -p "$ANALYSIS_DIR"
    print_status "INFO" "Analysis directory created: $ANALYSIS_DIR"
}

# Query Loki for logs
query_loki() {
    local query=$1
    local start=${2:-"1h"}
    local limit=${3:-1000}
    
    local start_time=$(date -d "$start ago" -u +%Y-%m-%dT%H:%M:%SZ)
    local end_time=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    
    curl -s -G "$LOKI_URL/loki/api/v1/query_range" \
        --data-urlencode "query=$query" \
        --data-urlencode "start=$start_time" \
        --data-urlencode "end=$end_time" \
        --data-urlencode "limit=$limit"
}

# Analyze error patterns
analyze_error_patterns() {
    print_status "INFO" "Analyzing error patterns..."
    
    local error_file="$ANALYSIS_DIR/error_analysis.json"
    
    # Query for error logs
    query_loki '{service=~"codesenseisearch-.*",level="error"}' "24h" 5000 > "$error_file"
    
    # Extract and analyze error messages
    if [ -f "$error_file" ]; then
        local error_count
        error_count=$(jq -r '.data.result[].values[]?[1]?' "$error_file" 2>/dev/null | wc -l || echo "0")
        
        print_status "INFO" "Total errors in last 24h: $error_count"
        
        # Top error messages
        print_status "INFO" "Top 10 error messages:"
        jq -r '.data.result[].values[]?[1]?' "$error_file" 2>/dev/null | \
        jq -r 'try .error.message // .message // .' | \
        sort | uniq -c | sort -nr | head -10 | \
        while read -r count message; do
            echo "  $count: $message"
        done
        
        # Error distribution by service
        print_status "INFO" "Error distribution by service:"
        jq -r '.data.result[].stream.service?' "$error_file" 2>/dev/null | \
        sort | uniq -c | sort -nr | \
        while read -r count service; do
            echo "  $service: $count errors"
        done
    else
        print_status "WARNING" "No error data available"
    fi
}

# Analyze performance issues
analyze_performance() {
    print_status "INFO" "Analyzing performance issues..."
    
    local perf_file="$ANALYSIS_DIR/performance_analysis.json"
    
    # Query for slow requests
    query_loki '{service=~"codesenseisearch-.*"} | json | response_time > 5000' "6h" 1000 > "$perf_file"
    
    if [ -f "$perf_file" ]; then
        local slow_requests
        slow_requests=$(jq -r '.data.result[].values[]?[1]?' "$perf_file" 2>/dev/null | wc -l || echo "0")
        
        print_status "INFO" "Slow requests (>5s) in last 6h: $slow_requests"
        
        # Average response times by service
        print_status "INFO" "Average response times by service:"
        jq -r '.data.result[] | select(.values) | .stream.service as $service | .values[]?[1] | try (fromjson | select(.response_time) | "\($service):\(.response_time)") // empty' "$perf_file" 2>/dev/null | \
        awk -F: '{service[$1] += $2; count[$1]++} END {for (s in service) printf "  %s: %.0fms\n", s, service[s]/count[s]}' | \
        sort -k2 -nr
    else
        print_status "WARNING" "No performance data available"
    fi
}

# Analyze security events
analyze_security() {
    print_status "INFO" "Analyzing security events..."
    
    local security_file="$ANALYSIS_DIR/security_analysis.json"
    
    # Query for security events
    query_loki '{service=~"codesenseisearch-.*",category="security"}' "24h" 2000 > "$security_file"
    
    if [ -f "$security_file" ]; then
        local security_events
        security_events=$(jq -r '.data.result[].values[]?[1]?' "$security_file" 2>/dev/null | wc -l || echo "0")
        
        print_status "INFO" "Security events in last 24h: $security_events"
        
        # Failed authentication attempts
        local failed_auth
        failed_auth=$(jq -r '.data.result[].values[]?[1]?' "$security_file" 2>/dev/null | \
        jq -r 'try select(.event_type == "login" and .success == false) | .' | \
        wc -l || echo "0")
        
        print_status "INFO" "Failed authentication attempts: $failed_auth"
        
        # Top suspicious IPs
        print_status "INFO" "Top suspicious IP addresses:"
        jq -r '.data.result[].values[]?[1]?' "$security_file" 2>/dev/null | \
        jq -r 'try select(.success == false) | .ip_address // empty' | \
        sort | uniq -c | sort -nr | head -10 | \
        while read -r count ip; do
            echo "  $ip: $count failed attempts"
        done
    else
        print_status "WARNING" "No security data available"
    fi
}

# Analyze search patterns
analyze_search_patterns() {
    print_status "INFO" "Analyzing search patterns..."
    
    local search_file="$ANALYSIS_DIR/search_analysis.json"
    
    # Query for search logs
    query_loki '{service="search-engine"}' "12h" 3000 > "$search_file"
    
    if [ -f "$search_file" ]; then
        local total_searches
        total_searches=$(jq -r '.data.result[].values[]?[1]?' "$search_file" 2>/dev/null | wc -l || echo "0")
        
        print_status "INFO" "Total searches in last 12h: $total_searches"
        
        # Search success rate
        local successful_searches
        successful_searches=$(jq -r '.data.result[].values[]?[1]?' "$search_file" 2>/dev/null | \
        jq -r 'try select(.results_count > 0) | .' | \
        wc -l || echo "0")
        
        if [ "$total_searches" -gt 0 ]; then
            local success_rate
            success_rate=$(echo "scale=2; $successful_searches * 100 / $total_searches" | bc)
            print_status "INFO" "Search success rate: ${success_rate}%"
        fi
        
        # Top search queries
        print_status "INFO" "Top search queries:"
        jq -r '.data.result[].values[]?[1]?' "$search_file" 2>/dev/null | \
        jq -r 'try .query // empty' | \
        sort | uniq -c | sort -nr | head -10 | \
        while read -r count query; do
            echo "  \"$query\": $count searches"
        done
        
        # Average search response time
        local avg_response_time
        avg_response_time=$(jq -r '.data.result[].values[]?[1]?' "$search_file" 2>/dev/null | \
        jq -r 'try .response_time // empty' | \
        awk '{sum+=$1; count++} END {if(count>0) printf "%.0f", sum/count; else print "0"}')
        
        print_status "INFO" "Average search response time: ${avg_response_time}ms"
    else
        print_status "WARNING" "No search data available"
    fi
}

# Detect anomalies
detect_anomalies() {
    print_status "INFO" "Detecting anomalies..."
    
    local anomaly_file="$ANALYSIS_DIR/anomalies.txt"
    
    # Check for error spikes
    local current_errors
    current_errors=$(query_loki '{service=~"codesenseisearch-.*",level="error"}' "5m" 100 | \
    jq -r '.data.result[].values[]?[1]?' 2>/dev/null | wc -l || echo "0")
    
    local baseline_errors
    baseline_errors=$(query_loki '{service=~"codesenseisearch-.*",level="error"}' "1h" 1000 | \
    jq -r '.data.result[].values[]?[1]?' 2>/dev/null | wc -l || echo "0")
    
    # Calculate error rate (errors per minute)
    local current_error_rate
    current_error_rate=$(echo "scale=2; $current_errors / 5" | bc)
    
    local baseline_error_rate
    baseline_error_rate=$(echo "scale=2; $baseline_errors / 60" | bc)
    
    echo "Anomaly Detection Report - $(date)" > "$anomaly_file"
    echo "=================================" >> "$anomaly_file"
    
    # Error rate anomaly
    if (( $(echo "$current_error_rate > $baseline_error_rate * 3" | bc -l) )); then
        echo "🚨 ERROR SPIKE DETECTED: Current rate: $current_error_rate/min, Baseline: $baseline_error_rate/min" | tee -a "$anomaly_file"
        print_status "WARNING" "Error rate anomaly detected"
    fi
    
    # Check for unusual response times
    local current_avg_response
    current_avg_response=$(query_loki '{service=~"codesenseisearch-.*"} | json | response_time > 0' "5m" 100 | \
    jq -r '.data.result[].values[]?[1]?' 2>/dev/null | \
    jq -r 'try .response_time // empty' | \
    awk '{sum+=$1; count++} END {if(count>0) printf "%.0f", sum/count; else print "0"}')
    
    if [ "$current_avg_response" -gt 2000 ]; then
        echo "🐌 PERFORMANCE DEGRADATION: Average response time: ${current_avg_response}ms" | tee -a "$anomaly_file"
        print_status "WARNING" "Performance anomaly detected"
    fi
    
    # Check for unusual traffic patterns
    local current_requests
    current_requests=$(query_loki '{service=~"codesenseisearch-.*"}' "5m" 1000 | \
    jq -r '.data.result[].values[]?[1]?' 2>/dev/null | wc -l || echo "0")
    
    local baseline_requests
    baseline_requests=$(query_loki '{service=~"codesenseisearch-.*"}' "1h" 10000 | \
    jq -r '.data.result[].values[]?[1]?' 2>/dev/null | wc -l || echo "0")
    
    local current_request_rate
    current_request_rate=$(echo "scale=2; $current_requests / 5" | bc)
    
    local baseline_request_rate
    baseline_request_rate=$(echo "scale=2; $baseline_requests / 60" | bc)
    
    if (( $(echo "$current_request_rate > $baseline_request_rate * 5" | bc -l) )); then
        echo "📈 TRAFFIC SPIKE: Current rate: $current_request_rate/min, Baseline: $baseline_request_rate/min" | tee -a "$anomaly_file"
        print_status "WARNING" "Traffic anomaly detected"
    fi
    
    print_status "SUCCESS" "Anomaly detection completed. Report saved to: $anomaly_file"
}

# Generate summary report
generate_summary_report() {
    print_status "INFO" "Generating summary report..."
    
    local report_file="$ANALYSIS_DIR/summary_report.md"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S UTC')
    
    cat > "$report_file" <<EOF
# CodeSenseiSearch Log Analysis Report

**Generated**: $timestamp

## Overview

This report provides a comprehensive analysis of log data from the CodeSenseiSearch application.

## Key Metrics

### Error Analysis
- **Time Period**: Last 24 hours
- **Total Errors**: $(jq -r '.data.result[].values[]?[1]?' "$ANALYSIS_DIR/error_analysis.json" 2>/dev/null | wc -l || echo "N/A")
- **Most Common Error**: $(jq -r '.data.result[].values[]?[1]?' "$ANALYSIS_DIR/error_analysis.json" 2>/dev/null | jq -r 'try .error.message // .message // .' | sort | uniq -c | sort -nr | head -1 | cut -d' ' -f2- || echo "N/A")

### Performance Analysis
- **Time Period**: Last 6 hours
- **Slow Requests (>5s)**: $(jq -r '.data.result[].values[]?[1]?' "$ANALYSIS_DIR/performance_analysis.json" 2>/dev/null | wc -l || echo "N/A")

### Security Analysis
- **Time Period**: Last 24 hours
- **Security Events**: $(jq -r '.data.result[].values[]?[1]?' "$ANALYSIS_DIR/security_analysis.json" 2>/dev/null | wc -l || echo "N/A")
- **Failed Authentication Attempts**: $(jq -r '.data.result[].values[]?[1]?' "$ANALYSIS_DIR/security_analysis.json" 2>/dev/null | jq -r 'try select(.event_type == "login" and .success == false) | .' | wc -l || echo "N/A")

### Search Analysis
- **Time Period**: Last 12 hours
- **Total Searches**: $(jq -r '.data.result[].values[]?[1]?' "$ANALYSIS_DIR/search_analysis.json" 2>/dev/null | wc -l || echo "N/A")

## Recommendations

### High Priority
EOF

    # Add recommendations based on analysis
    if [ -f "$ANALYSIS_DIR/anomalies.txt" ] && [ -s "$ANALYSIS_DIR/anomalies.txt" ]; then
        echo "- **Investigate Anomalies**: Several anomalies detected. See anomalies.txt for details." >> "$report_file"
    fi
    
    local error_count
    error_count=$(jq -r '.data.result[].values[]?[1]?' "$ANALYSIS_DIR/error_analysis.json" 2>/dev/null | wc -l || echo "0")
    
    if [ "$error_count" -gt 100 ]; then
        echo "- **Review Error Patterns**: High error count ($error_count) requires investigation." >> "$report_file"
    fi
    
    cat >> "$report_file" <<EOF

### Medium Priority
- Review log retention policies
- Optimize log parsing and indexing
- Update alerting thresholds based on current patterns

### Low Priority
- Enhance log structured formatting
- Implement log sampling for high-volume events
- Add more detailed performance metrics

## Files Generated
- \`error_analysis.json\`: Error pattern analysis
- \`performance_analysis.json\`: Performance metrics
- \`security_analysis.json\`: Security event analysis
- \`search_analysis.json\`: Search pattern analysis
- \`anomalies.txt\`: Anomaly detection results

## Next Steps
1. Review high-priority recommendations
2. Investigate any detected anomalies
3. Update monitoring and alerting based on findings
4. Schedule regular log analysis reviews

---
*Report generated by CodeSenseiSearch Log Analysis Tool*
EOF

    print_status "SUCCESS" "Summary report generated: $report_file"
}

# Cleanup old analysis files
cleanup_old_analysis() {
    print_status "INFO" "Cleaning up old analysis files..."
    
    # Remove analysis files older than 7 days
    find "$ANALYSIS_DIR" -name "*.json" -mtime +7 -delete 2>/dev/null || true
    find "$ANALYSIS_DIR" -name "*.txt" -mtime +7 -delete 2>/dev/null || true
    find "$ANALYSIS_DIR" -name "*.md" -mtime +7 -delete 2>/dev/null || true
    
    print_status "SUCCESS" "Cleanup completed"
}

# Main analysis function
main() {
    local command=${1:-"full"}
    
    print_status "INFO" "Starting log analysis: $command"
    
    create_analysis_dir
    
    case $command in
        "errors")
            analyze_error_patterns
            ;;
        "performance")
            analyze_performance
            ;;
        "security")
            analyze_security
            ;;
        "search")
            analyze_search_patterns
            ;;
        "anomalies")
            detect_anomalies
            ;;
        "report")
            generate_summary_report
            ;;
        "cleanup")
            cleanup_old_analysis
            ;;
        "full")
            analyze_error_patterns
            analyze_performance
            analyze_security
            analyze_search_patterns
            detect_anomalies
            generate_summary_report
            ;;
        "help")
            echo "Usage: $0 [command]"
            echo "Commands:"
            echo "  full        - Run complete analysis (default)"
            echo "  errors      - Analyze error patterns"
            echo "  performance - Analyze performance issues"
            echo "  security    - Analyze security events"
            echo "  search      - Analyze search patterns"
            echo "  anomalies   - Detect anomalies"
            echo "  report      - Generate summary report"
            echo "  cleanup     - Clean up old analysis files"
            echo "  help        - Show this help message"
            ;;
        *)
            print_status "ERROR" "Unknown command: $command"
            print_status "INFO" "Run '$0 help' for usage information"
            exit 1
            ;;
    esac
    
    print_status "SUCCESS" "Log analysis completed!"
    print_status "INFO" "Results available in: $ANALYSIS_DIR"
}

# Check dependencies
check_dependencies() {
    local deps=("curl" "jq" "bc")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            print_status "ERROR" "$dep is required but not installed"
            exit 1
        fi
    done
}

# Run the analysis
check_dependencies
main "$@"