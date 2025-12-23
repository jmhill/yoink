#!/bin/bash
set -e

COMPOSE_FILE="docker-compose.test.yml"
HEALTH_URL="http://localhost:3333/api/health"
MAX_RETRIES=30
RETRY_INTERVAL=2

# Test configuration
TEST_BASE_URL="http://localhost:3333"
TEST_ADMIN_PASSWORD="test-admin-password"

cleanup() {
    echo "==> Cleaning up..."
    docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans 2>/dev/null || true
}

trap cleanup EXIT

echo "==> Starting Docker container..."
if [ -n "$IMAGE" ]; then
    echo "    Using pre-built image: $IMAGE"
    docker compose -f "$COMPOSE_FILE" up -d
else
    echo "    Building from Dockerfile..."
    docker compose -f "$COMPOSE_FILE" up --build -d
fi

echo "==> Waiting for health endpoint..."
for i in $(seq 1 $MAX_RETRIES); do
    if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
        echo "==> Health check passed!"
        curl -s "$HEALTH_URL"
        echo ""
        break
    fi
    
    if [ "$i" -eq "$MAX_RETRIES" ]; then
        echo "==> Health check failed after $MAX_RETRIES attempts"
        echo "==> Container logs:"
        docker compose -f "$COMPOSE_FILE" logs
        exit 1
    fi
    
    echo "    Attempt $i/$MAX_RETRIES - waiting ${RETRY_INTERVAL}s..."
    sleep $RETRY_INTERVAL
done

echo "==> Running acceptance tests (HTTP + Playwright drivers)..."
TEST_BASE_URL="$TEST_BASE_URL" \
TEST_ADMIN_PASSWORD="$TEST_ADMIN_PASSWORD" \
pnpm turbo run test --filter=@yoink/acceptance-tests

echo "==> E2E tests complete!"
