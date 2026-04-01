import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { EventsService } from '../events/events.service';
import { EventQueueService } from '../queue/event-queue.service';
import { ClickHouseRepository } from '../clickhouse/clickhouse.repository';
import { RedisQueueRepository } from '../queue/redis-queue.repository';
import { CreateEventDto, Severity } from '../events/dto/create-event.dto';

describe('EventsService', () => {
  let service: EventsService;
  let mockEventQueue: Partial<EventQueueService>;
  let mockClickHouseRepo: Partial<ClickHouseRepository>;
  let mockRedisRepo: Partial<RedisQueueRepository>;

  beforeEach(async () => {
    mockEventQueue = {
      enqueue: jest
        .fn()
        .mockResolvedValue({ eventId: 'test-event-id', table: 'user_events' }),
      enqueueBatch: jest
        .fn()
        .mockResolvedValue({ count: 1, tables: { user_events: 1 } }),
      getQueueDepth: jest.fn().mockReturnValue({
        user_events: 0,
        crm_events: 0,
        system_events: 0,
        total: 0,
      }),
    };

    mockClickHouseRepo = {
      queryEvents: jest.fn().mockResolvedValue([]),
      countEvents: jest.fn().mockResolvedValue(0),
      deleteUserEvents: jest.fn().mockResolvedValue(undefined),
      healthCheck: jest.fn().mockResolvedValue(true),
      getMetrics: jest.fn().mockResolvedValue({
        events_received_last_hour: 100,
        queue_depth: 0,
        avg_processing_time_ms: 50,
      }),
    };

    mockRedisRepo = {
      healthCheck: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [
        EventsService,
        {
          provide: EventQueueService,
          useValue: mockEventQueue,
        },
        {
          provide: ClickHouseRepository,
          useValue: mockClickHouseRepo,
        },
        {
          provide: RedisQueueRepository,
          useValue: mockRedisRepo,
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createEvent', () => {
    it('should create a single user event', async () => {
      const event: CreateEventDto = {
        client_id: 'client-001',
        campaign_id: 'campaign-2026-spring',
        session_id: 'sess-abc123xyz',
        timestamp: '2026-04-01T12:00:00.000Z',
        event_type: 'registration.complete',
        source: 'auth-service',
        criticality: 'high',
        user_id: '12345',
        payload: { registration_method: 'phone' },
      };

      // Настраиваем mock для возврата user_events
      mockEventQueue.enqueue = jest
        .fn()
        .mockResolvedValue({ eventId: 'test-event-id', table: 'user_events' });

      const result = await service.createEvent(event);

      expect(result.event_id).toBe('test-event-id');
      expect(result.status).toBe('queued');
      expect(result.table).toBe('user_events');
      expect(mockEventQueue.enqueue).toHaveBeenCalledWith(event);
    });

    it('should create a CRM event', async () => {
      const event: CreateEventDto = {
        client_id: 'client-001',
        campaign_id: 'campaign-2026-spring',
        session_id: 'sess-admin-001',
        timestamp: '2026-04-01T12:00:00.000Z',
        event_type: 'crm.user.create',
        source: 'admin-panel',
        criticality: 'high',
        crm_user_id: 'usr-12345',
        entity_type: 'user',
        entity_id: 'usr-12345',
        action_type: 'create',
      };

      // Настраиваем mock для возврата crm_events
      mockEventQueue.enqueue = jest
        .fn()
        .mockResolvedValue({ eventId: 'test-event-id', table: 'crm_events' });

      const result = await service.createEvent(event);

      expect(result.event_id).toBe('test-event-id');
      expect(result.status).toBe('queued');
      expect(result.table).toBe('crm_events');
    });

    it('should create a system event', async () => {
      const event: CreateEventDto = {
        client_id: 'client-001',
        campaign_id: 'campaign-2026-spring',
        session_id: 'sess-system-001',
        timestamp: '2026-04-01T12:00:00.000Z',
        event_type: 'system.error.api',
        source: 'api-gateway',
        criticality: 'high',
        severity: Severity.ERROR,
        instance_id: 'instance-001',
      };

      // Настраиваем mock для возврата system_events
      mockEventQueue.enqueue = jest.fn().mockResolvedValue({
        eventId: 'test-event-id',
        table: 'system_events',
      });

      const result = await service.createEvent(event);

      expect(result.event_id).toBe('test-event-id');
      expect(result.status).toBe('queued');
      expect(result.table).toBe('system_events');
    });
  });

  describe('createBatchEvents', () => {
    it('should create batch events', async () => {
      const events: CreateEventDto[] = [
        {
          client_id: 'client-001',
          campaign_id: 'campaign-2026-spring',
          session_id: 'sess-001',
          timestamp: '2026-04-01T12:00:00.000Z',
          event_type: 'page_view.open',
          source: 'portal-frontend',
          criticality: 'low',
        },
        {
          client_id: 'client-001',
          campaign_id: 'campaign-2026-spring',
          session_id: 'sess-001',
          timestamp: '2026-04-01T12:00:05.000Z',
          event_type: 'activity.start',
          source: 'activity-service',
          criticality: 'low',
          user_id: '12345',
          activity_id: '67890',
        },
      ];

      // Настраиваем mock для возврата 2 events в user_events
      mockEventQueue.enqueueBatch = jest
        .fn()
        .mockResolvedValue({ count: 2, tables: { user_events: 2 } });

      const result = await service.createBatchEvents(events);

      expect(result.count).toBe(2);
      expect(result.status).toBe('queued');
      expect(result.tables['user_events']).toBe(2);
      expect(mockEventQueue.enqueueBatch).toHaveBeenCalledWith(events);
    });

    it('should handle mixed event types in batch', async () => {
      const events: CreateEventDto[] = [
        {
          client_id: 'client-001',
          campaign_id: 'campaign-2026-spring',
          session_id: 'sess-001',
          timestamp: '2026-04-01T12:00:00.000Z',
          event_type: 'registration.complete',
          source: 'auth-service',
          criticality: 'high',
          user_id: '12345',
        },
        {
          client_id: 'client-001',
          campaign_id: 'campaign-2026-spring',
          session_id: 'sess-admin-001',
          timestamp: '2026-04-01T12:00:01.000Z',
          event_type: 'crm.user.update',
          source: 'admin-panel',
          criticality: 'medium',
          crm_user_id: 'usr-12345',
          entity_type: 'user',
          entity_id: 'usr-12345',
          action_type: 'update',
        },
      ];

      // Настраиваем mock для возврата mixed events
      mockEventQueue.enqueueBatch = jest.fn().mockResolvedValue({
        count: 2,
        tables: { user_events: 1, crm_events: 1 },
      });

      const result = await service.createBatchEvents(events);

      expect(result.count).toBe(2);
      expect(result.tables['user_events']).toBe(1);
      expect(result.tables['crm_events']).toBe(1);
    });
  });

  describe('queryEvents', () => {
    it('should query events with filters', async () => {
      const mockEvents = [
        {
          event_id: 'event-001',
          client_id: 'client-001',
          campaign_id: 'campaign-2026-spring',
          timestamp: '2026-04-01T12:00:00.000Z',
          event_type: 'registration.complete',
          user_id: '12345',
        },
      ];

      mockClickHouseRepo.queryEvents = jest.fn().mockResolvedValue(mockEvents);
      mockClickHouseRepo.countEvents = jest.fn().mockResolvedValue(1);

      const result = await service.queryEvents({
        table: 'user_events',
        campaign_id: 'campaign-2026-spring',
        limit: 10,
        offset: 0,
      });

      expect(result.events).toEqual(mockEvents);
      expect(result.total_count).toBe(1);
      expect(result.has_more).toBe(false);
    });

    it('should query events with user_id filter as string', async () => {
      mockClickHouseRepo.queryEvents = jest.fn().mockResolvedValue([]);
      mockClickHouseRepo.countEvents = jest.fn().mockResolvedValue(0);

      await service.queryEvents({
        table: 'user_events',
        user_id: 'usr-12345', // строка, не число
        limit: 10,
        offset: 0,
      });

      expect(mockClickHouseRepo.queryEvents).toHaveBeenCalledWith(
        'user_events',
        { user_id: 'usr-12345' },
        10,
        0,
      );
    });

    it('should return has_more when total exceeds limit', async () => {
      mockClickHouseRepo.countEvents = jest.fn().mockResolvedValue(150);

      const result = await service.queryEvents({
        table: 'user_events',
        limit: 100,
        offset: 0,
      });

      expect(result.has_more).toBe(true);
    });
  });

  describe('deleteUserEvents', () => {
    it('should delete user events by user_id', async () => {
      const userId = 'usr-12345';

      await service.deleteUserEvents(userId);

      expect(mockClickHouseRepo.deleteUserEvents).toHaveBeenCalledWith(userId);
    });

    it('should accept user_id as string', async () => {
      const userId = '12345'; // строковое представление

      await service.deleteUserEvents(userId);

      expect(mockClickHouseRepo.deleteUserEvents).toHaveBeenCalledWith('12345');
    });
  });

  describe('getHealthStatus', () => {
    it('should return healthy status when all checks pass', async () => {
      const result = await service.getHealthStatus();

      expect(result.status).toBe('healthy');
      expect(result.checks.clickhouse).toBe('ok');
      expect(result.checks.queue).toBe('ok');
      expect(result.checks.cache).toBe('ok');
      expect(result.metrics.events_received_last_hour).toBe(100);
      expect(result.metrics.queue_depth).toBe(0);
      expect(result.metrics.avg_processing_time_ms).toBe(50);
    });

    it('should return unhealthy status when ClickHouse is down', async () => {
      mockClickHouseRepo.healthCheck = jest.fn().mockResolvedValue(false);

      const result = await service.getHealthStatus();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.clickhouse).toBe('error');
    });

    it('should check Redis health when queue type is redis', async () => {
      // Создаём новый сервис с конфигом для Redis
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [() => ({ queue: { type: 'redis' } })],
          }),
        ],
        providers: [
          EventsService,
          {
            provide: EventQueueService,
            useValue: mockEventQueue,
          },
          {
            provide: ClickHouseRepository,
            useValue: mockClickHouseRepo,
          },
          {
            provide: RedisQueueRepository,
            useValue: mockRedisRepo,
          },
        ],
      }).compile();

      const redisService = module.get<EventsService>(EventsService);
      const result = await redisService.getHealthStatus();

      expect(result.checks.redis).toBe('ok');
    });

    it('should return degraded status when Redis is down', async () => {
      mockRedisRepo.healthCheck = jest.fn().mockResolvedValue(false);

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [() => ({ queue: { type: 'redis' } })],
          }),
        ],
        providers: [
          EventsService,
          {
            provide: EventQueueService,
            useValue: mockEventQueue,
          },
          {
            provide: ClickHouseRepository,
            useValue: mockClickHouseRepo,
          },
          {
            provide: RedisQueueRepository,
            useValue: mockRedisRepo,
          },
        ],
      }).compile();

      const redisService = module.get<EventsService>(EventsService);
      const result = await redisService.getHealthStatus();

      expect(result.status).toBe('degraded');
      expect(result.checks.redis).toBe('error');
    });
  });

  describe('String ID fields', () => {
    it('should handle string user_id in createEvent', async () => {
      const event: CreateEventDto = {
        client_id: 'client-001',
        campaign_id: 'campaign-001',
        session_id: 'sess-001',
        timestamp: '2026-04-01T12:00:00.000Z',
        event_type: 'registration.complete',
        source: 'auth-service',
        criticality: 'high',
        user_id: 'usr-12345', // строка
      };

      mockEventQueue.enqueue = jest
        .fn()
        .mockResolvedValue({ eventId: 'test-id', table: 'user_events' });

      const result = await service.createEvent(event);
      expect(result.status).toBe('queued');
    });

    it('should handle string crm_user_id in createEvent', async () => {
      const event: CreateEventDto = {
        client_id: 'client-001',
        campaign_id: 'campaign-001',
        session_id: 'sess-001',
        timestamp: '2026-04-01T12:00:00.000Z',
        event_type: 'crm.user.create',
        source: 'admin-panel',
        criticality: 'high',
        crm_user_id: 'usr-12345', // строка
        entity_type: 'user',
        entity_id: 'usr-12345',
        action_type: 'create',
      };

      mockEventQueue.enqueue = jest
        .fn()
        .mockResolvedValue({ eventId: 'test-id', table: 'crm_events' });

      const result = await service.createEvent(event);
      expect(result.table).toBe('crm_events');
    });

    it('should handle string activity_id, prize_id, receipt_id in createEvent', async () => {
      const event: CreateEventDto = {
        client_id: 'client-001',
        campaign_id: 'campaign-001',
        session_id: 'sess-001',
        timestamp: '2026-04-01T12:00:00.000Z',
        event_type: 'activity.complete',
        source: 'activity-service',
        criticality: 'medium',
        user_id: '12345',
        activity_id: 'act-67890', // строка
        prize_id: 'prize-111', // строка
        receipt_id: 'rcpt-222', // строка
      };

      mockEventQueue.enqueue = jest
        .fn()
        .mockResolvedValue({ eventId: 'test-id', table: 'user_events' });

      const result = await service.createEvent(event);
      expect(result.table).toBe('user_events');
    });
  });
});
