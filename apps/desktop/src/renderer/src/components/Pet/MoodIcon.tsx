import type { PetMood } from '@shared/pet-usage';

const LABELS: Record<PetMood, string> = {
  eating: '在吃',
  happy: '开心',
  idle: '闲着',
  sad: '难过'
};

export function MoodIcon({ mood, label = false }: { mood: PetMood; label?: boolean }): JSX.Element {
  return (
    <span className="moodiconWrap" title={`心情: ${LABELS[mood]}`}>
      <span className={`moodicon moodicon--${mood}`} aria-hidden="true">
        <span className="moodicon__face" />
      </span>
      {label && <span>{LABELS[mood]}</span>}
    </span>
  );
}
