#!/bin/bash

# Database Performance Analysis Script
# Analyzes PostgreSQL performance and provides optimization recommendations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Database connection parameters
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-codesenseisearch}"
DB_USER="${DB_USER:-postgres}"
OUTPUT_DIR="${OUTPUT_DIR:-./performance/database/reports}"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

print_header() {
    echo -e "${BLUE}===========================================${NC}"
    echo -e "${BLUE}  Database Performance Analysis Report   ${NC}"
    echo -e "${BLUE}===========================================${NC}"
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
    if ! command -v psql &> /dev/null; then
        print_error "psql is not installed. Please install PostgreSQL client tools."
        exit 1
    fi
}

test_connection() {
    print_status "Testing database connection..."
    
    if PGPASSWORD="$PGPASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
        print_status "Database connection successful"
    else
        print_error "Cannot connect to database. Please check connection parameters."
        echo "Connection details:"
        echo "  Host: $DB_HOST"
        echo "  Port: $DB_PORT"
        echo "  Database: $DB_NAME"
        echo "  User: $DB_USER"
        echo ""
        echo "Set PGPASSWORD environment variable for authentication."
        exit 1
    fi
}

run_query() {
    local query="$1"
    local output_file="$2"
    
    PGPASSWORD="$PGPASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "$query" > "$output_file" 2>&1
}

analyze_database_size() {
    print_status "Analyzing database size and table statistics..."
    
    local report_file="$OUTPUT_DIR/database_size_$(date +%Y%m%d_%H%M%S).txt"
    
    cat > "$report_file" << EOF
# Database Size Analysis Report
Generated: $(date)

## Database Overview
EOF

    # Database size
    run_query "
    SELECT 
        pg_database.datname as database_name,
        pg_size_pretty(pg_database_size(pg_database.datname)) as size
    FROM pg_database 
    WHERE datname = '$DB_NAME';
    " "$report_file.tmp"
    
    echo "" >> "$report_file"
    echo "## Database Size" >> "$report_file"
    cat "$report_file.tmp" >> "$report_file"
    
    # Table sizes
    run_query "
    SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
        pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
    " "$report_file.tmp"
    
    echo "" >> "$report_file"
    echo "## Table Sizes" >> "$report_file"
    cat "$report_file.tmp" >> "$report_file"
    
    rm -f "$report_file.tmp"
    print_status "Database size analysis saved to: $report_file"
}

analyze_query_performance() {
    print_status "Analyzing query performance..."
    
    local report_file="$OUTPUT_DIR/query_performance_$(date +%Y%m%d_%H%M%S).txt"
    
    cat > "$report_file" << EOF
# Query Performance Analysis Report
Generated: $(date)

## Slow Queries (Average execution time > 100ms)
EOF

    # Check if pg_stat_statements is enabled
    run_query "SELECT * FROM pg_extension WHERE extname = 'pg_stat_statements';" "$report_file.tmp"
    
    if [ -s "$report_file.tmp" ]; then
        run_query "
        SELECT 
            substring(query, 1, 80) as query_snippet,
            calls,
            round(total_time::numeric, 2) as total_time_ms,
            round(mean_time::numeric, 2) as mean_time_ms,
            round(stddev_time::numeric, 2) as stddev_time_ms,
            rows,
            round(100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0), 2) AS hit_percent
        FROM pg_stat_statements 
        WHERE mean_time > 100
        ORDER BY total_time DESC
        LIMIT 20;
        " "$report_file.tmp"
        
        cat "$report_file.tmp" >> "$report_file"
    else
        echo "pg_stat_statements extension is not enabled. Enable it for detailed query analysis." >> "$report_file"
    fi
    
    # Current activity
    echo "" >> "$report_file"
    echo "## Current Database Activity" >> "$report_file"
    
    run_query "
    SELECT 
        datname,
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections,
        count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
    FROM pg_stat_activity 
    WHERE datname IS NOT NULL
    GROUP BY datname;
    " "$report_file.tmp"
    
    cat "$report_file.tmp" >> "$report_file"
    
    rm -f "$report_file.tmp"
    print_status "Query performance analysis saved to: $report_file"
}

