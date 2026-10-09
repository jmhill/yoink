# Environment Variables

| Variable | Purpose | Requirements |
|----------|---------|--------------|
| `DB_PATH` | SQLite database location | Required in production |
| `SEED_TOKEN` | Bootstrap token secret for dev seeding | Optional, dev/test only |
| `ADMIN_PASSWORD` | Admin panel password | Required to enable admin panel. No minimum length enforced (use strong password). |
| `SESSION_SECRET` | Admin session HMAC signing key | Must be at least 32 characters. Required in production if admin panel is enabled. Auto-generated in dev/test if not provided. |
| `LOG_LEVEL` | Pino stdout log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`) | Optional. Default: `info` in production, `debug` otherwise. |
| `SENTRY_DSN` | Sentry project DSN for API crash reporting and (when enabled) logs | Fly secret, already set by `fly ext sentry create`. Skip Sentry init when unset. |
| `SENTRY_LOGS_ENABLED` | Forward Pino logs to Sentry Logs | Optional. `true` / `false`. Default: `true` in production, `false` in tests and local dev. |
| `SENTRY_LOGS_LEVEL` | Minimum Pino level forwarded to Sentry (`fatal`, `error`, `warn`, `info`, `debug`, `trace`) | Optional. Default: `info`. |

## Sentry Logs

Production API logs still go to stdout on Fly. When `SENTRY_DSN` is set and Sentry Logs are enabled, the same Pino lines are also sent to Sentry so they outlive Fly's short log buffer.

**No new Fly secret is required.** Logs use the existing `SENTRY_DSN`. To turn logs off in production without removing crash reporting:

```bash
fly secrets set SENTRY_LOGS_ENABLED=false -a jhtc-yoink-api
```

(`SENTRY_LOGS_ENABLED` is a flag, not a secret; `fly secrets set` is just the usual way to put env on the app.) Locally and in tests, logs stay off unless you set `SENTRY_LOGS_ENABLED=true` (and a DSN).

### Where to find them

1. Open the Yoink project in [Sentry](https://sentry.io).
2. Go to **Explore → Logs** (Logs in the sidebar).
3. Filter by `environment:production` and, if needed, `severity:error` / `severity:warn` or a message substring.
4. Open a line to jump to the related trace, spans, and errors.

Authorization headers, cookies, and token values are redacted before a log is serialized, so they should not appear in Sentry.

Sentry keeps logs for **30 days** on Developer, Team, and Business plans. The searchable query window is shorter on some plans (7 days on Developer, 14 days on Team, 30 days on Business).
