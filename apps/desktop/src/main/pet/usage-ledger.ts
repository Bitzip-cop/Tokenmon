// 累积账本(今日 + 历史,自 pet 起算)+ 消耗服务。源(Claude/Codex)由 PetSource 决定(见 ./sources)。
// 增量摄取:扫该源所有会话 jsonl,每个文件只读 cursor 之后的新内容(只推进到完整行边界,半行留到下次;
// cursor 按「字节」推进)。持久化在 app_state(两源各一本账,键见 PetSource.ledgerKey)。
import { statSync, openSync, readSync, closeSync } from 'node:fs';
import { sep } from 'node:path';
import {
  dayKeyOf,
  applyUsage,
  emptyLedger,
  emptyTotals,
  costUSD,
  pricingForModel,
  moodFromActivity,
  MOOD_HAPPY_WITHIN_MS,
  MOOD_SAD_AFTER_MS,
  EatingTracker,
  type MoodThresholds,
  type UsageLedgerState,
  type TokenTotals,
  type PetUsageSnapshot,
  type PetQuota
} from '@shared/pet-usage';
import { PET_SOURCES, type PetSource } from './sources';
import { createLogger } from '../logging/logger';

const log = createLogger('pet:usage-ledger');
const INGEST_MS = 2000;

/** 持久化最小接口(AppStateRepository 结构上满足;测试可塞内存假实现)。 */
export interface KVStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

function safeSize(file: string): number {
  try {
    return statSync(file).size;
  } catch {
    return -1;
  }
}
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
function safeMtime(file: string): number {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}
/** 扫最近若干会话文件的尾部(只读尾巴,便宜):取"最后产出时刻"+"最新真实额度"+"最近模型"。供基线/迁移用。 */
function scanTail(
  root: string,
  source: PetSource
): {
  lastOutputTs: string | null;
  lastQuota: PetQuota | null;
  lastQuotaTs: string | null;
  lastModel: string | null;
  lastModelTs: string | null;
} {
  const files = source
    .listFiles(root)
    .map((f) => ({ f, m: safeMtime(f) }))
    .sort((a, b) => b.m - a.m)
    .slice(0, 10)
    .map((x) => x.f);
  let lastOutputTs: string | null = null;
  let lastQuota: PetQuota | null = null;
  let lastQuotaTs: string | null = null;
  let lastModel: string | null = null;
  let lastModelTs: string | null = null;
  for (const f of files) {
    const size = safeSize(f);
    if (size < 0) continue;
    const text = readRange(f, Math.max(0, size - 131072), size); // 尾部 128KB
    let curModel: string | null = null; // 文件内顺序读:Codex turn_context 声明此后用量的模型
    for (const line of text.split('\n')) {
      const u = source.parseLine(line);
      if (!u) continue;
      if (u.kind === 'model') {
        curModel = u.model;
        continue;
      }
      if (u.totals.output > 0 && u.ts && (!lastOutputTs || u.ts > lastOutputTs)) lastOutputTs = u.ts;
      if (u.quota && u.ts && (!lastQuotaTs || u.ts > lastQuotaTs)) {
        lastQuota = u.quota;
        lastQuotaTs = u.ts;
      }
      const eff = u.model ?? curModel;
      if (eff && u.ts && (!lastModelTs || u.ts > lastModelTs)) {
        lastModel = eff;
        lastModelTs = u.ts;
      }
    }
  }
  return { lastOutputTs, lastQuota, lastQuotaTs, lastModel, lastModelTs };
}

export class UsageLedger {
  private state: UsageLedgerState;
  private readonly root: string;

  constructor(
    private readonly store: KVStore,
    private readonly now: () => number = Date.now,
    root?: string,
    private readonly source: PetSource = PET_SOURCES.claude
  ) {
    this.root = root ?? source.root;
    this.state = this.load();
  }

