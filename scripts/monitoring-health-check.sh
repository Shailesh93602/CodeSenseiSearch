#!/bin/bash

# CodeSenseiSearch Monitoring Health Check Script
# This script performs comprehensive health checks for all monitoring components

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
COMPOSE_FILE="$PROJECT_DIR/docker-compose.prod-enhanced.yml"
LOG_FILE="/tmp/monitoring-health-check.log"

# Service endpoints
PROMETHEUS_URL="http://localhost:9090"
GRAFANA_URL="http://localhost:3001"
ALERTMANAGER_URL="http://localhost:9093"
NODE_EXPORTER_URL="http://localhost:9100"

# Logging function
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

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

# Check if service is running
check_service_health() {
    local service_name=$1
    local url=$2
    local expected_status=${3:-200}
    
    if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "$expected_status"; then
        print_status "SUCCESS" "$service_name is healthy"
        return 0
    else
        print_status "ERROR" "$service_name is not responding correctly"
        return 1
    fi
}

# Check Docker service status
check_docker_service() {
    local service_name=$1
    
    if docker-compose -f "$COMPOSE_FILE" ps "$service_name" | grep -q "Up"; then
        print_status "SUCCESS" "Docker service $service_name is running"
        return 0
    else
        print_status "ERROR" "Docker service $service_name is not running"
        return 1
    fi
}

# Check Prometheus targets
check_prometheus_targets() {
    print_status "INFO" "Checking Prometheus targets..."
    
    local targets_response
    targets_response=$(curl -s "$PROMETHEUS_URL/api/v1/targets" || echo '{"status":"error"}')
    
    if echo "$targets_response" | jq -r '.status' | grep -q "success"; then
        local active_targets
        active_targets=$(echo "$targets_response" | jq '.data.activeTargets | length')
        local healthy_targets
        healthy_targets=$(echo "$targets_response" | jq '.data.activeTargets | map(select(.health == "up")) | length')
        
        print_status "INFO" "Active targets: $active_targets, Healthy targets: $healthy_targets"
        
        if [ "$healthy_targets" -eq "$active_targets" ]; then
            print_status "SUCCESS" "All Prometheus targets are healthy"
            return 0
        else
            print_status "WARNING" "Some Prometheus targets are unhealthy"
            return 1
        fi
    else
        print_status "ERROR" "Failed to fetch Prometheus targets"
        return 1
    fi
}

# Check Alertmanager alerts
check_alertmanager_alerts() {
    print_status "INFO" "Checking Alertmanager alerts..."
    
    local alerts_response
    alerts_response=$(curl -s "$ALERTMANAGER_URL/api/v1/alerts" || echo '{"status":"error"}')
    
    if echo "$alerts_response" | jq -r '.status' | grep -q "success"; then
        local active_alerts
        active_alerts=$(echo "$alerts_response" | jq '.data | length')
        
        if [ "$active_alerts" -eq 0 ]; then
            print_status "SUCCESS" "No active alerts"
        else
            print_status "WARNING" "$active_alerts active alerts found"
            # Show alert details
            echo "$alerts_response" | jq -r '.data[] | "  - \(.labels.alertname): \(.annotations.summary)"'
        fi
        return 0
    else
        print_status "ERROR" "Failed to fetch Alertmanager alerts"
        return 1
    fi
}

# Check Grafana datasources
check_grafana_datasources() {
    print_status "INFO" "Checking Grafana datasources..."
    
    # Basic auth for Grafana (admin:admin by default)
    local auth="admin:admin"
    local datasources_response
    datasources_response=$(curl -s -u "$auth" "$GRAFANA_URL/api/datasources" || echo '[]')
    
    if echo "$datasources_response" | jq -e '. | length > 0' > /dev/null; then
        local datasource_count
        datasource_count=$(echo "$datasources_response" | jq '. | length')
        print_status "SUCCESS" "$datasource_count Grafana datasources configured"
        
        # Check each datasource health
        echo "$datasources_response" | jq -r '.[] | "\(.name): \(.url)"' | while read -r line; do
            print_status "INFO" "  - $line"
        done
        return 0
    else
        print_status "ERROR" "No Grafana datasources found or failed to connect"
        return 1
    fi
}

