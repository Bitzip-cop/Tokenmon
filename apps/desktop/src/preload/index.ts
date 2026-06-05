// preload 入口:通过 contextBridge 把白名单 API 挂到 window.tokenmon。
import { contextBridge } from 'electron';
import { tokenmonApi } from './api';
import type { TokenmonApi } from '@shared/ipc-contract';

contextBridge.exposeInMainWorld('tokenmon', tokenmonApi);

// 供 renderer 端类型引用。
declare global {
  interface Window {
    tokenmon: TokenmonApi;
  }
}
