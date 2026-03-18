import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import initSqlJs, { Database } from 'sql.js';
import { CreateEventDto } from '../events/dto/create-event.dto';
import { ClickHouseRepository } from '../clickhouse/clickhouse.repository';

export interface QueuedEvent {
  id: number;
  event_id: string;
  event_data: string;
  table_name: string;
  created_at: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

@Injectable()
export class EventQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventQueueService.name);
  private db: Database | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly isEnabled: boolean;
  private readonly flushIntervalMs: number;
  private readonly batchSize: number;
  private readonly dbPath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly clickHouseRepo: ClickHouseRepository,
  ) {
    this.isEnabled = this.configService.get<boolean>(
      'queue.sqlite.enabled',
      true,
    );
    this.flushIntervalMs = this.configService.get<number>(
      'queue.flushIntervalMs',
      5000,
    );
    this.batchSize = this.configService.get<number>('queue.batchSize', 100);
    this.dbPath = this.configService.get<string>(
      'queue.sqlite.dbPath',
      'data/events.db',
    );
  }

  async onModuleInit() {
    if (!this.isEnabled) {
      this.logger.log('SQLite queue disabled');
      return;
    }

    try {
      await this.loadOrCreateDatabase();
      this.startFlushTimer();
      this.logger.log('SQLite queue initialized');
    } catch (error) {
      this.logger.error(`Failed to initialize SQLite: ${error.message}`);
    }
  }

  private async loadOrCreateDatabase() {
    const fs = require('fs');
    const path = require('path');
    const initSqlJs = require('sql.js');

    // Создаём директорию если не существует
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      this.logger.log(`Created directory ${dir}`);
    }

    // Проверяем существует ли файл БД
    const dbExists = fs.existsSync(this.dbPath);

    if (dbExists) {
      const buffer = fs.readFileSync(this.dbPath);
      if (buffer.length > 0) {
        const SQL = await initSqlJs();
        this.db = new SQL.Database(buffer);
        this.logger.log(`Loaded existing SQLite database from ${this.dbPath}`);
      } else {
        const SQL = await initSqlJs();
        this.db = new SQL.Database();
        this.logger.log(`Creating new SQLite database at ${this.dbPath}`);
      }
    } else {
      const SQL = await initSqlJs();
      this.db = new SQL.Database();
      this.logger.log(`Creating new SQLite database at ${this.dbPath}`);
    }

    // Создаём таблицы
    this.db.run(`
      CREATE TABLE IF NOT EXISTS event_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        event_data TEXT NOT NULL,
        table_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME,
        status TEXT DEFAULT 'pending'
      )
    `);
    this.db.run('CREATE INDEX IF NOT EXISTS idx_status ON event_queue(status)');
    this.db.run(
      'CREATE INDEX IF NOT EXISTS idx_created_at ON event_queue(created_at)',
    );
    this.db.run(
      'CREATE INDEX IF NOT EXISTS idx_event_id ON event_queue(event_id)',
    );

    // Сохраняем сразу после инициализации
    this.saveDatabase();
  }

  onModuleDestroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    if (this.db) {
      this.saveDatabase();
      this.db.close();
    }
  }

  private saveDatabase() {
    if (!this.db) return;

    const fs = require('fs');
    const path = require('path');

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
    this.logger.debug(`Saved SQLite database to ${this.dbPath}`);
  }

  private startFlushTimer() {
    this.logger.log(
      `Starting flush timer with interval ${this.flushIntervalMs}ms`,
    );
    this.flushTimer = setInterval(() => {
      this.flushBuffer().catch((err) => {
        this.logger.error(`Flush error: ${err.message}`, err.stack);
      });
    }, this.flushIntervalMs);
  }

  async enqueue(
    event: CreateEventDto,
  ): Promise<{ eventId: string; table: string }> {
    const eventId = uuidv4();
    const table = this.determineTable(event);

    if (this.db) {
      this.db.run(
        `INSERT INTO event_queue (event_id, event_data, table_name, status) 
         VALUES (?, ?, ?, 'pending')`,
        [eventId, JSON.stringify(event), table],
      );
      this.saveDatabase();
    }

    return { eventId, table };
  }

  async enqueueBatch(
    events: CreateEventDto[],
  ): Promise<{ count: number; tables: Record<string, number> }> {
    const tables: Record<string, number> = {};

    for (const event of events) {
      const table = this.determineTable(event);
      tables[table] = (tables[table] || 0) + 1;
      await this.enqueue(event);
    }

    return { count: events.length, tables };
  }

  async flushBuffer() {
    if (!this.db) return;

    // Получаем пачку необработанных событий
    const events = this.db.exec(`
      SELECT * FROM event_queue
      WHERE status = 'pending'
      ORDER BY created_at
      LIMIT ${this.batchSize}
    `);

    if (!events[0] || events[0].values.length === 0) {
      this.logger.debug('No pending events in queue');
      return;
    }

    const rows = events[0].values;
    const columns = events[0].columns;

    const queuedEvents: QueuedEvent[] = rows.map((row) => {
      const event: any = {};
      columns.forEach((col: string, idx: number) => {
        event[col] = row[idx];
      });
      return event as QueuedEvent;
    });

    this.logger.log(`Processing ${queuedEvents.length} events from queue`);

    // Помечаем как processing
    const eventIds = queuedEvents.map((e) => e.event_id);
    this.db.run(
      `
      UPDATE event_queue 
      SET status = 'processing', processed_at = CURRENT_TIMESTAMP 
      WHERE event_id IN (${eventIds.map(() => '?').join(',')})
    `,
      eventIds,
    );
    this.saveDatabase();

    try {
      // Группируем по таблицам
      const eventsByTable = queuedEvents.reduce(
        (acc, event) => {
          acc[event.table_name] = acc[event.table_name] || [];
          acc[event.table_name].push(JSON.parse(event.event_data));
          return acc;
        },
        {} as Record<string, any[]>,
      );

      // Отправляем в ClickHouse
      for (const [table, tableEvents] of Object.entries(eventsByTable)) {
        await this.insertToClickHouse(table, tableEvents);
      }

      // Помечаем как completed
      this.db.run(
        `
        UPDATE event_queue 
        SET status = 'completed' 
        WHERE event_id IN (${eventIds.map(() => '?').join(',')})
      `,
        eventIds,
      );
      this.saveDatabase();

      this.logger.log(`Successfully processed ${queuedEvents.length} events`);
    } catch (error) {
      this.logger.error(`Failed to process events: ${error.message}`);

      // Возвращаем статус pending для повторной попытки
      this.db.run(
        `
        UPDATE event_queue 
        SET status = 'pending' 
        WHERE event_id IN (${eventIds.map(() => '?').join(',')})
      `,
        eventIds,
      );
      this.saveDatabase();

      throw error;
    }
  }

  private async insertToClickHouse(table: string, events: any[]) {
    switch (table) {
      case 'user_events':
        await this.clickHouseRepo.insertUserEvents(
          events.map((e) => ({
            client_id: e.client_id,
            campaign_id: e.campaign_id,
            subcampaign_id: e.subcampaign_id || 'unknown',
            timestamp: e.timestamp
              ? new Date(e.timestamp)
                  .toISOString()
                  .replace('T', ' ')
                  .replace('Z', '')
              : new Date().toISOString().replace('T', ' ').replace('Z', ''),
            portal_id: e.portal_id || 'unknown',
            bot_id: e.bot_id || 'unknown',
            session_id: e.session_id,
            user_id: e.user_id || null,
            user_utm: e.user_utm || null,
            crm_user_id: e.crm_user_id || null,
            receipt_id: e.receipt_id || null,
            code: e.code || null,
            activity_id: e.activity_id || null,
            prize_id: e.prize_id || null,
            message_id: e.message_id || null,
            event_type: e.event_type,
            source: e.source || 'unknown',
            criticality: e.criticality || 'low',
            payload: e.payload || {},
          })),
        );
        break;

      case 'crm_events':
        await this.clickHouseRepo.insertCrmEvents(
          events.map((e) => ({
            client_id: e.client_id,
            campaign_id: e.campaign_id,
            subcampaign_id: e.subcampaign_id || 'main',
            timestamp: e.timestamp
              ? new Date(e.timestamp)
                  .toISOString()
                  .replace('T', ' ')
                  .replace('Z', '')
              : new Date().toISOString().replace('T', ' ').replace('Z', ''),
            session_id: e.session_id,
            crm_user_id: e.crm_user_id,
            entity_type: e.entity_type,
            entity_id: e.entity_id,
            action_type: e.action_type || 'default',
            event_type: e.event_type,
            source: e.source || 'unknown',
            criticality: e.criticality || 'low',
            payload: e.payload || {},
          })),
        );
        break;

      case 'system_events':
        await this.clickHouseRepo.insertSystemEvents(
          events.map((e) => ({
            client_id: e.client_id,
            campaign_id: e.campaign_id,
            subcampaign_id: e.subcampaign_id || 'unknown',
            timestamp: e.timestamp
              ? new Date(e.timestamp)
                  .toISOString()
                  .replace('T', ' ')
                  .replace('Z', '')
              : new Date().toISOString().replace('T', ' ').replace('Z', ''),
            instance_id: e.instance_id || 'unknown',
            host_name: e.host_name || null,
            error_code: e.error_code || 'none',
            event_type: e.event_type,
            source: e.source || 'unknown',
            criticality: e.criticality || 'low',
            severity: e.severity || 'unknown',
            payload: e.payload || {},
          })),
        );
        break;
    }
  }

  private determineTable(
    event: CreateEventDto,
  ): 'user_events' | 'crm_events' | 'system_events' {
    if (event.severity || event.event_type.startsWith('system.')) {
      return 'system_events';
    }
    if (event.entity_type || event.crm_user_id) {
      return 'crm_events';
    }
    return 'user_events';
  }

  getQueueDepth(): {
    user_events: number;
    crm_events: number;
    system_events: number;
    total: number;
  } {
    if (!this.db) {
      return { user_events: 0, crm_events: 0, system_events: 0, total: 0 };
    }

    const result = this.db.exec(`
      SELECT 
        SUM(CASE WHEN table_name = 'user_events' THEN 1 ELSE 0 END) as user_events,
        SUM(CASE WHEN table_name = 'crm_events' THEN 1 ELSE 0 END) as crm_events,
        SUM(CASE WHEN table_name = 'system_events' THEN 1 ELSE 0 END) as system_events,
        COUNT(*) as total
      FROM event_queue 
      WHERE status = 'pending'
    `);

    if (!result[0] || !result[0].values[0]) {
      return { user_events: 0, crm_events: 0, system_events: 0, total: 0 };
    }

    const row = result[0].values[0];
    return {
      user_events: row[0] || 0,
      crm_events: row[1] || 0,
      system_events: row[2] || 0,
      total: row[3] || 0,
    };
  }

  async clearCompletedEvents() {
    if (!this.db) return;

    this.db.run(`DELETE FROM event_queue WHERE status = 'completed'`);
    this.saveDatabase();
    this.logger.log('Cleared completed events from queue');
  }
}
