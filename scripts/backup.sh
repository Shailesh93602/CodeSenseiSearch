#!/bin/bash

# Backup Script for CodeSenseiSearch
# Comprehensive backup solution for database, application data, and configurations

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/codesenseisearch}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-codesenseisearch}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
S3_BUCKET="${S3_BUCKET:-}"
S3_REGION="${S3_REGION:-us-east-1}"

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

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] $WARNING $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] $CROSS_MARK $1${NC}"
    exit 1
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $CHECK_MARK $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $INFO $1${NC}"
}

# Setup backup directory
setup_backup_dir() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    BACKUP_PATH="$BACKUP_DIR/$timestamp"
    
    log "Setting up backup directory: $BACKUP_PATH"
    mkdir -p "$BACKUP_PATH"
    mkdir -p "$BACKUP_PATH/database"
    mkdir -p "$BACKUP_PATH/files"
    mkdir -p "$BACKUP_PATH/config"
    mkdir -p "$BACKUP_PATH/logs"
}

# Backup PostgreSQL database
backup_postgres() {
    log "Backing up PostgreSQL database..."
    
    local dump_file="$BACKUP_PATH/database/postgres_dump.sql"
    local dump_compressed="$BACKUP_PATH/database/postgres_dump.sql.gz"
    
    # Check if PostgreSQL tools are available
    if ! command -v pg_dump &> /dev/null; then
        error "pg_dump not found. Please install PostgreSQL client tools."
    fi
    
    # Create database dump
    if PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$dump_file"; then
        success "PostgreSQL dump created"
        
        # Compress the dump
        gzip "$dump_file"
        success "PostgreSQL dump compressed: $(du -h "$dump_compressed" | cut -f1)"
        
        # Create database metadata
        cat > "$BACKUP_PATH/database/metadata.json" << EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "database": "$POSTGRES_DB",
    "host": "$POSTGRES_HOST",
    "port": "$POSTGRES_PORT",
    "user": "$POSTGRES_USER",
    "dump_file": "postgres_dump.sql.gz",
    "size": "$(stat -c%s "$dump_compressed" 2>/dev/null || stat -f%z "$dump_compressed" 2>/dev/null)"
}
EOF
        
    else
        error "Failed to create PostgreSQL dump"
    fi
}

# Backup Redis data
backup_redis() {
    log "Backing up Redis data..."
    
    local redis_dir="$BACKUP_PATH/database/redis"
    mkdir -p "$redis_dir"
    
    # Try to get Redis data directory
    local redis_data_dir="/var/lib/redis"
    if [[ -d "/data" ]] && docker ps | grep -q redis; then
        redis_data_dir="/data"  # Docker Redis default
    fi
    
    # Save Redis data
    if command -v redis-cli &> /dev/null; then
        if redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" BGSAVE > /dev/null 2>&1; then
            success "Redis background save initiated"
            
            # Wait for background save to complete
            sleep 2
            
            # Copy RDB file if it exists
            local rdb_files=("$redis_data_dir/dump.rdb" "/var/lib/redis/dump.rdb" "/data/dump.rdb")
            for rdb_file in "${rdb_files[@]}"; do
                if [[ -f "$rdb_file" ]]; then
                    cp "$rdb_file" "$redis_dir/"
                    success "Redis RDB file backed up: $(basename "$rdb_file")"
                    break
                fi
            done
        else
            warn "Could not initiate Redis background save"
        fi
    else
        warn "redis-cli not available, skipping Redis backup"
    fi
}

# Backup application files
backup_application_files() {
    log "Backing up application files..."
    
    local files_to_backup=(
        "package.json"
        "pnpm-lock.yaml"
        "turbo.json"
        ".env.example"
        "README.md"
        "docker-compose.yml"
        "docker-compose.prod.yml"
        "Dockerfile.web"
        "Dockerfile.api"
        "prisma/schema.prisma"
    )
    
    for file in "${files_to_backup[@]}"; do
        if [[ -f "$file" ]]; then
            cp "$file" "$BACKUP_PATH/files/"
            success "Backed up: $file"
        else
            warn "File not found: $file"
        fi
    done
    
    # Backup entire prisma directory
    if [[ -d "prisma" ]]; then
        cp -r "prisma" "$BACKUP_PATH/files/"
        success "Backed up prisma directory"
    fi
    
    # Backup custom configurations
    local config_dirs=("config" "scripts" "docker")
    for dir in "${config_dirs[@]}"; do
        if [[ -d "$dir" ]]; then
            cp -r "$dir" "$BACKUP_PATH/config/"
            success "Backed up $dir directory"
        fi
    done
}

