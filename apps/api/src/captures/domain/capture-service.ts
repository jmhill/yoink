import type { Capture } from '@yoink/api-contracts';
import type { Clock, IdGenerator } from '@yoink/infrastructure';
import type { CaptureStore } from './capture-store.js';

export type CaptureServiceDependencies = {
  store: CaptureStore;
  clock: Clock;
  idGenerator: IdGenerator;
};

export type CreateCaptureInput = {
  content: string;
  title?: string;
  sourceUrl?: string;
  sourceApp?: string;
  organizationId: string;
  createdById: string;
};

export type ListCapturesInput = {
  organizationId: string;
  status?: 'inbox' | 'archived';
  limit?: number;
  cursor?: string;
};

export type ListCapturesResult = {
  captures: Capture[];
  nextCursor?: string;
};

export type CaptureService = {
  create: (input: CreateCaptureInput) => Promise<Capture>;
  list: (input: ListCapturesInput) => Promise<ListCapturesResult>;
};

export const createCaptureService = (
  deps: CaptureServiceDependencies
): CaptureService => {
  const { store, clock, idGenerator } = deps;

  return {
    create: async (input: CreateCaptureInput): Promise<Capture> => {
      const capture: Capture = {
        id: idGenerator.generate(),
        organizationId: input.organizationId,
        createdById: input.createdById,
        content: input.content,
        title: input.title,
        sourceUrl: input.sourceUrl,
        sourceApp: input.sourceApp,
        status: 'inbox',
        capturedAt: clock.now().toISOString(),
      };

      await store.save(capture);

      return capture;
    },

    list: async (input: ListCapturesInput): Promise<ListCapturesResult> => {
      return store.findByOrganization({
        organizationId: input.organizationId,
        status: input.status,
        limit: input.limit,
        cursor: input.cursor,
      });
    },
  };
};
