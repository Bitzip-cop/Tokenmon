import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCodexUsage, estimateUsageCost, setPricingOverrides, emptyTotals } from '../../src/shared/pet-usage';
import { PricingUpdater, toOverrides } from '../../src/main/pet/pricing-updater';
import { UsageLedger, type KVStore } from '../../src/main/pet/usage-ledger';
import { PET_SOURCES } from '../../src/main/pet/sources';

// Captured from PRICING_SOURCE_URL on 2026-09-10; token rates only.
// Expectations below are independent arithmetic from https://developers.openai.com/api/docs/pricing
const fixture = JSON.parse(readFileSync(new URL('../fixtures/litellm-pricing-2026-09-10.json', import.meta.url), 'utf8'));
const usage = (input = 10_000, cached = 2_000, written = 3_000, output = 1_000, tier?: string): string => JSON.stringify({
  type: 'event_msg', timestamp: '2026-09-10T12:00:00Z', payload: {
    type: 'token_count', ...(tier ? { service_tier: tier } : {}),
    info: { model_context_window: 1_050_000, last_token_usage: {
      input_tokens: input, cached_input_tokens: cached, cache_write_input_tokens: written, output_tokens: output
    } }
  }
});
const context = (tier?: string): string => JSON.stringify({ type: 'turn_context', payload: {
  model: 'gpt-6-astra', ...(tier ? { service_tier: tier } : {})
} });
function estimate(line: string, tier = 'default') {
  const parsed = parseCodexUsage(line);
  if (!parsed || parsed.kind !== 'usage') throw new Error('usage expected');
  return estimateUsageCost('codex', 'gpt-6-astra', parsed.totals, { serviceTier: tier, ...parsed.billing });
}
function store(): KVStore & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, get: k => data[k] ?? null, set: (k, v) => { data[k] = v; } };
}
afterEach(() => { setPricingOverrides({}); vi.useRealTimers(); });

describe('Astra request billing', () => {
  it('subtracts writes and reads from ordinary input; each category is charged once', () => {
    setPricingOverrides(toOverrides(fixture));
    const parsed = parseCodexUsage(usage());
    expect(parsed?.kind === 'usage' && parsed.totals).toEqual({ input: 5000, output: 1000, cacheRead: 2000, cacheWrite: 3000 });
    // 5,000 × $10 + 2,000 × $1 + 3,000 × $12.50 + 1,000 × $50
    expect(estimate(usage()).cost).toBeCloseTo(0.1395, 10);
    expect(estimate(usage()).warnings).toEqual([]);
    expect(estimate(usage(3000, 0, 3000, 0)).cost).toBeCloseTo(0.0375, 10);
  });
  it.each(['default', 'priority', 'fast', 'flex'])('handles 272K boundary and %s tier', tier => {
    setPricingOverrides(toOverrides(fixture));
    const factor = ['priority', 'fast'].includes(tier) ? 2 : tier === 'flex' ? 0.5 : 1;
    expect(estimate(usage(272000, 200000, 10000, 1000), tier).cost).toBeCloseTo((62000 * 10 + 200000 + 10000 * 12.5 + 1000 * 50) / 1e6 * factor, 10);
    expect(estimate(usage(272001, 200000, 10000, 1000), tier).cost).toBeCloseTo((62001 * 20 + 200000 * 2 + 10000 * 25 + 1000 * 75) / 1e6 * factor, 10);
  });
  it('has verified offline Astra/Sol prices, including Fast long context', () => {
    expect(estimate(usage(300000, 200000, 0, 1000), 'fast').cost).toBeCloseTo(4.95, 10);
    expect(estimateUsageCost('codex', 'gpt-5.6-sol', { input: 1000, output: 1000, cacheWrite: 0, cacheRead: 0 }, { serviceTier: 'default', cacheWriteReported: true }).cost).toBeCloseTo(0.024);
  });
  it('warns when tier, write counts or model prices are unknown', () => {
    const result = estimateUsageCost('codex', 'gpt-6-astra', { ...emptyTotals(), input: 1000 });
    expect(result.warnings).toEqual(['unknown-tier', 'missing-cache-write']);
    expect(estimateUsageCost('codex', 'gpt-future-test', { ...emptyTotals(), output: 1000 }).warnings).toContain('unknown-model');
    expect(estimate(usage(), 'ultrafast').warnings).toContain('unsupported-tier');
  });
  it('adapts a future model and a different threshold without a model-specific code change', () => {
    const map = toOverrides({ 'gpt-future-test': {
      litellm_provider: 'openai', input_cost_per_token: 0.000003, output_cost_per_token: 0.000009,
      input_cost_per_token_above_128k_tokens: 0.000006, output_cost_per_token_above_128k_tokens: 0.000018
    } });
    setPricingOverrides(map);
    expect(estimateUsageCost('codex', 'gpt-future-test', { ...emptyTotals(), input: 128001 }, { serviceTier: 'default' }).cost).toBeCloseTo(0.768006);
  });
  it('rejects invalid rates and preserves canonical IDs over provider-prefixed duplicates', () => {
    expect(toOverrides({ 'gpt-invalid': { litellm_provider: 'openai', input_cost_per_token: -1, output_cost_per_token: 1 } })).toEqual({});
    const raw = { ...fixture, 'openai/gpt-6-astra': { ...fixture['gpt-6-astra'], input_cost_per_token: 1 } };
    expect(toOverrides(raw)['gpt-6-astra'].input).toBe(10);
  });
});