analyze_indexes() {
    print_status "Analyzing index usage and recommendations..."
    
    local report_file="$OUTPUT_DIR/index_analysis_$(date +%Y%m%d_%H%M%S).txt"
    
    cat > "$report_file" << EOF
# Index Analysis Report
Generated: $(date)

## Unused Indexes (Low usage, high maintenance cost)
EOF

    run_query "
    SELECT 
        schemaname as schema,
        tablename as table,
        indexname as index,
        pg_size_pretty(pg_relation_size(indexrelid)) as size,
        idx_scan as scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
    FROM pg_stat_user_indexes 
    WHERE schemaname = 'public'
        AND idx_scan < 10
    ORDER BY pg_relation_size(indexrelid) DESC;
    " "$report_file.tmp"
    
    cat "$report_file.tmp" >> "$report_file"
    
    echo "" >> "$report_file"
    echo "## Missing Index Candidates (High cardinality, low correlation)" >> "$report_file"
    
    run_query "
    SELECT 
        schemaname,
        tablename,
        attname as column_name,
        n_distinct,
        correlation,
        (abs(n_distinct) * (1 - abs(correlation))) as priority_score
    FROM pg_stats 
    WHERE schemaname = 'public'
        AND n_distinct > 100
        AND abs(correlation) < 0.1
    ORDER BY priority_score DESC
    LIMIT 20;
    " "$report_file.tmp"
    
    cat "$report_file.tmp" >> "$report_file"
    
    rm -f "$report_file.tmp"
    print_status "Index analysis saved to: $report_file"
}

analyze_table_maintenance() {
    print_status "Analyzing table maintenance needs..."
    
    local report_file="$OUTPUT_DIR/maintenance_analysis_$(date +%Y%m%d_%H%M%S).txt"
    
    cat > "$report_file" << EOF
# Table Maintenance Analysis Report
Generated: $(date)

## Tables Needing VACUUM (High dead tuple ratio)
EOF

    run_query "
    SELECT 
        schemaname,
        tablename,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes,
        n_dead_tup as dead_tuples,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        last_autoanalyze,
        CASE 
            WHEN n_dead_tup > 0 AND (n_tup_ins + n_tup_upd + n_tup_del) > 0
            THEN round(n_dead_tup::numeric / (n_tup_ins + n_tup_upd + n_tup_del)::numeric * 100, 2)
            ELSE 0
        END as dead_tuple_percent
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
        AND n_dead_tup > 1000
    ORDER BY n_dead_tup DESC;
    " "$report_file.tmp"
    
    cat "$report_file.tmp" >> "$report_file"
    
    echo "" >> "$report_file"
    echo "## Table Bloat Analysis" >> "$report_file"
    
    run_query "
    SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
        pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size,
        n_tup_ins + n_tup_upd + n_tup_del as total_writes,
        CASE 
            WHEN n_tup_ins + n_tup_upd + n_tup_del > 0 
            THEN round((n_tup_upd + n_tup_del)::numeric / (n_tup_ins + n_tup_upd + n_tup_del)::numeric * 100, 2)
            ELSE 0 
        END as modification_percent
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
    " "$report_file.tmp"
    
    cat "$report_file.tmp" >> "$report_file"
    
    rm -f "$report_file.tmp"
    print_status "Table maintenance analysis saved to: $report_file"
}

