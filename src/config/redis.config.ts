import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  enabled: process.env.QUEUE_TYPE === 'redis',
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || '',
  queuePrefix: process.env.QUEUE_PREFIX || 'event_logger',
  skipHealthCheck: process.env.REDIS_SKIP_HEALTH_CHECK === 'true',
}));
