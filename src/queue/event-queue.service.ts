import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { ClickHouseRepository, UserEvent, CrmEvent, SystemEvent } from '../clickhouse/clickhouse.repository';
import { CreateEventDto } from '../events/dto/create-event.dto';
import { EventSanitizer } from '../security/event-sanitizer';

export interface QueuedEvent {
  id: string;
  data: CreateEventDto;
  table: 'user_events' | 'crm_events' | 'system_events';
  queuedAt: number;
}

@Injectable()
export class EventQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(EventQueueService.name);
  private readonly userEventsBuffer: QueuedEvent[] = [];
  private readonly crmEventsBuffer: QueuedEvent[] = [];
  private readonly systemEventsBuffer: QueuedEvent[] = [];
  private readonly maxSize: number;
  private readonly flushIntervalMs: number;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly clickHouseRepo: ClickHouseRepository,
    private readonly sanitizer: EventSanitizer,
  ) {
    this.maxSize = this.configService.get<number>('buffer.maxSize', 1000);
    this.flushIntervalMs = this.configService.get<number>('buffer.flushIntervalMs', 5000);
    this.startFlushTimer();
  }

  onModuleDestroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
  }

  private startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flushAllBuffers();
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

    const buffer = this.getBuffer(table);
    buffer.push(queuedEvent);

    if (buffer.length >= this.maxSize) {
      await this.flushBuffer(table);
    }

    return { eventId: queuedEvent.id, table };
  }

  async enqueueBatch(events: CreateEventDto[]): Promise<{ count: number; tables: Record<string, number> }> {
    const tables: Record<string, number> = {};

    for (const event of events) {
      const table = this.determineTable(event);
      const queuedEvent: QueuedEvent = {
        id: uuidv4(),
        data: event,
        table,
        queuedAt: Date.now(),
      };

      const buffer = this.getBuffer(table);
      buffer.push(queuedEvent);
      tables[table] = (tables[table] || 0) + 1;

      if (buffer.length >= this.maxSize) {
        await this.flushBuffer(table);
      }
    }

    return { count: events.length, tables };
  }

  private determineTable(event: CreateEventDto): 'user_events' | 'crm_events' | 'system_events' {
    const category = event.event_category.toLowerCase();

    // System events
    if (category.includes('error') || category.includes('system') || event.event_type.startsWith('system.')) {
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

  private getBuffer(table: string): QueuedEvent[] {
    switch (table) {
      case 'user_events':
        return this.userEventsBuffer;
      case 'crm_events':
        return this.crmEventsBuffer;
      case 'system_events':
        return this.systemEventsBuffer;
      default:
        return this.userEventsBuffer;
    }
  }

  private async flushAllBuffers() {
    await Promise.all([
      this.flushBuffer('user_events'),
      this.flushBuffer('crm_events'),
      this.flushBuffer('system_events'),
    ]);
  }

  private async flushBuffer(table: string): Promise<void> {
    const buffer = this.getBuffer(table);
    if (buffer.length === 0) {
      return;
    }

    const eventsToFlush = buffer.splice(0, buffer.length);
    this.logger.debug(`Flushing ${eventsToFlush.length} events to ${table}`);

    try {
      switch (table) {
        case 'user_events':
          await this.insertUserEvents(eventsToFlush);
          break;
        case 'crm_events':
          await this.insertCrmEvents(eventsToFlush);
          break;
        case 'system_events':
          await this.insertSystemEvents(eventsToFlush);
          break;
      }
      this.logger.log(`Successfully flushed ${eventsToFlush.length} events to ${table}`);
    } catch (error) {
      this.logger.error(`Failed to flush events to ${table}: ${error.message}`);
      // Re-queue events on failure
      buffer.unshift(...eventsToFlush);
    }
  }

  private async insertUserEvents(events: QueuedEvent[]): Promise<void> {
    const userEvents: Omit<UserEvent, 'event_id' | 'timestamp' | 'event_date' | 'event_month' | 'received_at' | 'processed_at'>[] = events.map((e) => {
      const sanitizedPayload = this.sanitizer.sanitize(e.data.payload || {});

      return {
        user_id: e.data.user_id || null,
        session_id: e.data.session_id || null,
        campaign_id: e.data.campaign_id!,
        subcampaign_id: e.data.subcampaign_id || null,
        portal_id: e.data.portal_id || null,
        activity_id: e.data.activity_id || null,
        event_type: e.data.event_type,
        event_category: e.data.event_category,
        user_cycle_stage: e.data.user_cycle_stage || '',
        payload: JSON.stringify(sanitizedPayload),
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
      };
    });

    await this.clickHouseRepo.insertUserEvents(userEvents);
  }

  private async insertCrmEvents(events: QueuedEvent[]): Promise<void> {
    const crmEvents: Omit<CrmEvent, 'event_id' | 'timestamp' | 'event_date' | 'event_month' | 'received_at' | 'processed_at'>[] = events.map((e) => {
      const sanitizedPayload = this.sanitizer.sanitize(e.data.payload || {});

      return {
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
        payload: JSON.stringify(sanitizedPayload),
        action_result: e.data.result_status || 'pending',
        changes_before: null,
        changes_after: null,
        ip_address: '127.0.0.1',
        user_agent: '',
        source: 'server',
        service_name: 'event-logger',
        instance_id: process.env.HOSTNAME || 'default',
      };
    });

    await this.clickHouseRepo.insertCrmEvents(crmEvents);
  }

  private async insertSystemEvents(events: QueuedEvent[]): Promise<void> {
    const systemEvents: Omit<SystemEvent, 'event_id' | 'timestamp' | 'event_date' | 'event_month' | 'received_at' | 'processed_at'>[] = events.map((e) => {
      const sanitizedPayload = this.sanitizer.sanitize(e.data.payload || {});

      return {
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
        payload: JSON.stringify(sanitizedPayload),
        source: 'server',
      };
    });

    await this.clickHouseRepo.insertSystemEvents(systemEvents);
  }

  getQueueDepth(): { user_events: number; crm_events: number; system_events: number } {
    return {
      user_events: this.userEventsBuffer.length,
      crm_events: this.crmEventsBuffer.length,
      system_events: this.systemEventsBuffer.length,
    };
  }
}
