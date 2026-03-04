# Event Logger Microservice

Микросервис сбора и обработки событий (Event Logger) с использованием ClickHouse для хранения данных.

## Описание

Сервис предоставляет централизованный приём событий от всех компонентов платформы промо-портала, гарантирует доставку и сохранение событий, обеспечивает возможность аналитической обработки данных с высокой производительностью.

## Технологии

- **NestJS** - фреймворк для создания серверных приложений
- **ClickHouse** - колоночная СУБД для хранения событий
- **Redis** - очередь событий для гарантии доставки (опционально)
- **Swagger** - документация API
- **Docker** - контейнеризация приложения

## Работа с Redis

Сервис поддерживает **гибридный режим работы** с очередью событий:

### Режимы работы

#### 1. Redis режим (`REDIS_ENABLED=true`)

**Использование:** Для production и больших нагрузок.

**Принцип работы:**
```
Событие → API → Redis Queue → ClickHouse
```

**Преимущества:**
- ✅ **Гарантия доставки** — события не теряются при перезапуске сервиса
- ✅ **Восстановление** — при старте сервис забирает "хвост" из Redis
- ✅ **Масштабируемость** — несколько инстансов могут работать с одной очередью

**Структура данных в Redis:**
- `event_logger:queue` — очередь новых событий
- `event_logger:processing` — события в обработке (защита от потери)

**Алгоритм обработки:**
1. **Приём:** `LPUSH event_logger:queue <event>`
2. **Сброс (каждые 5 сек или 1000 событий):**
   - `LRANGE event_logger:queue 0 99` — забрать пачку
   - `LPUSH event_logger:processing <events>` — зафиксировать обработку
   - `LTRIM event_logger:queue 100 -1` — удалить из очереди
   - Запись в ClickHouse
   - `DEL event_logger:processing` — очистка после успешной записи
3. **Восстановление после сбоя:**
   - При старте: `LRANGE event_logger:queue 0 -1`
   - Отправка всех "зависших" событий в ClickHouse

#### 2. In-memory режим (`REDIS_ENABLED=false`, по умолчанию)

**Использование:** Для разработки и небольших нагрузок.

**Принцип работы:**
```
Событие → API → Memory Buffer → ClickHouse
```

**Преимущества:**
- ✅ **Быстрее** — нет накладных расходов на Redis
- ✅ **Проще** — не нужен дополнительный сервис

**Недостатки:**
- ❌ **Теряется при рестарте** — события в буфере теряются при перезапуске

### Конфигурация

```env
# Redis Configuration (Optional)
REDIS_ENABLED=false           # Включить Redis (true/false)
REDIS_HOST=localhost          # Хост Redis
REDIS_PORT=6379               # Порт Redis
REDIS_PASSWORD=               # Пароль Redis
QUEUE_PREFIX=event_logger     # Префикс ключей Redis
```

### Когда включать Redis?

| Сценарий | Рекомендуемый режим |
|----------|---------------------|
| Разработка | `REDIS_ENABLED=false` |
| Тестирование | `REDIS_ENABLED=false` |
| Production (малая нагрузка) | `REDIS_ENABLED=false` |
| Production (средняя/высокая нагрузка) | `REDIS_ENABLED=true` |
| Критична гарантия доставки | `REDIS_ENABLED=true` |

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

## События

### user_events - События пользователей

| Событие | Категория | Описание | Обязательные поля |
|---------|-----------|----------|-------------------|
| `registration.completed` | registration | Завершение регистрации пользователя | `campaign_id`, `user_id` |
| `activity.completed` | activity | Завершение активности (рулетка, квиз) | `campaign_id` |
| `activity.started` | activity | Начало активности | `campaign_id` |
| `prize.claimed` | prize_electronic, prize_physical | Получение приза | `campaign_id` |
| `page.viewed` | page_view | Просмотр страницы | `campaign_id` |
| `receipt.registered` | receipt | Регистрация чека | `campaign_id` |
| `code.registered` | code | Регистрация кода продукта | `campaign_id` |

