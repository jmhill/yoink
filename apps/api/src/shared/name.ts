import { err, ok, type Result } from 'neverthrow';

export const ENTITY_NAME_MAX_LENGTH = 200;

export type EntityNameParseFailure = 'empty' | 'too_long';

export const normalizeEntityName = (name: string): string => name.trim().toLowerCase();

export const parseEntityName = (raw: string): Result<string, EntityNameParseFailure> => {
  const name = raw.trim();

  if (name.length < 1) {
    return err('empty');
  }

  if (name.length > ENTITY_NAME_MAX_LENGTH) {
    return err('too_long');
  }

  return ok(name);
};

export const entityNameIsTaken = (
  name: string,
  existingNames: readonly string[]
): boolean => {
  const normalized = normalizeEntityName(name);
  return existingNames.some((existing) => normalizeEntityName(existing) === normalized);
};
