import { describe, expect, it } from 'vitest';
import { assertTestFixturesAllowed } from './test-fixtures-guard.js';

const productionFly = {
  NODE_ENV: 'production',
  FLY_APP_NAME: 'jhtc-yoink-api',
  TURSO_DATABASE_URL: 'libsql://yoink-prod-jmhill.aws-us-east-1.turso.io',
} as const;

describe('test fixture startup guard', () => {
  it('refuses to start in production with fixtures on', () => {
    expect(() =>
      assertTestFixturesAllowed({
        ...productionFly,
        YOINK_TEST_FIXTURES: 'true',
      })
    ).toThrow(/Refusing to start: YOINK_TEST_FIXTURES=true/);

    expect(() =>
      assertTestFixturesAllowed({
        NODE_ENV: 'production',
        FLY_APP_NAME: 'jhtc-yoink-api',
        YOINK_TEST_FIXTURES: 'true',
      })
    ).toThrow(/FLY_APP_NAME=jhtc-yoink-api is the production Fly app/);

    expect(() =>
      assertTestFixturesAllowed({
        NODE_ENV: 'development',
        TURSO_DATABASE_URL: 'libsql://yoink-prod-jmhill.turso.io',
        YOINK_TEST_FIXTURES: 'true',
      })
    ).toThrow(/production database yoink-prod/);
  });

  it('starts in production with fixtures off', () => {
    expect(() => assertTestFixturesAllowed(productionFly)).not.toThrow();
    expect(() =>
      assertTestFixturesAllowed({
        ...productionFly,
        YOINK_TEST_FIXTURES: 'false',
      })
    ).not.toThrow();
  });

  it('starts in test with fixtures on', () => {
    expect(() =>
      assertTestFixturesAllowed({
        NODE_ENV: 'test',
        YOINK_TEST_FIXTURES: 'true',
        DB_PATH: './data/captures.db',
      })
    ).not.toThrow();
  });

  it('starts in dev with fixtures on', () => {
    expect(() =>
      assertTestFixturesAllowed({
        NODE_ENV: 'development',
        YOINK_TEST_FIXTURES: 'true',
        DB_PATH: './data/captures.db',
      })
    ).not.toThrow();
  });

  it('starts the e2e image with fixtures on', () => {
    expect(() =>
      assertTestFixturesAllowed({
        NODE_ENV: 'production',
        YOINK_TEST_FIXTURES: 'true',
        DB_PATH: '/app/apps/api/data/captures.db',
      })
    ).not.toThrow();
  });

  it('starts when fixtures are on and the database is a test database', () => {
    expect(() =>
      assertTestFixturesAllowed({
        NODE_ENV: 'production',
        YOINK_TEST_FIXTURES: 'true',
        TURSO_DATABASE_URL: 'libsql://yoink-m02-spike-jmhill.aws-us-east-1.turso.io',
      })
    ).not.toThrow();
    expect(() =>
      assertTestFixturesAllowed({
        NODE_ENV: 'test',
        YOINK_TEST_FIXTURES: 'true',
        TURSO_DATABASE_URL: 'libsql://jhtc-yoink-jmhill.turso.io',
      })
    ).not.toThrow();
    expect(() =>
      assertTestFixturesAllowed({
        NODE_ENV: 'development',
        YOINK_TEST_FIXTURES: 'true',
        TURSO_DATABASE_URL: 'libsql://127.0.0.1:8080',
      })
    ).not.toThrow();
  });
});
