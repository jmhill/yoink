import { expect, it } from 'vitest';
import type { Clock as PackageClock, IdGenerator as PackageIdGenerator, PasswordHasher as PackagePasswordHasher } from '@yoink/infrastructure';
import type { Clock as KernelClock } from '../kernel/clock.js';
import type { IdGenerator as KernelIdGenerator } from '../kernel/id-generator.js';
import type { PasswordHasher as KernelPasswordHasher } from '../kernel/password-hasher.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const clockPortsMatch: Equal<KernelClock, PackageClock> = true;
const idGeneratorPortsMatch: Equal<KernelIdGenerator, PackageIdGenerator> = true;
const passwordHasherPortsMatch: Equal<KernelPasswordHasher, PackagePasswordHasher> = true;

it('keeps kernel ports identical to the infrastructure package types', () => {
  expect(clockPortsMatch).toBe(true);
  expect(idGeneratorPortsMatch).toBe(true);
  expect(passwordHasherPortsMatch).toBe(true);
});
