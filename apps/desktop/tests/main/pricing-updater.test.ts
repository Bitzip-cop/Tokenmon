// 价格自更新:LiteLLM 表换算、注入 pricingForModel、缓存与离线回退。
import { describe, it, expect, afterEach } from 'vitest';
import { toOverrides, PricingUpdater, PRICING_SOURCE_URL } from '../../src/main/pet/pricing-updater';
import { pricingForModel, setPricingOverrides, DEFAULT_PRICING } from '../../src/shared/pet-usage';
import type { KVStore } from '../../src/main/pet/usage-ledger';

afterEach(() => setPricingOverrides({})); // 清模块级远端表,避免串测试

const fakeStore = (): KVStore & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, get: (k) => data[k] ?? null, set: (k, v) => void (data[k] = v) };
};

// LiteLLM 表的最小样例:per-token 计价 + 厂商字段。
const LITELLM_SAMPLE = {
  'claude-fable-5': {
    litellm_provider: 'anthropic',
    input_cost_per_token: 0.00001, // $10/M
    output_cost_per_token: 0.00005, // $50/M
    cache_creation_input_token_cost: 0.0000125,
    cache_read_input_token_cost: 0.000001
  },
  'anthropic/claude-opus-4-8': {
    // 带 provider 前缀的键 → 去前缀
    litellm_provider: 'anthropic',
    input_cost_per_token: 0.000005,
    output_cost_per_token: 0.000025
    // 缓存价缺省 → 按 Claude 惯例补 1.25×/0.1×
  },
  'gpt-5.5': {
    litellm_provider: 'openai',
    input_cost_per_token: 0.000005,
    output_cost_per_token: 0.00003,
    cache_read_input_token_cost: 0.0000005
    // 无缓存写价 → OpenAI 补 0
  },
  'text-embedding-x': { litellm_provider: 'openai', input_cost_per_token: 0.0000001, output_cost_per_token: 0 }, // 非 claude-/gpt- → 排除
  'gemini-3-pro': { litellm_provider: 'vertex_ai', input_cost_per_token: 0.000002, output_cost_per_token: 0.00001 }, // 其他厂商 → 排除
  'gpt-broken': { litellm_provider: 'openai' } // 缺价 → 排除
};

describe('toOverrides:LiteLLM per-token → $/MTok', () => {
  it('换算 + 补缺省缓存价 + 去 provider 前缀 + 过滤无关条目', () => {
    const o = toOverrides(LITELLM_SAMPLE);
    expect(o['claude-fable-5']).toEqual({ input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 });
    expect(o['claude-opus-4-8']).toEqual({ input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 }); // 缓存价按惯例补
    expect(o['gpt-5.5']).toEqual({ input: 5, output: 30, cacheWrite: 0, cacheRead: 0.5 }); // OpenAI 无缓存写费
    expect(o['text-embedding-x']).toBeUndefined();
    expect(o['gemini-3-pro']).toBeUndefined();
    expect(o['gpt-broken']).toBeUndefined();
  });
});

describe('PricingUpdater', () => {
  it('拉到表 → 注入 pricingForModel(精确 id 优先于内置分档)+ 落缓存', async () => {
    const store = fakeStore();
    // 远端把 fable 价改成 $12/$60(模拟厂商调价)→ 应覆盖内置 $10/$50
    const remote = {
      'claude-fable-5': {
        litellm_provider: 'anthropic',
        input_cost_per_token: 0.000012,
        output_cost_per_token: 0.00006
      }
    };
    const NOW = 200_000_000; // > 24h since epoch,确保 cachedAt=0 视为过期
    const fetchFn = (async () => ({ ok: true, json: async () => remote })) as unknown as typeof fetch;
    const up = new PricingUpdater(store, fetchFn, () => NOW);
    expect(await up.refresh(0)).toBe(true);
    expect(pricingForModel('claude', 'claude-fable-5').input).toBe(12);
    expect(pricingForModel('claude', 'claude-fable-5[1m]').input).toBe(12); // 变体规整后命中
    expect(pricingForModel('claude', 'claude-fable-5-20260601').input).toBe(12); // 日期戳规整后命中
    expect(store.data['model-pricing-cache']).toContain(`"fetchedAt":${NOW}`);
  });

  it('缓存新鲜则不拉;离线启动用缓存表', async () => {
    const store = fakeStore();
    store.data['model-pricing-cache'] = JSON.stringify({
      fetchedAt: 999_000,
      overrides: { 'claude-fable-5': { input: 11, output: 55, cacheWrite: 13.75, cacheRead: 1.1 } }
    });
    let fetched = 0;
    const fetchFn = (async () => {
      fetched++;
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const up = new PricingUpdater(store, fetchFn, () => 1_000_000);
    up.start(); // 同步加载缓存
    up.stop();
    expect(pricingForModel('claude', 'claude-fable-5').input).toBe(11); // 缓存表立即生效
    expect(fetched).toBe(0); // 缓存新鲜(1000s 前)→ 没发请求
  });

  it('拉取失败/空表 → 保持现状,回退内置分档', async () => {
    const store = fakeStore();
    const NOW = 200_000_000;
    const bad = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const up = new PricingUpdater(store, bad, () => NOW);
    expect(await up.refresh(0)).toBe(false);
    expect(pricingForModel('claude', 'claude-fable-5')).toEqual(DEFAULT_PRICING.fable); // 内置兜底

    const empty = (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await new PricingUpdater(store, empty, () => NOW).refresh(0)).toBe(false);
    expect(pricingForModel('claude', 'claude-fable-5')).toEqual(DEFAULT_PRICING.fable);
  });

  it('数据源 URL 指向 LiteLLM 主仓价目表', () => {
    expect(PRICING_SOURCE_URL).toMatch(/^https:\/\/raw\.githubusercontent\.com\/BerriAI\/litellm\//);
  });
});
