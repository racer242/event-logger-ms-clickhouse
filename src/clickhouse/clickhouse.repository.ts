import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { ClickHouseClient } from '@clickhouse/client';
import { CLICKHOUSE_CLIENT } from './clickhouse.constants';
import { ConfigService } from '@nestjs/config';

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
            -- ПОСТОЯННЫЕ ДАННЫЕ (обязательные)
            event_id        UUID                    DEFAULT generateUUIDv4(),
            client_id       LowCardinality(String)  NOT NULL DEFAULT 'unknown',
            campaign_id     LowCardinality(String)  NOT NULL DEFAULT 'unknown',
            subcampaign_id  LowCardinality(String)  NOT NULL DEFAULT 'main',
            timestamp       DateTime64(3, 'UTC')    NOT NULL,
            portal_id       LowCardinality(String)  NOT NULL DEFAULT 'unknown',
            bot_id          LowCardinality(String)  NOT NULL DEFAULT 'unknown',
            session_id      String                  NOT NULL,

            -- ОПЦИОНАЛЬНЫЕ ДАННЫЕ
            user_id         Nullable(UUID),
            user_utm        Nullable(String),
            crm_user_id     Nullable(UUID),
            receipt_id      Nullable(UUID),
            code            Nullable(String),
            activity_id     Nullable(UUID),
            prize_id        Nullable(UUID),
            message_id      Nullable(UUID),

            -- КЛАССИФИКАЦИЯ СОБЫТИЯ
            event_type      LowCardinality(String)  NOT NULL,
            source          LowCardinality(String)  NOT NULL DEFAULT 'unknown',
            criticality     LowCardinality(String)  NOT NULL DEFAULT 'low',

            -- СПЕЦИФИЧЕСКИЕ ДАННЫЕ (payload в JSON)
            payload         Object('json')          DEFAULT '{}',

            -- СЛУЖЕБНЫЕ ПОЛЯ ДЛЯ ПАРТИЦИОНИРОВАНИЯ
            event_date      Date                    DEFAULT toDate(timestamp),
            event_month     String                  DEFAULT toYYYYMM(timestamp),
            event_hour      UInt8                   DEFAULT toHour(timestamp)
        )
        ENGINE = MergeTree()
        PARTITION BY event_month
        ORDER BY (campaign_id, event_type, timestamp, event_id)
        PRIMARY KEY (campaign_id, event_type, timestamp)
        TTL toDateTime(timestamp) + INTERVAL 3 YEAR
        SETTINGS
            index_granularity = 8192,
            max_parts_in_total = 100000,
            max_merge_selecting_sleep_ms = 5000,
            allow_experimental_object_type = 1
      `,
    });

    // Добавляем индексы для user_events
    await this.client.exec({
      query: `
        ALTER TABLE ${database}.user_events
        ADD INDEX IF NOT EXISTS idx_user_id user_id TYPE bloom_filter GRANULARITY 4
      `,
    });

    await this.client.exec({
      query: `
        ALTER TABLE ${database}.user_events
        ADD INDEX IF NOT EXISTS idx_session_id session_id TYPE bloom_filter GRANULARITY 4
      `,
    });

    await this.client.exec({
      query: `
        ALTER TABLE ${database}.user_events
        ADD INDEX IF NOT EXISTS idx_activity_id activity_id TYPE bloom_filter GRANULARITY 4
      `,
    });

    await this.client.exec({
      query: `
        ALTER TABLE ${database}.user_events
        ADD INDEX IF NOT EXISTS idx_prize_id prize_id TYPE bloom_filter GRANULARITY 4
      `,
    });

    await this.client.exec({
      query: `
        ALTER TABLE ${database}.user_events
        ADD INDEX IF NOT EXISTS idx_receipt_id receipt_id TYPE bloom_filter GRANULARITY 4
      `,
    });

    await this.client.exec({
      query: `
        ALTER TABLE ${database}.user_events
        ADD INDEX IF NOT EXISTS idx_message_id message_id TYPE bloom_filter GRANULARITY 4
      `,
    });

    await this.client.exec({
      query: `
        ALTER TABLE ${database}.user_events
        ADD INDEX IF NOT EXISTS idx_timestamp_minmax timestamp TYPE minmax GRANULARITY 1
      `,
    });

    // Таблица crm_events
    await this.client.exec({
      query: `
        CREATE TABLE IF NOT EXISTS ${database}.crm_events
        (
            -- ПОСТОЯННЫЕ ДАННЫЕ
            event_id        UUID                    DEFAULT generateUUIDv4(),
            client_id       LowCardinality(String)  NOT NULL DEFAULT 'unknown',
            campaign_id     LowCardinality(String)  NOT NULL DEFAULT 'unknown',
            subcampaign_id  LowCardinality(String)  NOT NULL DEFAULT 'main',
            timestamp       DateTime64(3, 'UTC')    NOT NULL,
            session_id      String                  NOT NULL,
            crm_user_id     UUID                    NOT NULL,
            entity_type     LowCardinality(String)  NOT NULL,
            entity_id       String                  NOT NULL,
            action_type     LowCardinality(String)  NOT NULL DEFAULT 'default',

            -- КЛАССИФИКАЦИЯ СОБЫТИЯ
            event_type      LowCardinality(String)  NOT NULL,
            source          LowCardinality(String)  NOT NULL DEFAULT 'unknown',
            criticality     LowCardinality(String)  NOT NULL DEFAULT 'low',

            -- СПЕЦИФИЧЕСКИЕ ДАННЫЕ (payload в JSON)
            payload         Object('json')          DEFAULT '{}',

            -- СЛУЖЕБНЫЕ ПОЛЯ
            event_date      Date                    DEFAULT toDate(timestamp),
            event_month     String                  DEFAULT toYYYYMM(timestamp),
            event_hour      UInt8                   DEFAULT toHour(timestamp)
        )
        ENGINE = MergeTree()
        PARTITION BY event_month
        ORDER BY (event_type, timestamp, event_id)
        PRIMARY KEY (event_type, timestamp)
        TTL toDateTime(timestamp) + INTERVAL 3 YEAR
        SETTINGS
            index_granularity = 8192,
            allow_experimental_object_type = 1
      `,
    });

    // Добавляем индексы для crm_events
    await this.client.exec({
      query: `
        ALTER TABLE ${database}.crm_events
        ADD INDEX IF NOT EXISTS idx_crm_user crm_user_id TYPE bloom_filter GRANULARITY 4
      `,
    });

    await this.client.exec({
      query: `
        ALTER TABLE ${database}.crm_events
        ADD INDEX IF NOT EXISTS idx_entity_type entity_type TYPE bloom_filter GRANULARITY 4
      `,
    });

    await this.client.exec({
      query: `
        ALTER TABLE ${database}.crm_events
        ADD INDEX IF NOT EXISTS idx_entity_id entity_id TYPE bloom_filter GRANULARITY 4
      `,
    });

    await this.client.exec({
      query: `
        ALTER TABLE ${database}.crm_events
        ADD INDEX IF NOT EXISTS idx_campaign campaign_id TYPE bloom_filter GRANULARITY 4
      `,
    });

    await this.client.exec({
      query: `
        ALTER TABLE ${database}.crm_events
        ADD INDEX IF NOT EXISTS idx_session_id session_id TYPE bloom_filter GRANULARITY 4
      `,
    });

    await this.client.exec({
      query: `
        ALTER TABLE ${database}.crm_events
        ADD INDEX IF NOT EXISTS idx_action_id action_type TYPE bloom_filter GRANULARITY 4
      `,
    });

    // Таблица system_events
    await this.client.exec({
      query: `
        CREATE TABLE IF NOT EXISTS ${database}.system_events
        (
            -- ПОСТОЯННЫЕ ДАННЫЕ
            event_id        UUID                    DEFAULT generateUUIDv4(),
            client_id       LowCardinality(String)  NOT NULL DEFAULT 'unknown',
            campaign_id     LowCardinality(String)  NOT NULL DEFAULT 'unknown',
            subcampaign_id  LowCardinality(String)  NOT NULL DEFAULT 'main',
            timestamp       DateTime64(3, 'UTC')    NOT NULL,
            instance_id     LowCardinality(String)  NOT NULL DEFAULT 'unknown',
            host_name       Nullable(String),
            error_code      LowCardinality(String)  NOT NULL DEFAULT 'none',

            -- КЛАССИФИКАЦИЯ СОБЫТИЯ
            event_type      LowCardinality(String)  NOT NULL,
            source          LowCardinality(String)  NOT NULL DEFAULT 'unknown',
            criticality     LowCardinality(String)  NOT NULL DEFAULT 'low',
            severity        LowCardinality(String)  NOT NULL DEFAULT 'unknown',

            -- СПЕЦИФИЧЕСКИЕ ДАННЫЕ (payload в JSON)
            payload         Object('json')          DEFAULT '{}',

            -- СЛУЖЕБНЫЕ ПОЛЯ
            event_date      Date                    DEFAULT toDate(timestamp),
            event_month     String                  DEFAULT toYYYYMM(timestamp),
            event_hour      UInt8                   DEFAULT toHour(timestamp)
        )
        ENGINE = MergeTree()
        PARTITION BY event_month
        ORDER BY (severity, event_type, timestamp, event_id)
        PRIMARY KEY (severity, event_type, timestamp)
        TTL toDateTime(timestamp) + INTERVAL 1 YEAR
        SETTINGS
            index_granularity = 8192,
            allow_experimental_object_type = 1
      `,
    });

    // Добавляем индексы для system_events
    await this.client.exec({
      query: `
        ALTER TABLE ${database}.system_events
        ADD INDEX IF NOT EXISTS idx_instance instance_id TYPE bloom_filter GRANULARITY 4
      `,
    });

    await this.client.exec({
      query: `
        ALTER TABLE ${database}.system_events
        ADD INDEX IF NOT EXISTS idx_severity severity TYPE bloom_filter GRANULARITY 4
      `,
    });

    await this.client.exec({
      query: `
        ALTER TABLE ${database}.system_events
        ADD INDEX IF NOT EXISTS idx_error_code error_code TYPE bloom_filter GRANULARITY 4
      `,
    });

    await this.client.exec({
      query: `
        ALTER TABLE ${database}.system_events
        ADD INDEX IF NOT EXISTS idx_campaign campaign_id TYPE bloom_filter GRANULARITY 4
      `,
    });

    this.logger.log('ClickHouse tables initialized');
  }

  async insertUserEvents(
    events: Array<{
      client_id: string;
      campaign_id: string;
      subcampaign_id: string;
      timestamp: string;
      portal_id: string;
      bot_id: string;
      session_id: string;
      user_id: string | null;
      user_utm: string | null;
      crm_user_id: string | null;
      receipt_id: string | null;
      code: string | null;
      activity_id: string | null;
      prize_id: string | null;
      message_id: string | null;
      event_type: string;
      source: string;
      criticality: string;
      payload: Record<string, any>;
    }>,
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
    events: Array<{
      client_id: string;
      campaign_id: string;
      subcampaign_id: string;
      timestamp: string;
      session_id: string;
      crm_user_id: string;
      entity_type: string;
      entity_id: string;
      action_type: string;
      event_type: string;
      source: string;
      criticality: string;
      payload: Record<string, any>;
    }>,
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
    events: Array<{
      client_id: string;
      campaign_id: string;
      subcampaign_id: string;
      timestamp: string;
      instance_id: string;
      host_name: string | null;
      error_code: string;
      event_type: string;
      source: string;
      criticality: string;
      severity: string;
      payload: Record<string, any>;
    }>,
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
      query: `ALTER TABLE ${database}.crm_events DELETE WHERE crm_user_id = {userId:UUID}`,
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
          count() as events_received_last_hour
        FROM ${database}.user_events
        WHERE timestamp >= now() - INTERVAL 1 HOUR
      `,
      format: 'JSON',
    });

    const result = await resultSet.json<{
      events_received_last_hour: string;
    }>();

    return {
      events_received_last_hour: parseInt(
        result[0]?.events_received_last_hour || '0',
        10,
      ),
      queue_depth: 0, // Queue depth would be tracked separately
      avg_processing_time_ms: 0, // Processing time tracking requires additional instrumentation
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
