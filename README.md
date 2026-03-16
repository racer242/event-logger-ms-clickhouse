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

## Архитектура данных

Сервис хранит события в трёх таблицах ClickHouse:

| Таблица         | Назначение                                                                                           | Срок хранения |
| --------------- | ---------------------------------------------------------------------------------------------------- | ------------- |
| `user_events`   | События активности пользователей (регистрация, авторизация, участие в активностях, получение призов) | 3 года        |
| `crm_events`    | CRM-события (действия администраторов, модерация, уведомления)                                       | 3 года        |
| `system_events` | Системные события (ошибки, метрики производительности, health check)                                 | 1 год         |

**Партиционирование:** все таблицы партиционируются по `event_month` (YYYYMM).

**Общие обязательные поля для всех таблиц:**

- `client_id` — ID клиента (агентство может иметь несколько клиентов)
- `campaign_id` — ID кампании
- `timestamp` — время события (DateTime64(3, 'UTC'))
- `session_id` — ID сессии
- `event_type` — тип события (формат: `category.subcategory.details`)
- `source` — источник события (название компонента/модуля)
- `criticality` — критичность события (`low`, `medium`, `high`)

## Работа с Redis

Сервис поддерживает **гибридный режим работы** с очередью событий:

### Режимы работы очереди

#### 1. SQLite режим (`QUEUE_TYPE=sqlite`, по умолчанию)

**Использование:** Для production и гарантии доставки событий.

**Принцип работы:**

```
Событие → API → SQLite Queue → ClickHouse
```

**Преимущества:**

- ✅ **Гарантия доставки** — события не теряются при перезапуске сервиса
- ✅ **Восстановление** — при старте сервис обрабатывает "зависшие" события
- ✅ **Персистентность** — данные сохраняются на диске
- ✅ **Простота** — не нужен дополнительный сервис (Redis)
- ✅ **Масштабируемость** — каждый инстанс имеет свою очередь

**Структура данных:**

- Файл БД: `data/events.db`
- Таблица: `event_queue`
- Статусы: `pending`, `processing`, `completed`, `failed`

**Алгоритм обработки:**

1. **Приём:** `INSERT INTO event_queue (event_id, event_data, table_name, status)`
2. **Сброс (каждые 5 сек или 100 событий):**
   - Выборка пачки `pending` событий
   - Пометка как `processing`
   - Запись в ClickHouse
   - Пометка как `completed`
3. **Восстановление после сбоя:**
   - При старте: выборка всех `pending` и `processing`
   - Повторная отправка в ClickHouse

#### 2. In-memory режим (`QUEUE_TYPE=memory`)

**Использование:** Для разработки и небольших нагрузок.

**Принцип работы:**

```
Событие → API → Memory Buffer → ClickHouse
```

**Преимущества:**

- ✅ **Быстрее** — нет накладных расходов на БД
- ✅ **Проще** — нет внешних зависимостей

**Недостатки:**

- ❌ **Теряется при рестарте** — события в буфере теряются при перезапуске

#### 3. Redis режим (`QUEUE_TYPE=redis`, `REDIS_ENABLED=true`)

**Использование:** Для распределённых систем с несколькими инстансами.

**Принцип работы:**

```
Событие → API → Redis Queue → ClickHouse
```

**Преимущества:**

- ✅ **Распределённая очередь** — несколько инстансов работают с одной очередью
- ✅ **Гарантия доставки** — события не теряются при перезапуске

**Недостатки:**

- ❌ **Нужен Redis** — дополнительная зависимость
- ❌ **Сложнее настройка** — нужен отдельный сервис

### Конфигурация

```env
# Queue Configuration
QUEUE_TYPE=sqlite              # sqlite, memory, redis
SQLITE_ENABLED=true
SQLITE_DB_PATH=data/events.db
QUEUE_FLUSH_INTERVAL_MS=5000   # Интервал обработки очереди (мс)
QUEUE_BATCH_SIZE=100           # Максимум событий за одну обработку

# Redis Configuration (Optional)
REDIS_ENABLED=false
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
QUEUE_PREFIX=event_logger
REDIS_SKIP_HEALTH_CHECK=false
```

