/**
 * Notes SQL names only project_notes. Actor names and project names come
 * from consumer-owned ports.
 */
export const NOTE_SELECT_COLUMNS = `
  n.id, n.organization_id, n.project_id, n.title, n.body, n.version,
  n.created_at, n.created_by, n.updated_at, n.updated_by
`;

export const NOTE_FROM = `project_notes n`;

export const NOTE_CHANGE_SELECT_COLUMNS = `
  ${NOTE_SELECT_COLUMNS},
  n.deleted_at
`;

export const NOTE_CHANGE_FROM = `project_notes n`;
