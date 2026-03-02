# Техническое задание: Микросервис Event Logger

**Версия:** 2.0 (ClickHouse)  
**Дата:** 24.02.2026  
**Статус:** На согласовании  
**Проект:** Промо-портал — Система управления лояльностью

---

## 1. Общие сведения

### 1.1. Назначение документа
Настоящий документ описывает функциональные и технические требования к сервису сбора и обработки событий (Event Logger) с использованием СУБД ClickHouse для хранения данных. Документ определяет архитектуру хранения событий по категориям (CRM, System, User Activity).

### 1.2. Область применения
Требования распространяются на функциональность сбора, валидации, обработки, хранения и предоставления доступа к событиям, генерируемым всеми компонентами платформы промо-портала.

### 1.3. Цели сервиса
- Централизованный приём событий от всех источников системы
- Гарантия доставки и сохранения значимых событий
- Обеспечение возможности аналитической обработки данных с высокой производительностью
- Поддержка аудита и соответствия регуляторным требованиям
- Разделение событий по категориям для оптимизации хранения и запросов

---

## 2. Функциональные требования

### 2.1. Приём событий

| ID | Требование | Описание | Приоритет |
|----|-----------|----------|-----------|
| FR-01 | Приём одиночных событий | Система должна принимать события по одному через стандартизированный интерфейс | Высокий |
| FR-02 | Приём пакетных событий | Система должна принимать события пакетами для повышения эффективности передачи | Высокий |
| FR-03 | Валидация структуры события | Система должна проверять соответствие входящих событий утверждённой схеме данных | Высокий |
| FR-04 | Обогащение событий метаданными | Система должна автоматически добавлять к событиям системные метаданные (источник, время приёма, идентификатор сессии) | Средний |
| FR-05 | Подтверждение приёма | Система должна возвращать подтверждение о принятии события в обработку | Высокий |
| FR-06 | Маршрутизация по категории | Система должна направлять события в соответствующую таблицу ClickHouse на основе категории события | Высокий |

### 2.2. Обработка событий

| ID | Требование | Описание | Приоритет |
|----|-----------|----------|-----------|
| FR-07 | Асинхронная обработка | Система должна обрабатывать события асинхронно, не блокируя отправителя | Высокий |
| FR-08 | Буферизация при пиковых нагрузках | Система должна обеспечивать буферизацию событий при превышении нормальной нагрузки | Высокий |
| FR-09 | Пакетная запись в хранилище | Система должна записывать события в ClickHouse пакетами для оптимизации производительности | Высокий |
| FR-10 | Обработка дубликатов | Система должна идентифицировать и обрабатывать потенциальные дубликаты событий | Средний |
| FR-11 | Приоритизация событий | Система должна поддерживать обработку событий с разным приоритетом (высокий/средний/низкий) | Средний |

### 2.3. Хранение данных (ClickHouse)

| ID | Требование | Описание | Приоритет |
|----|-----------|----------|-----------|
| FR-12 | Разделение таблиц по категориям | Система должна хранить события в трёх отдельных таблицах: user_events, crm_events, system_events | Высокий |
| FR-13 | Долгосрочное хранение событий | Система должна обеспечивать хранение событий в течение установленного срока (по умолчанию 3 года) | Высокий |
| FR-14 | Партиционирование по времени | Система должна поддерживать партиционирование данных по месяцам для оптимизации доступа | Высокий |
| FR-15 | Архивация исторических данных | Система должна поддерживать перемещение старых данных в архивное хранилище (S3 Cold) | Средний |
| FR-16 | Удаление данных по запросу | Система должна обеспечивать удаление данных конкретного пользователя по запросу в соответствии с регуляторными требованиями | Высокий |
| FR-17 | Резервное копирование | Система должна поддерживать механизм резервного копирования данных с возможностью восстановления | Высокий |

### 2.4. Доступ к данным и аналитика

