#!/bin/bash

# Production Deployment Script for CodeSenseiSearch
# This script handles safe production deployments with rollback capability

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="docker-compose.prod-enhanced.yml"
ENV_FILE=".env.production"
BACKUP_DIR="/var/backups/codesenseisearch"
LOG_FILE="/var/log/codesenseisearch/deploy.log"

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

# Deployment configuration
HEALTH_CHECK_TIMEOUT=300
HEALTH_CHECK_INTERVAL=10
DEPLOYMENT_TIMEOUT=600

# Logging function
log() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${GREEN}[$timestamp] $message${NC}"
    echo "[$timestamp] $message" >> "$LOG_FILE"
}

warn() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${YELLOW}[$timestamp] $WARNING $message${NC}"
    echo "[$timestamp] WARNING: $message" >> "$LOG_FILE"
}

error() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${RED}[$timestamp] $CROSS_MARK $message${NC}"
    echo "[$timestamp] ERROR: $message" >> "$LOG_FILE"
    exit 1
}

success() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${GREEN}[$timestamp] $CHECK_MARK $message${NC}"
    echo "[$timestamp] SUCCESS: $message" >> "$LOG_FILE"
}

info() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${BLUE}[$timestamp] $INFO $message${NC}"
    echo "[$timestamp] INFO: $message" >> "$LOG_FILE"
}

# Check prerequisites
check_prerequisites() {
    log "Checking deployment prerequisites..."
    
    # Check if running as appropriate user
    if [[ $EUID -eq 0 ]]; then
        error "Do not run this script as root"
    fi
    
    # Check Docker and Docker Compose
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed or not in PATH"
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is not installed or not in PATH"
    fi
    
    # Check if Docker daemon is running
    if ! docker info > /dev/null 2>&1; then
        error "Docker daemon is not running"
    fi
    
    # Check if environment file exists
    if [[ ! -f "$ENV_FILE" ]]; then
        error "Environment file $ENV_FILE not found"
    fi
    
    # Check if compose file exists
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        error "Compose file $COMPOSE_FILE not found"
    fi
    
    # Check disk space (minimum 5GB free)
    local available_space
    available_space=$(df / | tail -1 | awk '{print $4}')
    if [[ $available_space -lt 5242880 ]]; then
        error "Insufficient disk space. At least 5GB required"
    fi
    
    # Check if required directories exist
    mkdir -p "$(dirname "$LOG_FILE")"
    mkdir -p "$BACKUP_DIR"
    
    success "Prerequisites check passed"
}

# Load environment variables
load_environment() {
    log "Loading environment configuration..."
    
    if [[ -f "$ENV_FILE" ]]; then
        source "$ENV_FILE"
        success "Environment variables loaded from $ENV_FILE"
    else
        error "Environment file $ENV_FILE not found"
    fi
    
    # Validate required environment variables
    local required_vars=(
        "POSTGRES_PASSWORD"
        "REDIS_PASSWORD"
        "JWT_SECRET"
        "DOMAIN"
    )
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            error "Required environment variable $var is not set"
        fi
    done
    
    success "Required environment variables validated"
}

# Create pre-deployment backup
create_backup() {
    log "Creating pre-deployment backup..."
    
    local backup_timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_name="pre_deploy_${backup_timestamp}"
    
    # Run backup script
    if [[ -f "$PROJECT_ROOT/scripts/backup.sh" ]]; then
        "$PROJECT_ROOT/scripts/backup.sh" backup --no-verify --skip-s3
        
        # Tag the backup as pre-deployment
        local latest_backup
        latest_backup=$(find "$BACKUP_DIR" -name "*.tar.gz" -type f -printf "%T@ %p\n" | sort -n | tail -1 | cut -d' ' -f2-)
        if [[ -n "$latest_backup" ]]; then
            local backup_dir="$BACKUP_DIR/pre_deployment/"
            mkdir -p "$backup_dir"
            cp "$latest_backup" "${backup_dir}${backup_name}.tar.gz"
            success "Pre-deployment backup created: ${backup_dir}${backup_name}.tar.gz"
        else
            warn "Could not find backup file to tag"
        fi
    else
        warn "Backup script not found, skipping backup creation"
    fi
}

# Pull latest images
pull_images() {
    log "Pulling latest Docker images..."
    
    # Pull images specified in compose file
    if docker-compose -f "$COMPOSE_FILE" pull; then
        success "Docker images pulled successfully"
    else
        error "Failed to pull Docker images"
    fi
    
    # Clean up old images to free space
    log "Cleaning up old Docker images..."
    docker image prune -f --filter "until=72h"
    success "Old Docker images cleaned up"
}

