#!/bin/bash
set -e

COMPOSE_FILE="docker-compose.test.yml"
HEALTH_URL="http://localhost:3333/api/health"
MAX_RETRIES=30
RETRY_INTERVAL=2
LOG_DIR="$PWD/e2e-api-logs"
API_LOG="$LOG_DIR/api.log"
log_pid=""

# Test configuration
TEST_BASE_URL="http://localhost:3333"
TEST_ADMIN_PASSWORD="test-admin-password"

cleanup() {
    if [ -n "$log_pid" ]; then
        kill "$log_pid" 2>/dev/null || true
        wait "$log_pid" 2>/dev/null || true
        log_pid=""
    fi
    echo "==> Cleaning up..."
    docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans 2>/dev/null || true
}

trap cleanup EXIT

echo "==> Building Docker image..."
if [ -n "$IMAGE" ]; then
    echo "    Using pre-built image: $IMAGE"
else
    echo "    Building from Dockerfile..."
    docker compose -f "$COMPOSE_FILE" build
fi

echo "==> Running database migrations..."
docker compose -f "$COMPOSE_FILE" run --rm api node dist/migrate.js

echo "==> Starting Docker container..."
if [ -n "$IMAGE" ]; then
    docker compose -f "$COMPOSE_FILE" up -d
else
    docker compose -f "$COMPOSE_FILE" up -d
fi

mkdir -p "$LOG_DIR"
: > "$API_LOG"
cid=""
for _ in $(seq 1 60); do
    cid=$(docker compose -f "$COMPOSE_FILE" ps -q api | head -n 1)
    if [ -n "$cid" ]; then
        break
    fi
    sleep 0.5
done
if [ -n "$cid" ]; then
    docker logs -f "$cid" >> "$API_LOG" 2>&1 &
    log_pid=$!
else
    echo "api container never appeared" > "$API_LOG"
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
YOINK_API_LOG="$API_LOG" \
pnpm turbo run test --filter=@yoink/acceptance-tests

echo "==> E2E tests complete!"
