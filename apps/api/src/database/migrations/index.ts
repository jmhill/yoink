/**
 * Database migrations for the Yoink API.
 *
 * Migrations are applied in order by version number.
 * Each migration should be idempotent and forward-only (no down migrations).
 *
 * To add a new migration:
 * 1. Create a new file: NNN-descriptive-name.ts (where NNN is the next version number)
 * 2. Export a `migration` object with version, name, and up function
 * 3. Import and add to the migrations array below
 */

import type { Migration } from '../types.js';

import { migration as createOrganizations } from './001-create-organizations.js';
import { migration as createUsers } from './002-create-users.js';
import { migration as createApiTokens } from './003-create-api-tokens.js';
import { migration as createCaptures } from './004-create-captures.js';
import { migration as addPinnedAt } from './005-add-pinned-at.js';

export const migrations: Migration[] = [
  createOrganizations,
  createUsers,
  createApiTokens,
  createCaptures,
  addPinnedAt,
];

export type { Migration };
