#!/bin/bash

# Production Deployment Script for CodeSenseiSearch
# This script automates the deployment process with safety checks

set -euo pipefail

# =============================================
# Configuration
# =============================================
PROJECT_NAME="codesenseisearch"
DEPLOY_DIR="/opt/${PROJECT_NAME}"
BACKUP_DIR="/opt/backups/${PROJECT_NAME}"
LOG_FILE="/var/log/${PROJECT_NAME}-deploy.log"
DOCKER_COMPOSE_FILE="docker-compose.prod.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# =============================================
# Logging Functions
# =============================================
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}" | tee -a "$LOG_FILE"
    exit 1
}

# =============================================
# Pre-deployment Checks
# =============================================
pre_deployment_checks() {
    log "Running pre-deployment checks..."
    
    # Check if running as root or with sudo
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root or with sudo privileges"
    fi
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        error "Docker is not running or not accessible"
    fi
    
    # Check if Docker Compose is available
    if ! command -v docker-compose >/dev/null 2>&1; then
        error "Docker Compose is not installed"
    fi
    
    # Check if deployment directory exists
    if [[ ! -d "$DEPLOY_DIR" ]]; then
        error "Deployment directory $DEPLOY_DIR does not exist"
    fi
    
    # Check if environment file exists
    if [[ ! -f "$DEPLOY_DIR/.env.production" ]]; then
        error "Production environment file $DEPLOY_DIR/.env.production does not exist"
    fi
    
    # Check disk space (require at least 2GB free)
    AVAILABLE_SPACE=$(df "$DEPLOY_DIR" | awk 'NR==2 {print $4}')
    if [[ $AVAILABLE_SPACE -lt 2097152 ]]; then
        error "Insufficient disk space. At least 2GB required for deployment"
    fi
    
    log "Pre-deployment checks passed ✓"
}

# =============================================
# Backup Current State
# =============================================
backup_current_state() {
    log "Creating backup of current state..."
    
    mkdir -p "$BACKUP_DIR"
    BACKUP_TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_PATH="$BACKUP_DIR/backup_$BACKUP_TIMESTAMP"
    
    # Backup database
    log "Backing up database..."
    docker-compose -f "$DEPLOY_DIR/$DOCKER_COMPOSE_FILE" exec -T postgres pg_dump \
        -U codesenseisearch codesenseisearch > "$BACKUP_PATH.sql" || \
        warn "Database backup failed - continuing anyway"
    
    # Backup current application state
    log "Backing up application state..."
    docker-compose -f "$DEPLOY_DIR/$DOCKER_COMPOSE_FILE" down
    tar -czf "$BACKUP_PATH.tar.gz" -C "$DEPLOY_DIR" . || \
        warn "Application backup failed - continuing anyway"
    
    log "Backup completed: $BACKUP_PATH"
}

# =============================================
# Pull Latest Images
# =============================================
pull_latest_images() {
    log "Pulling latest Docker images..."
    
    cd "$DEPLOY_DIR"
    
    # Pull latest images
    docker-compose -f "$DOCKER_COMPOSE_FILE" pull || \
        error "Failed to pull latest images"
    
    log "Docker images updated ✓"
}

# =============================================
# Database Migration
# =============================================
run_database_migration() {
    log "Running database migrations..."
    
    cd "$DEPLOY_DIR"
    
    # Start only the database to run migrations
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d postgres redis
    
    # Wait for database to be ready
    log "Waiting for database to be ready..."
    sleep 10
    
    # Run migrations using a temporary container
    docker run --rm \
        --network="${PROJECT_NAME}_${PROJECT_NAME}" \
        -e DATABASE_URL="$(grep DATABASE_URL .env.production | cut -d '=' -f2)" \
        -v "$PWD/apps/api/prisma:/app/prisma" \
        node:18-alpine sh -c "
            cd /app && 
            npm install prisma @prisma/client && 
            npx prisma migrate deploy && 
            npx prisma generate
        " || error "Database migration failed"
    
    log "Database migration completed ✓"
}

