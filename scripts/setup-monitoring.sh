#!/bin/bash

# CodeSenseiSearch Monitoring Setup Script
# This script sets up and configures the complete monitoring stack

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

# Default credentials (should be changed in production)
GRAFANA_ADMIN_USER=${GRAFANA_ADMIN_USER:-admin}
GRAFANA_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:-admin}

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

# Check prerequisites
check_prerequisites() {
    print_status "INFO" "Checking prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_status "ERROR" "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        print_status "ERROR" "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check if jq is installed
    if ! command -v jq &> /dev/null; then
        print_status "WARNING" "jq is not installed. Installing jq for JSON processing..."
        if command -v brew &> /dev/null; then
            brew install jq
        elif command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y jq
        elif command -v yum &> /dev/null; then
            sudo yum install -y jq
        else
            print_status "ERROR" "Please install jq manually"
            exit 1
        fi
    fi
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        print_status "ERROR" "Docker daemon is not running. Please start Docker."
        exit 1
    fi
    
    print_status "SUCCESS" "All prerequisites are met"
}

# Create necessary directories
create_directories() {
    print_status "INFO" "Creating necessary directories..."
    
    local dirs=(
        "$PROJECT_DIR/docker/prometheus/data"
        "$PROJECT_DIR/docker/grafana/data"
        "$PROJECT_DIR/docker/alertmanager/data"
        "$PROJECT_DIR/logs/monitoring"
    )
    
    for dir in "${dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            print_status "SUCCESS" "Created directory: $dir"
        else
            print_status "INFO" "Directory already exists: $dir"
        fi
    done
    
    # Set proper permissions
    sudo chown -R 472:472 "$PROJECT_DIR/docker/grafana/data" 2>/dev/null || true
    sudo chown -R 65534:65534 "$PROJECT_DIR/docker/prometheus/data" 2>/dev/null || true
    sudo chown -R 65534:65534 "$PROJECT_DIR/docker/alertmanager/data" 2>/dev/null || true
    
    print_status "SUCCESS" "Directories created and permissions set"
}

# Generate Prometheus configuration
generate_prometheus_config() {
    print_status "INFO" "Generating Prometheus configuration..."
    
    local config_file="$PROJECT_DIR/docker/prometheus/prometheus.yml"
    
    cat > "$config_file" <<EOF
# Prometheus configuration for CodeSenseiSearch
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'codesenseisearch'
    environment: 'production'

# Alertmanager configuration
alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

# Load alerting rules
rule_files:
  - "/etc/prometheus/rules/*.yml"

# Scrape configurations
scrape_configs:
  # Prometheus itself
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: /metrics
    scrape_interval: 5s

  # Node Exporter
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
    metrics_path: /metrics
    scrape_interval: 5s

  # Application services
  - job_name: 'codesenseisearch-api'
    static_configs:
      - targets: ['api:3001']
    metrics_path: /metrics
    scrape_interval: 15s
    scrape_timeout: 10s

  - job_name: 'codesenseisearch-web'
    static_configs:
      - targets: ['web:3000']
    metrics_path: /metrics
    scrape_interval: 15s
    scrape_timeout: 10s

  # Database metrics
  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['postgres-exporter:9187']
    metrics_path: /metrics
    scrape_interval: 15s

  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['redis-exporter:9121']
    metrics_path: /metrics
    scrape_interval: 15s

  # Nginx metrics
  - job_name: 'nginx-exporter'
    static_configs:
      - targets: ['nginx-exporter:9113']
    metrics_path: /metrics
    scrape_interval: 15s

  # Blackbox exporter for external monitoring
  - job_name: 'blackbox-http'
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets:
        - https://codesenseisearch.com
        - https://api.codesenseisearch.com
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: blackbox-exporter:9115

  # Self-monitoring
  - job_name: 'alertmanager'
    static_configs:
      - targets: ['alertmanager:9093']
    metrics_path: /metrics
    scrape_interval: 15s

  - job_name: 'grafana'
    static_configs:
      - targets: ['grafana:3000']
    metrics_path: /metrics
    scrape_interval: 15s
EOF
    
    print_status "SUCCESS" "Prometheus configuration generated"
}

