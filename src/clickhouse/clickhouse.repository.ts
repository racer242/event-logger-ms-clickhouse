import { Inject, Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ClickHouseClient } from '@clickhouse/client';
import { CLICKHOUSE_CLIENT } from './clickhouse.constants';
import { ConfigService } from '@nestjs/config';

export interface UserEvent {
  event_id: string;
  timestamp: string;
  event_date: string;
  event_month: string;
  user_id: string | null;
  session_id: string | null;
  campaign_id: string;
  subcampaign_id: string | null;
  portal_id: string | null;
  activity_id: string | null;
  event_type: string;
  event_category: string;
  user_cycle_stage: string;
  payload: string;
  result_status: string | null;
  reward_amount: number | null;
  reward_type: string | null;
  device_type: string;
  device_os: string;
  device_browser: string;
  ip_address: string;
  user_agent: string;
  source: string;
  service_name: string;
  instance_id: string;
  received_at: string;
  processed_at: string;
}

export interface CrmEvent {
  event_id: string;
  timestamp: string;
  event_date: string;
  event_month: string;
  user_id: string | null;
  admin_id: string | null;
  moderator_id: string | null;
  campaign_id: string | null;
  subcampaign_id: string | null;
  portal_id: string | null;
  activity_id: string | null;
  prize_id: string | null;
  submission_id: string | null;
  event_type: string;
  event_category: string;
  resource_type: string;
  payload: string;
  action_result: string;
  changes_before: string | null;
  changes_after: string | null;
  ip_address: string;
  user_agent: string;
  source: string;
  service_name: string;
  instance_id: string;
  received_at: string;
  processed_at: string;
}

export interface SystemEvent {
  event_id: string;
  timestamp: string;
  event_date: string;
  event_month: string;
  event_type: string;
  event_category: string;
  severity: string;
  error_code: string | null;
  error_message: string | null;
  stack_trace: string | null;
  service_name: string;
  instance_id: string;
  host_name: string;
  operation_type: string | null;
  resource_type: string | null;
  resource_id: string | null;
  campaign_id: string | null;
  user_id: string | null;
  duration_ms: number | null;
  memory_mb: number | null;
  cpu_percent: number | null;
  payload: string;
  source: string;
  received_at: string;
  processed_at: string;
}

@Injectable()
export class ClickHouseRepository implements OnModuleInit {
  private readonly logger = new Logger(ClickHouseRepository.name);
  private readonly skipHealthCheck: boolean;

  constructor(
    @Inject(CLICKHOUSE_CLIENT)
    private readonly client: ClickHouseClient,
    private readonly configService: ConfigService,
  ) {
    this.skipHealthCheck = this.configService.get<boolean>(
      'clickhouse.skipHealthCheck',
      false,
    );
  }

  async onModuleInit() {
    try {
      await this.initializeTables();
    } catch (error) {
      if (this.skipHealthCheck) {
        this.logger.warn(
          `ClickHouse unavailable, but continuing due to CLICKHOUSE_SKIP_HEALTH_CHECK=true. Error: ${error.message}`,
        );
      } else {
        this.logger.error(
          'ClickHouse unavailable and CLICKHOUSE_SKIP_HEALTH_CHECK=false. Exiting...',
        );
        throw error;
      }
    }
  }

