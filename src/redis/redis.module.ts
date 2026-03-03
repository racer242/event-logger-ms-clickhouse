import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_ENABLED',
      useFactory: (configService: ConfigService): boolean => {
        return configService.get<boolean>('redis.enabled', false);
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_ENABLED'],
})
export class RedisModule {}
