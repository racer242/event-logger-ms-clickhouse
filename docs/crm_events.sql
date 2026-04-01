CREATE TABLE event_logger.crm_events
(
    -- ============================================
    -- ПОСТОЯННЫЕ ДАННЫЕ
    -- ============================================
    event_id        UUID                    DEFAULT generateUUIDv4(),       -- ID события в базе данных 
    client_id       LowCardinality(String)  NOT NULL DEFAULT 'unknown',     -- ID клиента - (агентство может иметь несколько клиентов) | API - обязательный
    campaign_id     LowCardinality(String)  NOT NULL DEFAULT 'unknown',     -- ID кампании - от какой кампании проходит событие | API - обязательный
    subcampaign_id  LowCardinality(String)  NOT NULL DEFAULT 'main',        -- ID подкампании - в рамках кампании может быть несколько подкампаний | API - необязательный
    timestamp       DateTime64(3, 'UTC')    NOT NULL,                       -- Время события | API - обязательный
    session_id      String                  NOT NULL,                       -- ID cессия пользователя | API - обязательный
    crm_user_id     Nullable(String),                                     -- ID пользователя CRM | API - обязательный
    entity_type     LowCardinality(String)  NOT NULL,                       -- Тип сущности CRM, с которой производится действие | API - обязательный
    entity_id       String                  NOT NULL,                       -- ID в CRM сущности CRM, с которой производится действие | API - обязательный
    action_type     LowCardinality(String)  NOT NULL DEFAULT 'default',     -- Тип действия, производимого над сущностью CRM | API - обязательный
    
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
    -- СЛУЖЕБНЫЕ ПОЛЯ
    -- ============================================
    event_date      Date                    DEFAULT toDate(timestamp),      -- Дата добавления события в базу данных
    event_month     String                  DEFAULT toYYYYMM(timestamp)     -- Месяц добавления события в базу данных
    event_hour      UInt8                   DEFAULT toHour(timestamp)       -- Час добавления события в базу данных
)
ENGINE = MergeTree()
PARTITION BY event_month
ORDER BY (event_type, timestamp, event_id)
PRIMARY KEY (event_type, timestamp)
TTL toDateTime(timestamp) + INTERVAL 3 YEAR
SETTINGS
    index_granularity = 8192,
    allow_experimental_object_type = 1;

-- ============================================
-- ИНДЕКСЫ
-- ============================================

ALTER TABLE event_logger.crm_events 
    ADD INDEX idx_crm_user crm_user_id TYPE bloom_filter GRANULARITY 4;

ALTER TABLE event_logger.crm_events
    ADD INDEX idx_entity_type entity_type TYPE bloom_filter GRANULARITY 4;

ALTER TABLE event_logger.crm_events
    ADD INDEX idx_entity_id entity_id TYPE bloom_filter GRANULARITY 4;

ALTER TABLE event_logger.crm_events 
    ADD INDEX idx_campaign campaign_id TYPE bloom_filter GRANULARITY 4;

ALTER TABLE event_logger.crm_events 
    ADD INDEX idx_session_id session_id TYPE bloom_filter GRANULARITY 4;

ALTER TABLE event_logger.crm_events 
    ADD INDEX idx_action_id action_id TYPE bloom_filter GRANULARITY 4;