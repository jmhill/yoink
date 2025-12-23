import * as Sentry from '@sentry/react';

// DSN is set via VITE_SENTRY_DSN environment variable at build time
const dsn = import.meta.env.VITE_SENTRY_DSN;

// Initialize Sentry - exports a function so router can be passed after creation
export const initSentry = (router: unknown) => {
  if (!dsn) {
    console.log('Sentry DSN not configured, skipping initialization');
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,

    integrations: [
      // TanStack Router integration for route-based tracing
      Sentry.tanstackRouterBrowserTracingIntegration(router),
      // Session replay for debugging errors
      Sentry.replayIntegration(),
    ],

    // Set tracesSampleRate to capture 10% of transactions for performance monitoring
    tracesSampleRate: 0.1,

    // Propagate traces to our API
    tracePropagationTargets: [/^\/api/, /^https:\/\/jhtc-yoink-api\.fly\.dev\/api/],

    // Capture Replay for 100% of sessions with an error
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });

  console.log('Sentry initialized for error tracking');
};

export { Sentry };
