export type Config = {
  port: number;
  host: string;
  dbPath: string;
  seedToken?: string;
};

export const loadConfig = (): Config => {
  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    host: process.env.HOST ?? '0.0.0.0',
    dbPath: process.env.DB_PATH ?? './data/captures.db',
    seedToken: process.env.SEED_TOKEN,
  };
};
