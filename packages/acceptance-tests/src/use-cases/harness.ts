import { describe as vitestDescribe, beforeAll, afterAll } from 'vitest';
import type { Driver, DriverCapability } from '../drivers/index.js';
import { getDriver } from '../drivers/index.js';
import { getTestConfig } from '../config.js';
import type { Actor, AnonymousActor, Admin, Health } from '../dsl/index.js';

/**
 * Context provided to each test via the describeFeature callback.
 */
export type TestContext = {
  /** The active driver */
  driver: Driver;

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
};

/**
 * Wrapper around Vitest's describe that provides driver context.
 *
 * Tests declare which drivers they support. If the current driver
 * (determined by DRIVER env var) is not in the list, the test is skipped.
 *
 * @example
 * describeFeature('Capturing notes', ['http', 'playwright'], ({ createActor }) => {
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
 */
export const describeFeature = (
  name: string,
  supportedDrivers: DriverCapability[],
  fn: (context: TestContext) => void
): void => {
  const config = getTestConfig();
  const driver = getDriver(config);

  // Check if current driver is supported
  const isSupported = supportedDrivers.some((cap) =>
    driver.capabilities.includes(cap)
  );

  if (!isSupported) {
    vitestDescribe.skip(`${name} [${driver.name}]`, () => {
      // Skipped - driver not supported
    });
    return;
  }

  vitestDescribe(`${name}`, () => {
    beforeAll(async () => {
      await driver.setup();
    });

    afterAll(async () => {
      await driver.teardown();
    });

    const context: TestContext = {
      driver,
      admin: driver.admin,
      health: driver.health,
      createActor: (email: string) => driver.createActor(email),
      createAnonymousActor: () => driver.createAnonymousActor(),
    };

    fn(context);
  });
};

// Re-export vitest utilities for convenience
export { it, expect, beforeEach, beforeAll, afterAll, afterEach } from 'vitest';
