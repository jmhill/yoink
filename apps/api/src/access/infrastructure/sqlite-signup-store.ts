import type { Database } from '../../database/types.js';
import { ResultAsync } from 'neverthrow';
import type { CompleteSignupRecord, SignupStore } from '../domain/signup-store.js';
import { signupStorageError, type SignupStorageError } from '../domain/signup-store.js';
import { eventInsert } from './membership-event-insert.js';
import { invitationMarkAcceptedQuery } from './invitation-statements.js';
import {
  membershipInsertQuery,
  organizationInsertQuery,
  userInsertQuery,
} from './membership-statements.js';

export const createSqliteSignupStore = (db: Database): SignupStore => ({
  completeSignup: (
    record: CompleteSignupRecord
  ): ResultAsync<void, SignupStorageError> =>
    ResultAsync.fromPromise(
      db.batch(
        [
          userInsertQuery(record.user),
          organizationInsertQuery(record.personalOrganization),
          membershipInsertQuery(record.personalMembership),
          membershipInsertQuery(record.invitedMembership),
          invitationMarkAcceptedQuery(record.accepted),
          ...(record.event ? [eventInsert(record.event)] : []),
        ],
        'write'
      ),
      (error) => signupStorageError('Failed to complete signup', error)
    ).map(() => undefined),
});
