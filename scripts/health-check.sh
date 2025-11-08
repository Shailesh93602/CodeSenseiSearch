#!/bin/bash

# Health Check Script for CodeSenseiSearch Infrastructure
# Monitors all services and provides comprehensive health reporting

set -e

# Configuration
WEB_URL="http://localhost:3000"
API_URL="http://localhost:3001"
POSTGRES_HOST="localhost"
POSTGRES_PORT="5432"
POSTGRES_DB="codesenseisearch"
REDIS_HOST="localhost"
REDIS_PORT="6379"
NGINX_PORT="80"
SSL_PORT="443"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Status icons
CHECK_MARK="✅"
CROSS_MARK="❌"
WARNING="⚠️"
INFO="ℹ️"

# Global health status
OVERALL_HEALTH=true

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] $WARNING $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] $CROSS_MARK $1${NC}"
    OVERALL_HEALTH=false
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $CHECK_MARK $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $INFO $1${NC}"
}

# Service health check functions
check_web_service() {
    info "Checking Web Service (Next.js)..."
    
    local response
    local status_code
    local response_time
    
    # Check if service is responding
    if response=$(curl -s -w "%{http_code}|%{time_total}" -o /dev/null "$WEB_URL/health" 2>/dev/null); then
        status_code=$(echo "$response" | cut -d'|' -f1)
        response_time=$(echo "$response" | cut -d'|' -f2)
        
        if [[ "$status_code" == "200" ]]; then
            success "Web service is healthy (${response_time}s response time)"
        else
            error "Web service returned status code: $status_code"
        fi
    else
        # Try main page if health endpoint doesn't exist
        if response=$(curl -s -w "%{http_code}|%{time_total}" -o /dev/null "$WEB_URL" 2>/dev/null); then
            status_code=$(echo "$response" | cut -d'|' -f1)
            response_time=$(echo "$response" | cut -d'|' -f2)
            
            if [[ "$status_code" == "200" ]]; then
                success "Web service is healthy (${response_time}s response time)"
            else
                error "Web service returned status code: $status_code"
            fi
        else
            error "Web service is not responding"
        fi
    fi
    
    # Check if process is running
    if pgrep -f "next.*start\|node.*next" > /dev/null; then
        success "Web service process is running"
    else
        error "Web service process not found"
    fi
}

check_api_service() {
    info "Checking API Service (NestJS)..."
    
    local response
    local status_code
    local response_time
    
    # Check health endpoint
    if response=$(curl -s -w "%{http_code}|%{time_total}" -o /dev/null "$API_URL/health" 2>/dev/null); then
        status_code=$(echo "$response" | cut -d'|' -f1)
        response_time=$(echo "$response" | cut -d'|' -f2)
        
        if [[ "$status_code" == "200" ]]; then
            success "API service is healthy (${response_time}s response time)"
        else
            error "API service returned status code: $status_code"
        fi
    else
        error "API service is not responding"
    fi
    
    # Check if process is running
    if pgrep -f "nest.*start\|node.*main\.js" > /dev/null; then
        success "API service process is running"
    else
        error "API service process not found"
    fi
}

check_postgres() {
    info "Checking PostgreSQL Database..."
    
    # Check if PostgreSQL is running
    if command -v psql &> /dev/null; then
        if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;" > /dev/null 2>&1; then
            success "PostgreSQL is accessible and responding"
            
            # Check pgvector extension
            if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT extname FROM pg_extension WHERE extname = 'vector';" | grep -q "vector"; then
                success "pgvector extension is installed"
            else
                warn "pgvector extension not found"
            fi
        else
            error "Cannot connect to PostgreSQL"
        fi
    else
        # Try with nc if psql not available
        if command -v nc &> /dev/null; then
            if nc -z "$POSTGRES_HOST" "$POSTGRES_PORT" 2>/dev/null; then
                success "PostgreSQL port is open"
            else
                error "PostgreSQL port is not accessible"
            fi
        else
            warn "Cannot check PostgreSQL (psql and nc not available)"
        fi
    fi
    
    # Check if process is running (Docker or native)
    if pgrep -f postgres > /dev/null || docker ps | grep -q postgres; then
        success "PostgreSQL process is running"
    else
        error "PostgreSQL process not found"
    fi
}

