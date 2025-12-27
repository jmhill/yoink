#!/bin/sh
set -e

# Run migrations before starting the app
# With Turso, migrations run against the remote database
echo "Running database migrations..."
node dist/migrate.js

# Start the application
echo "Starting application..."
exec node dist/index.js
