import { loadConfig } from './platform/config/config.js';
import { assertTestFixturesAllowed } from './platform/config/test-fixtures-guard.js';
import { bootstrapApp } from './composition-root.js';

const main = async () => {
  try {
    assertTestFixturesAllowed(process.env);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  }

  const config = await loadConfig();
  const app = await bootstrapApp({ config });

  try {
    const { port, host } = config.server;
    await app.listen({ port, host });
    app.log.info({ port, host }, 'Server started');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

main();
