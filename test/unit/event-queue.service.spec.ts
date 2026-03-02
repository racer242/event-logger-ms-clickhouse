import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventQueueService } from '../../src/queue/event-queue.service';
import { ClickHouseRepository } from '../../src/clickhouse/clickhouse.repository';
import { EventSanitizer } from '../../src/security/event-sanitizer';
import { CLICKHOUSE_CLIENT } from '../../src/clickhouse/clickhouse.constants';
import { CreateEventDto } from '../../src/events/dto/create-event.dto';

describe('EventQueueService', () => {
  let service: EventQueueService;
  let mockClickHouseRepo: Partial<ClickHouseRepository>;
  let mockSanitizer: Partial<EventSanitizer>;

  beforeEach(async () => {
    mockClickHouseRepo = {
      insertUserEvents: jest.fn().mockResolvedValue(undefined),
      insertCrmEvents: jest.fn().mockResolvedValue(undefined),
      insertSystemEvents: jest.fn().mockResolvedValue(undefined),
    };

    mockSanitizer = {
      sanitize: jest.fn((payload) => payload),
      hashIpAddress: jest.fn((ip) => 'hashed-ip'),
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
          provide: EventSanitizer,
          useValue: mockSanitizer,
        },
        {
          provide: CLICKHOUSE_CLIENT,
          useValue: {},
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

  it('should enqueue a user event', async () => {
    const event: CreateEventDto = {
      event_type: 'activity.completed',
      event_category: 'activity',
      campaign_id: '550e8400-e29b-41d4-a716-446655440001',
      user_id: '550e8400-e29b-41d4-a716-446655440000',
      payload: { result: 'win' },
    };

    const result = await service.enqueue(event);

    expect(result.eventId).toBeDefined();
    expect(result.table).toBe('user_events');
  });

  it('should enqueue a CRM event', async () => {
    const event: CreateEventDto = {
      event_type: 'admin.user.created',
      event_category: 'admin_user',
      campaign_id: '550e8400-e29b-41d4-a716-446655440001',
      payload: { user_id: '123' },
    };

    const result = await service.enqueue(event);

    expect(result.eventId).toBeDefined();
    expect(result.table).toBe('crm_events');
  });

  it('should enqueue a system event', async () => {
    const event: CreateEventDto = {
      event_type: 'system.error.db',
      event_category: 'error_db',
      campaign_id: '550e8400-e29b-41d4-a716-446655440001',
      payload: { error_code: 'DB001' },
    };

    const result = await service.enqueue(event);

    expect(result.eventId).toBeDefined();
    expect(result.table).toBe('system_events');
  });

  it('should enqueue batch events', async () => {
    const events: CreateEventDto[] = [
      {
        event_type: 'activity.completed',
        event_category: 'activity',
        campaign_id: '550e8400-e29b-41d4-a716-446655440001',
        payload: { result: 'win' },
      },
      {
        event_type: 'page.viewed',
        event_category: 'page_view',
        campaign_id: '550e8400-e29b-41d4-a716-446655440001',
        payload: { page: '/home' },
      },
    ];

    const result = await service.enqueueBatch(events);

    expect(result.count).toBe(2);
    expect(result.tables['user_events']).toBe(2);
  });

  it('should return queue depth', () => {
    const depth = service.getQueueDepth();

    expect(depth).toHaveProperty('user_events');
    expect(depth).toHaveProperty('crm_events');
    expect(depth).toHaveProperty('system_events');
  });
});
