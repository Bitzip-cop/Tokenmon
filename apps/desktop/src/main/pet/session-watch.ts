// 盯住某项目最新的 Claude Code 会话 JSONL,把新写入的事件映射成角色状态(PetState)。
// 轮询式(每 ~700ms 读增量),比 fs.watch 稳(避开编辑器原子写/重命名等坑)。
// 防御:所有 fs 调用都安全包裹;半行 tail 用 pending 缓冲;cwd 定位失败不退全局。
import { readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { PetActivityTracker, type PetActivityKind } from '@shared/pet-activity';
import type { PetState } from '@shared/types/pet';
import { createLogger } from '../logging/logger';

const log = createLogger('pet:session-watch');
const PROJECTS = join(homedir(), '.claude', 'projects');
const POLL_MS = 700;

// Claude Code 把 cwd 编码成项目目录名:**每个**非字母数字字符各换一个 '-'(不折叠;
// 真实目录里存在 '--' 双横线,如 'Application-Support--tokenmon')。
export function slug(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

function safeStatMs(file: string): number {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return -1;
  }
}
function safeSize(file: string): number {
  try {
    return statSync(file).size;
  } catch {
    return -1;
  }
}

/** 读取 [start, end) 字节(tail 增量)。任何错误(文件被删/轮换)→ 返回 ''。 */
function readRange(file: string, start: number, end: number): string {
  if (end <= start) return '';
  let fd: number;
  try {
    fd = openSync(file, 'r');
  } catch {
    return '';
  }
  try {
    const buf = Buffer.alloc(end - start);
    const n = readSync(fd, buf, 0, buf.length, start);
    return buf.toString('utf8', 0, n);
  } catch {
    return '';
  } finally {
    try {
      closeSync(fd);
    } catch {
      /* ignore */
    }
  }
}

function newestJsonlIn(dir: string): string | null {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  let best: string | null = null;
  let bestMt = -1;
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue;
    const mt = safeStatMs(join(dir, name)); // 文件可能在扫描间消失 → 跳过本个,不中断整轮
    if (mt > bestMt) {
      bestMt = mt;
      best = join(dir, name);
    }
  }
  return best;
}

/**
 * 找会话 jsonl。
 * - cwd 给了:**只**在其 slug 目录里找(找不到返回 null,绝不退到别的项目,免得宠物跟错)。
 * - cwd 为 null:全局最新(扫所有项目目录)。
 */
export function findNewestSession(cwd: string | null, root: string = PROJECTS): string | null {
  if (cwd) return newestJsonlIn(join(root, slug(cwd)));
  let dirs: string[];
  try {
    dirs = readdirSync(root);
  } catch {
    return null;
  }
  let best: string | null = null;
  let bestMt = -1;
  for (const d of dirs) {
    const f = newestJsonlIn(join(root, d));
    if (!f) continue;
    const mt = safeStatMs(f);
    if (mt > bestMt) {
      bestMt = mt;
      best = f;
    }
  }
  return best;
}

/** 一行会话记录 → 粗活动类型(没有可用信号则 null)。 */
export function lineToKind(line: string): PetActivityKind | null {
  const s = line.trim();
  if (!s) return null;
  let d: { type?: string; message?: { content?: unknown } };
  try {
    d = JSON.parse(s);
  } catch {
    return null;
  }
  const content = d.message?.content;
  const blocks = Array.isArray(content) ? (content as { type?: string; text?: string }[]) : [];
  if (d.type === 'assistant') {
    if (blocks.some((b) => b?.type === 'tool_use')) return 'tool';
    if (blocks.some((b) => b?.type === 'text' && String(b.text ?? '').trim())) return 'text';
    return null;
  }
  if (d.type === 'user') {
    if (blocks.some((b) => b?.type === 'tool_result')) return 'result';
    if (typeof content === 'string' || blocks.some((b) => b?.type === 'text')) return 'prompt';
    return null;
  }
  return null;
}

/**
 * 增量切行:上次残留的半行 pending 接上本次 chunk,只交出 newline 结尾的完整行;
 * 末尾未完成的半行留作新的 pending(下次补齐),绝不丢。纯函数,可单测。
 */
export function feedChunk(pending: string, chunk: string): { kinds: PetActivityKind[]; pending: string } {
  const data = pending + chunk;
  const parts = data.split('\n');
  const rest = parts.pop() ?? ''; // 最后一段是未完成的半行(或空)
  const kinds: PetActivityKind[] = [];
  for (const line of parts) {
    const k = lineToKind(line);
    if (k) kinds.push(k);
  }
  return { kinds, pending: rest };
}

export class PetSessionWatcher {
  private tracker = new PetActivityTracker();
  private file: string | null = null;
  private offset = 0;
  private pending = '';
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastEmitted: PetState | null = null;

  constructor(
    private readonly cwd: string | null,
    private readonly onState: (s: PetState) => void,
    private readonly now: () => number = Date.now,
    private readonly root: string = PROJECTS
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), POLL_MS);
    this.tick();
    log.info('pet watcher started', { cwd: this.cwd ?? '(global newest)' });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** 跑一轮(测试用,直接调 poll 让错误暴露;生产走带兜底的 timer→tick)。 */
  pollOnce(): void {
    this.poll();
  }

  private tick(): void {
    // timer 回调:任何异常都吞掉,绝不让一轮坏 poll 崩 Electron main。
    try {
      this.poll();
    } catch (e) {
      log.warn('pet poll failed', { message: String(e).slice(0, 160) });
    }
  }

  private poll(): void {
    const newest = findNewestSession(this.cwd, this.root);
    if (newest && newest !== this.file) {
      const sz = safeSize(newest);
      if (sz >= 0) {
        // 切到新会话:附在末尾,只对“之后”的新活动反应(不回放整段历史)。
        this.file = newest;
        this.offset = sz;
        this.pending = '';
      }
    }
    if (this.file) {
      const size = safeSize(this.file);
      if (size < 0) {
        this.file = null; // 文件没了 → 下轮重新定位
      } else if (size > this.offset) {
        const chunk = readRange(this.file, this.offset, size);
        this.offset = size;
        const { kinds, pending } = feedChunk(this.pending, chunk);
        this.pending = pending;
        for (const k of kinds) this.tracker.feed(k, this.now());
      } else if (size < this.offset) {
        this.offset = size; // 被截断/轮换
        this.pending = '';
      }
    }
    const s = this.tracker.current(this.now());
    if (s !== this.lastEmitted) {
      this.lastEmitted = s;
      this.onState(s);
    }
  }
}
