import { describe, expect, it } from 'vitest';
import { callerLogFields } from './request-caller.js';

describe('callerLogFields', () => {
  it('keeps the token id and omits an absent build', () => {
    expect(
      callerLogFields({
        method: 'GET',
        statusCode: 200,
        userAgent: 'YoinkTest/1.0',
        yoinkBuild: undefined,
        alias: true,
        tokenId: '00000000-0000-4000-8000-000000000002',
      }),
    ).toEqual({
      method: 'GET',
      statusCode: 200,
      userAgent: 'YoinkTest/1.0',
      alias: true,
      tokenId: '00000000-0000-4000-8000-000000000002',
    });
  });

  it('omits the token id when the request was not token-authenticated', () => {
    expect(
      callerLogFields({
        method: 'GET',
        statusCode: 200,
        userAgent: '',
        yoinkBuild: 'web-build',
        alias: undefined,
        tokenId: undefined,
      }),
    ).toEqual({
      method: 'GET',
      statusCode: 200,
      yoinkBuild: 'web-build',
    });
  });
});