# Start monitoring services
start_monitoring_services() {
    print_status "INFO" "Starting monitoring services..."
    
    # Stop any existing services
    docker-compose -f "$COMPOSE_FILE" down prometheus grafana alertmanager node-exporter 2>/dev/null || true
    
    # Start monitoring stack
    docker-compose -f "$COMPOSE_FILE" up -d prometheus grafana alertmanager node-exporter
    
    # Wait for services to be ready
    print_status "INFO" "Waiting for services to be ready..."
    sleep 30
    
    # Check if services are running
    local services=("prometheus" "grafana" "alertmanager" "node-exporter")
    for service in "${services[@]}"; do
        if docker-compose -f "$COMPOSE_FILE" ps "$service" | grep -q "Up"; then
            print_status "SUCCESS" "$service is running"
        else
            print_status "ERROR" "$service failed to start"
            docker-compose -f "$COMPOSE_FILE" logs "$service"
            exit 1
        fi
    done
    
    print_status "SUCCESS" "All monitoring services are running"
}

# Configure Grafana
configure_grafana() {
    print_status "INFO" "Configuring Grafana..."
    
    local grafana_url="http://localhost:3001"
    local max_attempts=30
    local attempt=0
    
    # Wait for Grafana to be ready
    while [ $attempt -lt $max_attempts ]; do
        if curl -s -o /dev/null -w "%{http_code}" "$grafana_url/api/health" | grep -q "200"; then
            break
        fi
        attempt=$((attempt + 1))
        print_status "INFO" "Waiting for Grafana to be ready... (attempt $attempt/$max_attempts)"
        sleep 5
    done
    
    if [ $attempt -eq $max_attempts ]; then
        print_status "ERROR" "Grafana did not become ready in time"
        exit 1
    fi
    
    # Import dashboards
    print_status "INFO" "Importing Grafana dashboards..."
    
    local dashboard_files=(
        "$PROJECT_DIR/docker/grafana/dashboards/system-overview.json"
        "$PROJECT_DIR/docker/grafana/dashboards/application-metrics.json"
        "$PROJECT_DIR/docker/grafana/dashboards/database-monitoring.json"
    )
    
    for dashboard_file in "${dashboard_files[@]}"; do
        if [ -f "$dashboard_file" ]; then
            local dashboard_name=$(basename "$dashboard_file" .json)
            print_status "INFO" "Importing dashboard: $dashboard_name"
            
            # The dashboard will be automatically imported through provisioning
            print_status "SUCCESS" "Dashboard $dashboard_name will be auto-imported"
        else
            print_status "WARNING" "Dashboard file not found: $dashboard_file"
        fi
    done
    
    print_status "SUCCESS" "Grafana configuration completed"
}

# Test monitoring setup
test_monitoring_setup() {
    print_status "INFO" "Testing monitoring setup..."
    
    # Test Prometheus
    if curl -s "http://localhost:9090/api/v1/targets" | jq -r '.status' | grep -q "success"; then
        print_status "SUCCESS" "Prometheus is responding correctly"
    else
        print_status "ERROR" "Prometheus is not responding"
        return 1
    fi
    
    # Test Grafana
    if curl -s "http://localhost:3001/api/health" | jq -r '.database' | grep -q "ok"; then
        print_status "SUCCESS" "Grafana is responding correctly"
    else
        print_status "ERROR" "Grafana is not responding"
        return 1
    fi
    
    # Test Alertmanager
    if curl -s "http://localhost:9093/api/v1/status" | jq -r '.status' | grep -q "success"; then
        print_status "SUCCESS" "Alertmanager is responding correctly"
    else
        print_status "ERROR" "Alertmanager is not responding"
        return 1
    fi
    
    # Test Node Exporter
    if curl -s "http://localhost:9100/metrics" | grep -q "node_"; then
        print_status "SUCCESS" "Node Exporter is providing metrics"
    else
        print_status "ERROR" "Node Exporter is not providing metrics"
        return 1
    fi
    
    print_status "SUCCESS" "All monitoring components are working correctly"
}

