import type { Encounter } from '@/types/vocabulary';
import { formatDateTime } from '@/utils/date';

type Props = {
  encounters: Encounter[];
};

export function EncounterList({ encounters }: Props) {
  if (encounters.length === 0) {
    return <p className="text-sm text-ink-700">Chưa có ngữ cảnh nào.</p>;
  }

  return (
    <ul className="space-y-2">
      {encounters.map((e) => (
        <li key={e.id} className="card-soft">
          <p className="text-sm leading-relaxed text-ink-900">“{e.sentence}”</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-700">
            <span>{formatDateTime(e.encounteredAt)}</span>
            <span>·</span>
            <a
              href={e.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
              title={e.sourceTitle}
            >
              {e.domain || e.sourceTitle || 'Nguồn'}
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}
