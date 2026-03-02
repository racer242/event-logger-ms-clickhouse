import { registerAs } from '@nestjs/config';

export default registerAs('clickhouse', () => {
  const host = process.env.CLICKHOUSE_HOST || 'localhost';
  const port = process.env.CLICKHOUSE_PORT || '8123';
  
  return {
    url: `http://${host}:${port}`,
    user: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    database: process.env.CLICKHOUSE_DATABASE || 'event_logger',
    maxConnections: parseInt(process.env.CLICKHOUSE_MAX_CONNECTIONS || '10', 10),
    skipHealthCheck: process.env.CLICKHOUSE_SKIP_HEALTH_CHECK === 'true',
  };
});
