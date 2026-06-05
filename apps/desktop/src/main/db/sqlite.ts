// better-sqlite3 连接管理(规范 §9)。单例;只此处建连接,其他模块走 repository。
import Database from 'better-sqlite3';
import { dbPath } from '../config/paths';
import { runMigrations } from './migrations';
import { createLogger } from '../logging/logger';

const log = createLogger('db:sqlite');

/** better-sqlite3 实例类型(export = 模块,需经默认导入取命名空间)。 */
export type DB = Database.Database;

let db: DB | null = null;

/** 打开(或返回已打开的)数据库连接并完成迁移。 */
export function getDb(): DB {
  if (db) return db;
  const path = dbPath();
  log.info('opening database', { path });
  db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  runMigrations(db);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * 测试用:打开内存库(规范 §9.1)。不走单例,调用方自行持有。
 */
export function openInMemoryDb(): DB {
  const mem = new Database(':memory:');
  mem.pragma('foreign_keys = ON');
  runMigrations(mem);
  return mem;
}
