import type { Vocabulary } from '@/types/vocabulary';
import { formatDate } from '@/utils/date';

type Props = {
  vocabulary: Vocabulary;
  onClick?: (vocabulary: Vocabulary) => void;
  active?: boolean;
};

export function WordCard({ vocabulary, onClick, active }: Props) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(vocabulary)}
      className={`w-full text-left card-soft transition-colors hover:border-accent ${
        active ? 'border-accent bg-accent-soft' : ''
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-base font-semibold text-ink-900">
          {vocabulary.word}
        </span>
        <span className="shrink-0 text-xs text-ink-700">
          ×{vocabulary.encounterCount}
        </span>
      </div>
      {vocabulary.meaning ? (
        <p className="mt-1 line-clamp-2 text-xs text-ink-700">{vocabulary.meaning}</p>
      ) : null}
      <p className="mt-1 text-[11px] text-ink-700/70">
        Gần nhất: {formatDate(vocabulary.lastSeenAt)}
      </p>
    </button>
  );
}
