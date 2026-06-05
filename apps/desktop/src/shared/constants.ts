// 跨进程共享常量。纯值、无副作用(规范 §4.4)。

/** SQLite 文件名(规范 §9.1)。实际路径由 main/config/paths.ts 解析。 */
export const DB_FILE_NAME = 'tokenmon.sqlite';
export const DEV_DB_FILE_NAME = 'dev.sqlite';

/** chokidar 默认忽略规则(规范 §10.1)。 */
export const DEFAULT_IGNORE_GLOBS = [
  '**/.git/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/*.log'
] as const;

/**
 * 文件归属时间窗口(R4)。chokidar 文件事件若落在某个 agent tool_use 事件
 * 之后的该窗口内,视为同一变更;否则标记为 user 手改。可后续实测调参。
 */
export const FILE_ATTRIBUTION_WINDOW_MS = 1500;

/** diff 超过该字节数则截断,UI 显示摘要(规范 §10.3)。 */
export const DIFF_TRUNCATE_BYTES = 200_000;

/** TTS 单次播报最大字符数,超出需分段/截断(规范 §11.2)。 */
export const TTS_MAX_CHARS = 600;

/** 当前数据库 schema 版本(migrations 用)。v2:协作列;v3:tasks 增 external_ref(历史会话导入);v4:app_state(画布布局等 UI 状态)。 */
export const SCHEMA_VERSION = 4;