> **Примечание:** По умолчанию используется SQLite очередь. Установите `QUEUE_TYPE=memory` для in-memory режима или `QUEUE_TYPE=redis` + `REDIS_ENABLED=true` для Redis.

### Когда использовать разные режимы?

| Сценарий                              | Рекомендуемый режим             |
| ------------------------------------- | ------------------------------- |
| Разработка                            | `QUEUE_TYPE=sqlite`             |
| Тестирование                          | `QUEUE_TYPE=memory`             |
| Production (один инстанс)             | `QUEUE_TYPE=sqlite`             |
| Production (несколько инстансов)      | `QUEUE_TYPE=redis`              |
| Критична гарантия доставки            | `QUEUE_TYPE=sqlite` или `redis` |
| Production (средняя/высокая нагрузка) | `REDIS_ENABLED=true`            |
| Критична гарантия доставки            | `REDIS_ENABLED=true`            |

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

| Переменная                         | Описание                                          | По умолчанию        |
| ---------------------------------- | ------------------------------------------------- | ------------------- |
| `PORT`                             | Порт приложения                                   | `3000`              |
| `HOST`                             | Хост приложения                                   | `localhost`         |
| `CLICKHOUSE_HOST`                  | Хост ClickHouse                                   | `localhost`         |
| `CLICKHOUSE_PORT`                  | Порт ClickHouse (HTTP)                            | `8123`              |
| `CLICKHOUSE_USER`                  | Пользователь ClickHouse                           | `default`           |
| `CLICKHOUSE_PASSWORD`              | Пароль ClickHouse                                 | ``                  |
| `CLICKHOUSE_DATABASE`              | База данных                                       | `event_logger`      |
| `CLICKHOUSE_MAX_CONNECTIONS`       | Максимум подключений                              | `10`                |
| `CLICKHOUSE_SKIP_HEALTH_CHECK`     | **Отключить проверку БД при старте** (true/false) | `false`             |
| `CLICKHOUSE_ASYNC_INSERT`          | **Асинхронная вставка** (0/1)                     | `0`                 |
| `CLICKHOUSE_WAIT_FOR_ASYNC_INSERT` | **Ожидание асинхронной вставки** (0/1)            | `0`                 |
| `REDIS_ENABLED`                    | **Включить Redis** (true/false)                   | `false`             |
| `REDIS_HOST`                       | Хост Redis                                        | `localhost`         |
| `REDIS_PORT`                       | Порт Redis                                        | `6379`              |
| `REDIS_PASSWORD`                   | Пароль Redis                                      | ``                  |
| `QUEUE_PREFIX`                     | Префикс очереди                                   | `event_logger`      |
| `BUFFER_MAX_SIZE`                  | Максимальный размер буфера                        | `1000`              |
| `BUFFER_FLUSH_INTERVAL_MS`         | Интервал сброса буфера (мс)                       | `5000`              |
| `API_KEYS`                         | Список API ключей через запятую                   | `dev-api-key-12345` |
| `SWAGGER_ENABLED`                  | Включить Swagger                                  | `true`              |

> **Примечание:** Установите `CLICKHOUSE_SKIP_HEALTH_CHECK=true`, чтобы приложение запускалось даже при недоступности ClickHouse. Это полезно для разработки или когда БД развёртывается отдельно.

> **Примечание:** Установите `REDIS_ENABLED=true`, чтобы использовать Redis для хранения очереди событий вместо памяти.

> **Примечание:** Установите `REDIS_SKIP_HEALTH_CHECK=true`, чтобы приложение запускалось даже при недоступности Redis (при включённом Redis).

## События

### Обязательные поля для всех событий

