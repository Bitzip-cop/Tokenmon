// 桌宠用量来源配置:Claude Code / Codex 各一只。两者差异(根目录、行解析、文件遍历、账本键)集中在这里。
import { readdirSync, existsSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  parseUsage,
  parseCodexUsage,
  DEFAULT_PRICING,
  type ParsedLine,
  type PetSourceId,
  type Pricing
} from '@shared/pet-usage';

export interface PetSource {
  id: PetSourceId;
  /** 用量 jsonl 根目录。 */
  root: string;
  /** app_state 持久化键(两源各一本账)。 */
  ledgerKey: string;
  /** 解析一行 → 用量 / 模型声明(无则 null)。 */
  parseLine: (line: string) => ParsedLine | null;
  /** 列出根下所有会话 jsonl(深度不同)。 */
  listFiles: (root: string) => string[];
  /**
   * 该源**默认**单价:null = 不按美元算(showCost 关)。
   * 注意逐条计价用 pricingForModel(source, model)(切模型也准);这里只作 showCost 开关 + 旧账本迁移折算的基线。
   */
  pricing: Pricing | null;
}

// Claude:~/.claude/projects/<slug>/*.jsonl(两层)。
function listClaude(root: string): string[] {
  const out: string[] = [];
  let dirs: string[];
  try {
    dirs = readdirSync(root);
  } catch {
    return out;
  }
  for (const d of dirs) {
    let names: string[];
    try {
      names = readdirSync(join(root, d));
    } catch {
      continue;
    }
    for (const n of names) if (n.endsWith('.jsonl')) out.push(join(root, d, n));
  }
  return out;
}

// Codex:~/.codex/sessions/YYYY/MM/DD/*.jsonl(按日期多层 → 递归)。
function listRecursive(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let ents: Dirent[];
    try {
      ents = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl')) out.push(p);
    }
  };
  walk(root);
  return out;
}

/** Claude Code 配置根(官方 env `CLAUDE_CONFIG_DIR` 可覆盖;默认 ~/.claude)。 */
export function claudeConfigDir(): string {
  const v = process.env.CLAUDE_CONFIG_DIR;
  return v && v.trim() ? v : join(homedir(), '.claude');
}
/** Codex 配置根(官方 env `CODEX_HOME` 可覆盖;默认 ~/.codex)。 */
export function codexHome(): string {
  const v = process.env.CODEX_HOME;
  return v && v.trim() ? v : join(homedir(), '.codex');
}

export const PET_SOURCES: Record<PetSourceId, PetSource> = {
  claude: {
    id: 'claude',
    root: join(claudeConfigDir(), 'projects'),
    ledgerKey: 'pet-usage-ledger',
    parseLine: parseUsage,
    listFiles: listClaude,
    pricing: DEFAULT_PRICING.opus // 默认档(opus 现价);逐条按 message.model 精准选档
  },
  codex: {
    id: 'codex',
    root: join(codexHome(), 'sessions'),
    ledgerKey: 'pet-usage-ledger-codex',
    parseLine: parseCodexUsage,
    listFiles: listRecursive,
    pricing: DEFAULT_PRICING.gpt55 // 默认档(GPT-5.5);逐条按 turn_context 声明的模型精准选档
  }
};

/**
 * 本机检测到的源(配置根存在 = 装过该工具)。开源用户可能只装其一 —— 只为存在的源开桌宠,
 * 避免另一只永远发呆的"空宠"。判 **配置根**(~/.claude / ~/.codex)而非 sessions 子目录:
 * 装了但还没产生会话的也算,宠会从 0 开始等着被喂。
 */
export function detectedSources(): PetSource[] {
  const roots: Record<PetSourceId, string> = { claude: claudeConfigDir(), codex: codexHome() };
  return (Object.values(PET_SOURCES) as PetSource[]).filter((s) => existsSync(roots[s.id]));
}
