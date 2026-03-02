import { Module, Global, DynamicModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClickHouseClientType, createClickHouseClient } from './clickhouse.client';
import { CLICKHOUSE_CLIENT } from './clickhouse.constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: CLICKHOUSE_CLIENT,
      useFactory: (configService: ConfigService): ClickHouseClientType => {
        const clickhouseConfig = configService.get('clickhouse');
        return createClickHouseClient({
          url: clickhouseConfig.url,
          user: clickhouseConfig.user,
          password: clickhouseConfig.password,
          database: clickhouseConfig.database,
          maxConnections: clickhouseConfig.maxConnections,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [CLICKHOUSE_CLIENT],
})
export class ClickHouseModule {
  static forRoot(config?: Partial<ClickHouseClientType>): DynamicModule {
    return {
      module: ClickHouseModule,
      global: true,
      providers: [
        {
          provide: CLICKHOUSE_CLIENT,
          useValue: config,
        },
      ],
      exports: [CLICKHOUSE_CLIENT],
    };
  }
}
