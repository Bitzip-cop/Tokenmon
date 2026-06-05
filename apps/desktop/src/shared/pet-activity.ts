// 把 Claude Code 的活动映射成角色状态(纯逻辑,可单测)。
// 喂入粗粒度活动事件,带「静默自动衰减」:活跃态 → (说完话)等回复 → idle。now 由调用方注入,保证确定性。
import type { PetState } from './types/pet';

// 一次活动的粗类型:tool=调工具 / text=吐正文 / prompt=收到新指令 / result=工具返回。
export type PetActivityKind = 'tool' | 'text' | 'prompt' | 'result';

/** 多久没新活动就离开活跃态(毫秒)。 */
export const PET_IDLE_MS = 4000;
/** 说完话(最后事件是 assistant text)后,等用户回复的窗口(毫秒);超时回 idle。 */
export const PET_WAITING_MS = 120_000;

export class PetActivityTracker {
  private active: PetState = 'idle';
  private lastKind: PetActivityKind | null = null;
  private lastAt = 0;

  /** 喂入一次活动。text→说话;其余(tool/prompt/result)→干活。 */
  feed(kind: PetActivityKind, now: number): void {
    this.active = kind === 'text' ? 'talking' : 'working';
    this.lastKind = kind;
    this.lastAt = now;
  }

  /**
   * 当前状态:活跃窗口内 = 上次活跃态;之后若最后事件是「说完话」→ waiting(等用户回复,
   * 这是 waiting 的唯一真实来源);再超时 → idle。
   */
  current(now: number): PetState {
    if (this.lastAt === 0) return 'idle';
    const gap = now - this.lastAt;
    if (gap <= PET_IDLE_MS) return this.active;
    if (this.lastKind === 'text' && gap <= PET_WAITING_MS) return 'waiting';
    return 'idle';
  }
}
