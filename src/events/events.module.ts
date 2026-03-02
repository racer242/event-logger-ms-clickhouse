import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { HealthController } from './health.controller';
import { EventsService } from './events.service';
import { EventQueueService } from '../queue/event-queue.service';
import { EventSanitizer } from '../security/event-sanitizer';
import { ClickHouseDataModule } from '../clickhouse/clickhouse-data.module';

@Module({
  imports: [ClickHouseDataModule],
  controllers: [EventsController, HealthController],
  providers: [EventsService, EventQueueService, EventSanitizer],
  exports: [EventsService],
})
export class EventsModule {}
