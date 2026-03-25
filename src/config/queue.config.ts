import { registerAs } from '@nestjs/config';

export default registerAs('queue', () => ({
  type: process.env.QUEUE_TYPE || 'sqlite',
  sqlite: {
    enabled: process.env.QUEUE_TYPE === 'sqlite',
    dbPath: process.env.SQLITE_DB_PATH || 'data/events.db',
  },
  flushIntervalMs: parseInt(process.env.QUEUE_FLUSH_INTERVAL_MS || '5000', 10),
  batchSize: parseInt(process.env.QUEUE_BATCH_SIZE || '100', 10),
}));
