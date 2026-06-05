import { describe, it, expect } from 'vitest';
import {
  parseUsage,
  parseCodexUsage,
  addTotals,
  emptyTotals,
  costUSD,
  costBreakdown,
  pricingFor,
  pricingForModel,
  dayKeyOf,
  moodFromActivity,
  MOOD_HAPPY_WITHIN_MS,
  MOOD_SAD_AFTER_MS,
  EatingTracker,
  emptyLedger,
  applyUsage,
  type ParsedUsageLine
} from '../../src/shared/pet-usage';

/** 收窄联合类型:期望是用量行,否则直接失败。 */
function asUsage(r: ReturnType<typeof parseCodexUsage>): ParsedUsageLine {
  if (!r || r.kind !== 'usage') throw new Error(`expected usage line, got ${JSON.stringify(r)}`);
  return r;
}

const assistant = (usage: Record<string, unknown>, ts?: string): string =>
  JSON.stringify({ type: 'assistant', message: { usage }, ...(ts ? { timestamp: ts } : {}) });

describe('parseUsage', () => {
  it('抽取四类 token + timestamp', () => {
    const r = parseUsage(
      assistant(
        { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 5, cache_read_input_tokens: 3000 },
        '2026-06-04T01:00:00Z'
      )
    );
    expect(r?.totals).toEqual({ input: 100, output: 20, cacheWrite: 5, cacheRead: 3000 });
    expect(r?.ts).toBe('2026-06-04T01:00:00Z');
  });

  it('无 usage / 全 0 / 坏 JSON → null', () => {
    expect(parseUsage(JSON.stringify({ type: 'assistant', message: {} }))).toBeNull();
    expect(parseUsage(assistant({ input_tokens: 0, output_tokens: 0 }))).toBeNull();
    expect(parseUsage('{半行')).toBeNull();
    expect(parseUsage('')).toBeNull();
  });

  it('返回去重键 id(message.id 优先,回退 requestId,都无则 null)', () => {
    expect(parseUsage(JSON.stringify({ type: 'assistant', message: { id: 'msg_x', usage: { output_tokens: 5 } } }))?.id).toBe('msg_x');
    expect(parseUsage(JSON.stringify({ type: 'assistant', requestId: 'req_y', message: { usage: { output_tokens: 5 } } }))?.id).toBe('req_y');
    expect(parseUsage(assistant({ output_tokens: 5 }))?.id).toBeNull();
  });

  it('带出 message.model(逐条按模型计价用);无则 null', () => {
    const line = JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-4-8', usage: { output_tokens: 5 } } });
    expect(parseUsage(line)?.model).toBe('claude-opus-4-8');
    expect(parseUsage(assistant({ output_tokens: 5 }))?.model).toBeNull();
  });
});

