// 一次性校验脚本(随机化):各模型随机 token → 真实摄取链路(临时 JSONL → UsageLedger)→ 对照独立手写的官方价格表。
// 注意:期望值用这里**独立重写**的官方单价算,不 import 代码里的 DEFAULT_PRICING —— 否则是自己对自己。
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UsageLedger, type KVStore } from '../../src/main/pet/usage-ledger';
import { parseCodexUsage, pricingForModel, DEFAULT_PRICING } from '../../src/shared/pet-usage';
import type { PetSource } from '../../src/main/pet/sources';

// ---- 官方单价($/Mtok),2026-06 核对,独立手写 ----
const OFFICIAL: Record<string, { in: number; out: number; cw: number }> = {
  'claude-fable-5': { in: 10, out: 50, cw: 12.5 }, // Fable 5 新顶档(2026-06)
  'claude-opus-4-8': { in: 5, out: 25, cw: 6.25 },
  'claude-opus-4-7': { in: 5, out: 25, cw: 6.25 },
  'claude-sonnet-4-6': { in: 3, out: 15, cw: 3.75 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5, cw: 1.25 },
  'claude-opus-4-1': { in: 15, out: 75, cw: 18.75 }, // legacy 档
  'gpt-5.5': { in: 5, out: 30, cw: 0 },
  'gpt-5.4': { in: 2.5, out: 15, cw: 0 },
  'gpt-5.4-mini': { in: 0.75, out: 4.5, cw: 0 }
};
// 合计口径与产品一致:in + out + cacheWrite,不含 cacheRead。
const expectCost = (m: string, t: { in: number; out: number; cw: number }): number =>
  (t.in * OFFICIAL[m].in + t.out * OFFICIAL[m].out + t.cw * OFFICIAL[m].cw) / 1e6;

const rnd = (max: number): number => Math.floor(Math.random() * max);
const DAY = new Date().toLocaleDateString('en-CA');
const now = (): number => Date.parse(`${DAY}T12:00:00`);
const fakeStore = (): KVStore => {
  const d: Record<string, string> = {};
  return { get: (k) => d[k] ?? null, set: (k, v) => void (d[k] = v) };
};

let roots: string[] = [];
afterEach(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

describe('随机 token 对账:账本算法 vs 官方价目表', () => {
  it('pricingForModel 与官方表逐档一致', () => {
    for (const m of Object.keys(OFFICIAL)) {
      const src = m.startsWith('gpt') ? 'codex' : 'claude';
      const p = pricingForModel(src, m);
      expect(p.input, `${m} input`).toBe(OFFICIAL[m].in);
      expect(p.output, `${m} output`).toBe(OFFICIAL[m].out);
      expect(p.cacheWrite, `${m} cacheWrite`).toBe(OFFICIAL[m].cw);
    }
  });

  it('Claude:5 个模型 × 随机用量、乱序混写一个文件 → 账本成本 = 官方表手算', () => {
    const root = mkdtempSync(join(tmpdir(), 'verify-claude-'));
    roots.push(root);
    mkdirSync(join(root, '-p-x'), { recursive: true });
    const file = join(root, '-p-x', 's.jsonl');
    writeFileSync(file, '');
    const led = new UsageLedger(fakeStore(), now, root);
    led.ingest(); // 基线

    const models = Object.keys(OFFICIAL).filter((m) => m.startsWith('claude'));
    // 每个模型 20 笔随机用量,然后整体乱序(模拟会话中来回切模型)
    const entries = models
      .flatMap((m) =>
        Array.from({ length: 20 }, (_, i) => ({
          m,
          id: `msg_${m}_${i}`,
          in: rnd(50_000),
          out: rnd(200_000),
          cw: rnd(100_000),
          cr: rnd(2_000_000) // 应被排除在成本外
        }))
      )
      .sort(() => Math.random() - 0.5);

    appendFileSync(
      file,
      entries
        .map((e) =>
          JSON.stringify({
            type: 'assistant',
            timestamp: `${DAY}T12:00:00`,
            message: {
              id: e.id,
              model: e.m,
              usage: {
                input_tokens: e.in,
                output_tokens: e.out,
                cache_creation_input_tokens: e.cw,
                cache_read_input_tokens: e.cr
              }
            }
          })
        )
        .join('\n') + '\n'
    );
    led.ingest();

    const expected = entries.reduce((s, e) => s + expectCost(e.m, e), 0);
    const got = led.snapshot().allTimeCostUSD;
    const perModel = models.map((m) => `${m}: $${entries.filter((e) => e.m === m).reduce((s, e) => s + expectCost(m, e), 0).toFixed(4)}`);
    console.log(`[Claude] ${entries.length} 笔随机用量(乱序切模型)\n  ${perModel.join('\n  ')}\n  期望合计 $${expected.toFixed(6)} | 账本 $${got.toFixed(6)} | 差 ${Math.abs(got - expected).toExponential(2)}`);
    expect(got).toBeCloseTo(expected, 6);
    expect(led.snapshot().todayCostUSD).toBeCloseTo(expected, 6);
  });

  it('Codex:turn_context 随机切 5.5/5.4/5.4-mini → 账本成本 = 官方表手算(cached 不计费)', () => {
    const root = mkdtempSync(join(tmpdir(), 'verify-codex-'));
    roots.push(root);
    const file = join(root, 'rollout-1.jsonl');
    writeFileSync(file, '');
    const source: PetSource = {
      id: 'codex',
      root,
      ledgerKey: 'verify-codex',
      parseLine: parseCodexUsage,
      listFiles: (rt) => readdirSync(rt).filter((n) => n.endsWith('.jsonl')).map((n) => join(rt, n)),
      pricing: DEFAULT_PRICING.gpt55
    };
    const led = new UsageLedger(fakeStore(), now, root, source);
    led.ingest();

    const models = ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'];
    const lines: string[] = [];
    const expectedPer: Record<string, number> = Object.fromEntries(models.map((m) => [m, 0]));
    for (let turn = 0; turn < 60; turn++) {
      const m = models[rnd(models.length)];
      lines.push(JSON.stringify({ type: 'turn_context', timestamp: `${DAY}T12:00:00`, payload: { model: m } }));
      const cached = rnd(500_000);
      const fresh = rnd(80_000);
      const out = rnd(50_000);
      lines.push(
        JSON.stringify({
          type: 'event_msg',
          timestamp: `${DAY}T12:00:00`,
          payload: {
            type: 'token_count',
            info: { last_token_usage: { input_tokens: cached + fresh, cached_input_tokens: cached, output_tokens: out } }
          }
        })
      );
      expectedPer[m] += expectCost(m, { in: fresh, out, cw: 0 }); // cached 输入不计费(账本里进 cacheRead、被排除)
    }
    appendFileSync(file, lines.join('\n') + '\n');
    led.ingest();

    const expected = Object.values(expectedPer).reduce((a, b) => a + b, 0);
    const got = led.snapshot().allTimeCostUSD;
    console.log(`[Codex] 60 回合随机切模型\n  ${models.map((m) => `${m}: $${expectedPer[m].toFixed(4)}`).join('\n  ')}\n  期望合计 $${expected.toFixed(6)} | 账本 $${got.toFixed(6)} | 差 ${Math.abs(got - expected).toExponential(2)}`);
    expect(got).toBeCloseTo(expected, 6);
  });
});