# Backup logs
backup_logs() {
    log "Backing up logs..."
    
    # Application logs
    local log_sources=(
        "/var/log/nginx"
        "/var/log/codesenseisearch"
        "logs"
        ".next/logs"
        "dist/logs"
    )
    
    for log_source in "${log_sources[@]}"; do
        if [[ -d "$log_source" ]]; then
            cp -r "$log_source" "$BACKUP_PATH/logs/"
            success "Backed up logs from: $log_source"
        fi
    done
    
    # Docker logs if running in containers
    if command -v docker &> /dev/null && docker ps &> /dev/null; then
        local containers=("codesenseisearch-web-1" "codesenseisearch-api-1" "codesenseisearch-nginx-1")
        for container in "${containers[@]}"; do
            if docker ps --format "{{.Names}}" | grep -q "$container"; then
                docker logs "$container" > "$BACKUP_PATH/logs/${container}.log" 2>&1
                success "Backed up Docker logs for: $container"
            fi
        done
    fi
}

# Create backup manifest
create_manifest() {
    log "Creating backup manifest..."
    
    local manifest_file="$BACKUP_PATH/manifest.json"
    local total_size=$(du -sh "$BACKUP_PATH" | cut -f1)
    
    cat > "$manifest_file" << EOF
{
    "backup_info": {
        "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
        "version": "1.0",
        "hostname": "$(hostname)",
        "user": "$(whoami)",
        "backup_type": "full",
        "total_size": "$total_size"
    },
    "components": {
        "database": {
            "postgres": $([ -f "$BACKUP_PATH/database/postgres_dump.sql.gz" ] && echo "true" || echo "false"),
            "redis": $([ -d "$BACKUP_PATH/database/redis" ] && echo "true" || echo "false")
        },
        "application": {
            "files": $([ -d "$BACKUP_PATH/files" ] && echo "true" || echo "false"),
            "config": $([ -d "$BACKUP_PATH/config" ] && echo "true" || echo "false"),
            "logs": $([ -d "$BACKUP_PATH/logs" ] && echo "true" || echo "false")
        }
    },
    "restore_notes": {
        "postgres": "Use: gunzip -c postgres_dump.sql.gz | psql -d database_name",
        "redis": "Copy dump.rdb to Redis data directory and restart Redis",
        "files": "Restore application files to project root",
        "config": "Restore configuration files and restart services"
    }
}
EOF
    
    success "Backup manifest created"
}

# Compress backup
compress_backup() {
    log "Compressing backup..."
    
    local backup_name=$(basename "$BACKUP_PATH")
    local compressed_file="$BACKUP_DIR/${backup_name}.tar.gz"
    
    # Create compressed archive
    if tar -czf "$compressed_file" -C "$BACKUP_DIR" "$backup_name"; then
        success "Backup compressed: $compressed_file"
        success "Compressed size: $(du -h "$compressed_file" | cut -f1)"
        
        # Remove uncompressed backup
        rm -rf "$BACKUP_PATH"
        
        # Update BACKUP_PATH to point to compressed file
        BACKUP_PATH="$compressed_file"
    else
        error "Failed to compress backup"
    fi
}

# Upload to S3 (if configured)
upload_to_s3() {
    if [[ -z "$S3_BUCKET" ]]; then
        warn "S3_BUCKET not configured, skipping S3 upload"
        return
    fi
    
    log "Uploading backup to S3..."
    
    if ! command -v aws &> /dev/null; then
        error "AWS CLI not found. Please install AWS CLI to enable S3 uploads."
    fi
    
    local s3_key="backups/$(basename "$BACKUP_PATH")"
    
    if aws s3 cp "$BACKUP_PATH" "s3://$S3_BUCKET/$s3_key" --region "$S3_REGION"; then
        success "Backup uploaded to S3: s3://$S3_BUCKET/$s3_key"
        
        # Add S3 info to a separate metadata file
        local s3_info_file="$BACKUP_DIR/s3_uploads.log"
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) - $(basename "$BACKUP_PATH") - s3://$S3_BUCKET/$s3_key" >> "$s3_info_file"
    else
        error "Failed to upload backup to S3"
    fi
}

