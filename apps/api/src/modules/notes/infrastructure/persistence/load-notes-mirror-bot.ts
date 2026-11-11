import { okAsync, ResultAsync } from 'neverthrow';
import type { Database } from '../../../../platform/database/types.js';
import { NOTES_MIRROR_BOT_NAME } from '../../domain/rules/mirror-bot.js';
import { storageError } from '../../domain/messages/note-errors.js';
import type {
  DesignateNotesMirrorBot,
  LoadNamedAgent,
  LoadNotesMirrorBot,
} from '../../application/ports.js';

const readString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

/**
 * Insert a designation, or fill one that is still empty. An existing id stays.
 * `organizations.notes_mirror_bot_user_id` is not named. It stays until M5.8d.
 */
const storeMirrorBot = (
  db: Database,
  organizationId: string,
  userId: string,
  message: string
) =>
  ResultAsync.fromPromise(
    db.execute({
      sql: `
        INSERT INTO notes_settings (organization_id, notes_mirror_bot_user_id)
        VALUES (?, ?)
        ON CONFLICT (organization_id) DO UPDATE
        SET notes_mirror_bot_user_id = excluded.notes_mirror_bot_user_id
        WHERE notes_settings.notes_mirror_bot_user_id IS NULL
      `,
      args: [organizationId, userId],
    }),
    (cause) => storageError(message, cause)
  ).map(() => undefined);

/**
 * Resolution order stays: stored notes_settings id, then the env fallback,
 * then the named agent. The env fallback does not write. The membership
 * lookup is access's. The organizations column stays until M5.8d and is not read.
 */
export const loadNotesMirrorBotFromSqlite =
  (
    db: Database,
    fallbackUserId: string | null,
    loadNamedAgent: LoadNamedAgent
  ): LoadNotesMirrorBot =>
  (organizationId) =>
    ResultAsync.fromPromise(
      db.execute({
        sql: `SELECT notes_mirror_bot_user_id FROM notes_settings WHERE organization_id = ?`,
        args: [organizationId],
      }),
      (cause) => storageError('Failed to load notes-mirror bot', cause)
    ).andThen((result) => {
      const stored = readString(result.rows[0]?.notes_mirror_bot_user_id);
      if (stored) {
        return okAsync(stored);
      }
      if (fallbackUserId) {
        return okAsync(fallbackUserId);
      }
      return loadNamedAgent({ organizationId, name: NOTES_MIRROR_BOT_NAME }).andThen((userId) => {
        if (!userId) {
          return okAsync(null);
        }
        return storeMirrorBot(db, organizationId, userId, 'Failed to store notes-mirror bot').map(
          () => userId
        );
      });
    });

export const designateNotesMirrorBotFromSqlite =
  (db: Database): DesignateNotesMirrorBot =>
  (input) => {
    if (input.name !== NOTES_MIRROR_BOT_NAME) {
      return okAsync(undefined);
    }
    return storeMirrorBot(
      db,
      input.organizationId,
      input.userId,
      'Failed to designate notes-mirror bot'
    );
  };
