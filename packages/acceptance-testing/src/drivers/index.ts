import type { Driver, DriverConfig } from './types.js';
import { createHttpDriver } from './http/index.js';
import { createHttpSessionDriver } from './http-session/index.js';
import { createPlaywrightDriver } from './playwright/index.js';

export type { Driver, DriverConfig, DriverCapability } from './types.js';
export { createHttpDriver } from './http/index.js';
export { createHttpSessionDriver } from './http-session/index.js';
export { createPlaywrightDriver } from './playwright/index.js';

/**
 * Get the active driver based on environment configuration.
 * 
 * Available drivers:
 * - 'http' (default): Token-based auth, tests extension/CLI auth path
 * - 'http-session': Session-based auth, tests web app API auth path
 * - 'playwright': Browser-based, tests full UI with real passkey flow
 */
export const getDriver = (config: DriverConfig): Driver => {
  const driverName = process.env.DRIVER ?? 'http';

  switch (driverName) {
    case 'http':
      return createHttpDriver(config);
    case 'http-session':
      return createHttpSessionDriver(config);
    case 'playwright':
      return createPlaywrightDriver(config);
    default:
      throw new Error(`Unknown driver: ${driverName}`);
  }
};
