import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface QueuedEvent {
  id: number;
  event_id: string;
  event_data: string;
  table_name: string;
  created_at: string;
  processed_at: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

@Injectable()
export class SqliteQueueRepository implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqliteQueueRepository.name);
  private db: any | null = null;
  private readonly dbPath: string;

  constructor(private readonly configService: ConfigService) {
    this.dbPath = this.configService.get<string>(
      'queue.sqlite.dbPath',
      'data/events.db',
    );
  }

  onModuleInit() {
    this.initializeDatabase();
  }

  onModuleDestroy() {
    if (this.db) {
      this.db.close();
    }
  }

  private initializeDatabase() {
    const dir = join(process.cwd(), 'data');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      this.logger.log(`Created directory ${dir}`);
    }

    const Database = require('better-sqlite3');
    this.db = new Database(this.dbPath);

    if (!this.db) {
      this.logger.error('Failed to create SQLite database');
      return;
    }

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

  insert(eventId: string, eventData: string, tableName: string): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT INTO event_queue (event_id, event_data, table_name, status)
      VALUES (?, ?, ?, 'pending')
    `);
    stmt.run(eventId, eventData, tableName);
  }

  insertBatch(
    events: Array<{ eventId: string; eventData: string; tableName: string }>,
  ): void {
    if (!this.db) return;

    const insert = this.db.prepare(`
      INSERT INTO event_queue (event_id, event_data, table_name, status)
      VALUES (?, ?, ?, 'pending')
    `);

    const insertMany = this.db.transaction(
      (eventsToInsert: Array<[string, string, string]>) => {
        for (const [eventId, eventData, tableName] of eventsToInsert) {
          insert.run(eventId, eventData, tableName);
        }
      },
    );

    const batchData = events.map(
      (e) => [e.eventId, e.eventData, e.tableName] as [string, string, string],
    );
    insertMany(batchData);
  }

  getPendingEvents(batchSize: number): QueuedEvent[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT * FROM event_queue
      WHERE status = 'pending'
      ORDER BY created_at
      LIMIT ?
    `);

    return stmt.all(batchSize) as QueuedEvent[];
  }

  markAsProcessing(eventIds: string[]): void {
    if (!this.db) return;

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
  }

  markAsCompleted(eventIds: string[]): void {
    if (!this.db) return;

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
  }

  revertToPending(eventIds: string[]): void {
    if (!this.db) return;

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
  }

  deleteCompleted(): number {
    if (!this.db) return 0;

    const stmt = this.db.prepare(
      `DELETE FROM event_queue WHERE status = 'completed'`,
    );
    const result = stmt.run();
    return result.changes;
  }

  getPendingCount(): {
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
}
