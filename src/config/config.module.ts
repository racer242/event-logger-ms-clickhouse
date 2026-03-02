import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import appConfig from './app.config';
import clickhouseConfig from './clickhouse.config';
import bufferConfig from './buffer.config';
import securityConfig from './security.config';
import throttleConfig from './throttle.config';
import redisConfig from './redis.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, clickhouseConfig, bufferConfig, securityConfig, throttleConfig, redisConfig],
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
  ],
})
export class AppConfigModule {}
