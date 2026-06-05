// 「动作设置」窗口(#pet-tune):为某角色把「精灵行 → 状态/心情」配好,保存后该角色的桌宠即用。
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { BUNDLED_SPRITES, GRID, DEFAULT_MAPPING, STATE_SLOTS, MOOD_SLOTS } from './pets';
import type { CharacterMapping, PetSourceId } from '@shared/pet-usage';

function clone(m: CharacterMapping): CharacterMapping {
  return { stateRows: { ...m.stateRows }, moodRows: { ...m.moodRows } };
}
function btn(primary: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '6px 0',
    borderRadius: 6,
    border: '1px solid #2a2c33',
    background: primary ? '#2f6df6' : '#1a1c22',
    color: '#fff',
    cursor: 'pointer'
  };
}

function Slot({
  label,
  value,
  rows,
  onChange
}: {
  label: string;
  value: number;
  rows: number;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '3px 0' }}>
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: '#1a1c22', color: '#e6e6e6', border: '1px solid #2a2c33', borderRadius: 4, padding: '2px 6px' }}
      >
        {Array.from({ length: rows }, (_, i) => i).map((i) => (
          <option key={i} value={i}>
            Row {i}
          </option>
        ))}
      </select>
    </label>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontWeight: 600, opacity: 0.7, margin: '4px 0' }}>{title}</div>
      {children}
    </div>
  );
}

export function PetTune({ source, id }: { source: PetSourceId; id: string }): JSX.Element {
  const [sprite, setSprite] = useState<string | null>(BUNDLED_SPRITES[id] ?? null);
  const [m, setM] = useState<CharacterMapping>(() => clone(DEFAULT_MAPPING));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!BUNDLED_SPRITES[id]) void window.tokenmon.invoke('pet:character-sprite', { id }).then((r) => setSprite(r.dataUrl));
    void window.tokenmon.invoke('pet:get-mapping', { id }).then((r) => {
      if (r.mapping) setM(clone(r.mapping));
    });
  }, [id]);

  const scale = 300 / (GRID.cols * GRID.frameW); // 整行缩到 ~300px 宽
  const stripW = GRID.cols * GRID.frameW * scale;
  const rowH = GRID.frameH * scale;
  const rows = useMemo(() => Array.from({ length: GRID.rows }, (_, i) => i), []);

  const setRow = (kind: 'stateRows' | 'moodRows', key: string, row: number): void =>
    setM((prev) => ({ ...prev, [kind]: { ...prev[kind], [key]: row } }));

  const save = (): void => {
    void window.tokenmon.invoke('pet:save-mapping', { id, mapping: m });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div style={{ padding: 12, color: '#e6e6e6', font: '12px ui-monospace, Menlo, monospace', background: '#0b0d12' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        Actions · {id} ({source})
      </div>
      <div style={{ opacity: 0.7, marginBottom: 8 }}>Pick a sprite row for each state / mood (this character's rows below):</div>

      <div style={{ marginBottom: 10 }}>
        {sprite ? (
          rows.map((r) => (
            <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ width: 16, textAlign: 'right', opacity: 0.6 }}>{r}</span>
              <div
                style={{
                  width: stripW,
                  height: rowH,
                  imageRendering: 'pixelated',
                  backgroundImage: `url(${sprite})`,
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: `${stripW}px ${GRID.rows * rowH}px`,
                  backgroundPosition: `0 -${r * rowH}px`,
                  border: '1px solid #2a2c33',
                  borderRadius: 4
                }}
              />
            </div>
          ))
        ) : (
          <div style={{ opacity: 0.6 }}>Loading sprite…</div>
        )}
      </div>

      <Section title="Activity states">
        {STATE_SLOTS.map((s) => (
          <Slot key={s.key} label={s.label} value={m.stateRows[s.key]} rows={GRID.rows} onChange={(v) => setRow('stateRows', s.key, v)} />
        ))}
      </Section>
      <Section title="Moods">
        {MOOD_SLOTS.map((s) => (
          <Slot key={s.key} label={s.label} value={m.moodRows[s.key]} rows={GRID.rows} onChange={(v) => setRow('moodRows', s.key, v)} />
        ))}
      </Section>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
        <button onClick={save} style={btn(true)}>
          {saved ? 'Saved ✓' : 'Save'}
        </button>
        <button onClick={() => setM(clone(DEFAULT_MAPPING))} style={btn(false)}>
          Reset to default
        </button>
      </div>
    </div>
  );
}
