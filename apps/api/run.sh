#!/bin/sh
set -e

DB_PATH=/app/apps/api/data/captures.db

if [ -f "$DB_PATH" ]; then
    echo "Database exists, skipping restore"
else
    echo "Restoring database from replica (if exists)..."
    litestream restore -if-replica-exists -config /etc/litestream.yml "$DB_PATH"
fi

# Run migrations before starting the app
echo "Running database migrations..."
node --experimental-sqlite dist/migrate.js

exec litestream replicate -exec "node --experimental-sqlite dist/index.js" -config /etc/litestream.yml
