import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { EventSanitizer } from '../src/security/event-sanitizer';

describe('EventSanitizer', () => {
  let sanitizer: EventSanitizer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [EventSanitizer],
    }).compile();

    sanitizer = module.get<EventSanitizer>(EventSanitizer);
  });

  it('should be defined', () => {
    expect(sanitizer).toBeDefined();
  });

  it('should mask sensitive fields', () => {
    const payload = {
      name: 'John',
      phone: '+1234567890',
      email: 'john@example.com',
      age: 30,
    };

    const sanitized = sanitizer.sanitize(payload);

    expect(sanitized.name).toBe('John');
    expect(sanitized.phone).toBe('***MASKED***');
    expect(sanitized.email).toBe('***MASKED***');
    expect(sanitized.age).toBe(30);
  });

  it('should recursively sanitize nested objects', () => {
    const payload = {
      user: {
        name: 'John',
        phone: '+1234567890',
        credentials: {
          password: 'secret123',
          token: 'abc123',
        },
      },
    };

    const sanitized = sanitizer.sanitize(payload);

    expect(sanitized.user.name).toBe('John');
    expect(sanitized.user.phone).toBe('***MASKED***');
    expect(sanitized.user.credentials.password).toBe('***MASKED***');
    expect(sanitized.user.credentials.token).toBe('***MASKED***');
  });

  it('should hash IP address', () => {
    const ip = '192.168.1.1';
    const hash = sanitizer.hashIpAddress(ip);

    expect(hash).toBeDefined();
    expect(hash.length).toBe(16);
    expect(sanitizer.hashIpAddress(ip)).toBe(sanitizer.hashIpAddress(ip));
  });
});
