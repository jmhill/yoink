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
 * Resolution order stays: stored notes_mirror_bot_user_id, then the env
 * fallback, then the named agent. The membership lookup is access's.
 * The organizations column stays until M5.8c.
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
        sql: `SELECT notes_mirror_bot_user_id FROM organizations WHERE id = ?`,
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
        return ResultAsync.fromPromise(
          db.execute({
            sql: `
              UPDATE organizations
              SET notes_mirror_bot_user_id = ?
              WHERE id = ? AND notes_mirror_bot_user_id IS NULL
            `,
            args: [userId, organizationId],
          }),
          (cause) => storageError('Failed to store notes-mirror bot', cause)
        ).map(() => userId);
      });
    });

export const designateNotesMirrorBotFromSqlite =
  (db: Database): DesignateNotesMirrorBot =>
  (input) => {
    if (input.name !== NOTES_MIRROR_BOT_NAME) {
      return okAsync(undefined);
    }
    return ResultAsync.fromPromise(
      db.execute({
        sql: `
          UPDATE organizations
          SET notes_mirror_bot_user_id = ?
          WHERE id = ? AND notes_mirror_bot_user_id IS NULL
        `,
        args: [input.userId, input.organizationId],
      }),
      (cause) => storageError('Failed to designate notes-mirror bot', cause)
    ).map(() => undefined);
  };
