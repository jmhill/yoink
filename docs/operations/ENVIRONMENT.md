# Environment Variables

| Variable | Purpose | Requirements |
|----------|---------|--------------|
| `DB_PATH` | SQLite database location | Required in production |
| `SEED_TOKEN` | Bootstrap token secret for dev seeding | Optional, dev/test only |
| `ENABLE_TEST_FIXTURES` | Registers `POST /api/test/named-lists` so tests can seed lists without Create | Optional, test only. Never set in production. |
| `ADMIN_PASSWORD` | Admin panel password | Required to enable admin panel. No minimum length enforced (use strong password). |
| `SESSION_SECRET` | Admin session HMAC signing key | Must be at least 32 characters. Required in production if admin panel is enabled. Auto-generated in dev/test if not provided. |
