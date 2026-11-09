import { getOpenAPIMeta, OpenAPIGenerator } from '@orpc/openapi';
import addFormatsModule from 'ajv-formats';
import type { FormatsPlugin } from 'ajv-formats';
import { Ajv2020 } from 'ajv/dist/2020.js';

// ajv-formats is CJS. Its default export is the plugin function; the declared type is the module namespace.
import { describe, expect, it } from 'vitest';
import type { ZodTypeAny } from 'zod';
import { CreateNamedListSchema, RenameNamedListSchema } from '../../schemas/list.js';
import { CreateNoteSchema, ImportNoteFromObsidianSchema, NOTE_TITLE_MAX_LENGTH, UpdateNoteSchema } from '../../schemas/note.js';
import {
  CreateProjectSchema,
  PROJECT_NAME_MAX_LENGTH,
  SetProjectNextActionSchema,
  UpdateProjectSchema,
} from '../../schemas/project.js';
import { TimeZoneSchema } from '../../schemas/work.js';
import { publicApiV1Contract } from './contract.js';
import { TIME_ZONE_UNENCODED_REASON, generatePublicApiV1OpenApi } from './openapi-document.js';
import { Zod3JsonSchemaConverter } from './zod3-json-schema-converter.js';

type Json = Record<string, unknown>;

type Parameter = {
  name?: string;
  in?: string;
  required?: boolean;
  schema?: Json;
  content?: Record<string, { schema?: Json }>;
};

type UnencodedField = {
  name?: string;
  in?: string;
  reason?: string;
};

type Operation = {
  parameters?: Parameter[];
  requestBody?: { content?: Record<string, { schema?: Json }> };
  responses?: Record<string, { description?: string; content?: Record<string, { schema?: Json }> }>;
  'x-yoink-unencoded'?: UnencodedField[];
};

type Document = {
  openapi?: string;
  paths?: Record<string, Record<string, Operation>>;
};

const messageBody = {
  type: 'object',
  properties: { message: { type: 'string' } },
  required: ['message'],
  additionalProperties: false,
};

const validationFailedBody = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    code: { type: 'string', const: 'VALIDATION_FAILED' },
    fields: { type: 'array', items: { type: 'string' } },
  },
  required: ['message', 'code', 'fields'],
  additionalProperties: false,
};

const invalidCursorBody = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    code: { type: 'string', const: 'invalid_cursor' },
  },
  required: ['message', 'code'],
  additionalProperties: false,
};

const invalidTimeZoneBody = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    code: { type: 'string', const: 'INVALID_TIME_ZONE' },
  },
  required: ['message', 'code'],
  additionalProperties: false,
};

const listedBadRequest = {
  oneOf: [{ anyOf: [validationFailedBody, invalidTimeZoneBody] }, invalidCursorBody],
};

const addFormats = addFormatsModule as unknown as FormatsPlugin;
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const operation = (document: Document, path: string, method: string): Operation => {
  const found = document.paths?.[path]?.[method];
  if (found === undefined) throw new Error(`missing ${method} ${path}`);
  return found;
};

const bodySchema = (operation: Operation): Json => {
  const schema = operation.requestBody?.content?.['application/json']?.schema;
  if (schema === undefined) throw new Error('missing request body schema');
  return schema;
};

const responseSchema = (operation: Operation, status: string): Json => {
  const schema = operation.responses?.[status]?.content?.['application/json']?.schema;
  if (schema === undefined) throw new Error(`missing ${status} schema`);
  return schema;
};

const parameterSchema = (operation: Operation, name: string): { required: boolean; schema: Json } => {
  const parameter = operation.parameters?.find((item) => item.name === name);
  if (parameter === undefined) throw new Error(`missing parameter ${name}`);
  const schema = parameter.schema ?? parameter.content?.['application/json']?.schema;
  if (schema === undefined) throw new Error(`missing parameter schema ${name}`);
  return { required: parameter.required === true, schema };
};

