/// <reference types="vite/client" />
import type { TokenmonApi } from '@shared/ipc-contract';

declare global {
  interface Window {
    tokenmon: TokenmonApi;
  }
}

export {};