generate_recommendations() {
    print_status "Generating optimization recommendations..."
    
    local report_file="$OUTPUT_DIR/recommendations_$(date +%Y%m%d_%H%M%S).md"
    
    cat > "$report_file" << EOF
# Database Optimization Recommendations

Generated: $(date)

## Performance Recommendations

### 1. Query Optimization
- Review slow queries identified in the query performance report
- Consider adding indexes for frequently filtered columns
- Optimize queries with low cache hit ratios

### 2. Index Management
- Remove unused indexes to reduce maintenance overhead
- Add missing indexes for high-cardinality, low-correlation columns
- Consider partial indexes for frequently filtered subsets

### 3. Table Maintenance
- Schedule regular VACUUM operations for tables with high dead tuple ratios
- Consider REINDEX for heavily updated indexes
- Monitor table bloat and plan maintenance accordingly

### 4. Search-Specific Optimizations
- Ensure GIN indexes are created for full-text search columns
- Consider using partial indexes for active content only
- Implement materialized views for expensive aggregations

### 5. Application-Level Optimizations
- Implement connection pooling to reduce connection overhead
- Use prepared statements for frequently executed queries
- Consider caching frequently accessed data in Redis

## Maintenance Schedule

### Daily
- Monitor slow query log
- Check connection counts and active queries
- Review disk space usage

### Weekly
- Analyze query performance trends
- Review index usage statistics
- Update table statistics if needed

### Monthly
- Deep analysis of table bloat
- Review and optimize materialized views
- Plan for index maintenance

## Configuration Tuning

Consider adjusting these PostgreSQL parameters based on your workload:

\`\`\`sql
-- Memory settings
shared_buffers = '256MB'              -- 25% of available RAM
effective_cache_size = '1GB'          -- 75% of available RAM
work_mem = '4MB'                      -- Per connection work memory

-- Checkpoints and WAL
checkpoint_completion_target = 0.9
wal_buffers = '16MB'
min_wal_size = '1GB'
max_wal_size = '4GB'

-- Planner settings
default_statistics_target = 100
random_page_cost = 1.1               -- For SSD storage
effective_io_concurrency = 200       -- For SSD storage

-- Autovacuum settings
autovacuum_max_workers = 3
autovacuum_naptime = '20s'
autovacuum_vacuum_threshold = 50
autovacuum_analyze_threshold = 50
\`\`\`

## Monitoring Setup

1. Enable pg_stat_statements for query analysis
2. Set up regular backups of performance statistics
3. Monitor key metrics: connection count, cache hit ratio, query response times
4. Set up alerts for high resource usage

EOF

    print_status "Optimization recommendations saved to: $report_file"
}

show_usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --size          Analyze database and table sizes only"
    echo "  --queries       Analyze query performance only"
    echo "  --indexes       Analyze index usage only"
    echo "  --maintenance   Analyze table maintenance needs only"
    echo "  --all           Run all analyses (default)"
    echo ""
    echo "Environment Variables:"
    echo "  DB_HOST         Database host (default: localhost)"
    echo "  DB_PORT         Database port (default: 5432)"
    echo "  DB_NAME         Database name (default: codesenseisearch)"
    echo "  DB_USER         Database user (default: postgres)"
    echo "  PGPASSWORD      Database password"
    echo "  OUTPUT_DIR      Output directory (default: ./performance/database/reports)"
    echo ""
    echo "Examples:"
    echo "  PGPASSWORD=mypass $0                    # Run full analysis"
    echo "  PGPASSWORD=mypass $0 --queries          # Analyze queries only"
    echo "  DB_HOST=prod-db PGPASSWORD=mypass $0    # Analyze production database"
}

main() {
    print_header
    
    local analysis_type="${1:-all}"
    
    if [ "$analysis_type" = "help" ] || [ "$analysis_type" = "--help" ] || [ "$analysis_type" = "-h" ]; then
        show_usage
        exit 0
    fi
    
    check_dependencies
    test_connection
    
    case "$analysis_type" in
        "--size")
            analyze_database_size
            ;;
        "--queries")
            analyze_query_performance
            ;;
        "--indexes")
            analyze_indexes
            ;;
        "--maintenance")
            analyze_table_maintenance
            ;;
        "--all"|*)
            analyze_database_size
            analyze_query_performance
            analyze_indexes
            analyze_table_maintenance
            generate_recommendations
            ;;
    esac
    
    print_status "Database analysis completed!"
    print_status "Reports saved to: $OUTPUT_DIR"
}

# Run main function
main "$@"