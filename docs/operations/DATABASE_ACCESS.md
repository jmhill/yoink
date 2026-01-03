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

Production data is stored in [Turso](https://turso.tech/), a hosted LibSQL database. The migration from file-based SQLite with Litestream was completed in Phase 7.5.

### Turso CLI Access

For quick queries, use the Turso CLI:

```bash
# Install Turso CLI (if not installed)
brew install tursodatabase/tap/turso

# Authenticate
turso auth login

# Connect to the production database
turso db shell yoink-prod
```

**Notes:**
- This queries the live production database
- Be careful with write operations
- SQL interface similar to sqlite3

### Download for Local Exploration

To explore production data safely in a GUI tool:

```bash
# Export database dump
turso db shell yoink-prod ".dump" > tmp/prod-dump.sql

# Create local SQLite file from dump
sqlite3 tmp/prod-backup.db < tmp/prod-dump.sql
```

**Connecting with Beekeeper Studio:**
1. Run the export commands above
2. Open Beekeeper Studio
3. New Connection -> SQLite
4. Browse to: `tmp/prod-backup.db`

**Notes:**
- This is a point-in-time snapshot, not live data
- Safe for exploration - no risk of modifying production
- Re-run the export to get a fresh backup

## Database Schema

The database contains the following tables:

**Core Domain:**
- `organizations` - Multi-tenant organizations
- `users` - Users (email-based identity)
- `captures` - The captured notes/content
- `tasks` - Tasks created from captures or directly

**Authentication & Authorization:**
- `api_tokens` - Authentication tokens for API/extension access
- `passkey_credentials` - WebAuthn passkey credentials for web app login
- `user_sessions` - Session tokens for web app authentication
- `organization_memberships` - User membership in organizations (with roles)
- `invitations` - Pending invitations to join organizations

To explore the schema:

**Turso CLI:**
```sql
.tables
.schema captures
```

**sqlite3 (local):**
```sql
.tables
.schema captures
```

Or in Beekeeper Studio, use the table browser in the left sidebar.
