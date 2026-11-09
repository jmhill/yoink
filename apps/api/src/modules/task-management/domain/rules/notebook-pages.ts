import { err, ok, type Result } from 'neverthrow';
import { NOTEBOOK_PAGE_PATH_MAX_LENGTH, NOTEBOOK_PAGES_MAX } from '@yoink/api-contracts';

export const OBSIDIAN_VAULT_NAME = 'jmhill-personal';

export type InvalidNotebookPathError = {
  readonly type: 'INVALID_NOTEBOOK_PATH';
  readonly message: string;
};

export type NotebookPageDuplicateError = {
  readonly type: 'NOTEBOOK_PAGE_DUPLICATE';
  readonly message: string;
};

export type NotebookPagesTooManyError = {
  readonly type: 'NOTEBOOK_PAGES_TOO_MANY';
  readonly message: string;
};

export const invalidNotebookPathError = (message: string): InvalidNotebookPathError => ({
  type: 'INVALID_NOTEBOOK_PATH',
  message,
});

export const notebookPageDuplicateError = (): NotebookPageDuplicateError => ({
  type: 'NOTEBOOK_PAGE_DUPLICATE',
  message: 'A project cannot link the same notebook page twice',
});

export const notebookPagesTooManyError = (): NotebookPagesTooManyError => ({
  type: 'NOTEBOOK_PAGES_TOO_MANY',
  message: `A project can have at most ${NOTEBOOK_PAGES_MAX} notebook pages`,
});

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export const parseNotebookPath = (
  raw: string
): Result<string, InvalidNotebookPathError> => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return err(invalidNotebookPathError("Notebook path can't be blank"));
  }
  if (trimmed.length > NOTEBOOK_PAGE_PATH_MAX_LENGTH) {
    return err(
      invalidNotebookPathError(
        `Notebook path must be ${NOTEBOOK_PAGE_PATH_MAX_LENGTH} characters or fewer`
      )
    );
  }
  if (trimmed.startsWith('/')) {
    return err(invalidNotebookPathError('Notebook path must be vault-relative'));
  }
  if (SCHEME.test(trimmed) || trimmed.includes('://')) {
    return err(invalidNotebookPathError('Notebook path cannot be a URL'));
  }
  const segments = trimmed.split('/');
  if (segments.some((segment) => segment === '..')) {
    return err(invalidNotebookPathError('Notebook path cannot contain ..'));
  }
  if (!trimmed.endsWith('.md')) {
    return err(invalidNotebookPathError('Notebook path must end in .md'));
  }
  return ok(trimmed);
};

export const parseNotebookPages = (
  paths: readonly string[]
): Result<
  string[],
  InvalidNotebookPathError | NotebookPageDuplicateError | NotebookPagesTooManyError
> => {
  if (paths.length > NOTEBOOK_PAGES_MAX) {
    return err(notebookPagesTooManyError());
  }

  const parsed: string[] = [];
  const seen = new Set<string>();
  for (const raw of paths) {
    const path = parseNotebookPath(raw);
    if (path.isErr()) {
      return err(path.error);
    }
    if (seen.has(path.value)) {
      return err(notebookPageDuplicateError());
    }
    seen.add(path.value);
    parsed.push(path.value);
  }
  return ok(parsed);
};

export const encodeObsidianComponent = (value: string): string =>
  encodeURIComponent(value)
    .replaceAll('(', '%28')
    .replaceAll(')', '%29')
    .replaceAll("'", '%27');

export const buildObsidianUrl = (
  path: string,
  vault: string = OBSIDIAN_VAULT_NAME
): string =>
  `obsidian://open?vault=${encodeObsidianComponent(vault)}&file=${encodeObsidianComponent(path)}`;

export const notebookPagesFromPaths = (
  paths: readonly string[]
): { path: string; url: string }[] =>
  paths.map((path) => ({ path, url: buildObsidianUrl(path) }));

export const notebookPagesEqual = (
  left: readonly string[],
  right: readonly string[]
): boolean =>
  left.length === right.length && left.every((path, index) => path === right[index]);