  private async initializeTables() {
    const database = this.configService.get<string>(
      'clickhouse.database',
      'event_logger',
    );

    // Пытаемся создать базу данных если не существует (опционально, может не быть прав)
    try {
      await this.client.exec({
        query: `CREATE DATABASE IF NOT EXISTS ${database}`,
      });
    } catch (error) {
      this.logger.warn(
        `Could not create database "${database}". Assuming it already exists or insufficient privileges.`,
      );
    }

    // Таблица user_events
    await this.client.exec({
      query: `
        CREATE TABLE IF NOT EXISTS ${database}.user_events
        (
            event_id UUID DEFAULT generateUUIDv4(),
            timestamp DateTime64(3, 'UTC') DEFAULT now64(3),
            event_date Date DEFAULT toDate(timestamp),
            event_month String DEFAULT toYYYYMM(timestamp),
            user_id Nullable(UUID),
            session_id Nullable(UUID),
            campaign_id UUID,
            subcampaign_id Nullable(UUID),
            portal_id Nullable(UUID),
            activity_id Nullable(UUID),
            event_type LowCardinality(String),
            event_category LowCardinality(String),
            user_cycle_stage LowCardinality(String),
            payload String,
            result_status Nullable(String),
            reward_amount Nullable(UInt32),
            reward_type Nullable(String),
            device_type LowCardinality(String),
            device_os LowCardinality(String),
            device_browser LowCardinality(String),
            ip_address IPv4,
            user_agent String,
            source LowCardinality(String),
            service_name LowCardinality(String),
            instance_id String,
            received_at DateTime64(3, 'UTC') DEFAULT now64(3),
            processed_at DateTime64(3, 'UTC') DEFAULT now64(3)
        )
        ENGINE = MergeTree()
        PARTITION BY campaign_id
        ORDER BY (campaign_id, event_type, timestamp)
        PRIMARY KEY (campaign_id, event_type, timestamp)
        TTL toDateTime(timestamp) + INTERVAL 3 YEAR
        SETTINGS index_granularity = 8192
      `,
    });

    // Таблица crm_events
    await this.client.exec({
      query: `
        CREATE TABLE IF NOT EXISTS ${database}.crm_events
        (
            event_id UUID DEFAULT generateUUIDv4(),
            timestamp DateTime64(3, 'UTC') DEFAULT now64(3),
            event_date Date DEFAULT toDate(timestamp),
            event_month String DEFAULT toYYYYMM(timestamp),
            user_id Nullable(UUID),
            admin_id Nullable(UUID),
            moderator_id Nullable(UUID),
            campaign_id Nullable(UUID),
            subcampaign_id Nullable(UUID),
            portal_id Nullable(UUID),
            activity_id Nullable(UUID),
            prize_id Nullable(UUID),
            submission_id Nullable(UUID),
            event_type LowCardinality(String),
            event_category LowCardinality(String),
            resource_type LowCardinality(String),
            payload String,
            action_result LowCardinality(String),
            changes_before Nullable(String),
            changes_after Nullable(String),
            ip_address IPv4,
            user_agent String,
            source LowCardinality(String) DEFAULT 'server',
            service_name LowCardinality(String),
            instance_id String,
            received_at DateTime64(3, 'UTC') DEFAULT now64(3),
            processed_at DateTime64(3, 'UTC') DEFAULT now64(3)
        )
        ENGINE = MergeTree()
        PARTITION BY event_month
        ORDER BY (event_category, event_type, timestamp)
        PRIMARY KEY (event_category, event_type, timestamp)
        TTL toDateTime(timestamp) + INTERVAL 3 YEAR
        SETTINGS index_granularity = 8192
      `,
    });

    // Таблица system_events
    await this.client.exec({
      query: `
        CREATE TABLE IF NOT EXISTS ${database}.system_events
        (
            event_id UUID DEFAULT generateUUIDv4(),
            timestamp DateTime64(3, 'UTC') DEFAULT now64(3),
            event_date Date DEFAULT toDate(timestamp),
            event_month String DEFAULT toYYYYMM(timestamp),
            event_type LowCardinality(String),
            event_category LowCardinality(String),
            severity LowCardinality(String),
            error_code Nullable(String),
            error_message Nullable(String),
            stack_trace Nullable(String),
            service_name LowCardinality(String),
            instance_id String,
            host_name String,
            operation_type Nullable(String),
            resource_type Nullable(String),
            resource_id Nullable(UUID),
            campaign_id Nullable(UUID),
            user_id Nullable(UUID),
            duration_ms Nullable(UInt32),
            memory_mb Nullable(UInt32),
            cpu_percent Nullable(Float32),
            payload String,
            source LowCardinality(String) DEFAULT 'server',
            received_at DateTime64(3, 'UTC') DEFAULT now64(3),
            processed_at DateTime64(3, 'UTC') DEFAULT now64(3)
        )
        ENGINE = MergeTree()
        PARTITION BY event_month
        ORDER BY (severity, event_category, timestamp)
        PRIMARY KEY (severity, event_category, timestamp)
        TTL toDateTime(timestamp) + INTERVAL 1 YEAR
        SETTINGS index_granularity = 8192
      `,
    });

    this.logger.log('ClickHouse tables initialized');
  }

  async insertUserEvents(
    events: Omit<
      UserEvent,
      | 'event_id'
      | 'timestamp'
      | 'event_date'
      | 'event_month'
      | 'received_at'
      | 'processed_at'
    >[],
  ): Promise<void> {
    const database = this.configService.get<string>(
      'clickhouse.database',
      'event_logger',
    );
    await this.client.insert({
      table: `${database}.user_events`,
      values: events,
      format: 'JSONEachRow',
    });
  }

  async insertCrmEvents(
    events: Omit<
      CrmEvent,
      | 'event_id'
      | 'timestamp'
      | 'event_date'
      | 'event_month'
      | 'received_at'
      | 'processed_at'
    >[],
  ): Promise<void> {
    const database = this.configService.get<string>(
      'clickhouse.database',
      'event_logger',
    );
    await this.client.insert({
      table: `${database}.crm_events`,
      values: events,
      format: 'JSONEachRow',
    });
  }

