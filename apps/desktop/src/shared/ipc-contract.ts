// 类型安全的 IPC 契约(规范 §7.1 / §7.2)。Pet 版:只剩桌宠相关通道。
// preload 与 main/ipc 都基于本契约,保证编译期对齐。
import type { PetState } from './types/pet';
import type { PetUsageSnapshot, PetSourceId, CharacterMapping } from './pet-usage';

/** renderer -> main:每个通道的请求体与响应体。 */
export interface IpcRequestMap {
  /** 开始监听某来源(claude/codex,省略=claude):活动→pet:state、用量→pet:usage。cwd 省略=全局。 */
  'pet:watch': {
    request: { cwd?: string | null; source?: PetSourceId };
    response: { ok: true };
  };
  'pet:unwatch': {
    request: Record<string, never>;
    response: { ok: true };
  };
  /** 保存某来源选中的形象 id(右键「更换形象」后持久化)。 */
  'pet:save-character': {
    request: { source: PetSourceId; characterId: string };
    response: { ok: true };
  };
  /** 取某来源已保存的形象 id(无则 null)。 */
  'pet:get-character': {
    request: { source: PetSourceId };
    response: { characterId: string | null };
  };
  /** 取某形象精灵表的 data URL(磁盘上的/导入的;内置形象渲染层直接用打包资源,不走这)。 */
  'pet:character-sprite': {
    request: { id: string };
    response: { dataUrl: string | null };
  };
  /** 打开「动作设置」窗口(为某来源的某角色)。 */
  'pet:open-tune': {
    request: { source: PetSourceId; id: string };
    response: { ok: true };
  };
  /** 取某角色的行映射(无则 null,渲染层用默认)。 */
  'pet:get-mapping': {
    request: { id: string };
    response: { mapping: CharacterMapping | null };
  };
  /** 存某角色的行映射(「动作设置」保存)。 */
  'pet:save-mapping': {
    request: { id: string; mapping: CharacterMapping };
    response: { ok: true };
  };
}

export type IpcRequestChannel = keyof IpcRequestMap;
export type IpcRequest<C extends IpcRequestChannel> = IpcRequestMap[C]['request'];
export type IpcResponse<C extends IpcRequestChannel> = IpcRequestMap[C]['response'];

/** main -> renderer:每个事件通道的负载类型。 */
export interface IpcEventMap {
  /** 角色状态(由会话活动驱动),带来源以便渲染层分流到对应那只宠物。 */
  'pet:state': { source: PetSourceId; state: PetState };
  /** 消耗快照:今日/历史 token + 成本估算 + 心情。 */
  'pet:usage': PetUsageSnapshot;
  /** 右键菜单选了新形象 → 通知该悬浮窗切换。 */
  'pet:set-character': { characterId: string };
  /** 右键「动作设置」→ 让被右键的桌宠打开自己角色的设置窗口。 */
  'pet:tune-request': Record<string, never>;
  /** 某角色映射已更新 → 用该角色的桌宠重载映射。 */
  'pet:mapping-changed': { id: string };
}

export type IpcEventChannel = keyof IpcEventMap;
export type IpcEventPayload<C extends IpcEventChannel> = IpcEventMap[C];

/** preload 暴露给 renderer 的 API 形态(window.tokenmon)。 */
export interface TokenmonApi {
  invoke<C extends IpcRequestChannel>(channel: C, payload: IpcRequest<C>): Promise<IpcResponse<C>>;
  on<C extends IpcEventChannel>(channel: C, listener: (payload: IpcEventPayload<C>) => void): () => void;
  /** 取拖拽进来的文件/文件夹的真实路径(Electron webUtils,仅 preload 可调)。 */
  getPathForFile(file: File): string;
}
