import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiKeyMiddleware } from './api-key.middleware';
import { EventSanitizer } from './event-sanitizer';

@Module({
  imports: [ConfigModule],
  providers: [ApiKeyMiddleware, EventSanitizer],
  exports: [ApiKeyMiddleware, EventSanitizer],
})
export class SecurityModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ApiKeyMiddleware)
      .forRoutes({ path: 'api/v1/*path', method: RequestMethod.ALL });
  }
}
