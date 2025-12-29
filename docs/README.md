# Yoink Documentation

This directory contains all design documents, architectural decisions, and planning materials for Yoink.

## Quick Start

- **[PLAN.md](./PLAN.md)** - The master implementation plan. Start here to understand current status and next steps.

## Directory Structure

### [design/](./design/)

Active design documents that guide current and future implementation.

| Document | Description |
|----------|-------------|
| [PROJECT_BRIEF.md](./design/PROJECT_BRIEF.md) | Original design document covering domain model, API contracts, and architecture |
| [PRODUCT_VISION.md](./design/PRODUCT_VISION.md) | Evolved product vision: capture-first productivity with tasks, notes, and folders |
| [PASSKEY_AUTHENTICATION.md](./design/PASSKEY_AUTHENTICATION.md) | WebAuthn/passkey authentication design and migration plan |
| [OPTIMISTIC_UPDATES.md](./design/OPTIMISTIC_UPDATES.md) | Pattern for implementing optimistic UI updates with TanStack Query |

### [architecture/](./architecture/)

Architectural Decision Records (ADRs) and reference material about how and why things work.

| Document | Description |
|----------|-------------|
| [DOMAIN_EVENTS.md](./architecture/DOMAIN_EVENTS.md) | ADR: Why orchestration was chosen over event-driven architecture |
| [TESTING_STRATEGY.md](./architecture/TESTING_STRATEGY.md) | Lessons learned building the acceptance testing infrastructure |

### [testing/](./testing/)

Testing documentation, guides, and audit findings.

| Document | Description |
|----------|-------------|
| [TESTING.md](./testing/TESTING.md) | Primary testing guide: philosophy, test pyramid, running tests, DSL interfaces |
| [E2E_ARCHITECTURE.md](./testing/E2E_ARCHITECTURE.md) | 4-layer E2E testing architecture using Dave Farley's acceptance testing patterns |
| [ACCEPTANCE_TEST_AUDIT.md](./testing/ACCEPTANCE_TEST_AUDIT.md) | Audit findings and improvements for the acceptance test suite |

### [operations/](./operations/)

Operational guides and runbooks.

| Document | Description |
|----------|-------------|
| [DATABASE_ACCESS.md](./operations/DATABASE_ACCESS.md) | How to access local and production databases for debugging |

### [completed/](./completed/)

Historical plans that have been implemented. Kept for context and reference.

| Document | Description |
|----------|-------------|
| [TURSO_MIGRATION.md](./completed/TURSO_MIGRATION.md) | Migration from file-based SQLite to Turso (completed 2024-12-27) |
| [E2E_MULTI_DRIVER_PLAN.md](./completed/E2E_MULTI_DRIVER_PLAN.md) | Multi-driver test runner implementation plan (completed) |

### [mockups/](./mockups/)

UI design mockups created with Claude.

| File | Description |
|------|-------------|
| [README.md](./mockups/README.md) | Overview of the three-tier container hierarchy and pane navigation model |
| [mobile-responsive.jsx](./mockups/mobile-responsive.jsx) | Mobile-first responsive design mockup |
| [panes.jsx](./mockups/panes.jsx) | Desktop pane layout mockup |

## For AI Agents

When starting a new session:

1. Read **[PLAN.md](./PLAN.md)** first - it contains current status, next steps, and key implementation context
2. Check the "Session Continuity Notes" section at the bottom of PLAN.md for the current focus area
3. Run `pnpm quality` to verify all tests pass before making changes

See also: [CLAUDE.md](../CLAUDE.md) for development guidelines and coding standards.
