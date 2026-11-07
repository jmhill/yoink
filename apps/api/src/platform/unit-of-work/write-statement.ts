import { WRITE_VERBS, type GuardedStatement, type WriteVerb } from '../../kernel/unit-of-work.js';

const WRITE_VERB_SET: ReadonlySet<string> = new Set(WRITE_VERBS);

/**
 * Accepts one insert, update, or delete whose text matches `verb`.
 * Leading comments are skipped. A second statement is rejected.
 * This is a statement-boundary check, not a SQL parser: the body of an
 * accepted write is not interpreted, so `INSERT ... SELECT` stays a write.
 * `WITH` is not a supported verb.
 */
export const acceptedWrite = (statement: GuardedStatement): boolean =>
  scanWriteVerb(statement.sql) === statement.verb;

const scanWriteVerb = (sql: string): WriteVerb | undefined => {
  const start = skipTrivia(sql, 0);
  if (start === undefined) {
    return undefined;
  }
  const word = readWord(sql, start);
  if (!word || !WRITE_VERB_SET.has(word.text)) {
    return undefined;
  }
  const end = skipSingleStatement(sql, word.end);
  if (end === undefined) {
    return undefined;
  }
  return word.text as WriteVerb;
};

const skipTrivia = (sql: string, index: number): number | undefined => {
  let cursor = index;
  while (cursor < sql.length) {
    const char = sql[cursor];
    if (char !== undefined && /\s/.test(char)) {
      cursor += 1;
      continue;
    }
    if (sql.startsWith('--', cursor)) {
      const newline = sql.indexOf('\n', cursor + 2);
      cursor = newline === -1 ? sql.length : newline + 1;
      continue;
    }
    if (sql.startsWith('/*', cursor)) {
      const end = sql.indexOf('*/', cursor + 2);
      if (end === -1) {
        return undefined;
      }
      cursor = end + 2;
      continue;
    }
    return cursor;
  }
  return cursor;
};

const readWord = (sql: string, index: number): { readonly text: string; readonly end: number } | undefined => {
  const first = sql[index];
  if (first === undefined || !/[A-Za-z_]/.test(first)) {
    return undefined;
  }
  let end = index + 1;
  while (end < sql.length) {
    const char = sql[end];
    if (char === undefined || !/[A-Za-z0-9_]/.test(char)) {
      break;
    }
    end += 1;
  }
  return { text: sql.slice(index, end).toLowerCase(), end };
};

/** Walks one statement. Undefined means an unclosed quote or comment, or another statement. */
const skipSingleStatement = (sql: string, index: number): number | undefined => {
  let cursor = index;
  while (cursor < sql.length) {
    const char = sql[cursor];
    if (char === undefined) {
      return undefined;
    }
    if (/\s/.test(char)) {
      cursor += 1;
      continue;
    }
    if (sql.startsWith('--', cursor)) {
      const newline = sql.indexOf('\n', cursor + 2);
      cursor = newline === -1 ? sql.length : newline + 1;
      continue;
    }
    if (sql.startsWith('/*', cursor)) {
      const end = sql.indexOf('*/', cursor + 2);
      if (end === -1) {
        return undefined;
      }
      cursor = end + 2;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const closed = skipQuoted(sql, cursor, char);
      if (closed === undefined) {
        return undefined;
      }
      cursor = closed;
      continue;
    }
    if (char === '[') {
      const end = sql.indexOf(']', cursor + 1);
      if (end === -1) {
        return undefined;
      }
      cursor = end + 1;
      continue;
    }
    if (char === ';') {
      const after = skipTrivia(sql, cursor + 1);
      if (after === undefined || after !== sql.length) {
        return undefined;
      }
      return sql.length;
    }
    cursor += 1;
  }
  return sql.length;
};

const skipQuoted = (sql: string, index: number, quote: string): number | undefined => {
  let cursor = index + 1;
  while (cursor < sql.length) {
    if (sql[cursor] === quote) {
      if (sql[cursor + 1] === quote) {
        cursor += 2;
        continue;
      }
      return cursor + 1;
    }
    cursor += 1;
  }
  return undefined;
};
