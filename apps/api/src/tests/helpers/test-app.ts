import { createApp } from '../../app.js';
import { createCaptureService } from '../../captures/domain/capture-service.js';
import { createSqliteCaptureStore } from '../../captures/infrastructure/sqlite-capture-store.js';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';

export const createTestApp = async () => {
  const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'), {
    autoAdvanceMs: 1000, // Advance 1 second on each call for ordering tests
  });
  const idGenerator = createFakeIdGenerator();
  const captureStore = createSqliteCaptureStore({ location: ':memory:' });

  const captureService = createCaptureService({
    store: captureStore,
    clock,
    idGenerator,
  });

  const app = await createApp({ captureService });

  return app;
};
