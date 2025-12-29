# Yoink

![Yoink](assets/yoink.png)

A capture-first productivity system. Yoink provides a universal inbox for quickly capturing thoughts, links, and ideas from any device, then triaging them into actionable tasks.

## What is Yoink?

Yoink is designed around a simple workflow:

1. **Capture** - Quickly save anything from your phone (share intent), browser (extension), or desktop
2. **Triage** - Review your inbox and turn captures into tasks (or trash them)
3. **Execute** - Work through your tasks with due dates, pinning, and completion tracking

## Features

- **Web App (PWA)** - Mobile-first inbox with offline support and Android share target
- **Browser Extension** - Quick capture from any webpage with keyboard shortcut (Cmd/Ctrl+Shift+Y)
- **Admin Panel** - Manage organizations, users, and API tokens
- **Multi-tenant** - Support for multiple organizations with invitation-based signup

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **API**: Fastify + TypeScript + Turso (LibSQL)
- **Web Apps**: React + Vite + TanStack Router + TailwindCSS
- **Testing**: Vitest + Playwright with acceptance test DSL
- **Infrastructure**: Fly.io + Turso

## Documentation

See the [docs/](./docs/) directory for detailed documentation:

- **[docs/PLAN.md](./docs/PLAN.md)** - Master implementation plan with current status and next steps
- **[docs/design/](./docs/design/)** - Design documents and product vision
- **[docs/testing/](./docs/testing/)** - Testing guides and architecture
- **[CLAUDE.md](./CLAUDE.md)** - Development guidelines for AI agents

## Development

```bash
# Install dependencies
pnpm install

# Run all apps in development
pnpm dev

# Run quality checks (tests, types, build)
pnpm quality

# Run E2E acceptance tests
pnpm e2e:test
```

## License

See [LICENSE](./LICENSE) for details.
