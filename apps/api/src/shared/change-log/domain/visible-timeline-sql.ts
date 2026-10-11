/**
 * Visible timeline rows: not hidden, and not a TaskUpdated that only
 * moved the task between projects (or only touched openOrder).
 *
 * json_type is NULL when the key is absent and 'null' when the payload
 * cleared the field — a cleared due date must still show.
 */
export const VISIBLE_TIMELINE_SQL = `
  hidden = 0
  AND NOT (
    kind = 'TaskUpdated'
    AND json_type(payload_json, '$.title') IS NULL
    AND json_type(payload_json, '$.dueDate') IS NULL
    AND json_type(payload_json, '$.assigneeId') IS NULL
    AND json_type(payload_json, '$.listId') IS NULL
  )
`;
