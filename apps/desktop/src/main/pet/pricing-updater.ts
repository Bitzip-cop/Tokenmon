// 模型价格自更新:Claude / OpenAI(Codex)发新模型后,无需发版就能按新价计费。
// 数据源:LiteLLM 社区维护的 model_prices_and_context_window.json(两家发新模型后通常当天更新,
// ccusage 等用量工具同源)。换算成 $/MTok 后经 setPricingOverrides 注入 pricingForModel 的远端表;
// 结果缓存在 app_state(只存换算后的相关条目,原始 JSON ~2MB 不落库),离线重启直接用上次的表,
// 完全拉不到则回退 pet-usage.ts 的内置 DEFAULT_PRICING 分档 —— 三层兜底,永不算崩。
import { setPricingOverrides, type Pricing } from '@shared/pet-usage';
import type { KVStore } from './usage-ledger';
import { createLogger } from '../logging/logger';

const log = createLogger('pet:pricing-updater');

export const PRICING_SOURCE_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const CACHE_KEY = 'model-pricing-cache';
/** 刷新周期:24h(价目表变更频率低,新模型当天能拿到即可)。 */
const REFRESH_MS = 24 * 60 * 60_000;
const FETCH_TIMEOUT_MS = 30_000;

interface LiteLLMEntry {
  litellm_provider?: string;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_creation_input_token_cost?: number;
  cache_read_input_token_cost?: number;
}

interface PricingCache {
  fetchedAt: number;
  overrides: Record<string, Pricing>;
}

/**
 * LiteLLM 原始表 → 本地 overrides(模型 id → $/MTok 单价)。
 * 只收 anthropic(claude-*)与 openai(gpt-*)的对话模型;键去掉 `provider/` 前缀。
 * 缓存价缺省时按厂商惯例补:Claude 写 1.25×/读 0.1× 输入价;OpenAI 不收缓存写费。
 */
export function toOverrides(raw: Record<string, unknown>): Record<string, Pricing> {
  const out: Record<string, Pricing> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!val || typeof val !== 'object') continue;
    const e = val as LiteLLMEntry;
    const provider = e.litellm_provider ?? '';
    if (provider !== 'anthropic' && provider !== 'openai') continue;
    if (typeof e.input_cost_per_token !== 'number' || typeof e.output_cost_per_token !== 'number') continue;
    const id = key.includes('/') ? key.slice(key.lastIndexOf('/') + 1) : key;
    const m = id.toLowerCase();
    if (!m.startsWith('claude-') && !m.startsWith('gpt-')) continue; // 只要对话模型,排除 embedding/tts 等
    const input = e.input_cost_per_token * 1e6;
    const output = e.output_cost_per_token * 1e6;
    const cacheWrite =
      typeof e.cache_creation_input_token_cost === 'number'
        ? e.cache_creation_input_token_cost * 1e6
        : provider === 'anthropic'
          ? input * 1.25
          : 0;
    const cacheRead =
      typeof e.cache_read_input_token_cost === 'number'
        ? e.cache_read_input_token_cost * 1e6
        : provider === 'anthropic'
          ? input * 0.1
          : 0;
    out[m] = { input, output, cacheWrite, cacheRead };
  }
  return out;
}

export class PricingUpdater {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly store: KVStore,
    private readonly fetchFn: typeof fetch = (...a) => globalThis.fetch(...a),
    private readonly now: () => number = Date.now
  ) {}

  /** 启动:先同步加载上次缓存(立即生效),再异步按需刷新 + 定时复查。 */
  start(): void {
    if (this.timer) return;
    const cache = this.loadCache();
    void this.refresh(cache?.fetchedAt ?? 0);
    this.timer = setInterval(() => void this.refresh(this.loadCache()?.fetchedAt ?? 0), REFRESH_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private loadCache(): PricingCache | null {
    const raw = this.store.get(CACHE_KEY);
    if (!raw) return null;
    try {
      const c = JSON.parse(raw) as PricingCache;
      if (c && typeof c.fetchedAt === 'number' && c.overrides && typeof c.overrides === 'object') {
        setPricingOverrides(c.overrides);
        return c;
      }
    } catch {
      /* 缓存损坏 → 当不存在,重新拉 */
    }
    return null;
  }

  /** 缓存过期才真的拉;失败静默(继续用缓存/内置表,下个周期再试)。返回是否拉到了新表。 */
  async refresh(cachedAt: number): Promise<boolean> {
    if (this.now() - cachedAt < REFRESH_MS) return false; // 还新鲜
    let raw: Record<string, unknown>;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      const res = await this.fetchFn(PRICING_SOURCE_URL, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      raw = (await res.json()) as Record<string, unknown>;
    } catch (e) {
      log.warn('pricing refresh failed, keep cached/builtin prices', { message: String(e).slice(0, 160) });
      return false;
    }
    const overrides = toOverrides(raw);
    if (Object.keys(overrides).length === 0) {
      log.warn('pricing refresh got empty table, ignored'); // 上游格式变了?不覆盖现有表
      return false;
    }
    setPricingOverrides(overrides);
    this.store.set(CACHE_KEY, JSON.stringify({ fetchedAt: this.now(), overrides } satisfies PricingCache));
    log.info('model pricing refreshed', { models: Object.keys(overrides).length });
    return true;
  }
}
