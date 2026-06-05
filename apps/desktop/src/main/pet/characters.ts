// 形象(codex-pets)管理:列出可选形象、把精灵表读成 data URL(供动态/导入的形象显示)、跑下载命令。
// 内置两个(clawd/chispa,来自 codex-pets 项目)由渲染层打包;其余从 ~/.codex/pets 动态来。
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { codexHome } from './sources';
import { createLogger } from '../logging/logger';

const log = createLogger('pet:characters');
const PETS_DIR = join(codexHome(), 'pets'); // 跟随 CODEX_HOME(codex-pets 的下载目录)
const BUNDLED = ['clawd', 'chispa']; // 渲染层已打包(离线兜底;makima 因第三方 IP 不随仓库分发,可经「导入形象」获取)
const ID_RE = /^[a-zA-Z0-9_-]+$/; // 防目录穿越 / 命令注入

export interface CharacterInfo {
  id: string;
  name: string;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function displayName(id: string): string {
  try {
    const meta = JSON.parse(readFileSync(join(PETS_DIR, id, 'pet.json'), 'utf8')) as { displayName?: unknown };
    if (typeof meta.displayName === 'string') return meta.displayName;
  } catch {
    /* ignore */
  }
  return cap(id);
}

/** 可选形象:内置 + ~/.codex/pets 下每个含 spritesheet.webp 的目录(去重)。 */
export function listCharacters(): CharacterInfo[] {
  const byId = new Map<string, CharacterInfo>();
  for (const id of BUNDLED) byId.set(id, { id, name: cap(id) });
  let dirs: string[] = [];
  try {
    dirs = readdirSync(PETS_DIR);
  } catch {
    /* 没装 codex-pets */
  }
  for (const id of dirs) {
    if (!ID_RE.test(id)) continue;
    if (!existsSync(join(PETS_DIR, id, 'spritesheet.webp'))) continue;
    byId.set(id, { id, name: displayName(id) });
  }
  return [...byId.values()];
}

/** 读某形象精灵表为 data URL(从磁盘;无则 null)。内置的渲染层直接用打包资源,不走这。 */
export function readCharacterSprite(id: string): string | null {
  if (!ID_RE.test(id)) return null;
  try {
    const buf = readFileSync(join(PETS_DIR, id, 'spritesheet.webp'));
    return `data:image/webp;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** 从 codex-pets 下载命令里解析形象 id(支持 `npx codex-pets add <id>` 或直接 `<id>`)。 */
export function parsePetId(text: string): string | null {
  const t = text.trim();
  const m = t.match(/codex-pets\s+add\s+([a-zA-Z0-9_-]+)/i) || t.match(/^([a-zA-Z0-9_-]+)$/);
  return m ? m[1] : null;
}

/** 跑 `npx codex-pets add <id>` 下载形象到 ~/.codex/pets;成功返回 {id,name}。 */
export function importCharacter(id: string): Promise<{ ok: boolean; id: string; name?: string; error?: string }> {
  if (!ID_RE.test(id)) return Promise.resolve({ ok: false, id, error: 'invalid character name' });
  // 经登录 shell 跑:打包后的 .app 不继承终端 PATH(只有 /usr/bin:/bin…),直接 execFile('npx') 找不到。
  // -lc 让 shell 读登录配置拿到 nvm/homebrew 的 PATH。id 已过 ID_RE 白名单,无注入面。
  const shell = process.env.SHELL || '/bin/zsh';
  return new Promise((resolve) => {
    execFile(shell, ['-lc', `npx --yes codex-pets add ${id}`], { timeout: 120_000 }, (err) => {
      if (err) {
        log.warn('import failed', { id, error: String(err).slice(0, 160) });
        resolve({ ok: false, id, error: String(err).slice(0, 200) });
        return;
      }
      if (!existsSync(join(PETS_DIR, id, 'spritesheet.webp'))) {
        resolve({ ok: false, id, error: 'spritesheet not found after download — wrong character name?' });
        return;
      }
      log.info('imported character', { id });
      resolve({ ok: true, id, name: displayName(id) });
    });
  });
}
