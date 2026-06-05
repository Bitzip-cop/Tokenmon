import { describe, it, expect } from 'vitest';
import { PetActivityTracker, PET_IDLE_MS, PET_WAITING_MS } from '../../src/shared/pet-activity';

describe('PetActivityTracker(活动→角色状态)', () => {
  it('初始为 idle', () => {
    expect(new PetActivityTracker().current(1000)).toBe('idle');
  });

  it('tool/prompt/result → working;text → talking', () => {
    const t = new PetActivityTracker();
    t.feed('tool', 1000);
    expect(t.current(1000)).toBe('working');
    t.feed('text', 1100);
    expect(t.current(1100)).toBe('talking');
    t.feed('prompt', 1200);
    expect(t.current(1200)).toBe('working');
    t.feed('result', 1300);
    expect(t.current(1300)).toBe('working');
  });

  it('衰减链:说完话 → waiting(等用户回复) → 超窗 idle', () => {
    const t = new PetActivityTracker();
    t.feed('text', 1000);
    expect(t.current(1000 + PET_IDLE_MS)).toBe('talking'); // 恰好不超,仍活跃
    expect(t.current(1000 + PET_IDLE_MS + 1)).toBe('waiting'); // 说完话 → 等回复
    expect(t.current(1000 + PET_WAITING_MS)).toBe('waiting'); // 窗口内持续等
    expect(t.current(1000 + PET_WAITING_MS + 1)).toBe('idle'); // 等不到 → idle
  });

  it('最后事件非 text(tool/result)→ 衰减直接 idle,不进 waiting', () => {
    const t = new PetActivityTracker();
    t.feed('tool', 1000);
    expect(t.current(1000 + PET_IDLE_MS + 1)).toBe('idle');
    t.feed('text', 9000);
    expect(t.current(9000)).toBe('talking'); // 新活动复活
  });
});
