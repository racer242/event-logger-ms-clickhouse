import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { EventSanitizer } from '../security/event-sanitizer';

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

  describe('sanitize', () => {
    it('should pass through non-sensitive fields', () => {
      const payload = {
        name: 'John',
        age: 30,
        city: 'Moscow',
      };

      const sanitized = sanitizer.sanitize(payload);

      expect(sanitized.name).toBe('John');
      expect(sanitized.age).toBe(30);
      expect(sanitized.city).toBe('Moscow');
    });

    it('should mask phone field', () => {
      const payload = {
        name: 'John',
        phone: '+79001234567',
      };

      const sanitized = sanitizer.sanitize(payload);

      expect(sanitized.name).toBe('John');
      expect(sanitized.phone).toBe('***MASKED***');
    });

    it('should mask email field', () => {
      const payload = {
        name: 'John',
        email: 'john@example.com',
      };

      const sanitized = sanitizer.sanitize(payload);

      expect(sanitized.name).toBe('John');
      expect(sanitized.email).toBe('***MASKED***');
    });

    it('should mask passport field', () => {
      const payload = {
        name: 'John',
        passport: '1234 567890',
      };

      const sanitized = sanitizer.sanitize(payload);

      expect(sanitized.passport).toBe('***MASKED***');
    });

    it('should mask address field', () => {
      const payload = {
        name: 'John',
        address: '123 Main St, Moscow',
      };

      const sanitized = sanitizer.sanitize(payload);

      expect(sanitized.address).toBe('***MASKED***');
    });

    it('should mask credit_card field', () => {
      const payload = {
        name: 'John',
        credit_card: '1234-5678-9012-3456',
      };

      const sanitized = sanitizer.sanitize(payload);

      expect(sanitized.credit_card).toBe('***MASKED***');
    });

    it('should mask password field', () => {
      const payload = {
        username: 'john',
        password: 'secret123',
      };

      const sanitized = sanitizer.sanitize(payload);

      expect(sanitized.username).toBe('john');
      expect(sanitized.password).toBe('***MASKED***');
    });

    it('should mask token field', () => {
      const payload = {
        username: 'john',
        token: 'abc123xyz',
      };

      const sanitized = sanitizer.sanitize(payload);

      expect(sanitized.token).toBe('***MASKED***');
    });

    it('should recursively sanitize nested objects', () => {
      const payload = {
        user: {
          name: 'John',
          phone: '+79001234567',
          email: 'john@example.com',
        },
      };

      const sanitized = sanitizer.sanitize(payload);

      expect(sanitized.user.name).toBe('John');
      expect(sanitized.user.phone).toBe('***MASKED***');
      expect(sanitized.user.email).toBe('***MASKED***');
    });

    it('should sanitize deeply nested sensitive fields', () => {
      const payload = {
        user: {
          name: 'John',
          credentials: {
            password: 'secret123',
            token: 'abc123xyz',
            profile: {
              phone: '+79001234567',
              address: '123 Main St',
            },
          },
        },
      };

      const sanitized = sanitizer.sanitize(payload);

      expect(sanitized.user.credentials.password).toBe('***MASKED***');
      expect(sanitized.user.credentials.token).toBe('***MASKED***');
      expect(sanitized.user.credentials.profile.phone).toBe('***MASKED***');
      expect(sanitized.user.credentials.profile.address).toBe('***MASKED***');
    });

    it('should handle arrays with sensitive data', () => {
      const payload = {
        users: [
          { name: 'John', email: 'john@example.com' },
          { name: 'Jane', email: 'jane@example.com' },
        ],
      };

      const sanitized = sanitizer.sanitize(payload);

      expect(sanitized.users[0].name).toBe('John');
      expect(sanitized.users[0].email).toBe('***MASKED***');
      expect(sanitized.users[1].name).toBe('Jane');
      expect(sanitized.users[1].email).toBe('***MASKED***');
    });

    it('should handle empty payload', () => {
      const payload = {};

      const sanitized = sanitizer.sanitize(payload);

      expect(sanitized).toEqual({});
    });

    it('should handle null and undefined values', () => {
      const payload = {
        name: 'John',
        age: null,
        city: undefined,
      };

      const sanitized = sanitizer.sanitize(payload);

      expect(sanitized.name).toBe('John');
      expect(sanitized.age).toBeNull();
      expect(sanitized.city).toBeUndefined();
    });

    it('should match partial field names (case insensitive)', () => {
      const payload = {
        user_phone: '+79001234567',
        home_address: '123 Main St',
        credit_card_number: '1234-5678-9012-3456',
      };

      const sanitized = sanitizer.sanitize(payload);

      expect(sanitized.user_phone).toBe('***MASKED***');
      expect(sanitized.home_address).toBe('***MASKED***');
      expect(sanitized.credit_card_number).toBe('***MASKED***');
    });
  });

  describe('hashIpAddress', () => {
    it('should hash IP address to 16 character hex string', () => {
      const ip = '192.168.1.1';
      const hash = sanitizer.hashIpAddress(ip);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(16);
      expect(/^[0-9a-f]{16}$/.test(hash)).toBe(true);
    });

    it('should produce consistent hash for same IP', () => {
      const ip = '192.168.1.1';
      const hash1 = sanitizer.hashIpAddress(ip);
      const hash2 = sanitizer.hashIpAddress(ip);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different IPs', () => {
      const hash1 = sanitizer.hashIpAddress('192.168.1.1');
      const hash2 = sanitizer.hashIpAddress('192.168.1.2');

      expect(hash1).not.toBe(hash2);
    });

    it('should hash IPv6 address', () => {
      const ip = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
      const hash = sanitizer.hashIpAddress(ip);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(16);
    });

    it('should hash localhost addresses', () => {
      const hash1 = sanitizer.hashIpAddress('127.0.0.1');
      const hash2 = sanitizer.hashIpAddress('localhost');

      expect(hash1).toBeDefined();
      expect(hash2).toBeDefined();
      expect(hash1.length).toBe(16);
      expect(hash2.length).toBe(16);
    });
  });

  describe('sensitive fields list', () => {
    it('should mask fields containing "phone"', () => {
      const testCases = [
        { phone: '123' },
        { user_phone: '123' },
        { phoneNumber: '123' },
        { PHONE: '123' },
      ];

      for (const payload of testCases) {
        const sanitized = sanitizer.sanitize(payload);
        const value = Object.values(sanitized)[0];
        expect(value).toBe('***MASKED***');
      }
    });

    it('should mask fields containing "email"', () => {
      const testCases = [
        { email: 'test@test.com' },
        { user_email: 'test@test.com' },
        { emailAddress: 'test@test.com' },
        { EMAIL: 'test@test.com' },
      ];

      for (const payload of testCases) {
        const sanitized = sanitizer.sanitize(payload);
        const value = Object.values(sanitized)[0];
        expect(value).toBe('***MASKED***');
      }
    });
  });
});
