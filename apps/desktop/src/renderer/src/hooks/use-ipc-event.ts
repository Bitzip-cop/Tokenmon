// 订阅 main -> renderer 的 IPC 事件,组件卸载时自动取消(规范 §12.2)。
import { useEffect, useRef } from 'react';
import type { IpcEventChannel, IpcEventPayload } from '@shared/ipc-contract';

export function useIpcEvent<C extends IpcEventChannel>(
  channel: C,
  handler: (payload: IpcEventPayload<C>) => void
): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => window.tokenmon.on(channel, (payload) => ref.current(payload)), [channel]);
}
