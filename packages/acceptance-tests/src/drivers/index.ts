import type { Driver, DriverConfig } from './types.js';
import { createHttpDriver } from './http/index.js';

export type { Driver, DriverConfig, DriverCapability } from './types.js';
export { createHttpDriver } from './http/index.js';

/**
 * Get the active driver based on environment configuration.
 */
export const getDriver = (config: DriverConfig): Driver => {
  const driverName = process.env.DRIVER ?? 'http';

  switch (driverName) {
    case 'http':
      return createHttpDriver(config);
    // Future: case 'playwright': return createPlaywrightDriver(config);
    default:
      throw new Error(`Unknown driver: ${driverName}`);
  }
};