describe('addTotals / costUSD / pricingFor', () => {
  it('累加', () => {
    expect(addTotals({ input: 1, output: 2, cacheWrite: 3, cacheRead: 4 }, { input: 10, output: 20, cacheWrite: 30, cacheRead: 40 })).toEqual({
      input: 11,
      output: 22,
      cacheWrite: 33,
      cacheRead: 44
    });
  });

  it('合计成本 = in+out+cacheWrite,**不含 cache_read**', () => {
    const p = { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 };
    expect(costUSD({ input: 1_000_000, output: 1_000_000, cacheWrite: 0, cacheRead: 0 }, p)).toBeCloseTo(90, 6);
    // cache_read 不计入合计 → 0
    expect(costUSD({ ...emptyTotals(), cacheRead: 1_000_000 }, p)).toBe(0);
  });

  it('costBreakdown:cacheRead 单列但**不进 total**;total = in+out+cacheWrite = costUSD', () => {
    const p = pricingFor('claude-opus-4-8');
    // 用户真实账本量级:output 19w、cache_read 2900w。
    const t = { input: 743, output: 190527, cacheWrite: 145117, cacheRead: 29063437 };
    const b = costBreakdown(t, p);
    expect(b.output).toBeCloseTo((190527 * 25) / 1e6, 4); // ≈4.76(Opus 现价 $25/M)
    expect(b.cacheRead).toBeCloseTo((29063437 * 0.5) / 1e6, 4); // ≈14.5(仅展示)
    expect(b.total).toBeCloseTo(b.input + b.output + b.cacheWrite, 6); // 不含 cacheRead
    expect(b.total).toBeCloseTo(costUSD(t, p), 6);
    expect(b.total).toBeLessThan(b.cacheRead); // total(≈5.7)远小于被排除的 cacheRead(≈14.5)
  });

  it('Claude 按系列分档:Opus 4.5+ 现价 $5/$25,4.1/4.0 老档 $15/$75,同系列换版本不变', () => {
    expect(pricingFor('claude-opus-4-8')).toEqual(pricingFor('claude-opus-4-7')); // 4.7↔4.8 同价
    expect(pricingFor('claude-opus-4-8').output).toBe(25);
    expect(pricingFor('claude-opus-4-8').input).toBe(5);
    expect(pricingFor('claude-opus-4-1').output).toBe(75); // legacy 档
    expect(pricingFor('claude-opus-4-20250514').output).toBe(75); // Opus 4.0 全 ID
    expect(pricingFor('claude-haiku-4-5').output).toBe(5);
    expect(pricingFor('claude-sonnet-4-6').output).toBe(15);
    expect(pricingFor(null).output).toBe(25); // 默认 opus 现价
    expect(pricingFor('<synthetic>').output).toBe(25); // 未知 → 兜底(usage 通常为 0,无实际影响)
  });

  it('Codex 按版本独立定价:gpt-5.5 $5/$30、gpt-5.4 减半、5.4-mini 更低;未知按 5.5 兜底', () => {
    expect(pricingForModel('codex', 'gpt-5.5')).toMatchObject({ input: 5, output: 30, cacheRead: 0.5 });
    expect(pricingForModel('codex', 'gpt-5.4')).toMatchObject({ input: 2.5, output: 15, cacheRead: 0.25 });
    expect(pricingForModel('codex', 'gpt-5.4-mini')).toMatchObject({ input: 0.75, output: 4.5 });
    expect(pricingForModel('codex', 'codex-auto-review').output).toBe(30); // 未知 → 5.5 兜底
    expect(pricingForModel('codex', null).output).toBe(30);
  });
});

describe('dayKeyOf', () => {
  it('返回 YYYY-MM-DD 格式;同一时刻稳定', () => {
    const k = dayKeyOf('2026-06-04T01:00:00Z', 0);
    expect(k).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dayKeyOf('2026-06-04T01:00:00Z', 0)).toBe(k);
    expect(dayKeyOf(null, 0)).toMatch(/^\d{4}-\d{2}-\d{2}$/); // 无 ts 用 now
  });
});

describe('moodFromActivity(心情 = 最近有没有 output)', () => {
  const now = 1_000_000_000_000;
  it('正在吃优先于一切', () => {
    expect(moodFromActivity(now, now, true)).toBe('eating');
    expect(moodFromActivity(null, now, true)).toBe('eating');
  });
  it('近期有产出=开心;一阵没=闲;很久没=难过', () => {
    expect(moodFromActivity(now - 60_000, now, false)).toBe('happy'); // 1 分钟前
    expect(moodFromActivity(now - 6 * 3_600_000, now, false)).toBe('idle'); // 6 小时前
    expect(moodFromActivity(now - 3 * 24 * 3_600_000, now, false)).toBe('sad'); // 3 天前
  });
  it('阈值边界:happyWithin 到点转闲,sadAfter 到点难过', () => {
    expect(moodFromActivity(now - MOOD_HAPPY_WITHIN_MS + 1, now, false)).toBe('happy');
    expect(moodFromActivity(now - MOOD_HAPPY_WITHIN_MS, now, false)).toBe('idle');
    expect(moodFromActivity(now - MOOD_SAD_AFTER_MS, now, false)).toBe('sad');
  });
  it('无产出记录 → 闲(中性)', () => {
    expect(moodFromActivity(null, now, false)).toBe('idle');
  });
});

describe('EatingTracker', () => {
  it('窗口内算吃,过窗口不算', () => {
    const e = new EatingTracker(1000);
    e.fed(5000);
    expect(e.isEating(5999)).toBe(true);
    expect(e.isEating(6001)).toBe(false);
    expect(new EatingTracker(1000).isEating(0)).toBe(false); // 从没喂过
  });
});

