// 轻量日志(规范 §15)。
//
// 规则:不记录完整敏感环境变量;CLI 原始输出进 SQLite cli_events,日志只记运行状态与错误摘要。
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { logsDir } from '../config/paths';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: Level = (process.env.TOKENMON_LOG_LEVEL as Level) || 'info';

function writeFile(line: string): void {
  try {
    appendFileSync(join(logsDir(), 'app.log'), line + '\n', 'utf8');
  } catch {
    // 文件日志为 best-effort;失败时仅依赖 console。
  }
}

function emit(level: Level, scope: string, msg: string, meta?: unknown): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
  const record = { ts: Date.now(), level, scope, msg, ...(meta !== undefined ? { meta } : {}) };
  const line = JSON.stringify(record);
  const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  consoleFn(`[${scope}] ${msg}`, meta ?? '');
  writeFile(line);
}

export interface Logger {
  debug(msg: string, meta?: unknown): void;
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (msg, meta) => emit('debug', scope, msg, meta),
    info: (msg, meta) => emit('info', scope, msg, meta),
    warn: (msg, meta) => emit('warn', scope, msg, meta),
    error: (msg, meta) => emit('error', scope, msg, meta)
  };
}
