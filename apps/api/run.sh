#!/bin/sh
set -e

# Migrations are run via Fly.io release_command (see fly.toml)
# This ensures they run exactly once per deploy, before any machines are updated.

# Start the application
echo "Starting application..."
exec node dist/index.js