| Поле          | Тип    | Описание                                                       |
| ------------- | ------ | -------------------------------------------------------------- |
| `client_id`   | string | ID клиента (агентство может иметь несколько клиентов)          |
| `campaign_id` | string | ID кампании                                                    |
| `timestamp`   | string | Время события (ISO 8601, например, `2026-03-02T12:00:00.000Z`) |
| `session_id`  | string | ID сессии                                                      |
| `event_type`  | string | Тип события (формат: `category.subcategory.details`)           |
| `source`      | string | Источник события (название сервиса)                            |
| `criticality` | string | Критичность: `low`, `medium`, `high`                           |

### user_events — События пользователей

**Специфичные поля:**

| Поле             | Тип    | Обязательное | Описание               |
| ---------------- | ------ | ------------ | ---------------------- |
| `portal_id`      | string | ✅           | Портал-источник        |
| `bot_id`         | string | ✅           | Чат-бот-источник       |
| `subcampaign_id` | UUID   | ❌           | ID подкампании         |
| `user_id`        | UUID   | ❌           | ID пользователя        |
| `user_utm`       | string | ❌           | UTM-метка пользователя |
| `crm_user_id`    | UUID   | ❌           | ID пользователя CRM    |
| `receipt_id`     | UUID   | ❌           | ID чека                |
| `code`           | string | ❌           | Код продукта           |
| `activity_id`    | UUID   | ❌           | ID активности          |
| `prize_id`       | UUID   | ❌           | ID приза               |
| `payload`        | object | ❌           | Дополнительные данные  |

**Примеры event_type:**

- `registration.start`, `registration.complete`, `registration.error`
- `auth.start`, `auth.complete`, `auth.failed`
- `activity.start`, `activity.complete`, `activity.abandon`
- `prize.claim`, `prize.issue`, `prize.ship`
- `page_view.open`, `page_view.leave`
- `content_interaction.click`, `content_interaction.share`
- `feedback.send`, `feedback.rate`, `feedback.complaint` — Отправка обратной связи (требуется `message_id`)

### crm_events — CRM события

**Специфичные поля:**

| Поле             | Тип    | Обязательное | Описание                                        |
| ---------------- | ------ | ------------ | ----------------------------------------------- |
| `crm_user_id`    | UUID   | ✅           | ID пользователя CRM                             |
| `entity_type`    | string | ✅           | Тип сущности CRM (user, campaign, prize, etc.)  |
| `entity_id`      | string | ✅           | ID сущности CRM                                 |
| `action_type`    | string | ✅           | Тип действия (create, update, delete, moderate) |
| `subcampaign_id` | UUID   | ❌           | ID подкампании                                  |
| `payload`        | object | ❌           | Дополнительные данные                           |

**Примеры event_type:**

- `admin.user.create`, `admin.user.update`, `admin.user.block`
- `moderation.submission.approve`, `moderation.submission.reject`
- `notification.send`, `notification.email`, `notification.sms`
- `integration.api.call`, `integration.export`
- `security.login.fail`, `security.permission.deny`

### system_events — Системные события

**Специфичные поля:**

| Поле             | Тип    | Обязательное | Описание                                |
| ---------------- | ------ | ------------ | --------------------------------------- |
| `instance_id`    | string | ✅           | ID инстанса сервиса                     |
| `error_code`     | string | ✅           | Код события (default: `'none'`)         |
| `severity`       | string | ✅           | Важность: `warning`, `error`, `failure` |
| `subcampaign_id` | string | ❌           | ID подкампании                          |
| `host_name`      | string | ❌           | Хост источника                          |
| `payload`        | object | ❌           | Дополнительные данные                   |

**Примеры event_type:**

- `system.error.api`, `system.error.db`, `system.error.timeout`
- `system.performance.metrics`, `system.performance.slow`
- `system.health.check`, `system.health.degraded`
- `system.deploy.start`, `system.deploy.complete`

## API Endpoints

### Приём событий

#### `POST /api/v1/events` - Приём одиночного события

**Пример user_events:**

```json
{
  "client_id": "client-001",
  "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
  "session_id": "sess-12345-abcde",
  "portal_id": "portal-main",
  "bot_id": "bot-none",
  "timestamp": "2026-03-02T12:00:00.000Z",
  "event_type": "activity.complete",
  "source": "activity-service",
  "criticality": "medium",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "activity_id": "550e8400-e29b-41d4-a716-446655440010",
  "payload": {
    "result": "win",
    "reward_amount": 50
  }
}
```

