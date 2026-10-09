import * as Sentry from '@sentry/node';
import { loadLogConfig } from './config/config.js';
import { initSentry } from './logging/sentry.js';

const dsn = process.env.SENTRY_DSN;
const log = loadLogConfig();

initSentry({
  dsn,
  environment: process.env.NODE_ENV ?? 'development',
  log,
});

if (dsn) {
  console.log(
    log.sentry?.enabled
      ? 'Sentry initialized for error tracking and logs'
      : 'Sentry initialized for error tracking'
  );
}

export { Sentry };
