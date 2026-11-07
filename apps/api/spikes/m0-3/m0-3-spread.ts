/**
 * M0.3 spike. Not a production route and not imported by app.ts.
 *
 * Pinned @orpc/* 2.0.0-beta.48 and Zod 3. Two procedures, v2 spreads v1 and
 * replaces `one`. Mounts use explicit app.route urls, the same shape as
 * orpc-capture-routes.ts. The spike is the only caller.
 */
import { oc } from '@orpc/contract';
import { OpenAPIGenerator, openapi } from '@orpc/openapi';
import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';

const oneInput = z.object({ name: z.string() });
const oneV1Output = z.object({ version: z.literal('v1'), name: z.string() });
const oneV2Output = z.object({
  version: z.literal('v2'),
  name: z.string(),
  extra: z.literal('changed'),
});
const twoOutput = z.object({ ok: z.literal(true) });

const v1Contract = oc.router({
  one: oc.meta(openapi({ method: 'POST', path: '/m03/one' })).input(oneInput).output(oneV1Output),
  two: oc.meta(openapi({ method: 'GET', path: '/m03/two' })).output(twoOutput),
});

const v2Contract = oc.router({
  ...v1Contract,
  one: oc.meta(openapi({ method: 'POST', path: '/m03/one' })).input(oneInput).output(oneV2Output),
});

const v1 = implement(v1Contract);
const v1Procedures = {
  one: v1.one.handler(async ({ input }) => ({ version: 'v1' as const, name: input.name })),
  two: v1.two.handler(async () => ({ ok: true as const })),
};
const v1Router = v1.router(v1Procedures);

const v2 = implement(v2Contract);
const v2Router = v2.router({
  ...v1Procedures,
  one: v2.one.handler(async ({ input }) => ({
    version: 'v2' as const,
    name: input.name,
    extra: 'changed' as const,
  })),
});

const absoluteV1 = oc.router({
  one: oc.meta(openapi({ method: 'POST', path: '/api/v1/m03/one' })).input(oneInput).output(oneV1Output),
  two: oc.meta(openapi({ method: 'GET', path: '/api/v1/m03/two' })).output(twoOutput),
});
const absoluteV2 = oc.router({
  ...absoluteV1,
  one: oc.meta(openapi({ method: 'POST', path: '/api/v2/m03/one' })).input(oneInput).output(oneV2Output),
});

type Prefix = `/${string}`;

const dispatch = async (
  handler: OpenAPIHandler<Record<string, never>>,
  request: FastifyRequest,
  reply: FastifyReply,
  prefix?: Prefix,
) => {
  const result = await handler.handle(request, reply, { prefix, context: {} });
  if (!result.matched) return reply.status(404).send({ message: 'Not found' });
  return reply;
};

const aliasHeaders = (successor: string) => async (_request: FastifyRequest, reply: FastifyReply) => {
  reply.header('Deprecation', 'Thu, 01 Jan 2026 00:00:00 GMT');
  reply.header('Sunset', 'Thu, 02 Apr 2026 00:00:00 GMT');
  reply.header('Link', `<${successor}>; rel="successor-version"`);
};

const pathsOf = (document: { paths?: object }) => Object.keys(document.paths ?? {}).sort();

const schemaOf = (document: { paths?: object }, path: string): unknown => {
  const paths = document.paths as Record<string, { post?: { responses?: Record<string, { content?: Record<string, { schema?: unknown }> }> } }> | undefined;
  return paths?.[path]?.post?.responses?.['200']?.content?.['application/json']?.schema;
};

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const header = (value: unknown) => (typeof value === 'string' ? value : undefined);

