import { useState } from 'react';
import { SearchBox } from '@/components/SearchBox';
import { StatsBar } from '@/components/StatsBar';
import { WordCard } from '@/components/WordCard';
import { useVocabularies } from '@/stores/vocabStore';
import type { Vocabulary } from '@/types/vocabulary';

export default function App() {
  const [query, setQuery] = useState('');
  const { items, stats, loading } = useVocabularies(query);

  const openDetail = async (vocab: Vocabulary) => {
    await chrome.storage.session.set({ selectedVocabularyId: vocab.id });
    try {
      const win = await chrome.windows.getCurrent();
      if (win.id != null) {
        await chrome.sidePanel.open({ windowId: win.id });
      }
    } catch {
      try {
        await chrome.runtime.sendMessage({
          type: 'OPEN_SIDEPANEL',
          payload: { vocabularyId: vocab.id },
        });
      } catch {
        // ignore
      }
    }
    // Close popup so it doesn't cover the side panel
    window.close();
  };

  return (
    <div className="w-[360px] min-h-[420px] bg-[radial-gradient(circle_at_top_left,#e6f2eb,transparent_55%),linear-gradient(180deg,#f6f7f4,#eef1ea)] p-4">
      <header className="mb-3">
        <h1 className="font-display text-xl font-semibold text-ink-900">
          My Vocabulary
        </h1>
        <p className="text-xs text-ink-700">
          Bôi đen từ → chuột phải → Save to My Vocabulary
        </p>
      </header>

      <div className="space-y-3">
        <SearchBox value={query} onChange={setQuery} />
        <StatsBar stats={stats} />

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-700">
            Recent vocabularies
          </h2>
          {loading ? (
            <p className="text-sm text-ink-700">Đang tải…</p>
          ) : items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-ink-200 bg-white/70 p-3 text-sm text-ink-700">
              Chưa có từ nào. Hãy bôi đen và lưu từ đầu tiên.
            </p>
          ) : (
            <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
              {items.slice(0, 20).map((v) => (
                <WordCard key={v.id} vocabulary={v} onClick={openDetail} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
