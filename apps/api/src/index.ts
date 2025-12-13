import { createApp } from './app.js';
import { loadConfig } from './config/config.js';
import { createCaptureService } from './captures/domain/capture-service.js';
import { createSqliteCaptureStore } from './captures/infrastructure/sqlite-capture-store.js';
import { createSystemClock, createUuidGenerator } from '@yoink/infrastructure';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const main = async () => {
  const config = loadConfig();

  // Ensure database directory exists
  mkdirSync(dirname(config.dbPath), { recursive: true });

  const captureStore = createSqliteCaptureStore({ location: config.dbPath });
  const captureService = createCaptureService({
    store: captureStore,
    clock: createSystemClock(),
    idGenerator: createUuidGenerator(),
  });

  const app = await createApp({ captureService });

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`Server running at http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

main();
