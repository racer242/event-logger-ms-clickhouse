import { createClient, ClickHouseClient } from '@clickhouse/client';

export type ClickHouseClientType = ClickHouseClient;

export interface ClickHouseConfig {
  url: string;
  user: string;
  password: string;
  database: string;
  maxConnections: number;
}

export function createClickHouseClient(config: ClickHouseConfig): ClickHouseClientType {
  return createClient({
    url: config.url,
    username: config.user,
    password: config.password,
    database: config.database,
    clickhouse_settings: {
      async_insert: 1,
      wait_for_async_insert: 0,
    },
  });
}