| ID | Требование | Описание | Приоритет |
|----|-----------|----------|-----------|
| FR-18 | Запрос событий по фильтрам | Система должна предоставлять возможность запроса событий с фильтрацией по параметрам (период, тип события, кампания, пользователь) | Высокий |
| FR-19 | Агрегация метрик | Система должна поддерживать предрасчёт агрегированных метрик (ежедневные сводки, воронки конверсии) | Средний |
| FR-20 | Экспорт данных | Система должна предоставлять возможность экспорта данных в стандартных форматах (CSV, JSON) | Средний |
| FR-21 | API для внешних потребителей | Система должна предоставлять стандартизированный интерфейс для доступа к данным аналитическим системам | Высокий |

### 2.5. Управление и мониторинг

| ID | Требование | Описание | Приоритет |
|----|-----------|----------|-----------|
| FR-22 | Проверка работоспособности | Система должна предоставлять интерфейс для проверки своего состояния и состояния зависимостей | Высокий |
| FR-23 | Логирование операций | Система должна фиксировать все значимые операции для целей аудита и отладки | Высокий |
| FR-24 | Метрики производительности | Система должна предоставлять метрики для мониторинга производительности и загрузки | Высокий |
| FR-25 | Алертинг при аномалиях | Система должна поддерживать генерацию уведомлений при обнаружении аномального поведения | Средний |

### 2.6. Безопасность и соответствие

| ID | Требование | Описание | Приоритет |
|----|-----------|----------|-----------|
| FR-26 | Аутентификация отправителей | Система должна проверять подлинность источников событий | Высокий |
| FR-27 | Авторизация доступа к данным | Система должна контролировать доступ к данным в соответствии с ролевой моделью | Высокий |
| FR-28 | Маскирование персональных данных | Система должна обеспечивать маскирование или псевдонимизацию персональных данных в событиях | Высокий |
| FR-29 | Аудит доступа к данным | Система должна фиксировать все обращения к персональным данным для целей соответствия регуляторным требованиям | Высокий |
| FR-30 | Шифрование данных при передаче | Система должна обеспечивать защиту данных при передаче по сети | Высокий |

---

## 3. Модель данных (ClickHouse)

### 3.1. Таблица 1: User Activity Events

**Назначение:** Хранение всех событий деятельности пользователей (этапы 1-6 пользовательского цикла согласно *«Аналитической модели»*).

```sql
CREATE TABLE event_logger.user_events
(
    event_id UUID DEFAULT generateUUIDv4(),
    timestamp DateTime64(3, 'UTC') DEFAULT now64(3),
    event_date Date DEFAULT toDate(timestamp),
    event_month String DEFAULT toYYYYMM(timestamp),
    
    -- Идентификаторы
    user_id Nullable(UUID),
    session_id Nullable(UUID),
    campaign_id UUID,
    subcampaign_id Nullable(UUID),
    portal_id Nullable(UUID),
    activity_id Nullable(UUID),
    
    -- Классификация
    event_type LowCardinality(String),
    event_category LowCardinality(String),  -- registration, activity, prize, etc.
    user_cycle_stage LowCardinality(String),  -- ознакомление, регистрация, покупка, активность, приз, возврат
    
    -- Данные события
    payload String,  -- JSON-строка
    result_status Nullable(LowCardinality(String)),  -- success, failed, abandoned
    reward_amount Nullable(UInt32),
    reward_type Nullable(LowCardinality(String)),
    
    -- Контекст устройства
    device_type LowCardinality(String),
    device_os LowCardinality(String),
    device_browser LowCardinality(String),
    ip_address IPv4,
    user_agent String,
    
    -- Системные метаданные
    source LowCardinality(String),  -- client, server
    service_name LowCardinality(String),
    instance_id String,
    received_at DateTime64(3, 'UTC') DEFAULT now64(3),
    processed_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree()
PARTITION BY event_month
ORDER BY (campaign_id, event_type, timestamp)
PRIMARY KEY (campaign_id, event_type, timestamp)
TTL timestamp + INTERVAL 3 YEAR
SETTINGS 
    index_granularity = 8192,
    compress_part_header = true;
```