# Check disk space for monitoring data
check_disk_space() {
    print_status "INFO" "Checking disk space..."
    
    local prometheus_data_usage
    prometheus_data_usage=$(du -sh /var/lib/docker/volumes/*prometheus* 2>/dev/null | awk '{print $1}' || echo "Unknown")
    
    local grafana_data_usage
    grafana_data_usage=$(du -sh /var/lib/docker/volumes/*grafana* 2>/dev/null | awk '{print $1}' || echo "Unknown")
    
    print_status "INFO" "Prometheus data usage: $prometheus_data_usage"
    print_status "INFO" "Grafana data usage: $grafana_data_usage"
    
    # Check available disk space
    local available_space
    available_space=$(df -h / | awk 'NR==2 {print $4}')
    print_status "INFO" "Available disk space: $available_space"
    
    # Warn if less than 5GB available
    local available_gb
    available_gb=$(df / | awk 'NR==2 {print int($4/1024/1024)}')
    if [ "$available_gb" -lt 5 ]; then
        print_status "WARNING" "Low disk space: ${available_gb}GB remaining"
        return 1
    else
        print_status "SUCCESS" "Sufficient disk space available"
        return 0
    fi
}

# Check system resources
check_system_resources() {
    print_status "INFO" "Checking system resources..."
    
    # CPU usage
    local cpu_usage
    cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    print_status "INFO" "CPU usage: ${cpu_usage}%"
    
    # Memory usage
    local memory_usage
    memory_usage=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
    print_status "INFO" "Memory usage: ${memory_usage}%"
    
    # Load average
    local load_avg
    load_avg=$(uptime | awk -F'load average:' '{print $2}')
    print_status "INFO" "Load average:$load_avg"
    
    # Check if resources are within acceptable limits
    if (( $(echo "$cpu_usage > 90" | bc -l) )); then
        print_status "WARNING" "High CPU usage detected"
        return 1
    fi
    
    if (( $(echo "$memory_usage > 90" | bc -l) )); then
        print_status "WARNING" "High memory usage detected"
        return 1
    fi
    
    print_status "SUCCESS" "System resources are within normal limits"
    return 0
}

# Generate monitoring report
generate_report() {
    local report_file="/tmp/monitoring-report-$(date +%Y%m%d-%H%M%S).json"
    
    print_status "INFO" "Generating monitoring report..."
    
    cat > "$report_file" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "monitoring_health": {
    "services": {
      "prometheus": $(check_service_health "Prometheus" "$PROMETHEUS_URL" && echo "true" || echo "false"),
      "grafana": $(check_service_health "Grafana" "$GRAFANA_URL" && echo "true" || echo "false"),
      "alertmanager": $(check_service_health "Alertmanager" "$ALERTMANAGER_URL" && echo "true" || echo "false"),
      "node_exporter": $(check_service_health "Node Exporter" "$NODE_EXPORTER_URL/metrics" && echo "true" || echo "false")
    },
    "targets": {
      "prometheus_targets_healthy": $(check_prometheus_targets >/dev/null 2>&1 && echo "true" || echo "false")
    },
    "alerts": {
      "active_count": $(curl -s "$ALERTMANAGER_URL/api/v1/alerts" | jq '.data | length' 2>/dev/null || echo "null")
    },
    "resources": {
      "cpu_usage": "$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)",
      "memory_usage": "$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')",
      "disk_available": "$(df -h / | awk 'NR==2 {print $4}')"
    }
  }
}
EOF
    
    print_status "SUCCESS" "Monitoring report generated: $report_file"
    echo "$report_file"
}

# Main health check function
main() {
    local exit_code=0
    
    print_status "INFO" "Starting CodeSenseiSearch monitoring health check..."
    log "INFO" "Health check started"
    
    # Clear previous log
    > "$LOG_FILE"
    
    # Check Docker services
    print_status "INFO" "=== Docker Services ==="
    check_docker_service "prometheus" || exit_code=1
    check_docker_service "grafana" || exit_code=1
    check_docker_service "alertmanager" || exit_code=1
    check_docker_service "node-exporter" || exit_code=1
    
    # Wait for services to be ready
    sleep 5
    
    # Check service endpoints
    print_status "INFO" "=== Service Health ==="
    check_service_health "Prometheus" "$PROMETHEUS_URL" || exit_code=1
    check_service_health "Grafana" "$GRAFANA_URL" || exit_code=1
    check_service_health "Alertmanager" "$ALERTMANAGER_URL" || exit_code=1
    check_service_health "Node Exporter" "$NODE_EXPORTER_URL/metrics" || exit_code=1
    
    # Check Prometheus configuration
    print_status "INFO" "=== Prometheus Configuration ==="
    check_prometheus_targets || exit_code=1
    
    # Check active alerts
    print_status "INFO" "=== Alert Status ==="
    check_alertmanager_alerts || exit_code=1
    
    # Check Grafana setup
    print_status "INFO" "=== Grafana Configuration ==="
    check_grafana_datasources || exit_code=1
    
    # Check system resources
    print_status "INFO" "=== System Resources ==="
    check_system_resources || exit_code=1
    check_disk_space || exit_code=1
    
    # Generate report
    print_status "INFO" "=== Report Generation ==="
    local report_file
    report_file=$(generate_report)
    
    # Summary
    print_status "INFO" "=== Health Check Summary ==="
    if [ $exit_code -eq 0 ]; then
        print_status "SUCCESS" "All monitoring components are healthy!"
        log "INFO" "Health check completed successfully"
    else
        print_status "ERROR" "Some monitoring components need attention"
        log "ERROR" "Health check completed with errors"
    fi
    
    print_status "INFO" "Full log available at: $LOG_FILE"
    print_status "INFO" "Report available at: $report_file"
    
    exit $exit_code
}

# Run the health check
main "$@"