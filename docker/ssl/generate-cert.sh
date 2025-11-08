#!/bin/bash

# SSL Certificate Generation Script for CodeSenseiSearch
# This script handles both development and production SSL certificate setup

set -e

# Configuration
DOMAIN="codesenseisearch.com"
CERT_DIR="/etc/ssl/certs"
NGINX_CONF_DIR="/etc/nginx"
CERTBOT_DIR="/var/www/certbot"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root"
    fi
}

# Create necessary directories
setup_directories() {
    log "Setting up directories..."
    mkdir -p "$CERT_DIR"
    mkdir -p "$CERTBOT_DIR"
    mkdir -p "/var/log/letsencrypt"
}

# Generate self-signed certificate for development
generate_self_signed() {
    log "Generating self-signed certificate for development..."
    
    # Create private key
    openssl genrsa -out "$CERT_DIR/$DOMAIN.key" 2048
    
    # Create certificate signing request
    openssl req -new -key "$CERT_DIR/$DOMAIN.key" -out "$CERT_DIR/$DOMAIN.csr" \
        -subj "/C=US/ST=CA/L=San Francisco/O=CodeSenseiSearch/OU=Development/CN=$DOMAIN"
    
    # Generate self-signed certificate
    openssl x509 -req -days 365 -in "$CERT_DIR/$DOMAIN.csr" \
        -signkey "$CERT_DIR/$DOMAIN.key" \
        -out "$CERT_DIR/$DOMAIN.crt" \
        -extensions v3_req \
        -config <(cat <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = CA
L = San Francisco
O = CodeSenseiSearch
OU = Development
CN = $DOMAIN

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = $DOMAIN
DNS.2 = www.$DOMAIN
DNS.3 = localhost
IP.1 = 127.0.0.1
EOF
)
    
    # Set proper permissions
    chmod 600 "$CERT_DIR/$DOMAIN.key"
    chmod 644 "$CERT_DIR/$DOMAIN.crt"
    
    # Clean up CSR
    rm -f "$CERT_DIR/$DOMAIN.csr"
    
    log "Self-signed certificate generated successfully"
    log "Certificate: $CERT_DIR/$DOMAIN.crt"
    log "Private key: $CERT_DIR/$DOMAIN.key"
}

# Install certbot if not present
install_certbot() {
    log "Checking for certbot installation..."
    
    if ! command -v certbot &> /dev/null; then
        log "Installing certbot..."
        
        # Detect OS and install accordingly
        if [[ -f /etc/debian_version ]]; then
            apt-get update
            apt-get install -y certbot python3-certbot-nginx
        elif [[ -f /etc/redhat-release ]]; then
            yum install -y epel-release
            yum install -y certbot python3-certbot-nginx
        else
            error "Unsupported operating system for automatic certbot installation"
        fi
    else
        log "Certbot is already installed"
    fi
}

# Generate Let's Encrypt certificate
generate_letsencrypt() {
    local email="$1"
    local staging="$2"
    
    if [[ -z "$email" ]]; then
        error "Email address is required for Let's Encrypt certificate"
    fi
    
    log "Generating Let's Encrypt certificate..."
    
    # Install certbot if needed
    install_certbot
    
    # Prepare certbot arguments
    local certbot_args=(
        "certonly"
        "--webroot"
        "--webroot-path=$CERTBOT_DIR"
        "--email=$email"
        "--agree-tos"
        "--no-eff-email"
        "--domains=$DOMAIN,www.$DOMAIN"
        "--cert-name=$DOMAIN"
    )
    
    # Add staging flag if requested
    if [[ "$staging" == "true" ]]; then
        certbot_args+=("--staging")
        log "Using Let's Encrypt staging environment"
    fi
    
    # Run certbot
    if certbot "${certbot_args[@]}"; then
        log "Let's Encrypt certificate generated successfully"
        
        # Copy certificates to our cert directory
        cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$CERT_DIR/$DOMAIN.crt"
        cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$CERT_DIR/$DOMAIN.key"
        
        # Set proper permissions
        chmod 600 "$CERT_DIR/$DOMAIN.key"
        chmod 644 "$CERT_DIR/$DOMAIN.crt"
        
        log "Certificates copied to $CERT_DIR"
    else
        error "Failed to generate Let's Encrypt certificate"
    fi
}

