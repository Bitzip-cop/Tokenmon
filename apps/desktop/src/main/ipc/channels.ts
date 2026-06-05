// IPC 低层类型安全封装(规范 §6.4 / §7)。无业务逻辑,只做 ipcMain/webContents 的类型化包装。
import { ipcMain, BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type {
  IpcRequestChannel,
  IpcRequest,
  IpcResponse,
  IpcEventChannel,
  IpcEventPayload
} from '@shared/ipc-contract';

/** 注册一个请求处理器(renderer.invoke -> main.handle),类型由契约推导。 */
export function handle<C extends IpcRequestChannel>(
  channel: C,
  handler: (payload: IpcRequest<C>, event: IpcMainInvokeEvent) => Promise<IpcResponse<C>> | IpcResponse<C>
): void {
  ipcMain.handle(channel, (event, payload) => handler(payload as IpcRequest<C>, event));
}

/**
 * main -> renderer 的类型化事件发送器。**广播到所有窗口**(主窗口 + 桌宠悬浮窗等);
 * 各窗口只订阅自己关心的频道,互不影响。
 */
export class EventSender {
  emit<C extends IpcEventChannel>(channel: C, payload: IpcEventPayload<C>): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  }
}
