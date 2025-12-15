#!/bin/sh
set -e

DB_PATH=${DB_PATH:-/app/apps/api/data/captures.db}

if [ -f "$DB_PATH" ]; then
    echo "Database exists, skipping restore"
elif [ "$SKIP_LITESTREAM" != "true" ]; then
    echo "Restoring database from replica (if exists)..."
    litestream restore -if-replica-exists -config /etc/litestream.yml "$DB_PATH"
fi

# Run migrations before starting the app
echo "Running database migrations..."
node --experimental-sqlite dist/migrate.js

# Start app with or without Litestream replication
if [ "$SKIP_LITESTREAM" = "true" ]; then
    echo "Starting app without Litestream (SKIP_LITESTREAM=true)..."
    exec node --experimental-sqlite dist/index.js
else
    exec litestream replicate -exec "node --experimental-sqlite dist/index.js" -config /etc/litestream.yml
fi
