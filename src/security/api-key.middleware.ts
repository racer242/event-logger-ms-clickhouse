import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  private readonly apiKeys: string[];
  private readonly apiKeyHeader: string;

  constructor(private readonly configService: ConfigService) {
    // Читаем API ключи из переменной окружения напрямую
    const apiKeysEnv = this.configService.get<string>('API_KEYS', '');
    this.apiKeys = apiKeysEnv
      ? String(apiKeysEnv).split(',').filter(Boolean)
      : [];
    this.apiKeyHeader = this.configService.get<string>(
      'API_KEY_HEADER',
      'X-API-Key',
    );
  }

  use(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.headers[this.apiKeyHeader.toLowerCase()];

    // Если API ключи не настроены, пропускаем все запросы
    if (this.apiKeys.length === 0) {
      return next();
    }

    if (!apiKey) {
      throw new UnauthorizedException('Missing API key');
    }

    if (!this.apiKeys.includes(apiKey as string)) {
      throw new UnauthorizedException('Invalid API key');
    }

    next();
  }
}