const assertSchemaShaped = (schema: unknown, path: string): void => {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    throw new Error(`${path} is not a schema object`);
  }
  if (Object.keys(schema).length === 0) throw new Error(`${path} is {}`);
  const record = schema as Json;
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    const list = record[key];
    if (Array.isArray(list)) {
      list.forEach((item, index) => assertSchemaShaped(item, `${path}/${key}/${index}`));
    }
  }
  if (record.items !== undefined) assertSchemaShaped(record.items, `${path}/items`);
  if (typeof record.properties === 'object' && record.properties !== null) {
    for (const [name, property] of Object.entries(record.properties)) {
      assertSchemaShaped(property, `${path}/properties/${name}`);
    }
  }
};

const expectAcceptance = (schema: Json, zodSchema: ZodTypeAny, cases: ReadonlyArray<{ value: unknown; accepts: boolean }>): void => {
  const validate = ajv.compile(schema);
  for (const testCase of cases) {
    const wireAccepts = zodSchema.safeParse(testCase.value).success;
    expect(wireAccepts, JSON.stringify(testCase.value)).toBe(testCase.accepts);
    expect(validate(testCase.value), JSON.stringify({ value: testCase.value, errors: validate.errors })).toBe(testCase.accepts);
  }
};

const trimmedValues = (max: number): Array<{ value: string; accepts: boolean }> => [
  { value: '   ', accepts: false },
  { value: '\t\n', accepts: false },
  { value: '\u00A0', accepts: false },
  { value: '\u3000', accepts: false },
  { value: '\uFEFF', accepts: false },
  { value: '  a  ', accepts: true },
  { value: '\u00A0a\u00A0', accepts: true },
  { value: '\u200B', accepts: true },
  { value: '\u0085', accepts: true },
  { value: 'a'.repeat(max), accepts: true },
  { value: 'a'.repeat(max + 1), accepts: false },
  { value: ` ${'a'.repeat(max)} `, accepts: true },
  { value: ` ${'a'.repeat(max + 1)} `, accepts: false },
];

const propertySchemasNamed = (schema: unknown, name: string, found: Json[]): void => {
  if (typeof schema !== 'object' || schema === null) return;
  const record = schema as Json;
  const properties = record.properties;
  if (typeof properties === 'object' && properties !== null && !Array.isArray(properties) && name in properties) {
    found.push((properties as Json)[name] as Json);
  }
  for (const key of ['anyOf', 'oneOf', 'allOf', 'items']) {
    const child = record[key];
    if (Array.isArray(child)) child.forEach((item) => propertySchemasNamed(item, name, found));
    else if (child !== undefined && key === 'items') propertySchemasNamed(child, name, found);
  }
  if (typeof properties === 'object' && properties !== null && !Array.isArray(properties)) {
    for (const property of Object.values(properties)) propertySchemasNamed(property, name, found);
  }
};

const walkOperations = (document: Document): Array<{ path: string; method: string; operation: Operation }> => {
  const found: Array<{ path: string; method: string; operation: Operation }> = [];
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const operation = item[method];
      if (operation !== undefined) found.push({ path, method, operation });
    }
  }
  return found;
};