**Поля событий user_events:**

| Поле | Тип | Обязательное | Описание |
|------|-----|--------------|----------|
| `event_type` | string | ✅ | Тип события (например, `activity.completed`) |
| `event_category` | string | ✅ | Категория события (`activity`, `registration`, `prize_electronic`) |
| `timestamp` | string | ✅ | **Время события (ISO 8601, например, `2026-03-02T12:00:00.000Z`)** |
| `campaign_id` | UUID | ✅ | ID кампании (требуется для партиционирования) |
| `user_id` | UUID | ❌ | ID пользователя |
| `session_id` | UUID | ❌ | ID сессии |
| `subcampaign_id` | UUID | ❌ | ID подкампании |
| `activity_id` | UUID | ❌ | ID активности |
| `payload` | object | ❌ | Дополнительные данные события |
| `result_status` | string | ❌ | Статус: `success`, `failed`, `abandoned` |
| `reward_amount` | number | ❌ | Сумма награды |
| `reward_type` | string | ❌ | Тип награды: `points`, `promo_code`, `money` |
| `device` | object | ❌ | Информация об устройстве: `{type, os, browser}` |

### crm_events - CRM события

| Событие | Категория | Описание | Обязательные поля |
|---------|-----------|----------|-------------------|
| `admin.user.created` | admin_user | Создание пользователя администратором | `admin_id` |
| `admin.user.updated` | admin_user | Обновление данных пользователя | `admin_id` |
| `moderation.submission.approved` | moderation | Одобрение заявки модератором | `moderator_id`, `submission_id` |
| `moderation.submission.rejected` | moderation | Отклонение заявки модератором | `moderator_id`, `submission_id` |
| `notification.sent` | notification | Отправка уведомления пользователю | - |
| `integration.api.call` | integration | Вызов внешнего API | - |
| `security.login.failed` | security | Неудачная попытка входа | - |

**Поля событий crm_events:**

| Поле | Тип | Обязательное | Описание |
|------|-----|--------------|----------|
| `event_type` | string | ✅ | Тип события (например, `moderation.submission.approved`) |
| `event_category` | string | ✅ | Категория (`admin_user`, `moderation`, `notification`) |
| `timestamp` | string | ✅ | **Время события (ISO 8601)** |
| `admin_id` | UUID | ❌ | ID администратора |
| `moderator_id` | UUID | ❌ | ID модератора |
| `submission_id` | UUID | ❌ | ID заявки на модерацию |
| `campaign_id` | UUID | ❌ | ID кампании |
| `payload` | object | ❌ | Дополнительные данные |
| `result_status` | string | ❌ | Результат: `success`, `failed`, `pending` |

### system_events - Системные события

| Событие | Категория | Описание | Обязательные поля |
|---------|-----------|----------|-------------------|
| `system.error.api` | error_api | Ошибка внешнего API | `error_code`, `error_message` |
| `system.error.db` | error_db | Ошибка базы данных | `error_code`, `error_message` |
| `system.error.timeout` | error_timeout | Таймаут операции | `error_code`, `error_message` |
| `system.performance.metrics` | performance | Метрики производительности | `service_name` |
| `system.health.check` | health | Проверка здоровья сервиса | `service_name` |

**Поля событий system_events:**

| Поле | Тип | Обязательное | Описание |
|------|-----|--------------|----------|
| `event_type` | string | ✅ | Тип события (например, `system.error.api`) |
| `event_category` | string | ✅ | Категория (`error_api`, `performance`, `health`) |
| `severity` | string | ❌ | Критичность: `critical`, `high`, `medium`, `low`, `info` |
| `service_name` | string | ✅ | Название сервиса |
| `timestamp` | string | ✅ | **Время события (ISO 8601)** |
| `error_code` | string | ❌ | Код ошибки |
| `error_message` | string | ❌ | Сообщение об ошибке |
| `stack_trace` | string | ❌ | Трассировка стека |
| `duration_ms` | number | ❌ | Длительность операции (мс) |
| `memory_mb` | number | ❌ | Использование памяти (МБ) |
| `cpu_percent` | number | ❌ | Использование CPU (%) |
| `campaign_id` | UUID | ❌ | ID кампании (для контекста) |
| `user_id` | UUID | ❌ | ID пользователя (для контекста) |

