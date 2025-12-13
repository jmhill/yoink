import { loadConfig } from './config/config.js';
import { createAppFromConfig } from './composition-root.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const main = async () => {
  const config = loadConfig();

  // Ensure database directory exists (only for file-based databases)
  if (config.database.type === 'sqlite') {
    mkdirSync(dirname(config.database.path), { recursive: true });
  }

  const app = await createAppFromConfig({ config });

  try {
    const { port, host } = config.server;
    await app.listen({ port, host });
    console.log(`Server running at http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

main();
