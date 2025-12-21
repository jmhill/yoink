# Database Access

This document describes how to access SQLite databases for development and debugging purposes.

## Local Development

The local development database is stored at:

```
apps/api/data/captures.db
```

### Connecting with Beekeeper Studio

1. Open Beekeeper Studio
2. New Connection -> SQLite
3. Browse to: `apps/api/data/captures.db`

### Notes

- The database is created automatically when you run the API
- If the API is running, SQLite locking may prevent write operations from Beekeeper
- For read-only exploration, you can connect while the API is running

## Production Database

Production data is stored on Fly.io with Litestream replication to S3-compatible storage (Tigris). There are two ways to access it:

### Option 1: Download Backup (Recommended)

Use the provided script to download a point-in-time snapshot:

```bash
./scripts/download-prod-db.sh
```

This will:
1. Fetch credentials from Fly.io (requires authenticated Fly CLI)
2. Run Litestream restore in a Docker container
3. Save the database to `./tmp/prod-backup.db`

**Prerequisites:**
- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) installed and authenticated (`fly auth login`)
- Docker running

**Connecting with Beekeeper Studio:**
1. Run the download script
2. Open Beekeeper Studio
3. New Connection -> SQLite
4. Browse to: `tmp/prod-backup.db`

**Notes:**
- This is a point-in-time snapshot, not live data
- Safe for exploration - no risk of modifying production
- Re-run the script to get a fresh backup

### Option 2: SSH + sqlite3 CLI

For quick one-off queries without downloading:

```bash
fly ssh console -a jhtc-yoink-api
sqlite3 /app/apps/api/data/captures.db
```

**Notes:**
- This queries the live production database
- Be careful with write operations
- CLI-only interface (no visual browsing)

## Database Schema

The database contains the following tables:

- `organizations` - Multi-tenant organizations
- `users` - Users belonging to organizations
- `api_tokens` - Authentication tokens for API access
- `captures` - The captured notes/content
- `admin_sessions` - Admin panel sessions

To explore the schema in sqlite3:

```sql
.tables
.schema captures
```

Or in Beekeeper Studio, use the table browser in the left sidebar.