**Категории событий (event_category):**
- `page_view` — Просмотр страниц
- `content_interaction` — Взаимодействие с контентом
- `registration` — Регистрация
- `auth` — Авторизация
- `receipt` — Регистрация чека
- `code` — Регистрация кода
- `activity` — Участие в активностях
- `prize_electronic` — Получение электронного приза
- `prize_physical` — Получение физического приза
- `profile` — Личный кабинет
- `return` — Повторное участие
- `exit` — Завершение взаимодействия
- `chatbot` — Взаимодействие с чат-ботом
- `personalization` — Персонализация
- `ab_test` — A/B тестирование

---

### 3.2. Таблица 2: CRM Events

**Назначение:** Хранение событий, связанных с управлением пользователями, кампаниями и бизнес-процессами (администрирование, модерация, интеграции).

```sql
CREATE TABLE event_logger.crm_events
(
    event_id UUID DEFAULT generateUUIDv4(),
    timestamp DateTime64(3, 'UTC') DEFAULT now64(3),
    event_date Date DEFAULT toDate(timestamp),
    event_month String DEFAULT toYYYYMM(timestamp),
    
    -- Идентификаторы
    user_id Nullable(UUID),
    admin_id Nullable(UUID),
    moderator_id Nullable(UUID),
    campaign_id Nullable(UUID),
    subcampaign_id Nullable(UUID),
    portal_id Nullable(UUID),
    activity_id Nullable(UUID),
    prize_id Nullable(UUID),
    submission_id Nullable(UUID),
    
    -- Классификация
    event_type LowCardinality(String),
    event_category LowCardinality(String),  -- admin, moderation, integration, notification
    resource_type LowCardinality(String),  -- user, campaign, activity, prize, submission
    
    -- Данные события
    payload String,  -- JSON-строка
    action_result LowCardinality(String),  -- success, failed, pending
    changes_before Nullable(String),  -- JSON для audit trail
    changes_after Nullable(String),  -- JSON для audit trail
    
    -- Контекст
    ip_address IPv4,
    user_agent String,
    
    -- Системные метаданные
    source LowCardinality(String) DEFAULT 'server',
    service_name LowCardinality(String),
    instance_id String,
    received_at DateTime64(3, 'UTC') DEFAULT now64(3),
    processed_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree()
PARTITION BY event_month
ORDER BY (event_category, event_type, timestamp)
PRIMARY KEY (event_category, event_type, timestamp)
TTL timestamp + INTERVAL 3 YEAR
SETTINGS 
    index_granularity = 8192,
    compress_part_header = true;
```

**Категории событий (event_category):**
- `admin_activity` — Управление активностями
- `admin_user` — Управление пользователями
- `admin_campaign` — Управление кампаниями
- `moderation` — Модерация контента/документов
- `notification` — Уведомления пользователям
- `integration` — Интеграции с внешними системами
- `security` — События безопасности
- `fraud` — Обнаружение и предотвращение фрода

---

### 3.3. Таблица 3: System Events

**Назначение:** Хранение технических событий системы (ошибки, производительность, здоровье сервисов).

```sql
CREATE TABLE event_logger.system_events
(
    event_id UUID DEFAULT generateUUIDv4(),
    timestamp DateTime64(3, 'UTC') DEFAULT now64(3),
    event_date Date DEFAULT toDate(timestamp),
    event_month String DEFAULT toYYYYMM(timestamp),
    
    -- Классификация
    event_type LowCardinality(String),
    event_category LowCardinality(String),  -- error, performance, health, deployment
    severity LowCardinality(String),  -- critical, high, medium, low, info
    
    -- Контекст ошибки
    error_code Nullable(String),
    error_message Nullable(String),
    stack_trace Nullable(String),
    service_name LowCardinality(String),
    instance_id String,
    host_name String,
    
    -- Контекст операции
    operation_type Nullable(LowCardinality(String)),
    resource_type Nullable(LowCardinality(String)),
    resource_id Nullable(UUID),
    campaign_id Nullable(UUID),
    user_id Nullable(UUID),
    
    -- Метрики производительности
    duration_ms Nullable(UInt32),
    memory_mb Nullable(UInt32),
    cpu_percent Nullable(Float32),
    
    -- Данные события
    payload String,  -- JSON-строка
    
    -- Системные метаданные
    source LowCardinality(String) DEFAULT 'server',
    received_at DateTime64(3, 'UTC') DEFAULT now64(3),
    processed_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree()
PARTITION BY event_month
ORDER BY (severity, event_category, timestamp)
PRIMARY KEY (severity, event_category, timestamp)
TTL timestamp + INTERVAL 1 YEAR
SETTINGS 
    index_granularity = 8192,
    compress_part_header = true;
```