  private load(): UsageLedgerState {
    const raw = this.store.get(this.source.ledgerKey);
    if (raw) {
      try {
        const s = JSON.parse(raw) as UsageLedgerState;
        if (s.lastOutputTs === undefined || s.lastQuota === undefined || s.lastModel === undefined) {
          const t = scanTail(this.root, this.source); // 旧账本迁移:补心情(最后产出)/额度/最近模型的尾部状态
          if (s.lastOutputTs === undefined) s.lastOutputTs = t.lastOutputTs;
          if (s.lastQuota === undefined) {
            s.lastQuota = t.lastQuota;
            s.lastQuotaTs = t.lastQuotaTs;
          }
          if (s.lastModel === undefined) {
            s.lastModel = t.lastModel;
            s.lastModelTs = t.lastModelTs;
          }
        }
        if (!Array.isArray(s.countedIds)) s.countedIds = []; // 旧账本迁移:去重键集合
        if (s.allTimeCostUSD === undefined) {
          // 旧账本迁移:历史聚合没有模型维度 → 按源默认单价折算一次作基线;此后增量逐条按真实模型计价
          const p = this.source.pricing;
          s.allTimeCostUSD = p ? costUSD(s.allTime, p) : 0;
          s.byDayCost = {};
          for (const [day, t] of Object.entries(s.byDay)) s.byDayCost[day] = p ? costUSD(t, p) : 0;
        }
        if (!s.fileModels) s.fileModels = {};
        if (!s.subagentsBaselined) {
          // 旧账本迁移:首次引入 sub-agent 转录扫描 → 现存 subagents 文件按当前大小打基线
          // (与首装「不回算历史」一致;此后增量正常计入)。
          for (const f of this.source.listFiles(this.root)) {
            if (f.includes(`${sep}subagents${sep}`) && s.cursors[f] === undefined) {
              s.cursors[f] = Math.max(0, safeSize(f));
            }
          }
          s.subagentsBaselined = true;
        }
        return s;
      } catch {
        /* 损坏 → 重建基线 */
      }
    }
    // 首次:打基线 —— 不回算历史 token。现有文件的当前大小记成 cursor,只从此刻往后累加。
    const led = emptyLedger(dayKeyOf(null, this.now()));
    for (const f of this.source.listFiles(this.root)) led.cursors[f] = Math.max(0, safeSize(f));
    const t = scanTail(this.root, this.source); // 基线:读尾部的最后产出时刻 + 当前额度(只取,不计 token)
    led.lastOutputTs = t.lastOutputTs;
    led.lastQuota = t.lastQuota;
    led.lastQuotaTs = t.lastQuotaTs;
    led.lastModel = t.lastModel;
    led.lastModelTs = t.lastModelTs;
    this.store.set(this.source.ledgerKey, JSON.stringify(led));
    log.info('usage ledger baselined', {
      source: this.source.id,
      startDate: led.petStartDate,
      files: Object.keys(led.cursors).length,
      lastOutputTs: led.lastOutputTs
    });
    return led;
  }

  /** 扫该源所有会话增量计入(成本逐条按模型单价)。返回本次新增的 output token(用于喂养)。 */
  ingest(): number {
    let newOutput = 0;
    const seen = new Set(this.state.countedIds); // 去重键(message.id/requestId),防同一 message 多行 usage 重复累加
    const fileModels = (this.state.fileModels ??= {}); // Codex:文件级「当前模型」(turn_context 声明,跨 tick 持久)
    for (const f of this.source.listFiles(this.root)) {
      const size = safeSize(f);
      if (size < 0) continue;
      let cur = this.state.cursors[f] ?? 0;
      if (cur > size) cur = 0; // 截断/轮换 → 从头
      if (size <= cur) {
        this.state.cursors[f] = cur;
        continue;
      }
      const chunk = readRange(f, cur, size);
      const lastNl = chunk.lastIndexOf('\n');
      if (lastNl < 0) continue; // 还没有完整行,等下次
      const completeText = chunk.slice(0, lastNl + 1);
      let curModel: string | null = fileModels[f] ?? null;
      for (const line of completeText.split('\n')) {
        const u = this.source.parseLine(line);
        if (!u) continue;
        if (u.kind === 'model') {
          curModel = u.model; // 此后该文件的用量按这个模型计价
          fileModels[f] = u.model;
          continue;
        }
        if (u.id && seen.has(u.id)) continue; // 同一 message 多行 usage:已计过 → 跳过(成本/喂养都不重复)
        if (u.id) seen.add(u.id);
        // 逐条计价:Claude 行自带 model;Codex 用文件级 curModel。该源不按美元算(pricing=null)则成本恒 0。
        const eff = u.model ?? curModel;
        const cost = this.source.pricing ? costUSD(u.totals, pricingForModel(this.source.id, eff)) : 0;
        applyUsage(this.state, u.totals, dayKeyOf(u.ts, this.now()), u.ts, cost);
        newOutput += u.totals.output;
        if (eff && eff !== '<synthetic>' && u.ts && (!this.state.lastModelTs || u.ts >= this.state.lastModelTs)) {
          this.state.lastModel = eff; // 最近一笔用量的模型(HUD 名字行)
          this.state.lastModelTs = u.ts;
        }
        if (u.quota && u.ts && (!this.state.lastQuotaTs || u.ts >= this.state.lastQuotaTs)) {
          this.state.lastQuota = u.quota; // 取最新 ts 的真实额度(Codex)
          this.state.lastQuotaTs = u.ts;
        }
      }
      this.state.cursors[f] = cur + Buffer.byteLength(completeText, 'utf8'); // 按字节推进
    }
    this.state.countedIds = Array.from(seen).slice(-3000); // 限长:只留最近 3000 个去重键
    this.store.set(this.source.ledgerKey, JSON.stringify(this.state));
    return newOutput;
  }

