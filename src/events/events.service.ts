import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClickHouseRepository } from '../clickhouse/clickhouse.repository';
import { EventQueueService } from '../queue/event-queue.service';
import { RedisQueueRepository } from '../queue/redis-queue.repository';
import { CreateEventDto } from '../events/dto/create-event.dto';
import { QueryEventsDto } from '../events/dto/query-events.dto';
import {
  EventResponse,
  BatchResponse,
  QueryResponse,
} from '../events/dto/responses.dto';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private readonly queueType: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventQueue: EventQueueService,
    private readonly clickHouseRepo: ClickHouseRepository,
    private readonly redisRepo: RedisQueueRepository,
  ) {
    this.queueType = this.configService.get<string>('queue.type', 'sqlite');
  }

  async createEvent(event: CreateEventDto): Promise<EventResponse> {
    this.logger.debug(`Processing event: ${event.event_type}`);
    const { eventId, table } = await this.eventQueue.enqueue(event);

    return {
      event_id: eventId,
      status: 'queued',
      table,
    };
  }

  async createBatchEvents(events: CreateEventDto[]): Promise<BatchResponse> {
    this.logger.debug(`Processing batch of ${events.length} events`);
    const result = await this.eventQueue.enqueueBatch(events);

    return {
      count: result.count,
      status: 'queued',
      tables: result.tables,
    };
  }

  async queryEvents(query: QueryEventsDto): Promise<QueryResponse> {
    this.logger.debug(
      `Querying events from ${query.table} with filters: ${JSON.stringify(query)}`,
    );

    const filters: Record<string, any> = {};
    if (query.campaign_id) filters.campaign_id = query.campaign_id;
    if (query.event_type) filters.event_type = query.event_type;
    if (query.user_id) filters.user_id = query.user_id;
    if (query.date_from) filters.date_from = query.date_from;
    if (query.date_to) filters.date_to = query.date_to;

    const [events, totalCount] = await Promise.all([
      this.clickHouseRepo.queryEvents(
        query.table,
        filters,
        query.limit || 100,
        query.offset || 0,
      ),
      this.clickHouseRepo.countEvents(query.table, filters),
    ]);

    const hasMore = totalCount > (query.offset || 0) + (query.limit || 100);

    return {
      events,
      total_count: totalCount,
      has_more: hasMore,
    };
  }

  async deleteUserEvents(userId: string): Promise<void> {
    this.logger.log(`Deleting events for user: ${userId}`);
    await this.clickHouseRepo.deleteUserEvents(userId);
  }

  async getHealthStatus() {
    const clickhouseHealthy = await this.clickHouseRepo.healthCheck();
    const metrics = await this.clickHouseRepo.getMetrics();
    const queueDepth = this.eventQueue.getQueueDepth();

    const health: any = {
      status: clickhouseHealthy ? 'healthy' : 'unhealthy',
      checks: {
        clickhouse: clickhouseHealthy ? 'ok' : 'error',
        queue: 'ok',
        cache: 'ok',
      },
      metrics: {
        events_received_last_hour: metrics.events_received_last_hour,
        queue_depth:
          queueDepth.user_events +
          queueDepth.crm_events +
          queueDepth.system_events,
        avg_processing_time_ms: metrics.avg_processing_time_ms,
      },
    };

    // Добавляем проверку Redis если включён
    if (this.queueType === 'redis') {
      const redisHealthy = await this.redisRepo.healthCheck();
      health.checks.redis = redisHealthy ? 'ok' : 'error';
      if (!redisHealthy) {
        health.status = 'degraded';
      }
    }

    return health;
  }
}
