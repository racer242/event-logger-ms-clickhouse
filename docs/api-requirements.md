# Требования к интеграции с Event Logger API

## Общие сведения

Event Logger API — микросервис для приёма и обработки событий платформы. Сервис обеспечивает централизованный сбор событий от всех компонентов системы с гарантией доставки и возможностью аналитической обработки.

**Базовый URL:** `http://host:3242/api/v1`

---

## Аутентификация

Все запросы к API должны содержать API-ключ в заголовке:

```
X-API-Key: ваш-api-ключ
```

**Получение ключа:** обратитесь к администратору сервиса для получения уникального ключа.

---

## Формат данных

### Типы полей

| Поле | Тип | Описание |
|------|-----|----------|
| `client_id` | string | ID клиента (агентство может иметь несколько клиентов) |
| `campaign_id` | string | ID кампании |
| `subcampaign_id` | string | ID подкампании (опционально) |
| `session_id` | string | ID сессии |
| `timestamp` | string | Время события в формате ISO 8601 (`YYYY-MM-DDTHH:mm:ss.sssZ`) |
| `event_type` | string | Тип события в формате `category.subcategory.details` |
| `source` | string | Источник события (название сервиса) |
| `criticality` | string | Критичность: `low`, `medium`, `high` |
| `user_id` | string | ID пользователя (строка, не число!) |
| `crm_user_id` | string | ID пользователя CRM (строка, не число!) |
| `activity_id` | string | ID активности (строка, не число!) |
| `prize_id` | string | ID приза (строка, не число!) |
| `message_id` | string | ID сообщения (строка, не число!) |
| `receipt_id` | string | ID чека (строка, не число!) |
| `payload` | object | Дополнительные данные (JSON object) |

> ⚠️ **ВАЖНО:** Все ID-поля передаются как **строки**, даже если содержат числовые значения.

---

## Endpoints

### 1. Приём одиночного события

**Endpoint:** `POST /api/v1/events`

**Требования:**
- Content-Type: `application/json`
- Обязательные поля: `client_id`, `campaign_id`, `session_id`, `timestamp`, `event_type`, `source`, `criticality`
- Дополнительные поля зависят от типа события

**Пример запроса:**

```json
{
  "client_id": "client-001",
  "campaign_id": "campaign-2026-spring",
  "session_id": "sess-abc123xyz",
  "timestamp": "2026-04-01T12:00:00.000Z",
  "event_type": "registration.complete",
  "source": "auth-service",
  "criticality": "high",
  "user_id": "12345",
  "payload": {
    "registration_method": "phone",
    "phone": "+79001234567"
  }
}
```

**Ответы:**

| Код | Описание |
|-----|----------|
| `201` | Событие успешно принято |
| `400` | Ошибка валидации данных |
| `401` | Неверный или отсутствующий API-ключ |
| `429` | Превышен лимит запросов |
| `500` | Внутренняя ошибка сервиса |

---

### 2. Пакетная отправка событий

**Endpoint:** `POST /api/v1/events/batch`

**Требования:**
- Content-Type: `application/json`
- Максимальное количество событий в пакете: **1000**
- Все события в пакете должны иметь корректную структуру

**Пример запроса:**

```json
{
  "events": [
    {
      "client_id": "client-001",
      "campaign_id": "campaign-2026-spring",
      "session_id": "sess-abc123xyz",
      "timestamp": "2026-04-01T12:00:00.000Z",
      "event_type": "page_view.open",
      "source": "portal-frontend",
      "criticality": "low"
    },
    {
      "client_id": "client-001",
      "campaign_id": "campaign-2026-spring",
      "session_id": "sess-abc123xyz",
      "timestamp": "2026-04-01T12:00:05.000Z",
      "event_type": "activity.start",
      "source": "activity-service",
      "criticality": "low",
      "user_id": "12345",
      "activity_id": "67890"
    }
  ]
}
```

**Ответы:**

| Код | Описание |
|-----|----------|
| `201` | Все события успешно приняты |
| `400` | Ошибка валидации одного или нескольких событий |
| `401` | Неверный или отсутствующий API-ключ |
| `429` | Превышен лимит запросов |
| `500` | Внутренняя ошибка сервиса |

