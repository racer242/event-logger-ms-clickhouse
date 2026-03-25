import {
  Controller,
  Get,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { RedisQueueRepository } from '../queue/redis-queue.repository';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly redisRepo: RedisQueueRepository,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Проверка работоспособности сервиса' })
  @ApiResponse({
    status: 200,
    description: 'Сервис работает нормально',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
        checks: {
          type: 'object',
          additionalProperties: { type: 'string', enum: ['ok', 'error'] },
        },
        metrics: {
          type: 'object',
          properties: {
            events_received_last_hour: { type: 'number' },
            queue_depth: { type: 'number' },
            avg_processing_time_ms: { type: 'number' },
          },
        },
      },
    },
  })
  async healthCheck() {
    const health = await this.eventsService.getHealthStatus();

    // Добавляем проверку Redis если включён
    const queueType = process.env.QUEUE_TYPE || 'sqlite';
    if (queueType === 'redis') {
      const redisHealthy = await this.redisRepo.healthCheck();
      (health.checks as any).redis = redisHealthy ? 'ok' : 'error';
      if (!redisHealthy) {
        health.status = 'degraded';
      }
    }

    return health;
  }

  @Delete('api/v1/users/:userId/events')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Удаление данных пользователя (152-ФЗ)',
    description:
      'Удаляет все события пользователя из базы данных для соответствия Федеральному закону №152-ФЗ "О персональных данных"',
  })
  @ApiResponse({
    status: 200,
    description: 'Данные пользователя удалены',
    schema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'number',
          example: 12345,
        },
        tables_affected: {
          type: 'array',
          items: { type: 'string' },
          example: ['user_events', 'crm_events'],
        },
        status: { type: 'string', example: 'completed' },
        completed_at: { type: 'string', format: 'date-time' },
      },
    },
  })
  async deleteUserEvents(@Param('userId') userId: string) {
    await this.eventsService.deleteUserEvents(userId);
    return {
      user_id: userId,
      tables_affected: ['user_events', 'crm_events'],
      status: 'completed',
      completed_at: new Date().toISOString(),
    };
  }
}