**Категории событий (event_category):**
- `error_validation` — Ошибки валидации
- `error_api` — Ошибки внешних API
- `error_db` — Ошибки базы данных
- `error_timeout` — Таймауты операций
- `error_integration` — Ошибки интеграций
- `error_payment` — Ошибки платежей
- `error_delivery` — Ошибки доставки
- `error_moderation` — Ошибки модерации
- `error_chatbot` — Ошибки чат-бота
- `error_critical` — Критические ошибки системы
- `performance` — Метрики производительности
- `health` — Проверки здоровья сервисов
- `deployment` — Развёртывание версий

---

### 3.4. Материализованные представления (агрегаты)

```sql
-- Ежедневные метрики по пользовательским событиям
CREATE MATERIALIZED VIEW event_logger.user_events_daily_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (campaign_id, event_category, event_date)
AS SELECT
    event_date,
    campaign_id,
    subcampaign_id,
    event_category,
    event_type,
    count() AS event_count,
    count(DISTINCT user_id) AS unique_users,
    countIf(result_status = 'success') AS success_count,
    countIf(result_status = 'failed') AS failed_count,
    avg(reward_amount) AS avg_reward
FROM event_logger.user_events
GROUP BY event_date, campaign_id, subcampaign_id, event_category, event_type;

-- Ежедневные метрики по CRM-событиям
CREATE MATERIALIZED VIEW event_logger.crm_events_daily_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_category, event_type, event_date)
AS SELECT
    event_date,
    event_category,
    event_type,
    action_result,
    count() AS event_count,
    count(DISTINCT admin_id) AS unique_admins,
    count(DISTINCT campaign_id) AS affected_campaigns
FROM event_logger.crm_events
GROUP BY event_date, event_category, event_type, action_result;

-- Агрегаты по системным событиям (для мониторинга)
CREATE MATERIALIZED VIEW event_logger.system_events_hourly_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (severity, service_name, event_hour)
AS SELECT
    toDate(timestamp) AS event_date,
    toStartOfHour(timestamp) AS event_hour,
    severity,
    service_name,
    event_category,
    count() AS event_count,
    avg(duration_ms) AS avg_duration_ms,
    max(memory_mb) AS max_memory_mb,
    max(cpu_percent) AS max_cpu_percent
FROM event_logger.system_events
GROUP BY event_date, event_hour, severity, service_name, event_category;
```

---

## 4. Типология событий (распределение по таблицам)

### 4.1. User Activity Events (user_events)

| Раздел | Примеры событий | Критичность | Объём (прогноз) |
|--------|----------------|-------------|-----------------|
| Публичный доступ | `page_view.*`, `content_interaction.*` | Низкая | ~40% от всех событий |
| Регистрация | `registration.*`, `auth.*` | Высокая | ~15% |
| Подтверждение покупки | `receipt.*`, `code.*` | Высокая | ~10% |
| Участие в активностях | `activity.*` | Высокая | ~20% |
| Получение приза | `prize.electronic.*`, `prize.physical.*` | Высокая | ~8% |
| Личный кабинет | `profile.*` | Низкая | ~3% |
| Повторное участие | `return.*` | Средняя | ~2% |
| Чат-бот | `chatbot.*` | Средняя | ~2% |

### 4.2. CRM Events (crm_events)

| Раздел | Примеры событий | Критичность | Объём (прогноз) |
|--------|----------------|-------------|-----------------|
| Администрирование | `admin.activity.*`, `admin.user.*`, `admin.campaign.*` | Высокая | ~40% от CRM событий |
| Модерация | `moderation.*` | Высокая | ~30% |
| Уведомления | `notification.*` | Средняя | ~20% |
| Безопасность | `security.*`, `fraud.*` | Высокая | ~10% |

### 4.3. System Events (system_events)

