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
 * 行优先级:正在吃 > 活动(忙) > 心情(闲) > idle。
 * **绝不返回 undefined**:任何查不到的 mood/state(脏数据、或新旧 moodRows 键对不上)
 * 一律回退到 idle 行,否则 canvas 会用 undefined*frameH 画出"完全空帧"(宠物消失)。
 */
export function resolveRow(rows: SpriteRows, state: PetState, mood?: PetMood): number {
  let row: number | undefined;
  if (mood === 'eating') row = rows.moodRows.eating;
  else if (state !== 'idle') row = rows.stateRows[state];
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
