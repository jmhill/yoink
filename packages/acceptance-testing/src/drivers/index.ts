import type { Driver, DriverConfig } from './types.js';
import { createHttpDriver } from './http/index.js';
import { createPlaywrightDriver } from './playwright/index.js';

export type { Driver, DriverConfig, DriverCapability } from './types.js';
export { createHttpDriver } from './http/index.js';
export { createPlaywrightDriver } from './playwright/index.js';

/**
 * Get the active driver based on environment configuration.
 * 
 * Available drivers:
 * - 'http' (default): Token-based auth, tests core API functionality
 * - 'playwright': Browser-based, tests full web app UI with passkey auth
 */
export const getDriver = (config: DriverConfig): Driver => {
  const driverName = process.env.DRIVER ?? 'http';

  switch (driverName) {
    case 'http':
      return createHttpDriver(config);
    case 'playwright':
      return createPlaywrightDriver(config);
    default:
      throw new Error(`Unknown driver: ${driverName}`);
  }
};
