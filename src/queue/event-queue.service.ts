import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';
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
  private db: Database.Database | null = null;
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
      this.initializeDatabase();
      this.startFlushTimer();
      this.logger.log('SQLite queue initialized');
    } catch (error) {
      this.logger.error(`Failed to initialize SQLite: ${error.message}`);
    }
  }

  onModuleDestroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    if (this.db) {
      this.db.close();
    }
  }

  private initializeDatabase() {
    const path = require('path');
    const Database = require('better-sqlite3');

    // Создаём директорию если не существует
    const dir = path.dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      this.logger.log(`Created directory ${dir}`);
    }

    // Открываем или создаём БД
    this.db = new Database(this.dbPath);

    if (!this.db) return;

    // Включаем WAL режим для лучшей производительности
    this.db.pragma('journal_mode = WAL');

    // Создаём таблицу
    this.db.exec(`
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

    // Создаём индексы
    this.db.exec(
      'CREATE INDEX IF NOT EXISTS idx_status ON event_queue(status)',
    );
    this.db.exec(
      'CREATE INDEX IF NOT EXISTS idx_created_at ON event_queue(created_at)',
    );
    this.db.exec(
      'CREATE INDEX IF NOT EXISTS idx_event_id ON event_queue(event_id)',
    );

    const stmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM event_queue WHERE status = ?',
    );
    const pendingCount = stmt.get('pending') as { count: number };
    this.logger.log(
      `SQLite database initialized at ${this.dbPath}. Pending events: ${pendingCount.count}`,
    );
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
      const stmt = this.db.prepare(`
        INSERT INTO event_queue (event_id, event_data, table_name, status)
        VALUES (?, ?, ?, 'pending')
      `);
      stmt.run(eventId, JSON.stringify(event), table);
    }

    return { eventId, table };
  }

  async enqueueBatch(
    events: CreateEventDto[],
  ): Promise<{ count: number; tables: Record<string, number> }> {
    const tables: Record<string, number> = {};

    if (!this.db) {
      return { count: events.length, tables };
    }

    const insert = this.db.prepare(`
      INSERT INTO event_queue (event_id, event_data, table_name, status)
      VALUES (?, ?, ?, 'pending')
    `);

    const insertMany = this.db.transaction(
      (
        eventsToInsert: Array<{
          eventId: string;
          event: CreateEventDto;
          table: string;
        }>,
      ) => {
        for (const { eventId, event, table } of eventsToInsert) {
          insert.run(eventId, JSON.stringify(event), table);
        }
      },
    );

    const eventsToInsert = events.map((event) => ({
      eventId: uuidv4(),
      event,
      table: this.determineTable(event),
    }));

    insertMany(eventsToInsert);

    eventsToInsert.forEach(({ table }) => {
      tables[table] = (tables[table] || 0) + 1;
    });

    return { count: events.length, tables };
  }

  async flushBuffer() {
    if (!this.db) return;

    // Получаем пачку необработанных событий
    const stmt = this.db.prepare(`
      SELECT * FROM event_queue
      WHERE status = 'pending'
      ORDER BY created_at
      LIMIT ?
    `);

    const rows = stmt.all(this.batchSize) as QueuedEvent[];

    if (rows.length === 0) {
      return;
    }

    this.logger.log(`Processing ${rows.length} events from queue`);

    const eventIds = rows.map((e) => e.event_id);

    try {
      // Помечаем как processing
      const updateStmt = this.db.prepare(`
        UPDATE event_queue
        SET status = 'processing', processed_at = CURRENT_TIMESTAMP
        WHERE event_id = ?
      `);

      const updateMany = this.db.transaction((ids: string[]) => {
        for (const id of ids) {
          updateStmt.run(id);
        }
      });

      updateMany(eventIds);

      // Группируем по таблицам
      const eventsByTable = rows.reduce(
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
      const completeStmt = this.db.prepare(`
        UPDATE event_queue
        SET status = 'completed'
        WHERE event_id = ?
      `);

      const completeMany = this.db.transaction((ids: string[]) => {
        for (const id of ids) {
          completeStmt.run(id);
        }
      });

      completeMany(eventIds);

      this.logger.log(`Successfully processed ${rows.length} events`);

      // Очищаем completed события (опционально)
      this.clearCompletedEvents();
    } catch (error) {
      this.logger.error(`Failed to process events: ${error.message}`);

      // Возвращаем статус pending для повторной попытки
      const revertStmt = this.db.prepare(`
        UPDATE event_queue
        SET status = 'pending'
        WHERE event_id = ?
      `);

      const revertMany = this.db.transaction((ids: string[]) => {
        for (const id of ids) {
          revertStmt.run(id);
        }
      });

      revertMany(eventIds);

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

    const stmt = this.db.prepare(`
      SELECT 
        SUM(CASE WHEN table_name = 'user_events' THEN 1 ELSE 0 END) as user_events,
        SUM(CASE WHEN table_name = 'crm_events' THEN 1 ELSE 0 END) as crm_events,
        SUM(CASE WHEN table_name = 'system_events' THEN 1 ELSE 0 END) as system_events,
        COUNT(*) as total
      FROM event_queue 
      WHERE status = 'pending'
    `);

    const result = stmt.get() as {
      user_events: number;
      crm_events: number;
      system_events: number;
      total: number;
    };

    return {
      user_events: result.user_events || 0,
      crm_events: result.crm_events || 0,
      system_events: result.system_events || 0,
      total: result.total || 0,
    };
  }

  clearCompletedEvents() {
    if (!this.db) return;

    const stmt = this.db.prepare(
      `DELETE FROM event_queue WHERE status = 'completed'`,
    );
    const result = stmt.run();

    if (result.changes > 0) {
      this.logger.debug(
        `Cleared ${result.changes} completed events from queue`,
      );
    }
  }
}