# Renew Let's Encrypt certificate
renew_certificate() {
    log "Renewing Let's Encrypt certificate..."
    
    if certbot renew --quiet; then
        log "Certificate renewed successfully"
        
        # Copy renewed certificates
        cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$CERT_DIR/$DOMAIN.crt"
        cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$CERT_DIR/$DOMAIN.key"
        
        # Reload nginx
        if command -v nginx &> /dev/null; then
            nginx -s reload
            log "Nginx reloaded"
        fi
    else
        warn "Certificate renewal failed or not needed"
    fi
}

# Validate certificate
validate_certificate() {
    log "Validating SSL certificate..."
    
    if [[ -f "$CERT_DIR/$DOMAIN.crt" && -f "$CERT_DIR/$DOMAIN.key" ]]; then
        # Check certificate validity
        local cert_info
        cert_info=$(openssl x509 -in "$CERT_DIR/$DOMAIN.crt" -text -noout)
        
        # Extract expiration date
        local expiry
        expiry=$(openssl x509 -in "$CERT_DIR/$DOMAIN.crt" -enddate -noout | cut -d= -f2)
        
        log "Certificate is valid"
        log "Expires: $expiry"
        
        # Check if certificate expires in less than 30 days
        local expiry_epoch
        expiry_epoch=$(date -d "$expiry" +%s)
        local current_epoch
        current_epoch=$(date +%s)
        local days_until_expiry
        days_until_expiry=$(( (expiry_epoch - current_epoch) / 86400 ))
        
        if [[ $days_until_expiry -lt 30 ]]; then
            warn "Certificate expires in $days_until_expiry days"
            return 1
        else
            log "Certificate is valid for $days_until_expiry more days"
        fi
    else
        error "Certificate files not found"
    fi
}

# Setup certificate auto-renewal
setup_auto_renewal() {
    log "Setting up certificate auto-renewal..."
    
    # Create renewal script
    cat > /usr/local/bin/ssl-renewal.sh << 'EOF'
#!/bin/bash
/usr/bin/certbot renew --quiet
if [ $? -eq 0 ]; then
    cp /etc/letsencrypt/live/codesenseisearch.com/fullchain.pem /etc/ssl/certs/codesenseisearch.com.crt
    cp /etc/letsencrypt/live/codesenseisearch.com/privkey.pem /etc/ssl/certs/codesenseisearch.com.key
    /usr/sbin/nginx -s reload
fi
EOF
    
    chmod +x /usr/local/bin/ssl-renewal.sh
    
    # Add to crontab (run twice daily)
    (crontab -l 2>/dev/null; echo "0 12,0 * * * /usr/local/bin/ssl-renewal.sh") | crontab -
    
    log "Auto-renewal configured to run twice daily"
}

# Display help
show_help() {
    cat << EOF
SSL Certificate Management for CodeSenseiSearch

Usage: $0 [COMMAND] [OPTIONS]

Commands:
    dev                     Generate self-signed certificate for development
    prod [EMAIL] [--staging] Generate Let's Encrypt certificate for production
    renew                   Renew existing Let's Encrypt certificate
    validate                Validate existing certificate
    auto-renew             Setup automatic certificate renewal
    help                   Show this help message

Options:
    --staging              Use Let's Encrypt staging environment (for testing)

Examples:
    $0 dev                                    # Generate self-signed cert
    $0 prod admin@example.com                 # Generate production cert
    $0 prod admin@example.com --staging       # Generate staging cert
    $0 renew                                  # Renew certificate
    $0 validate                               # Check certificate validity
    $0 auto-renew                             # Setup auto-renewal

Environment Variables:
    DOMAIN                 Domain name (default: codesenseisearch.com)
    CERT_DIR              Certificate directory (default: /etc/ssl/certs)
EOF
}

# Main execution
main() {
    local command="$1"
    
    case "$command" in
        "dev")
            check_root
            setup_directories
            generate_self_signed
            ;;
        "prod")
            local email="$2"
            local staging="false"
            
            if [[ "$3" == "--staging" ]]; then
                staging="true"
            fi
            
            check_root
            setup_directories
            generate_letsencrypt "$email" "$staging"
            setup_auto_renewal
            ;;
        "renew")
            check_root
            renew_certificate
            ;;
        "validate")
            validate_certificate
            ;;
        "auto-renew")
            check_root
            setup_auto_renewal
            ;;
        "help"|"--help"|"-h"|"")
            show_help
            ;;
        *)
            error "Unknown command: $command. Use '$0 help' for usage information."
            ;;
    esac
}

# Run main function with all arguments
main "$@"