# ESLint Boundaries Baseline (2026-07-29)

Command
`pnpm lint`

## Important correction to the 2026-02-20 baseline

The original baseline (524 `boundaries/no-unknown` warnings) was **not measuring module boundaries at all**. The plugin's resolver could not map ESM `.js` import specifiers back to their `.ts` sources, so *every* relative import — including same-folder imports like `./user.js` — was reported as "unknown". Fixed by installing `eslint-import-resolver-typescript` and configuring `import/resolver` in `apps/api/eslint.config.js`.

## Current results (after access-context consolidation + resolver fix)

- 48 warnings total, 0 errors.
- `boundaries/no-unknown`: **0** (was 524-noise).
- `boundaries/element-types`: **15** — the real cross-context dependency picture:
  - `processing ↔ captures`/`tasks` — the capture→task lifecycle spans these modules; evidence that captures + tasks + processing form one "Capture" bounded context (revisit during Phase 9 design).
  - `captures`/`tasks` → `access` — `AuthMiddleware` type imports (legitimate cross-context surface; route through `access` entry points, allow as type-only imports when rules tighten in 8.5.5).
  - `health` → `access` — `TokenStore` deep import in `sqlite-health-checker.ts` (known debt, tagged TODO(8.5.4)).
- `@typescript-eslint/no-explicit-any`: 33 — legacy typing gaps, mostly auth-related tests. Clean up opportunistically.

Notes
- Rules remain at `warn`; promote to `error` in 8.5.5 after deciding type-only allowances for the cross-context imports above.
- Element quirk: `*.test.ts` files inside module directories match the module element (elements are matched in array order), so module rules apply to colocated tests rather than the permissive `tests` element. Harmless at `warn`; revisit if promoting to `error`.
