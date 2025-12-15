#!/bin/bash
set -e

COMPOSE_FILE="docker-compose.test.yml"
HEALTH_URL="http://localhost:3333/health"
MAX_RETRIES=30
RETRY_INTERVAL=2

cleanup() {
    echo "==> Cleaning up..."
    docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans 2>/dev/null || true
}

trap cleanup EXIT

echo "==> Building and starting Docker container..."
docker compose -f "$COMPOSE_FILE" up --build -d

echo "==> Waiting for health endpoint..."
for i in $(seq 1 $MAX_RETRIES); do
    if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
        echo "==> Health check passed!"
        curl -s "$HEALTH_URL"
        echo ""
        echo "==> Docker E2E test passed!"
        exit 0
    fi
    echo "    Attempt $i/$MAX_RETRIES - waiting ${RETRY_INTERVAL}s..."
    sleep $RETRY_INTERVAL
done

echo "==> Health check failed after $MAX_RETRIES attempts"
echo "==> Container logs:"
docker compose -f "$COMPOSE_FILE" logs
exit 1