describe('ledger billing integration', () => {
  it('persists tier across restarts, clears it on the next turn, preserves old costs without double ingestion', () => {
    const root = mkdtempSync(join(tmpdir(), 'tokenmon-billing-'));
    try {
      const path = join(root, 'rollout.jsonl');
      writeFileSync(path, '');
      const kv = store();
      const source = { ...PET_SOURCES.codex, root, listFiles: () => [path] };
      const now = () => Date.parse('2026-09-10T12:00:00Z');
      let ledger = new UsageLedger(kv, now, root, source);
      appendFileSync(path, context('fast') + '\n'); ledger.ingest();
      ledger = new UsageLedger(kv, now, root, source);
      appendFileSync(path, usage() + '\n'); ledger.ingest();
      expect(ledger.snapshot().todayCostUSD).toBeCloseTo(0.279);
      appendFileSync(path, context() + '\n' + usage() + '\n'); ledger.ingest();
      expect(ledger.snapshot().todayCostUSD).toBeCloseTo(0.4185);
      expect(ledger.snapshot().costWarnings).toContain('unknown-tier');
      ledger.ingest();
      expect(ledger.snapshot().todayCostUSD).toBeCloseTo(0.4185);

      const old = JSON.parse(kv.data[source.ledgerKey]);
      delete old.costAlgorithmVersion;
      kv.set(source.ledgerKey, JSON.stringify(old));
      ledger = new UsageLedger(kv, now, root, source);
      expect(ledger.snapshot().todayCostUSD).toBeCloseTo(0.4185);
      expect(ledger.snapshot().costWarnings).toContain('legacy-cost');
      expect(ledger.ingest()).toBe(0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe('automatic price updates', () => {
  it('upgrades a legacy cache immediately, retaining it on failure and retrying hourly', async () => {
    vi.useFakeTimers(); vi.setSystemTime(200_000_000);
    const kv = store();
    kv.set('model-pricing-cache', JSON.stringify({ fetchedAt: Date.now(), overrides: { 'gpt-6-astra': { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 } } }));
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, json: async () => fixture });
    const updater = new PricingUpdater(kv, fetch);
    try {
      updater.start(); await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(estimate(usage()).cost).toBeCloseTo(0.1395);
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(JSON.parse(kv.data['model-pricing-cache']).schemaVersion).toBe(2);
      expect(estimate(usage(), 'fast').cost).toBeCloseTo(0.279);
    } finally { updater.stop(); }
  });
  it('refreshes a fresh cache when an unknown model is observed and prevents duplicate requests', async () => {
    vi.useFakeTimers(); vi.setSystemTime(200_000_000);
    const kv = store();
    kv.set('model-pricing-cache', JSON.stringify({ schemaVersion: 2, fetchedAt: Date.now(), overrides: toOverrides(fixture) }));
    let finish!: (value: unknown) => void;
    const fetch = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const updater = new PricingUpdater(kv, fetch as unknown as typeof globalThis.fetch);
    try {
      updater.start();
      estimateUsageCost('codex', 'gpt-future-test', { ...emptyTotals(), output: 1000 });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(await updater.refresh(0)).toBe(false);
      finish({ ok: true, json: async () => ({ ...fixture, 'gpt-future-test': { ...fixture['gpt-6-astra'], output_cost_per_token: 0.00002 } }) });
      await vi.advanceTimersByTimeAsync(0);
      expect(estimateUsageCost('codex', 'gpt-future-test', { ...emptyTotals(), output: 1000 }).cost).toBeCloseTo(0.02);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { updater.stop(); }
  });
});
