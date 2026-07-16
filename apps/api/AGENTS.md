# API Server

Fastify API server implementing hexagonal architecture with multi-tenant token-based authentication.

## Hexagonal Architecture

Each domain feature follows this structure:

```
{feature}/
  domain/           # Business logic (pure, testable)
    entity.ts       # Data types
    service.ts      # Business rules
    store.ts        # Port interface (what we need)
  infrastructure/   # Adapters
    sqlite-*.ts     # SQLite implementations
  application/      # HTTP layer
    routes.ts       # Fastify routes
```

## Key Patterns

**ts-rest**: Type-safe API contracts shared between client and server. Contracts are defined in `packages/api-contracts/src/contracts/`, schemas in `packages/api-contracts/src/schemas/`.

**Token Format**: `tokenId:secret` for O(1) database lookups. The middleware parses the token, looks up by tokenId, then verifies the secret against a bcrypt hash.

**Fake Implementations**: Infrastructure utilities provide both real and fake implementations for testing:
- `createClock()` / `createFakeClock()`
- `createIdGenerator()` / `createFakeIdGenerator()`
- `createBcryptPasswordHasher()` / `createFakePasswordHasher()`

**Fastify Auth Context**: The auth middleware attaches `request.authContext` with `organizationId` and `userId` for all authenticated requests.

## Domain Model

```
Organization → User → ApiToken
                  ↓
              Capture (scoped to organization)
```

All capture queries are scoped to the authenticated user's organization.

## Running

```bash
pnpm dev    # Development mode with watch (from this directory)
pnpm start  # Production mode (from this directory)
```
