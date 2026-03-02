import { Module, Global, DynamicModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { REDIS_CLIENT, REDIS_ENABLED, REDIS_SKIP_HEALTH_CHECK } from './redis.constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_ENABLED,
      useFactory: (configService: ConfigService): boolean => {
        return configService.get<boolean>('redis.enabled', false);
      },
      inject: [ConfigService],
    },
    {
      provide: REDIS_SKIP_HEALTH_CHECK,
      useFactory: (configService: ConfigService): boolean => {
        return configService.get<boolean>('redis.skipHealthCheck', false);
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_ENABLED, REDIS_SKIP_HEALTH_CHECK],
})
export class RedisModule {
  static forRoot(): DynamicModule {
    return {
      module: RedisModule,
      global: true,
      imports: [
        CacheModule.registerAsync({
          isGlobal: true,
          useFactory: async (configService: ConfigService) => {
            const enabled = configService.get<boolean>('redis.enabled', false);
            const skipHealthCheck = configService.get<boolean>('redis.skipHealthCheck', false);

            if (!enabled) {
              // Return in-memory store if Redis is disabled
              return {
                ttl: 60000,
                max: 1000,
              };
            }

            const host = configService.get<string>('redis.host', 'localhost');
            const port = configService.get<number>('redis.port', 6379);
            const password = configService.get<string>('redis.password');

            try {
              // Return Redis store if enabled
              return {
                store: await redisStore({
                  url: `redis://${password ? password + '@' : ''}${host}:${port}`,
                  ttl: 60000,
                }),
              };
            } catch (error) {
              if (skipHealthCheck) {
                console.warn(
                  `Redis unavailable, but continuing due to REDIS_SKIP_HEALTH_CHECK=true. Error: ${error.message}`,
                );
                // Fallback to in-memory store
                return {
                  ttl: 60000,
                  max: 1000,
                };
              }
              throw error;
            }
          },
          inject: [ConfigService],
        }),
      ],
      providers: [
        {
          provide: REDIS_ENABLED,
          useFactory: (configService: ConfigService): boolean => {
            return configService.get<boolean>('redis.enabled', false);
          },
          inject: [ConfigService],
        },
        {
          provide: REDIS_SKIP_HEALTH_CHECK,
          useFactory: (configService: ConfigService): boolean => {
            return configService.get<boolean>('redis.skipHealthCheck', false);
          },
          inject: [ConfigService],
        },
      ],
      exports: [REDIS_ENABLED, REDIS_SKIP_HEALTH_CHECK],
    };
  }
}
