#!/bin/bash
#
# Test pending migrations against production schema with synthetic data.
#
# This script validates that pending migrations will succeed when deployed
# by running them against a local database that mirrors the production
# schema and contains synthetic data exercising all FK relationships.
#
# Prerequisites:
#   - TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables set
#   - Or: turso CLI logged in (for local development)
#
# Usage:
#   ./scripts/test-migrations.sh
#
#   Or with explicit credentials:
#   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... ./scripts/test-migrations.sh
#

set -e

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

# Check for required environment variables
if [ -z "$TURSO_DATABASE_URL" ]; then
    # Try to get from turso CLI if available
    if command -v turso &> /dev/null && turso auth whoami &> /dev/null 2>&1; then
        warn "TURSO_DATABASE_URL not set, attempting to get from turso CLI..."
        # This assumes a database named jhtc-yoink exists
        TURSO_DATABASE_URL=$(turso db show jhtc-yoink --url 2>/dev/null) || \
            error "Could not get database URL from turso CLI. Set TURSO_DATABASE_URL manually."
        export TURSO_DATABASE_URL
        
        # Get a read-only token
        if [ -z "$TURSO_AUTH_TOKEN" ]; then
            TURSO_AUTH_TOKEN=$(turso db tokens create jhtc-yoink --expiration 1h 2>/dev/null) || \
                error "Could not create auth token. Set TURSO_AUTH_TOKEN manually."
            export TURSO_AUTH_TOKEN
        fi
        info "Using database: $TURSO_DATABASE_URL"
    else
        error "TURSO_DATABASE_URL environment variable is required.

Set it explicitly:
  export TURSO_DATABASE_URL=libsql://your-db.turso.io
  export TURSO_AUTH_TOKEN=your-token

Or login with turso CLI:
  turso auth login"
    fi
fi

# Run the migration test
info "Testing pending migrations..."
cd "$(dirname "$0")/.." || exit 1

# Run from the api package
pnpm --filter @yoink/api exec tsx src/test-migrations.ts
