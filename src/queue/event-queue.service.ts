import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { CreateEventDto } from '../events/dto/create-event.dto';
import { ClickHouseRepository } from '../clickhouse/clickhouse.repository';
import { SqliteQueueRepository } from './sqlite-queue.repository';
import { RedisQueueRepository } from './redis-queue.repository';

@Injectable()
export class EventQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventQueueService.name);
  private readonly queueType: string;
  private readonly flushIntervalMs: number;
  private readonly batchSize: number;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly sqliteRepo: SqliteQueueRepository,
    private readonly redisRepo: RedisQueueRepository,
    private readonly clickHouseRepo: ClickHouseRepository,
  ) {
    this.queueType = this.configService.get<string>('queue.type', 'sqlite');
    this.flushIntervalMs = this.configService.get<number>(
      'queue.flushIntervalMs',
      5000,
    );
    this.batchSize = this.configService.get<number>('queue.batchSize', 100);
  }

  async onModuleInit() {
    if (this.queueType === 'memory') {
      this.logger.log('Memory queue mode - events processed immediately');
      return;
    }

    if (this.queueType !== 'memory') {
      this.startFlushTimer();
    }
    this.logger.log(`Event queue service initialized (${this.queueType})`);
  }

  onModuleDestroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
  }

  private startFlushTimer() {
    this.logger.log(
      `Starting flush timer with interval ${this.flushIntervalMs}ms`,
    );
    this.flushTimer = setInterval(() => {
      this.flushBuffer().catch((err) => {
        this.logger.error(`Flush error: ${err.message}`, err.stack);
      });
    }, this.flushIntervalMs);
  }

  async enqueue(
    event: CreateEventDto,
  ): Promise<{ eventId: string; table: string }> {
    const eventId = uuidv4();
    const table = this.determineTable(event);

    if (this.queueType === 'redis') {
      await this.redisRepo.enqueue(eventId, JSON.stringify(event), table);
    } else {
      // sqlite по умолчанию
      this.sqliteRepo.insert(eventId, JSON.stringify(event), table);
    }

    // Если memory - отправляем сразу в ClickHouse
    if (this.queueType === 'memory') {
      this.logger.log(`Memory mode: sending event to ${table}`);
      try {
        await this.insertToClickHouse(table, [event]);
        this.logger.log(`Memory mode: event sent to ${table}`);
      } catch (error) {
        this.logger.error(
          `Memory mode: failed to send event: ${error.message}`,
        );
      }
    }

    return { eventId, table };
  }

  async enqueueBatch(
    events: CreateEventDto[],
  ): Promise<{ count: number; tables: Record<string, number> }> {
    const tables: Record<string, number> = {};

    const batchData = events.map((event) => {
      const table = this.determineTable(event);
      tables[table] = (tables[table] || 0) + 1;
      return {
        eventId: uuidv4(),
        eventData: JSON.stringify(event),
        tableName: table,
      };
    });

    if (this.queueType === 'redis') {
      await this.redisRepo.enqueueBatch(batchData);
    } else {
      this.sqliteRepo.insertBatch(batchData);
    }

    // Если memory - отправляем сразу в ClickHouse
    if (this.queueType === 'memory') {
      this.logger.log(`Memory mode: sending batch to ClickHouse`);
      try {
        const eventsByTable = this.groupEventsByTable(events);
        for (const [table, tableEvents] of Object.entries(eventsByTable)) {
          this.logger.log(
            `Memory mode: sending ${tableEvents.length} events to ${table}`,
          );
          await this.insertToClickHouse(table, tableEvents);
        }
        this.logger.log(`Memory mode: batch sent successfully`);
      } catch (error) {
        this.logger.error(
          `Memory mode: failed to send batch: ${error.message}`,
        );
      }
    }

    return { count: events.length, tables };
  }

  async flushBuffer() {
    if (this.queueType === 'redis') {
      await this.flushRedisBuffer();
    } else {
      await this.flushSqliteBuffer();
    }
  }

  private async flushRedisBuffer() {
    const rows = await this.redisRepo.getPendingEvents(this.batchSize);

    if (rows.length === 0) {
      return;
    }

    this.logger.log(`Processing ${rows.length} events from Redis queue`);

    const eventIds = rows.map((e) => e.id);

    try {
      // Группируем по таблицам
      const eventsByTable = rows.reduce(
        (acc, event) => {
          acc[event.table_name] = acc[event.table_name] || [];
          acc[event.table_name].push(JSON.parse(event.event_data));
          return acc;
        },
        {} as Record<string, any[]>,
      );

      // Отправляем в ClickHouse
      for (const [table, tableEvents] of Object.entries(eventsByTable)) {
        await this.insertToClickHouse(table, tableEvents);
      }

      // Помечаем как completed
      await this.redisRepo.markAsCompleted(eventIds);

      this.logger.log(`Successfully processed ${rows.length} events`);
    } catch (error) {
      this.logger.error(`Failed to process events: ${error.message}`);

      // Возвращаем статус pending для повторной попытки
      await this.redisRepo.revertToPending(eventIds);

      throw error;
    }
  }

  private async flushSqliteBuffer() {
    const rows = this.sqliteRepo.getPendingEvents(this.batchSize);

    if (rows.length === 0) {
      return;
    }

    this.logger.log(`Processing ${rows.length} events from SQLite queue`);

    const eventIds = rows.map((e) => e.event_id);

    try {
      // Помечаем как processing
      this.sqliteRepo.markAsProcessing(eventIds);

      // Группируем по таблицам
      const eventsByTable = rows.reduce(
        (acc, event) => {
          acc[event.table_name] = acc[event.table_name] || [];
          acc[event.table_name].push(JSON.parse(event.event_data));
          return acc;
        },
        {} as Record<string, any[]>,
      );

      // Отправляем в ClickHouse
      for (const [table, tableEvents] of Object.entries(eventsByTable)) {
        await this.insertToClickHouse(table, tableEvents);
      }

      // Помечаем как completed
      this.sqliteRepo.markAsCompleted(eventIds);

      this.logger.log(`Successfully processed ${rows.length} events`);

      // Очищаем completed события
      const deletedCount = this.sqliteRepo.deleteCompleted();
      if (deletedCount > 0) {
        this.logger.debug(
          `Cleared ${deletedCount} completed events from queue`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to process events: ${error.message}`);

      // Возвращаем статус pending для повторной попытки
      this.sqliteRepo.revertToPending(eventIds);

      throw error;
    }
  }

  private groupEventsByTable(events: CreateEventDto[]): Record<string, any[]> {
    return events.reduce(
      (acc, event) => {
        const table = this.determineTable(event);
        acc[table] = acc[table] || [];
        acc[table].push(event);
        return acc;
      },
      {} as Record<string, any[]>,
    );
  }

  private async insertToClickHouse(table: string, events: any[]) {
    switch (table) {
      case 'user_events':
        await this.clickHouseRepo.insertUserEvents(
          events.map((e) => ({
            client_id: e.client_id,
            campaign_id: e.campaign_id,
            subcampaign_id: e.subcampaign_id || 'unknown',
            timestamp: e.timestamp
              ? new Date(e.timestamp)
                  .toISOString()
                  .replace('T', ' ')
                  .replace('Z', '')
              : new Date().toISOString().replace('T', ' ').replace('Z', ''),
            portal_id: e.portal_id || 'unknown',
            bot_id: e.bot_id || 'unknown',
            session_id: e.session_id,
            user_id: e.user_id || null,
            user_utm: e.user_utm || null,
            crm_user_id: e.crm_user_id || null,
            receipt_id: e.receipt_id || null,
            code: e.code || null,
            activity_id: e.activity_id || null,
            activity_type: e.activity_type || null,
            prize_id: e.prize_id || null,
            message_id: e.message_id || null,
            event_type: e.event_type,
            source: e.source || 'unknown',
            criticality: e.criticality || 'low',
            payload: e.payload || {},
          })),
        );
        break;

      case 'crm_events':
        await this.clickHouseRepo.insertCrmEvents(
          events.map((e) => ({
            client_id: e.client_id,
            campaign_id: e.campaign_id,
            subcampaign_id: e.subcampaign_id || 'main',
            timestamp: e.timestamp
              ? new Date(e.timestamp)
                  .toISOString()
                  .replace('T', ' ')
                  .replace('Z', '')
              : new Date().toISOString().replace('T', ' ').replace('Z', ''),
            session_id: e.session_id,
            crm_user_id: e.crm_user_id || null,
            entity_type: e.entity_type,
            entity_id: e.entity_id,
            action_type: e.action_type || 'default',
            event_type: e.event_type,
            source: e.source || 'unknown',
            criticality: e.criticality || 'low',
            payload: e.payload || {},
          })),
        );
        break;

      case 'system_events':
        await this.clickHouseRepo.insertSystemEvents(
          events.map((e) => ({
            client_id: e.client_id,
            campaign_id: e.campaign_id,
            subcampaign_id: e.subcampaign_id || 'unknown',
            timestamp: e.timestamp
              ? new Date(e.timestamp)
                  .toISOString()
                  .replace('T', ' ')
                  .replace('Z', '')
              : new Date().toISOString().replace('T', ' ').replace('Z', ''),
            instance_id: e.instance_id || 'unknown',
            host_name: e.host_name || null,
            error_code: e.error_code || 'none',
            event_type: e.event_type,
            source: e.source || 'unknown',
            criticality: e.criticality || 'low',
            severity: e.severity || 'unknown',
            payload: e.payload || {},
          })),
        );
        break;
    }
  }

  private determineTable(
    event: CreateEventDto,
  ): 'user_events' | 'crm_events' | 'system_events' {
    if (event.severity || event.event_type.startsWith('system.')) {
      return 'system_events';
    }
    if (event.entity_type || event.crm_user_id) {
      return 'crm_events';
    }
    return 'user_events';
  }

  getQueueDepth(): {
    user_events: number;
    crm_events: number;
    system_events: number;
    total: number;
  } {
    return this.sqliteRepo.getPendingCount();
  }
}