# Clean old backups
cleanup_old_backups() {
    log "Cleaning up old backups (keeping last $RETENTION_DAYS days)..."
    
    # Clean local backups
    find "$BACKUP_DIR" -name "*.tar.gz" -type f -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    
    local deleted_count
    deleted_count=$(find "$BACKUP_DIR" -name "20*" -type d -mtime +$RETENTION_DAYS 2>/dev/null | wc -l)
    find "$BACKUP_DIR" -name "20*" -type d -mtime +$RETENTION_DAYS -exec rm -rf {} + 2>/dev/null || true
    
    if [[ $deleted_count -gt 0 ]]; then
        success "Cleaned up $deleted_count old backup directories"
    fi
    
    # Clean S3 backups if configured
    if [[ -n "$S3_BUCKET" ]] && command -v aws &> /dev/null; then
        log "Cleaning up old S3 backups..."
        
        # List and delete old backups from S3
        aws s3 ls "s3://$S3_BUCKET/backups/" --region "$S3_REGION" | \
        awk '{print $4}' | \
        while read -r backup_file; do
            if [[ -n "$backup_file" ]]; then
                # Extract date from filename and check if it's older than retention period
                local file_date
                file_date=$(echo "$backup_file" | grep -o '[0-9]\{8\}' | head -1)
                if [[ -n "$file_date" ]]; then
                    local file_epoch
                    file_epoch=$(date -d "$file_date" +%s 2>/dev/null || date -j -f "%Y%m%d" "$file_date" +%s 2>/dev/null || echo "0")
                    local cutoff_epoch
                    cutoff_epoch=$(date -d "$RETENTION_DAYS days ago" +%s)
                    
                    if [[ $file_epoch -lt $cutoff_epoch && $file_epoch -gt 0 ]]; then
                        aws s3 rm "s3://$S3_BUCKET/backups/$backup_file" --region "$S3_REGION"
                        info "Deleted old S3 backup: $backup_file"
                    fi
                fi
            fi
        done
    fi
}

