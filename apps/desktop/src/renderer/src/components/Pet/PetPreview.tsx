// 独立角色预览(开发用):#pet 进入。
// 角色:由会话「活动」驱动状态(pet:state);HUD:由「消耗」驱动(pet:usage,今日+历史+喂养心情)。
import { useEffect, useState } from 'react';
import { PetSprite } from './PetSprite';
import { MoodIcon } from './MoodIcon';
import { CLAWD, type PetState } from './pets';
import { costBreakdown, pricingFor, type PetUsageSnapshot, type TokenTotals } from '@shared/pet-usage';
import { useIpcEvent } from '../../hooks/use-ipc-event';
import './Pet.css';

const STATES: PetState[] = ['idle', 'working', 'talking', 'waiting'];
const MOOD_LABEL: Record<PetUsageSnapshot['mood'], string> = { eating: 'eating', happy: 'happy', idle: 'bored', sad: 'sad' };

function fmtTokens(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}
function fmtCost(n: number): string {
  return '$' + (n < 1 ? n.toFixed(3) : n.toFixed(2));
}
function fmtAgo(ts: string | null): string {
  if (!ts) return '—';
  const ms = Date.now() - Date.parse(ts);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function PetPreview(): JSX.Element {
  const [state, setState] = useState<PetState>('idle');
  const [live, setLive] = useState(false);
  const [usage, setUsage] = useState<PetUsageSnapshot | null>(null);

  useEffect(() => {
    void window.tokenmon.invoke('pet:watch', {}).then(() => setLive(true));
    return () => {
      void window.tokenmon.invoke('pet:unwatch', {});
    };
  }, []);

  useIpcEvent('pet:state', ({ state: s }) => setState(s));
  useIpcEvent('pet:usage', (u) => setUsage(u));

  return (
    <div className="petpreview">
      <div className="petpreview__stage">
        <PetSprite config={CLAWD} state={state} mood={usage?.mood} scale={1.4} />
        {usage && (
          <div className="petpreview__mood">
            <MoodIcon mood={usage.mood} />
          </div>
        )}
      </div>

      {usage && (
        <div className="pethud">
          <div className="pethud__feed">
            <span className="pethud__mood">
              <MoodIcon mood={usage.mood} /> {MOOD_LABEL[usage.mood]}
            </span>
            <span className="pethud__ago">last output {fmtAgo(usage.lastOutputTs)}</span>
          </div>
          <div className="pethud__note">
            Mood follows recent output: eating → happy (≤30min) → bored (hours~2d) → sad (≥2d)
          </div>
          <div className="pethud__rows">
            {(
              [
                ['Today', usage.today],
                ['All time', usage.allTime]
              ] as [string, TokenTotals][]
            ).map(([label, t]) => {
              const b = costBreakdown(t, pricingFor(null));
              return (
                <div key={label} className="pethud__row">
                  <span className="pethud__k">{label}</span>
                  <span className="pethud__cost">
                    total ≈{fmtCost(b.total)} (output {fmtCost(b.output)}/↓{fmtTokens(t.output)}) · cache read {fmtCost(b.cacheRead)} excluded
                  </span>
                </div>
              );
            })}
          </div>
          <div className="pethud__note">
            since {usage.petStartDate} · API-equivalent estimate (not billed on subscriptions) · cache_read excluded
          </div>
        </div>
      )}

      <div className="petpreview__states">
        {STATES.map((s) => (
          <button key={s} className={s === state ? 'is-active' : ''} onClick={() => setState(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="petpreview__hint">
        {CLAWD.name} · {live ? '🟢 live session' : '○ connecting…'} (#pet preview; buttons = temporary override)
      </div>
    </div>
  );
}
