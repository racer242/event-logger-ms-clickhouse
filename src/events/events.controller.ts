import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Headers,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto, BatchEventsDto } from './dto/create-event.dto';
import { QueryEventsDto } from './dto/query-events.dto';
import { ExportEventsDto } from './dto/export-events.dto';

@ApiTags('Events')
@Controller('api/v1/events')
@ApiExtraModels()
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Приём одиночного события' })
  @ApiResponse({
    status: 202,
    description: 'Событие принято в обработку',
    schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', format: 'uuid' },
        status: { type: 'string', enum: ['queued', 'processing', 'completed'] },
        table: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Неверный формат события' })
  @ApiHeader({
    name: 'X-API-Key',
    required: true,
    description: 'API ключ отправителя',
  })
  createEvent(
    @Body() event: CreateEventDto,
    @Headers('x-api-key') apiKey: string,
  ) {
    this.logger.debug(`API Key: ${apiKey}`);
    return this.eventsService.createEvent(event);
  }

  @Post('batch')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Приём пакетных событий' })
  @ApiResponse({
    status: 202,
    description: 'События приняты в обработку',
    schema: {
      type: 'object',
      properties: {
        count: { type: 'number' },
        status: { type: 'string', enum: ['queued', 'processing'] },
        tables: { type: 'object', additionalProperties: { type: 'number' } },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Неверный формат событий' })
  @ApiHeader({
    name: 'X-API-Key',
    required: true,
    description: 'API ключ отправителя',
  })
  createBatchEvents(
    @Body() batchDto: BatchEventsDto,
    @Headers('x-api-key') apiKey: string,
  ) {
    this.logger.debug(`API Key: ${apiKey}`);
    return this.eventsService.createBatchEvents(batchDto.events);
  }

  @Get('query')
  @ApiOperation({ summary: 'Запрос событий с фильтрацией' })
  @ApiResponse({
    status: 200,
    description: 'События получены',
    schema: {
      type: 'object',
      properties: {
        events: { type: 'array', items: { type: 'object' } },
        total_count: { type: 'number' },
        has_more: { type: 'boolean' },
      },
    },
  })
  @ApiHeader({
    name: 'X-API-Key',
    required: true,
    description: 'API ключ отправителя',
  })
  queryEvents(
    @Query() query: QueryEventsDto,
    @Headers('x-api-key') apiKey: string,
  ) {
    this.logger.debug(`API Key: ${apiKey}`);
    return this.eventsService.queryEvents(query);
  }

  @Post('export')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Экспорт данных' })
  @ApiResponse({
    status: 202,
    description: 'Экспорт запущен',
    schema: {
      type: 'object',
      properties: {
        export_id: { type: 'string' },
        status: { type: 'string', enum: ['processing', 'completed', 'failed'] },
        estimated_completion: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiHeader({
    name: 'X-API-Key',
    required: true,
    description: 'API ключ отправителя',
  })
  exportEvents(
    @Body() exportDto: ExportEventsDto,
    @Headers('x-api-key') apiKey: string,
  ) {
    this.logger.debug(`API Key: ${apiKey}`);
    // TODO: Implement export functionality
    return {
      export_id: 'export-' + Date.now(),
      status: 'processing' as const,
      estimated_completion: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  }
}
