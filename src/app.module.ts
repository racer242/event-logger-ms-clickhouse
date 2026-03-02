import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventsModule } from './events/events.module';
import { ClickHouseModule } from './clickhouse/clickhouse.module';
import { ClickHouseDataModule } from './clickhouse/clickhouse-data.module';
import { RedisModule } from './redis/redis.module';
import { SecurityModule } from './security/security.module';
import appConfig from './config/app.config';
import clickhouseConfig from './config/clickhouse.config';
import bufferConfig from './config/buffer.config';
import securityConfig from './config/security.config';
import throttleConfig from './config/throttle.config';
import redisConfig from './config/redis.config';

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
    RedisModule.forRoot(),
    ClickHouseModule,
    ClickHouseDataModule,
    EventsModule,
    SecurityModule,
  ],
})
export class AppModule {}
