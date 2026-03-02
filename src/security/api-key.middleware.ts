import { Injectable, NestMiddleware, UnauthorizedException, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ApiKeyMiddleware.name);
  private readonly apiKeys: string[];
  private readonly apiKeyHeader: string;

  constructor(private readonly configService: ConfigService) {
    const apiKeysConfig = this.configService.get<string>('security.apiKeys', '');
    this.apiKeys = apiKeysConfig ? apiKeysConfig.split(',').filter(Boolean) : [];
    this.apiKeyHeader = this.configService.get<string>('security.apiKeyHeader', 'X-API-Key');
  }

  use(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.headers[this.apiKeyHeader.toLowerCase()];

    // Если API ключи не настроены, пропускаем все запросы
    if (this.apiKeys.length === 0) {
      this.logger.warn('API keys not configured, allowing all requests');
      return next();
    }

    if (!apiKey) {
      this.logger.debug(`Missing API key in header: ${this.apiKeyHeader}`);
      throw new UnauthorizedException('Missing API key');
    }

    if (!this.apiKeys.includes(apiKey as string)) {
      this.logger.debug(`Invalid API key: ${apiKey}`);
      throw new UnauthorizedException('Invalid API key');
    }

    this.logger.debug(`API key validated: ${apiKey}`);
    next();
  }
}
