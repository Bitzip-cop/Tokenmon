// Token 用量 + 成本估算 + 心情(按最近产出)+ 累积账本 —— 全是纯逻辑,可单测。
// 数据来自 Claude Code 会话 JSONL 里 assistant 消息的 message.usage。
import type { PetState } from './types/pet';

export interface TokenTotals {
  input: number;
  output: number;
  cacheWrite: number; // cache_creation_input_tokens
  cacheRead: number; // cache_read_input_tokens
}

export function emptyTotals(): TokenTotals {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
}

export function addTotals(a: TokenTotals, b: TokenTotals): TokenTotals {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cacheRead: a.cacheRead + b.cacheRead
  };
}

/** 一笔用量(带该笔的模型,逐条按模型计价用)。Claude 每行自带;Codex 的 usage 行不带(靠 ParsedModelLine 声明)。 */
export interface ParsedUsageLine {
  kind: 'usage';
  totals: TokenTotals;
  ts: string | null;
  id: string | null;
  model: string | null;
  quota?: PetQuota | null;
}
/** 「此后该文件的用量都按此模型计价」(Codex turn_context 行;本行无用量)。 */
export interface ParsedModelLine {
  kind: 'model';
  model: string;
}
export type ParsedLine = ParsedUsageLine | ParsedModelLine;

/**
 * 解析一行会话记录的 usage。返回 token 增量 + 原始 timestamp + **去重键 id** + 模型名(无 usage 则 null)。
 * id = `message.id` 优先、回退 `requestId`;Claude Code 会把同一条 assistant message 写成多行、
 * 且多行可能带同一份 usage,账本据此去重,避免重复累加(见 UsageLedger.ingest)。
 */
export function parseUsage(line: string): ParsedUsageLine | null {
  const s = line.trim();
  if (!s) return null;
  let d: {
    message?: { id?: unknown; model?: unknown; usage?: Record<string, unknown> };
    timestamp?: string;
    requestId?: unknown;
  };
  try {
    d = JSON.parse(s);
  } catch {
    return null;
  }
  const u = d.message?.usage;
  if (!u || typeof u !== 'object') return null;
  const num = (k: string): number => (typeof u[k] === 'number' ? (u[k] as number) : 0);
  const totals: TokenTotals = {
    input: num('input_tokens'),
    output: num('output_tokens'),
    cacheWrite: num('cache_creation_input_tokens'),
    cacheRead: num('cache_read_input_tokens')
  };
  if (totals.input === 0 && totals.output === 0 && totals.cacheWrite === 0 && totals.cacheRead === 0) return null;
  const msgId = d.message && typeof d.message.id === 'string' ? d.message.id : null;
  const reqId = typeof d.requestId === 'string' ? d.requestId : null;
  const model = d.message && typeof d.message.model === 'string' ? d.message.model : null;
  return { kind: 'usage', totals, ts: typeof d.timestamp === 'string' ? d.timestamp : null, id: msgId ?? reqId, model };
}

/**
 * 解析 Codex 会话行:
 * · `turn_context` 行 → ParsedModelLine(payload.model 声明此后用量的模型;token_count 自身不带模型);
 * · `event_msg/token_count` 行 → ParsedUsageLine(`last_token_usage` 每回合增量,model=null 由账本按 turn_context 补)。
 * 映射到 TokenTotals:input=非缓存输入(input-cached)、output=产出(含 reasoning)、cacheRead=缓存输入、cacheWrite=0。
 * id=null:Codex 是增量行、tail 一次读一行天然不重复,无需去重。
 */
