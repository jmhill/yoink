import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

// Only initialize Sentry if DSN is configured
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',

    // Set tracesSampleRate to capture 10% of transactions for performance monitoring
    tracesSampleRate: 0.1,

    // Capture unhandled promise rejections
    integrations: [Sentry.onUnhandledRejectionIntegration({ mode: 'warn' })],
  });

  console.log('Sentry initialized for error tracking');
}

export { Sentry };