## API Endpoints

### Приём событий

#### `POST /api/v1/events` - Приём одиночного события

```json
{
  "event_type": "activity.completed",
  "event_category": "activity",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
  "timestamp": "2026-03-02T12:00:00.000Z",
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
      "timestamp": "2026-03-02T12:00:00.000Z",
      "payload": { "result": "win" }
    },
    {
      "event_type": "page.viewed",
      "event_category": "page_view",
      "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
      "timestamp": "2026-03-02T12:00:05.000Z",
      "payload": { "page": "/home" }
    }
  ]
}
```

### Примеры отправки событий

#### user_events - События пользователей

```bash
# Регистрация пользователя
curl -X POST http://localhost:3000/api/v1/events \
  -H "X-API-Key: dev-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "registration.completed",
    "event_category": "registration",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
    "timestamp": "2026-03-02T12:00:00.000Z",
    "payload": { "registration_method": "phone" }
  }'

# Участие в активности
curl -X POST http://localhost:3000/api/v1/events \
  -H "X-API-Key: dev-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "activity.completed",
    "event_category": "activity",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
    "activity_id": "550e8400-e29b-41d4-a716-446655440010",
    "timestamp": "2026-03-02T12:05:00.000Z",
    "payload": { "result": "win", "reward_amount": 50 },
    "device": { "type": "mobile", "os": "iOS 17.0", "browser": "Safari" }
  }'

# Получение приза
curl -X POST http://localhost:3000/api/v1/events \
  -H "X-API-Key: dev-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "prize.claimed",
    "event_category": "prize_electronic",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
    "timestamp": "2026-03-02T12:10:00.000Z",
    "payload": { "prize_type": "promo_code", "prize_value": "PROMO2024" }
  }'
```

#### crm_events - CRM события

```bash
# Действие администратора
curl -X POST http://localhost:3000/api/v1/events \
  -H "X-API-Key: dev-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "admin.user.created",
    "event_category": "admin_user",
    "admin_id": "550e8400-e29b-41d4-a716-446655440100",
    "timestamp": "2026-03-02T12:15:00.000Z",
    "payload": { "user_id": "550e8400-e29b-41d4-a716-446655440000", "role": "moderator" }
  }'

# Модерация заявки
curl -X POST http://localhost:3000/api/v1/events \
  -H "X-API-Key: dev-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "moderation.submission.approved",
    "event_category": "moderation",
    "moderator_id": "550e8400-e29b-41d4-a716-446655440100",
    "submission_id": "550e8400-e29b-41d4-a716-446655440200",
    "timestamp": "2026-03-02T12:20:00.000Z",
    "payload": { "submission_type": "prize_claim" }
  }'

# Уведомление пользователю
curl -X POST http://localhost:3000/api/v1/events \
  -H "X-API-Key: dev-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "notification.sent",
    "event_category": "notification",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-03-02T12:25:00.000Z",
    "payload": { "channel": "email", "template": "welcome" }
  }'
```

#### system_events - Системные события