const main = async () => {
  const generator = new OpenAPIGenerator();
  const v1Doc = await generator.generate(v1Contract, { version: '3.1.0' });
  const v2Doc = await generator.generate(v2Contract, { version: '3.1.0' });
  const absoluteV2Doc = await generator.generate(absoluteV2, { version: '3.1.0' });

  const v1Paths = pathsOf(v1Doc);
  const v2Paths = pathsOf(v2Doc);
  const absoluteV2Paths = pathsOf(absoluteV2Doc);
  assert(v1Paths.join() === '/m03/one,/m03/two', `v1 paths ${v1Paths.join()}`);
  assert(v2Paths.join() === '/m03/one,/m03/two', `v2 paths ${v2Paths.join()}`);
  const v1OneSchema = schemaOf(v1Doc, '/m03/one');
  const v2OneSchema = schemaOf(v2Doc, '/m03/one');
  const operationId = (document: { paths?: object }, path: string, method: 'get' | 'post') => {
    const paths = document.paths as Record<string, Record<string, { operationId?: string }>> | undefined;
    return paths?.[path]?.[method]?.operationId;
  };
  assert(operationId(v1Doc, '/m03/one', 'post') === 'one', 'v1 one operation');
  assert(operationId(v1Doc, '/m03/two', 'get') === 'two', 'v1 two operation');
  assert(operationId(v2Doc, '/m03/one', 'post') === 'one', 'v2 one operation');
  assert(operationId(v2Doc, '/m03/two', 'get') === 'two', 'v2 two operation');
  assert(v1OneSchema === undefined && v2OneSchema === undefined, 'default converter emitted a Zod schema');
  assert(absoluteV2Paths.includes('/api/v1/m03/two'), 'spread did not keep the v1 path of two');
  assert(absoluteV2Paths.includes('/api/v2/m03/one'), 'changed one lost its v2 path');
  assert(!absoluteV2Paths.includes('/api/v2/m03/two'), 'spread rewrote two onto /api/v2');

  const v1Handler = new OpenAPIHandler(v1Router);
  const v2Handler = new OpenAPIHandler(v2Router);
  const app = Fastify({ logger: false });
  const mount = (handler: OpenAPIHandler<Record<string, never>>, method: 'GET' | 'POST', url: string, prefix: Prefix, onRequest?: (request: FastifyRequest, reply: FastifyReply) => Promise<void>) => {
    app.route({
      method,
      url,
      onRequest,
      handler: async (request, reply) => dispatch(handler, request, reply, prefix),
    });
  };
  mount(v1Handler, 'POST', '/api/v1/m03/one', '/api/v1');
  mount(v1Handler, 'GET', '/api/v1/m03/two', '/api/v1');
  mount(v1Handler, 'POST', '/api/m03/one', '/api', aliasHeaders('/api/v1/m03/one'));
  mount(v1Handler, 'GET', '/api/m03/two', '/api', aliasHeaders('/api/v1/m03/two'));
  mount(v2Handler, 'POST', '/api/v2/m03/one', '/api/v2');
  mount(v2Handler, 'GET', '/api/v2/m03/two', '/api/v2');

  const post = (url: string) => app.inject({ method: 'POST', url, payload: { name: 'ada' } });
  const get = (url: string) => app.inject({ method: 'GET', url });
  const v1One = await post('/api/v1/m03/one');
  const v1Two = await get('/api/v1/m03/two');
  const aliasOne = await post('/api/m03/one');
  const aliasTwo = await get('/api/m03/two');
  const v2OneResponse = await post('/api/v2/m03/one');
  const v2Two = await get('/api/v2/m03/two');

  assert(v1One.statusCode === 200 && v1One.json().version === 'v1', 'v1 one');
  assert(v1Two.statusCode === 200 && v1Two.json().ok === true, 'v1 two');
  assert(aliasOne.statusCode === 200 && aliasOne.json().version === 'v1', 'alias one');
  assert(aliasTwo.statusCode === 200 && aliasTwo.json().ok === true, 'alias two');
  assert(v2OneResponse.statusCode === 200 && v2OneResponse.json().extra === 'changed', 'v2 one');
  assert(v2Two.statusCode === 200 && v2Two.json().ok === true, 'v2 two');

  for (const response of [v1One, v1Two, v2OneResponse, v2Two]) {
    assert(header(response.headers.deprecation) === undefined, 'deprecation leaked');
    assert(header(response.headers.sunset) === undefined, 'sunset leaked');
    assert(header(response.headers.link) === undefined, 'link leaked');
  }
  assert(header(aliasOne.headers.deprecation) === 'Thu, 01 Jan 2026 00:00:00 GMT', 'alias deprecation');
  assert(header(aliasOne.headers.sunset) === 'Thu, 02 Apr 2026 00:00:00 GMT', 'alias sunset');
  assert(header(aliasOne.headers.link) === '</api/v1/m03/one>; rel="successor-version"', 'alias link');
  assert(header(aliasTwo.headers.link) === '</api/v1/m03/two>; rel="successor-version"', 'alias two link');

  const absolute = implement(absoluteV1);
  const absoluteRouter = absolute.router({
    one: absolute.one.handler(async ({ input }) => ({ version: 'v1' as const, name: input.name })),
    two: absolute.two.handler(async () => ({ ok: true as const })),
  });
  const absoluteHandler = new OpenAPIHandler(absoluteRouter);
  const absoluteApp = Fastify({ logger: false });
  absoluteApp.route({
    method: 'POST',
    url: '/api/v1/m03/one',
    handler: async (request, reply) => dispatch(absoluteHandler, request, reply),
  });
  absoluteApp.route({
    method: 'POST',
    url: '/api/m03/one',
    handler: async (request, reply) => dispatch(absoluteHandler, request, reply),
  });
  const absoluteHit = await absoluteApp.inject({ method: 'POST', url: '/api/v1/m03/one', payload: { name: 'ada' } });
  const absoluteAlias = await absoluteApp.inject({ method: 'POST', url: '/api/m03/one', payload: { name: 'ada' } });
  assert(absoluteHit.statusCode === 200, 'absolute v1 path did not serve');
  assert(absoluteAlias.statusCode === 404, 'absolute alias matched without a prefix');

  const wrapped = Fastify({ logger: false });
  await wrapped.register(
    async (child) => {
      child.route({
        method: 'POST',
        url: '/m03/one',
        handler: async (request, reply) => dispatch(v1Handler, request, reply),
      });
    },
    { prefix: '/api/v1' },
  );
  const wrappedHit = await wrapped.inject({ method: 'POST', url: '/api/v1/m03/one', payload: { name: 'ada' } });
  assert(wrappedHit.statusCode === 404, 'Fastify prefix wrap matched oRPC by itself');

  const report = {
    orpc: '2.0.0-beta.48',
    spreadTypechecks: true,
    openapi: {
      requestedVersion: '3.1.0',
      emittedVersion: v1Doc.openapi,
      v1Paths,
      v2Paths,
      zodSchemasEmitted: v1OneSchema !== undefined || v2OneSchema !== undefined,
      absoluteSpreadPaths: absoluteV2Paths,
    },
    serves: {
      v1One: v1One.statusCode,
      v1Two: v1Two.statusCode,
      aliasOne: aliasOne.statusCode,
      aliasTwo: aliasTwo.statusCode,
      v2One: v2OneResponse.statusCode,
      v2Two: v2Two.statusCode,
      absoluteSamePath: absoluteHit.statusCode,
      absoluteAliasWithoutPrefix: absoluteAlias.statusCode,
      fastifyPrefixWrapWithoutHandlePrefix: wrappedHit.statusCode,
    },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  await app.close();
  await absoluteApp.close();
  await wrapped.close();
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
