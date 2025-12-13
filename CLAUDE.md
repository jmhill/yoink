# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Yoink is a personal "universal inbox" for quick text capture from browser and mobile, replacing Google Keep's capture functionality. It's a TypeScript monorepo with multi-tenant token-based authentication.

## Development Commands

All commands should be run through devbox:

```bash
# Install dependencies
devbox run pnpm install

# Run all quality checks (build + typecheck + test) - use before commits
devbox run pnpm quality

# Run tests across all packages
devbox run pnpm test

# Run tests in watch mode
devbox run pnpm test:watch

# Run tests with coverage
devbox run pnpm test:coverage

# Run a single test file
devbox run pnpm test -- path/to/file.test.ts

# Run tests matching a pattern
devbox run pnpm test -- -t "pattern"

# Build all packages
devbox run pnpm build

# Type check all packages
devbox run pnpm typecheck

# Start API in development mode (with watch)
cd apps/api && devbox run pnpm dev

# Start API in production mode
cd apps/api && devbox run pnpm start
```

The pre-commit hook runs `devbox run pnpm quality` automatically.

## Architecture

### Monorepo Structure

```
apps/
  api/              # Fastify API server
packages/
  api-contracts/    # Shared ts-rest contracts and Zod schemas
  infrastructure/   # Shared utilities (Clock, IdGenerator, PasswordHasher)
```

### Hexagonal Architecture (apps/api/src/)

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

### Key Patterns

**ts-rest**: Type-safe API contracts shared between client and server. Contracts live in `packages/api-contracts/src/contracts/`, schemas in `packages/api-contracts/src/schemas/`.

**Token Format**: `tokenId:secret` for O(1) database lookups. The middleware parses the token, looks up by tokenId, then verifies the secret against bcrypt hash.

**Fake Implementations**: Infrastructure utilities have both real and fake implementations for testing:
- `createClock()` / `createFakeClock()`
- `createIdGenerator()` / `createFakeIdGenerator()`
- `createBcryptPasswordHasher()` / `createFakePasswordHasher()`

**Fastify Auth Context**: The auth middleware attaches `request.authContext` with `organizationId` and `userId` for all authenticated requests.

### Domain Model

```
Organization → User → ApiToken
                  ↓
              Capture (scoped to organization)
```

All capture queries are scoped to the authenticated user's organization.

## Code Style

- **TDD required**: Write failing test first, then minimal code to pass
- **TypeScript strict mode**: No `any`, no unused vars, no implicit returns
- **Imports**: Use `type` keyword for type-only imports (`verbatimModuleSyntax`)
- **Types**: Prefer `type` over `interface`; define Zod schemas first, derive types
- **Naming**: `camelCase` functions, `PascalCase` types, `kebab-case.ts` files
- **Testing**: Colocated `.test.ts` files; use fake implementations over mocks
- **Error handling**: Use Result types or early returns with guard clauses
- **Functions**: Pure, immutable data, options objects for 2+ parameters

## Testing

- Vitest with workspace configuration (each package has its own vitest.config.ts)
- In-memory SQLite (`:memory:`) for integration tests
- Fake dependencies for deterministic tests (clock, ID generator, password hasher)
- Avoid using vitest mocks unless necessary - prefer using fake implementations of our interfaces for all code we control
- Avoid adding unnecessary test helpers - prefer using the public API of all services and modules
- Test files are colocated with source (`.test.ts` suffix)

## Continuous Delivery

- Make small, cohesive commits - the pre-commit hook will at least ensure that tests aren't failing, but we also want every single commit of our code to be potentially releasable to end users.
- The code should be maintained in a releasable state using engineering approaches like branch by abstraction, expand/migrate/contract, backwards-compatible API design, evolutionary database design, feature toggles, and any other method available that provides ample flexibility.

## Environment Variables

| Variable | Purpose | Requirements |
|----------|---------|--------------|
| `DB_PATH` | SQLite database location | Required in production |
| `SEED_TOKEN` | Bootstrap token secret for dev seeding | Optional, dev/test only |
| `ADMIN_PASSWORD` | Admin panel password | Required to enable admin panel. No minimum length enforced (use strong password). |
| `SESSION_SECRET` | Admin session HMAC signing key | Must be at least 32 characters. Required in production if admin panel is enabled. Auto-generated in dev/test if not provided. |

## Current Status

- See `docs/PLAN.md` for implementation progress.
- Always update `docs/PLAN.md` when completing tasks
