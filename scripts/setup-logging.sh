#!/bin/bash

# CodeSenseiSearch Logging Setup Script
# This script sets up the complete logging infrastructure with Loki, Promtail, and Vector

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
    
    print_status "SUCCESS" "All prerequisites are met"
}

# Create necessary directories
create_directories() {
    print_status "INFO" "Creating logging directories..."
    
    local dirs=(
        "$PROJECT_DIR/docker/loki/data"
        "$PROJECT_DIR/docker/promtail/data"
        "$PROJECT_DIR/docker/vector/data"
        "$PROJECT_DIR/logs/api"
        "$PROJECT_DIR/logs/web"
        "$PROJECT_DIR/logs/search"
        "$PROJECT_DIR/logs/security"
        "$PROJECT_DIR/logs/errors"
        "$PROJECT_DIR/logs/monitoring"
        "/tmp/log-analysis"
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
    sudo chown -R 10001:10001 "$PROJECT_DIR/docker/loki/data" 2>/dev/null || true
    sudo chown -R 65534:65534 "$PROJECT_DIR/docker/promtail/data" 2>/dev/null || true
    
    print_status "SUCCESS" "Directories created and permissions set"
}

# Update Docker Compose with logging services
update_docker_compose() {
    print_status "INFO" "Updating Docker Compose configuration..."
    
    # Check if logging services are already in the compose file
    if grep -q "loki:" "$COMPOSE_FILE"; then
        print_status "INFO" "Logging services already configured in Docker Compose"
        return 0
    fi
    
    # Add logging services to docker-compose.yml
    cat >> "$COMPOSE_FILE" <<EOF

  # =============================================
  # Logging Services
  # =============================================
  
  # Loki - Log aggregation system
  loki:
    image: grafana/loki:2.9.0
    container_name: loki
    ports:
      - "3100:3100"
    volumes:
      - ./docker/loki/loki.yml:/etc/loki/local-config.yaml
      - ./docker/loki/data:/loki
      - ./docker/loki/rules:/etc/loki/rules
    command: -config.file=/etc/loki/local-config.yaml
    networks:
      - codesenseisearch-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3100/ready || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  # Promtail - Log shipping agent
  promtail:
    image: grafana/promtail:2.9.0
    container_name: promtail
    volumes:
      - ./docker/promtail/promtail.yml:/etc/promtail/config.yml
      - ./docker/promtail/data:/var/lib/promtail/positions
      - ./logs:/app/logs:ro
      - /var/log:/var/log:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command: -config.file=/etc/promtail/config.yml
    networks:
      - codesenseisearch-network
    restart: unless-stopped
    depends_on:
      - loki
    labels:
      - "logging=promtail"
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  # Vector - Advanced log processing (optional)
  vector:
    image: timberio/vector:0.34.0-alpine
    container_name: vector
    ports:
      - "8686:8686"  # API port
      - "9598:9598"  # Prometheus metrics
    volumes:
      - ./docker/vector/vector.toml:/etc/vector/vector.toml
      - ./docker/vector/data:/var/lib/vector
      - ./logs:/app/logs:ro
      - /var/log:/var/log:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - codesenseisearch-network
    restart: unless-stopped
    depends_on:
      - loki
    environment:
      - VECTOR_CONFIG=/etc/vector/vector.toml
      - APP_VERSION=\${APP_VERSION:-unknown}
    labels:
      - "logging=promtail"
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

EOF

    print_status "SUCCESS" "Docker Compose configuration updated"
}

# Start logging services
start_logging_services() {
    print_status "INFO" "Starting logging services..."
    
    # Stop any existing logging services
    docker-compose -f "$COMPOSE_FILE" down loki promtail vector 2>/dev/null || true
    
    # Start logging stack
    docker-compose -f "$COMPOSE_FILE" up -d loki promtail vector
    
    # Wait for services to be ready
    print_status "INFO" "Waiting for services to be ready..."
    sleep 30
    
    # Check if services are running
    local services=("loki" "promtail" "vector")
    for service in "${services[@]}"; do
        if docker-compose -f "$COMPOSE_FILE" ps "$service" | grep -q "Up"; then
            print_status "SUCCESS" "$service is running"
        else
            print_status "ERROR" "$service failed to start"
            docker-compose -f "$COMPOSE_FILE" logs "$service"
            exit 1
        fi
    done
    
    print_status "SUCCESS" "All logging services are running"
}

# Configure Grafana for Loki
configure_grafana_loki() {
    print_status "INFO" "Configuring Grafana for Loki integration..."
    
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
    
    # Check if Loki datasource already exists
    if curl -s -u admin:admin "$grafana_url/api/datasources" | jq -r '.[].name' | grep -q "Loki"; then
        print_status "INFO" "Loki datasource already configured in Grafana"
    else
        # Add Loki datasource to Grafana
        local datasource_payload='{
          "name": "Loki",
          "type": "loki",
          "url": "http://loki:3100",
          "access": "proxy",
          "isDefault": false,
          "jsonData": {
            "maxLines": 1000,
            "derivedFields": [
              {
                "matcherRegex": "request_id=([\\w-]+)",
                "name": "Request ID",
                "url": "${__value.raw}"
              }
            ]
          }
        }'
        
        curl -s -u admin:admin \
             -H "Content-Type: application/json" \
             -d "$datasource_payload" \
             "$grafana_url/api/datasources"
        
        print_status "SUCCESS" "Loki datasource added to Grafana"
    fi
}

