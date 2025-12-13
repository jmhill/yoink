import type { ResultAsync } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type { Clock, IdGenerator } from '@yoink/infrastructure';
import type { CaptureStore, FindByOrganizationResult } from './capture-store.js';
import type { CreateCaptureCommand, ListCapturesQuery } from './capture-commands.js';
import type { CreateCaptureError, ListCapturesError } from './capture-errors.js';

export type CaptureServiceDependencies = {
  store: CaptureStore;
  clock: Clock;
  idGenerator: IdGenerator;
};

export type ListCapturesResult = FindByOrganizationResult;

export type CaptureService = {
  create: (command: CreateCaptureCommand) => ResultAsync<Capture, CreateCaptureError>;
  list: (query: ListCapturesQuery) => ResultAsync<ListCapturesResult, ListCapturesError>;
};

export const createCaptureService = (
  deps: CaptureServiceDependencies
): CaptureService => {
  const { store, clock, idGenerator } = deps;

  return {
    create: (command: CreateCaptureCommand): ResultAsync<Capture, CreateCaptureError> => {
      const capture: Capture = {
        id: idGenerator.generate(),
        organizationId: command.organizationId,
        createdById: command.createdById,
        content: command.content,
        title: command.title,
        sourceUrl: command.sourceUrl,
        sourceApp: command.sourceApp,
        status: 'inbox',
        capturedAt: clock.now().toISOString(),
      };

      return store.save(capture).map(() => capture);
    },

    list: (query: ListCapturesQuery): ResultAsync<ListCapturesResult, ListCapturesError> => {
      return store.findByOrganization({
        organizationId: query.organizationId,
        status: query.status,
        limit: query.limit,
        cursor: query.cursor,
      });
    },
  };
};
