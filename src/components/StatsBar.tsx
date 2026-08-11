import type { VocabularyStats } from '@/types/vocabulary';

type Props = {
  stats: VocabularyStats;
};

export function StatsBar({ stats }: Props) {
  const items = [
    { label: 'Tổng số từ', value: stats.total },
    { label: 'Mới tuần này', value: stats.newThisWeek },
    { label: 'Cần ôn tập', value: stats.needsReview },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg bg-accent-soft px-2 py-2 text-center">
          <div className="font-display text-lg font-semibold text-accent-dark">
            {item.value}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-ink-700">
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}
