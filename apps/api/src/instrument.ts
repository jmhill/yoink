import * as Sentry from '@sentry/node';
import { loadLogConfig, loadSentryConfig } from './config/config.js';
import { initSentry } from './logging/sentry.js';

const sentry = loadSentryConfig();
const log = loadLogConfig();

initSentry({ sentry, log });

if (sentry.dsn) {
  console.log(
    log.sentry.enabled
      ? 'Sentry initialized for error tracking and logs'
      : 'Sentry initialized for error tracking'
  );
}

export { Sentry };
