// 角色(codex-pets 格式)。独立件:只描述精灵表怎么切、状态对应哪一行。
// 一张 spritesheet:cols×rows 帧,每帧 frameW×frameH;每个状态播某一行的前 framesPerRow 帧。
import clawdSheet from '../../assets/pets/clawd/spritesheet.webp';
import chispaSheet from '../../assets/pets/chispa/spritesheet.webp';
import type { PetState } from '@shared/types/pet';
import type { PetMood, PetSourceId, CharacterMapping } from '@shared/pet-usage';

export type { PetState };

export interface PetConfig {
  name: string;
  /** spritesheet 图片 URL(vite import)。 */
  spritesheet: string;
  cols: number;
  rows: number;
  /** 默认每行循环帧数(可少于 cols);某行有专属帧数时被 framesByRow 覆盖。 */
  framesPerRow: number;
  /** 每行真实帧数(index=行号)。spritesheet 多数行尾部留空,写实际帧数以杜绝循环到空帧的闪烁。 */
  framesByRow?: number[];
  fps: number;
  frameW: number;
  frameH: number;
  /** 活动状态 → 行号(忙的时候用)。 */
  stateRows: Record<PetState, number>;
  /** 心情 → 行号(闲下来按喂养心情用)。 */
  moodRows: Record<PetMood, number>;
  /** 自发闲置动画的候选行(闲着时偶尔随机播一轮;排除吃/难过等带语义的行)。 */
  flourishRows?: number[];
}

// codex-pets 网格(8列×9行,帧 192×208;各行真实帧数逐像素分析得)。所有 codex-pets 同款,只换精灵表。
export const GRID: Omit<PetConfig, 'name' | 'spritesheet'> = {
  cols: 8,
  rows: 9,
  framesPerRow: 8,
  framesByRow: [6, 8, 8, 4, 5, 8, 6, 6, 6],
  fps: 6,
  frameW: 192,
  frameH: 208,
  // clawd 实际行语义(逐帧看图定):0=耳机闲 1/2/7=滑板系 3=安全帽扳手 4=吃 5=难过趴 6=趴甩尾 8=侦探放大镜。
  // 旧映射把 talking(1)/working(2)/happy(7) 全配进滑板系 → 观感"只会玩滑板";现在尽量一态一景。
  stateRows: { idle: 0, talking: 1, working: 3, waiting: 8 },
  moodRows: { eating: 4, happy: 7, idle: 0, sad: 5 },
  flourishRows: [1, 2, 3, 6, 7, 8] // 闲着时偶尔随机耍一轮(不含吃/难过)
};

/** 用指定精灵表(打包 URL 或 data URL)拼一个形象配置;mapping 给定时覆盖默认行映射。 */
export function makeConfig(name: string, spritesheet: string, mapping?: CharacterMapping | null): PetConfig {
  return {
    ...GRID,
    name,
    spritesheet,
    ...(mapping ? { stateRows: mapping.stateRows, moodRows: mapping.moodRows } : {})
  };
}

/** 默认行映射(GRID 的);「动作设置」未自定义时用。 */
export const DEFAULT_MAPPING: CharacterMapping = { stateRows: GRID.stateRows, moodRows: GRID.moodRows };
/** 「动作设置」要配的槽位(活动状态 + 心情)。 */
export const STATE_SLOTS: { key: PetState; label: string }[] = [
  { key: 'idle', label: 'Idle' },
  { key: 'working', label: 'Working' },
  { key: 'talking', label: 'Talking' },
  { key: 'waiting', label: 'Waiting' }
];
export const MOOD_SLOTS: { key: PetMood; label: string }[] = [
  { key: 'eating', label: 'Eating' },
  { key: 'happy', label: 'Happy' },
  { key: 'idle', label: 'Bored' },
  { key: 'sad', label: 'Sad' }
];

/** 内置打包的形象精灵(离线兜底 + 默认);其余(含导入的)由主进程从 ~/.codex/pets 读成 data URL。 */
export const BUNDLED_SPRITES: Record<string, string> = { clawd: clawdSheet, chispa: chispaSheet };

/** Clawd 配置(PetPreview 开发预览用)。 */
export const CLAWD: PetConfig = makeConfig('Clawd', clawdSheet);

/** 各来源默认形象。 */
export const DEFAULT_CHARACTER: Record<PetSourceId, string> = { claude: 'clawd', codex: 'chispa' };
/** 形象下方标注的 agent 名(按来源,不随形象变)。 */
export const SOURCE_LABEL: Record<PetSourceId, string> = { claude: 'Claude', codex: 'Codex' };
