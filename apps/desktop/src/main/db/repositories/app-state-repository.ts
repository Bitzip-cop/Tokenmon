// 通用 UI/应用状态键值存储(规范 §9.3 扩展)。值为 JSON 字符串。
// 画布布局存这里(端口/origin 无关,替代脆弱的渲染层 localStorage)。
import type { DB } from '../sqlite';

export class AppStateRepository {
  constructor(private readonly db: DB) {}

  get(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM app_state WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    return row ? row.value : null;
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO app_state(key, value, updated_at) VALUES(@key, @value, @updatedAt)
         ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = @updatedAt`
      )
      .run({ key, value, updatedAt: Date.now() });
  }
}