describe('UsageLedger(累积账本)', () => {
  it('计入总计 + 当天桶 + 维护 lastOutputTs(取最大 ts)', () => {
    const L = emptyLedger('2026-06-01');
    applyUsage(L, { input: 10, output: 5, cacheWrite: 0, cacheRead: 0 }, '2026-06-04', '2026-06-04T01:00:00Z');
    applyUsage(L, { input: 2, output: 1, cacheWrite: 0, cacheRead: 0 }, '2026-06-04', '2026-06-04T05:00:00Z');
    applyUsage(L, { input: 100, output: 50, cacheWrite: 0, cacheRead: 0 }, '2026-06-03', '2026-06-03T01:00:00Z');
    expect(L.allTime).toEqual({ input: 112, output: 56, cacheWrite: 0, cacheRead: 0 });
    expect(L.byDay['2026-06-04']).toEqual({ input: 12, output: 6, cacheWrite: 0, cacheRead: 0 });
    expect(L.byDay['2026-06-03'].output).toBe(50);
    expect(L.lastOutputTs).toBe('2026-06-04T05:00:00Z'); // 不被更早的 06-03 覆盖
  });

  it('成本逐笔累计(总 + 当天桶);各笔可来自不同模型单价', () => {
    const L = emptyLedger('2026-06-01');
    applyUsage(L, { input: 0, output: 1_000_000, cacheWrite: 0, cacheRead: 0 }, '2026-06-04', null, 25); // opus 档
    applyUsage(L, { input: 0, output: 1_000_000, cacheWrite: 0, cacheRead: 0 }, '2026-06-04', null, 5); // haiku 档
    applyUsage(L, { input: 0, output: 1_000_000, cacheWrite: 0, cacheRead: 0 }, '2026-06-03', null, 15); // sonnet 档
    expect(L.allTimeCostUSD).toBeCloseTo(45, 6);
    expect(L.byDayCost?.['2026-06-04']).toBeCloseTo(30, 6);
    expect(L.byDayCost?.['2026-06-03']).toBeCloseTo(15, 6);
  });
});

describe('parseCodexUsage(Codex token_count)', () => {
  const tc = (last: Record<string, number>): string =>
    JSON.stringify({
      type: 'event_msg',
      timestamp: '2026-06-04T01:00:00Z',
      payload: { type: 'token_count', info: { last_token_usage: last } }
    });
  it('last_token_usage → TokenTotals(input=非缓存、cacheRead=缓存、output 含 reasoning、cacheWrite=0)', () => {
    const r = asUsage(
      parseCodexUsage(
        tc({ input_tokens: 1000, cached_input_tokens: 600, output_tokens: 50, reasoning_output_tokens: 10, total_tokens: 1050 })
      )
    );
    expect(r.totals).toEqual({ input: 400, output: 50, cacheWrite: 0, cacheRead: 600 });
    expect(r.id).toBeNull();
    expect(r.model).toBeNull(); // token_count 不带模型(由 turn_context 声明)
    expect(r.ts).toBe('2026-06-04T01:00:00Z');
  });
  it('turn_context → 模型声明行(此后用量按此模型计价)', () => {
    const line = JSON.stringify({ type: 'turn_context', timestamp: '2026-06-04T01:00:00Z', payload: { model: 'gpt-5.4', cwd: '/x' } });
    expect(parseCodexUsage(line)).toEqual({ kind: 'model', model: 'gpt-5.4' });
    // 无 model 字段的 turn_context → null
    expect(parseCodexUsage(JSON.stringify({ type: 'turn_context', payload: { cwd: '/x' } }))).toBeNull();
  });
  it('非 token_count / 全 0 → null', () => {
    expect(parseCodexUsage(JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message' } }))).toBeNull();
    expect(parseCodexUsage(tc({ input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 }))).toBeNull();
  });
  it('解析 rate_limits → quota(5h used_percent + 周 + 重置 + plan)', () => {
    const line = JSON.stringify({
      type: 'event_msg',
      timestamp: '2026-06-04T01:00:00Z',
      payload: {
        type: 'token_count',
        info: { last_token_usage: { input_tokens: 100, output_tokens: 10 } },
        rate_limits: {
          primary: { used_percent: 1.5, window_minutes: 300, resets_at: 1780553919 },
          secondary: { used_percent: 0.2, window_minutes: 10080, resets_at: 1781140719 },
          plan_type: 'plus'
        }
      }
    });
    expect(asUsage(parseCodexUsage(line)).quota).toEqual({
      usedPercent: 1.5,
      windowMinutes: 300,
      resetsAt: 1780553919,
      secondaryPercent: 0.2,
      secondaryWindowMinutes: 10080,
      secondaryResetsAt: 1781140719,
      planType: 'plus'
    });
  });
  it('无 rate_limits → quota null', () => {
    expect(asUsage(parseCodexUsage(tc({ input_tokens: 100, output_tokens: 10 }))).quota).toBeNull();
  });
});
