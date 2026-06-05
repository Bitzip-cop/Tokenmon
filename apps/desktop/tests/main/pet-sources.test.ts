// 数据源检测:CLAUDE_CONFIG_DIR / CODEX_HOME 覆盖 + 只为存在的源开宠。
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeConfigDir, codexHome, detectedSources } from '../../src/main/pet/sources';

const saved = { claude: process.env.CLAUDE_CONFIG_DIR, codex: process.env.CODEX_HOME };
let tmp: string[] = [];
afterEach(() => {
  if (saved.claude === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = saved.claude;
  if (saved.codex === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = saved.codex;
  tmp.forEach((d) => rmSync(d, { recursive: true, force: true }));
  tmp = [];
});

describe('数据源路径 + 检测', () => {
  it('CLAUDE_CONFIG_DIR / CODEX_HOME 覆盖默认 ~/.claude / ~/.codex', () => {
    process.env.CLAUDE_CONFIG_DIR = '/x/claude-cfg';
    process.env.CODEX_HOME = '/x/codex-home';
    expect(claudeConfigDir()).toBe('/x/claude-cfg');
    expect(codexHome()).toBe('/x/codex-home');
    delete process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CODEX_HOME;
    expect(claudeConfigDir()).toMatch(/\.claude$/);
    expect(codexHome()).toMatch(/\.codex$/);
  });

  it('detectedSources:只返回配置根存在的源(没装 Codex 就没有 codex 宠)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'claude-cfg-'));
    tmp.push(dir);
    process.env.CLAUDE_CONFIG_DIR = dir; // 存在
    process.env.CODEX_HOME = join(dir, 'definitely-missing'); // 不存在
    expect(detectedSources().map((s) => s.id)).toEqual(['claude']);
    process.env.CLAUDE_CONFIG_DIR = join(dir, 'also-missing');
    expect(detectedSources()).toEqual([]);
  });
});
