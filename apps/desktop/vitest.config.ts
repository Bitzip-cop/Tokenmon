import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    // 高风险纯逻辑优先(规范 §13):stream-json-parser / 状态机 / command-policy。
    // 渲染层组件测试(jsdom)留到 UI 稳定后接入。
    exclude: ['tests/e2e/**', 'tests/renderer/**', 'node_modules/**']
  }
});
