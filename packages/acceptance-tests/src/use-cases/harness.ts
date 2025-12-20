import {
  describe as vitestDescribe,
  it as vitestIt,
  beforeAll as vitestBeforeAll,
  afterAll as vitestAfterAll,
  beforeEach as vitestBeforeEach,
  afterEach as vitestAfterEach,
} from 'vitest';
import type { Driver, DriverCapability, DriverConfig } from '../drivers/index.js';
import { createHttpDriver, createPlaywrightDriver } from '../drivers/index.js';
import { getTestConfig } from '../config.js';
import type { Actor, AnonymousActor, Admin, Health } from '../dsl/index.js';

/**
 * Custom test function type that includes driver name in test output.
 */
type ItFunction = (name: string, fn: () => Promise<void> | void) => void;

/**
 * Context provided to each test via the describeFeature callback.
 */
export type TestContext = {
  /** The active driver */
  driver: Driver;

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
  createActor: (email: string) => Promise<Actor>;

  /**
   * Create an anonymous (unauthenticated) actor.
   */
  createAnonymousActor: () => AnonymousActor;

  /**
   * Test function - use this instead of importing `it` from vitest.
   * Automatically appends driver name to test title.
   */
  it: ItFunction;

  /**
   * beforeEach hook scoped to this driver context.
   */
  beforeEach: (fn: () => Promise<void> | void) => void;

  /**
   * afterEach hook scoped to this driver context.
   */
  afterEach: (fn: () => Promise<void> | void) => void;
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
 * Wrapper around Vitest's describe that runs tests against all applicable drivers.
 *
 * For each driver in `supportedDrivers`, creates a nested describe block and runs
 * all tests within that context. Test names include the driver suffix for clarity.
 *
 * @example
 * describeFeature('Capturing notes', ['http', 'playwright'], ({ createActor, it }) => {
 *   let alice: Actor;
 *
 *   beforeEach(async () => {
 *     alice = await createActor('alice@example.com');
 *   });
 *
 *   it('can create a new capture', async () => {
 *     const capture = await alice.createCapture({ content: 'Hello' });
 *     expect(capture.content).toBe('Hello');
 *   });
 * });
 *
 * Output:
 *   Capturing notes
 *     [http]
 *       ✓ can create a new capture [http]
 *     [playwright]
 *       ✓ can create a new capture [playwright]
 */
export const describeFeature = (
  name: string,
  supportedDrivers: DriverCapability[],
  fn: (context: TestContext) => void
): void => {
  const config = getTestConfig();

  vitestDescribe(name, () => {
    // For each supported driver, create a nested describe block
    for (const driverName of supportedDrivers) {
      vitestDescribe(`[${driverName}]`, () => {
        // Create driver instance for this describe block
        // Each driver block gets its own instance to ensure isolation
        const driver = createDriver(driverName, config);

        // Setup driver before tests in this block
        vitestBeforeAll(async () => {
          await driver.setup();
        });

        // Teardown driver after tests in this block
        vitestAfterAll(async () => {
          await driver.teardown();
        });

        // Custom `it` that appends driver name to test title
        const it: ItFunction = (testName, testFn) => {
          vitestIt(`${testName} [${driverName}]`, testFn);
        };

        // Create context with the driver
        // Note: Driver methods may not work until setup() completes in beforeAll,
        // but the context object itself is available for registration
        const context: TestContext = {
          driver,
          driverName,
          admin: driver.admin,
          health: driver.health,
          createActor: (email: string) => driver.createActor(email),
          createAnonymousActor: () => driver.createAnonymousActor(),
          it,
          beforeEach: vitestBeforeEach,
          afterEach: vitestAfterEach,
        };

        fn(context);
      });
    }
  });
};

// Re-export vitest utilities for convenience (except `it` which comes from context)
export { expect, beforeAll, afterAll } from 'vitest';