check_redis() {
    info "Checking Redis..."
    
    # Check if Redis is accessible
    if command -v redis-cli &> /dev/null; then
        if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping > /dev/null 2>&1; then
            success "Redis is accessible and responding"
            
            # Get Redis info
            local redis_info
            redis_info=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" info server | grep "redis_version" | cut -d':' -f2 | tr -d '\r')
            info "Redis version: $redis_info"
        else
            error "Cannot connect to Redis"
        fi
    else
        # Try with nc if redis-cli not available
        if command -v nc &> /dev/null; then
            if nc -z "$REDIS_HOST" "$REDIS_PORT" 2>/dev/null; then
                success "Redis port is open"
            else
                error "Redis port is not accessible"
            fi
        else
            warn "Cannot check Redis (redis-cli and nc not available)"
        fi
    fi
    
    # Check if process is running (Docker or native)
    if pgrep -f redis-server > /dev/null || docker ps | grep -q redis; then
        success "Redis process is running"
    else
        error "Redis process not found"
    fi
}

check_nginx() {
    info "Checking Nginx..."
    
    # Check if Nginx is running
    if pgrep -f nginx > /dev/null || docker ps | grep -q nginx; then
        success "Nginx process is running"
    else
        error "Nginx process not found"
    fi
    
    # Check HTTP port
    if command -v nc &> /dev/null; then
        if nc -z localhost "$NGINX_PORT" 2>/dev/null; then
            success "Nginx HTTP port ($NGINX_PORT) is accessible"
        else
            error "Nginx HTTP port ($NGINX_PORT) is not accessible"
        fi
        
        # Check HTTPS port
        if nc -z localhost "$SSL_PORT" 2>/dev/null; then
            success "Nginx HTTPS port ($SSL_PORT) is accessible"
        else
            warn "Nginx HTTPS port ($SSL_PORT) is not accessible"
        fi
    fi
    
    # Check configuration syntax
    if command -v nginx &> /dev/null; then
        if nginx -t > /dev/null 2>&1; then
            success "Nginx configuration is valid"
        else
            error "Nginx configuration has errors"
        fi
    fi
}

check_ssl_certificates() {
    info "Checking SSL Certificates..."
    
    local cert_file="/etc/ssl/certs/codesenseisearch.com.crt"
    local key_file="/etc/ssl/certs/codesenseisearch.com.key"
    
    if [[ -f "$cert_file" && -f "$key_file" ]]; then
        success "SSL certificate files exist"
        
        # Check certificate validity
        local expiry
        if expiry=$(openssl x509 -in "$cert_file" -enddate -noout 2>/dev/null | cut -d= -f2); then
            local expiry_epoch
            expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y %Z" "$expiry" +%s 2>/dev/null)
            local current_epoch
            current_epoch=$(date +%s)
            local days_until_expiry
            days_until_expiry=$(( (expiry_epoch - current_epoch) / 86400 ))
            
            if [[ $days_until_expiry -gt 30 ]]; then
                success "SSL certificate is valid for $days_until_expiry more days"
            elif [[ $days_until_expiry -gt 0 ]]; then
                warn "SSL certificate expires in $days_until_expiry days"
            else
                error "SSL certificate has expired"
            fi
        else
            error "Cannot read SSL certificate expiry date"
        fi
    else
        warn "SSL certificate files not found (development mode?)"
    fi
}

