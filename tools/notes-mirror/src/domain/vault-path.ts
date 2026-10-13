const isIllegalFolderChar = (char: string): boolean => {
  const code = char.charCodeAt(0);
  return (
    code <= 31 ||
    char === '/' ||
    char === '\\' ||
    char === ':' ||
    char === '*' ||
    char === '?' ||
    char === '"' ||
    char === '<' ||
    char === '>' ||
    char === '|'
  );
};

export const YOINK_NOTES_FOLDER = 'Yoink notes';
export const NOTE_SHORT_ID_LENGTH = 6;

export const noteShortId = (noteId: string): string =>
  noteId.replaceAll('-', '').slice(0, NOTE_SHORT_ID_LENGTH).toLowerCase();

export const noteCreatedDate = (createdAt: string): string => createdAt.slice(0, 10);

export const safeProjectFolderName = (projectName: string): string => {
  const replaced = [...projectName]
    .map((char) => (isIllegalFolderChar(char) ? '-' : char))
    .join('')
    .replace(/\s*-\s*/g, '-')
    .replace(/-+/g, '-')
    .replace(/\s+/g, ' ');
  const trimmed = replaced.replace(/^[-.\s]+|[-.\s]+$/g, '');
  return trimmed.length > 0 ? trimmed : 'project';
};

export const vaultNoteFileName = (input: { createdAt: string; noteId: string }): string =>
  `${noteCreatedDate(input.createdAt)} ${noteShortId(input.noteId)}.md`;

export const vaultNotePath = (input: {
  projectName: string;
  createdAt: string;
  noteId: string;
}): string =>
  `${YOINK_NOTES_FOLDER}/${safeProjectFolderName(input.projectName)}/${vaultNoteFileName(input)}`;

export const vaultArchivePath = (relativePath: string): string => `archive/${relativePath}`;

export const vaultSyncConflictPath = (input: {
  createdAt: string;
  noteId: string;
  conflictedAt: string;
}): string => {
  const stamp = input.conflictedAt.replaceAll(':', '').replaceAll('.', '-');
  return `archive/sync-conflicts/${noteCreatedDate(input.createdAt)} ${noteShortId(input.noteId)} ${stamp}.md`;
};

export const projectFolderFromPath = (relativePath: string): string | null => {
  const parts = relativePath.split('/');
  if (parts[0] !== YOINK_NOTES_FOLDER || parts.length < 3) {
    return null;
  }
  return parts[1] ?? null;
};
