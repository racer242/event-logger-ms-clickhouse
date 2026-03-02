# Event Logger Microservice

Микросервис сбора и обработки событий (Event Logger) с использованием ClickHouse для хранения данных.

## Описание

Сервис предоставляет централизованный приём событий от всех компонентов платформы промо-портала, гарантирует доставку и сохранение событий, обеспечивает возможность аналитической обработки данных с высокой производительностью.

## Технологии

- **NestJS** - фреймворк для создания серверных приложений
- **ClickHouse** - колоночная СУБД для хранения событий
- **Swagger** - документация API
- **Docker** - контейнеризация приложения

## Быстрый старт

### Локальный запуск (требуется установленный ClickHouse)

```bash
# Установка зависимостей
npm install

# Копирование .env.example в .env
cp .env.example .env

# Запуск в режиме разработки
npm run start:dev

# Swagger доступен по адресу: http://localhost:3000/api/docs
```

При старте приложения в консоль выводится информационный баннер с конфигурацией:

```
+==============================================================================+
|                           EVENT LOGGER SERVICE                                |
|                           Version: 2.0 (ClickHouse)                          |
+==============================================================================+
|  APPLICATION STATUS:  [READY]                                                |
+==============================================================================+
|  SERVER CONFIGURATION                                                        |
|  ---------------------                                                       |
|  - Environment:        development                                           |
|  - Host:               localhost                                             |
|  - Port:               3000                                                  |
|  - Swagger:            Enabled (/api/docs)                                   |
+==============================================================================+
|  CLICKHOUSE CONNECTION                                                       |
|  -----------------------                                                     |
|  - Host:               localhost                                             |
|  - Port:               8123                                                  |
|  - User:               default                                               |
|  - Database:           event_logger                                          |
+==============================================================================+
|  BUFFER CONFIGURATION                                                        |
|  -----------------------                                                     |
|  - Max Buffer Size:    1000                                                  |
|  - Flush Interval:     5000 ms                                               |
+==============================================================================+
|  SECURITY                                                                    |
|  ----------                                                                  |
|  - API Keys Count:     2                                                     |
|  - Throttle Limit:     100 req/60s                                           |
+==============================================================================+
|  ENDPOINTS                                                                   |
|  -----------                                                                 |
|  - API:                http://localhost:3000/api/v1/events                   |
|  - Health:             http://localhost:3000/health                          |
|  - Swagger UI:         http://localhost:3000/api/docs                        |
+==============================================================================+
```

### Запуск через Docker Compose

```bash
# Запуск всех сервисов
docker-compose up -d

# Просмотр логов
docker-compose logs -f event-logger

# Остановка
docker-compose down
```

## Конфигурация (.env)

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `PORT` | Порт приложения | `3000` |
| `HOST` | Хост приложения | `localhost` |
| `CLICKHOUSE_HOST` | Хост ClickHouse | `localhost` |
| `CLICKHOUSE_PORT` | Порт ClickHouse (HTTP) | `8123` |
| `CLICKHOUSE_USER` | Пользователь ClickHouse | `default` |
| `CLICKHOUSE_PASSWORD` | Пароль ClickHouse | `` |
| `CLICKHOUSE_DATABASE` | База данных | `event_logger` |
| `CLICKHOUSE_MAX_CONNECTIONS` | Максимум подключений | `10` |
| `CLICKHOUSE_SKIP_HEALTH_CHECK` | **Отключить проверку БД при старте** (true/false) | `false` |
| `REDIS_ENABLED` | **Включить Redis** (true/false) | `false` |
| `REDIS_HOST` | Хост Redis | `localhost` |
| `REDIS_PORT` | Порт Redis | `6379` |
| `REDIS_PASSWORD` | Пароль Redis | `` |
| `QUEUE_PREFIX` | Префикс очереди | `event_logger` |
| `BUFFER_MAX_SIZE` | Максимальный размер буфера | `1000` |
| `BUFFER_FLUSH_INTERVAL_MS` | Интервал сброса буфера (мс) | `5000` |
| `API_KEYS` | Список API ключей через запятую | `dev-api-key-12345` |
| `SWAGGER_ENABLED` | Включить Swagger | `true` |