check_docker_services() {
    info "Checking Docker Services..."
    
    if command -v docker &> /dev/null; then
        # Check if Docker is running
        if docker info > /dev/null 2>&1; then
            success "Docker daemon is running"
            
            # Check running containers
            local running_containers
            running_containers=$(docker ps --format "table {{.Names}}\t{{.Status}}" | tail -n +2)
            
            if [[ -n "$running_containers" ]]; then
                success "Docker containers are running:"
                echo "$running_containers" | while read -r line; do
                    echo "  $line"
                done
            else
                warn "No Docker containers are running"
            fi
            
            # Check Docker Compose services
            if command -v docker-compose &> /dev/null && [[ -f "docker-compose.yml" ]]; then
                local compose_status
                compose_status=$(docker-compose ps 2>/dev/null || true)
                if [[ -n "$compose_status" ]]; then
                    info "Docker Compose status:"
                    echo "$compose_status"
                fi
            fi
        else
            error "Docker daemon is not running"
        fi
    else
        warn "Docker not installed"
    fi
}

check_system_resources() {
    info "Checking System Resources..."
    
    # Check memory usage
    if command -v free &> /dev/null; then
        local memory_info
        memory_info=$(free -h | grep "Mem:")
        local memory_usage
        memory_usage=$(echo "$memory_info" | awk '{print $3"/"$2}')
        info "Memory usage: $memory_usage"
        
        # Check if memory usage is high
        local memory_percent
        memory_percent=$(free | grep "Mem:" | awk '{printf "%.0f", $3/$2 * 100.0}')
        if [[ $memory_percent -gt 90 ]]; then
            error "High memory usage: ${memory_percent}%"
        elif [[ $memory_percent -gt 80 ]]; then
            warn "High memory usage: ${memory_percent}%"
        else
            success "Memory usage is normal: ${memory_percent}%"
        fi
    fi
    
    # Check disk usage
    if command -v df &> /dev/null; then
        local disk_usage
        disk_usage=$(df -h / | tail -1 | awk '{print $5}' | sed 's/%//')
        if [[ $disk_usage -gt 90 ]]; then
            error "High disk usage: ${disk_usage}%"
        elif [[ $disk_usage -gt 80 ]]; then
            warn "High disk usage: ${disk_usage}%"
        else
            success "Disk usage is normal: ${disk_usage}%"
        fi
    fi
    
    # Check CPU load
    if command -v uptime &> /dev/null; then
        local load_avg
        load_avg=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
        info "Current load average: $load_avg"
    fi
}

check_network_connectivity() {
    info "Checking Network Connectivity..."
    
    # Check internet connectivity
    if ping -c 1 8.8.8.8 > /dev/null 2>&1; then
        success "Internet connectivity is working"
    else
        error "No internet connectivity"
    fi
    
    # Check DNS resolution
    if nslookup google.com > /dev/null 2>&1; then
        success "DNS resolution is working"
    else
        error "DNS resolution failed"
    fi
    
    # Check external API connectivity (GitHub)
    if curl -s -o /dev/null -w "%{http_code}" https://api.github.com | grep -q "200"; then
        success "GitHub API is accessible"
    else
        warn "GitHub API is not accessible"
    fi
}

generate_report() {
    echo ""
    echo "=================================================="
    echo "           CodeSenseiSearch Health Report"
    echo "=================================================="
    echo "Generated: $(date)"
    echo ""
    
    if [[ "$OVERALL_HEALTH" == "true" ]]; then
        echo -e "${GREEN}$CHECK_MARK Overall Status: HEALTHY${NC}"
    else
        echo -e "${RED}$CROSS_MARK Overall Status: UNHEALTHY${NC}"
    fi
    
    echo ""
    echo "Summary:"
    echo "- Web Service: $(pgrep -f "next.*start\|node.*next" > /dev/null && echo "✅ Running" || echo "❌ Not Running")"
    echo "- API Service: $(pgrep -f "nest.*start\|node.*main\.js" > /dev/null && echo "✅ Running" || echo "❌ Not Running")"
    echo "- PostgreSQL: $(pgrep -f postgres > /dev/null || docker ps | grep -q postgres && echo "✅ Running" || echo "❌ Not Running")"
    echo "- Redis: $(pgrep -f redis-server > /dev/null || docker ps | grep -q redis && echo "✅ Running" || echo "❌ Not Running")"
    echo "- Nginx: $(pgrep -f nginx > /dev/null || docker ps | grep -q nginx && echo "✅ Running" || echo "❌ Not Running")"
    
    echo ""
    echo "For detailed logs, check:"
    echo "- Web logs: docker logs codesenseisearch-web-1 2>/dev/null || pm2 logs web"
    echo "- API logs: docker logs codesenseisearch-api-1 2>/dev/null || pm2 logs api"
    echo "- Nginx logs: docker logs codesenseisearch-nginx-1 2>/dev/null || tail -f /var/log/nginx/error.log"
    echo ""
}

