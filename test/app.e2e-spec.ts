import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { ConfigModule } from '@nestjs/config';

describe('EventsController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        AppModule,
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
          ignoreEnvFile: true,
        }),
      ],
    })
      .overrideProvider('CLICKHOUSE_CLIENT')
      .useValue({
        ping: jest.fn().mockResolvedValue(true),
        exec: jest.fn().mockResolvedValue({}),
        insert: jest.fn().mockResolvedValue({}),
        query: jest.fn().mockResolvedValue({
          json: jest.fn().mockResolvedValue([]),
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/health (GET)', () => {
    it('should return health status', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .then((res) => {
          expect(res.body.status).toBeDefined();
          expect(res.body.checks).toBeDefined();
        });
    });
  });

  describe('/api/v1/events (POST)', () => {
    it('should accept a valid event', () => {
      const event = {
        event_type: 'activity.completed',
        event_category: 'activity',
        campaign_id: '550e8400-e29b-41d4-a716-446655440001',
        user_id: '550e8400-e29b-41d4-a716-446655440000',
        payload: { result: 'win', reward_amount: 50 },
      };

      return request(app.getHttpServer())
        .post('/api/v1/events')
        .set('X-API-Key', 'test-api-key')
        .send(event)
        .expect(202)
        .then((res) => {
          expect(res.body.event_id).toBeDefined();
          expect(res.body.status).toBe('queued');
        });
    });

    it('should reject invalid event (missing campaign_id)', () => {
      const event = {
        event_type: 'activity.completed',
        event_category: 'activity',
        payload: { result: 'win' },
      };

      return request(app.getHttpServer())
        .post('/api/v1/events')
        .set('X-API-Key', 'test-api-key')
        .send(event)
        .expect(400);
    });
  });

  describe('/api/v1/events/batch (POST)', () => {
    it('should accept batch events', () => {
      const batch = {
        events: [
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
        ],
      };

      return request(app.getHttpServer())
        .post('/api/v1/events/batch')
        .set('X-API-Key', 'test-api-key')
        .send(batch)
        .expect(202)
        .then((res) => {
          expect(res.body.count).toBe(2);
          expect(res.body.status).toBe('queued');
        });
    });
  });

  describe('/api/v1/events/query (GET)', () => {
    it('should query events', () => {
      return request(app.getHttpServer())
        .get('/api/v1/events/query?table=user_events&limit=10')
        .set('X-API-Key', 'test-api-key')
        .expect(200)
        .then((res) => {
          expect(res.body.events).toBeDefined();
          expect(res.body.total_count).toBeDefined();
        });
    });
  });
});
