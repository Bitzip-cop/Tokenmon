// 精灵动画的纯逻辑(选行 + 该行真实帧数)。不引图片资源 → 可在 node 下单测。
import type { PetState } from '@shared/types/pet';
import type { PetMood } from '@shared/pet-usage';

export interface SpriteRows {
  stateRows: Record<PetState, number>;
  moodRows: Record<PetMood, number>;
}

export interface SpriteFrames {
  framesPerRow: number;
  /** 每行真实帧数(index=行号);缺省/越界/非正回退 framesPerRow。 */
  framesByRow?: number[];
}

/**
 * 行优先级(权重版):
 *   sad(两天没产出,负面标签一旦打上权重最高;一有新产出秒清)
 *   > working(任一会话在干活——多 CLI 窗口交叉时优先示忙)
 *   > 输出中:eating(token 进账) > talking(吐正文)
 *   > waiting(说完话等用户回复)
 *   > 其余心情平权(happy/idle 默认同 idle 行,花活交给 flourish)。
 * **绝不返回 undefined**:任何查不到的 mood/state(脏数据、或新旧 moodRows 键对不上)
 * 一律回退到 idle 行,否则 canvas 会用 undefined*frameH 画出"完全空帧"(宠物消失)。
 */
export function resolveRow(rows: SpriteRows, state: PetState, mood?: PetMood): number {
  let row: number | undefined;
  if (mood === 'sad') row = rows.moodRows.sad;
  else if (state === 'working') row = rows.stateRows.working;
  else if (mood === 'eating') row = rows.moodRows.eating;
  else if (state === 'talking') row = rows.stateRows.talking;
  else if (state === 'waiting') row = rows.stateRows.waiting;
  else if (mood) row = rows.moodRows[mood];
  else row = rows.stateRows.idle;
  if (Number.isInteger(row)) return row as number;
  return Number.isInteger(rows.stateRows.idle) ? rows.stateRows.idle : 0; // 兜底:绝不画空帧
}

/**
 * 该行的真实帧数。spritesheet 很多行尾部是空帧(如 idle 实际只有 6 帧),
 * 若按写死的 framesPerRow 循环就会播到空帧 → 周期性闪烁。这里按行取真实帧数。
 */
export function framesForRow(cfg: SpriteFrames, row: number): number {
  const n = cfg.framesByRow?.[row];
  return n && n > 0 ? n : cfg.framesPerRow;
}

/** 难过时动画减半速(蔫蔫的、没精神);其余心情原速。下限 1 fps。 */
export function fpsForMood(baseFps: number, mood?: PetMood): number {
  return mood === 'sad' ? Math.max(1, baseFps / 2) : baseFps;
}

/**
 * 自发闲置动画(flourish):闲着(calm)时每隔 minGap~maxGap 随机播一轮别的动作,播完回常态。
 * 解决"桌宠看起来只会一个动作"——多数时间在 idle/happy,其余行根本轮不到。
 * t/rand 注入 → 纯逻辑可单测。忙起来(calm=false)立即取消并重置计时。
 */
export class FlourishScheduler {
  private row = -1;
  private until = 0; // 当前 flourish 播到何时(t)
  private nextAt = 0; // 下一次 flourish 何时触发(0=未排期)
  constructor(
    private readonly minGapMs = 20_000,
    private readonly maxGapMs = 50_000,
    private readonly rand: () => number = Math.random
  ) {}

  /** 每帧调用:返回当前应播的 flourish 行;null = 播常态行。 */
  current(t: number, calm: boolean, rows: number[], durationFor: (row: number) => number): number | null {
    if (!calm || rows.length === 0) {
      this.until = 0;
      this.nextAt = 0;
      return null;
    }
    if (t < this.until) return this.row; // 正在耍宝
    if (this.nextAt === 0) {
      this.nextAt = t + this.minGapMs + this.rand() * (this.maxGapMs - this.minGapMs);
      return null;
    }
    if (t >= this.nextAt) {
      this.row = rows[Math.floor(this.rand() * rows.length)] ?? rows[0];
      this.until = t + Math.max(500, durationFor(this.row));
      this.nextAt = 0; // 播完后下一帧重新排期
      return this.row;
    }
    return null;
  }
}
