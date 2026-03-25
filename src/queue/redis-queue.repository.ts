import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface QueuedEvent {
  id: string;
  event_data: string;
  table_name: string;
  created_at: number;
}

@Injectable()
export class RedisQueueRepository implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisQueueRepository.name);
  private redisClient: Redis | null = null;
  private readonly queueKey: string;
  private readonly processingKey: string;
  private readonly isEnabled: boolean;
  private readonly skipHealthCheck: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isEnabled = this.configService.get<string>('queue.type', 'sqlite') === 'redis';
    this.skipHealthCheck = this.configService.get<boolean>('redis.skipHealthCheck', false);
    const queuePrefix = this.configService.get<string>('redis.queuePrefix', 'event_logger');
    this.queueKey = `${queuePrefix}:queue`;
    this.processingKey = `${queuePrefix}:processing`;
  }

  async onModuleInit() {
    if (!this.isEnabled) {
      return;
    }

    try {
      const redisHost = this.configService.get<string>('redis.host', 'localhost');
      const redisPort = this.configService.get<number>('redis.port', 6379);
      const redisPassword = this.configService.get<string>('redis.password', '');

      this.redisClient = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword || undefined,
        retryStrategy: (times) => Math.min(times * 100, 3000),
        maxRetriesPerRequest: 3,
      });

      this.redisClient.on('connect', () => {
        this.logger.log('Redis connected');
      });

      this.redisClient.on('error', (err) => {
        this.logger.error(`Redis error: ${err.message}`);
      });

      // Восстановление "хвоста" после сбоя
      await this.recoverPendingEvents();
    } catch (error) {
      if (this.skipHealthCheck) {
        this.logger.warn(`Redis unavailable: ${error.message}`);
        this.redisClient = null;
      } else {
        throw error;
      }
    }
  }

  onModuleDestroy() {
    if (this.redisClient) {
      this.redisClient.quit();
    }
  }

  private async recoverPendingEvents() {
    if (!this.redisClient) return;

    try {
      const pending = await this.redisClient.lrange(this.queueKey, 0, -1);

      if (pending.length > 0) {
        this.logger.log(`Recovering ${pending.length} pending events from Redis...`);
      }
    } catch (error) {
      this.logger.error(`Recovery failed: ${error.message}`);
    }
  }

  async enqueue(eventId: string, eventData: string, tableName: string): Promise<void> {
    if (!this.redisClient) return;

    const queuedEvent = {
      id: eventId,
      event_data: eventData,
      table_name: tableName,
      created_at: Date.now(),
    };

    await this.redisClient.lpush(this.queueKey, JSON.stringify(queuedEvent));
  }

  async enqueueBatch(events: Array<{ eventId: string; eventData: string; tableName: string }>): Promise<void> {
    if (!this.redisClient) return;

    const pipeline = this.redisClient.pipeline();
    for (const event of events) {
      const queuedEvent = {
        id: event.eventId,
        event_data: event.eventData,
        table_name: event.tableName,
        created_at: Date.now(),
      };
      pipeline.lpush(this.queueKey, JSON.stringify(queuedEvent));
    }
    await pipeline.exec();
  }

  async getPendingEvents(batchSize: number): Promise<QueuedEvent[]> {
    if (!this.redisClient) return [];

    const eventsJson = await this.redisClient.lrange(this.queueKey, 0, batchSize - 1);
    if (eventsJson.length === 0) {
      return [];
    }

    // Перемещаем в processing (на случай сбоя)
    await this.redisClient.lpush(this.processingKey, ...eventsJson);
    await this.redisClient.ltrim(this.queueKey, eventsJson.length, -1);

    return eventsJson.map(json => JSON.parse(json) as QueuedEvent);
  }

  async markAsProcessing(eventIds: string[]): Promise<void> {
    // Уже сделано в getPendingEvents
  }

  async markAsCompleted(eventIds: string[]): Promise<void> {
    if (!this.redisClient) return;
    // Очищаем processing после успешной записи
    await this.redisClient.del(this.processingKey);
  }

  async revertToPending(eventIds: string[]): Promise<void> {
    if (!this.redisClient) return;
    // Возвращаем из processing в queue
    const eventsJson = await this.redisClient.lrange(this.processingKey, 0, -1);
    if (eventsJson.length > 0) {
      await this.redisClient.lpush(this.queueKey, ...eventsJson);
      await this.redisClient.del(this.processingKey);
    }
  }

  async deleteCompleted(): Promise<number> {
    // Redis не хранит completed, они удаляются сразу после обработки
    return 0;
  }

  async getPendingCount(): Promise<{ user_events: number; crm_events: number; system_events: number; total: number }> {
    if (!this.redisClient) {
      return { user_events: 0, crm_events: 0, system_events: 0, total: 0 };
    }

    const count = await this.redisClient.llen(this.queueKey);
    return {
      user_events: 0,
      crm_events: 0,
      system_events: 0,
      total: count,
    };
  }

  async healthCheck(): Promise<boolean> {
    if (!this.redisClient) return false;
    try {
      await this.redisClient.ping();
      return true;
    } catch {
      return false;
    }
  }
}