  async insertSystemEvents(
    events: Omit<
      SystemEvent,
      | 'event_id'
      | 'timestamp'
      | 'event_date'
      | 'event_month'
      | 'received_at'
      | 'processed_at'
    >[],
  ): Promise<void> {
    const database = this.configService.get<string>(
      'clickhouse.database',
      'event_logger',
    );
    await this.client.insert({
      table: `${database}.system_events`,
      values: events,
      format: 'JSONEachRow',
    });
  }

  async queryEvents<T>(
    table: string,
    filters: Record<string, any>,
    limit: number,
    offset: number,
  ): Promise<T[]> {
    const database = this.configService.get<string>(
      'clickhouse.database',
      'event_logger',
    );
    const conditions: string[] = [];
    const params: Record<string, any> = {};

    if (filters.campaign_id) {
      conditions.push('campaign_id = {campaign_id:UUID}');
      params.campaign_id = filters.campaign_id;
    }

    if (filters.event_type) {
      conditions.push('event_type = {event_type:String}');
      params.event_type = filters.event_type;
    }

    if (filters.user_id) {
      conditions.push('user_id = {user_id:UUID}');
      params.user_id = filters.user_id;
    }

    if (filters.date_from) {
      conditions.push('timestamp >= {date_from:DateTime64(3)}');
      params.date_from = filters.date_from;
    }

    if (filters.date_to) {
      conditions.push('timestamp <= {date_to:DateTime64(3)}');
      params.date_to = filters.date_to;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT * FROM ${database}.${table}
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT {limit:UInt32}
      OFFSET {offset:UInt32}
    `;

    const resultSet = await this.client.query({
      query,
      query_params: { ...params, limit, offset },
      format: 'JSON',
    });

    return (await resultSet.json()) as unknown as T[];
  }

  async countEvents(
    table: string,
    filters: Record<string, any>,
  ): Promise<number> {
    const database = this.configService.get<string>(
      'clickhouse.database',
      'event_logger',
    );
    const conditions: string[] = [];
    const params: Record<string, any> = {};

    if (filters.campaign_id) {
      conditions.push('campaign_id = {campaign_id:UUID}');
      params.campaign_id = filters.campaign_id;
    }

    if (filters.event_type) {
      conditions.push('event_type = {event_type:String}');
      params.event_type = filters.event_type;
    }

    if (filters.user_id) {
      conditions.push('user_id = {user_id:UUID}');
      params.user_id = filters.user_id;
    }

    if (filters.date_from) {
      conditions.push('timestamp >= {date_from:DateTime64(3)}');
      params.date_from = filters.date_from;
    }

    if (filters.date_to) {
      conditions.push('timestamp <= {date_to:DateTime64(3)}');
      params.date_to = filters.date_to;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT count() as count FROM ${database}.${table}
      ${whereClause}
    `;

    const resultSet = await this.client.query({
      query,
      query_params: params,
      format: 'JSON',
    });

    const result = await resultSet.json<{ count: string }>();
    return parseInt(result[0].count, 10);
  }

  async deleteUserEvents(userId: string): Promise<void> {
    const database = this.configService.get<string>(
      'clickhouse.database',
      'event_logger',
    );

    await this.client.exec({
      query: `ALTER TABLE ${database}.user_events DELETE WHERE user_id = {userId:UUID}`,
      query_params: { userId },
    });

    await this.client.exec({
      query: `ALTER TABLE ${database}.crm_events DELETE WHERE user_id = {userId:UUID}`,
      query_params: { userId },
    });
  }

  async getMetrics(): Promise<{
    events_received_last_hour: number;
    queue_depth: number;
    avg_processing_time_ms: number;
  }> {
    const database = this.configService.get<string>(
      'clickhouse.database',
      'event_logger',
    );

    const resultSet = await this.client.query({
      query: `
        SELECT 
          count() as events_received_last_hour,
          avg(toUnixTimestamp64Milli(processed_at) - toUnixTimestamp64Milli(received_at)) as avg_processing_time_ms
        FROM ${database}.user_events
        WHERE timestamp >= now() - INTERVAL 1 HOUR
      `,
      format: 'JSON',
    });

    const result = await resultSet.json<{
      events_received_last_hour: string;
      avg_processing_time_ms: string;
    }>();

    return {
      events_received_last_hour: parseInt(
        result[0]?.events_received_last_hour || '0',
        10,
      ),
      queue_depth: 0, // Queue depth would be tracked separately
      avg_processing_time_ms: parseFloat(
        result[0]?.avg_processing_time_ms || '0',
      ),
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }
}
