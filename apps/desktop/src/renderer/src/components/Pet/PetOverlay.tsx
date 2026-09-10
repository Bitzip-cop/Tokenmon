// 桌面悬浮宠物(独立置顶窗 #pet-overlay)。透明背景、整体可拖动窗口。
// 跟随真实 Claude Code 活动 + 心情(按最近产出);底部一条极简 HUD(心情 + 今日产出成本)。
import { useEffect, useMemo, useState } from 'react';
import { PetSprite } from './PetSprite';
import { MoodIcon } from './MoodIcon';
import { COST_WARNING_LABELS, modelLabel, quotaWindowLabel, quotaWindows } from '@shared/pet-usage';
import { makeConfig, BUNDLED_SPRITES, DEFAULT_CHARACTER, SOURCE_LABEL } from './pets';
import type { PetState } from '@shared/types/pet';
import type { PetUsageSnapshot, PetSourceId, CharacterMapping, PetQuota } from '@shared/pet-usage';
import { useIpcEvent } from '../../hooks/use-ipc-event';
import './Pet.css';

/** hover 面板底部的数据范围小字:只统计本地会话 jsonl;App/网页聊天在云端、本地无落地,原理上看不到。 */
const SOURCE_NOTE: Record<PetSourceId, { text: string; title: string }> = {
  claude: {
    text: 'Local Claude Code sessions only',
    title: 'Counts session logs under ~/.claude/projects (CLI & desktop-app Code). Chat in the Claude app / claude.ai never lands locally, so it cannot be counted.'
  },
  codex: {
    text: 'Local Codex CLI sessions only',
    title: 'Counts session logs under ~/.codex/sessions. ChatGPT app / web usage never lands locally, so it cannot be counted.'
  }
};

function fmtCost(n: number): string {
  return '$' + (n < 1 ? n.toFixed(3) : n.toFixed(2));
}
function fmtTokens(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}
function fmtPct(p: number): string {
  return (p < 10 ? p.toFixed(1) : String(Math.round(p))) + '%';
}
function fmtResetRelative(sec: number | null | undefined): string {
  if (!sec) return '';
  const ms = sec * 1000 - Date.now();
  if (ms <= 0) return 'resets soon';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `resets in ${h}h${m}m` : `resets in ${m}m`;
}
/** reset 是 epoch 秒；按用户本机时区显示紧凑的绝对日期时间。 */
function fmtResetDateTime(sec: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(sec * 1000));
}
function quotaResetWindows(quota: PetQuota) {
  return quotaWindows(quota).filter(
    (window): window is typeof window & { resetsAt: number } =>
      typeof window.resetsAt === 'number' && Number.isFinite(window.resetsAt) && window.resetsAt > 0
  );
}
function fmtQuota(quota: PetQuota): string {
  const windows = quotaWindows(quota);
  const fiveHour = windows.find((w) => w.windowMinutes === 300);
  const weekly = windows.find((w) => w.windowMinutes === 10080);
  if (fiveHour || weekly) {
    return `5h ${fiveHour ? fmtPct(fiveHour.usedPercent) : '—'} · wk ${weekly ? fmtPct(weekly.usedPercent) : '—'}`;
  }
  return windows.map((w) => `${quotaWindowLabel(w.windowMinutes)} ${fmtPct(w.usedPercent)}`).join(' · ');
}
function fmtQuotaReset(quota: PetQuota): string {
  return quotaResetWindows(quota)
    .map((w) => `${quotaWindowLabel(w.windowMinutes)} ${fmtResetRelative(w.resetsAt)}`)
    .join(' · ');
}

