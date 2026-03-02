import { registerAs } from '@nestjs/config';

export default registerAs('security', () => ({
  apiKeyHeader: process.env.API_KEY_HEADER || 'X-API-Key',
  apiKeys: (process.env.API_KEYS || '').split(',').filter(Boolean),
}));
