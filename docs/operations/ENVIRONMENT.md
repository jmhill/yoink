# Environment Variables

| Variable | Purpose | Requirements |
|----------|---------|--------------|
| `DB_PATH` | SQLite database location | Required in production |
| `SEED_TOKEN` | Bootstrap token secret for dev seeding | Optional, dev/test only |
| `ADMIN_PASSWORD` | Admin panel password | Required to enable admin panel. No minimum length enforced (use strong password). |
| `SESSION_SECRET` | Admin session HMAC signing key | Must be at least 32 characters. Required in production if admin panel is enabled. Auto-generated in dev/test if not provided. |
| `LOG_LEVEL` | Pino stdout log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`). Applied first: a line below this level is never emitted, so it cannot reach Sentry. | Optional. Default: `info` in production, `debug` otherwise. |
| `SENTRY_DSN` | Sentry project DSN for API crash reporting and (when enabled) logs | Fly secret, already set by `fly ext sentry create`. Skip Sentry init when unset. |
| `SENTRY_LOGS_ENABLED` | Forward Pino logs to Sentry Logs | Optional. `true` / `false`. Default: `true` in production, `false` in tests and local dev. |
| `SENTRY_LOGS_LEVEL` | Minimum Pino level forwarded to Sentry (`fatal`, `error`, `warn`, `info`, `debug`, `trace`) | Optional. Default: `info`. |
| `NOTES_MIRROR_BOT_USER_ID` | Fallback user id of the designated notes-mirror bot when `organizations.notes_mirror_bot_user_id` is empty | Optional UUID. Used only for `POST /api/notes/import`. |
| `RATE_LIMIT_ENABLED` | Master switch for API rate limiting | Optional. `false` disables all limiters (tests). Default: enabled. |
| `RATE_LIMIT_GLOBAL_MAX` | General API requests per key per window | Optional. Default: `600`. Keyed by validated user id (`user:<id>`) or derived client IP. `Fly-Client-IP` is used only when the process is running on Fly (`FLY_ALLOC_ID` / `FLY_APP_NAME`); otherwise the socket address. Raw session cookies, Bearer strings, and client-set `X-Forwarded-For` are not keys. |
| `RATE_LIMIT_GLOBAL_WINDOW` | Window for the general API limit | Optional. Default: `1 minute`. |
| `RATE_LIMIT_ADMIN_LOGIN_MAX` | Admin login attempts per IP per window | Optional. Default: `5`. |
| `RATE_LIMIT_ADMIN_LOGIN_WINDOW` | Window for admin login | Optional. Default: `15 minutes`. |
| `RATE_LIMIT_AUTH_LOGIN_MAX` | Passkey login verify attempts per IP per window | Optional. Default: `10`. |
| `RATE_LIMIT_AUTH_LOGIN_WINDOW` | Window for passkey login verify | Optional. Default: `15 minutes`. |
| `RATE_LIMIT_SIGNUP_MAX` | Signup attempts per IP per window | Optional. Default: `5`. |
| `RATE_LIMIT_SIGNUP_WINDOW` | Window for signup | Optional. Default: `1 hour`. |

## Sentry Logs

Production API logs still go to stdout on Fly. When `SENTRY_DSN` is set and Sentry Logs are enabled, the same Pino lines are also sent to Sentry so they outlive Fly's short log buffer. `LOG_LEVEL` is the first filter (Pino); `SENTRY_LOGS_LEVEL` then drops anything below that minimum among the lines Pino actually emitted.

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

Authorization headers, cookies, `x-api-key`, session / `yoink_session` values, and token values are redacted before a log is serialized, so they should not appear in Sentry.

Sentry keeps logs for **30 days** on Developer, Team, and Business plans. The searchable query window is shorter on some plans (7 days on Developer, 14 days on Team, 30 days on Business).