# Verify backup integrity
verify_backup() {
    log "Verifying backup integrity..."
    
    if [[ -f "$BACKUP_PATH" ]]; then
        # Test compressed archive
        if tar -tzf "$BACKUP_PATH" > /dev/null 2>&1; then
            success "Backup archive integrity verified"
        else
            error "Backup archive is corrupted"
        fi
        
        # Check if archive contains expected files
        local expected_files=("manifest.json" "database/" "files/" "config/")
        local missing_files=()
        
        for file in "${expected_files[@]}"; do
            if ! tar -tzf "$BACKUP_PATH" | grep -q "$file"; then
                missing_files+=("$file")
            fi
        done
        
        if [[ ${#missing_files[@]} -eq 0 ]]; then
            success "All expected backup components present"
        else
            warn "Missing backup components: ${missing_files[*]}"
        fi
    else
        error "Backup file not found: $BACKUP_PATH"
    fi
}

# Send notification
send_notification() {
    local status="$1"
    local message="$2"
    
    # Email notification (if configured)
    if [[ -n "$NOTIFICATION_EMAIL" ]] && command -v mail &> /dev/null; then
        echo "$message" | mail -s "CodeSenseiSearch Backup $status" "$NOTIFICATION_EMAIL"
    fi
    
    # Slack notification (if configured)
    if [[ -n "$SLACK_WEBHOOK_URL" ]]; then
        local color="good"
        if [[ "$status" == "FAILED" ]]; then
            color="danger"
        fi
        
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"attachments\":[{\"color\":\"$color\",\"title\":\"CodeSenseiSearch Backup $status\",\"text\":\"$message\"}]}" \
            "$SLACK_WEBHOOK_URL" > /dev/null 2>&1
    fi
    
    # Log notification
    info "Notification sent: $status - $message"
}

# Restore from backup
restore_backup() {
    local backup_file="$1"
    local restore_dir="${2:-/tmp/restore_$(date +%s)}"
    
    if [[ -z "$backup_file" ]]; then
        error "Backup file path required for restore"
    fi
    
    if [[ ! -f "$backup_file" ]]; then
        error "Backup file not found: $backup_file"
    fi
    
    log "Restoring backup from: $backup_file"
    log "Restore directory: $restore_dir"
    
    # Create restore directory
    mkdir -p "$restore_dir"
    
    # Extract backup
    if tar -xzf "$backup_file" -C "$restore_dir"; then
        success "Backup extracted to: $restore_dir"
        
        # Display restore instructions
        local manifest_file="$restore_dir/$(basename "$backup_file" .tar.gz)/manifest.json"
        if [[ -f "$manifest_file" ]]; then
            info "Restore instructions available in: $manifest_file"
            
            echo ""
            echo "Manual restore steps:"
            echo "1. Database restore:"
            echo "   gunzip -c $restore_dir/*/database/postgres_dump.sql.gz | psql -d $POSTGRES_DB"
            echo ""
            echo "2. Redis restore:"
            echo "   cp $restore_dir/*/database/redis/dump.rdb /var/lib/redis/ && systemctl restart redis"
            echo ""
            echo "3. Application files:"
            echo "   cp -r $restore_dir/*/files/* /path/to/project/"
            echo "   cp -r $restore_dir/*/config/* /path/to/project/"
            echo ""
        fi
    else
        error "Failed to extract backup"
    fi
}

# List available backups
list_backups() {
    log "Available local backups:"
    
    if [[ -d "$BACKUP_DIR" ]]; then
        find "$BACKUP_DIR" -name "*.tar.gz" -type f -exec ls -lh {} \; | \
        awk '{print $9, "(" $5 ")", $6, $7, $8}' | \
        sort -r
    else
        warn "Backup directory not found: $BACKUP_DIR"
    fi
    
    # List S3 backups if configured
    if [[ -n "$S3_BUCKET" ]] && command -v aws &> /dev/null; then
        echo ""
        log "Available S3 backups:"
        aws s3 ls "s3://$S3_BUCKET/backups/" --region "$S3_REGION" --human-readable --summarize
    fi
}

# Display help
show_help() {
    cat << EOF
Backup Script for CodeSenseiSearch

Usage: $0 [COMMAND] [OPTIONS]

Commands:
    backup                 Create full backup (default)
    restore FILE [DIR]     Restore from backup file
    list                   List available backups
    cleanup                Clean old backups only
    verify FILE            Verify backup integrity
    help                   Show this help message

Options:
    --skip-compress        Don't compress backup
    --skip-s3             Don't upload to S3
    --skip-cleanup        Don't clean old backups
    --no-verify           Don't verify backup integrity

Examples:
    $0                                           # Create full backup
    $0 backup --skip-s3                        # Backup without S3 upload
    $0 restore /var/backups/backup.tar.gz      # Restore from file
    $0 list                                     # List all backups
    $0 cleanup                                  # Clean old backups

Environment Variables:
    BACKUP_DIR            Backup directory (default: /var/backups/codesenseisearch)
    POSTGRES_HOST         PostgreSQL host (default: localhost)
    POSTGRES_PORT         PostgreSQL port (default: 5432)
    POSTGRES_DB           PostgreSQL database (default: codesenseisearch)
    POSTGRES_USER         PostgreSQL user (default: postgres)
    POSTGRES_PASSWORD     PostgreSQL password (required)
    REDIS_HOST            Redis host (default: localhost)
    REDIS_PORT            Redis port (default: 6379)
    RETENTION_DAYS        Backup retention in days (default: 30)
    S3_BUCKET             S3 bucket for backup storage
    S3_REGION             S3 region (default: us-east-1)
    NOTIFICATION_EMAIL    Email for backup notifications
    SLACK_WEBHOOK_URL     Slack webhook for notifications
EOF
}

# Main execution
main() {
    local command="${1:-backup}"
    local skip_compress=false
    local skip_s3=false
    local skip_cleanup=false
    local no_verify=false
    
    # Parse options
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-compress)
                skip_compress=true
                shift
                ;;
            --skip-s3)
                skip_s3=true
                shift
                ;;
            --skip-cleanup)
                skip_cleanup=true
                shift
                ;;
            --no-verify)
                no_verify=true
                shift
                ;;
            *)
                break
                ;;
        esac
    done
    
    # Source environment variables if .env exists
    if [[ -f ".env" ]]; then
        source .env
    fi
    
    case "$command" in
        "backup"|"")
            log "Starting CodeSenseiSearch backup..."
            
            start_time=$(date +%s)
            
            # Setup
            setup_backup_dir
            
            # Backup components
            backup_postgres
            backup_redis
            backup_application_files
            backup_logs
            create_manifest
            
            # Post-processing
            if [[ "$skip_compress" != "true" ]]; then
                compress_backup
            fi
            
            if [[ "$no_verify" != "true" ]]; then
                verify_backup
            fi
            
            if [[ "$skip_s3" != "true" ]]; then
                upload_to_s3
            fi
            
            if [[ "$skip_cleanup" != "true" ]]; then
                cleanup_old_backups
            fi
            
            # Calculate duration
            end_time=$(date +%s)
            duration=$((end_time - start_time))
            
            success "Backup completed successfully in ${duration}s"
            success "Backup location: $BACKUP_PATH"
            
            # Send success notification
            send_notification "SUCCESS" "Backup completed successfully in ${duration}s. Location: $BACKUP_PATH"
            ;;
        "restore")
            restore_backup "$2" "$3"
            ;;
        "list")
            list_backups
            ;;
        "cleanup")
            cleanup_old_backups
            ;;
        "verify")
            if [[ -z "$2" ]]; then
                error "Backup file path required for verification"
            fi
            BACKUP_PATH="$2"
            verify_backup
            ;;
        "help"|"--help"|"-h")
            show_help
            ;;
        *)
            error "Unknown command: $command. Use '$0 help' for usage information."
            ;;
    esac
}

# Error handling
trap 'error "Backup failed due to error on line $LINENO"' ERR

# Run main function with all arguments
main "$@"