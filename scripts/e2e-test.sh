#!/bin/bash
set -e

COMPOSE_FILE="docker-compose.test.yml"
HEALTH_URL="http://localhost:3333/health"
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

echo "==> Running acceptance tests against container..."
TEST_BASE_URL="$TEST_BASE_URL" \
TEST_ADMIN_PASSWORD="$TEST_ADMIN_PASSWORD" \
pnpm --filter @yoink/acceptance-tests test

echo "==> E2E tests passed!"

# Generate feature report from test results (if JSON output exists)
RESULTS_FILE="packages/acceptance-tests/test-results.json"
if [ -f "$RESULTS_FILE" ]; then
    echo ""
    echo "==> Feature Report"
    echo "===================="
    
    # Parse JSON and generate markdown-style report
    node -e "
const fs = require('fs');
const results = JSON.parse(fs.readFileSync('$RESULTS_FILE', 'utf8'));

const driver = process.env.DRIVER || 'http';

console.log('');
console.log('| Feature | Tests | Status | Driver |');
console.log('|---------|-------|--------|--------|');

for (const file of results.testResults) {
    const name = file.name.split('/').pop().replace('.test.ts', '').replace(/-/g, ' ');
    const featureName = name.charAt(0).toUpperCase() + name.slice(1);
    const passed = file.assertionResults.filter(t => t.status === 'passed').length;
    const total = file.assertionResults.length;
    const status = passed === total ? '✅ Pass' : '❌ Fail';
    console.log('| ' + featureName + ' | ' + passed + '/' + total + ' | ' + status + ' | ' + driver + ' |');
}

const totalPassed = results.numPassedTests;
const totalTests = results.numTotalTests;
console.log('');
console.log('**Total: ' + totalPassed + '/' + totalTests + ' tests passed**');
"
fi
