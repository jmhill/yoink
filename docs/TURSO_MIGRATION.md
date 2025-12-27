# Turso Migration Plan

This document outlines the migration from `node:sqlite` (synchronous, file-based SQLite on Fly.io volume) to `@libsql/client` (async, Turso-hosted) to enable zero-downtime deployments.

## Motivation

**Current Setup:**
- SQLite on Fly.io volume with Litestream backup to S3
- Single machine with rolling deployments
- Downtime during deploys (volume can only be mounted by one machine at a time)

**After Migration:**
- Turso-hosted LibSQL database
- Blue/green deployments with zero downtime
- No volume management, simpler infrastructure

## Decision Record

**Why Turso over alternatives?**

| Option | Effort | Outcome |
|--------|--------|---------|
| **Turso** | Medium | Keep Fly.io, swap database client |
| Cloudflare D1 | Very High | Would require re-platforming to Workers |
| Neon (Postgres) | High | SQL dialect changes throughout codebase |
| LiteFS | Medium-High | Self-managed, complex Consul setup |

Turso was chosen because:
1. LibSQL is SQLite-compatible (minimal query changes)
2. `@libsql/client` works from any server (keeps Fly.io)
3. Store interfaces are already async (`ResultAsync`), so public APIs don't change
4. Embedded replicas available later if latency becomes an issue

---

## Pre-Migration Checklist

