import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable CORS
  app.enableCors();

  // Swagger setup
  const swaggerEnabled = configService.get<boolean>('swagger.enabled', true);
  const swaggerPath = configService.get<string>('swagger.path', '/api/docs');

  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Event Logger API')
      .setDescription(
        'Микросервис сбора и обработки событий (Event Logger) с использованием ClickHouse',
      )
      .setVersion('2.0')
      .addTag('events', 'Операции с событиями')
      .addTag('health', 'Проверка работоспособности')
      .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'API-Key')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(swaggerPath, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });

    logger.log(
      `Swagger available at: http://localhost:${configService.get('app.port')}${swaggerPath}`,
    );
  }

  const port = configService.get<number>('app.port', 3000);
  const host = configService.get<string>('app.host', '0.0.0.0');

  await app.listen(port, host);

  // Print startup banner with configuration
  printStartupBanner(configService, logger);
}

/**
 * Вывод информации о конфигурации сервиса при старте
 */
function printStartupBanner(configService: ConfigService, logger: Logger) {
  const nodeEnv = configService.get<string>('app.nodeEnv', 'development');
  const port = configService.get<number>('app.port', 3000);
  const host = configService.get<string>('app.host', '0.0.0.0');

  // ClickHouse config
  const clickhouseConfig = configService.get('clickhouse');
  const clickHouseUrl = clickhouseConfig?.url || 'http://localhost:8123';
  const clickHouseUser = configService.get<string>(
    'clickhouse.user',
    'default',
  );
  const clickHouseDatabase = configService.get<string>(
    'clickhouse.database',
    'event_logger',
  );
  const clickHouseSkipHealthCheck = configService.get<boolean>(
    'clickhouse.skipHealthCheck',
    false,
  );

  // Redis config
  const redisEnabled = configService.get<boolean>('redis.enabled', false);
  const redisHost = configService.get<string>('redis.host', 'localhost');
  const redisPort = configService.get<number>('redis.port', 6379);
  const redisSkipHealthCheck = configService.get<boolean>(
    'redis.skipHealthCheck',
    false,
  );

  // Buffer config
  const bufferMaxSize = configService.get<number>('buffer.maxSize', 1000);
  const bufferFlushInterval = configService.get<number>(
    'buffer.flushIntervalMs',
    5000,
  );

  // Queue config
  const queueType = configService.get<string>('queue.type', 'sqlite');
  const sqliteEnabled = configService.get<boolean>(
    'queue.sqlite.enabled',
    true,
  );
  const sqliteDbPath = configService.get<string>(
    'queue.sqlite.dbPath',
    'data/events.db',
  );
  const queueFlushInterval = configService.get<number>(
    'queue.flushIntervalMs',
    5000,
  );
  const queueBatchSize = configService.get<number>('queue.batchSize', 100);

  // Security config
  const apiKeys = configService.get<string>('security.apiKeys', '');
  const apiKeyCount = apiKeys
    ? String(apiKeys).split(',').filter(Boolean).length
    : 0;

  // Throttle config
  const throttleTtl = configService.get<number>('throttle.ttl', 60);
  const throttleLimit = configService.get<number>('throttle.limit', 100);

  // Swagger config
  const swaggerEnabled = configService.get<boolean>('swagger.enabled', true);
  const swaggerPath = configService.get<string>('swagger.path', '/api/docs');

  const pad = (str: string, len: number) => str.padEnd(len, ' ');

  const banner = `
+==============================================================================+
|                           EVENT LOGGER SERVICE                               |
|                           Version: 2.0 (ClickHouse)                          |
+==============================================================================+
|  APPLICATION STATUS:  [READY]                                                |
+==============================================================================+
|  SERVER CONFIGURATION                                                        |
|  ---------------------                                                       |
|  - Environment:        ${pad(nodeEnv, 54)}|
|  - Host:               ${pad(host, 54)}|
|  - Port:               ${pad(String(port), 54)}|
|  - Swagger:            ${pad(swaggerEnabled ? 'Enabled (' + swaggerPath + ')' : 'Disabled', 54)}|
+==============================================================================+
|  CLICKHOUSE CONNECTION                                                       |
|  -----------------------                                                     |
|  - URL:                ${pad(clickHouseUrl, 54)}|
|  - User:               ${pad(clickHouseUser, 54)}|
|  - Database:           ${pad(clickHouseDatabase, 54)}|
|  - Skip Health Check:  ${pad(String(clickHouseSkipHealthCheck), 54)}|
+==============================================================================+
|  REDIS CONFIGURATION                                                         |
|  ---------------------                                                       |
|  - Enabled:            ${pad(String(redisEnabled), 54)}|
|  - Host:               ${pad(redisEnabled ? redisHost : 'N/A (in-memory)', 54)}|
|  - Port:               ${pad(redisEnabled ? String(redisPort) : 'N/A (in-memory)', 54)}|
|  - Skip Health Check:  ${pad(String(redisSkipHealthCheck), 54)}|
+==============================================================================+
|  BUFFER CONFIGURATION                                                        |
|  -----------------------                                                     |
|  - Max Buffer Size:    ${pad(String(bufferMaxSize), 54)}|
|  - Flush Interval:     ${pad(String(bufferFlushInterval) + ' ms', 54)}|
+==============================================================================+
|  QUEUE CONFIGURATION (SQLite)                                                |
|  ---------------------------                                                 |
|  - Type:                 ${pad(queueType.toUpperCase(), 52)}|
|  - Flush Interval:       ${pad(String(queueFlushInterval) + ' ms', 52)}|
|  - Batch Size:           ${pad(String(queueBatchSize), 52)}|
+==============================================================================+
|  SECURITY                                                                    |
|  ----------                                                                  |
|  - API Keys Count:     ${pad(String(apiKeyCount), 54)}|
|  - Throttle Limit:     ${pad(throttleLimit + ' req/' + throttleTtl + 's', 54)}|
+==============================================================================+
|  ENDPOINTS                                                                   |
|  -----------                                                                 |
|  - API:                ${pad('http://' + host + ':' + port + '/api/v1/events', 54)}|
|  - Health:             ${pad('http://' + host + ':' + port + '/health', 54)}|
|  - Swagger UI:         ${pad('http://' + host + ':' + port + swaggerPath, 54)}|
+==============================================================================+
`;

  logger.log(banner);
}

bootstrap();
