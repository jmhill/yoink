# AGENTS.md

Yoink is a personal "universal inbox" for quick text capture from browser and mobile — a TypeScript monorepo with multi-tenant token-based authentication.

## Development Commands

The toolchain (Node, pnpm, flyctl) is pinned in `mise.toml`; mise puts it on your
PATH automatically when you `cd` into the repo. The project uses pnpm workspaces.

```bash
pnpm quality    # Build + typecheck + test (also runs as pre-commit hook)
pnpm test       # Run tests across all packages
pnpm build      # Build all packages
pnpm typecheck  # Type check all packages
```

## Conventions

For code style and TypeScript conventions, see `docs/conventions/CODESTYLE.md`.

For testing philosophy, test pyramid, and how to write tests, see `docs/testing/TESTING.md`.

For environment variables and operational config, see `docs/operations/ENVIRONMENT.md`.

## Architecture

This is a monorepo with a Fastify API server (`apps/api/`) and shared packages (`packages/api-contracts/`, `packages/infrastructure/`). The API follows hexagonal architecture — see `apps/api/AGENTS.md` for details.

## Continuous Delivery

Every commit should be potentially releasable. Use branch by abstraction, expand/migrate/contract, backwards-compatible API design, evolutionary database design, and feature toggles to maintain a releasable state.

## Current Status

See `docs/PLAN.md` for implementation progress. Always update `docs/PLAN.md` when completing tasks.