**Пример crm_events:**

```json
{
  "client_id": "client-001",
  "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
  "session_id": "sess-admin-001",
  "timestamp": "2026-03-02T12:00:00.000Z",
  "event_type": "admin.user.create",
  "source": "admin-service",
  "criticality": "high",
  "crm_user_id": "550e8400-e29b-41d4-a716-446655440100",
  "entity_type": "user",
  "entity_id": "550e8400-e29b-41d4-a716-446655440000",
  "action_type": "create",
  "payload": {
    "role": "moderator"
  }
}
```

**Пример system_events:**

```json
{
  "client_id": "client-001",
  "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
  "session_id": "sess-system-001",
  "timestamp": "2026-03-02T12:00:00.000Z",
  "event_type": "system.error.api",
  "source": "api-gateway",
  "criticality": "high",
  "severity": "error",
  "instance_id": "instance-prod-01",
  "error_code": "API_TIMEOUT",
  "host_name": "api-server-01.example.com",
  "payload": {
    "message": "External API timeout after 30s",
    "duration_ms": 30000
  }
}
```

#### `POST /api/v1/events/batch` - Приём пакетных событий

```json
{
  "events": [
    {
      "client_id": "client-001",
      "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
      "session_id": "sess-12345-abcde",
      "portal_id": "portal-main",
      "bot_id": "bot-none",
      "timestamp": "2026-03-02T12:00:00.000Z",
      "event_type": "page_view.open",
      "source": "portal-frontend",
      "criticality": "low"
    },
    {
      "client_id": "client-001",
      "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
      "session_id": "sess-12345-abcde",
      "portal_id": "portal-main",
      "bot_id": "bot-none",
      "timestamp": "2026-03-02T12:00:05.000Z",
      "event_type": "activity.start",
      "source": "activity-service",
      "criticality": "low",
      "user_id": "550e8400-e29b-41d4-a716-446655440000",
      "activity_id": "550e8400-e29b-41d4-a716-446655440010"
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
    "client_id": "client-001",
    "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
    "session_id": "sess-user-001",
    "portal_id": "portal-main",
    "bot_id": "bot-none",
    "timestamp": "2026-03-02T12:00:00.000Z",
    "event_type": "registration.complete",
    "source": "auth-service",
    "criticality": "high",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "payload": { "registration_method": "phone" }
  }'

# Участие в активности
curl -X POST http://localhost:3000/api/v1/events \
  -H "X-API-Key: dev-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "client-001",
    "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
    "session_id": "sess-user-001",
    "portal_id": "portal-main",
    "bot_id": "bot-none",
    "timestamp": "2026-03-02T12:05:00.000Z",
    "event_type": "activity.complete",
    "source": "activity-service",
    "criticality": "medium",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "activity_id": "550e8400-e29b-41d4-a716-446655440010",
    "payload": { "result": "win", "reward_amount": 50 }
  }'

# Просмотр страницы
curl -X POST http://localhost:3000/api/v1/events \
  -H "X-API-Key: dev-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "client-001",
    "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
    "session_id": "sess-user-001",
    "portal_id": "portal-main",
    "bot_id": "bot-none",
    "timestamp": "2026-03-02T12:10:00.000Z",
    "event_type": "page_view.open",
    "source": "portal-frontend",
    "criticality": "low",
    "payload": { "page": "/campaign/main" }
  }'

# Отправка обратной связи
curl -X POST http://localhost:3000/api/v1/events \
  -H "X-API-Key: dev-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "client-001",
    "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
    "session_id": "sess-user-001",
    "portal_id": "portal-main",
    "bot_id": "bot-none",
    "timestamp": "2026-03-02T12:15:00.000Z",
    "event_type": "feedback.send",
    "source": "feedback-service",
    "criticality": "medium",
    "message_id": "550e8400-e29b-41d4-a716-446655440050",
    "payload": { "rating": 5, "comment": "Отличный сервис!" }
  }'
```

