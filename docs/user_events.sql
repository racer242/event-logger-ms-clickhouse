-- Основная таблица событий пользователей
CREATE TABLE event_logger.user_events
(
    -- ============================================
    -- ПОСТОЯННЫЕ ДАННЫЕ (обязательные в API и БД)
    -- ============================================
    event_id        UUID                    DEFAULT generateUUIDv4(),       -- ID события в базе данных 
    client_id       LowCardinality(String)  NOT NULL DEFAULT 'unknown',     -- ID клиента - (агентство может иметь несколько клиентов) | API - обязательный
    campaign_id     LowCardinality(String)  NOT NULL DEFAULT 'unknown',     -- ID кампании - от какой кампании проходит событие | API - обязательный
    subcampaign_id  LowCardinality(String)  NOT NULL DEFAULT 'unknown',     -- ID подкампании - в рамках кампании может быть несколько подкампаний | API - необязательный
    timestamp       DateTime64(3, 'UTC')    NOT NULL,                       -- Время события | API - обязательный
    portal_id       LowCardinality(String)  NOT NULL DEFAULT 'unknown',     -- Портал-источник события события | API - обязательный
    bot_id          LowCardinality(String)  NOT NULL DEFAULT 'unknown',     -- Чат-бот-источник события события | API - обязательный
    session_id      String                  NOT NULL,                       -- ID cессия пользователя | API - обязательный
 
    -- ============================================
    -- ОПЦИОНАЛЬНЫЕ ДАННЫЕ (в БД обязательно, в API опционально)
    -- ============================================
    user_id         Nullable(UUID),                                         -- ID пользователя-участника | API - необязательный
    user_utm        Nullable(String),                                       -- UTM-метка пользователя-участника | API - необязательный
    crm_user_id     Nullable(UUID),                                         -- ID пользователя CRM | API - необязательный
    receipt_id      Nullable(UUID),                                         -- ID чека | API - необязательный
    code            Nullable(String),                                       -- ID кода | API - необязательный
    activity_id     Nullable(UUID),                                         -- ID активности | API - необязательный
    prize_id        Nullable(UUID),                                         -- ID приза | API - необязательный
    
    -- ============================================
    -- КЛАССИФИКАЦИЯ СОБЫТИЯ
    -- ============================================
    event_type      LowCardinality(String)  NOT NULL,                       -- Тип события. Именуется по принципу "КАТЕГОРИЯ.УТОЧНЕНИЕ.....УТОЧНЕНИЕ" | API - обязательный
    source          LowCardinality(String)  NOT NULL DEFAULT 'unknown',     -- Источник события. Название компонента/модуля системы | API - обязательный
    criticality     LowCardinality(String)  NOT NULL DEFAULT 'low',         -- Критичность события (классификация типа события - ценность для статистики). Возможные варианты: "low", "medium", "high" | API - обязательный
    
    -- ============================================
    -- СПЕЦИФИЧЕСКИЕ ДАННЫЕ (payload в JSON)
    -- ============================================
    payload         Object('json')          DEFAULT '{}',                   -- Дополнительные поля, специфичные для конкретного события | API - необязательный
    
    -- ============================================
    -- СЛУЖЕБНЫЕ ПОЛЯ ДЛЯ ПАРТИЦИОНИРОВАНИЯ
    -- ============================================
    event_date      Date                    DEFAULT toDate(timestamp),      -- Дата добавления события в базу данных
    event_month     String                  DEFAULT toYYYYMM(timestamp)     -- Месяц добавления события в базу данных
    event_hour      UInt8                   DEFAULT toHour(timestamp)       -- Час добавления события в базу данных
)
ENGINE = MergeTree()
PARTITION BY event_month
ORDER BY (campaign_id, event_type, timestamp, event_id)
PRIMARY KEY (campaign_id, event_type, timestamp)
TTL timestamp + INTERVAL 3 YEAR
SETTINGS 
    index_granularity = 8192,
    compress_part_header = true,
    max_parts_in_total = 100000,
    max_merge_selecting_sleep_ms = 5000;

-- ============================================
-- ИНДЕКСЫ ДЛЯ ОПТИМИЗАЦИИ ЗАПРОСОВ
-- ============================================

ALTER TABLE event_logger.user_events 
    ADD INDEX idx_user_id user_id TYPE bloom_filter GRANULARITY 4;

ALTER TABLE event_logger.user_events 
    ADD INDEX idx_session_id session_id TYPE bloom_filter GRANULARITY 4;

ALTER TABLE event_logger.user_events 
    ADD INDEX idx_activity_id activity_id TYPE bloom_filter GRANULARITY 4;

ALTER TABLE event_logger.user_events 
    ADD INDEX idx_prize_id prize_id TYPE bloom_filter GRANULARITY 4;

ALTER TABLE event_logger.user_events 
    ADD INDEX idx_receipt_id receipt_id TYPE bloom_filter GRANULARITY 4;

ALTER TABLE event_logger.user_events 
    ADD INDEX idx_payload_json payload TYPE bloom_filter GRANULARITY 4;

ALTER TABLE event_logger.user_events 
    ADD INDEX idx_timestamp_minmax timestamp TYPE minmax GRANULARITY 1;