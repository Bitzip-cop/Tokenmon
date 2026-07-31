import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UsageLedger, type KVStore } from '../../src/main/pet/usage-ledger';
import { parseCodexUsage, DEFAULT_PRICING } from '../../src/shared/pet-usage';
import type { PetSource } from '../../src/main/pet/sources';

// 内存假 KV(绕开 better-sqlite3 的 ABI)。
function fakeStore(): KVStore & { dump: Record<string, string> } {
  const data: Record<string, string> = {};
  return { get: (k) => data[k] ?? null, set: (k, v) => void (data[k] = v), dump: data };
}

const DAY = '2026-06-04';
const now = (): number => Date.parse(`${DAY}T12:00:00`); // 本地某日中午,确定性

const rec = (output: number): string =>
  JSON.stringify({
    type: 'assistant',
    message: { usage: { input_tokens: 1, output_tokens: output, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
    timestamp: `${DAY}T12:00:00`
  });

const recId = (output: number, id: string): string =>
  JSON.stringify({
    type: 'assistant',
    message: { id, usage: { input_tokens: 1, output_tokens: output, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
    timestamp: `${DAY}T12:00:00`
  });

describe('UsageLedger(增量摄取账本)', () => {
  let root: string;
  let file: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pet-led-'));
    const dir = join(root, '-p-x');
    mkdirSync(dir, { recursive: true });
    file = join(dir, 's.jsonl');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('基线不回算历史:首次只记 cursor,既有内容不计入', () => {
    writeFileSync(file, `${rec(999)}\n`); // 装 pet 之前就有的历史
    const led = new UsageLedger(fakeStore(), now, root);
    expect(led.ingest()).toBe(0);
    expect(led.snapshot().allTime.output).toBe(0); // 历史没算进来
  });

  it('增量只计新内容,记入今日 + 历史', () => {
    writeFileSync(file, `${rec(100)}\n`); // 历史(基线后忽略)
    const led = new UsageLedger(fakeStore(), now, root);
    led.ingest();
    appendFileSync(file, `${rec(30)}\n${rec(20)}\n`); // 新增 50
    expect(led.ingest()).toBe(50);
    const s = led.snapshot();
    expect(s.allTime.output).toBe(50);
    expect(s.today.output).toBe(50);
  });

  it('半行不丢:partial 不推进 cursor,补齐后才计入', () => {
    writeFileSync(file, '');
    const led = new UsageLedger(fakeStore(), now, root);
    led.ingest();
    const line = `${rec(40)}\n`;
    appendFileSync(file, line.slice(0, 15)); // 半行(无 \n)
    expect(led.ingest()).toBe(0); // 没完整行 → 不计
    appendFileSync(file, line.slice(15)); // 补齐
    expect(led.ingest()).toBe(40);
  });

  it('文件轮换(截断)后仍能继续计', () => {
    writeFileSync(file, '');
    const led = new UsageLedger(fakeStore(), now, root);
    led.ingest();
    appendFileSync(file, `${rec(10)}\n`);
    expect(led.ingest()).toBe(10);
    writeFileSync(file, ''); // 截断
    led.ingest();
    appendFileSync(file, `${rec(7)}\n`);
    expect(led.ingest()).toBe(7);
  });

  it('持久化:换个实例从同一 store 恢复,不重新基线、不重复计', () => {
    writeFileSync(file, '');
    const store = fakeStore();
    const a = new UsageLedger(store, now, root);
    a.ingest();
    appendFileSync(file, `${rec(25)}\n`);
    a.ingest();
    expect(a.snapshot().allTime.output).toBe(25);
    // 新实例:读持久化状态,既有 25 不重复计
    const b = new UsageLedger(store, now, root);
    expect(b.snapshot().allTime.output).toBe(25);
    expect(b.ingest()).toBe(0); // 没新内容
    expect(b.snapshot().allTime.output).toBe(25);
  });

  it('同一 message.id 多行 usage 只计一次(去重)', () => {
    writeFileSync(file, '');
    const led = new UsageLedger(fakeStore(), now, root);
    led.ingest();
    appendFileSync(file, `${recId(30, 'msg_1')}\n${recId(30, 'msg_1')}\n${recId(20, 'msg_2')}\n`);
    expect(led.ingest()).toBe(50); // msg_1 只计一次(30)+ msg_2(20);重复的 msg_1 跳过
    expect(led.snapshot().allTime.output).toBe(50);
  });

  // ---- sub-agent 转录(<会话id>/subagents/agent-*.jsonl)----

  it('sub-agent 转录计入:subagents 下新增用量与主会话同账', () => {
    writeFileSync(file, '');
    const led = new UsageLedger(fakeStore(), now, root);
    led.ingest();
    // 主会话派出 sub-agent → 转录单独落盘在 <slug>/<会话id>/subagents/
    const subDir = join(root, '-p-x', 's-id', 'subagents');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, 'agent-a1.jsonl'), `${rec(70)}\n`);
    appendFileSync(file, `${rec(30)}\n`);
    expect(led.ingest()).toBe(100); // 主 30 + sub-agent 70
    expect(led.snapshot().allTime.output).toBe(100);
  });

  it('旧账本迁移:现存 subagents 文件打基线不回算,此后增量照计', () => {
    writeFileSync(file, '');
    const subDir = join(root, '-p-x', 's-id', 'subagents');
    mkdirSync(subDir, { recursive: true });
    const subFile = join(subDir, 'agent-a1.jsonl');
    writeFileSync(subFile, `${rec(999)}\n`); // 引入扫描前已存在的 sub-agent 历史
    const store = fakeStore();
    // 伪造旧格式账本:无 subagentsBaselined(也没该文件的 cursor)
    store.set(
      'pet-usage-ledger',
      JSON.stringify({
        petStartDate: '2026-06-01',
        cursors: { [file]: 0 },
        allTime: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
        byDay: {},
        lastOutputTs: null,
        countedIds: [],
        allTimeCostUSD: 0,
        byDayCost: {},
        fileModels: {},
        lastModel: null
      })
    );
    const led = new UsageLedger(store, now, root);
    expect(led.ingest()).toBe(0); // 历史 999 不回算(基线哲学一致)
    appendFileSync(subFile, `${rec(40)}\n`);
    expect(led.ingest()).toBe(40); // 迁移后的增量正常计入
  });

  it('嵌套 workflow 转录计入:subagents/workflows/wf_*/agent-*.jsonl 同账(deep-research 等)', () => {
    writeFileSync(file, '');
    const led = new UsageLedger(fakeStore(), now, root);
    led.ingest();
    // Workflow 编排派出去的 agent 落在更深一层
    const wfDir = join(root, '-p-x', 's-id', 'subagents', 'workflows', 'wf_abc');
    mkdirSync(wfDir, { recursive: true });
    writeFileSync(join(wfDir, 'agent-w1.jsonl'), `${rec(70)}\n`);
    appendFileSync(file, `${rec(30)}\n`);
    expect(led.ingest()).toBe(100); // 主 30 + 嵌套 workflow agent 70(不递归就只有 30)
    expect(led.snapshot().allTime.output).toBe(100);
  });

  it('旧账本迁移:已 subagentsBaselined 的老账本,新列出的嵌套 workflow 文件也打基线不回算', () => {
    writeFileSync(file, '');
    const wfDir = join(root, '-p-x', 's-id', 'subagents', 'workflows', 'wf_abc');
    mkdirSync(wfDir, { recursive: true });
    const wfFile = join(wfDir, 'agent-w1.jsonl');
    writeFileSync(wfFile, `${rec(999)}\n`); // 扩到整棵子树扫描前就存在的嵌套历史
    const store = fakeStore();
    // 伪造 0.80/0.81 账本:subagentsBaselined=true,但无 subagentsWorkflowsBaselined(且没该嵌套文件的 cursor)
    store.set(
      'pet-usage-ledger',
      JSON.stringify({
        petStartDate: '2026-06-01',
        cursors: { [file]: 0 },
        allTime: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
        byDay: {},
        lastOutputTs: null,
        countedIds: [],
        allTimeCostUSD: 0,
        byDayCost: {},
        fileModels: {},
        lastModel: null,
        subagentsBaselined: true
      })
    );
    const led = new UsageLedger(store, now, root);
    expect(led.ingest()).toBe(0); // 历史 999 不回算(不被一次性补成尖峰)
    appendFileSync(wfFile, `${rec(40)}\n`);
    expect(led.ingest()).toBe(40); // 迁移后增量正常计入
  });

  // ---- 按模型逐条计价 ----

  const recModel = (output: number, model: string): string =>
    JSON.stringify({
      type: 'assistant',
      message: { model, usage: { input_tokens: 0, output_tokens: output, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
      timestamp: `${DAY}T12:00:00`
    });

  it('Claude 中途切模型:每笔按各自模型单价计费(Opus $25/M、Haiku $5/M)', () => {
    writeFileSync(file, '');
    const led = new UsageLedger(fakeStore(), now, root);
    led.ingest();
    appendFileSync(file, `${recModel(1_000_000, 'claude-opus-4-8')}\n${recModel(1_000_000, 'claude-haiku-4-5')}\n`);
    led.ingest();
    const s = led.snapshot();
    expect(s.allTime.output).toBe(2_000_000);
    expect(s.todayCostUSD).toBeCloseTo(25 + 5, 6); // 不是 2M 全按 opus(50)
    expect(s.allTimeCostUSD).toBeCloseTo(30, 6);
  });

  it('旧账本迁移:无成本字段 → 按源默认单价折算一次,之后增量按真实模型计价', () => {
    writeFileSync(file, '');
    const store = fakeStore();
    // 伪造旧格式账本:有 totals、无 allTimeCostUSD/byDayCost
    store.set(
      'pet-usage-ledger',
      JSON.stringify({
        petStartDate: '2026-06-01',
        cursors: { [file]: 0 },
        allTime: { input: 0, output: 1_000_000, cacheWrite: 0, cacheRead: 0 },
        byDay: { [DAY]: { input: 0, output: 1_000_000, cacheWrite: 0, cacheRead: 0 } },
        lastOutputTs: null,
        countedIds: [],
        lastQuota: null,
        lastQuotaTs: null
      })
    );
    const led = new UsageLedger(store, now, root);
    const s = led.snapshot();
    expect(s.allTimeCostUSD).toBeCloseTo(25, 6); // 1M output × opus 默认档 $25/M
    expect(s.todayCostUSD).toBeCloseTo(25, 6);
  });
});

describe('UsageLedger(Codex:turn_context 声明模型)', () => {
  let root: string;
  let file: string;
  const codexSource = (r: string): PetSource => ({
    id: 'codex',
    root: r,
    ledgerKey: 'pet-usage-ledger-codex-test',
    parseLine: parseCodexUsage,
    listFiles: (rt) => {
      try {
        return readdirSync(rt)
          .filter((n) => n.endsWith('.jsonl'))
          .map((n) => join(rt, n));
      } catch {
        return [];
      }
    },
    pricing: DEFAULT_PRICING.gpt55
  });
  const turnCtx = (model: string): string =>
    JSON.stringify({ type: 'turn_context', timestamp: `${DAY}T12:00:00Z`, payload: { model } });
  const tokenCount = (
    output: number,
    rateLimits?: Record<string, unknown>,
    timestamp = `${DAY}T12:00:00Z`
  ): string =>
    JSON.stringify({
      type: 'event_msg',
      timestamp,
      payload: {
        type: 'token_count',
        info: { last_token_usage: { input_tokens: 0, output_tokens: output } },
        ...(rateLimits ? { rate_limits: rateLimits } : {})
      }
    });
  const rateLimits = (limitId: string, usedPercent: number): Record<string, unknown> => ({
    limit_id: limitId,
    limit_name: limitId === 'codex' ? null : 'Model-specific quota',
    primary: { used_percent: usedPercent, window_minutes: 10080, resets_at: 1785985788 },
    secondary: null,
    plan_type: 'prolite'
  });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pet-led-codex-'));
    file = join(root, 'rollout-1.jsonl');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('同文件切模型:5.5 与 5.4 各按各价(gpt-5.5 $30/M、gpt-5.4 $15/M)', () => {
    writeFileSync(file, '');
    const led = new UsageLedger(fakeStore(), now, root, codexSource(root));
    led.ingest();
    appendFileSync(
      file,
      `${turnCtx('gpt-5.5')}\n${tokenCount(1_000_000)}\n${turnCtx('gpt-5.4')}\n${tokenCount(1_000_000)}\n`
    );
    led.ingest();
    expect(led.snapshot().todayCostUSD).toBeCloseTo(30 + 15, 6);
  });

  it('模型声明跨 tick / 跨实例持久(fileModels):后到的 token_count 仍按上次声明的模型计价', () => {
    writeFileSync(file, '');
    const store = fakeStore();
    const a = new UsageLedger(store, now, root, codexSource(root));
    a.ingest();
    appendFileSync(file, `${turnCtx('gpt-5.4')}\n`); // 本 tick 只有模型声明
    a.ingest();
    appendFileSync(file, `${tokenCount(1_000_000)}\n`); // 用量在下一个实例才到
    const b = new UsageLedger(store, now, root, codexSource(root));
    b.ingest();
    expect(b.snapshot().todayCostUSD).toBeCloseTo(15, 6); // 按 gpt-5.4,不是 5.5 兜底的 30
  });

  it('无 turn_context(如截断后)→ 按 gpt-5.5 兜底', () => {
    writeFileSync(file, '');
    const led = new UsageLedger(fakeStore(), now, root, codexSource(root));
    led.ingest();
    appendFileSync(file, `${tokenCount(1_000_000)}\n`);
    led.ingest();
    expect(led.snapshot().todayCostUSD).toBeCloseTo(30, 6);
  });

  it('通用 codex quota 不被时间更晚的模型专属 quota 覆盖', () => {
    writeFileSync(file, '');
    const led = new UsageLedger(fakeStore(), now, root, codexSource(root));
    led.ingest();
    appendFileSync(
      file,
      `${tokenCount(1, rateLimits('codex', 6), `${DAY}T12:00:01Z`)}\n` +
        `${tokenCount(1, rateLimits('codex_bengalfox', 0), `${DAY}T12:00:02Z`)}\n`
    );
    led.ingest();
    expect(led.snapshot().lastQuota).toMatchObject({
      limitId: 'codex',
      usedPercent: 6,
      windowMinutes: 10080
    });
  });

  it('同一计划的稀疏更新按窗口合并:更新 wk 时仍保留未过期的 5h', () => {
    writeFileSync(file, '');
    const led = new UsageLedger(fakeStore(), now, root, codexSource(root));
    led.ingest();
    const bothWindows = {
      limit_id: 'codex',
      plan_type: 'plus',
      primary: { used_percent: 10, window_minutes: 300, resets_at: Date.parse(`${DAY}T14:00:00Z`) / 1000 },
      secondary: { used_percent: 20, window_minutes: 10080, resets_at: Date.parse('2026-06-10T00:00:00Z') / 1000 }
    };
    const weeklyUpdate = {
      limit_id: 'codex',
      plan_type: 'plus',
      primary: { used_percent: 21, window_minutes: 10080, resets_at: Date.parse('2026-06-10T00:00:00Z') / 1000 },
      secondary: null
    };
    appendFileSync(
      file,
      `${tokenCount(1, bothWindows, `${DAY}T12:00:01Z`)}\n${tokenCount(1, weeklyUpdate, `${DAY}T12:00:02Z`)}\n`
    );
    led.ingest();
    expect(led.snapshot().lastQuota).toMatchObject({
      usedPercent: 10,
      windowMinutes: 300,
      secondaryPercent: 21,
      secondaryWindowMinutes: 10080
    });
  });

  it('旧账本迁移:从最近日志重选通用 codex quota,修正已缓存的模型专属值', () => {
    const standard = tokenCount(1, rateLimits('codex', 6), `${DAY}T12:00:01Z`);
    const modelSpecific = tokenCount(1, rateLimits('codex_bengalfox', 0), `${DAY}T12:00:02Z`);
    const existing = `${standard}\n${modelSpecific}\n`;
    writeFileSync(file, existing);
    const store = fakeStore();
    store.set(
      'pet-usage-ledger-codex-test',
      JSON.stringify({
        petStartDate: DAY,
        cursors: { [file]: Buffer.byteLength(existing) },
        allTime: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
        byDay: {},
        lastOutputTs: null,
        countedIds: [],
        lastQuota: { usedPercent: 0, windowMinutes: 10080, resetsAt: 1785985788, planType: 'prolite' },
        lastQuotaTs: `${DAY}T12:00:02Z`,
        allTimeCostUSD: 0,
        byDayCost: {},
        fileModels: {},
        lastModel: null,
        lastModelTs: null,
        subagentsBaselined: true,
        subagentsWorkflowsBaselined: true
      })
    );
    const led = new UsageLedger(store, now, root, codexSource(root));
    expect(led.snapshot().lastQuota).toMatchObject({ limitId: 'codex', usedPercent: 6 });
  });
});
