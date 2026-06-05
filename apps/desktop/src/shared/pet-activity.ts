// 把 Claude Code 的活动映射成角色状态(纯逻辑,可单测)。
// 喂入粗粒度活动事件,带「静默自动转 idle」的衰减。now 由调用方注入,保证确定性。
import type { PetState } from './types/pet';

// 一次活动的粗类型:tool=调工具 / text=吐正文 / prompt=收到新指令 / result=工具返回。
export type PetActivityKind = 'tool' | 'text' | 'prompt' | 'result';

/** 多久没新活动就回到 idle(毫秒)。 */
export const PET_IDLE_MS = 4000;

export class PetActivityTracker {
  private active: PetState = 'idle';
  private lastAt = 0;

  /** 喂入一次活动。text→说话;其余(tool/prompt/result)→干活。 */
  feed(kind: PetActivityKind, now: number): void {
    this.active = kind === 'text' ? 'talking' : 'working';
    this.lastAt = now;
  }

  /** 当前状态:超过 PET_IDLE_MS 没活动则 idle,否则上次的活跃态。 */
  current(now: number): PetState {
    if (this.lastAt === 0) return 'idle';
    return now - this.lastAt > PET_IDLE_MS ? 'idle' : this.active;
  }
}