#### crm_events - CRM события

```bash
# Действие администратора
curl -X POST http://localhost:3000/api/v1/events \
  -H "X-API-Key: dev-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "client-001",
    "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
    "session_id": "sess-admin-001",
    "timestamp": "2026-03-02T12:15:00.000Z",
    "event_type": "admin.user.create",
    "source": "admin-service",
    "criticality": "high",
    "crm_user_id": "550e8400-e29b-41d4-a716-446655440100",
    "entity_type": "user",
    "entity_id": "550e8400-e29b-41d4-a716-446655440000",
    "action_type": "create",
    "payload": { "role": "moderator" }
  }'

# Модерация заявки
curl -X POST http://localhost:3000/api/v1/events \
  -H "X-API-Key: dev-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "client-001",
    "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
    "session_id": "sess-moderator-001",
    "timestamp": "2026-03-02T12:20:00.000Z",
    "event_type": "moderation.submission.approve",
    "source": "moderation-service",
    "criticality": "high",
    "crm_user_id": "550e8400-e29b-41d4-a716-446655440100",
    "entity_type": "submission",
    "entity_id": "550e8400-e29b-41d4-a716-446655440200",
    "action_type": "approve",
    "payload": { "submission_type": "prize_claim" }
  }'

# Уведомление пользователю
curl -X POST http://localhost:3000/api/v1/events \
  -H "X-API-Key: dev-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "client-001",
    "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
    "session_id": "sess-notification-001",
    "timestamp": "2026-03-02T12:25:00.000Z",
    "event_type": "notification.send",
    "source": "notification-service",
    "criticality": "medium",
    "crm_user_id": "550e8400-e29b-41d4-a716-446655440000",
    "entity_type": "user",
    "entity_id": "550e8400-e29b-41d4-a716-446655440000",
    "action_type": "notify",
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
    "client_id": "client-001",
    "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
    "session_id": "sess-system-001",
    "timestamp": "2026-03-02T12:30:00.000Z",
    "event_type": "system.error.api",
    "source": "api-gateway",
    "criticality": "high",
    "severity": "error",
    "instance_id": "instance-prod-01",
    "error_code": "API_TIMEOUT",
    "host_name": "api-server-01.example.com",
    "payload": {
      "message": "External API timeout after 30s",
      "duration_ms": 30000
    }
  }'

# Метрики производительности
curl -X POST http://localhost:3000/api/v1/events \
  -H "X-API-Key: dev-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "client-001",
    "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
    "session_id": "sess-system-001",
    "timestamp": "2026-03-02T12:35:00.000Z",
    "event_type": "system.performance.metrics",
    "source": "event-logger",
    "criticality": "low",
    "severity": "warning",
    "instance_id": "instance-prod-01",
    "error_code": "none",
    "payload": {
      "duration_ms": 150,
      "memory_mb": 256,
      "cpu_percent": 45.5
    }
  }'

# Проверка здоровья
curl -X POST http://localhost:3000/api/v1/events \
  -H "X-API-Key: dev-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "client-001",
    "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
    "session_id": "sess-system-001",
    "timestamp": "2026-03-02T12:40:00.000Z",
    "event_type": "system.health.check",
    "source": "event-logger",
    "criticality": "low",
    "severity": "warning",
    "instance_id": "instance-prod-01",
    "error_code": "none"
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

| Поле             | Тип                    | Обязательное | Описание                                        |
| ---------------- | ---------------------- | ------------ | ----------------------------------------------- |
| `event_id`       | UUID                   | ✅ (auto)    | Уникальный идентификатор события                |
| `client_id`      | LowCardinality(String) | ✅           | ID клиента                                      |
| `campaign_id`    | LowCardinality(String) | ✅           | ID кампании                                     |
| `subcampaign_id` | LowCardinality(String) | ❌           | ID подкампании (default: `'main'`)              |
| `timestamp`      | DateTime64(3, 'UTC')   | ✅           | Время события                                   |
| `portal_id`      | LowCardinality(String) | ✅           | Портал-источник события (default: `'unknown'`)  |
| `bot_id`         | LowCardinality(String) | ✅           | Чат-бот-источник события (default: `'unknown'`) |
| `session_id`     | String                 | ✅           | ID сессии пользователя                          |
| `user_id`        | Nullable(UUID)         | ❌           | ID пользователя-участника                       |
| `user_utm`       | Nullable(String)       | ❌           | UTM-метка пользователя                          |
| `crm_user_id`    | Nullable(UUID)         | ❌           | ID пользователя CRM                             |
| `receipt_id`     | Nullable(UUID)         | ❌           | ID чека                                         |
| `code`           | Nullable(String)       | ❌           | Код продукта                                    |
| `activity_id`    | Nullable(UUID)         | ❌           | ID активности                                   |
| `prize_id`       | Nullable(UUID)         | ❌           | ID приза                                        |
| `message_id`     | Nullable(UUID)         | ❌           | ID сообщения (для обратной связи)               |
| `event_type`     | LowCardinality(String) | ✅           | Тип события (например, `registration.complete`) |
| `source`         | LowCardinality(String) | ✅           | Источник события (название сервиса)             |
| `criticality`    | LowCardinality(String) | ✅           | Критичность: `low`, `medium`, `high`            |
| `payload`        | Object('json')         | ❌           | Дополнительные данные (JSON)                    |
| `event_date`     | Date                   | ✅ (auto)    | Дата события (автоматически)                    |
| `event_month`    | String                 | ✅ (auto)    | Месяц события (YYYYMM, для партиционирования)   |
| `event_hour`     | UInt8                  | ✅ (auto)    | Час события (0-23)                              |

**Параметры таблицы:**

- **ENGINE:** MergeTree()
- **PARTITION BY:** `event_month`
- **ORDER BY:** `(campaign_id, event_type, timestamp, event_id)`
- **PRIMARY KEY:** `(campaign_id, event_type, timestamp)`
- **TTL:** `toDateTime(timestamp) + INTERVAL 3 YEAR`
- **SETTINGS:** `index_granularity = 8192, allow_experimental_object_type = 1`

**Индексы:**

- `idx_user_id` — Bloom filter на `user_id`
- `idx_session_id` — Bloom filter на `session_id`
- `idx_activity_id` — Bloom filter на `activity_id`
- `idx_prize_id` — Bloom filter на `prize_id`
- `idx_receipt_id` — Bloom filter на `receipt_id`
- `idx_message_id` — Bloom filter на `message_id`
- `idx_timestamp_minmax` — MinMax на `timestamp`

### crm_events

Хранение событий управления (администрирование, модерация, уведомления, интеграции).

| Поле             | Тип                    | Обязательное | Описание                             |
| ---------------- | ---------------------- | ------------ | ------------------------------------ |
| `event_id`       | UUID                   | ✅ (auto)    | Уникальный идентификатор события     |
| `client_id`      | LowCardinality(String) | ✅           | ID клиента                           |
| `campaign_id`    | LowCardinality(String) | ✅           | ID кампании                          |
| `subcampaign_id` | LowCardinality(String) | ❌           | ID подкампании (default: `'main'`)   |
| `timestamp`      | DateTime64(3, 'UTC')   | ✅           | Время события                        |
| `session_id`     | String                 | ✅           | ID сессии                            |
| `crm_user_id`    | UUID                   | ✅           | ID пользователя CRM                  |
| `entity_type`    | LowCardinality(String) | ✅           | Тип сущности CRM                     |
| `entity_id`      | String                 | ✅           | ID сущности CRM                      |
| `action_type`    | LowCardinality(String) | ✅           | Тип действия над сущностью           |
| `event_type`     | LowCardinality(String) | ✅           | Тип события                          |
| `source`         | LowCardinality(String) | ✅           | Источник события                     |
| `criticality`    | LowCardinality(String) | ✅           | Критичность: `low`, `medium`, `high` |
| `payload`        | Object('json')         | ❌           | Дополнительные данные (JSON)         |
| `event_date`     | Date                   | ✅ (auto)    | Дата события                         |
| `event_month`    | String                 | ✅ (auto)    | Месяц события (YYYYMM)               |
| `event_hour`     | UInt8                  | ✅ (auto)    | Час события (0-23)                   |

**Параметры таблицы:**

- **ENGINE:** MergeTree()
- **PARTITION BY:** `event_month`
- **ORDER BY:** `(event_type, timestamp, event_id)`
- **PRIMARY KEY:** `(event_type, timestamp)`
- **TTL:** `toDateTime(timestamp) + INTERVAL 3 YEAR`
- **SETTINGS:** `index_granularity = 8192, allow_experimental_object_type = 1`

**Индексы:**

- `idx_crm_user` — Bloom filter на `crm_user_id`
- `idx_entity_type` — Bloom filter на `entity_type`
- `idx_entity_id` — Bloom filter на `entity_id`
- `idx_campaign` — Bloom filter на `campaign_id`
- `idx_session_id` — Bloom filter на `session_id`
- `idx_action_id` — Bloom filter на `action_type`

### system_events

Хранение технических событий (ошибки, производительность, здоровье сервисов).

| Поле             | Тип                    | Обязательное | Описание                                |
| ---------------- | ---------------------- | ------------ | --------------------------------------- |
| `event_id`       | UUID                   | ✅ (auto)    | Уникальный идентификатор события        |
| `client_id`      | LowCardinality(String) | ✅           | ID клиента                              |
| `campaign_id`    | LowCardinality(String) | ✅           | ID кампании                             |
| `subcampaign_id` | LowCardinality(String) | ❌           | ID подкампании (default: `'unknown'`)   |
| `timestamp`      | DateTime64(3, 'UTC')   | ✅           | Время события                           |
| `instance_id`    | LowCardinality(String) | ✅           | ID инстанса источника                   |
| `host_name`      | Nullable(String)       | ❌           | Хост источника                          |
| `error_code`     | LowCardinality(String) | ✅           | Код события (default: `'none'`)         |
| `event_type`     | LowCardinality(String) | ✅           | Тип события                             |
| `source`         | LowCardinality(String) | ✅           | Источник события                        |
| `criticality`    | LowCardinality(String) | ✅           | Критичность: `low`, `medium`, `high`    |
| `severity`       | LowCardinality(String) | ✅           | Важность: `warning`, `error`, `failure` |
| `payload`        | Object('json')         | ❌           | Дополнительные данные (JSON)            |
| `event_date`     | Date                   | ✅ (auto)    | Дата события                            |
| `event_month`    | String                 | ✅ (auto)    | Месяц события (YYYYMM)                  |
| `event_hour`     | UInt8                  | ✅ (auto)    | Час события (0-23)                      |

**Параметры таблицы:**

- **ENGINE:** MergeTree()
- **PARTITION BY:** `event_month`
- **ORDER BY:** `(severity, event_type, timestamp, event_id)`
- **PRIMARY KEY:** `(severity, event_type, timestamp)`
- **TTL:** `toDateTime(timestamp) + INTERVAL 1 YEAR`
- **SETTINGS:** `index_granularity = 8192, allow_experimental_object_type = 1`

**Индексы:**

- `idx_instance` — Bloom filter на `instance_id`
- `idx_severity` — Bloom filter на `severity`
- `idx_error_code` — Bloom filter на `error_code`
- `idx_session_id` — Bloom filter на `session_id`
- `idx_campaign` — Bloom filter на `campaign_id`

## Известные проблемы и несоответствия

### Несоответствия между DTO и SQL схемами (требуют внимания)

| Проблема | Описание                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------ |
| ⚠️       | В SQL `user_events.session_id String NOT NULL` (без default), но в DTO нет валидации на обязательность |

> **Примечание:** Рекомендуется добавить валидацию `@IsString()` для поля `session_id` в `UserEventDto` и `CrmEventDto`.

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