# =============================================
# Deploy Application
# =============================================
deploy_application() {
    log "Deploying application..."
    
    cd "$DEPLOY_DIR"
    
    # Start all services
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d || \
        error "Failed to start application services"
    
    log "Application services started ✓"
}

# =============================================
# Health Checks
# =============================================
run_health_checks() {
    log "Running health checks..."
    
    # Wait for services to be ready
    log "Waiting for services to initialize..."
    sleep 30
    
    # Check API health
    for i in {1..10}; do
        if curl -f http://localhost:3001/health >/dev/null 2>&1; then
            log "API health check passed ✓"
            break
        fi
        if [[ $i -eq 10 ]]; then
            error "API health check failed after 10 attempts"
        fi
        sleep 10
    done
    
    # Check Web health
    for i in {1..10}; do
        if curl -f http://localhost:3000/api/health >/dev/null 2>&1; then
            log "Web health check passed ✓"
            break
        fi
        if [[ $i -eq 10 ]]; then
            error "Web health check failed after 10 attempts"
        fi
        sleep 10
    done
    
    # Check database connectivity
    if docker-compose -f "$DEPLOY_DIR/$DOCKER_COMPOSE_FILE" exec -T postgres \
       pg_isready -U codesenseisearch >/dev/null 2>&1; then
        log "Database connectivity check passed ✓"
    else
        error "Database connectivity check failed"
    fi
    
    # Check Redis connectivity
    if docker-compose -f "$DEPLOY_DIR/$DOCKER_COMPOSE_FILE" exec -T redis \
       redis-cli ping >/dev/null 2>&1; then
        log "Redis connectivity check passed ✓"
    else
        error "Redis connectivity check failed"
    fi
}

# =============================================
# Cleanup
# =============================================
cleanup() {
    log "Cleaning up unused Docker resources..."
    
    # Remove unused images, containers, and volumes
    docker system prune -f >/dev/null 2>&1 || warn "Docker cleanup failed"
    
    # Remove old backups (keep last 5)
    find "$BACKUP_DIR" -name "backup_*" -type f | sort -r | tail -n +6 | xargs rm -f
    
    log "Cleanup completed ✓"
}

# =============================================
# Rollback Function
# =============================================
rollback() {
    warn "Rolling back to previous version..."
    
    cd "$DEPLOY_DIR"
    docker-compose -f "$DOCKER_COMPOSE_FILE" down
    
    # Find latest backup
    LATEST_BACKUP=$(find "$BACKUP_DIR" -name "backup_*.tar.gz" -type f | sort -r | head -n 1)
    
    if [[ -n "$LATEST_BACKUP" ]]; then
        log "Restoring from backup: $LATEST_BACKUP"
        tar -xzf "$LATEST_BACKUP" -C "$DEPLOY_DIR"
        docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
        log "Rollback completed"
    else
        error "No backup found for rollback"
    fi
}

# =============================================
# Main Deployment Function
# =============================================
main() {
    log "Starting CodeSenseiSearch deployment..."
    
    # Trap errors to enable rollback
    trap 'error "Deployment failed! Run with --rollback to restore previous version"' ERR
    
    # Handle command line arguments
    case "${1:-}" in
        "--rollback")
            rollback
            exit 0
            ;;
        "--health-check")
            run_health_checks
            exit 0
            ;;
        "--help")
            echo "Usage: $0 [--rollback|--health-check|--help]"
            echo "  --rollback     Rollback to the previous version"
            echo "  --health-check Run health checks only"
            echo "  --help         Show this help message"
            exit 0
            ;;
    esac
    
    # Run deployment steps
    pre_deployment_checks
    backup_current_state
    pull_latest_images
    run_database_migration
    deploy_application
    run_health_checks
    cleanup
    
    log "🚀 Deployment completed successfully!"
    log "Application is available at:"
    log "  Frontend: http://localhost:3000"
    log "  API: http://localhost:3001"
    log "  Traefik Dashboard: http://localhost:8080"
}

# =============================================
# Script Execution
# =============================================
main "$@"