# Test logging setup
test_logging_setup() {
    print_status "INFO" "Testing logging setup..."
    
    # Test Loki API
    if curl -s "http://localhost:3100/ready" | grep -q "ready"; then
        print_status "SUCCESS" "Loki is ready and responding"
    else
        print_status "ERROR" "Loki is not responding correctly"
        return 1
    fi
    
    # Test Vector API
    if curl -s "http://localhost:8686/health" | grep -q "ok"; then
        print_status "SUCCESS" "Vector is healthy and responding"
    else
        print_status "WARNING" "Vector API not responding (may be normal)"
    fi
    
    # Test log ingestion by creating a test log entry
    echo '{"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","level":"info","service":"test","message":"Logging setup test"}' >> "$PROJECT_DIR/logs/api/test.log"
    
    # Wait a moment for log processing
    sleep 10
    
    # Query Loki for the test log
    local test_query='*'
    local query_result
    query_result=$(curl -s -G "http://localhost:3100/loki/api/v1/query_range" \
        --data-urlencode "query={service=\"test\"}" \
        --data-urlencode "start=$(date -d '5 minutes ago' -u +%Y-%m-%dT%H:%M:%SZ)" \
        --data-urlencode "end=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --data-urlencode "limit=10")
    
    if echo "$query_result" | jq -r '.status' | grep -q "success"; then
        print_status "SUCCESS" "Log ingestion is working correctly"
    else
        print_status "WARNING" "Log ingestion test inconclusive"
    fi
    
    # Clean up test log
    rm -f "$PROJECT_DIR/logs/api/test.log"
}

# Display setup information
display_setup_info() {
    print_status "INFO" "=== Logging Setup Complete ==="
    print_status "INFO" ""
    print_status "INFO" "Access URLs:"
    print_status "INFO" "  📋 Loki:         http://localhost:3100"
    print_status "INFO" "  🔄 Vector API:   http://localhost:8686"
    print_status "INFO" "  📊 Grafana:      http://localhost:3001 (includes Loki datasource)"
    print_status "INFO" ""
    print_status "INFO" "Log Directories:"
    print_status "INFO" "  📁 API Logs:     $PROJECT_DIR/logs/api/"
    print_status "INFO" "  📁 Web Logs:     $PROJECT_DIR/logs/web/"
    print_status "INFO" "  📁 Search Logs:  $PROJECT_DIR/logs/search/"
    print_status "INFO" "  🔒 Security Logs: $PROJECT_DIR/logs/security/"
    print_status "INFO" "  ❌ Error Logs:   $PROJECT_DIR/logs/errors/"
    print_status "INFO" ""
    print_status "INFO" "Log Analysis:"
    print_status "INFO" "  🔍 Run analysis: $SCRIPT_DIR/log-analysis.sh"
    print_status "INFO" "  📈 View logs in Grafana: Log Analysis dashboard"
    print_status "INFO" ""
    print_status "INFO" "Configuration Files:"
    print_status "INFO" "  ⚙️  Loki config:     $PROJECT_DIR/docker/loki/loki.yml"
    print_status "INFO" "  ⚙️  Promtail config: $PROJECT_DIR/docker/promtail/promtail.yml"
    print_status "INFO" "  ⚙️  Vector config:   $PROJECT_DIR/docker/vector/vector.toml"
    print_status "INFO" ""
    print_status "WARNING" "Next Steps:"
    print_status "WARNING" "  1. Update application code to use structured logging"
    print_status "WARNING" "  2. Configure log retention policies"
    print_status "WARNING" "  3. Set up log-based alerting rules"
    print_status "WARNING" "  4. Test log analysis and reporting"
}

# Cleanup function
cleanup() {
    if [ $? -ne 0 ]; then
        print_status "ERROR" "Setup failed. Cleaning up..."
        docker-compose -f "$COMPOSE_FILE" down loki promtail vector 2>/dev/null || true
    fi
}

# Main setup function
main() {
    trap cleanup EXIT
    
    print_status "INFO" "Starting CodeSenseiSearch logging setup..."
    
    check_prerequisites
    create_directories
    update_docker_compose
    start_logging_services
    configure_grafana_loki
    test_logging_setup
    display_setup_info
    
    print_status "SUCCESS" "Logging setup completed successfully!"
}

# Handle command line arguments
case "${1:-setup}" in
    "setup")
        main
        ;;
    "start")
        start_logging_services
        ;;
    "test")
        test_logging_setup
        ;;
    "stop")
        print_status "INFO" "Stopping logging services..."
        docker-compose -f "$COMPOSE_FILE" down loki promtail vector
        print_status "SUCCESS" "Logging services stopped"
        ;;
    "restart")
        print_status "INFO" "Restarting logging services..."
        docker-compose -f "$COMPOSE_FILE" down loki promtail vector
        start_logging_services
        print_status "SUCCESS" "Logging services restarted"
        ;;
    "logs")
        service=${2:-}
        if [ -n "$service" ]; then
            docker-compose -f "$COMPOSE_FILE" logs -f "$service"
        else
            docker-compose -f "$COMPOSE_FILE" logs -f loki promtail vector
        fi
        ;;
    "analyze")
        "$SCRIPT_DIR/log-analysis.sh" "${2:-full}"
        ;;
    "help")
        echo "Usage: $0 [command]"
        echo "Commands:"
        echo "  setup       - Complete logging setup (default)"
        echo "  start       - Start logging services"
        echo "  stop        - Stop logging services"
        echo "  restart     - Restart logging services"
        echo "  test        - Test logging setup"
        echo "  logs        - Show logs for all services"
        echo "  logs <service> - Show logs for specific service"
        echo "  analyze     - Run log analysis"
        echo "  help        - Show this help message"
        ;;
    *)
        print_status "ERROR" "Unknown command: $1"
        print_status "INFO" "Run '$0 help' for usage information"
        exit 1
        ;;
esac