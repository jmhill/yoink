# ESLint Boundaries Baseline (2026-02-20)

Command
`devbox run pnpm lint`

Results
- 524 warnings total.
- All warnings are `boundaries/no-unknown` ("Importing unknown elements is not allowed").
- Most affected areas:
  - `apps/api/src/auth` (245 warnings)
  - `apps/api/src/organizations` (85 warnings)
  - `apps/api/src/database` (82 warnings)
  - `apps/api/src/admin` (28 warnings)
  - `apps/api/src/captures` (22 warnings)
  - `apps/api/src/users` (22 warnings)
- Warnings commonly appear in `*.test.ts` files and migration files.

Notes
- No `boundaries/element-types` violations were reported in this baseline.
- The current warnings indicate imports resolving to unknown elements; this will be revisited during Phase 8.5.3–8.5.5 when entry points and boundary rules are tightened.
