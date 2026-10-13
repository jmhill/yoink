import { err, ok, type Result } from 'neverthrow';

export type NoteMarkdownError = {
  readonly type: 'NOTE_MARKDOWN_INVALID';
  readonly message: string;
};

export type NoteMarkdownFields = {
  readonly id: string;
  readonly projectId: string;
  readonly version: string;
  readonly updatedAt: string;
  readonly title: string;
  readonly body: string;
};

const FRONTMATTER_OPEN = '---';

const quoted = (value: string): string => {
  if (/^[\w.-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
};

const parsedJsonString = (value: string): string | null => {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return null;
  }
};

const stripQuotes = (value: string): string => {
  if (value.startsWith('"') && value.endsWith('"')) {
    return parsedJsonString(value) ?? value.slice(1, -1);
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
};

export const noteToMarkdown = (note: NoteMarkdownFields): string => {
  const heading = `# ${note.title}`;
  const body = note.body.length === 0 ? '' : `\n${note.body}`;
  return [
    FRONTMATTER_OPEN,
    `id: ${quoted(note.id)}`,
    `project_id: ${quoted(note.projectId)}`,
    `version: ${quoted(note.version)}`,
    `updated_at: ${quoted(note.updatedAt)}`,
    FRONTMATTER_OPEN,
    heading,
    body,
  ].join('\n');
};

const parseFrontmatter = (
  block: string
): Result<Omit<NoteMarkdownFields, 'title' | 'body'>, NoteMarkdownError> => {
  const fields = block.split(/\r?\n/).reduce<Readonly<Record<string, string>>>((acc, line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return acc;
    }
    const sep = trimmed.indexOf(':');
    if (sep <= 0) {
      return acc;
    }
    const key = trimmed.slice(0, sep).trim();
    const value = stripQuotes(trimmed.slice(sep + 1).trim());
    return { ...acc, [key]: value };
  }, {});

  if (!fields.id || !fields.project_id || !fields.version || !fields.updated_at) {
    return err({
      type: 'NOTE_MARKDOWN_INVALID',
      message: 'Frontmatter must include id, project_id, version, and updated_at',
    });
  }

  return ok({
    id: fields.id,
    projectId: fields.project_id,
    version: fields.version,
    updatedAt: fields.updated_at,
  });
};

export const markdownToNote = (
  markdown: string
): Result<NoteMarkdownFields, NoteMarkdownError> => {
  const normalized = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith(`${FRONTMATTER_OPEN}\n`)) {
    return err({
      type: 'NOTE_MARKDOWN_INVALID',
      message: 'Note markdown must start with YAML frontmatter',
    });
  }

  const closeAt = normalized.indexOf(`\n${FRONTMATTER_OPEN}\n`, FRONTMATTER_OPEN.length);
  if (closeAt < 0) {
    return err({
      type: 'NOTE_MARKDOWN_INVALID',
      message: 'Note markdown is missing the closing frontmatter fence',
    });
  }

  const rawFrontmatter = normalized.slice(FRONTMATTER_OPEN.length + 1, closeAt);
  const rest = normalized.slice(closeAt + `\n${FRONTMATTER_OPEN}\n`.length);
  const parsed = parseFrontmatter(rawFrontmatter);
  if (parsed.isErr()) {
    return err(parsed.error);
  }

  const lines = rest.split('\n');
  const titleLine = lines.find((line) => line.trim().length > 0);
  if (titleLine === undefined || !titleLine.startsWith('# ')) {
    return err({
      type: 'NOTE_MARKDOWN_INVALID',
      message: 'Note markdown must start the body with a "# title" line',
    });
  }

  const title = titleLine.slice(2).trim();
  if (title.length === 0) {
    return err({
      type: 'NOTE_MARKDOWN_INVALID',
      message: 'Note title cannot be blank',
    });
  }

  const titleIndex = lines.indexOf(titleLine);
  const afterTitle = lines.slice(titleIndex + 1);
  const body = afterTitle[0] === '' ? afterTitle.slice(1).join('\n') : afterTitle.join('\n');

  return ok({
    ...parsed.value,
    title,
    body,
  });
};
