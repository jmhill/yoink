# Code Style Conventions

## TypeScript

- **Strict mode**: No `any`, no unused variables, no implicit returns
- **Imports**: Use `type` keyword for type-only imports (`verbatimModuleSyntax`)
- **Types**: Prefer `type` over `interface`; define Zod schemas first, derive types with `z.infer`
- **Naming**: `camelCase` functions, `PascalCase` types, `kebab-case.ts` files

## Functions

- Pure functions and immutable data where possible
- Options objects for functions with 2+ parameters
- Early returns with guard clauses over nested conditionals

## Error Handling

- Use Result types or early returns with guard clauses
- Avoid throwing exceptions for expected failure cases

## Testing

- TDD: Write a failing test first, then minimal code to pass, then assess refactor value
- Colocated test files with `.test.ts` suffix
- Use fake implementations over mocks — prefer fakes of our interfaces for all code we control
- Avoid adding unnecessary test helpers — prefer using the public API of all services and modules
- Vitest with workspace configuration (each package has its own `vitest.config.ts`)
- In-memory SQLite (`:memory:`) for integration tests
- Fake dependencies for deterministic tests (clock, ID generator, password hasher)

For comprehensive testing documentation, see `docs/testing/TESTING.md`.