---

## Типы событий

### 1. События пользователей (`user_events`)

**Первый компонент `event_type`:** любой, кроме `crm` и `system`

**Примеры `event_type`:**
- `registration.start`, `registration.complete`, `registration.error`
- `auth.start`, `auth.complete`, `auth.failed`
- `activity.start`, `activity.complete`, `activity.abandon`
- `prize.claim`, `prize.issue`, `prize.ship`
- `page_view.open`, `page_view.leave`
- `feedback.send`, `feedback.rate`, `feedback.complaint`

**Специфичные поля:**
- `portal_id` (string, обязательно) — портал-источник
- `bot_id` (string, обязательно) — чат-бот-источник
- `user_id` (string, опционально) — ID пользователя
- `activity_id` (string, опционально) — ID активности
- `prize_id` (string, опционально) — ID приза
- `message_id` (string, опционально) — ID сообщения

---

### 2. CRM события (`crm_events`)

**Первый компонент `event_type`:** должен быть `crm`

**Примеры `event_type`:**
- `crm.user.create`, `crm.user.update`, `crm.user.block`
- `crm.moderation.approve`, `crm.moderation.reject`
- `crm.notification.send`, `crm.notification.email`

**Специфичные поля:**
- `crm_user_id` (string, обязательно) — ID пользователя CRM
- `entity_type` (string, обязательно) — тип сущности (user, campaign, prize, etc.)
- `entity_id` (string, обязательно) — ID сущности
- `action_type` (string, обязательно) — тип действия (create, update, delete, moderate)

**Пример:**

```json
{
  "client_id": "client-001",
  "campaign_id": "campaign-2026-spring",
  "session_id": "sess-admin-001",
  "timestamp": "2026-04-01T12:00:00.000Z",
  "event_type": "crm.user.create",
  "source": "admin-panel",
  "criticality": "high",
  "crm_user_id": "usr-12345",
  "entity_type": "user",
  "entity_id": "usr-12345",
  "action_type": "create",
  "payload": {
    "role": "moderator",
    "permissions": ["edit_campaigns", "view_reports"]
  }
}
```

---

### 3. Системные события (`system_events`)

**Первый компонент `event_type`:** должен быть `system`

**Примеры `event_type`:**
- `system.error.api`, `system.error.db`, `system.error.timeout`
- `system.performance.metrics`, `system.performance.slow`
- `system.health.check`, `system.health.degraded`

**Специфичные поля:**
- `instance_id` (string, обязательно) — ID инстанса сервиса
- `severity` (string, обязательно) — важность: `warning`, `error`, `failure`
- `error_code` (string, опционально) — код ошибки
- `host_name` (string, опционально) — хост источника

**Пример:**

```json
{
  "client_id": "client-001",
  "campaign_id": "campaign-2026-spring",
  "session_id": "sess-system-001",
  "timestamp": "2026-04-01T12:00:00.000Z",
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

---

## Распределение по таблицам

Сервис автоматически распределяет события по таблицам на основе **первого компонента** `event_type`:

| Первый компонент | Таблица |
|------------------|---------|
| `crm` | `crm_events` |
| `system` | `system_events` |
| любой другой | `user_events` |

**Примеры:**
- `registration.complete` → `user_events`
- `crm.user.create` → `crm_events`
- `system.error.api` → `system_events`

---

## Лимиты и ограничения

| Параметр | Значение |
|----------|----------|
| Максимум запросов в минуту | 100 |
| Максимум событий в batch-запросе | 1000 |
| Максимальный размер payload | 1 MB |
| Timeout запроса | 30 секунд |

---

## Обработка ошибок

### Формат ответа при ошибке

```json
{
  "statusCode": 400,
  "message": ["user_id must be a string", "timestamp must be in ISO 8601 format"],
  "error": "Bad Request"
}
```

### Коды ошибок

| Код | Причина | Решение |
|-----|---------|---------|
| `400` | Ошибка валидации | Проверьте формат и наличие обязательных полей |
| `401` | Неверный API-ключ | Проверьте заголовок `X-API-Key` |
| `429` | Превышен лимит | Реализуйте retry с exponential backoff |
| `500` | Ошибка сервера | Повторите запрос позже, обратитесь к администратору |

---

## Рекомендации по реализации

### Node.js

```javascript
const axios = require('axios');

