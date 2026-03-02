import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { EventsService } from '../../src/events/events.service';
import { EventQueueService } from '../../src/queue/event-queue.service';
import { ClickHouseRepository } from '../../src/clickhouse/clickhouse.repository';
import { EventSanitizer } from '../../src/security/event-sanitizer';
import { CreateEventDto } from '../../src/events/dto/create-event.dto';

describe('EventsService', () => {
  let service: EventsService;
  let mockEventQueue: Partial<EventQueueService>;
  let mockClickHouseRepo: Partial<ClickHouseRepository>;

  beforeEach(async () => {
    mockEventQueue = {
      enqueue: jest.fn().mockResolvedValue({ eventId: 'test-id', table: 'user_events' }),
      enqueueBatch: jest.fn().mockResolvedValue({ count: 1, tables: { user_events: 1 } }),
      getQueueDepth: jest.fn().mockReturnValue({ user_events: 0, crm_events: 0, system_events: 0 }),
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
          provide: EventSanitizer,
          useValue: { sanitize: jest.fn((p) => p) },
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a single event', async () => {
    const event: CreateEventDto = {
      event_type: 'activity.completed',
      event_category: 'activity',
      campaign_id: '550e8400-e29b-41d4-a716-446655440001',
      payload: { result: 'win' },
    };

    const result = await service.createEvent(event);

    expect(result.event_id).toBe('test-id');
    expect(result.status).toBe('queued');
    expect(result.table).toBe('user_events');
  });

  it('should create batch events', async () => {
    const events: CreateEventDto[] = [
      {
        event_type: 'activity.completed',
        event_category: 'activity',
        campaign_id: '550e8400-e29b-41d4-a716-446655440001',
        payload: { result: 'win' },
      },
    ];

    const result = await service.createBatchEvents(events);

    expect(result.count).toBe(1);
    expect(result.status).toBe('queued');
  });

  it('should query events', async () => {
    const result = await service.queryEvents({
      table: 'user_events',
      limit: 10,
      offset: 0,
    });

    expect(result.events).toEqual([]);
    expect(result.total_count).toBe(0);
    expect(result.has_more).toBe(false);
  });

  it('should delete user events', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';

    await service.deleteUserEvents(userId);

    expect(mockClickHouseRepo.deleteUserEvents).toHaveBeenCalledWith(userId);
  });

  it('should get health status', async () => {
    const result = await service.getHealthStatus();

    expect(result.status).toBe('healthy');
    expect(result.checks.clickhouse).toBe('ok');
    expect(result.metrics.events_received_last_hour).toBe(100);
  });
});
