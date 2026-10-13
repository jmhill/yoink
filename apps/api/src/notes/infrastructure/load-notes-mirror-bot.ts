import { okAsync, ResultAsync } from 'neverthrow';
import type { Database } from '../../database/types.js';
import { NOTES_MIRROR_BOT_NAME } from '../domain/mirror-bot.js';
import { storageError } from '../domain/note-errors.js';
import type { DesignateNotesMirrorBot, LoadNotesMirrorBot } from '../application/ports.js';

const readString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

export const loadNotesMirrorBotFromSqlite =
  (db: Database, fallbackUserId: string | null): LoadNotesMirrorBot =>
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
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            SELECT u.id AS id
            FROM organization_memberships m
            JOIN users u ON u.id = m.user_id
            WHERE m.organization_id = ?
              AND u.kind = 'agent'
              AND u.name = ?
            ORDER BY m.joined_at
            LIMIT 1
          `,
          args: [organizationId, NOTES_MIRROR_BOT_NAME],
        }),
        (cause) => storageError('Failed to resolve notes-mirror bot', cause)
      ).andThen((found) => {
        const userId = readString(found.rows[0]?.id);
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
