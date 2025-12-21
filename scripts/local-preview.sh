#!/usr/bin/env bash
set -euo pipefail

# Local preview script for Yoink
# Builds Docker container, creates test credentials, copies token to clipboard

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check for jq
if ! command -v jq &> /dev/null; then
  echo -e "${RED}Error: jq is required but not installed.${NC}"
  echo "Run 'devbox shell' to enter the dev environment with jq installed."
  exit 1
fi

echo "Starting Yoink local preview..."

# Tear down any existing container
docker compose -f docker-compose.test.yml down 2>/dev/null || true

# Build and start container
docker compose -f docker-compose.test.yml up --build -d

# Wait for health check
echo "Waiting for API to be healthy..."
until curl -sf http://localhost:3333/api/health > /dev/null 2>&1; do
  sleep 1
done
echo -e "${GREEN}API is healthy${NC}"

# Login to admin and extract cookie
COOKIE=$(curl -s -X POST http://localhost:3333/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"test-admin-password"}' \
  -c - | grep admin_session | awk '{print $7}')

# Create org
ORG_ID=$(curl -s -X POST http://localhost:3333/api/admin/organizations \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_session=$COOKIE" \
  -d '{"name":"Local Preview"}' | jq -r '.id')

# Create user
USER_ID=$(curl -s -X POST "http://localhost:3333/api/admin/organizations/${ORG_ID}/users" \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_session=$COOKIE" \
  -d '{"email":"preview@local.test","name":"Preview User"}' | jq -r '.id')

# Create token
TOKEN=$(curl -s -X POST "http://localhost:3333/api/admin/users/${USER_ID}/tokens" \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_session=$COOKIE" \
  -d '{"name":"Preview Token"}' | jq -r '.rawToken')

# Copy to clipboard (macOS)
echo -n "$TOKEN" | pbcopy

echo ""
echo -e "${GREEN}Token copied to clipboard${NC}"
echo -e "${YELLOW}  $TOKEN${NC}"
echo ""
echo "Open: http://localhost:3333"
echo ""
echo "To stop: docker compose -f docker-compose.test.yml down"
