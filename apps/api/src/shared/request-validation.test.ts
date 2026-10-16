import { describe, expect, it } from 'vitest';
import {
  listedRequestValidationError,
  namedRequestValidationError,
  namedValidationFailedMessage,
  validationIssuePaths,
} from './request-validation.js';

describe('validationIssuePaths', () => {
  it('collects field paths from every request part', () => {
    expect(
      validationIssuePaths({
        message: '[ts-rest] request validation failed',
        body: { issues: [{ path: ['title'], code: 'too_small' }] },
        query: { issues: [{ path: ['filter'], code: 'invalid_enum_value' }] },
        pathParams: { issues: [{ path: ['id'], code: 'invalid_string' }] },
        headers: null,
      })
    ).toEqual(['title', 'filter', 'id']);
  });
});

describe('namedValidationFailedMessage', () => {
  it('names the failing fields', () => {
    expect(namedValidationFailedMessage([])).toBe('Request validation failed');
    expect(namedValidationFailedMessage(['filter', 'owner'])).toBe(
      'Request validation failed: filter, owner'
    );
  });
});

describe('listedRequestValidationError', () => {
  it('keeps a bad time zone as INVALID_TIME_ZONE', () => {
    expect(
      listedRequestValidationError({
        message: '[ts-rest] request validation failed',
        query: { issues: [{ path: ['timeZone'], code: 'custom' }] },
      })
    ).toEqual({
      message: 'Invalid IANA time zone',
      code: 'INVALID_TIME_ZONE',
    });
  });

  it('names other failing fields on VALIDATION_FAILED', () => {
    expect(
      listedRequestValidationError({
        message: '[ts-rest] request validation failed',
        query: { issues: [{ path: ['filter'], code: 'invalid_enum_value' }] },
      })
    ).toEqual({
      message: 'Request validation failed: filter',
      code: 'VALIDATION_FAILED',
      fields: ['filter'],
    });
  });
});

describe('namedRequestValidationError', () => {
  it('turns a ts-rest error into a field-named 400 body', () => {
    expect(
      namedRequestValidationError({
        message: '[ts-rest] request validation failed',
        body: { issues: [{ path: ['name'], code: 'invalid_type' }] },
      })
    ).toEqual({
      message: 'Request validation failed: name',
      code: 'VALIDATION_FAILED',
      fields: ['name'],
    });
  });
});
