import { Module } from '@nestjs/common';
import { ClickHouseModule } from './clickhouse.module';
import { ClickHouseRepository } from './clickhouse.repository';

@Module({
  imports: [ClickHouseModule],
  providers: [ClickHouseRepository],
  exports: [ClickHouseRepository],
})
export class ClickHouseDataModule {}