export function parseCodexUsage(line: string): ParsedLine | null {
  const s = line.trim();
  if (!s) return null;
  let d: {
    type?: string;
    timestamp?: string;
    payload?: {
      type?: string;
      model?: unknown;
      info?: { last_token_usage?: Record<string, unknown> };
      rate_limits?: { primary?: Record<string, unknown>; secondary?: Record<string, unknown>; plan_type?: unknown };
    };
  };
  try {
    d = JSON.parse(s);
  } catch {
    return null;
  }
  if (d.type === 'turn_context') {
    const m = d.payload?.model;
    return typeof m === 'string' && m ? { kind: 'model', model: m } : null;
  }
  if (d.payload?.type !== 'token_count') return null;
  const lt = d.payload.info?.last_token_usage;
  if (!lt || typeof lt !== 'object') return null;
  const num = (k: string): number => (typeof lt[k] === 'number' ? (lt[k] as number) : 0);
  const cached = num('cached_input_tokens');
  const totals: TokenTotals = {
    input: Math.max(0, num('input_tokens') - cached), // 非缓存输入
    output: num('output_tokens'), // 含 reasoning_output_tokens
    cacheWrite: 0, // Codex 不单列缓存写
    cacheRead: cached
  };
  if (totals.input === 0 && totals.output === 0 && totals.cacheRead === 0) return null;
  return {
    kind: 'usage',
    totals,
    ts: typeof d.timestamp === 'string' ? d.timestamp : null,
    id: null,
    model: null,
    quota: parseQuota(d.payload.rate_limits)
  };
}

/** 从 Codex token_count 的 rate_limits 取真实额度(无 primary.used_percent 则 null)。 */
function parseQuota(
  rl: { primary?: Record<string, unknown>; secondary?: Record<string, unknown>; plan_type?: unknown } | undefined
): PetQuota | null {
  if (!rl || typeof rl !== 'object') return null;
  const p = rl.primary;
  if (!p || typeof p.used_percent !== 'number') return null;
  const n = (o: Record<string, unknown> | undefined, k: string): number | undefined =>
    o && typeof o[k] === 'number' ? (o[k] as number) : undefined;
  const sec = rl.secondary;
  return {
    usedPercent: p.used_percent as number,
    windowMinutes: n(p, 'window_minutes') ?? 0,
    resetsAt: n(p, 'resets_at') ?? null,
    secondaryPercent: n(sec, 'used_percent'),
    secondaryWindowMinutes: n(sec, 'window_minutes'),
    secondaryResetsAt: n(sec, 'resets_at') ?? null,
    planType: typeof rl.plan_type === 'string' ? rl.plan_type : null
  };
}

/** 把 timestamp 归到「本地日期」桶键(YYYY-MM-DD);无效则 'unknown'。 */
export function dayKeyOf(ts: string | null, nowMs: number): string {
  const d = ts ? new Date(ts) : new Date(nowMs);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return d.toLocaleDateString('en-CA'); // → YYYY-MM-DD(本地时区)
}

// ---- 成本(notional / API 等价,订阅用户不实扣)----

/** 各类 token 单价($/百万 token)。价格会变 → 估算 + 可配。 */
export interface Pricing {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

// 内置兜底单价($/Mtok,2026-06 核对)。线上以 pricing-updater 拉的远端表为准(见 setPricingOverrides),
// 这里是离线/拉取失败时的安全网。
// Claude 按系列分档(同系列换版本价不变):Fable 5 是 $10/$50 新顶档;Opus 4.5+ 全是 $5/$25;Opus 4.1/4.0 才是 $15/$75 老档。
// 缓存:Claude 写 1.25×输入、读 0.1×输入;OpenAI 不收缓存写费(且 Codex totals 的 cacheWrite 恒 0)。
// OpenAI 按版本号独立定价(5.4→5.5 也涨价),所以 Codex 切模型必须分档。
export const DEFAULT_PRICING: Record<string, Pricing> = {
  fable: { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 }, // Fable 5(新顶档,Opus 之上)
  opus: { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 }, // Opus 4.5/4.6/4.7/4.8 同档
  opusLegacy: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 }, // Opus 4.1/4.0/Claude 3 Opus
  sonnet: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  gpt55: { input: 5, output: 30, cacheWrite: 0, cacheRead: 0.5 },
  gpt54: { input: 2.5, output: 15, cacheWrite: 0, cacheRead: 0.25 },
  gpt54mini: { input: 0.75, output: 4.5, cacheWrite: 0, cacheRead: 0.075 }
};

// ---- 远端价格表(自更新)----
// pricing-updater(主进程)定期拉社区维护的模型价目表后注入;键为模型 id 全名(小写)。
// 查价顺序:远端表精确命中 > 远端表去日期/后缀命中 > 内置分档启发式。厂商发新模型时远端表
// 通常当天更新 → 无需改代码即可按新价计费;真没命中也只是落到该源主力档兜底,不会算崩。
let PRICING_OVERRIDES: Record<string, Pricing> = {};

