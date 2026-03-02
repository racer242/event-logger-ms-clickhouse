import { registerAs } from '@nestjs/config';

export default registerAs('buffer', () => ({
  maxSize: parseInt(process.env.BUFFER_MAX_SIZE || '1000', 10),
  flushIntervalMs: parseInt(process.env.BUFFER_FLUSH_INTERVAL_MS || '5000', 10),
}));
