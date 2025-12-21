#!/bin/bash
#
# Download the production database backup using Litestream restore.
# Fetches credentials from Fly.io secrets and runs restore in a container.
#
# Prerequisites:
#   - Fly CLI installed and authenticated (fly auth login)
#   - Docker running
#
# Output: ./tmp/prod-backup.db
#

set -e

APP_NAME="jhtc-yoink-api"
OUTPUT_DIR="./tmp"
OUTPUT_FILE="prod-backup.db"
LITESTREAM_IMAGE="litestream/litestream:0.3.13"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

error() {
    echo -e "${RED}Error: $1${NC}" >&2
    exit 1
}

info() {
    echo -e "${GREEN}$1${NC}"
}

warn() {
    echo -e "${YELLOW}$1${NC}"
}

# Check prerequisites
check_prerequisites() {
    if ! command -v fly &> /dev/null; then
        error "Fly CLI not found. Install from https://fly.io/docs/hands-on/install-flyctl/"
    fi

    if ! fly auth whoami &> /dev/null; then
        error "Not authenticated with Fly. Run 'fly auth login' first."
    fi

    if ! docker info &> /dev/null; then
        error "Docker is not running. Start Docker and try again."
    fi
}

# Fetch all required secrets using fly ssh
fetch_secrets() {
    info "Fetching secrets from Fly.io..."
    
    # Use fly ssh to read env vars from the running machine
    BUCKET_NAME=$(fly ssh console -a "$APP_NAME" -C "printenv BUCKET_NAME" 2>/dev/null) || \
        error "Failed to fetch BUCKET_NAME. Is the app running?"
    AWS_ENDPOINT_URL_S3=$(fly ssh console -a "$APP_NAME" -C "printenv AWS_ENDPOINT_URL_S3" 2>/dev/null) || \
        error "Failed to fetch AWS_ENDPOINT_URL_S3"
    AWS_ACCESS_KEY_ID=$(fly ssh console -a "$APP_NAME" -C "printenv AWS_ACCESS_KEY_ID" 2>/dev/null) || \
        error "Failed to fetch AWS_ACCESS_KEY_ID"
    AWS_SECRET_ACCESS_KEY=$(fly ssh console -a "$APP_NAME" -C "printenv AWS_SECRET_ACCESS_KEY" 2>/dev/null) || \
        error "Failed to fetch AWS_SECRET_ACCESS_KEY"
    
    # Trim any whitespace/newlines
    BUCKET_NAME=$(echo "$BUCKET_NAME" | tr -d '[:space:]')
    AWS_ENDPOINT_URL_S3=$(echo "$AWS_ENDPOINT_URL_S3" | tr -d '[:space:]')
    AWS_ACCESS_KEY_ID=$(echo "$AWS_ACCESS_KEY_ID" | tr -d '[:space:]')
    AWS_SECRET_ACCESS_KEY=$(echo "$AWS_SECRET_ACCESS_KEY" | tr -d '[:space:]')
}

# Confirm with user
confirm() {
    warn "This will download the production database from Fly.io."
    warn "The backup will be saved to: ${OUTPUT_DIR}/${OUTPUT_FILE}"
    echo ""
    read -p "Continue? [y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
}

# Run litestream restore in container
run_restore() {
    info "Creating output directory..."
    mkdir -p "$OUTPUT_DIR"
    
    info "Pulling Litestream image..."
    docker pull "$LITESTREAM_IMAGE" --quiet
    
    info "Restoring database from S3 backup..."
    
    # Create a Litestream config file for restore
    # Note: URL parameters don't work with Tigris, config file approach is required
    local config_file="${OUTPUT_DIR}/litestream-restore.yml"
    cat > "$config_file" << EOF
dbs:
  - path: /data/${OUTPUT_FILE}
    replicas:
      - type: s3
        bucket: ${BUCKET_NAME}
        path: backups
        endpoint: ${AWS_ENDPOINT_URL_S3}
        region: auto
        force-path-style: true
EOF
    
    docker run --rm \
        -v "$(pwd)/${OUTPUT_DIR}:/data" \
        -e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
        -e AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
        "$LITESTREAM_IMAGE" \
        restore -config "/data/litestream-restore.yml" "/data/${OUTPUT_FILE}"
    
    # Clean up config file
    rm -f "$config_file"
    
    info "Database restored successfully!"
    echo ""
    info "Output: ${OUTPUT_DIR}/${OUTPUT_FILE}"
    echo ""
    echo "Connect with Beekeeper Studio:"
    echo "  1. Open Beekeeper Studio"
    echo "  2. New Connection -> SQLite"
    echo "  3. Browse to: $(pwd)/tmp/${OUTPUT_FILE}"
}

# Main
main() {
    check_prerequisites
    confirm
    fetch_secrets
    run_restore
}

main "$@"
