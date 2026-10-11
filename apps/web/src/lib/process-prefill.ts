import { PROJECT_NAME_MAX_LENGTH, PROJECT_OBJECTIVE_MAX_LENGTH } from '@yoink/api-contracts';

export function projectNameFromCapture(content: string): string {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
  return firstLine.trim().slice(0, PROJECT_NAME_MAX_LENGTH);
}

export function projectObjectiveFromCapture(input: {
  content: string;
  sourceUrl?: string | null;
}): string {
  const url = input.sourceUrl?.trim() ?? '';
  const lines = input.content.split(/\r?\n/);
  const rest = lines.slice(1).join('\n').trim();
  if (rest.length === 0) {
    return url.slice(0, PROJECT_OBJECTIVE_MAX_LENGTH);
  }
  const alreadyHasUrl = url.length > 0 && input.content.includes(url);
  const body = url.length > 0 && !alreadyHasUrl ? `${rest}\n${url}` : rest;
  return body.slice(0, PROJECT_OBJECTIVE_MAX_LENGTH);
}

export function captureUrlDomain(url: string): string {
  const match = /^https?:\/\/(?:www\.)?([^/?#]+)/i.exec(url);
  return match?.[1] ?? url;
}
