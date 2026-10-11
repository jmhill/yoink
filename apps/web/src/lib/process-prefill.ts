import { PROJECT_OBJECTIVE_MAX_LENGTH } from '@yoink/api-contracts';

const PROJECT_NAME_MAX_LENGTH = 200;

export function projectNameFromCapture(content: string): string {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
  return firstLine.trim().slice(0, PROJECT_NAME_MAX_LENGTH);
}

export function projectObjectiveFromCapture(input: {
  content: string;
  sourceUrl?: string | null;
}): string {
  const url = input.sourceUrl?.trim() ?? '';
  const alreadyHasUrl = url.length > 0 && input.content.includes(url);
  const combined = url.length > 0 && !alreadyHasUrl ? `${input.content}\n${url}` : input.content;
  return combined.slice(0, PROJECT_OBJECTIVE_MAX_LENGTH);
}

export function captureUrlDomain(url: string): string {
  const match = /^https?:\/\/(?:www\.)?([^/?#]+)/i.exec(url);
  return match?.[1] ?? url;
}
