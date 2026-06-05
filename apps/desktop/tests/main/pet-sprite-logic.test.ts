import { describe, it, expect } from 'vitest';
import { resolveRow, framesForRow, fpsForMood } from '../../src/renderer/src/components/Pet/sprite-logic';

const rows = {
  stateRows: { idle: 0, talking: 1, working: 2, waiting: 3 },
  moodRows: { eating: 4, happy: 7, idle: 0, sad: 5 }
} as const;

describe('resolveRow(行优先级)', () => {
  it('正在吃 > 活动(忙) > 心情(闲) > idle', () => {
    expect(resolveRow(rows, 'idle', 'eating')).toBe(4); // 吃优先
    expect(resolveRow(rows, 'working', 'eating')).toBe(4); // 吃仍优先于活动
    expect(resolveRow(rows, 'working', 'sad')).toBe(2); // 忙时看活动,不看心情
    expect(resolveRow(rows, 'idle', 'happy')).toBe(7); // 闲时看心情:开心
    expect(resolveRow(rows, 'idle', 'sad')).toBe(5); // 闲时看心情:难过
    expect(resolveRow(rows, 'idle', undefined)).toBe(0); // 闲且无心情 → idle
  });
  it('未知 mood/state 一律回退 idle 行(绝不返回 undefined → canvas 不画空帧)', () => {
    // 模拟脏数据 / 新旧 moodRows 键对不上(本次"宠物消失"的根因类型)
    expect(resolveRow(rows, 'idle', 'zzz' as unknown as never)).toBe(0);
    expect(resolveRow(rows, 'sleep' as unknown as never, undefined)).toBe(0);
    expect(Number.isInteger(resolveRow(rows, 'idle', 'nope' as unknown as never))).toBe(true);
  });
});

describe('framesForRow(按行真实帧数,杜绝空帧闪烁)', () => {
  // 与 CLAWD 对齐:逐像素分析所得各行真实帧数。
  const cfg = { framesPerRow: 8, framesByRow: [6, 8, 8, 4, 5, 8, 6, 6, 6] };
  it('返回该行真实帧数(idle 是 6 而非写死的 8 → 不再播到空帧)', () => {
    expect(framesForRow(cfg, 0)).toBe(6); // idle
    expect(framesForRow(cfg, 3)).toBe(4); // waiting / hungry
    expect(framesForRow(cfg, 4)).toBe(5); // eating
    expect(framesForRow(cfg, 1)).toBe(8); // talking 满帧
  });
  it('缺省 / 越界 / 非正 → 回退 framesPerRow', () => {
    expect(framesForRow({ framesPerRow: 8 }, 0)).toBe(8); // 无 framesByRow
    expect(framesForRow(cfg, 99)).toBe(8); // 行号越界
    expect(framesForRow({ framesPerRow: 8, framesByRow: [0] }, 0)).toBe(8); // 0 不合法
  });
});

describe('fpsForMood(难过减速 = 蔫)', () => {
  it('难过=半速(下限 1),其余原速', () => {
    expect(fpsForMood(6, 'sad')).toBe(3);
    expect(fpsForMood(6, 'happy')).toBe(6);
    expect(fpsForMood(6, 'idle')).toBe(6);
    expect(fpsForMood(6, 'eating')).toBe(6);
    expect(fpsForMood(6, undefined)).toBe(6);
    expect(fpsForMood(1, 'sad')).toBe(1);
  });
});