export function setPricingOverrides(map: Record<string, Pricing>): void {
  const next: Record<string, Pricing> = {};
  for (const [k, v] of Object.entries(map)) next[k.toLowerCase()] = v;
  PRICING_OVERRIDES = next;
}

/** 规整模型 id 供查表:去尾部日期戳(-20251001)与方括号变体后缀([1m])。 */
function normalizeModelId(m: string): string {
  return m.replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '');
}

/**
 * 按「源 + 模型名」挑单价。摄取时逐条调用 → 用户中途切模型(Opus↔Sonnet、GPT-5.5↔5.4)也按各自单价精准计费。
 * 先查远端自更新表(精确 id),未命中再走内置分档;仍未识别按该源主力档兜底
 * (claude→opus 现价、codex→gpt-5.5;含 codex-auto-review / <synthetic>)。
 */
export function pricingForModel(source: PetSourceId, model: string | null): Pricing {
  const m = (model ?? '').toLowerCase();
  if (m) {
    const hit = PRICING_OVERRIDES[m] ?? PRICING_OVERRIDES[normalizeModelId(m)];
    if (hit) return hit;
  }
  if (source === 'codex') {
    if (m.includes('gpt-5.4-mini')) return DEFAULT_PRICING.gpt54mini;
    if (m.includes('gpt-5.4')) return DEFAULT_PRICING.gpt54;
    return DEFAULT_PRICING.gpt55;
  }
  if (m.includes('fable')) return DEFAULT_PRICING.fable;
  if (m.includes('opus-4-1') || m.includes('opus-4-0') || m.includes('opus-4-2025') || m.includes('3-opus'))
    return DEFAULT_PRICING.opusLegacy;
  if (m.includes('haiku')) return DEFAULT_PRICING.haiku;
  if (m.includes('sonnet')) return DEFAULT_PRICING.sonnet;
  return DEFAULT_PRICING.opus; // 含 opus 4.5+ 与默认
}

/** 兼容旧调用(Claude 侧)。 */
export function pricingFor(model: string | null): Pricing {
  return pricingForModel('claude', model);
}

/**
 * 模型展示名(HUD 名字行用):`claude-opus-4-8` → `Opus 4.8`、`claude-haiku-4-5-20251001` → `Haiku 4.5`、
 * `claude-fable-5`(含 `claude-fable-5[1m]` 变体)→ `Fable 5`、
 * `gpt-5.5` → `GPT-5.5`;`<synthetic>` → null(不展示);其余原样。
 */
export function modelLabel(model: string | null): string | null {
  if (!model || model === '<synthetic>') return null;
  const claude = model.match(/^claude-(fable|opus|sonnet|haiku)-(\d+)(?:-(\d+))?/);
  if (claude) {
    const family = `${claude[1][0].toUpperCase()}${claude[1].slice(1)}`;
    // minor 位限 1-2 位数:单版本号模型(claude-fable-5-20260601)的日期戳不当 minor
    return claude[3] && claude[3].length <= 2 ? `${family} ${claude[2]}.${claude[3]}` : `${family} ${claude[2]}`;
  }
  if (/^gpt-/i.test(model)) return `GPT-${model.slice(4)}`; // gpt-5.5 → GPT-5.5(后缀如 -mini 保持原样)
  return model;
}

/** 合计成本($)。**不含 cache_read**(对订阅用户那是免费重读上下文)——只算 in+out+cacheWrite。 */
export function costUSD(t: TokenTotals, p: Pricing): number {
  return (t.input * p.input + t.output * p.output + t.cacheWrite * p.cacheWrite) / 1_000_000;
}

export interface CostBreakdown {
  input: number;
  output: number;
  cacheWrite: number;
  /** 仅供参考展示,**不计入 total**。 */
  cacheRead: number;
  total: number;
}

/** 按 token 类型拆开的成本($)。total 不含 cache_read;cacheRead 字段仅供参考显示。 */
export function costBreakdown(t: TokenTotals, p: Pricing): CostBreakdown {
  const input = (t.input * p.input) / 1_000_000;
  const output = (t.output * p.output) / 1_000_000;
  const cacheWrite = (t.cacheWrite * p.cacheWrite) / 1_000_000;
  const cacheRead = (t.cacheRead * p.cacheRead) / 1_000_000;
  return { input, output, cacheWrite, cacheRead, total: input + output + cacheWrite };
}