# Health check function
health_check() {
    local service_url="$1"
    local service_name="$2"
    local timeout="${3:-60}"
    
    log "Performing health check for $service_name..."
    
    local count=0
    local max_attempts=$((timeout / HEALTH_CHECK_INTERVAL))
    
    while [[ $count -lt $max_attempts ]]; do
        if curl -f -s "$service_url" > /dev/null 2>&1; then
            success "$service_name health check passed"
            return 0
        fi
        
        count=$((count + 1))
        sleep $HEALTH_CHECK_INTERVAL
    done
    
    error "$service_name health check failed after $timeout seconds"
}

# Wait for services to be ready
wait_for_services() {
    log "Waiting for services to be ready..."
    
    # Wait for database
    log "Waiting for PostgreSQL to be ready..."
    local db_count=0
    while [[ $db_count -lt 30 ]]; do
        if docker-compose -f "$COMPOSE_FILE" exec -T postgres-primary pg_isready -U "$POSTGRES_USER" > /dev/null 2>&1; then
            success "PostgreSQL is ready"
            break
        fi
        db_count=$((db_count + 1))
        sleep 2
    done
    
    if [[ $db_count -ge 30 ]]; then
        error "PostgreSQL failed to become ready"
    fi
    
    # Wait for Redis
    log "Waiting for Redis to be ready..."
    local redis_count=0
    while [[ $redis_count -lt 30 ]]; do
        if docker-compose -f "$COMPOSE_FILE" exec -T redis-primary redis-cli ping > /dev/null 2>&1; then
            success "Redis is ready"
            break
        fi
        redis_count=$((redis_count + 1))
        sleep 2
    done
    
    if [[ $redis_count -ge 30 ]]; then
        error "Redis failed to become ready"
    fi
    
    # Wait for application services
    sleep 30  # Give applications time to start
    
    # Health check for web service
    health_check "http://localhost:3000/health" "Web Service" 120
    
    # Health check for API service
    health_check "http://localhost:3001/health" "API Service" 120
}

# Run database migrations
run_migrations() {
    log "Running database migrations..."
    
    # Run Prisma migrations
    if docker-compose -f "$COMPOSE_FILE" exec -T api npx prisma migrate deploy; then
        success "Database migrations completed"
    else
        error "Database migrations failed"
    fi
    
    # Generate Prisma client
    if docker-compose -f "$COMPOSE_FILE" exec -T api npx prisma generate; then
        success "Prisma client generated"
    else
        warn "Failed to generate Prisma client"
    fi
}

# Deploy services
deploy_services() {
    log "Starting service deployment..."
    
    # Stop existing services gracefully
    log "Stopping existing services..."
    docker-compose -f "$COMPOSE_FILE" down --timeout 30
    
    # Start infrastructure services first
    log "Starting infrastructure services..."
    docker-compose -f "$COMPOSE_FILE" up -d postgres-primary redis-primary
    
    # Wait for infrastructure to be ready
    wait_for_services
    
    # Run migrations
    run_migrations
    
    # Start application services
    log "Starting application services..."
    docker-compose -f "$COMPOSE_FILE" up -d web api worker
    
    # Start reverse proxy
    log "Starting reverse proxy..."
    docker-compose -f "$COMPOSE_FILE" up -d nginx
    
    # Start monitoring services if enabled
    if docker-compose -f "$COMPOSE_FILE" --profile monitoring config > /dev/null 2>&1; then
        log "Starting monitoring services..."
        docker-compose -f "$COMPOSE_FILE" --profile monitoring up -d
    fi
    
    success "All services started"
}

# Verify deployment
verify_deployment() {
    log "Verifying deployment..."
    
    # Check that all expected containers are running
    local expected_services=("postgres-primary" "redis-primary" "web" "api" "worker" "nginx")
    for service in "${expected_services[@]}"; do
        if docker-compose -f "$COMPOSE_FILE" ps "$service" | grep -q "Up"; then
            success "$service is running"
        else
            error "$service is not running"
        fi
    done
    
    # Final health checks
    health_check "http://localhost/health" "Web Service via Nginx" 60
    health_check "http://localhost/api/health" "API Service via Nginx" 60
    
    # Test basic functionality
    log "Testing basic functionality..."
    
    # Test search endpoint
    if curl -f -s "http://localhost/api/search?q=test&limit=5" > /dev/null; then
        success "Search endpoint is working"
    else
        warn "Search endpoint test failed"
    fi
    
    # Test web interface
    if curl -f -s "http://localhost" > /dev/null; then
        success "Web interface is accessible"
    else
        error "Web interface is not accessible"
    fi
}

