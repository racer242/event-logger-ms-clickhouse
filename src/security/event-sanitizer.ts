import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

@Injectable()
export class EventSanitizer {
  private readonly sensitiveFields = [
    'phone',
    'email',
    'passport',
    'address',
    'credit_card',
    'password',
    'token',
  ];

  sanitize(payload: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (this.sensitiveFields.some((f) => key.toLowerCase().includes(f))) {
        sanitized[key] = '***MASKED***';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitize(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  hashIpAddress(ip: string): string {
    return createHash('sha256').update(ip).digest('hex').substring(0, 16);
  }
}
