import type { FastifyInstance, FastifyRequest } from 'fastify';

type JsonParserDone = (error: Error | null, body?: unknown) => void;

export type JsonBodyDecision = { kind: 'absent' } | { kind: 'parse' };

export type HeaderField = string | string[] | undefined;

export type JsonBodyQuery = {
  method: string;
  body: string;
  contentLength: HeaderField;
  transferEncoding: HeaderField;
};

/**
 * Fastify 4 skipped the JSON parser for DELETE when neither Content-Length
 * nor Transfer-Encoding was set, and the handler saw no body. A declared
 * length, including 0, was parsed and an empty body was rejected.
 */
export const decideJsonBody = (query: JsonBodyQuery): JsonBodyDecision => {
  if (
    query.method === 'DELETE' &&
    query.body.length === 0 &&
    query.contentLength === undefined &&
    query.transferEncoding === undefined
  ) {
    return { kind: 'absent' };
  }
  return { kind: 'parse' };
};

const jsonText = (body: string | Buffer): string =>
  typeof body === 'string' ? body : body.toString('utf8');

const parseDeleteOrJson = (
  parseJson: (request: FastifyRequest, body: string, done: JsonParserDone) => void,
  request: FastifyRequest,
  body: string | Buffer,
  done: JsonParserDone
): void => {
  const text = jsonText(body);
  const decision = decideJsonBody({
    method: request.method,
    body: text,
    contentLength: request.headers['content-length'],
    transferEncoding: request.headers['transfer-encoding'],
  });
  switch (decision.kind) {
    case 'absent':
      done(null, undefined);
      return;
    case 'parse':
      parseJson(request, text, done);
      return;
    default: {
      const _never: never = decision;
      void _never;
    }
  }
};

export const registerJsonBodyParser = (app: FastifyInstance): void => {
  const parseJson = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');

  const bodyLimit = app.initialConfig.bodyLimit;
  if (bodyLimit === undefined) {
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
      parseDeleteOrJson(parseJson, request, body, done);
    });
    return;
  }
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string', bodyLimit },
    (request, body, done) => {
      parseDeleteOrJson(parseJson, request, body, done);
    }
  );
};
