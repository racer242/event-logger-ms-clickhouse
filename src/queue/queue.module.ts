import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventQueueService } from './event-queue.service';
import { SqliteQueueRepository } from './sqlite-queue.repository';
import { ClickHouseDataModule } from '../clickhouse/clickhouse-data.module';

@Global()
@Module({
  imports: [ConfigModule, ClickHouseDataModule],
  providers: [EventQueueService, SqliteQueueRepository],
  exports: [EventQueueService],
})
export class QueueModule {}