# Display access information
display_access_info() {
    print_status "INFO" "=== Monitoring Setup Complete ==="
    print_status "INFO" ""
    print_status "INFO" "Access URLs:"
    print_status "INFO" "  🔍 Prometheus:   http://localhost:9090"
    print_status "INFO" "  📊 Grafana:      http://localhost:3001 (admin/admin)"
    print_status "INFO" "  🚨 Alertmanager: http://localhost:9093"
    print_status "INFO" "  📈 Node Exporter: http://localhost:9100/metrics"
    print_status "INFO" ""
    print_status "INFO" "Default Credentials:"
    print_status "INFO" "  Grafana: admin / admin (change after first login)"
    print_status "INFO" ""
    print_status "INFO" "Health Check:"
    print_status "INFO" "  Run: $SCRIPT_DIR/monitoring-health-check.sh"
    print_status "INFO" ""
    print_status "WARNING" "Remember to:"
    print_status "WARNING" "  1. Change default passwords"
    print_status "WARNING" "  2. Configure SSL certificates for production"
    print_status "WARNING" "  3. Set up proper firewall rules"
    print_status "WARNING" "  4. Configure notification channels in Alertmanager"
}

# Cleanup function
cleanup() {
    if [ $? -ne 0 ]; then
        print_status "ERROR" "Setup failed. Cleaning up..."
        docker-compose -f "$COMPOSE_FILE" down prometheus grafana alertmanager node-exporter 2>/dev/null || true
    fi
}

# Main setup function
main() {
    trap cleanup EXIT
    
    print_status "INFO" "Starting CodeSenseiSearch monitoring setup..."
    
    check_prerequisites
    create_directories
    generate_prometheus_config
    start_monitoring_services
    configure_grafana
    test_monitoring_setup
    display_access_info
    
    print_status "SUCCESS" "Monitoring setup completed successfully!"
}

# Handle command line arguments
case "${1:-setup}" in
    "setup")
        main
        ;;
    "start")
        start_monitoring_services
        ;;
    "test")
        test_monitoring_setup
        ;;
    "stop")
        print_status "INFO" "Stopping monitoring services..."
        docker-compose -f "$COMPOSE_FILE" down prometheus grafana alertmanager node-exporter
        print_status "SUCCESS" "Monitoring services stopped"
        ;;
    "restart")
        print_status "INFO" "Restarting monitoring services..."
        docker-compose -f "$COMPOSE_FILE" down prometheus grafana alertmanager node-exporter
        start_monitoring_services
        print_status "SUCCESS" "Monitoring services restarted"
        ;;
    "logs")
        service=${2:-}
        if [ -n "$service" ]; then
            docker-compose -f "$COMPOSE_FILE" logs -f "$service"
        else
            docker-compose -f "$COMPOSE_FILE" logs -f prometheus grafana alertmanager node-exporter
        fi
        ;;
    "help")
        echo "Usage: $0 [command]"
        echo "Commands:"
        echo "  setup     - Complete monitoring setup (default)"
        echo "  start     - Start monitoring services"
        echo "  stop      - Stop monitoring services"
        echo "  restart   - Restart monitoring services"
        echo "  test      - Test monitoring setup"
        echo "  logs      - Show logs for all services"
        echo "  logs <service> - Show logs for specific service"
        echo "  help      - Show this help message"
        ;;
    *)
        print_status "ERROR" "Unknown command: $1"
        print_status "INFO" "Run '$0 help' for usage information"
        exit 1
        ;;
esac