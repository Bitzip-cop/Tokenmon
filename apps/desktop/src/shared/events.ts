// IPC 通道名,集中定义(规范 §6.4)。Pet 版:只剩桌宠相关通道。
//
// 约定:renderer -> main 的请求走 invoke/handle;main -> renderer 的通知走 send/on。

/** renderer -> main 的请求型通道(invoke/handle)。 */
export const IpcRequestChannels = {
  PetWatch: 'pet:watch',
  PetUnwatch: 'pet:unwatch',
  PetSaveCharacter: 'pet:save-character',
  PetGetCharacter: 'pet:get-character',
  PetCharacterSprite: 'pet:character-sprite',
  PetOpenTune: 'pet:open-tune',
  PetGetMapping: 'pet:get-mapping',
  PetSaveMapping: 'pet:save-mapping'
} as const;

/** main -> renderer 的事件型通道(send/on)。 */
export const IpcEventChannels = {
  PetState: 'pet:state',
  PetUsage: 'pet:usage',
  PetSetCharacter: 'pet:set-character',
  PetTuneRequest: 'pet:tune-request',
  PetMappingChanged: 'pet:mapping-changed'
} as const;

export type IpcRequestChannelName = (typeof IpcRequestChannels)[keyof typeof IpcRequestChannels];
export type IpcEventChannelName = (typeof IpcEventChannels)[keyof typeof IpcEventChannels];

/** 全部通道名(供 preload 白名单校验)。 */
export const ALL_EVENT_CHANNELS: readonly IpcEventChannelName[] = Object.values(IpcEventChannels);
export const ALL_REQUEST_CHANNELS: readonly IpcRequestChannelName[] = Object.values(IpcRequestChannels);
