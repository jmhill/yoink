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
import { migration as addSnoozedUntil } from './006-add-snoozed-until.js';
import { migration as renameArchiveToTrash } from './007-rename-archive-to-trash.js';
import { migration as addDeletedAt } from './008-add-deleted-at.js';
import { migration as removePinnedAt } from './009-remove-pinned-at.js';
import { migration as addProcessedFields } from './010-add-processed-fields.js';
import { migration as createTasks } from './011-create-tasks.js';
import { migration as createOrganizationMemberships } from './012-create-organization-memberships.js';
import { migration as createInvitations } from './013-create-invitations.js';
import { migration as createPasskeyCredentials } from './014-create-passkey-credentials.js';
import { migration as createUserSessions } from './015-create-user-sessions.js';
import { migration as addEmailUniqueConstraint } from './016-add-email-unique-constraint.js';
import { migration as makeInvitationInvitedByNullable } from './017-make-invitation-invited-by-nullable.js';
import { migration as backfillOrganizationMemberships } from './018-backfill-organization-memberships.js';

export const migrations: Migration[] = [
  createOrganizations,
  createUsers,
  createApiTokens,
  createCaptures,
  addPinnedAt,
  addSnoozedUntil,
  renameArchiveToTrash,
  addDeletedAt,
  removePinnedAt,
  addProcessedFields,
  createTasks,
  createOrganizationMemberships,
  createInvitations,
  createPasskeyCredentials,
  createUserSessions,
  addEmailUniqueConstraint,
  makeInvitationInvitedByNullable,
  backfillOrganizationMemberships,
];

export type { Migration };
