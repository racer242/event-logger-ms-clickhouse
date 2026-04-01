import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventQueueService } from '../queue/event-queue.service';
import { ClickHouseRepository } from '../clickhouse/clickhouse.repository';
import { SqliteQueueRepository } from '../queue/sqlite-queue.repository';
import { RedisQueueRepository } from '../queue/redis-queue.repository';
import { CreateEventDto, Severity } from '../events/dto/create-event.dto';

describe('EventQueueService', () => {
  let service: EventQueueService;
  let mockClickHouseRepo: Partial<ClickHouseRepository>;
  let mockSqliteRepo: Partial<SqliteQueueRepository>;
  let mockRedisRepo: Partial<RedisQueueRepository>;

  beforeEach(async () => {
    mockClickHouseRepo = {
      insertUserEvents: jest.fn().mockResolvedValue(undefined),
      insertCrmEvents: jest.fn().mockResolvedValue(undefined),
      insertSystemEvents: jest.fn().mockResolvedValue(undefined),
    };

    mockSqliteRepo = {
      insert: jest.fn(),
      insertBatch: jest.fn(),
      getPendingEvents: jest.fn().mockReturnValue([]),
      markAsProcessing: jest.fn(),
      markAsCompleted: jest.fn(),
      revertToPending: jest.fn(),
      deleteCompleted: jest.fn().mockReturnValue(0),
      getPendingCount: jest.fn().mockReturnValue({
        user_events: 0,
        crm_events: 0,
        system_events: 0,
        total: 0,
      }),
    };

    mockRedisRepo = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      enqueueBatch: jest.fn().mockResolvedValue(undefined),
      getPendingEvents: jest.fn().mockResolvedValue([]),
      markAsCompleted: jest.fn().mockResolvedValue(undefined),
      revertToPending: jest.fn().mockResolvedValue(undefined),
      healthCheck: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [
        EventQueueService,
        {
          provide: ClickHouseRepository,
          useValue: mockClickHouseRepo,
        },
        {
          provide: SqliteQueueRepository,
          useValue: mockSqliteRepo,
        },
        {
          provide: RedisQueueRepository,
          useValue: mockRedisRepo,
        },
      ],
    }).compile();

    service = module.get<EventQueueService>(EventQueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('determineTable', () => {
    it('should return user_events for non-crm and non-system events', async () => {
      const event: CreateEventDto = {
        client_id: 'client-001',
        campaign_id: 'campaign-001',
        session_id: 'sess-001',
        timestamp: '2026-04-01T12:00:00.000Z',
        event_type: 'registration.complete',
        source: 'auth-service',
        criticality: 'high',
        user_id: '12345',
      };

      // Проверяем приватный метод через любой публичный метод
      const result = await service.enqueue(event);
      expect(result.table).toBe('user_events');
    });

    it('should return crm_events for events starting with crm.', async () => {
      const event: CreateEventDto = {
        client_id: 'client-001',
        campaign_id: 'campaign-001',
        session_id: 'sess-001',
        timestamp: '2026-04-01T12:00:00.000Z',
        event_type: 'crm.user.create',
        source: 'admin-panel',
        criticality: 'high',
        crm_user_id: 'usr-12345',
        entity_type: 'user',
        entity_id: 'usr-12345',
        action_type: 'create',
      };

      const result = await service.enqueue(event);
      expect(result.table).toBe('crm_events');
    });

    it('should return system_events for events starting with system.', async () => {
      const event: CreateEventDto = {
        client_id: 'client-001',
        campaign_id: 'campaign-001',
        session_id: 'sess-001',
        timestamp: '2026-04-01T12:00:00.000Z',
        event_type: 'system.error.api',
        source: 'api-gateway',
        criticality: 'high',
        severity: Severity.ERROR,
        instance_id: 'instance-001',
      };

      const result = await service.enqueue(event);
      expect(result.table).toBe('system_events');
    });

    it('should return user_events for activity events', async () => {
      const event: CreateEventDto = {
        client_id: 'client-001',
        campaign_id: 'campaign-001',
        session_id: 'sess-001',
        timestamp: '2026-04-01T12:00:00.000Z',
        event_type: 'activity.complete',
        source: 'activity-service',
        criticality: 'medium',
        user_id: '12345',
        activity_id: '67890',
      };

      const result = await service.enqueue(event);
      expect(result.table).toBe('user_events');
    });

    it('should return user_events for page_view events', async () => {
      const event: CreateEventDto = {
        client_id: 'client-001',
        campaign_id: 'campaign-001',
        session_id: 'sess-001',
        timestamp: '2026-04-01T12:00:00.000Z',
        event_type: 'page_view.open',
        source: 'portal-frontend',
        criticality: 'low',
      };

      const result = await service.enqueue(event);
      expect(result.table).toBe('user_events');
    });
  });

  describe('enqueue', () => {
    it('should enqueue a user event with all required fields', async () => {
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

      const result = await service.enqueue(event);

      expect(result.eventId).toBeDefined();
      expect(result.table).toBe('user_events');
      expect(mockSqliteRepo.insert).toHaveBeenCalled();
    });

    it('should enqueue a CRM event', async () => {
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
        payload: { role: 'moderator' },
      };

      const result = await service.enqueue(event);

      expect(result.eventId).toBeDefined();
      expect(result.table).toBe('crm_events');
    });

    it('should enqueue a system event', async () => {
      const event: CreateEventDto = {
        client_id: 'client-001',
        campaign_id: 'campaign-2026-spring',
        session_id: 'sess-system-001',
        timestamp: '2026-04-01T12:00:00.000Z',
        event_type: 'system.error.db',
        source: 'database-service',
        criticality: 'high',
        severity: Severity.ERROR,
        instance_id: 'instance-prod-01',
        error_code: 'DB_CONNECTION_FAILED',
        payload: { message: 'Connection timeout' },
      };

      const result = await service.enqueue(event);

      expect(result.eventId).toBeDefined();
      expect(result.table).toBe('system_events');
    });
  });

  describe('enqueueBatch', () => {
    it('should enqueue batch events', async () => {
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

      const result = await service.enqueueBatch(events);

      expect(result.count).toBe(2);
      expect(result.tables['user_events']).toBe(2);
      expect(mockSqliteRepo.insertBatch).toHaveBeenCalled();
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
        {
          client_id: 'client-001',
          campaign_id: 'campaign-2026-spring',
          session_id: 'sess-system-001',
          timestamp: '2026-04-01T12:00:02.000Z',
          event_type: 'system.health.check',
          source: 'monitoring',
          criticality: 'low',
          severity: Severity.WARNING,
          instance_id: 'instance-001',
        },
      ];

      const result = await service.enqueueBatch(events);

      expect(result.count).toBe(3);
      expect(result.tables['user_events']).toBe(1);
      expect(result.tables['crm_events']).toBe(1);
      expect(result.tables['system_events']).toBe(1);
    });
  });

  describe('getQueueDepth', () => {
    it('should return queue depth with all table counts', () => {
      const depth = service.getQueueDepth();

      expect(depth).toHaveProperty('user_events');
      expect(depth).toHaveProperty('crm_events');
      expect(depth).toHaveProperty('system_events');
      expect(depth).toHaveProperty('total');
    });
  });

  describe('ID fields as strings', () => {
    it('should handle string user_id', async () => {
      const event: CreateEventDto = {
        client_id: 'client-001',
        campaign_id: 'campaign-001',
        session_id: 'sess-001',
        timestamp: '2026-04-01T12:00:00.000Z',
        event_type: 'registration.complete',
        source: 'auth-service',
        criticality: 'high',
        user_id: 'usr-12345', // строка, не число
      };

      const result = await service.enqueue(event);
      expect(result.table).toBe('user_events');
    });

    it('should handle string crm_user_id', async () => {
      const event: CreateEventDto = {
        client_id: 'client-001',
        campaign_id: 'campaign-001',
        session_id: 'sess-001',
        timestamp: '2026-04-01T12:00:00.000Z',
        event_type: 'crm.user.create',
        source: 'admin-panel',
        criticality: 'high',
        crm_user_id: 'usr-12345', // строка, не число
        entity_type: 'user',
        entity_id: 'usr-12345',
        action_type: 'create',
      };

      const result = await service.enqueue(event);
      expect(result.table).toBe('crm_events');
    });

    it('should handle string activity_id, prize_id, message_id', async () => {
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
        message_id: 'msg-222', // строка
      };

      const result = await service.enqueue(event);
      expect(result.table).toBe('user_events');
    });
  });
});