const EVENT_LOGGER_URL = 'http://host:3242/api/v1';
const API_KEY = 'ваш-api-ключ';

async function sendEvent(eventData) {
  try {
    const response = await axios.post(
      `${EVENT_LOGGER_URL}/events`,
      eventData,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        timeout: 5000
      }
    );
    return response.status === 201;
  } catch (error) {
    if (error.response?.status === 429) {
      // Retry с exponential backoff
      await sleep(1000 * Math.pow(2, retryCount));
      return sendEvent(eventData);
    }
    console.error('Failed to send event:', error.message);
    return false;
  }
}

async function sendBatchEvents(events) {
  // Разбиваем на пакеты по 1000 событий
  const batchSize = 1000;
  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    await axios.post(
      `${EVENT_LOGGER_URL}/events/batch`,
      { events: batch },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        }
      }
    );
  }
}
```

### PHP

```php
<?php

class EventLoggerClient
{
    private string $baseUrl;
    private string $apiKey;
    private HttpClient $httpClient;
    
    public function __construct(string $baseUrl, string $apiKey)
    {
        $this->baseUrl = $baseUrl;
        $this->apiKey = $apiKey;
        $this->httpClient = new HttpClient();
    }
    
    public function sendEvent(array $eventData): bool
    {
        try {
            $response = $this->httpClient->post(
                "{$this->baseUrl}/api/v1/events",
                [
                    'headers' => [
                        'Content-Type' => 'application/json',
                        'X-API-Key' => $this->apiKey,
                    ],
                    'json' => $eventData,
                    'timeout' => 5,
                ]
            );
            
            return $response->getStatusCode() === 201;
        } catch (RequestException $e) {
            if ($e->getResponse()->getStatusCode() === 429) {
                // Retry с exponential backoff
                usleep(1000000 * pow(2, $this->retryCount));
                return $this->sendEvent($eventData);
            }
            
            error_log("Failed to send event: " . $e->getMessage());
            return false;
        }
    }
    
    public function sendBatchEvents(array $events): void
    {
        // Разбиваем на пакеты по 1000 событий
        $batches = array_chunk($events, 1000);
        
        foreach ($batches as $batch) {
            $this->httpClient->post(
                "{$this->baseUrl}/api/v1/events/batch",
                [
                    'headers' => [
                        'Content-Type' => 'application/json',
                        'X-API-Key' => $this->apiKey,
                    ],
                    'json' => ['events' => $batch],
                ]
            );
        }
    }
}

// Пример использования
$client = new EventLoggerClient('http://host:3242', 'ваш-api-ключ');

$client->sendEvent([
    'client_id' => 'client-001',
    'campaign_id' => 'campaign-2026-spring',
    'session_id' => 'sess-abc123xyz',
    'timestamp' => date('c'), // ISO 8601
    'event_type' => 'registration.complete',
    'source' => 'auth-service',
    'criticality' => 'high',
    'user_id' => '12345', // строка!
    'payload' => ['method' => 'phone']
]);
```

---

## Чек-лист перед интеграцией

- [ ] Получен API-ключ у администратора
- [ ] Настроен заголовок `X-API-Key` во всех запросах
- [ ] Все ID-поля передаются как строки (не числа!)
- [ ] `timestamp` в формате ISO 8601
- [ ] `event_type` содержит минимум один компонент (например, `registration.complete`)
- [ ] Реализована обработка ошибок 429 (retry с backoff)
- [ ] Для batch-отправки события разбиваются на пакеты ≤1000
- [ ] Размер payload не превышает 1 MB

---

## Поддержка

По вопросам интеграции обращайтесь к администратору сервиса или создайте issue в репозитории проекта.