| Раздел | Примеры событий | Критичность | Объём (прогноз) |
|--------|----------------|-------------|-----------------|
| Ошибки | `system.error.*` | Высокая | ~60% от системных событий |
| Производительность | `performance.*` | Средняя | ~25% |
| Здоровье | `health.*` | Низкая | ~15% |

---

## 5. API спецификация

### 5.1. Приём одиночного события

**Endpoint:** `POST /api/v1/events`

**Request:**
```json
{
  "event_type": "activity.completed",
  "event_category": "activity",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
  "subcampaign_id": "550e8400-e29b-41d4-a716-446655440002",
  "portal_id": "550e8400-e29b-41d4-a716-446655440003",
  "activity_id": "550e8400-e29b-41d4-a716-446655440004",
  "session_id": "550e8400-e29b-41d4-a716-446655440005",
  "payload": {
    "result": "win",
    "reward_amount": 50,
    "reward_type": "points",
    "duration_ms": 1500
  },
  "device": {
    "type": "mobile",
    "os": "iOS 17.0",
    "browser": "Safari"
  },
  "timestamp": "2026-02-24T10:30:00.000Z"
}
```

**Response (202 Accepted):**
```json
{
  "event_id": "550e8400-e29b-41d4-a716-446655440010",
  "status": "queued",
  "table": "user_events"
}
```

### 5.2. Приём пакетных событий

**Endpoint:** `POST /api/v1/events/batch`

**Request:**
```json
{
  "events": [
    {
      "event_type": "page.viewed",
      "event_category": "page_view",
      "user_id": "...",
      "campaign_id": "...",
      "payload": { "page": "/rules" },
      "timestamp": "2026-02-24T10:30:00.000Z"
    },
    {
      "event_type": "activity.started",
      "event_category": "activity",
      "user_id": "...",
      "campaign_id": "...",
      "activity_id": "...",
      "payload": { "activity_type": "roulette" },
      "timestamp": "2026-02-24T10:30:05.000Z"
    }
  ]
}
```

**Response (202 Accepted):**
```json
{
  "count": 2,
  "status": "queued",
  "tables": {
    "user_events": 2
  }
}
```

### 5.3. Запрос событий

**Endpoint:** `GET /api/v1/events/query`

**Параметры запроса:**
- `table` (required): `user_events` | `crm_events` | `system_events`
- `campaign_id` (optional): Фильтр по кампании
- `event_type` (optional): Фильтр по типу события
- `user_id` (optional): Фильтр по пользователю
- `date_from`, `date_to` (optional): Временной диапазон
- `limit`, `offset` (optional): Пагинация результатов

**Response:**
```json
{
  "events": [ /* массив событий */ ],
  "total_count": 1500,
  "has_more": true
}
```

### 5.4. Экспорт данных

**Endpoint:** `POST /api/v1/events/export`

**Request:**
```json
{
  "table": "user_events",
  "campaign_id": "550e8400-e29b-41d4-a716-446655440001",
  "date_from": "2026-02-01",
  "date_to": "2026-02-24",
  "format": "csv",
  "event_types": ["activity.completed", "prize.claimed"],
  "destination": "s3"
}
```

**Response:**
```json
{
  "export_id": "550e8400-e29b-41d4-a716-446655440020",
  "status": "processing",
  "estimated_completion": "2026-02-24T10:35:00.000Z"
}
```

### 5.5. Health Check

**Endpoint:** `GET /health`

**Response:**
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

---

## 6. Инфраструктура

### 6.1. Компоненты (Timeweb Cloud)

| Компонент | Конфигурация | Количество | Стоимость/мес | Назначение |
|-----------|-------------|-----------|---------------|-----------|
| **VPS (Event API)** | 4 vCPU, 8 GB RAM, 100 GB NVMe | 2 | ~2 400 руб | Приём событий, валидация, очередь |
| **VPS (Workers)** | 4 vCPU, 8 GB RAM, 100 GB NVMe | 2 (auto-scale до 8) | ~2 400 руб + ~7 200 руб (пик) | Пакетная обработка, запись в ClickHouse |
| **ClickHouse Cluster** | 3 ноды × (8 vCPU, 32 GB RAM, 500 GB NVMe) | 3 | ~15 000 руб | Хранение событий (3 таблицы) |
| **Redis Cluster** | 8 GB RAM, 3 ноды | 1 | ~3 000 руб | Очередь событий, кэш агрегатов |
| **S3 Storage** | 100 GB Standard + 200 GB IA | 1 | ~750 руб | Архивы, экспорт данных |
| **Load Balancer** | Timeweb LB | 1 | ~500 руб | Распределение нагрузки |
| **Итого (средний месяц)** | | | **~24 050 руб** | |
| **Итого (декабрь, пик)** | | | **~31 250 руб** | |

