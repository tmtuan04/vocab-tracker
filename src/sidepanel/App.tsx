import { useCallback, useEffect, useState } from 'react';
import { EncounterList } from '@/components/EncounterList';
import { SearchBox } from '@/components/SearchBox';
import { WordCard } from '@/components/WordCard';
import * as storage from '@/services/storage';
import { useVocabularies } from '@/stores/vocabStore';
import type { Encounter, Vocabulary } from '@/types/vocabulary';
import { formatDate } from '@/utils/date';

export default function App() {
  const [query, setQuery] = useState('');
  const { items, loading } = useVocabularies(query);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Vocabulary | null>(null);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const loadSelected = useCallback(async (id: string | null) => {
    if (!id) {
      setSelected(null);
      setEncounters([]);
      setNote('');
      return;
    }
    const vocab = await storage.getVocabulary(id);
    if (!vocab) {
      setSelected(null);
      setEncounters([]);
      setNote('');
      return;
    }
    const list = await storage.getEncountersFor(id);
    setSelected(vocab);
    setEncounters(list);
    setNote(vocab.note ?? '');
  }, []);

  useEffect(() => {
    void (async () => {
      const session = await chrome.storage.session.get('selectedVocabularyId');
      const id = session.selectedVocabularyId as string | undefined;
      if (id) {
        setSelectedId(id);
        await loadSelected(id);
      }
    })();

    const onSession = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === 'session' && changes.selectedVocabularyId) {
        const id = changes.selectedVocabularyId.newValue as string | undefined;
        setSelectedId(id ?? null);
        void loadSelected(id ?? null);
      }
    };
    chrome.storage.onChanged.addListener(onSession);
    return () => chrome.storage.onChanged.removeListener(onSession);
  }, [loadSelected]);

  useEffect(() => {
    if (selectedId) void loadSelected(selectedId);
  }, [items, selectedId, loadSelected]);

  const selectWord = async (vocab: Vocabulary) => {
    setSelectedId(vocab.id);
    await chrome.storage.session.set({ selectedVocabularyId: vocab.id });
    await loadSelected(vocab.id);
  };

  const saveNote = async () => {
    if (!selected) return;
    setSaving(true);
    setStatus(null);
    try {
      const updated = await storage.updateNote(selected.id, note);
      if (updated) {
        setSelected(updated);
        setStatus('Đã lưu ghi chú.');
      }
    } finally {
      setSaving(false);
    }
  };

  const removeWord = async () => {
    if (!selected) return;
    if (!confirm(`Xóa “${selected.word}” và mọi ngữ cảnh?`)) return;
    await storage.removeVocabulary(selected.id);
    await chrome.storage.session.remove('selectedVocabularyId');
    setSelectedId(null);
    setSelected(null);
    setEncounters([]);
    setNote('');
    setStatus('Đã xóa từ.');
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_0%_0%,#e6f2eb,transparent_45%),linear-gradient(180deg,#f6f7f4,#e8ebe3)] p-4">
      <header className="mb-4">
        <h1 className="font-display text-2xl font-semibold text-ink-900">
          Vocabulary
        </h1>
        <p className="text-sm text-ink-700">Chi tiết từ & lịch sử gặp</p>
      </header>

      <div className="mb-4">
        <SearchBox value={query} onChange={setQuery} />
      </div>

      {selected ? (
        <section className="mb-5 card-soft space-y-3">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl font-semibold text-ink-900">
                {selected.word}
              </h2>
              <span className="text-xs font-medium text-accent">✓ Đã lưu</span>
            </div>
            {selected.phonetic ? (
              <p className="text-sm text-ink-700">{selected.phonetic}</p>
            ) : null}
            {selected.partOfSpeech ? (
              <p className="text-xs italic text-ink-700">{selected.partOfSpeech}</p>
            ) : null}
          </div>

          <div className="rounded-md bg-accent-soft px-3 py-2 text-sm text-ink-800">
            <p>
              Số lần gặp: <strong>{selected.encounterCount}</strong>
            </p>
            <p className="mt-1 text-xs">
              Lần đầu: {formatDate(selected.firstSeenAt)} · Lần gần nhất:{' '}
              {formatDate(selected.lastSeenAt)}
            </p>
          </div>

          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-700">
              Nghĩa
            </h3>
            <p className="text-sm leading-relaxed text-ink-900">
              {selected.meaning || 'Chưa có nghĩa từ dictionary.'}
            </p>
          </div>

          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-700">
              Note
            </h3>
            <textarea
              className="field min-h-[80px] resize-y"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú cá nhân…"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={() => void saveNote()} disabled={saving}>
                {saving ? 'Đang lưu…' : 'Save note'}
              </button>
              <button type="button" className="btn-danger" onClick={() => void removeWord()}>
                Remove
              </button>
            </div>
            {status ? <p className="mt-2 text-xs text-accent-dark">{status}</p> : null}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-700">
              Lịch sử gặp
            </h3>
            <EncounterList encounters={encounters} />
          </div>
        </section>
      ) : (
        <p className="mb-5 rounded-lg border border-dashed border-ink-200 bg-white/80 p-3 text-sm text-ink-700">
          Chọn một từ bên dưới hoặc lưu từ trên trang web để xem chi tiết.
        </p>
      )}

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-700">
          Recent vocabularies
        </h2>
        {loading ? (
          <p className="text-sm text-ink-700">Đang tải…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-ink-700">Chưa có từ nào.</p>
        ) : (
          <div className="space-y-2">
            {items.slice(0, 30).map((v) => (
              <WordCard
                key={v.id}
                vocabulary={v}
                onClick={selectWord}
                active={v.id === selectedId}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
