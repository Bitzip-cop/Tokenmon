// preload 暴露给 renderer 的 API 实现(规范 §4.2)。
//
// 规则:只暴露白名单 API,不暴露原始 ipcRenderer,不放业务逻辑。
import { ipcRenderer, webUtils } from 'electron';
import type {
  IpcRequestChannel,
  IpcRequest,
  IpcResponse,
  IpcEventChannel,
  IpcEventPayload,
  TokenmonApi
} from '@shared/ipc-contract';
import { ALL_EVENT_CHANNELS, ALL_REQUEST_CHANNELS } from '@shared/events';

const requestAllowList = new Set<string>(ALL_REQUEST_CHANNELS);
const eventAllowList = new Set<string>(ALL_EVENT_CHANNELS);

export const tokenmonApi: TokenmonApi = {
  invoke<C extends IpcRequestChannel>(channel: C, payload: IpcRequest<C>): Promise<IpcResponse<C>> {
    if (!requestAllowList.has(channel)) {
      return Promise.reject(new Error(`IPC request channel not allowed: ${channel}`));
    }
    return ipcRenderer.invoke(channel, payload) as Promise<IpcResponse<C>>;
  },

  on<C extends IpcEventChannel>(channel: C, listener: (payload: IpcEventPayload<C>) => void): () => void {
    if (!eventAllowList.has(channel)) {
      throw new Error(`IPC event channel not allowed: ${channel}`);
    }
    const handler = (_event: unknown, payload: IpcEventPayload<C>): void => listener(payload);
    ipcRenderer.on(channel, handler as never);
    return () => ipcRenderer.removeListener(channel, handler as never);
  },

  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file);
  }
};