  snapshot(): {
    today: TokenTotals;
    allTime: TokenTotals;
    todayCostUSD: number;
    allTimeCostUSD: number;
    petStartDate: string;
    lastOutputTs: string | null;
    lastQuota: PetQuota | null;
    lastModel: string | null;
  } {
    const todayKey = dayKeyOf(null, this.now());
    return {
      today: this.state.byDay[todayKey] ?? emptyTotals(),
      allTime: this.state.allTime,
      // 摄取时逐条按模型单价累计好的成本(不含 cache_read)
      todayCostUSD: this.state.byDayCost?.[todayKey] ?? 0,
      allTimeCostUSD: this.state.allTimeCostUSD ?? 0,
      petStartDate: this.state.petStartDate,
      lastOutputTs: this.state.lastOutputTs,
      lastQuota: this.state.lastQuota ?? null,
      lastModel: this.state.lastModel ?? null
    };
  }
}

/** 串起账本摄取 + 心情(按最近产出)+ 定时推送 pet:usage。每个源一个实例。 */
export class PetUsageService {
  private readonly ledger: UsageLedger;
  private readonly eating = new EatingTracker();
  private readonly thresholds: MoodThresholds;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    store: KVStore,
    private readonly onUsage: (u: PetUsageSnapshot) => void,
    private readonly now: () => number = Date.now,
    private readonly source: PetSource = PET_SOURCES.claude,
    thresholds?: Partial<MoodThresholds>
  ) {
    this.ledger = new UsageLedger(store, now, undefined, source);
    // 心情阈值可经环境变量调:TOKENMON_MOOD_HAPPY_MIN(分钟)/ TOKENMON_MOOD_SAD_HOURS(小时)。
    const happyMin = Number(process.env.TOKENMON_MOOD_HAPPY_MIN);
    const sadHours = Number(process.env.TOKENMON_MOOD_SAD_HOURS);
    this.thresholds = {
      happyWithinMs:
        thresholds?.happyWithinMs ?? (Number.isFinite(happyMin) && happyMin > 0 ? happyMin * 60_000 : MOOD_HAPPY_WITHIN_MS),
      sadAfterMs:
        thresholds?.sadAfterMs ?? (Number.isFinite(sadHours) && sadHours > 0 ? sadHours * 3_600_000 : MOOD_SAD_AFTER_MS)
    };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), INGEST_MS);
    this.tick();
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    try {
      const newOutput = this.ledger.ingest();
      const now = this.now();
      if (newOutput > 0) this.eating.fed(now);
      const { today, allTime, todayCostUSD, allTimeCostUSD, petStartDate, lastOutputTs, lastQuota, lastModel } =
        this.ledger.snapshot();
      const parsed = lastOutputTs ? Date.parse(lastOutputTs) : NaN;
      const lastOutputMs = Number.isNaN(parsed) ? null : parsed;
      const mood = moodFromActivity(lastOutputMs, now, this.eating.isEating(now), this.thresholds);
      this.onUsage({
        today,
        allTime,
        todayCostUSD, // 账本里逐条按模型单价累计(不含 cache_read)
        allTimeCostUSD,
        mood,
        lastOutputTs,
        petStartDate,
        source: this.source.id,
        quota: lastQuota,
        showCost: this.source.pricing != null,
        lastModel
      });
    } catch (e) {
      log.warn('pet usage tick failed', { source: this.source.id, message: String(e).slice(0, 160) });
    }
  }
}
