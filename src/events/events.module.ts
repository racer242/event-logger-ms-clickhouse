import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { HealthController } from './health.controller';
import { EventsService } from './events.service';
import { EventSanitizer } from '../security/event-sanitizer';
import { QueueModule } from '../queue/queue.module';
import { ClickHouseDataModule } from '../clickhouse/clickhouse-data.module';

@Module({
  imports: [QueueModule, ClickHouseDataModule],
  controllers: [EventsController, HealthController],
  providers: [EventsService, EventSanitizer],
  exports: [EventsService],
})
export class EventsModule {}
