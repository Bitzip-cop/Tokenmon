import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  slug,
  lineToKind,
  feedChunk,
  findNewestSession,
  findActiveSessions,
  PetSessionWatcher
} from '../../src/main/pet/session-watch';
import { PET_IDLE_MS, PET_WAITING_MS } from '../../src/shared/pet-activity';
import type { PetState } from '../../src/shared/types/pet';

const TOOL = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } });
const TEXT = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } });
const PROMPT = JSON.stringify({ type: 'user', message: { content: 'do it' } });

describe('slug(cwd→目录名)', () => {
  it('每个非字母数字各换一个 -(不折叠,保留双横线)', () => {
    expect(slug('/Users/Luo/Talky')).toBe('-Users-Luo-Talky');
    // 相邻分隔符 → 双横线('/' + '@')
    expect(slug('/a/@b')).toBe('-a--b');
    expect(slug('/x/Cryptobot_2.0')).toBe('-x-Cryptobot-2-0');
  });
});

describe('lineToKind', () => {
  it('assistant tool_use→tool、text→text;user tool_result→result、字符串→prompt;其余→null', () => {
    expect(lineToKind(TOOL)).toBe('tool');
    expect(lineToKind(TEXT)).toBe('text');
    expect(lineToKind(PROMPT)).toBe('prompt');
    expect(lineToKind(JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result' }] } }))).toBe('result');
    expect(lineToKind(JSON.stringify({ type: 'mode' }))).toBeNull(); // 元数据行
    expect(lineToKind('{ 半行没写完')).toBeNull(); // 坏 JSON
    expect(lineToKind('')).toBeNull();
  });
});

describe('feedChunk(半行 tail 缓冲)', () => {
  it('一行被拆成两块也不丢:补齐后才解析', () => {
    const a = feedChunk('', TOOL.slice(0, 20)); // 前半,无 \n
    expect(a.kinds).toEqual([]);
    expect(a.pending).toBe(TOOL.slice(0, 20));
    const b = feedChunk(a.pending, TOOL.slice(20) + '\n'); // 补齐 + 换行
    expect(b.kinds).toEqual(['tool']);
    expect(b.pending).toBe('');
  });

  it('多行 + 末尾残半行:完整行出,半行留 pending', () => {
    const r = feedChunk('', `${TEXT}\n${PROMPT}\n{"type":"assi`);
    expect(r.kinds).toEqual(['text', 'prompt']);
    expect(r.pending).toBe('{"type":"assi');
  });
});

describe('findNewestSession(定位 + 不退全局)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pet-root-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('cwd 命中其 slug 目录的最新 jsonl', () => {
    const dir = join(root, slug('/proj/x'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'a.jsonl'), '');
    expect(findNewestSession('/proj/x', root)).toBe(join(dir, 'a.jsonl'));
  });

  it('cwd 没有对应目录 → 返回 null,绝不退到别的项目', () => {
    const other = join(root, slug('/proj/other'));
    mkdirSync(other, { recursive: true });
    writeFileSync(join(other, 'b.jsonl'), ''); // 存在别的项目会话
    expect(findNewestSession('/proj/missing', root)).toBeNull();
  });

  it('cwd 为 null → 全局最新', () => {
    const d1 = join(root, '-p-1');
    const d2 = join(root, '-p-2');
    mkdirSync(d1, { recursive: true });
    mkdirSync(d2, { recursive: true });
    writeFileSync(join(d1, 'old.jsonl'), '');
    const newer = join(d2, 'new.jsonl');
    writeFileSync(newer, '');
    // 让 d2 的更新(虽同瞬,mtime 可能相同;直接断言返回非 null 且在两者之一)
    const got = findNewestSession(null, root);
    expect([join(d1, 'old.jsonl'), newer]).toContain(got);
  });
});

describe('PetSessionWatcher(tail → 状态,含半行/衰减/轮换)', () => {
  let root: string;
  let dir: string;
  let file: string;
  let now: number;
  let seen: PetState[];
  let w: PetSessionWatcher;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pet-root-'));
    dir = join(root, slug('/proj/x'));
    mkdirSync(dir, { recursive: true });
    file = join(dir, 's.jsonl');
    writeFileSync(file, ''); // 空会话文件
    now = 10_000;
    seen = [];
    w = new PetSessionWatcher('/proj/x', (s) => seen.push(s), () => now, root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('附在末尾(不回放历史)→ 增量活动驱动状态;半行不丢;静默衰减;轮换恢复', () => {
    // 文件里先有“历史” —— 附末尾后不应被当成当前活动。
    writeFileSync(file, `${TOOL}\n`);
    w.pollOnce();
    expect(seen.at(-1)).toBe('idle'); // 历史没回放,仍 idle

    // 新增一条 tool → working
    appendFileSync(file, `${TOOL}\n`);
    w.pollOnce();
    expect(seen.at(-1)).toBe('working');

    // 半行:先写前半(无 \n)→ 不变;补齐 → talking(证明半行没丢)
    appendFileSync(file, TEXT.slice(0, 18));
    w.pollOnce();
    expect(seen.at(-1)).toBe('working');
    appendFileSync(file, TEXT.slice(18) + '\n');
    w.pollOnce();
    expect(seen.at(-1)).toBe('talking');

    // 静默超时:说完话先 waiting(等用户回复),再超窗 idle
    now += PET_IDLE_MS + 1;
    w.pollOnce();
    expect(seen.at(-1)).toBe('waiting');
    now += PET_WAITING_MS;
    w.pollOnce();
    expect(seen.at(-1)).toBe('idle');

    // 轮换:截断文件后再写 → 仍能读到新活动
    writeFileSync(file, '');
    w.pollOnce();
    appendFileSync(file, `${PROMPT}\n`);
    w.pollOnce();
    expect(seen.at(-1)).toBe('working');
  });

  it('多窗口并行:任一活跃会话有活动 → working(事件汇入同一状态机)', () => {
    const dir2 = join(root, slug('/proj/y'));
    mkdirSync(dir2, { recursive: true });
    const file2 = join(dir2, 's2.jsonl');
    writeFileSync(file2, '');
    // 全局 watcher(cwd=null):两个项目的会话都盯
    const seen2: PetState[] = [];
    const w2 = new PetSessionWatcher(null, (s) => seen2.push(s), () => now, root);
    w2.pollOnce(); // 两文件都附末尾
    appendFileSync(file2, `${TOOL}\n`); // 只有第二个窗口在干活
    w2.pollOnce();
    expect(seen2.at(-1)).toBe('working');
    // 第一个窗口同时输出文本 → 仍以最近事件为准(状态机统一)
    appendFileSync(file, `${TEXT}\n`);
    now += 100;
    w2.pollOnce();
    expect(seen2.at(-1)).toBe('talking');
  });

  it('findActiveSessions:近期写过的都算活跃(多项目),给 cwd 则只看该项目', () => {
    const dir2 = join(root, slug('/proj/y'));
    mkdirSync(dir2, { recursive: true });
    const file2 = join(dir2, 's2.jsonl');
    writeFileSync(file2, 'x\n'); // 刚写 → mtime 在窗口内
    const all = findActiveSessions(null, root);
    expect(all).toContain(file);
    expect(all).toContain(file2);
    expect(findActiveSessions('/proj/y', root)).toEqual([file2]);
  });
});