- [x] Create Turso account and database
- [x] Restore data from Litestream S3 backup
- [x] Set Fly.io secrets (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`)
- [x] Verify local development workflow with file-based LibSQL

## Migration Status: COMPLETE ✓

The migration was completed on 2024-12-27. Key outcomes:
- Database now hosted on Turso in `iad` region (East Coast)
- Blue-green deployments enabled for zero-downtime deploys
- Litestream backup system removed (Turso handles replication)
- Fly.io volume deleted
- Machine relocated from `sjc` to `iad` for lower latency to Turso

---

## Phase 0: Turso Setup (Manual)

### 0.1 Create Turso Database

```bash
# Install Turso CLI
brew install tursodatabase/tap/turso

# Login
turso auth login

# Create database in same region as Fly.io (East Coast)
turso db create yoink-prod --location iad

# Get connection URL
turso db show yoink-prod --url
# Output: libsql://yoink-prod-YOUR_ORG.turso.io

# Create auth token
turso db tokens create yoink-prod
```

### 0.2 Restore Data from Litestream Backup

```bash
# Option A: Restore locally using litestream
litestream restore -o local-restore.db \
  -config /path/to/litestream.yml \
  s3://BUCKET_NAME/backups

# Option B: Download from Fly volume directly
fly ssh console -a jhtc-yoink-api
# Then copy the database file

# Export to SQL
sqlite3 local-restore.db .dump > dump.sql

# Import to Turso
turso db shell yoink-prod < dump.sql
```

### 0.3 Add Fly.io Secrets

```bash
fly secrets set TURSO_DATABASE_URL="libsql://yoink-prod-YOUR_ORG.turso.io" -a jhtc-yoink-api
fly secrets set TURSO_AUTH_TOKEN="your-token-here" -a jhtc-yoink-api
```

---

## Phase 1: Add Dependencies

```bash
cd apps/api
pnpm add @libsql/client
```

---

## Phase 2: Database Abstraction Layer

### 2.1 New Database Types (`database/types.ts`)

Replace `DatabaseSync` with an abstract `Database` interface:

```typescript
export type Database = {
  execute: (query: { sql: string; args?: unknown[] }) => Promise<QueryResult>;
  batch: (queries: { sql: string; args?: unknown[] }[], mode?: 'write' | 'read') => Promise<void>;
  close: () => Promise<void>;
};

export type QueryResult = {
  rows: Record<string, unknown>[];
  rowsAffected: number;
  lastInsertRowid?: number | bigint;
};

// Migration type updated to async
export type Migration = {
  version: number;
  name: string;
  up: (db: Database) => Promise<void>;
};
```

### 2.2 LibSQL Client Implementation (`database/database.ts`)

```typescript
import { createClient, type Client } from '@libsql/client';

export type DatabaseConfig = 
  | { type: 'turso'; url: string; authToken?: string }
  | { type: 'memory' }
  | { type: 'file'; path: string };

export const createDatabase = (config: DatabaseConfig): Database => {
  let client: Client;
  
  switch (config.type) {
    case 'turso':
      client = createClient({ url: config.url, authToken: config.authToken });
      break;
    case 'memory':
      client = createClient({ url: ':memory:' });
      break;
    case 'file':
      client = createClient({ url: `file:${config.path}` });
      break;
  }

  return {
    execute: async (query) => {
      const result = await client.execute(query);
      return {
        rows: result.rows as Record<string, unknown>[],
        rowsAffected: result.rowsAffected,
        lastInsertRowid: result.lastInsertRowid,
      };
    },
    batch: async (queries, mode = 'write') => {
      await client.batch(queries, mode);
    },
    close: async () => {
      client.close();
    },
  };
};
```

---

## Phase 3: Update Config Schema

### 3.1 `config/schema.ts`

```typescript
const TursoDatabaseConfigSchema = z.object({
  type: z.literal('turso'),
  url: z.string(),
  authToken: z.string().optional(),
});

const MemoryDatabaseConfigSchema = z.object({
  type: z.literal('memory'),
});

const FileDatabaseConfigSchema = z.object({
  type: z.literal('file'),
  path: z.string(),
});

export const DatabaseConfigSchema = z.discriminatedUnion('type', [
  TursoDatabaseConfigSchema,
  MemoryDatabaseConfigSchema,
  FileDatabaseConfigSchema,
]);
```

### 3.2 `config/config.ts`

```typescript
export const loadConfig = async (): Promise<AppConfig> => {
  const database: DatabaseConfig = process.env.TURSO_DATABASE_URL
    ? {
        type: 'turso',
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      }
    : {
        type: 'file',
        path: process.env.DB_PATH ?? './data/captures.db',
      };

  return {
    // ... rest of config
    database,
  };
};
```

---

## Phase 4: Update Store Implementations

**Files to update (7 total):**
1. `captures/infrastructure/sqlite-capture-store.ts`
2. `tasks/infrastructure/sqlite-task-store.ts`
3. `auth/infrastructure/sqlite-user-store.ts`
4. `auth/infrastructure/sqlite-token-store.ts`
5. `auth/infrastructure/sqlite-organization-store.ts`
6. `auth/infrastructure/sqlite-organization-membership-store.ts`
7. `auth/infrastructure/sqlite-passkey-credential-store.ts`

### Pattern Change

**Before (sync, wrapped in ResultAsync):**
```typescript
const stmt = db.prepare(`SELECT * FROM captures WHERE id = ?`);
const row = stmt.get(id) as CaptureRow | undefined;
return okAsync(row ? rowToCapture(row) : null);
```

**After (truly async):**
```typescript
const result = await db.execute({
  sql: `SELECT * FROM captures WHERE id = ?`,
  args: [id],
});
const row = result.rows[0] as CaptureRow | undefined;
return okAsync(row ? rowToCapture(row) : null);
```

### Key Changes Per File

| Old Pattern | New Pattern |
|-------------|-------------|
| `db.prepare(sql).get(...args)` | `await db.execute({ sql, args })` then `result.rows[0]` |
| `db.prepare(sql).run(...args)` | `await db.execute({ sql, args })` |
| `db.prepare(sql).all(...args)` | `await db.execute({ sql, args })` then `result.rows` |
| `db.exec(sql)` | `await db.execute({ sql })` |

---

## Phase 5: Update Transaction Utility

### `database/transaction.ts`

LibSQL supports interactive transactions:

```typescript
import type { Database } from './types.js';
import type { ResultAsync } from 'neverthrow';

export const withTransaction = async <T, E>(
  db: Database,
  fn: () => ResultAsync<T, E>
): Promise<Result<T, E>> => {
  await db.execute({ sql: 'BEGIN TRANSACTION' });
  
  try {
    const result = await fn();
    
    if (result.isOk()) {
      await db.execute({ sql: 'COMMIT' });
    } else {
      await db.execute({ sql: 'ROLLBACK' });
    }
    
    return result;
  } catch (error) {
    await db.execute({ sql: 'ROLLBACK' });
    throw error;
  }
};
```

---

## Phase 6: Update Migrator

### `database/migrator.ts`

```typescript
export const runMigrations = async (
  db: Database,
  migrations: Migration[]
): Promise<MigrationResult> => {
  // Create migrations table
  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`,
  });

  // Get applied migrations
  const { rows } = await db.execute({ 
    sql: 'SELECT version, name FROM _migrations' 
  });
  const applied = new Map(
    rows.map((r) => [r.version as number, r.name as string])
  );

  const result: MigrationResult = { applied: [], alreadyApplied: [] };
  const sorted = [...migrations].sort((a, b) => a.version - b.version);

  for (const migration of sorted) {
    const existingName = applied.get(migration.version);

    if (existingName !== undefined) {
      if (existingName !== migration.name) {
        throw new Error(`Migration version ${migration.version} inconsistent`);
      }
      result.alreadyApplied.push(migration.name);
      continue;
    }

    // Apply migration
    await migration.up(db);

    await db.execute({
      sql: 'INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)',
      args: [migration.version, migration.name, new Date().toISOString()],
    });

    result.applied.push(migration.name);
  }

  return result;
};
```

### Migration Files (16 files)

Each migration becomes async:

```typescript
// Before
export const migration: Migration = {
  version: 1,
  name: 'create_organizations',
  up: (db) => {
    db.exec(`CREATE TABLE IF NOT EXISTS organizations (...)`);
  },
};

// After
export const migration: Migration = {
  version: 1,
  name: 'create_organizations',
  up: async (db) => {
    await db.execute({
      sql: `CREATE TABLE IF NOT EXISTS organizations (...)`,
    });
  },
};
```

---

## Phase 7: Update Composition Root & Entry Points

### `composition-root.ts`

```typescript
export type Infrastructure = {
  database: Database;  // Changed from { db: DatabaseSync }
  clock: Clock;
  idGenerator: IdGenerator;
  passwordHasher: PasswordHasher;
};
```

### `index.ts`

```typescript
const main = async () => {
  const config = await loadConfig();
  
  // Only create directories for file-based databases
  if (config.database.type === 'file') {
    mkdirSync(dirname(config.database.path), { recursive: true });
  }

  const app = await bootstrapApp({ config });
  // ...
};
```

### `migrate.ts`

```typescript
const main = async () => {
  const config: DatabaseConfig = process.env.TURSO_DATABASE_URL
    ? { 
        type: 'turso', 
        url: process.env.TURSO_DATABASE_URL, 
        authToken: process.env.TURSO_AUTH_TOKEN 
      }
    : { 
        type: 'file', 
        path: process.env.DB_PATH ?? './data/captures.db' 
      };

  const database = createDatabase(config);

  try {
    const result = await runMigrations(database, migrations);
    // ... log results
  } finally {
    await database.close();
  }
};
```

---

## Phase 8: Update Tests

### Test Helper (`database/test-utils.ts`)

```typescript
import { createDatabase, type Database } from './database.js';

export const createTestDatabase = (): Database => {
  return createDatabase({ type: 'memory' });
};
```

### Test File Pattern

**Before:**
```typescript
import { DatabaseSync } from 'node:sqlite';

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
});
```

**After:**
```typescript
import { createTestDatabase } from '../database/test-utils.js';
import type { Database } from '../database/types.js';

let db: Database;

beforeEach(async () => {
  db = createTestDatabase();
  await runMigrations(db, migrations);
});

afterEach(async () => {
  await db.close();
});
```

### Files to Update (11 test files)

1. `database/migrator.test.ts`
2. `database/transaction.test.ts`
3. `database/table-rebuild.test.ts`
4. `captures/infrastructure/sqlite-capture-store.test.ts`
5. `tasks/infrastructure/sqlite-task-store.test.ts`
6. `processing/domain/processing-service.test.ts`
7. `auth/infrastructure/sqlite-user-store.test.ts`
8. `auth/infrastructure/sqlite-token-store.test.ts`
9. `auth/infrastructure/sqlite-organization-store.test.ts`
10. `auth/infrastructure/sqlite-organization-membership-store.test.ts`
11. `auth/infrastructure/sqlite-passkey-credential-store.test.ts`

---

## Phase 9: Update Infrastructure Files

### `fly.toml`

```toml
# Remove volume mount
# [mounts]
#   source = "jhtc_yoink_data"
#   destination = "/app/apps/api/data"

# Change deploy strategy
[deploy]
  strategy = "bluegreen"  # Was: rolling

# Can safely auto-stop now (no volume state to preserve)
[http_service]
  auto_stop_machines = 'stop'
  auto_start_machines = true
  min_machines_running = 1
```

### `Dockerfile`

Remove Litestream:

```dockerfile
# Remove these lines:
# COPY --from=litestream/litestream:0.3.13 /usr/local/bin/litestream /usr/local/bin/litestream
# COPY apps/api/litestream.yml /etc/litestream.yml

# Simplify CMD:
CMD ["node", "--experimental-sqlite", "dist/index.js"]
```

### `run.sh`

Simplify or remove:

```bash
#!/bin/sh
set -e

# Run migrations
echo "Running database migrations..."
node --experimental-sqlite dist/migrate.js

# Start app
exec node --experimental-sqlite dist/index.js
```

---

## Phase 10: Deploy & Verify - COMPLETE ✓

### Pre-Deploy Checklist

- [x] All tests pass (`pnpm quality`)
- [x] Turso database created with data imported
- [x] Fly.io secrets set
- [x] Local development works with file-based LibSQL

### Deploy

```bash
fly deploy -a jhtc-yoink-api
```

### Verify Zero-Downtime

```bash
# Terminal 1: Watch logs
fly logs -a jhtc-yoink-api

# Terminal 2: Continuous health checks
while true; do 
  curl -s -o /dev/null -w "%{http_code}\n" https://jhtc-yoink-api.fly.dev/api/health
  sleep 1
done
```

### Post-Deploy Cleanup - COMPLETE ✓

The old machine and volume were destroyed before deploying:

```bash
# Machine destroyed
fly machines destroy 2860727bdde598 -a jhtc-yoink-api --force

# Volume destroyed  
fly volumes destroy vol_v87d7zeoj15o2jlr -a jhtc-yoink-api -y
```

New machine deployed in `iad` region with `min_machines_running = 1`.

---

## Rollback Plan

### Quick Rollback (Image)

```bash
fly deploy --image registry.fly.io/jhtc-yoink-api:prod-latest -a jhtc-yoink-api
```

### Full Rollback (Git)

1. Revert git changes
2. Restore `[mounts]` in fly.toml
3. Redeploy with volume

### Data Recovery

- Turso has point-in-time recovery
- Original data remains in Litestream S3 backup

---

## Environment Variables

### Production (Fly.io)

| Variable | Value |
|----------|-------|
| `TURSO_DATABASE_URL` | `libsql://yoink-prod-YOUR_ORG.turso.io` |
| `TURSO_AUTH_TOKEN` | (from `turso db tokens create`) |

### Local Development

```bash
# .envrc
export DB_PATH="./data/captures.db"

# Or for testing against Turso:
# export TURSO_DATABASE_URL="libsql://yoink-dev-YOUR_ORG.turso.io"
# export TURSO_AUTH_TOKEN="..."
```

---

## File Change Summary

| Category | Files | Notes |
|----------|-------|-------|
| Database abstraction | 2 | `types.ts`, `database.ts` |
| Config | 2 | `schema.ts`, `config.ts` |
| Stores | 7 | All `sqlite-*.ts` files |
| Transaction | 1 | `transaction.ts` |
| Migrator | 1 | `migrator.ts` |
| Migrations | 16 | All `NNN-*.ts` files |
| Entry points | 3 | `index.ts`, `migrate.ts`, `composition-root.ts` |
| Tests | 11 | All store and migrator tests |
| Infrastructure | 3 | `fly.toml`, `Dockerfile`, `run.sh` |
| **Total** | ~46 files | |

---

## Acceptance Tests

Acceptance tests run via HTTP against Docker container and should work unchanged - they don't directly interact with the database layer. The only change is the container now connects to Turso instead of a local file.
