# AGENTS.md

## Commands (run via devbox)
```bash
devbox run pnpm quality          # Build + typecheck + test (run before commits)
devbox run pnpm test             # Run all tests
devbox run pnpm test -- path/to/file.test.ts  # Single test file
devbox run pnpm test -- -t "pattern"          # Tests matching pattern
devbox run pnpm typecheck        # Type check all packages
```

## Code Style
- **TDD required**: Write failing test first, then minimal code to pass
- **TypeScript strict mode**: No `any`, no unused vars, no implicit returns
- **Imports**: Use `type` keyword for type-only imports (`verbatimModuleSyntax`)
- **Types**: Prefer `type` over `interface`; define Zod schemas first, derive types
- **Naming**: `camelCase` functions, `PascalCase` types, `kebab-case.ts` files
- **Testing**: Colocated `.test.ts` files; use fake implementations over mocks
- **Architecture**: Hexagonal (domain/infrastructure/application layers)
- **Error handling**: Use Result types or early returns with guard clauses
- **Functions**: Pure, immutable data, options objects for 2+ parameters
