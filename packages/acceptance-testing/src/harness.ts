import {
  beforeAll as vitestBeforeAll,
  afterAll as vitestAfterAll,
} from 'vitest';
import type { Driver, DriverCapability, DriverConfig } from './drivers/index.js';
import { createHttpDriver, createPlaywrightDriver } from './drivers/index.js';
import { createHttpClient } from './drivers/http/http-client.js';
import { createHttpAdmin } from './drivers/http/admin.js';
import { createHttpActor } from './drivers/http/actor.js';
import { getTestConfig } from './config.js';
import type { CoreActor, BrowserActor, AnonymousActor, Admin, Health } from './dsl/index.js';

/**
 * Credentials for creating an actor with a specific token.
 */
export type ActorCredentials = {
  email: string;
  userId: string;
  organizationId: string;
  token: string;
};

/**
 * Base context available to all driver types.
 */
export type BaseContext = {
  /** Name of the current driver */
  driverName: DriverCapability;

  /** Admin operations namespace */
  admin: Admin;

  /** Health check operations */
  health: Health;

  /**
   * Create an authenticated actor for this test.
   * Each call creates a new isolated tenant (org, user, token).
   */
  createActor: (email: string) => Promise<CoreActor>;

  /**
   * Create an anonymous (unauthenticated) actor.
   */
  createAnonymousActor: () => AnonymousActor;
};

/**
 * Context for HTTP driver tests.
 * Includes additional helpers for testing HTTP-specific security scenarios.
 */
export type HttpContext = BaseContext & {
  driverName: 'http';

  /** Base URL of the API server */
  baseUrl: string;

  /**
   * Create an Admin with a specific password (for testing wrong credentials).
   */
  createAdminWithCredentials: (password: string) => Admin;

  /**
   * Create an actor with specific pre-existing credentials.
   * Useful for testing revoked/invalid tokens.
   */
  createActorWithCredentials: (credentials: ActorCredentials) => CoreActor;
};

/**
 * Context for Playwright driver tests.
 * Returns BrowserActor with browser-specific operations.
 */
export type PlaywrightContext = Omit<BaseContext, 'createActor'> & {
  driverName: 'playwright';

  /**
   * Create an authenticated actor with browser capabilities.
   */
  createActor: (email: string) => Promise<BrowserActor>;
};

/**
 * Create a driver instance for a given capability.
 */
const createDriver = (capability: DriverCapability, config: DriverConfig): Driver => {
  switch (capability) {
    case 'http':
      return createHttpDriver(config);
    case 'playwright':
      return createPlaywrightDriver(config);
    default:
      throw new Error(`Unknown driver capability: ${capability}`);
  }
};

/**
 * Create HTTP-specific context with additional helpers.
 */
const createHttpContext = (driver: Driver, config: DriverConfig): HttpContext => {
  const client = createHttpClient(config.baseUrl);

  return {
    driverName: 'http',
    baseUrl: config.baseUrl,
    admin: driver.admin,
    health: driver.health,
    createActor: (email: string) => driver.createActor(email) as Promise<CoreActor>,
    createAnonymousActor: () => driver.createAnonymousActor(),
    createAdminWithCredentials: (password: string) => createHttpAdmin(client, password),
    createActorWithCredentials: (credentials: ActorCredentials) =>
      createHttpActor(client, credentials),
  };
};

/**
 * Create Playwright-specific context.
 */
const createPlaywrightContext = (driver: Driver): PlaywrightContext => ({
  driverName: 'playwright',
  admin: driver.admin,
  health: driver.health,
  createActor: (email: string) => driver.createActor(email) as Promise<BrowserActor>,
  createAnonymousActor: () => driver.createAnonymousActor(),
});

/**
 * Create base context for multi-driver tests.
 */
const createBaseContext = (driver: Driver, driverName: DriverCapability): BaseContext => ({
  driverName,
  admin: driver.admin,
  health: driver.health,
  createActor: (email: string) => driver.createActor(email) as Promise<CoreActor>,
  createAnonymousActor: () => driver.createAnonymousActor(),
});

// ============================================================================
// usingDrivers - Type-safe driver iteration with automatic setup/teardown
// ============================================================================

/**
 * Run tests using specified drivers with automatic setup and teardown.
 *
 * Uses TypeScript function overloads to provide type-safe context based on
 * which drivers are specified:
 *
 * - Single 'http' driver: HttpContext with createAdminWithCredentials, createActorWithCredentials
 * - Single 'playwright' driver: PlaywrightContext with BrowserActor
 * - Multiple drivers: BaseContext with CoreActor (common subset)
 *
 * @example
 * // HTTP-only test with security helpers
 * usingDrivers(['http'] as const, (ctx) => {
 *   describe(`Token security [${ctx.driverName}]`, () => {
 *     it('rejects invalid tokens', async () => {
 *       const actor = ctx.createActorWithCredentials({ token: 'invalid', ... });
 *       await expect(actor.listCaptures()).rejects.toThrow(UnauthorizedError);
 *     });
 *   });
 * });
 *
 * @example
 * // Playwright-only test with browser operations
 * usingDrivers(['playwright'] as const, (ctx) => {
 *   describe(`Offline handling [${ctx.driverName}]`, () => {
 *     it('shows offline banner', async () => {
 *       const alice = await ctx.createActor('alice@example.com');
 *       await alice.goOffline();
 *       expect(await alice.isOfflineBannerVisible()).toBe(true);
 *     });
 *   });
 * });
 *
 * @example
 * // Multi-driver test with common operations
 * usingDrivers(['http', 'playwright'] as const, (ctx) => {
 *   describe(`Capturing notes [${ctx.driverName}]`, () => {
 *     it('can create a capture', async () => {
 *       const alice = await ctx.createActor('alice@example.com');
 *       const capture = await alice.createCapture({ content: 'Test' });
 *       expect(capture.content).toBe('Test');
 *     });
 *   });
 * });
 */

// Overload: HTTP-only gets HttpContext
export function usingDrivers(
  drivers: readonly ['http'],
  fn: (ctx: HttpContext) => void
): void;

// Overload: Playwright-only gets PlaywrightContext
export function usingDrivers(
  drivers: readonly ['playwright'],
  fn: (ctx: PlaywrightContext) => void
): void;

// Overload: Multiple drivers get BaseContext (common subset)
export function usingDrivers<T extends readonly DriverCapability[]>(
  drivers: T,
  fn: (ctx: BaseContext) => void
): void;

// Implementation
export function usingDrivers(
  drivers: readonly DriverCapability[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (ctx: any) => void
): void {
  const config = getTestConfig();

  for (const driverName of drivers) {
    const driver = createDriver(driverName, config);

    // Setup and teardown for this driver
    vitestBeforeAll(async () => {
      await driver.setup();
    });

    vitestAfterAll(async () => {
      await driver.teardown();
    });

    // Create the appropriate context based on driver type
    let context: BaseContext | HttpContext | PlaywrightContext;

    if (driverName === 'http' && drivers.length === 1) {
      context = createHttpContext(driver, config);
    } else if (driverName === 'playwright' && drivers.length === 1) {
      context = createPlaywrightContext(driver);
    } else {
      context = createBaseContext(driver, driverName);
    }

    fn(context);
  }
}

// Re-export vitest utilities for convenience
export { expect, it, describe, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