# Quick health check function
quick_check() {
    local services=("web" "api" "postgres" "redis")
    local all_healthy=true
    
    for service in "${services[@]}"; do
        case "$service" in
            "web")
                if ! curl -s -o /dev/null "$WEB_URL" 2>/dev/null; then
                    all_healthy=false
                fi
                ;;
            "api")
                if ! curl -s -o /dev/null "$API_URL/health" 2>/dev/null; then
                    all_healthy=false
                fi
                ;;
            "postgres")
                if ! (pgrep -f postgres > /dev/null || docker ps | grep -q postgres); then
                    all_healthy=false
                fi
                ;;
            "redis")
                if ! (pgrep -f redis-server > /dev/null || docker ps | grep -q redis); then
                    all_healthy=false
                fi
                ;;
        esac
    done
    
    if [[ "$all_healthy" == "true" ]]; then
        echo "✅ All core services are healthy"
        exit 0
    else
        echo "❌ Some services are unhealthy"
        exit 1
    fi
}

# Display help
show_help() {
    cat << EOF
Health Check Script for CodeSenseiSearch

Usage: $0 [COMMAND] [OPTIONS]

Commands:
    full                   Run complete health check (default)
    quick                  Run quick health check for core services
    web                    Check only web service
    api                    Check only API service
    database               Check only database services (PostgreSQL, Redis)
    nginx                  Check only Nginx service
    ssl                    Check only SSL certificates
    docker                 Check only Docker services
    system                 Check only system resources
    network                Check only network connectivity
    help                   Show this help message

Options:
    --json                 Output results in JSON format
    --quiet                Suppress info messages, show only errors
    --no-color             Disable colored output

Examples:
    $0                     # Run full health check
    $0 quick               # Quick check of core services
    $0 web                 # Check only web service
    $0 database            # Check PostgreSQL and Redis
    $0 --json              # Output in JSON format

Environment Variables:
    WEB_URL               Web service URL (default: http://localhost:3000)
    API_URL               API service URL (default: http://localhost:3001)
    POSTGRES_HOST         PostgreSQL host (default: localhost)
    POSTGRES_PORT         PostgreSQL port (default: 5432)
    POSTGRES_USER         PostgreSQL user
    POSTGRES_PASSWORD     PostgreSQL password
    REDIS_HOST            Redis host (default: localhost)
    REDIS_PORT            Redis port (default: 6379)
EOF
}

# Main execution
main() {
    local command="${1:-full}"
    
    # Source environment variables if .env exists
    if [[ -f ".env" ]]; then
        source .env
    fi
    
    case "$command" in
        "full"|"")
            echo "🔍 Running comprehensive health check..."
            echo ""
            check_web_service
            check_api_service
            check_postgres
            check_redis
            check_nginx
            check_ssl_certificates
            check_docker_services
            check_system_resources
            check_network_connectivity
            generate_report
            ;;
        "quick")
            quick_check
            ;;
        "web")
            check_web_service
            ;;
        "api")
            check_api_service
            ;;
        "database")
            check_postgres
            check_redis
            ;;
        "nginx")
            check_nginx
            ;;
        "ssl")
            check_ssl_certificates
            ;;
        "docker")
            check_docker_services
            ;;
        "system")
            check_system_resources
            ;;
        "network")
            check_network_connectivity
            ;;
        "help"|"--help"|"-h")
            show_help
            ;;
        *)
            error "Unknown command: $command. Use '$0 help' for usage information."
            exit 1
            ;;
    esac
    
    if [[ "$OVERALL_HEALTH" == "false" ]]; then
        exit 1
    fi
}

# Run main function with all arguments
main "$@"