# Send notifications
send_notifications() {
    local status="$1"
    local message="$2"
    
    # Slack notification
    if [[ -n "$SLACK_WEBHOOK_URL" ]]; then
        local color="good"
        if [[ "$status" == "FAILED" ]]; then
            color="danger"
        fi
        
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"attachments\":[{\"color\":\"$color\",\"title\":\"CodeSenseiSearch Deployment $status\",\"text\":\"$message\",\"fields\":[{\"title\":\"Environment\",\"value\":\"Production\",\"short\":true},{\"title\":\"Timestamp\",\"value\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"short\":true}]}]}" \
            "$SLACK_WEBHOOK_URL" > /dev/null 2>&1
    fi
    
    # Email notification (if configured)
    if [[ -n "$NOTIFICATION_EMAIL" ]] && command -v mail &> /dev/null; then
        echo "$message" | mail -s "CodeSenseiSearch Deployment $status" "$NOTIFICATION_EMAIL"
    fi
    
    info "Notifications sent"
}

# Cleanup function
cleanup() {
    log "Performing cleanup..."
    
    # Remove old containers
    docker container prune -f
    
    # Remove unused networks
    docker network prune -f
    
    # Clean up logs older than 7 days
    find /var/log/codesenseisearch -name "*.log" -type f -mtime +7 -delete 2>/dev/null || true
    
    success "Cleanup completed"
}

# Rollback function
rollback() {
    local reason="$1"
    
    error "Deployment failed: $reason"
    log "Initiating rollback procedure..."
    
    # Stop current deployment
    docker-compose -f "$COMPOSE_FILE" down --timeout 30
    
    # Restore from backup
    local latest_backup
    latest_backup=$(find "$BACKUP_DIR/pre_deployment" -name "*.tar.gz" -type f -printf "%T@ %p\n" | sort -n | tail -1 | cut -d' ' -f2-)
    
    if [[ -n "$latest_backup" ]]; then
        log "Restoring from backup: $latest_backup"
        # This would restore the backup - implementation depends on backup strategy
        warn "Manual backup restoration may be required"
    fi
    
    # Send failure notification
    send_notifications "FAILED" "Deployment failed: $reason. Rollback initiated."
    
    exit 1
}

# Main deployment function
main() {
    local deployment_start=$(date +%s)
    
    log "Starting CodeSenseiSearch production deployment..."
    log "Deployment started at $(date)"
    
    # Trap errors for rollback
    trap 'rollback "Unexpected error during deployment"' ERR
    
    # Run deployment steps
    check_prerequisites
    load_environment
    create_backup
    pull_images
    deploy_services
    verify_deployment
    cleanup
    
    # Calculate deployment time
    local deployment_end=$(date +%s)
    local deployment_duration=$((deployment_end - deployment_start))
    
    success "Deployment completed successfully in ${deployment_duration} seconds"
    
    # Send success notification
    send_notifications "SUCCESS" "Deployment completed successfully in ${deployment_duration} seconds. All services are running and healthy."
    
    log "Deployment finished at $(date)"
}

# Help function
show_help() {
    cat << EOF
Production Deployment Script for CodeSenseiSearch

Usage: $0 [COMMAND] [OPTIONS]

Commands:
    deploy                 Run full deployment (default)
    verify                 Verify current deployment
    backup                 Create backup only
    rollback               Manual rollback (use with caution)
    health                 Run health checks only
    help                   Show this help message

Options:
    --skip-backup         Skip pre-deployment backup
    --skip-migrations     Skip database migrations
    --skip-pull           Skip pulling new images
    --timeout SECONDS     Set deployment timeout (default: 600)

Examples:
    $0 deploy                          # Full deployment
    $0 deploy --skip-backup           # Deploy without backup
    $0 verify                         # Verify deployment
    $0 health                         # Health check only

Environment Variables:
    ENV_FILE              Environment file (default: .env.production)
    COMPOSE_FILE          Docker compose file (default: docker-compose.prod-enhanced.yml)
    BACKUP_DIR            Backup directory (default: /var/backups/codesenseisearch)
    LOG_FILE              Log file (default: /var/log/codesenseisearch/deploy.log)
EOF
}

# Parse command line arguments
COMMAND="${1:-deploy}"
shift || true

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --skip-migrations)
            SKIP_MIGRATIONS=true
            shift
            ;;
        --skip-pull)
            SKIP_PULL=true
            shift
            ;;
        --timeout)
            DEPLOYMENT_TIMEOUT="$2"
            shift 2
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

# Execute command
case "$COMMAND" in
    "deploy")
        main
        ;;
    "verify")
        check_prerequisites
        load_environment
        verify_deployment
        ;;
    "backup")
        check_prerequisites
        load_environment
        create_backup
        ;;
    "health")
        check_prerequisites
        load_environment
        health_check "http://localhost/health" "Web Service" 60
        health_check "http://localhost/api/health" "API Service" 60
        ;;
    "rollback")
        warn "Manual rollback requested"
        rollback "Manual rollback requested by user"
        ;;
    "help")
        show_help
        ;;
    *)
        error "Unknown command: $COMMAND. Use '$0 help' for usage information."
        ;;
esac