describe('public v1 OpenAPI document', () => {
  it('keeps the stock generator from describing Zod schemas', async () => {
    const document = (await new OpenAPIGenerator().generate(
      { create: publicApiV1Contract.captures.create },
      { version: '3.1.0' },
    )) as Document;
    expect(operation(document, '/captures', 'post').responses?.['201']?.content).toEqual({});
    expect(publicApiV1Contract.captures.create['~orpc'].errorMap).toEqual({});
  });

  it('describes frozen inputs, outputs, and the wire error bodies', async () => {
    const document = (await generatePublicApiV1OpenApi()) as Document;
    expect(document.openapi).toBe('3.1.0');
    expect(publicApiV1Contract.captures.create['~orpc'].errorMap).toEqual({});
    expect(publicApiV1Contract.tasks.list['~orpc'].errorMap).toEqual({});

    const operations = walkOperations(document);
    expect(operations).toHaveLength(59);
    for (const { path, method, operation } of operations) {
      const request = operation.requestBody?.content;
      if (request !== undefined) {
        expect(request, `${method} ${path} request`).not.toEqual({});
        for (const [media, entry] of Object.entries(request)) {
          assertSchemaShaped(entry.schema, `${method} ${path} request ${media}`);
        }
      }
      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        if (response.content === undefined) continue;
        expect(response.content, `${method} ${path} ${status}`).not.toEqual({});
        for (const [media, entry] of Object.entries(response.content)) {
          assertSchemaShaped(entry.schema, `${method} ${path} ${status} ${media}`);
        }
      }
      for (const parameter of operation.parameters ?? []) {
        const schema = parameter.schema ?? parameter.content?.['application/json']?.schema;
        assertSchemaShaped(schema, `${method} ${path} parameter ${parameter.name ?? ''}`);
      }
    }

    const create = operation(document, '/captures', 'post');
    expect(bodySchema(create)).toEqual({
      type: 'object',
      properties: {
        content: { type: 'string', minLength: 1, maxLength: 10000 },
        title: { type: 'string', maxLength: 200 },
        sourceUrl: { type: 'string', format: 'uri' },
        sourceApp: { type: 'string', maxLength: 100 },
      },
      required: ['content'],
    });
    expect(responseSchema(create, '201').properties).toMatchObject({
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string', maxLength: 200 },
      status: { type: 'string', enum: ['inbox', 'trashed', 'processed'] },
      sourceUrl: { type: 'string', format: 'uri' },
    });
    expect((responseSchema(create, '201').required as string[]).includes('title')).toBe(false);
    expect(responseSchema(create, '201').required).toEqual(
      expect.arrayContaining(['id', 'content', 'status', 'capturedAt']),
    );
    expect(responseSchema(create, '400')).toEqual(validationFailedBody);
    expect(responseSchema(create, '401')).toEqual(messageBody);
    expect(responseSchema(create, '403')).toEqual(messageBody);
    expect(responseSchema(create, '500')).toEqual(messageBody);

    const list = operation(document, '/captures', 'get');
    expect(parameterSchema(list, 'snoozed')).toEqual({
      required: false,
      schema: { type: 'boolean' },
    });
    expect(parameterSchema(list, 'status').schema).toEqual({
      type: 'string',
      enum: ['inbox', 'trashed', 'processed'],
    });
    expect(parameterSchema(list, 'limit')).toEqual({
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 1000 },
    });
    expect(responseSchema(list, '400')).toEqual({
      oneOf: [validationFailedBody, invalidCursorBody],
    });
    expect(responseSchema(operation(document, '/captures/{id}', 'get'), '404')).toEqual(messageBody);
    expect(responseSchema(list, '200').properties).toMatchObject({
      hasMore: { type: 'boolean' },
      nextCursor: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      total: { type: 'integer', minimum: 0 },
    });

    const taskUpdate = operation(document, '/tasks/{id}', 'patch');
    const updateBody = bodySchema(taskUpdate);
    const updateProperties = updateBody.properties as Json;
    expect(updateProperties.dueDate).toEqual({
      anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }],
    });
    expect(updateProperties.id).toBeUndefined();
    expect(updateBody.required).toBeUndefined();
    expect(parameterSchema(taskUpdate, 'id')).toEqual({
      required: true,
      schema: { type: 'string', format: 'uuid' },
    });

    const nextActions = operation(document, '/work/next-actions', 'get');
    expect(parameterSchema(nextActions, 'owner')).toEqual({
      required: false,
      schema: { type: 'string', enum: ['all', 'me'], default: 'all' },
    });

    const nextAction = operation(document, '/projects/{id}/next-action', 'put');
    expect(getOpenAPIMeta(publicApiV1Contract.projects.setNextAction)?.spec).toBeUndefined();
    expect(bodySchema(nextAction).anyOf).toEqual([
      {
        type: 'object',
        properties: { taskId: { type: 'string', format: 'uuid' } },
        required: ['taskId'],
      },
      {
        type: 'object',
        properties: { taskId: { type: 'null' } },
        required: ['taskId'],
      },
      {
        type: 'object',
        properties: {
          newTask: {
            type: 'object',
            properties: {
              title: expect.any(Object),
              dueDate: { type: 'string', format: 'date' },
              assigneeId: { type: 'string', format: 'uuid' },
              listId: { type: 'string', format: 'uuid' },
            },
            required: ['title'],
          },
        },
        required: ['newTask'],
      },
    ]);

    const changed = operation(document, '/notes/changed', 'get');
    const changes = (responseSchema(changed, '200').properties as Json).changes as Json;
    const variants = (changes.items as Json).anyOf as Json[];
    expect(variants.map((variant) => (variant.properties as Json).kind)).toEqual([
      { type: 'string', const: 'upserted' },
      { type: 'string', const: 'deleted' },
    ]);

    const nextTask = ((bodySchema(nextAction).anyOf as Json[])[2]?.properties as Json).newTask as Json;
    const nextTitle = (nextTask.properties as Json).title as Json;
    expect(nextTitle.minLength).toBeUndefined();
    expect(nextTitle.maxLength).toBeUndefined();
    expect(nextTitle.pattern).toEqual(expect.any(String));

    const tasks = operation(document, '/tasks', 'get');
    expect(responseSchema(tasks, '400')).toEqual(listedBadRequest);
    expect(responseSchema(operation(document, '/work/due', 'get'), '400')).toEqual(listedBadRequest);
    expect(responseSchema(operation(document, '/work/due', 'get'), '401')).toEqual(messageBody);
    expect(responseSchema(operation(document, '/work/due', 'get'), '500')).toEqual(messageBody);
    expect(responseSchema(operation(document, '/review', 'get'), '400')).toEqual(listedBadRequest);
    expect(responseSchema(operation(document, '/review', 'get'), '500')).toEqual(messageBody);

    const deleted = operation(document, '/captures/{id}', 'delete');
    expect(deleted.responses?.['204']?.content).toBeUndefined();
    expect(deleted.responses?.['204']?.description).toEqual(expect.any(String));
  });

  it('rejects the same illegal bodies the frozen Zod schemas reject', async () => {
    const document = (await generatePublicApiV1OpenApi()) as Document;
    const projectId = '550e8400-e29b-41d4-a716-446655440000';
    const noteId = '550e8400-e29b-41d4-a716-446655440001';

    const createProject = bodySchema(operation(document, '/projects', 'post'));
    const createName = (createProject.properties as Json).name as Json;
    expect(createName.minLength).toBeUndefined();
    expect(createName.maxLength).toBeUndefined();
    expectAcceptance(
      createProject,
      CreateProjectSchema,
      trimmedValues(PROJECT_NAME_MAX_LENGTH).map((testCase) => ({ value: { name: testCase.value }, accepts: testCase.accepts })),
    );

    const updateProject = bodySchema(operation(document, '/projects/{id}', 'patch'));
    expect((updateProject.anyOf as Json[]).map((branch) => branch.required)).toEqual([
      ['name'],
      ['objective'],
      ['notebookPages'],
      ['reason'],
      ['suggestedNextAction'],
    ]);
    const updateName = (((updateProject.anyOf as Json[])[0]?.properties as Json).name ?? {}) as Json;
    expect(updateName.minLength).toBeUndefined();
    expect(updateName.pattern).toEqual(expect.any(String));
    expectAcceptance(updateProject, UpdateProjectSchema, [
      { value: {}, accepts: false },
      { value: { extra: true }, accepts: false },
      { value: { objective: null }, accepts: true },
      { value: { notebookPages: [] }, accepts: true },
      { value: { reason: null }, accepts: true },
      { value: { suggestedNextAction: null }, accepts: true },
      { value: { name: null }, accepts: false },
      ...trimmedValues(PROJECT_NAME_MAX_LENGTH).map((testCase) => ({
        value: { name: testCase.value },
        accepts: testCase.accepts,
      })),
    ]);

    const updateNote = bodySchema(operation(document, '/projects/{projectId}/notes/{noteId}', 'patch'));
    expect((updateNote.anyOf as Json[]).map((branch) => branch.required)).toEqual([
      ['expectedVersion', 'title'],
      ['expectedVersion', 'body'],
    ]);
    expectAcceptance(updateNote, UpdateNoteSchema, [
      { value: { expectedVersion: '1' }, accepts: false },
      { value: { title: 'Note', expectedVersion: '1' }, accepts: true },
      { value: { body: '', expectedVersion: '1' }, accepts: true },
      { value: { body: 'x', expectedVersion: '1' }, accepts: true },
      { value: { title: '   ', expectedVersion: '1' }, accepts: false },
      { value: { title: '  a  ', expectedVersion: '1' }, accepts: true },
      { value: { title: `\u00A0${'a'.repeat(NOTE_TITLE_MAX_LENGTH)}\u00A0`, expectedVersion: '1' }, accepts: true },
      { value: { title: 'a'.repeat(NOTE_TITLE_MAX_LENGTH + 1), expectedVersion: '1' }, accepts: false },
    ]);

    const createNote = bodySchema(operation(document, '/projects/{projectId}/notes', 'post'));
    expect((createNote.properties as Json).projectId).toBeUndefined();
    expectAcceptance(
      createNote,
      CreateNoteSchema,
      trimmedValues(NOTE_TITLE_MAX_LENGTH).map((testCase) => ({ value: { title: testCase.value }, accepts: testCase.accepts })),
    );

    const imported = bodySchema(operation(document, '/notes/import', 'post'));
    expect(imported.dependentRequired).toEqual({ noteId: ['baseVersion'] });
    const importBase = { projectId, title: 'Note', body: 'Body' };
    expectAcceptance(imported, ImportNoteFromObsidianSchema, [
      { value: importBase, accepts: true },
      { value: { ...importBase, noteId }, accepts: false },
      { value: { ...importBase, noteId, baseVersion: '1' }, accepts: true },
      { value: { ...importBase, baseVersion: '1' }, accepts: true },
      { value: { ...importBase, title: '   ' }, accepts: false },
      { value: { ...importBase, title: '  a  ' }, accepts: true },
    ]);

    const createList = bodySchema(operation(document, '/lists', 'post'));
    expect(((createList.properties as Json).name as Json).minLength).toBeUndefined();
    expectAcceptance(
      createList,
      CreateNamedListSchema,
      trimmedValues(200).map((testCase) => ({ value: { name: testCase.value }, accepts: testCase.accepts })),
    );
    const renameList = bodySchema(operation(document, '/lists/{id}', 'patch'));
    expect((renameList.properties as Json).id).toBeUndefined();
    expectAcceptance(
      renameList,
      RenameNamedListSchema,
      trimmedValues(200).map((testCase) => ({ value: { name: testCase.value }, accepts: testCase.accepts })),
    );

    const nextAction = bodySchema(operation(document, '/projects/{id}/next-action', 'put'));
    expectAcceptance(
      nextAction,
      SetProjectNextActionSchema,
      trimmedValues(500).map((testCase) => ({ value: { newTask: { title: testCase.value } }, accepts: testCase.accepts })),
    );
    expectAcceptance(nextAction, SetProjectNextActionSchema, [
      { value: {}, accepts: false },
      { value: { taskId: projectId }, accepts: true },
      { value: { taskId: null }, accepts: true },
    ]);
  });

  it('does not publish a time zone schema that accepts Mars/Base', async () => {
    const taskInput = publicApiV1Contract.tasks.list['~orpc'].inputSchemas?.[0] as ZodTypeAny;
    const doneOutput = publicApiV1Contract.review.done['~orpc'].outputSchemas?.[0] as unknown as {
      shape: Record<string, unknown>;
    };
    expect(taskInput.safeParse({ timeZone: 'Mars/Base' }).success).toBe(false);
    expect(taskInput.safeParse({ timeZone: 'America/Chicago' }).success).toBe(true);
    expect(taskInput.safeParse({}).success).toBe(true);
    expect(doneOutput.shape.timeZone).toBeDefined();
    expect(TimeZoneSchema.safeParse('Mars/Base').success).toBe(false);
    expect(TimeZoneSchema.safeParse('Not/AZone').success).toBe(false);
    expect(TimeZoneSchema.safeParse('America/Chicago').success).toBe(true);
    expect(TimeZoneSchema.safeParse('america/chicago').success).toBe(true);
    expect(TimeZoneSchema.safeParse('UTC').success).toBe(true);
    expect(TimeZoneSchema.safeParse('US/Central').success).toBe(true);
    expect(TimeZoneSchema.safeParse('+05:30').success).toBe(true);
    expect(() => new Zod3JsonSchemaConverter().convert(TimeZoneSchema, 'input')).toThrow(
      'Zod 3 schema has no JSON Schema mapping: ZodEffects refinement Intl.DateTimeFormat timeZone',
    );

    const document = (await generatePublicApiV1OpenApi()) as Document;
    const timeZoneSchemas: Json[] = [];
    for (const { operation } of walkOperations(document)) {
      for (const parameter of operation.parameters ?? []) {
        expect(parameter.name).not.toBe('timeZone');
        propertySchemasNamed(parameter.schema, 'timeZone', timeZoneSchemas);
      }
      propertySchemasNamed(operation.requestBody?.content?.['application/json']?.schema, 'timeZone', timeZoneSchemas);
      for (const response of Object.values(operation.responses ?? {})) {
        for (const media of Object.values(response.content ?? {})) propertySchemasNamed(media.schema, 'timeZone', timeZoneSchemas);
      }
    }
    expect(timeZoneSchemas).toEqual([]);

    const unencoded = walkOperations(document).flatMap(({ method, path, operation }) =>
      (operation['x-yoink-unencoded'] ?? []).map((field) => ({
        method,
        path,
        name: field.name,
        in: field.in,
        reason: field.reason,
      })),
    );
    expect(unencoded).toEqual([
      { method: 'get', path: '/tasks', name: 'timeZone', in: 'query', reason: TIME_ZONE_UNENCODED_REASON },
      { method: 'get', path: '/work/due', name: 'timeZone', in: 'query', reason: TIME_ZONE_UNENCODED_REASON },
      { method: 'get', path: '/review', name: 'timeZone', in: 'query', reason: TIME_ZONE_UNENCODED_REASON },
      { method: 'get', path: '/review/done', name: 'timeZone', in: 'response', reason: TIME_ZONE_UNENCODED_REASON },
    ]);
    const done = operation(document, '/review/done', 'get');
    expect((responseSchema(done, '200').properties as Json).week).toEqual({
      type: 'object',
      properties: {
        start: { type: 'string', format: 'date' },
        end: { type: 'string', format: 'date' },
      },
      required: ['start', 'end'],
    });
    expect((responseSchema(done, '200').properties as Json).timeZone).toBeUndefined();
    expect(parameterSchema(operation(document, '/tasks', 'get'), 'limit').schema).toEqual({
      type: 'integer',
      minimum: 1,
      maximum: 1000,
    });
    expect(parameterSchema(operation(document, '/work/due', 'get'), 'owner').schema).toMatchObject({
      enum: ['all', 'me'],
    });
  });
});