export function PetOverlay({ scale = 0.55, source = 'claude' }: { scale?: number; source?: PetSourceId }): JSX.Element {
  const [state, setState] = useState<PetState>('idle');
  const [usage, setUsage] = useState<PetUsageSnapshot | null>(null);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const id = characterId ?? DEFAULT_CHARACTER[source];
  const [diskSprite, setDiskSprite] = useState<string | null>(null);
  const [mapping, setMapping] = useState<CharacterMapping | null>(null);
  // 内置形象用打包资源;其余(导入到 ~/.codex/pets 的)向主进程取 data URL 显示。
  useEffect(() => {
    if (BUNDLED_SPRITES[id]) {
      setDiskSprite(null);
      return;
    }
    let alive = true;
    void window.tokenmon.invoke('pet:character-sprite', { id }).then((r) => {
      if (alive) setDiskSprite(r.dataUrl);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  // 该角色的「行→状态/心情」映射(「动作设置」存的;无则用默认)。
  useEffect(() => {
    void window.tokenmon.invoke('pet:get-mapping', { id }).then((r) => setMapping(r.mapping));
  }, [id]);
  const spriteUrl = BUNDLED_SPRITES[id] ?? diskSprite ?? BUNDLED_SPRITES[DEFAULT_CHARACTER[source]];
  const config = useMemo(() => makeConfig(id, spriteUrl, mapping), [id, spriteUrl, mapping]);
  const label = SOURCE_LABEL[source];
  const currentModel = modelLabel(usage?.lastModel ?? null);
  const resetWindows = usage?.quota ? quotaResetWindows(usage.quota) : [];

  useEffect(() => {
    void window.tokenmon.invoke('pet:watch', { source });
    return () => {
      void window.tokenmon.invoke('pet:unwatch', {});
    };
  }, [source]);

  // 载入持久化的形象选择(右键「更换形象」保存过的)。
  useEffect(() => {
    void window.tokenmon.invoke('pet:get-character', { source }).then((r) => setCharacterId(r.characterId));
  }, [source]);

  useIpcEvent('pet:state', (p) => {
    if (p.source === source) setState(p.state);
  });
  useIpcEvent('pet:usage', (u) => {
    if (u.source === source) setUsage(u);
  });
  // 右键菜单选了新形象 → 切换并持久化(菜单只发给被右键的那个窗口)。
  useIpcEvent('pet:set-character', (p) => {
    setCharacterId(p.characterId);
    void window.tokenmon.invoke('pet:save-character', { source, characterId: p.characterId });
  });
  // 右键「动作设置」→ 为这只桌宠的当前角色开设置窗口。
  useIpcEvent('pet:tune-request', () => {
    void window.tokenmon.invoke('pet:open-tune', { source, id });
  });
  // 该角色映射被改 → 重载,使桌宠立即用新映射。
  useIpcEvent('pet:mapping-changed', (p) => {
    if (p.id === id) void window.tokenmon.invoke('pet:get-mapping', { id }).then((r) => setMapping(r.mapping));
  });

  return (
    <div className="petoverlay">
      <div className="petoverlay__pet">
        <PetSprite config={config} state={state} mood={usage?.mood} scale={scale} />
      </div>
      {/* agent 名 + 当前模型(最近一笔用量的)一行在上;消耗数据单独一条在下;hover 再展开「今日用量」。 */}
      <div className="petoverlay__name">
        {label}
        {currentModel && <span className="petoverlay__modelTag"> · {currentModel}</span>}
      </div>
      {usage && (
        <div className="petoverlay__hud">
          <MoodIcon mood={usage.mood} />
          {usage.showCost && (
            <span title="API token estimate including cache reads and writes; not a subscription bill. Hover for details.">
              🍽 ≈{fmtCost(usage.todayCostUSD)}
            </span>
          )}
        </div>
      )}
      {usage && (
        <div className="petoverlay__more">
          <div className="petoverlay__moreHead">Today</div>
          <div className="petoverlay__moreRow">
            <span>↓ Output</span>
            <span>{fmtTokens(usage.today.output)}</span>
          </div>
          <div className="petoverlay__moreRow">
            <span>↑ Input</span>
            <span>{fmtTokens(usage.today.input)}</span>
          </div>
          <div className="petoverlay__moreRow">
            <span>⟳ Cache</span>
            {/* 只在记录到缓存写入时显示写入 token 数 */}
            <span>
              {usage.today.cacheWrite > 0 ? `w ${fmtTokens(usage.today.cacheWrite)} · ` : ''}r{' '}
              {fmtTokens(usage.today.cacheRead)}
            </span>
          </div>
          {usage.showCost && (
            <div className="petoverlay__moreRow">
              <span>≈ Cost</span>
              <span>{fmtCost(usage.todayCostUSD)}</span>
            </div>
          )}
          {usage.quota && (
            <div className="petoverlay__moreRow">
              <span>⏳ Quota</span>
              <span className="petoverlay__quota">{fmtQuota(usage.quota)}</span>
            </div>
          )}
          {usage.quota && resetWindows.length > 0 && (
            <div className="petoverlay__moreRow petoverlay__moreRow--reset" title={fmtQuotaReset(usage.quota)}>
              <span>↻ Reset</span>
              <span className="petoverlay__quota petoverlay__resetValues">
                {resetWindows.map((window) => (
                  <span key={window.windowMinutes}>
                    {quotaWindowLabel(window.windowMinutes)} {fmtResetDateTime(window.resetsAt)}
                  </span>
                ))}
              </span>
            </div>
          )}
          {usage.showCost && (
            <div className="petoverlay__moreNote" title={(usage.costWarnings ?? []).map(w => COST_WARNING_LABELS[w]).join(' ')}>
              API token estimate · includes cache
              {(usage.costWarnings?.length ?? 0) > 0 && <span> · ⚠ assumptions</span>}
            </div>
          )}
          <div className="petoverlay__moreNote" title={SOURCE_NOTE[source].title}>
            {SOURCE_NOTE[source].text}
          </div>
        </div>
      )}
    </div>
  );
}
