import { loadConfig } from './config/config.js';
import { bootstrapApp } from './composition-root.js';

const main = async () => {
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
