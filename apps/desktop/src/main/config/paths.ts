// 本地路径解析(规范 §9.1 / §15)。
//
// 默认数据/日志写入 Electron userData;可用环境变量覆盖到仓库 data/ logs/ 便于开发。
import { app } from 'electron';
import { join, dirname } from 'node:path';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { DB_FILE_NAME, DEV_DB_FILE_NAME } from '@shared/constants';

function ensureDir(dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 0.69 改名迁移(talky → tokenmon):把旧 userData(talky-desktop)下的 data/ 搬到新位置,
 * 保住本机已有账本(pet 起始日/今日历史/形象选择/动作映射)。须在首次 getDb() 之前调用。
 */
export function migrateLegacyData(): void {
  if (app.isPackaged) return; // 旧 talky 数据只存在于 dev(从没发过打包版);打包版别把 dev 数据搬走
  if (process.env.TOKENMON_DATA_DIR) return; // 显式指定数据目录则不迁移
  try {
    const newData = join(app.getPath('userData'), 'data');
    // 旧 dev userData 是字面 "@talky/desktop" 两级目录(Electron 直接用 package.json name 当目录名)
    const oldData = join(app.getPath('appData'), '@talky', 'desktop', 'data');
    if (!existsSync(newData) && existsSync(oldData)) {
      mkdirSync(dirname(newData), { recursive: true });
      renameSync(oldData, newData);
    }
    // 库文件名:talky.sqlite → tokenmon.sqlite(打包版;dev 库 dev.sqlite 名字不变)
    const oldDb = join(newData, 'talky.sqlite');
    const newDb = join(newData, DB_FILE_NAME);
    if (existsSync(oldDb) && !existsSync(newDb)) renameSync(oldDb, newDb);
  } catch {
    /* 迁移失败 → 当作全新安装,不阻断启动 */
  }
}

/** 数据根目录。TOKENMON_DATA_DIR 可覆盖(如指向仓库根 data/)。 */
export function dataDir(): string {
  const base = process.env.TOKENMON_DATA_DIR ?? join(app.getPath('userData'), 'data');
  return ensureDir(base);
}

/** 日志根目录。TOKENMON_LOGS_DIR 可覆盖。 */
export function logsDir(): string {
  const base = process.env.TOKENMON_LOGS_DIR ?? join(app.getPath('userData'), 'logs');
  return ensureDir(base);
}

/** SQLite 文件绝对路径(开发用 dev.sqlite,打包用 tokenmon.sqlite)。 */
export function dbPath(): string {
  const fileName = app.isPackaged ? DB_FILE_NAME : DEV_DB_FILE_NAME;
  return join(dataDir(), fileName);
}

/**
 * 默认工作区目录。
 *
 * 用 userData 下的 scratch 目录(小而安全,可被文件监听):
 * Claude Code 的**全局**配置(~/.claude/CLAUDE.md、settings、MCP、skills)无论 cwd 都会加载,
 * 所以全局环境照样生效;**项目级** CLAUDE.md/记忆/文件监听则在用户用工作区选择器选定具体项目后生效。
 * 不默认用 HOME —— 递归监听整个 HOME 会打爆文件描述符(EMFILE)。
 * TOKENMON_WORKSPACE 可覆盖默认。
 */
export function defaultWorkspaceDir(): string {
  const base = process.env.TOKENMON_WORKSPACE ?? join(app.getPath('userData'), 'default-workspace');
  return ensureDir(base);
}
