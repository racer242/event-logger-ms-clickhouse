CREATE TABLE event_logger.system_events
(
    -- ============================================
    -- ПОСТОЯННЫЕ ДАННЫЕ
    -- ============================================
    event_id        UUID                    DEFAULT generateUUIDv4(),       -- ID события в базе данных 
    client_id       LowCardinality(String)  NOT NULL DEFAULT 'unknown',     -- ID клиента - (агентство может иметь несколько клиентов) | API - обязательный
    campaign_id     LowCardinality(String)  NOT NULL DEFAULT 'unknown',     -- ID кампании - от какой кампании проходит событие | API - обязательный
    subcampaign_id  LowCardinality(String)  NOT NULL DEFAULT 'unknown',     -- ID подкампании - в рамках кампании может быть несколько подкампаний | API - необязательный
    timestamp       DateTime64(3, 'UTC')    NOT NULL,                       -- Время события | API - обязательный
    instance_id     LowCardinality(String)  NOT NULL DEFAULT 'unknown',     -- ID инстанса источника события | API - обязательный
    host_name       Nullable(String),                                       -- Хост источника события | API - необязательный
    error_code      LowCardinality(String)  NOT NULL DEFAULT 'none',        -- Код события | API - необязательный
    
    -- ============================================
    -- КЛАССИФИКАЦИЯ СОБЫТИЯ
    -- ============================================
    event_type      LowCardinality(String)  NOT NULL,                       -- Тип события. Именуется по принципу "КАТЕГОРИЯ.УТОЧНЕНИЕ.....УТОЧНЕНИЕ" | API - обязательный
    source          LowCardinality(String)  NOT NULL DEFAULT 'unknown',     -- Источник события. Название компонента/модуля системы | API - обязательный
    criticality     LowCardinality(String)  NOT NULL DEFAULT 'low',         -- Критичность события (классификация типа события - ценность для статистики). Возможные варианты: "low", "medium", "high" | API - обязательный
    severity        LowCardinality(String)  NOT NULL DEFAULT 'unknown',     -- Важность события (классификация инцидента - уровень проблемы). Возможные варианты: "warning", "error", "failure" | API - обязательный
    
    -- ============================================
    -- СПЕЦИФИЧЕСКИЕ ДАННЫЕ (payload в JSON)
    -- ============================================

    payload         Object('json')          DEFAULT '{}',                   -- Дополнительные поля, специфичные для конкретного события | API - необязательный
    
    -- ============================================
    -- СЛУЖЕБНЫЕ ПОЛЯ
    -- ============================================
    event_date      Date                    DEFAULT toDate(timestamp),      -- Дата добавления события в базу данных
    event_month     String                  DEFAULT toYYYYMM(timestamp)     -- Месяц добавления события в базу данных
    event_hour      UInt8                   DEFAULT toHour(timestamp)       -- Час добавления события в базу данных
)
ENGINE = MergeTree()
PARTITION BY event_month
ORDER BY (severity, event_type, timestamp, event_id)
PRIMARY KEY (severity, event_type, timestamp)
TTL timestamp + INTERVAL 1 YEAR
SETTINGS 
    index_granularity = 8192,
    compress_part_header = true;

-- ============================================
-- ИНДЕКСЫ
-- ============================================

ALTER TABLE event_logger.system_events 
    ADD INDEX idx_instance instance_id TYPE bloom_filter GRANULARITY 4;

ALTER TABLE event_logger.system_events 
    ADD INDEX idx_severity severity TYPE bloom_filter GRANULARITY 4;

ALTER TABLE event_logger.system_events 
    ADD INDEX idx_error_code error_code TYPE bloom_filter GRANULARITY 4;

ALTER TABLE event_logger.system_events 
    ADD INDEX idx_session_id session_id TYPE bloom_filter GRANULARITY 4;

ALTER TABLE event_logger.system_events 
    ADD INDEX idx_campaign campaign_id TYPE bloom_filter GRANULARITY 4;