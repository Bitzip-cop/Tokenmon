// 自动更新单价和已支持的分档规则；未知的新计费协议仍需升级程序。
// 数据源:LiteLLM 社区维护的 model_prices_and_context_window.json(更新及时性取决于上游,
// ccusage 等用量工具同源)。换算成 $/MTok 后经 setPricingOverrides 注入 pricingForModel 的远端表;
// 结果缓存在 app_state(只存换算后的相关条目,原始 JSON ~2MB 不落库),离线重启直接用上次的表,
// 完全拉不到则回退 pet-usage.ts 的内置 DEFAULT_PRICING 分档 —— 三层兜底,永不算崩。
import { setPricingOverrides, hasMissingModelPrices, type Pricing, type TokenRates } from '@shared/pet-usage';
import type { KVStore } from './usage-ledger';
import { createLogger } from '../logging/logger';

const log = createLogger('pet:pricing-updater');

export const PRICING_SOURCE_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const CACHE_KEY = 'model-pricing-cache';
/** 刷新周期:24h(价目表变更频率低,新模型当天能拿到即可)。 */
const REFRESH_MS = 24 * 60 * 60_000;
const FETCH_TIMEOUT_MS = 30_000;

interface PricingCache {
  schemaVersion?: number;
  fetchedAt: number;
  overrides: Record<string, Pricing>;
}
const CACHE_VERSION = 2;
const CHECK_MS = 60_000;
const RETRY_MS = 60 * 60_000;

const FIELDS = {
  input: 'input_cost_per_token', output: 'output_cost_per_token',
  cacheWrite: 'cache_creation_input_token_cost', cacheRead: 'cache_read_input_token_cost'
} as const;
const validPrice = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
function validPricing(value: unknown, depth = 0): value is Pricing {
  if (!value || typeof value !== 'object' || depth > 1) return false;
  const p = value as Pricing;
  if (!Object.keys(FIELDS).every(k => validPrice(p[k as keyof TokenRates]))) return false;
  if (p.longContext && (!Array.isArray(p.longContext) || !p.longContext.every(b =>
    b && validPrice(b.aboveInputTokens) && b.aboveInputTokens > 0 && b.rates &&
    Object.values(b.rates).every(validPrice)))) return false;
  if (p.tiers && (typeof p.tiers !== 'object' || !Object.values(p.tiers).every(t => validPricing(t, depth + 1)))) return false;
  if (p.missingRates && (!Array.isArray(p.missingRates) || !p.missingRates.every(k => k in FIELDS))) return false;
  return true;
}

/** 保留上游的服务档位与上下文阶梯；新型号沿用同一字段协议即可自动适配。 */
export function toOverrides(raw: Record<string, unknown>): Record<string, Pricing> {
  const out: Record<string, Pricing> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, val] of Object.entries(raw)) {
    if (!val || typeof val !== 'object') continue;
    const e = val as Record<string, unknown>;
    const provider = e.litellm_provider;
    if (provider !== 'anthropic' && provider !== 'openai') continue;
    const m = key.slice(key.lastIndexOf('/') + 1).toLowerCase();
    if (!m.startsWith('claude-') && !m.startsWith('gpt-')) continue;
    const readRates = (suffix: string): Partial<TokenRates> => {
      const rates: Partial<TokenRates> = {};
      for (const [field, name] of Object.entries(FIELDS)) {
        const v = e[name + suffix];
        if (validPrice(v) && Number.isFinite(v * 1e6)) rates[field as keyof TokenRates] = v * 1e6;
      }
      return rates;
    };
    const base = readRates('');
    if (base.input == null || base.output == null) continue;
    const price: Pricing = {
      rulesVersion: 2,
      input: base.input, output: base.output,
      cacheWrite: base.cacheWrite ?? (provider === 'anthropic' ? base.input * 1.25 : 0),
      cacheRead: base.cacheRead ?? (provider === 'anthropic' ? base.input * 0.1 : 0)
    };
    const missingRates = (['cacheWrite', 'cacheRead'] as const).filter(k => base[k] == null && provider === 'openai');
    if (missingRates.length) price.missingRates = missingRates;
    const thresholds = new Map<number, string>();
    for (const name of Object.keys(e)) {
      const match = name.match(/^input_cost_per_token_above_(\d+)(k)?_tokens(?:_|$)/);
      if (match) thresholds.set(Number(match[1]) * (match[2] ? 1000 : 1), `_above_${match[1]}${match[2] ?? ''}_tokens`);
    }
    const bands = (tierSuffix: string): Pricing['longContext'] => {
      const result: NonNullable<Pricing['longContext']> = [];
      for (const [aboveInputTokens, suffix] of thresholds) {
        const rates = readRates(suffix + tierSuffix);
        // 输入/输出都明确才采用该阶梯，不凭比例猜测新的计价规则。
        if (rates.input != null && rates.output != null) result.push({ aboveInputTokens, rates });
      }
      return result.length ? result.sort((a, b) => a.aboveInputTokens - b.aboveInputTokens) : undefined;
    };
    const longContext = bands('');
    if (longContext) price.longContext = longContext;
    for (const [tier, suffix] of Object.entries({ priority: '_priority', flex: '_flex', batch: '_batches' })) {
      const rates = readRates(suffix);
      if (rates.input == null || rates.output == null) continue;
      // 缺少缓存档位价时沿用基础缓存价，不凭输入折扣推算；缺省被标记供估算提示。
      const tierPrice: Pricing = { ...price, ...rates };
      tierPrice.missingRates = (['cacheWrite', 'cacheRead'] as const).filter(k => rates[k] == null && price[k] > 0);
      delete tierPrice.longContext;
      delete tierPrice.tiers;
      const tierBands = bands(suffix);
      if (tierBands) tierPrice.longContext = tierBands;
      (price.tiers ??= {})[tier] = tierPrice;
    }
    // 同名 provider 前缀条目不能覆盖规范 id。
    if (!out[m] || !key.includes('/')) out[m] = price;
  }
  return out;
}