> **Примечание:** Установите `CLICKHOUSE_SKIP_HEALTH_CHECK=true`, чтобы приложение запускалось даже при недоступности ClickHouse. Это полезно для разработки или когда БД развёртывается отдельно.

> **Примечание:** Установите `REDIS_ENABLED=true`, чтобы использовать Redis для хранения очереди событий вместо памяти.

> **Примечание:** Установите `REDIS_SKIP_HEALTH_CHECK=true`, чтобы приложение запускалось даже при недоступности Redis (при включённом Redis).

## API Endpoints

### Приём событий

#### `POST /api/v1/events` - Приём одиночного события

```json
{
  "event_type": "activity.completed",
  "event_category": "activity",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
  "payload": {
    "result": "win",
    "reward_amount": 50
  },
  "device": {
    "type": "mobile",
    "os": "iOS 17.0",
    "browser": "Safari"
  }
}
```

#### `POST /api/v1/events/batch` - Приём пакетных событий

```json
{
  "events": [
    {
      "event_type": "activity.completed",
      "event_category": "activity",
      "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
      "payload": { "result": "win" }
    },
    {
      "event_type": "page.viewed",
      "event_category": "page_view",
      "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
      "payload": { "page": "/home" }
    }
  ]
}
```

#### `GET /api/v1/events/query` - Запрос событий

Параметры:
- `table` (required): `user_events`, `crm_events`, `system_events`
- `campaign_id` (optional): UUID кампании
- `event_type` (optional): Тип события
- `user_id` (optional): UUID пользователя
- `date_from`, `date_to` (optional): Временной диапазон
- `limit`, `offset` (optional): Пагинация

#### `POST /api/v1/events/export` - Экспорт данных

#### `DELETE /api/v1/users/{userId}/events` - Удаление данных пользователя (152-ФЗ)

### Health Check

#### `GET /health` - Проверка работоспособности

```json
{
  "status": "healthy",
  "checks": {
    "clickhouse": "ok",
    "queue": "ok",
    "cache": "ok"
  },
  "metrics": {
    "events_received_last_hour": 45000,
    "queue_depth": 150,
    "avg_processing_time_ms": 45
  }
}
```

## Таблицы ClickHouse

### user_events
Хранение событий деятельности пользователей (просмотр страниц, регистрация, участие в активностях, получение призов).

### crm_events
Хранение событий управления (администрирование, модерация, уведомления, интеграции).

### system_events
Хранение технических событий (ошибки, производительность, здоровье сервисов).

## Тесты

```bash
# Unit тесты
npm run test

# E2E тесты
npm run test:e2e

# Покрытие кода
npm run test:cov
```

## Структура проекта

```
src/
├── clickhouse/          # ClickHouse модуль и репозитории
│   ├── clickhouse.client.ts
│   ├── clickhouse.module.ts
│   ├── clickhouse.repository.ts
│   └── clickhouse-data.module.ts
├── config/              # Конфигурация приложения
│   ├── app.config.ts
│   ├── clickhouse.config.ts
│   ├── buffer.config.ts
│   ├── security.config.ts
│   └── config.module.ts
├── events/              # Events модуль
│   ├── dto/             # Data Transfer Objects
│   │   ├── create-event.dto.ts
│   │   ├── query-events.dto.ts
│   │   ├── export-events.dto.ts
│   │   └── responses.dto.ts
│   ├── events.controller.ts
│   ├── events.service.ts
│   ├── health.controller.ts
│   └── events.module.ts
├── queue/               # Очередь и буферизация
│   └── event-queue.service.ts
├── security/            # Безопасность
│   └── event-sanitizer.ts
├── app.module.ts
└── main.ts
```

## Безопасность

- Маскирование персональных данных (phone, email, passport, credit_card, password, token)
- API ключевая аутентификация через заголовок `X-API-Key`
- Throttling запросов (100 запросов в минуту по умолчанию)
- Удаление данных пользователя по запросу (152-ФЗ)

## Лицензия

UNLICENSED