// ---- 心情(mood = 最近有没有 output;不再用"饱腹值/额度")----
//
// 设计:心情只看"距上次产出(output)多久",不看额度——绕开"每日额度上限"这个本地拿不到的分母,
// 也就不会出现"饱了卡住 token 计算"的问题。
//   · 正在吃(eating):刚有 output 流入(几秒内)→ 播吃的动画(消耗 token = 喂养)。
//   · 开心(happy):近期有产出(默认 30 分钟内)。
//   · 闲(idle):一阵子没产出(30 分钟 ~ 2 天)。
//   · 难过(sad):很久没回来干活(默认 ≥ 2 天没有任何 output)。

export type PetMood = 'eating' | 'happy' | 'idle' | 'sad';

/** 用量来源:Claude Code 或 Codex(各自一只桌宠)。 */
export type PetSourceId = 'claude' | 'codex';

/** 角色的「精灵行 → 状态/心情」映射(右键「动作设置」可改;按角色 id 持久化)。 */
export interface CharacterMapping {
  stateRows: Record<PetState, number>;
  moodRows: Record<PetMood, number>;
}

/** 真实额度(Codex 的 rate_limits;Claude 本地拿不到)。usedPercent 单位为百分数(0..100)。 */
export interface PetQuota {
  usedPercent: number; // 主窗口(5h)已用%
  windowMinutes: number; // 主窗口分钟(300=5h)
  resetsAt: number | null; // 主窗口重置(epoch 秒)
  secondaryPercent?: number; // 次窗口(周)已用%
  secondaryWindowMinutes?: number;
  secondaryResetsAt?: number | null;
  planType?: string | null;
}

/** 刚喂过多久内算"正在吃"(应 > 摄取 tick,使连续产出时持续显示吃)。 */
export const PET_EAT_WINDOW_MS = 3000;

/** 距上次产出在此之内 = 开心(默认 10 分钟;太长会让 idle 行——如 clawd 的耳机——几乎永远轮不到)。 */
export const MOOD_HAPPY_WITHIN_MS = 10 * 60_000;
/** 距上次产出超过此值 = 难过(默认 2 天)。 */
export const MOOD_SAD_AFTER_MS = 48 * 60 * 60_000;

export interface MoodThresholds {
  happyWithinMs: number;
  sadAfterMs: number;
}
export const DEFAULT_MOOD_THRESHOLDS: MoodThresholds = {
  happyWithinMs: MOOD_HAPPY_WITHIN_MS,
  sadAfterMs: MOOD_SAD_AFTER_MS
};

/**
 * 心情:正在吃 > 开心(近期有产出)> 闲(一阵没产出)> 难过(很久没产出)。
 * @param lastOutputMs 上次有 output 的时刻(ms);null = 没有任何产出记录。
 */
export function moodFromActivity(
  lastOutputMs: number | null,
  now: number,
  eating: boolean,
  th: MoodThresholds = DEFAULT_MOOD_THRESHOLDS
): PetMood {
  if (eating) return 'eating';
  if (lastOutputMs == null) return 'idle'; // 没产出记录 → 中性闲着
  const gap = now - lastOutputMs;
  if (gap < th.happyWithinMs) return 'happy'; // 含刚产出(gap≈0)
  if (gap < th.sadAfterMs) return 'idle';
  return 'sad';
}

/** "正在吃"判定:最近有 output 流入即吃。now 注入,确定性。 */
export class EatingTracker {
  private lastFedAt = -Infinity;
  constructor(private readonly windowMs = PET_EAT_WINDOW_MS) {}
  fed(now: number): void {
    this.lastFedAt = now;
  }
  isEating(now: number): boolean {
    return now - this.lastFedAt < this.windowMs;
  }
}

// ---- 累积账本(今日 + 历史,自 pet 起算)----

