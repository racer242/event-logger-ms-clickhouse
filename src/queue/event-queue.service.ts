import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { ClickHouseRepository } from '../clickhouse/clickhouse.repository';
import { CreateEventDto } from '../events/dto/create-event.dto';

export interface QueuedEvent {
  id: string;
  data: CreateEventDto;
  table: 'user_events' | 'crm_events' | 'system_events';
  queuedAt: number;
}

@Injectable()
export class EventQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventQueueService.name);
  
  // In-memory буфер (для режима без Redis)
  private memoryBuffer: QueuedEvent[] = [];
  private readonly memoryMaxSize: number;
  
  // Redis клиент (для режима с Redis)
  private redisClient: Redis | null = null;
  private readonly isRedisEnabled: boolean;
  private readonly queuePrefix: string;
  
  // Таймер сброса
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly flushIntervalMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly clickHouseRepo: ClickHouseRepository,
  ) {
    this.isRedisEnabled = this.configService.get<boolean>('redis.enabled', false);
    this.queuePrefix = this.configService.get<string>('redis.queuePrefix', 'event_logger');
    this.memoryMaxSize = this.configService.get<number>('buffer.maxSize', 1000);
    this.flushIntervalMs = this.configService.get<number>('buffer.flushIntervalMs', 5000);
  }

  async onModuleInit() {
    // Если Redis включён - подключаемся
    if (this.isRedisEnabled) {
      try {
        const redisHost = this.configService.get<string>('redis.host', 'localhost');
        const redisPort = this.configService.get<number>('redis.port', 6379);
        const redisPassword = this.configService.get<string>('redis.password');
        
        this.redisClient = new Redis({
          host: redisHost,
          port: redisPort,
          password: redisPassword,
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
        this.logger.error(`Failed to connect to Redis: ${error.message}`);
        this.logger.warn('Falling back to in-memory buffer');
        this.redisClient = null;
      }
    }
    
    // Запуск таймера сброса
    this.startFlushTimer();
  }

  async onModuleDestroy() {
    // Graceful shutdown - сброс остатков
    this.logger.log('Flushing remaining events before shutdown...');
    await this.flushBuffer();
    
    // Остановка таймера
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    // Закрытие Redis подключения
    if (this.redisClient) {
      await this.redisClient.quit();
      this.logger.log('Redis connection closed');
    }
  }

  private startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flushBuffer();
    }, this.flushIntervalMs);
  }

  async enqueue(event: CreateEventDto): Promise<{ eventId: string; table: string }> {
    const table = this.determineTable(event);
    
    // Validate campaign_id for user_events (required for partitioning)
    if (table === 'user_events' && !event.campaign_id) {
      throw new Error('campaign_id is required for user_events');
    }
    
    const queuedEvent: QueuedEvent = {
      id: uuidv4(),
      data: event,
      table,
      queuedAt: Date.now(),
    };

    if (this.isRedisEnabled && this.redisClient) {
      // Redis режим
      await this.redisClient.lpush(this.getQueueKey(), JSON.stringify(queuedEvent));
    } else {
      // In-memory режим
      this.memoryBuffer.push(queuedEvent);
      
      // Сброс при заполнении
      if (this.memoryBuffer.length >= this.memoryMaxSize) {
        await this.flushBuffer();
      }
    }

    return { eventId: queuedEvent.id, table };
  }

  async enqueueBatch(events: CreateEventDto[]): Promise<{ count: number; tables: Record<string, number> }> {
    const tables: Record<string, number> = {};
    
    for (const event of events) {
      const table = this.determineTable(event);
      tables[table] = (tables[table] || 0) + 1;
      await this.enqueue(event);
    }

    return { count: events.length, tables };
  }

  private determineTable(event: CreateEventDto): 'user_events' | 'crm_events' | 'system_events' {
    const category = event.event_category.toLowerCase();

    // System events - includes errors, performance, health checks
    if (category.includes('error') || category.includes('system') || 
        category.includes('performance') || category.includes('health') || 
        event.event_type.startsWith('system.')) {
      return 'system_events';
    }

    // CRM events
    const crmCategories = ['admin', 'moderation', 'notification', 'integration', 'security', 'fraud'];
    if (crmCategories.some((c) => category.includes(c))) {
      return 'crm_events';
    }

    // Default to user events
    return 'user_events';
  }

  private getQueueKey(): string {
    return `${this.queuePrefix}:queue`;
  }

  private getProcessingKey(): string {
    return `${this.queuePrefix}:processing`;
  }

  private async recoverPendingEvents() {
    if (!this.redisClient) return;

    try {
      // Забираем все "зависшие" события с прошлого запуска
      const pending = await this.redisClient.lrange(this.getQueueKey(), 0, -1);
      
      if (pending.length > 0) {
        this.logger.log(`Recovering ${pending.length} pending events from Redis...`);
        
        const eventsToRecover: QueuedEvent[] = [];
        
        for (const eventJson of pending) {
          try {
            const event = JSON.parse(eventJson) as QueuedEvent;
            eventsToRecover.push(event);
          } catch (error) {
            this.logger.error(`Failed to parse recovered event: ${error.message}`);
          }
        }
        
        if (eventsToRecover.length > 0) {
          // Отправляем восстановленные события в ClickHouse
          await this.insertEvents(eventsToRecover);
          
          // Очищаем очередь после восстановления
          await this.redisClient.del(this.getQueueKey());
          this.logger.log(`Recovery complete: ${eventsToRecover.length} events processed`);
        }
      }
    } catch (error) {
      this.logger.error(`Recovery failed: ${error.message}`);
    }
  }

  private async flushBuffer() {
    if (this.isRedisEnabled && this.redisClient) {
      // Redis режим - пакетная обработка
      const batchSize = 100;
      
      try {
        while (true) {
          // Забираем пачку из очереди
          const eventsJson = await this.redisClient.lrange(this.getQueueKey(), 0, batchSize - 1);
          
          if (eventsJson.length === 0) break;
          
          try {
            // Перемещаем в "processing" (на случай сбоя)
            await this.redisClient.lpush(this.getProcessingKey(), ...eventsJson);
            await this.redisClient.ltrim(this.getQueueKey(), eventsJson.length, -1);
            
            // Парсим и отправляем в ClickHouse
            const events: QueuedEvent[] = eventsJson.map(json => JSON.parse(json));
            await this.insertEvents(events);
            
            // Очищаем processing после успешной записи
            await this.redisClient.del(this.getProcessingKey());
            
          } catch (error) {
            this.logger.error(`Flush failed: ${error.message}. Events remain in processing.`);
            break;
          }
        }
      } catch (error) {
        this.logger.error(`Redis flush error: ${error.message}`);
      }
    } else {
      // In-memory режим
      if (this.memoryBuffer.length > 0) {
        await this.insertEvents(this.memoryBuffer);
        this.memoryBuffer = [];
      }
    }
  }

  private async insertEvents(events: QueuedEvent[]) {
    const eventsByTable = events.reduce((acc, event) => {
      acc[event.table] = acc[event.table] || [];
      acc[event.table].push(event);
      return acc;
    }, {} as Record<string, QueuedEvent[]>);

    for (const [table, tableEvents] of Object.entries(eventsByTable)) {
      try {
        switch (table) {
          case 'user_events':
            await this.insertUserEvents(tableEvents);
            break;
          case 'crm_events':
            await this.insertCrmEvents(tableEvents);
            break;
          case 'system_events':
            await this.insertSystemEvents(tableEvents);
            break;
        }
        this.logger.log(`Inserted ${tableEvents.length} events into ${table}`);
      } catch (error) {
        this.logger.error(`Failed to insert events into ${table}: ${error.message}`);
        throw error;
      }
    }
  }

  private async insertUserEvents(events: QueuedEvent[]): Promise<void> {
    const userEvents = events.map((e) => ({
      user_id: e.data.user_id || null,
      session_id: e.data.session_id || null,
      campaign_id: e.data.campaign_id!,
      subcampaign_id: e.data.subcampaign_id || null,
      portal_id: e.data.portal_id || null,
      activity_id: e.data.activity_id || null,
      event_type: e.data.event_type,
      event_category: e.data.event_category,
      user_cycle_stage: e.data.user_cycle_stage || '',
      payload: JSON.stringify(e.data.payload || {}),
      result_status: e.data.result_status || null,
      reward_amount: e.data.reward_amount || null,
      reward_type: e.data.reward_type || null,
      device_type: e.data.device?.type || '',
      device_os: e.data.device?.os || '',
      device_browser: e.data.device?.browser || '',
      ip_address: '127.0.0.1',
      user_agent: '',
      source: 'server',
      service_name: 'event-logger',
      instance_id: process.env.HOSTNAME || 'default',
    }));

    await this.clickHouseRepo.insertUserEvents(userEvents);
  }

  private async insertCrmEvents(events: QueuedEvent[]): Promise<void> {
    const crmEvents = events.map((e) => ({
      user_id: e.data.user_id || null,
      admin_id: e.data.admin_id || null,
      moderator_id: e.data.moderator_id || null,
      campaign_id: e.data.campaign_id || null,
      subcampaign_id: e.data.subcampaign_id || null,
      portal_id: e.data.portal_id || null,
      activity_id: e.data.activity_id || null,
      prize_id: e.data.prize_id || null,
      submission_id: e.data.submission_id || null,
      event_type: e.data.event_type,
      event_category: e.data.event_category,
      resource_type: '',
      payload: JSON.stringify(e.data.payload || {}),
      action_result: e.data.result_status || 'pending',
      changes_before: null,
      changes_after: null,
      ip_address: '127.0.0.1',
      user_agent: '',
      source: 'server',
      service_name: 'event-logger',
      instance_id: process.env.HOSTNAME || 'default',
    }));

    await this.clickHouseRepo.insertCrmEvents(crmEvents);
  }

  private async insertSystemEvents(events: QueuedEvent[]): Promise<void> {
    const systemEvents = events.map((e) => ({
      event_type: e.data.event_type,
      event_category: e.data.event_category,
      severity: e.data.severity || 'info',
      error_code: e.data.error_code || null,
      error_message: e.data.error_message || null,
      stack_trace: e.data.stack_trace || null,
      service_name: e.data.service_name || 'event-logger',
      instance_id: process.env.HOSTNAME || 'default',
      host_name: process.env.HOSTNAME || 'localhost',
      operation_type: null,
      resource_type: null,
      resource_id: null,
      campaign_id: e.data.campaign_id || null,
      user_id: e.data.user_id || null,
      duration_ms: e.data.duration_ms || null,
      memory_mb: e.data.memory_mb || null,
      cpu_percent: e.data.cpu_percent || null,
      payload: JSON.stringify(e.data.payload || {}),
      source: 'server',
    }));

    await this.clickHouseRepo.insertSystemEvents(systemEvents);
  }

  getQueueDepth(): { user_events: number; crm_events: number; system_events: number; redis?: number } {
    if (this.isRedisEnabled) {
      return {
        user_events: 0,
        crm_events: 0,
        system_events: 0,
        redis: 0, // Redis queue depth would require additional tracking
      };
    }
    
    return {
      user_events: this.memoryBuffer.length,
      crm_events: 0,
      system_events: 0,
    };
  }
}