```bash
# Ошибка API
curl -X POST http://localhost:3000/api/v1/events \
  -H "X-API-Key: dev-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "system.error.api",
    "event_category": "error_api",
    "severity": "high",
    "service_name": "activity-service",
    "timestamp": "2026-03-02T12:30:00.000Z",
    "error_code": "API_TIMEOUT",
    "error_message": "External API timeout after 30s",
    "stack_trace": "Error: Timeout at..."
  }'

# Метрики производительности
curl -X POST http://localhost:3000/api/v1/events \
  -H "X-API-Key: dev-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "system.performance.metrics",
    "event_category": "system.performance",
    "severity": "info",
    "service_name": "event-logger",
    "timestamp": "2026-03-02T12:35:00.000Z",
    "duration_ms": 150,
    "memory_mb": 256,
    "cpu_percent": 45.5
  }'

# Проверка здоровья
curl -X POST http://localhost:3000/api/v1/events \
  -H "X-API-Key: dev-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "system.health.check",
    "event_category": "system.health",
    "severity": "info",
    "service_name": "event-logger",
    "timestamp": "2026-03-02T12:40:00.000Z"
  }'
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

| Поле | Тип | Описание |
|------|-----|----------|
| `event_id` | UUID | Уникальный идентификатор события |
| `timestamp` | DateTime64(3) | Время события |
| `event_date` | Date | Дата события |
| `event_month` | String | Месяц события (для TTL) |
| `user_id` | Nullable(UUID) | ID пользователя |
| `session_id` | Nullable(UUID) | ID сессии |
| `campaign_id` | UUID | ID кампании |
| `subcampaign_id` | Nullable(UUID) | ID подкампании |
| `portal_id` | Nullable(UUID) | ID портала |
| `activity_id` | Nullable(UUID) | ID активности |
| `event_type` | LowCardinality(String) | Тип события |
| `event_category` | LowCardinality(String) | Категория события |
| `user_cycle_stage` | LowCardinality(String) | Этап цикла пользователя |
| `payload` | String | JSON с данными события |
| `result_status` | Nullable(String) | Статус результата (success/failed/abandoned) |
| `reward_amount` | Nullable(UInt32) | Сумма награды |
| `reward_type` | Nullable(String) | Тип награды |
| `device_type` | LowCardinality(String) | Тип устройства |
| `device_os` | LowCardinality(String) | ОС устройства |
| `device_browser` | LowCardinality(String) | Браузер устройства |
| `ip_address` | IPv4 | IP-адрес |
| `user_agent` | String | User-Agent строка |
| `source` | LowCardinality(String) | Источник события (client/server) |
| `service_name` | LowCardinality(String) | Название сервиса |
| `instance_id` | String | ID экземпляра сервиса |
| `received_at` | DateTime64(3) | Время получения события |
| `processed_at` | DateTime64(3) | Время обработки события |

**Параметры таблицы:**
- **ENGINE:** MergeTree()
- **PARTITION BY:** campaign_id (партиционирование по кампании)
- **ORDER BY:** (campaign_id, event_type, timestamp)
- **PRIMARY KEY:** (campaign_id, event_type, timestamp)
- **TTL:** toDateTime(timestamp) + INTERVAL 3 YEAR (удаление данных старше 3 лет)
- **SETTINGS:** index_granularity = 8192

### crm_events

Хранение событий управления (администрирование, модерация, уведомления, интеграции).

| Поле | Тип | Описание |
|------|-----|----------|
| `event_id` | UUID | Уникальный идентификатор события |
| `timestamp` | DateTime64(3) | Время события |
| `event_date` | Date | Дата события |
| `event_month` | String | Месяц события (для TTL) |
| `user_id` | Nullable(UUID) | ID пользователя |
| `admin_id` | Nullable(UUID) | ID администратора |
| `moderator_id` | Nullable(UUID) | ID модератора |
| `campaign_id` | Nullable(UUID) | ID кампании |
| `subcampaign_id` | Nullable(UUID) | ID подкампании |
| `portal_id` | Nullable(UUID) | ID портала |
| `activity_id` | Nullable(UUID) | ID активности |
| `prize_id` | Nullable(UUID) | ID приза |
| `submission_id` | Nullable(UUID) | ID заявки |
| `event_type` | LowCardinality(String) | Тип события |
| `event_category` | LowCardinality(String) | Категория события |
| `resource_type` | LowCardinality(String) | Тип ресурса |
| `payload` | String | JSON с данными события |
| `action_result` | LowCardinality(String) | Результат действия |
| `changes_before` | Nullable(String) | JSON данных до изменений |
| `changes_after` | Nullable(String) | JSON данных после изменений |
| `ip_address` | IPv4 | IP-адрес |
| `user_agent` | String | User-Agent строка |
| `source` | LowCardinality(String) | Источник события |
| `service_name` | LowCardinality(String) | Название сервиса |
| `instance_id` | String | ID экземпляра сервиса |
| `received_at` | DateTime64(3) | Время получения события |
| `processed_at` | DateTime64(3) | Время обработки события |

**Параметры таблицы:**
- **ENGINE:** MergeTree()
- **PARTITION BY:** toYYYYMM(timestamp) (партиционирование по месяцам)
- **ORDER BY:** (event_category, event_type, timestamp)
- **PRIMARY KEY:** (event_category, event_type, timestamp)
- **TTL:** toDateTime(timestamp) + INTERVAL 3 YEAR (удаление данных старше 3 лет)
- **SETTINGS:** index_granularity = 8192

### system_events

Хранение технических событий (ошибки, производительность, здоровье сервисов).

| Поле | Тип | Описание |
|------|-----|----------|
| `event_id` | UUID | Уникальный идентификатор события |
| `timestamp` | DateTime64(3) | Время события |
| `event_date` | Date | Дата события |
| `event_month` | String | Месяц события (для TTL) |
| `event_type` | LowCardinality(String) | Тип события |
| `event_category` | LowCardinality(String) | Категория события |
| `severity` | LowCardinality(String) | Критичность (critical/high/medium/low/info) |
| `error_code` | Nullable(String) | Код ошибки |
| `error_message` | Nullable(String) | Сообщение об ошибке |
| `stack_trace` | Nullable(String) | Трассировка стека |
| `service_name` | LowCardinality(String) | Название сервиса |
| `instance_id` | String | ID экземпляра сервиса |
| `host_name` | String | Имя хоста |
| `operation_type` | Nullable(String) | Тип операции |
| `resource_type` | Nullable(String) | Тип ресурса |
| `resource_id` | Nullable(UUID) | ID ресурса |
| `campaign_id` | Nullable(UUID) | ID кампании |
| `user_id` | Nullable(UUID) | ID пользователя |
| `duration_ms` | Nullable(UInt32) | Длительность в мс |
| `memory_mb` | Nullable(UInt32) | Использование памяти (МБ) |
| `cpu_percent` | Nullable(Float32) | Использование CPU (%) |
| `payload` | String | JSON с данными события |
| `source` | LowCardinality(String) | Источник события |
| `received_at` | DateTime64(3) | Время получения события |
| `processed_at` | DateTime64(3) | Время обработки события |

**Параметры таблицы:**
- **ENGINE:** MergeTree()
- **PARTITION BY:** toYYYYMM(timestamp) (партиционирование по месяцам)
- **ORDER BY:** (severity, event_category, timestamp)
- **PRIMARY KEY:** (severity, event_category, timestamp)
- **TTL:** toDateTime(timestamp) + INTERVAL 1 YEAR (удаление данных старше 1 года)
- **SETTINGS:** index_granularity = 8192

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
│   ├── api-key.middleware.ts
│   ├── event-sanitizer.ts
│   └── security.module.ts
├── app.module.ts
└── main.ts
```

## Безопасность

### API ключи

Для доступа к API требуется передача API ключа в заголовке запроса:

```bash
# Пример запроса с API ключом
curl -X POST http://localhost:3000/api/v1/events \
  -H "X-API-Key: dev-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{"event_type": "activity.completed", ...}'
```

**Настройка API ключей в .env:**

```bash
API_KEYS=dev-api-key-12345,prod-api-key-67890
API_KEY_HEADER=X-API-Key
```

> **Примечание:** Если `API_KEYS` не указан, все запросы пропускаются без проверки (режим разработки).

### Другие меры безопасности

- Маскирование персональных данных (phone, email, passport, credit_card, password, token)
- Throttling запросов (100 запросов в минуту по умолчанию)
- Удаление данных пользователя по запросу (152-ФЗ)

## Лицензия

UNLICENSED
