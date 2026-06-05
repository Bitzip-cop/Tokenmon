// 版本迁移(规范 §9.2)。MVP 只有 v1:建表 + 写入 schema 版本。
import type { DB } from './sqlite';
import { SCHEMA_VERSION } from '@shared/constants';
import { SCHEMA_STATEMENTS } from './schema';
import { createLogger } from '../logging/logger';

const log = createLogger('db:migrations');

function getSchemaVersion(db: DB): number {
  const row = db
    .prepare(`SELECT value FROM meta WHERE key = 'schema_version'`)
    .get() as { value: string } | undefined;
  return row ? Number(row.value) : 0;
}

function setSchemaVersion(db: DB, version: number): void {
  db.prepare(
    `INSERT INTO meta(key, value) VALUES('schema_version', @v)
     ON CONFLICT(key) DO UPDATE SET value = @v`
  ).run({ v: String(version) });
}

/** 为已存在的表补列(老库升级用)。ALTER ADD COLUMN 无 IF NOT EXISTS,故先查 pragma 判重,保证幂等。 */
function addColumnIfMissing(db: DB, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.length === 0) return; // 表还不存在(全新库)——建表已带新列,无需补。
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  log.info('added column', { table, column });
}

function isIndexStatement(stmt: string): boolean {
  return /CREATE\s+INDEX/i.test(stmt);
}

/** v2:tasks 协作列。新库由 schema.ts 的 CREATE 直接带上;老库在此补齐。 */
function migrateToV2(db: DB): void {
  addColumnIfMissing(db, 'tasks', 'kind', `kind TEXT NOT NULL DEFAULT 'single'`);
  addColumnIfMissing(db, 'tasks', 'parent_task_id', 'parent_task_id TEXT');
  addColumnIfMissing(db, 'tasks', 'collab_role', 'collab_role TEXT');
  addColumnIfMissing(db, 'tasks', 'result_summary', 'result_summary TEXT');
}

/** v3:tasks.external_ref(历史会话导入对应的原生会话 id)。 */
function migrateToV3(db: DB): void {
  addColumnIfMissing(db, 'tasks', 'external_ref', 'external_ref TEXT');
}

/** 初始化/升级 schema。幂等。 */
export function runMigrations(db: DB): void {
  // meta 表必须先存在,才能读版本。
  db.exec(SCHEMA_STATEMENTS[0]);
  const current = getSchemaVersion(db);
  if (current >= SCHEMA_VERSION) {
    log.debug('schema up to date', { current });
    return;
  }

  log.info('applying schema', { from: current, to: SCHEMA_VERSION });
  // 顺序很关键:① 先建表(IF NOT EXISTS) → ② 老库补列 → ③ 再建索引。
  // 因为新索引可能引用新列(idx_tasks_parent → parent_task_id),必须等列就位后再建。
  const tableStmts = SCHEMA_STATEMENTS.filter((s) => !isIndexStatement(s));
  const indexStmts = SCHEMA_STATEMENTS.filter(isIndexStatement);
  const apply = db.transaction(() => {
    for (const stmt of tableStmts) db.exec(stmt); // ① 新库一步到位;老库无副作用。
    if (current < 2) migrateToV2(db); // ② 老库 v1 → v2 补列。
    if (current < 3) migrateToV3(db); // 老库 → v3 补列。
    for (const stmt of indexStmts) db.exec(stmt); // ③ 此时新列已存在。
    setSchemaVersion(db, SCHEMA_VERSION);
  });
  apply();
  log.info('schema applied', { version: SCHEMA_VERSION });
}