### 6.2. Схема развёртывания ClickHouse

```
┌─────────────────────────────────────────────────────────────┐
│              ClickHouse Cluster (3 ноды)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Node 1    │  │   Node 2    │  │   Node 3    │         │
│  │  (Shard 1)  │  │  (Shard 2)  │  │  (Replica)  │         │
│  │             │  │             │  │             │         │
│  │ user_events │  │ user_events │  │ user_events │         │
│  │ crm_events  │  │ crm_events  │  │ crm_events  │         │
│  │ system_     │  │ system_     │  │ system_     │         │
│  │   events    │  │   events    │  │   events    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  Репликация: Shard 1 ↔ Replica, Shard 2 ↔ Replica          │
│  Партиционирование: по месяцам (event_month)                │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Безопасность и соответствие 152-ФЗ

### 7.1. Маскирование персональных данных

```typescript
// src/security/event-sanitizer.ts
@Injectable()
export class EventSanitizer {
  private readonly sensitiveFields = [
    'phone', 'email', 'passport', 'address', 'credit_card', 'password', 'token'
  ];

  sanitize(payload: Record<string, any>): Record<string, any> {
    const sanitized = {};
    for (const [key, value] of Object.entries(payload)) {
      if (this.sensitiveFields.some(f => key.toLowerCase().includes(f))) {
        sanitized[key] = '***MASKED***';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitize(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  hashIpAddress(ip: string): string {
    return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
  }
}
```

### 7.2. Удаление данных пользователя (152-ФЗ)

**Endpoint:** `DELETE /api/v1/users/{user_id}/events`

**Реализация:**
```sql
-- ClickHouse не поддерживает UPDATE/DELETE в реальном времени
-- Используем мутации с асинхронным выполнением

ALTER TABLE event_logger.user_events 
DELETE WHERE user_id = '550e8400-e29b-41d4-a716-446655440000';

ALTER TABLE event_logger.crm_events 
DELETE WHERE user_id = '550e8400-e29b-41d4-a716-446655440000';

-- Логирование операции удаления
INSERT INTO event_logger.deletion_audit 
(user_id, requested_at, completed_at, tables_affected, status)
VALUES 
('550e8400-e29b-41d4-a716-446655440000', now(), now(), 
 'user_events, crm_events', 'completed');
```

**Response:**
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "tables_affected": ["user_events", "crm_events"],
  "status": "completed",
  "completed_at": "2026-02-24T10:35:00.000Z"
}
```

---

## 8. Мониторинг и алерты

### 8.1. Метрики (Prometheus)

```yaml
metrics:
  - name: events_received_total
    type: counter
    labels: [event_type, event_category, table, campaign_id]
    description: "Total number of events received"

  - name: events_processed_total
    type: counter
    labels: [event_type, table, status]
    description: "Total number of events processed"

  - name: event_processing_latency_seconds
    type: histogram
    labels: [table, event_category]
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
    description: "Latency of event processing"

  - name: clickhouse_insert_batch_size
    type: histogram
    labels: [table]
    buckets: [10, 50, 100, 500, 1000]
    description: "Batch size for ClickHouse inserts"

  - name: queue_depth
    type: gauge
    labels: [queue_name]
    description: "Number of events in queue"

  - name: error_rate
    type: counter
    labels: [error_type, service, table]
    description: "Number of errors"
```

### 8.2. Алерты (Alertmanager)

```yaml
groups:
- name: event-logger-alerts
  rules:
  - alert: HighQueueDepth
    expr: queue_depth > 50000
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Очередь событий перегружена ({{ $value }} событий)"

  - alert: ClickHouseInsertFailed
    expr: rate(events_processed_total{status="failed"}[5m]) > 0.01
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "Высокий уровень ошибок записи в ClickHouse ({{ $value }}%)"

  - alert: HighProcessingLatency
    expr: histogram_quantile(0.95, rate(event_processing_latency_seconds_bucket[5m])) > 2
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Высокая задержка обработки (p95: {{ $value }}с)"

  - alert: ClickHouseDiskUsageHigh
    expr: clickhouse_disk_usage_percent > 80
    for: 10m
    labels:
      severity: warning
    annotations:
      summary: "Высокое использование диска ClickHouse ({{ $value }}%)"
```

---

## 9. План реализации

### 9.1. Этапы разработки

| Этап | Задачи | Срок | Зависимости |
|------|--------|------|-------------|
| **MVP-1** | Базовая структура сервиса, API приёма событий | 1 неделя | — |
| **MVP-2** | Интеграция Redis Queue + BullMQ Worker | 1 неделя | Redis Cluster |
| **MVP-3** | Схема ClickHouse (3 таблицы + партиционирование) | 1.5 недели | ClickHouse Cluster |
| **MVP-4** | SDK для порталов и сервисов | 1 неделя | Event API готово |
| **MVP-5** | Материализованные представления (агрегаты) | 1 неделя | События записываются |
| **MVP-6** | Дашборды Grafana/Metabase | 1 неделя | Данные в ClickHouse |
| **MVP-7** | Экспорт в S3 + аудит 152-ФЗ | 1 неделя | S3 Bucket |
| **MVP-8** | Нагрузочное тестирование (k6) | 1 неделя | Все компоненты готовы |

**Итого MVP:** ~8.5 недель, 1 backend-разработчик (TS/NestJS).

### 9.2. Критерии готовности к продакшену

- [ ] Нагрузочное тестирование пройдено (650K событий/день, пик 2.3M)
- [ ] Все алерты настроены и протестированы
- [ ] Резервное копирование ClickHouse настроено и проверено
- [ ] Документация API опубликована (Swagger/OpenAPI)
- [ ] Runbook на случай инцидентов создан
- [ ] Security audit пройден (маскирование ПДн, 152-ФЗ)
- [ ] Механизм удаления данных пользователя протестирован

---

## 10. Риски и митигация

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| **Переполнение очереди** | Средняя | Высокое | Auto-scaling воркеров, алерты на queue_depth |
| **Потеря событий при сбое ClickHouse** | Низкая | Критическое | Redis persistence (AOF), retry-логика, DLQ |
| **Нарушение 152-ФЗ** | Низкая | Критическое | Маскирование ПДн, аудит доступа, мутации на удаление |
| **Деградация производительности запросов** | Средняя | Высокое | Партиционирование, первичные ключи, материализованные представления |
| **Недостаточная ёмкость в пик** | Средняя | Высокое | Auto-scaling до 8 реплик, мониторинг нагрузки |
| **Сложность миграции данных** | Средняя | Среднее | Поэтапный перенос, параллельная запись в PG и CH на переходный период |

---

## 11. Глоссарий

| Термин | Определение |
|--------|-----------|
| Событие (Event) | Факт совершения действия пользователем или системой, зафиксированный для последующей аналитики |
| Партиционирование | Разделение таблицы на части по диапазону дат для улучшения производительности (ClickHouse) |
| Материализованное представление | Предрассчитанная агрегированная таблица для ускорения аналитических запросов |
| Мутация (ClickHouse) | Асинхронная операция изменения/удаления данных в ClickHouse |
| MergeTree | Семейство движков таблиц ClickHouse для хранения больших объёмов данных |

---

> **Примечание:** Переход на ClickHouse требует учёта особенностей СУБД:
> - Отсутствие транзакций в классическом понимании
> - Асинхронное выполнение мутаций (DELETE/UPDATE)
> - Оптимизация под append-only workload
> - Необходимость правильного выбора первичных ключей для производительности

*Документ готов к передаче в разработку. При необходимости — детализация любого раздела в отдельном приложении.*