export interface UsageLedgerState {
  /** 首次使用 pet 的基线日期(YYYY-MM-DD)。 */
  petStartDate: string;
  /** 会话文件 → 已计入的字节偏移(增量摄取用)。 */
  cursors: Record<string, number>;
  /** 自 pet 起的总计。 */
  allTime: TokenTotals;
  /** 按天分桶。 */
  byDay: Record<string, TokenTotals>;
  /** 最近一次有 output 的时间戳(ISO);驱动心情。含基线前的历史(只取时间,不计 token)。 */
  lastOutputTs: string | null;
  /** 已计入的 usage 去重键(message.id / requestId);防同一 message 多行 usage 重复累加。限长保留最近若干。 */
  countedIds: string[];
  /** 最近一次真实额度(Codex);取最新 ts 那条。Claude 恒为 null。 */
  lastQuota?: PetQuota | null;
  lastQuotaTs?: string | null;
  /** 累计成本($)。摄取时**逐条按当时模型单价**算好再累加(切模型也准);旧账本迁移按源默认价折算一次。 */
  allTimeCostUSD?: number;
  byDayCost?: Record<string, number>;
  /** 文件 → 最近声明的模型(Codex turn_context;跨 tick 持久,后续 token_count 按此计价)。 */
  fileModels?: Record<string, string>;
  /** 最近一笔用量的模型(按 ts 取最新;HUD 名字行展示「Claude · Opus 4.8」用)。 */
  lastModel?: string | null;
  lastModelTs?: string | null;
  /** 迁移标记:引入 sub-agent 转录扫描时,现存 subagents/*.jsonl 已按当前大小打过基线(只计此后增量)。 */
  subagentsBaselined?: boolean;
  /** 迁移标记:扫描扩到 subagents/ 整棵子树(含 workflows 下的嵌套 agent 转录)后,新列出的文件已按当前大小打过基线。 */
  subagentsWorkflowsBaselined?: boolean;
}

/** 推给渲染层的消耗快照(账本数字 + 实时心情)。 */
export interface PetUsageSnapshot {
  today: TokenTotals;
  allTime: TokenTotals;
  todayCostUSD: number;
  allTimeCostUSD: number;
  mood: PetMood;
  /** 上次有 output 的时刻(ISO);null = 暂无记录。用于"距上次产出多久 / 心情"。 */
  lastOutputTs: string | null;
  petStartDate: string;
  /** 用量来源(claude / codex);渲染层据此过滤到对应那只宠物。 */
  source: PetSourceId;
  /** 真实额度(仅 Codex 有;Claude 为 null)。 */
  quota: PetQuota | null;
  /** 是否展示美元成本(该源有单价才 true;Codex 单价未定 → false,改看 token/额度)。 */
  showCost: boolean;
  /** 最近一笔用量的模型(原始 id;渲染层用 modelLabel 美化;null = 暂未知)。 */
  lastModel: string | null;
}

export function emptyLedger(startDate: string): UsageLedgerState {
  return {
    petStartDate: startDate,
    cursors: {},
    allTime: emptyTotals(),
    byDay: {},
    lastOutputTs: null,
    countedIds: [],
    lastQuota: null,
    lastQuotaTs: null,
    allTimeCostUSD: 0,
    byDayCost: {},
    fileModels: {},
    lastModel: null,
    lastModelTs: null,
    subagentsBaselined: true, // 新账本:基线本来就覆盖所有现存文件(含 subagents 整棵子树)
    subagentsWorkflowsBaselined: true
  };
}

/** 把一笔用量计入账本(总计 + 当天桶 + 成本 + 维护 lastOutputTs)。cost 已按该笔的模型单价算好。就地修改。 */
export function applyUsage(
  ledger: UsageLedgerState,
  totals: TokenTotals,
  day: string,
  ts?: string | null,
  cost = 0
): void {
  ledger.allTime = addTotals(ledger.allTime, totals);
  ledger.byDay[day] = addTotals(ledger.byDay[day] ?? emptyTotals(), totals);
  ledger.allTimeCostUSD = (ledger.allTimeCostUSD ?? 0) + cost;
  if (!ledger.byDayCost) ledger.byDayCost = {};
  ledger.byDayCost[day] = (ledger.byDayCost[day] ?? 0) + cost;
  if (totals.output > 0 && ts && (!ledger.lastOutputTs || ts > ledger.lastOutputTs)) {
    ledger.lastOutputTs = ts; // ISO UTC 字典序=时间序;取最大
  }
}