export class PricingUpdater {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastAttempt = -Infinity;
  private inFlight = false;

  constructor(
    private readonly store: KVStore,
    private readonly fetchFn: typeof fetch = (...a) => globalThis.fetch(...a),
    private readonly now: () => number = Date.now
  ) {}

  /** 启动:先同步加载上次缓存(立即生效),再异步按需刷新 + 定时复查。 */
  start(): void {
    if (this.timer) return;
    const cache = this.loadCache();
    const check = (): void => {
      const current = this.loadCache();
      const fetchedAt = current?.schemaVersion === CACHE_VERSION ? current.fetchedAt : 0;
      const missing = hasMissingModelPrices();
      void this.refresh(missing ? 0 : fetchedAt);
    };
    void this.refresh(cache?.schemaVersion === CACHE_VERSION ? cache.fetchedAt : 0);
    this.timer = setInterval(check, CHECK_MS);
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
      if (c && validPrice(c.fetchedAt) && c.overrides && typeof c.overrides === 'object' &&
          Object.keys(c.overrides).length > 0 && Object.values(c.overrides).every(p => validPricing(p))) {
        setPricingOverrides(c.overrides);
        return c;
      }
    } catch {
      /* 缓存损坏 → 当不存在,重新拉 */
    }
    return null;
  }

  /** 24h 刷新；未知模型触发提前刷新；请求合并、失败最多每小时重试。 */
  async refresh(cachedAt: number): Promise<boolean> {
    if (this.now() - cachedAt < REFRESH_MS || this.inFlight || this.now() - this.lastAttempt < RETRY_MS) return false;
    this.inFlight = true;
    this.lastAttempt = this.now();
    let raw: Record<string, unknown>;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await this.fetchFn(PRICING_SOURCE_URL, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      raw = (await res.json()) as Record<string, unknown>;
    } catch (e) {
      log.warn('pricing refresh failed, keep cached/builtin prices', { message: String(e).slice(0, 160) });
      return false;
    } finally {
      clearTimeout(t);
      this.inFlight = false;
    }
    const overrides = toOverrides(raw);
    if (Object.keys(overrides).length === 0) {
      log.warn('pricing refresh got empty table, ignored'); // 上游格式变了?不覆盖现有表
      return false;
    }
    setPricingOverrides(overrides);
    this.store.set(CACHE_KEY, JSON.stringify({ schemaVersion: CACHE_VERSION, fetchedAt: this.now(), overrides } satisfies PricingCache));
    log.info('model pricing refreshed', { models: Object.keys(overrides).length });
    return true;
  }
}
