import { useCallback, useEffect, useRef, useState } from 'react';
import { EncounterList } from '@/components/EncounterList';
import { SearchBox } from '@/components/SearchBox';
import { WordCard } from '@/components/WordCard';
import { fetchDictionary, getFirstDefinition } from '@/services/dictionary';
import { GRADE_LABELS, previewInterval, getSRSConfig, setSRSConfig } from '@/services/srs';
import type { ReviewGrade, SRSConfig } from '@/services/srs';
import * as storage from '@/services/storage';
import * as sheets from '@/services/sheets';
import { useVocabularies } from '@/stores/vocabStore';
import type { DictionaryEntry, Encounter, ReviewInfo, SelectionPayload, Vocabulary } from '@/types/vocabulary';
import { formatDate, formatDateTime } from '@/utils/date';

type Tab = 'list' | 'study' | 'settings' | 'guide';

// ─── Audio Button ─────────────────────────────────────────────────────────────

function AudioButton({ url, word }: { url?: string; word: string }) {
  const [playing, setPlaying] = useState(false);
  const play = async () => {
    if (playing) return;
    setPlaying(true);

    // Thử 1: Fetch audio URL as blob
    if (url) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          const audio = new Audio(blobUrl);
          audio.onended = () => { setPlaying(false); URL.revokeObjectURL(blobUrl); };
          audio.onerror = () => {
            URL.revokeObjectURL(blobUrl);
            // Fallback sang speechSynthesis
            speakWord(word, () => setPlaying(false));
          };
          await audio.play();
          return;
        }
      } catch {
        // fall through to speechSynthesis
      }
    }

    // Thử 2: Web Speech API (luôn hoạt động, không cần mạng)
    speakWord(word, () => setPlaying(false));
  };
  return (
    <button type="button" onClick={() => void play()} disabled={playing} title="Nghe phát âm"
      className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50">
      {playing ? (
        <svg className="h-3 w-3 animate-pulse" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
        </svg>
      )}
    </button>
  );
}

function speakWord(word: string, onDone: () => void): void {
  if (!window.speechSynthesis) { onDone(); return; }
  const utter = new SpeechSynthesisUtterance(word);
  utter.lang = 'en-US';
  utter.rate = 0.9;
  utter.onend = onDone;
  utter.onerror = onDone;
  window.speechSynthesis.speak(utter);
}

// ─── Dictionary Card ──────────────────────────────────────────────────────────

function DictionaryCard({ entry, word, defaultCollapsed = false }: { entry: DictionaryEntry; word: string; defaultCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div className="rounded-lg border border-ink-200 bg-white text-sm">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-ink-100">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display font-semibold text-ink-900">{word}</span>
          {entry.phonetic && <span className="text-ink-500 font-mono text-xs">{entry.phonetic}</span>}
          <AudioButton url={entry.audioUrl} word={word} />
        </div>
        <button type="button" onClick={() => setCollapsed((c) => !c)}
          className="shrink-0 text-xs text-ink-400 hover:text-ink-600">
          {collapsed ? 'Mở rộng ▸' : 'Thu gọn ▴'}
        </button>
      </div>
      {!collapsed && (
        <div className="divide-y divide-ink-50 px-3 py-1">
          {entry.meanings.map((meaning, mi) => (
            <div key={mi} className="py-2">
              <span className="inline-block mb-1.5 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-dark">
                {meaning.partOfSpeech}
              </span>
              <ol className="space-y-2 pl-1">
                {meaning.definitions.map((def, di) => (
                  <li key={di} className="flex gap-2">
                    <span className="shrink-0 text-[11px] font-semibold text-ink-400 mt-0.5 w-4">{di + 1}.</span>
                    <div className="flex-1">
                      <p className="text-ink-800 leading-snug">{def.definition}</p>
                      {def.example && <p className="mt-0.5 italic text-ink-500 text-xs">"{def.example}"</p>}
                      {def.synonyms && def.synonyms.length > 0 && (
                        <p className="mt-0.5 text-[11px] text-ink-400">
                          <span className="font-medium">Syn:</span> {def.synonyms.join(', ')}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
              {meaning.synonyms && meaning.synonyms.length > 0 && (
                <p className="mt-1.5 text-[11px] text-ink-500">
                  <span className="font-semibold">Synonyms:</span> {meaning.synonyms.join(', ')}
                </p>
              )}
              {meaning.antonyms && meaning.antonyms.length > 0 && (
                <p className="mt-0.5 text-[11px] text-ink-500">
                  <span className="font-semibold">Antonyms:</span> {meaning.antonyms.join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Add New Word Form ────────────────────────────────────────────────────────

function AddWordForm({ pending, onSaved, onCancel }: {
  pending: SelectionPayload;
  onSaved: (vocab: Vocabulary) => void;
  onCancel: () => void;
}) {
  const [wordText, setWordText] = useState(pending.word);
  const [meaning, setMeaning] = useState('');
  const [example, setExample] = useState('');
  const [dictEntry, setDictEntry] = useState<DictionaryEntry | null>(null);
  const [dictLoading, setDictLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const meaningRef = useRef<HTMLTextAreaElement>(null);
  const didPrefill = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchDictionary(pending.word).then((entry) => {
      if (cancelled) return;
      setDictEntry(entry);
      setDictLoading(false);
      if (entry && !didPrefill.current && !meaning) {
        const first = getFirstDefinition(entry);
        if (first) { setMeaning(first); didPrefill.current = true; }
      }
    }).catch(() => { if (!cancelled) setDictLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.word]);

  useEffect(() => { if (!dictLoading) meaningRef.current?.focus(); }, [dictLoading]);

  const handleSave = async () => {
    if (!meaning.trim()) { setError('Vui lòng nhập nghĩa.'); meaningRef.current?.focus(); return; }
    setSaving(true); setError('');
    try {
      const result = await storage.saveWord({
        word: wordText.trim() || pending.word, sentence: pending.sentence, sourceUrl: pending.sourceUrl,
        sourceTitle: pending.sourceTitle, domain: pending.domain,
        meaning: meaning.trim(), example: example.trim() || undefined,
        dictionary: dictEntry ?? undefined,
      });
      await chrome.storage.session.set({ pendingNewWord: null, selectedVocabularyId: result.vocabulary.id });
      try { await chrome.runtime.sendMessage({ type: 'VOCAB_UPDATED' }); } catch { /* ignore */ }
      onSaved(result.vocabulary);
    } catch (err) { setError(err instanceof Error ? err.message : 'Lưu thất bại'); }
    finally { setSaving(false); }
  };

  return (
    <div className="mb-4 rounded-xl border-2 border-accent/30 bg-gradient-to-br from-accent-soft/60 to-white p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0 group">
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">+</span>
          <input type="text" value={wordText} onChange={(e) => setWordText(e.target.value)}
            className="font-display text-xl font-bold text-ink-900 bg-transparent border-b border-dashed border-ink-200 outline-none w-full focus:bg-ink-50 focus:border-accent focus:border-solid focus:rounded-lg focus:px-1.5 focus:py-0.5 transition-all"
            placeholder="Từ vựng" />
          <svg className="h-4 w-4 shrink-0 text-ink-400 group-hover:text-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
          </svg>
        </div>
        <span className="text-xs text-ink-400 shrink-0 ml-2">Từ mới</span>
      </div>

      {pending.sentence && pending.sentence !== pending.word && (
        <p className="rounded-md bg-ink-50 border border-ink-100 px-3 py-2 text-xs italic text-ink-600">
          "{pending.sentence}"
          {pending.domain && <span className="ml-1 not-italic text-ink-400">— {pending.domain}</span>}
        </p>
      )}

      {dictLoading ? (
        <div className="flex items-center gap-2 text-xs text-ink-500 py-1">
          <svg className="h-3.5 w-3.5 animate-spin text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity=".25"/>
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
          </svg>
          Đang tra từ điển…
        </div>
      ) : dictEntry ? (
        <DictionaryCard entry={dictEntry} word={pending.word} />
      ) : (
        <p className="text-xs text-ink-400 italic">Không tìm thấy trong từ điển.</p>
      )}

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-600">
          Nghĩa của bạn <span className="text-red-500">*</span>
        </label>
        <textarea ref={meaningRef} className="field min-h-[50px] resize-y" placeholder="Nhập hoặc chỉnh sửa nghĩa…"
          value={meaning} onChange={(e) => { setMeaning(e.target.value); setError(''); }} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-600">Ví dụ</label>
        <textarea className="field min-h-[60px] resize-y" placeholder="Câu ví dụ…"
          value={example} onChange={(e) => setExample(e.target.value)} />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-primary flex-1" onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Đang lưu…' : '✓ Lưu từ'}
        </button>
        <button type="button" className="btn-ghost border border-ink-200" onClick={onCancel}>Bỏ qua</button>
      </div>
    </div>
  );
}

// ─── Word Detail ──────────────────────────────────────────────────────────────

function WordDetail({ vocab, encounters, onUpdated, onDeleted }: {
  vocab: Vocabulary; encounters: Encounter[];
  onUpdated: (v: Vocabulary) => void; onDeleted: () => void;
}) {
  const [wordText, setWordText] = useState(vocab.word);
  const [meaning, setMeaning] = useState(vocab.meaning ?? '');
  const [example, setExample] = useState(vocab.example ?? '');
  const [note, setNote] = useState(vocab.note ?? '');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [dictEntry, setDictEntry] = useState<DictionaryEntry | null>(vocab.dictionary ?? null);
  const [dictLoading, setDictLoading] = useState(!vocab.dictionary);

  useEffect(() => {
    setWordText(vocab.word); setMeaning(vocab.meaning ?? ''); setExample(vocab.example ?? ''); setNote(vocab.note ?? '');
    setStatus(null); setDictEntry(vocab.dictionary ?? null); setDictLoading(!vocab.dictionary);
  }, [vocab.id, vocab.word, vocab.meaning, vocab.example, vocab.note, vocab.dictionary]);

  useEffect(() => {
    if (vocab.dictionary) return;
    let cancelled = false;
    fetchDictionary(vocab.word).then((entry) => {
      if (cancelled) return;
      setDictEntry(entry); setDictLoading(false);
      if (entry) void storage.updateVocabulary(vocab.id, { dictionary: entry });
    }).catch(() => { if (!cancelled) setDictLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vocab.id]);

  const handleSave = async () => {
    setSaving(true); setStatus(null);
    try {
      const updated = await storage.updateVocabulary(vocab.id, {
        word: wordText.trim() || vocab.word,
        meaning: meaning.trim(), example: example.trim() || undefined, note: note.trim() || undefined,
      });
      if (updated) { onUpdated(updated); setStatus('Đã lưu.'); setTimeout(() => setStatus(null), 2000); }
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Xóa "${vocab.word}"?`)) return;
    await storage.removeVocabulary(vocab.id);
    await chrome.storage.session.remove('selectedVocabularyId');
    onDeleted();
  };

  const review = vocab.review;
  const reviewInfo = review ? (
    <span className="text-[11px] text-ink-500">
      Ôn: {new Date(review.nextReviewAt) <= new Date() ? (
        <span className="text-orange-500 font-medium">Đến hạn</span>
      ) : (
        formatDate(review.nextReviewAt)
      )} · {review.repetitions} lần
    </span>
  ) : <span className="text-[11px] text-ink-400">Chưa ôn tập</span>;

  return (
    <section className="mb-4 card-soft space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0 group">
          <input type="text" value={wordText} onChange={(e) => setWordText(e.target.value)}
            className="font-display text-2xl font-semibold text-ink-900 bg-transparent border-b border-dashed border-ink-200 outline-none w-full focus:bg-ink-50 focus:border-accent focus:border-solid focus:rounded-lg focus:px-1.5 focus:py-0.5 transition-all"
            placeholder="Từ vựng" />
          <svg className="h-5 w-5 shrink-0 text-ink-400 group-hover:text-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
          </svg>
        </div>
        <span className="shrink-0 text-xs font-medium text-accent mt-1">✓ Đã lưu</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-600">
        <span><span className="font-semibold">{vocab.encounterCount}</span> lần gặp</span>
        <span>Lần đầu: {formatDate(vocab.firstSeenAt)}</span>
        {reviewInfo}
      </div>

      {dictLoading ? (
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <svg className="h-3.5 w-3.5 animate-spin text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity=".25"/>
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
          </svg>
          Đang tra từ điển…
        </div>
      ) : dictEntry ? (
        <DictionaryCard entry={dictEntry} word={vocab.word} defaultCollapsed />
      ) : null}

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-600">Nghĩa</label>
        <textarea className="field min-h-[50px] resize-y" placeholder="Nhập nghĩa…" value={meaning}
          onChange={(e) => setMeaning(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-600">Ví dụ</label>
        <textarea className="field min-h-[60px] resize-y" placeholder="Câu ví dụ…" value={example}
          onChange={(e) => setExample(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary flex-1" onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
        <button type="button" className="btn-danger" onClick={() => void handleDelete()}>Xóa</button>
      </div>
      {status && <p className="text-xs text-accent-dark">{status}</p>}
      {encounters.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-600">Lịch sử gặp</h3>
          <EncounterList encounters={encounters} />
        </div>
      )}
    </section>
  );
}

// ─── Study Mode (Spaced Repetition) ──────────────────────────────────────────

function StudyMode() {
  const [dueWords, setDueWords] = useState<Vocabulary[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionStats, setSessionStats] = useState({ total: 0, again: 0 });
  const [dictEntry, setDictEntry] = useState<DictionaryEntry | null>(null);
  const [studySrsConfig, setStudySrsConfig] = useState<SRSConfig | null>(null);

  const loadDue = async () => {
    setLoading(true);
    const due = await storage.getDueWords(20);
    setDueWords(due);
    setCurrentIdx(0);
    setRevealed(false);
    setSessionStats({ total: 0, again: 0 });
    setLoading(false);
  };

  useEffect(() => {
    void loadDue();
    void getSRSConfig().then(setStudySrsConfig);
  }, []);

  const current = dueWords[currentIdx];

  // Load dict for current card
  useEffect(() => {
    setDictEntry(null);
    if (!current) return;
    if (current.dictionary) { setDictEntry(current.dictionary); return; }
    let cancelled = false;
    fetchDictionary(current.word).then((e) => { if (!cancelled) setDictEntry(e); })
      .catch(() => {/* ignore */});
    return () => { cancelled = true; };
  }, [current?.id]);

  const handleGrade = async (grade: ReviewGrade) => {
    if (!current) return;
    await storage.submitReview(current.id, grade);
    setSessionStats((s) => ({ total: s.total + 1, again: s.again + (grade === 0 ? 1 : 0) }));
    setCurrentIdx((i) => i + 1);
    setRevealed(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <svg className="h-6 w-6 animate-spin text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeOpacity=".25"/>
          <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
        </svg>
      </div>
    );
  }

  if (dueWords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-4xl mb-3">🎉</div>
        <h3 className="font-display text-lg font-semibold text-ink-900">Hoàn thành rồi!</h3>
        <p className="mt-1 text-sm text-ink-600">Không có từ nào cần ôn hôm nay.</p>
        <p className="mt-1 text-xs text-ink-400">Thêm từ mới hoặc quay lại sau.</p>
      </div>
    );
  }

  if (!current || currentIdx >= dueWords.length) {
    const accuracy = sessionStats.total > 0
      ? Math.round(((sessionStats.total - sessionStats.again) / sessionStats.total) * 100)
      : 0;
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <div className="text-4xl mb-3">✅</div>
        <h3 className="font-display text-xl font-semibold text-ink-900">Phiên ôn tập xong!</h3>
        <div className="mt-4 grid grid-cols-2 gap-3 w-full max-w-xs">
          <div className="rounded-lg bg-accent-soft px-4 py-3">
            <div className="text-2xl font-bold text-accent-dark">{sessionStats.total}</div>
            <div className="text-xs text-ink-600">Từ đã ôn</div>
          </div>
          <div className="rounded-lg bg-accent-soft px-4 py-3">
            <div className="text-2xl font-bold text-accent-dark">{accuracy}%</div>
            <div className="text-xs text-ink-600">Chính xác</div>
          </div>
        </div>
        <button type="button" className="btn-primary mt-6 w-full max-w-xs" onClick={() => void loadDue()}>
          Ôn tiếp
        </button>
      </div>
    );
  }

  const progress = Math.round((currentIdx / dueWords.length) * 100);
  const isNew = !current.review;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div>
        <div className="flex justify-between text-xs text-ink-500 mb-1">
          <span>{currentIdx}/{dueWords.length} từ</span>
          <span>{sessionStats.total - sessionStats.again}/{sessionStats.total} đúng</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-ink-100 overflow-hidden">
          <div className="h-full bg-accent transition-all duration-300 rounded-full"
            style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Card */}
      <div className="rounded-xl border border-ink-200 bg-white shadow-sm overflow-hidden">
        {/* Front */}
        <div className="px-5 py-6 text-center">
          {isNew && (
            <span className="inline-block mb-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700 uppercase tracking-wide">
              Từ mới
            </span>
          )}
          <h2 className="font-display text-3xl font-bold text-ink-900">{current.word}</h2>
          {current.dictionary?.phonetic && (
            <div className="mt-1 flex items-center justify-center gap-2">
              <span className="text-sm text-ink-500 font-mono">{current.dictionary.phonetic}</span>
              <AudioButton url={current.dictionary.audioUrl} word={current.word} />
            </div>
          )}
          {current.encounterCount > 1 && (
            <p className="mt-2 text-xs text-ink-400">Gặp {current.encounterCount} lần</p>
          )}
          {current.review && (
            <p className="mt-1 text-xs text-ink-400">
              Interval: {current.review.interval}d · EF: {current.review.easeFactor.toFixed(2)}
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-dashed border-ink-200" />

        {/* Back (revealed) */}
        {!revealed ? (
          <div className="px-5 py-5 text-center">
            <button type="button"
              className="btn-primary w-full max-w-xs"
              onClick={() => setRevealed(true)}>
              Hiện đáp án
            </button>
          </div>
        ) : (
          <div className="px-4 py-4 space-y-3">
            {/* Meaning */}
            {current.meaning ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1">Nghĩa</p>
                <p className="text-ink-900 font-medium leading-snug">{current.meaning}</p>
              </div>
            ) : (
              <p className="text-sm italic text-ink-400">Chưa có nghĩa – hãy vào tab Danh sách để thêm.</p>
            )}

            {/* Example */}
            {current.example && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1">Ví dụ</p>
                <p className="text-sm italic text-ink-700">"{current.example}"</p>
              </div>
            )}

            {/* Note */}
            {current.note && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1">Ghi chú</p>
                <p className="text-sm text-ink-700">{current.note}</p>
              </div>
            )}

            {/* Dictionary card */}
            {dictEntry && (
              <DictionaryCard entry={dictEntry} word={current.word} defaultCollapsed />
            )}

            {/* Grade buttons */}
            <div className="grid grid-cols-4 gap-1.5 pt-2">
              {([0, 1, 2, 3] as ReviewGrade[]).map((grade) => {
                const g = GRADE_LABELS[grade];
                const interval = previewInterval(current.review as ReviewInfo | undefined, grade, studySrsConfig ?? undefined);
                return (
                  <button key={grade} type="button"
                    onClick={() => void handleGrade(grade)}
                    className={`flex flex-col items-center rounded-lg py-2 text-white transition-transform active:scale-95 ${g.color}`}>
                    <span className="text-xs font-semibold">{g.label}</span>
                    <span className="text-[10px] opacity-80 mt-0.5">{interval}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const xlsxRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Google Sheets state
  const [sheetsConfig, setSheetsConfigState] = useState<sheets.SheetsConfig | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [sheetsLoading, setSheetsLoading] = useState(true);
  const [sheetsAction, setSheetsAction] = useState<string | null>(null);
  const [connectId, setConnectId] = useState('');

  // SRS config state
  const [srsConfig, setSrsConfigState] = useState<SRSConfig | null>(null);

  // Load configs on mount
  useEffect(() => {
    void (async () => {
      const [sheetsCfg, srsCfg] = await Promise.all([
        sheets.getSheetsConfig(),
        getSRSConfig(),
      ]);
      setSheetsConfigState(sheetsCfg);
      setSrsConfigState(srsCfg);
      if (sheets.isConfigured()) {
        const signed = await sheets.isSignedIn();
        setSignedIn(signed);
      }
      setSheetsLoading(false);
    })();
  }, []);

  const notify = (text: string, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 5000);
  };

  // ─── File export/import handlers ──────────────────────────────────────────

  const onExportExcel = async () => {
    try {
      const blob = await storage.exportExcel();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `vocab-${today()}.xlsx`; a.click();
      URL.revokeObjectURL(url);
      notify('Đã xuất file Excel.');
    } catch (e) { notify(String(e), false); }
  };

  const onExportCSV = async () => {
    try {
      const csv = await storage.exportCSV();
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `vocab-${today()}.csv`; a.click();
      URL.revokeObjectURL(url);
      notify('Đã xuất file CSV.');
    } catch (e) { notify(String(e), false); }
  };

  const onImportExcel = async (file: File) => {
    try {
      const { imported, updated } = await storage.importExcel(file);
      notify(`Import xong: ${imported} từ mới, ${updated} từ cập nhật.`);
    } catch (e) { notify(String(e), false); }
  };

  const onImportCSV = async (file: File) => {
    try {
      const text = await file.text();
      const { imported, updated } = await storage.importCSV(text);
      notify(`Import xong: ${imported} từ mới, ${updated} từ cập nhật.`);
    } catch (e) { notify(String(e), false); }
  };

  const onImportJSON = async (file: File) => {
    try {
      const text = await file.text();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await storage.importData(JSON.parse(text) as Parameters<typeof storage.importData>[0]);
      notify('Import JSON thành công.');
    } catch (e) { notify(String(e), false); }
  };

  const onClear = async () => {
    if (!confirm('Xóa toàn bộ từ vựng? Không thể hoàn tác.')) return;
    await storage.clearAll();
    notify('Đã xóa toàn bộ dữ liệu.');
  };

  // ─── Google Sheets handlers ───────────────────────────────────────────────

  const onSignIn = async () => {
    setSheetsAction('Đang đăng nhập…');
    try {
      await sheets.signIn();
      setSignedIn(true);
      const config = await sheets.getSheetsConfig();
      setSheetsConfigState(config);
      notify('Đã đăng nhập Google.');
    } catch (e) { notify(String(e), false); }
    finally { setSheetsAction(null); }
  };

  const onSignOut = async () => {
    setSheetsAction('Đang đăng xuất…');
    try {
      await sheets.signOut();
      setSignedIn(false);
      setSheetsConfigState(null);
      notify('Đã đăng xuất.');
    } catch (e) { notify(String(e), false); }
    finally { setSheetsAction(null); }
  };

  const onCreateSheet = async () => {
    setSheetsAction('Đang tạo spreadsheet…');
    try {
      const { title } = await sheets.createSpreadsheet();
      const config = await sheets.getSheetsConfig();
      setSheetsConfigState(config);
      notify(`Đã tạo: ${title}`);
    } catch (e) { notify(String(e), false); }
    finally { setSheetsAction(null); }
  };

  const onConnectSheet = async () => {
    const id = connectId.trim();
    if (!id) { notify('Vui lòng nhập Spreadsheet ID.', false); return; }
    setSheetsAction('Đang kết nối…');
    try {
      const title = await sheets.connectSpreadsheet(id);
      const config = await sheets.getSheetsConfig();
      setSheetsConfigState(config);
      setConnectId('');
      notify(`Đã kết nối: ${title}`);
    } catch (e) { notify(String(e), false); }
    finally { setSheetsAction(null); }
  };

  const onPush = async () => {
    if (!sheetsConfig?.spreadsheetId) return;
    setSheetsAction('Đang đẩy dữ liệu…');
    try {
      const vocabs = await storage.listVocabularies();
      const count = await sheets.pushToSheets(sheetsConfig.spreadsheetId, vocabs);
      const config = await sheets.getSheetsConfig();
      setSheetsConfigState(config);
      notify(`Đã đẩy ${count} từ lên Google Sheets.`);
    } catch (e) { notify(String(e), false); }
    finally { setSheetsAction(null); }
  };

  const onPull = async () => {
    if (!sheetsConfig?.spreadsheetId) return;
    setSheetsAction('Đang kéo dữ liệu…');
    try {
      const rows = await sheets.pullFromSheets(sheetsConfig.spreadsheetId);
      // Import trực tiếp, không trigger auto-sync để không ghi đè sheet gốc
      const { imported, updated } = await storage.importRowsFromPull(
        rows.map((r) => ({
          Word: r.Word ?? '',
          Meaning: r.Meaning ?? '',
          Example: r.Example ?? '',
          Note: r.Note ?? '',
          'Encounter Count': r['Encounter Count'] != null ? Number(r['Encounter Count']) || undefined : undefined,
          'First Seen': r['First Seen'] ?? undefined,
          'Last Seen': r['Last Seen'] ?? undefined,
        })),
      );
      const config = await sheets.getSheetsConfig();
      setSheetsConfigState(config);
      notify(`Đã kéo: ${imported} từ mới, ${updated} từ cập nhật.`);
    } catch (e) { notify(String(e), false); }
    finally { setSheetsAction(null); }
  };

  const onDisconnect = async () => {
    if (!confirm('Ngắt kết nối sheet? (Dữ liệu trên sheet vẫn giữ nguyên)')) return;
    await sheets.setSheetsConfig({ spreadsheetId: null, spreadsheetTitle: '', lastSyncAt: null });
    const config = await sheets.getSheetsConfig();
    setSheetsConfigState(config);
    notify('Đã ngắt kết nối.');
  };

  // ─── Collapsible section state ────────────────────────────────────────────
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const toggleSection = (s: string) => setExpandedSection(expandedSection === s ? null : s);

  // ─── Render ───────────────────────────────────────────────────────────────

  const Spinner = () => (
    <svg className="h-3.5 w-3.5 animate-spin text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity=".25"/>
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
    </svg>
  );

  return (
    <div className="space-y-3">
      {/* Feedback toast — fixed at top */}
      {msg && (
        <div className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium shadow-sm transition-all ${
          msg.ok
            ? 'bg-gradient-to-r from-accent/10 to-accent/5 text-accent-dark border border-accent/20'
            : 'bg-gradient-to-r from-red-50 to-red-50/50 text-red-700 border border-red-200'
        }`}>
          <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${msg.ok ? 'bg-accent' : 'bg-red-500'}`}>
            {msg.ok ? '✓' : '!'}
          </span>
          {msg.text}
        </div>
      )}

      {/* ═══════════════════ SECTION 1: Google Sheets ═══════════════════ */}
      <section className="rounded-2xl border border-ink-150 bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2.5 border-b border-ink-100 bg-gradient-to-r from-blue-50/60 to-white px-4 py-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-base">☁️</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-semibold text-ink-900">Google Sheets</h3>
            <p className="text-[10px] text-ink-500">Đồng bộ từ vựng lên cloud</p>
          </div>
          {sheetsConfig?.spreadsheetId && (
            <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent-dark">Đã kết nối</span>
          )}
        </div>

        <div className="px-4 py-3">
          {sheetsLoading ? (
            <div className="flex items-center gap-2 text-xs text-ink-500 py-2"><Spinner /> Đang kiểm tra…</div>
          ) : !sheets.isConfigured() ? (
            <div className="rounded-xl bg-amber-50/80 border border-amber-200/60 p-3 space-y-1.5">
              <p className="text-xs font-medium text-amber-800">⚠️ Chưa cấu hình OAuth</p>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                Thêm client_id vào <code className="rounded bg-amber-100/80 px-1 py-0.5 font-mono text-[10px]">src/config/google.ts</code>
              </p>
              <p className="text-[10px] text-amber-600">Xem tab ❓ Hướng dẫn để biết chi tiết.</p>
            </div>
          ) : !signedIn ? (
            <div className="space-y-3">
              <p className="text-xs text-ink-600 leading-relaxed">Đăng nhập để backup từ vựng an toàn trên Google Sheets.</p>
              <button type="button" className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-white border border-ink-200 px-4 py-2.5 text-sm font-medium text-ink-800 shadow-sm hover:bg-ink-50 hover:shadow transition-all active:scale-[0.98]"
                onClick={() => void onSignIn()} disabled={!!sheetsAction}>
                <svg className="h-4.5 w-4.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l3.56-2.77.01-.53z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {sheetsAction || 'Đăng nhập với Google'}
              </button>
            </div>
          ) : !sheetsConfig?.spreadsheetId ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] text-white font-bold">✓</span>
                <span className="font-medium text-ink-800">{sheetsConfig?.userEmail || 'Đã đăng nhập'}</span>
              </div>

              <button type="button" className="btn-primary w-full rounded-xl py-2.5" onClick={() => void onCreateSheet()} disabled={!!sheetsAction}>
                {sheetsAction || '＋ Tạo Spreadsheet mới'}
              </button>

              <div className="flex items-center gap-2 text-[10px] text-ink-300">
                <div className="h-px flex-1 bg-ink-100" /> hoặc kết nối sheet có sẵn <div className="h-px flex-1 bg-ink-100" />
              </div>

              <div className="flex gap-1.5">
                <input type="text" className="field flex-1 text-xs rounded-lg" placeholder="Nhập Spreadsheet ID…"
                  value={connectId} onChange={(e) => setConnectId(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void onConnectSheet(); }} />
                <button type="button" className="btn-primary shrink-0 rounded-lg px-3 text-xs"
                  onClick={() => void onConnectSheet()} disabled={!!sheetsAction || !connectId.trim()}>
                  Nối
                </button>
              </div>
              <p className="text-[10px] text-ink-400 leading-relaxed">
                ID nằm trong URL: docs.google.com/spreadsheets/d/<strong>ID</strong>/edit
              </p>

              <button type="button" className="text-[11px] text-ink-400 hover:text-red-500 transition-colors"
                onClick={() => void onSignOut()}>
                Đăng xuất
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Sheet info card */}
              <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-accent/5 to-transparent border border-accent/10 px-3 py-2.5">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-lg">📊</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-ink-900 truncate">{sheetsConfig.spreadsheetTitle || 'Spreadsheet'}</p>
                  <a href={sheets.getSheetUrl(sheetsConfig.spreadsheetId)}
                    target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-accent hover:underline">
                    Mở trên Google Sheets ↗
                  </a>
                </div>
              </div>

              {sheetsConfig.lastSyncAt && (
                <p className="text-[10px] text-ink-400 flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                  Sync gần nhất: {formatDateTime(sheetsConfig.lastSyncAt)}
                </p>
              )}

              {/* Push / Pull */}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="flex items-center justify-center gap-1.5 rounded-xl bg-accent py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-accent-dark transition-all active:scale-[0.97]"
                  onClick={() => void onPush()} disabled={!!sheetsAction}>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4"/></svg>
                  Push
                </button>
                <button type="button" className="flex items-center justify-center gap-1.5 rounded-xl border border-ink-200 bg-white py-2.5 text-xs font-semibold text-ink-700 shadow-sm hover:bg-ink-50 transition-all active:scale-[0.97]"
                  onClick={() => void onPull()} disabled={!!sheetsAction}>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V6a2 2 0 012-2h12a2 2 0 012 2v2M12 20V8m0 12l-4-4m4 4l4-4"/></svg>
                  Pull
                </button>
              </div>

              {sheetsAction && (
                <div className="flex items-center gap-2 text-xs text-ink-500"><Spinner />{sheetsAction}</div>
              )}

              <div className="flex gap-4 pt-1 border-t border-ink-100">
                <button type="button" className="text-[11px] text-ink-400 hover:text-ink-600 transition-colors"
                  onClick={() => void onDisconnect()}>Ngắt kết nối</button>
                <button type="button" className="text-[11px] text-ink-400 hover:text-red-500 transition-colors"
                  onClick={() => void onSignOut()}>Đăng xuất</button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════ SECTION 2: Data Management ═══════════════════ */}
      <section className="rounded-2xl border border-ink-150 bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2.5 border-b border-ink-100 bg-gradient-to-r from-emerald-50/60 to-white px-4 py-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-base">📦</span>
          <div>
            <h3 className="text-[13px] font-semibold text-ink-900">Dữ liệu</h3>
            <p className="text-[10px] text-ink-500">Xuất, nhập & backup từ vựng</p>
          </div>
        </div>

        <div className="divide-y divide-ink-100">
          {/* Excel row */}
          <div className="px-4 py-2.5">
            <button type="button" onClick={() => toggleSection('excel')}
              className="flex w-full items-center justify-between text-left">
              <div className="flex items-center gap-2">
                <span className="text-sm">📊</span>
                <span className="text-xs font-medium text-ink-800">Excel (.xlsx)</span>
              </div>
              <svg className={`h-4 w-4 text-ink-400 transition-transform ${expandedSection === 'excel' ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
            </button>
            {expandedSection === 'excel' && (
              <div className="mt-2.5 flex gap-2">
                <button type="button" className="flex-1 rounded-lg bg-accent/10 py-2 text-xs font-medium text-accent-dark hover:bg-accent/20 transition-colors active:scale-[0.97]"
                  onClick={() => void onExportExcel()}>↑ Xuất</button>
                <button type="button" className="flex-1 rounded-lg border border-ink-200 py-2 text-xs font-medium text-ink-700 hover:bg-ink-50 transition-colors active:scale-[0.97]"
                  onClick={() => xlsxRef.current?.click()}>↓ Nhập</button>
                <input ref={xlsxRef} type="file" className="hidden"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportExcel(f); e.target.value = ''; }} />
              </div>
            )}
          </div>

          {/* CSV row */}
          <div className="px-4 py-2.5">
            <button type="button" onClick={() => toggleSection('csv')}
              className="flex w-full items-center justify-between text-left">
              <div className="flex items-center gap-2">
                <span className="text-sm">📄</span>
                <span className="text-xs font-medium text-ink-800">CSV</span>
              </div>
              <svg className={`h-4 w-4 text-ink-400 transition-transform ${expandedSection === 'csv' ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
            </button>
            {expandedSection === 'csv' && (
              <div className="mt-2.5 space-y-2">
                <div className="flex gap-2">
                  <button type="button" className="flex-1 rounded-lg bg-accent/10 py-2 text-xs font-medium text-accent-dark hover:bg-accent/20 transition-colors active:scale-[0.97]"
                    onClick={() => void onExportCSV()}>↑ Xuất</button>
                  <button type="button" className="flex-1 rounded-lg border border-ink-200 py-2 text-xs font-medium text-ink-700 hover:bg-ink-50 transition-colors active:scale-[0.97]"
                    onClick={() => csvRef.current?.click()}>↓ Nhập</button>
                  <input ref={csvRef} type="file" className="hidden" accept=".csv,text/csv"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportCSV(f); e.target.value = ''; }} />
                </div>
                <p className="text-[10px] text-ink-400">Cột: Word, Meaning, Example, Note, Encounter Count, …</p>
              </div>
            )}
          </div>

          {/* JSON row */}
          <div className="px-4 py-2.5">
            <button type="button" onClick={() => toggleSection('json')}
              className="flex w-full items-center justify-between text-left">
              <div className="flex items-center gap-2">
                <span className="text-sm">💾</span>
                <span className="text-xs font-medium text-ink-800">Backup JSON</span>
                <span className="rounded bg-ink-100 px-1 py-0.5 text-[9px] text-ink-500">Đầy đủ</span>
              </div>
              <svg className={`h-4 w-4 text-ink-400 transition-transform ${expandedSection === 'json' ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
            </button>
            {expandedSection === 'json' && (
              <div className="mt-2.5 flex gap-2">
                <button type="button" className="flex-1 rounded-lg bg-accent/10 py-2 text-xs font-medium text-accent-dark hover:bg-accent/20 transition-colors active:scale-[0.97]"
                  onClick={() => void (async () => {
                    const data = await storage.exportData();
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = `vocab-backup-${today()}.json`; a.click();
                    URL.revokeObjectURL(url);
                    notify('Đã xuất backup JSON.');
                  })()}>↑ Xuất</button>
                <button type="button" className="flex-1 rounded-lg border border-ink-200 py-2 text-xs font-medium text-ink-700 hover:bg-ink-50 transition-colors active:scale-[0.97]"
                  onClick={() => jsonRef.current?.click()}>↓ Nhập</button>
                <input ref={jsonRef} type="file" className="hidden" accept=".json,application/json"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportJSON(f); e.target.value = ''; }} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════════════ SECTION 3: SRS Config ═══════════════════ */}
      {srsConfig && (
        <section className="rounded-2xl border border-ink-150 bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2.5 border-b border-ink-100 bg-gradient-to-r from-violet-50/60 to-white px-4 py-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-base">🧠</span>
            <div>
              <h3 className="text-[13px] font-semibold text-ink-900">Ôn tập</h3>
              <p className="text-[10px] text-ink-500">Cài đặt Spaced Repetition</p>
            </div>
          </div>

          <div className="px-4 py-3 space-y-3">
            <p className="text-[11px] text-ink-500">Khoảng cách (ngày) cho lần ôn đầu tiên:</p>
            <div className="grid grid-cols-4 gap-2">
              {([0, 1, 2, 3] as ReviewGrade[]).map((grade) => {
                const g = GRADE_LABELS[grade];
                const styles = [
                  'from-red-50 to-red-50/50 border-red-200/60',
                  'from-orange-50 to-orange-50/50 border-orange-200/60',
                  'from-emerald-50 to-emerald-50/50 border-emerald-200/60',
                  'from-sky-50 to-sky-50/50 border-sky-200/60',
                ][grade]!;
                return (
                  <div key={grade} className={`rounded-xl border bg-gradient-to-b ${styles} p-2 text-center`}>
                    <p className="text-[10px] font-bold text-ink-700 mb-1.5">{g.label}</p>
                    <input type="number" min={0} max={365}
                      className="w-full rounded-lg border border-ink-200 bg-white px-1 py-1.5 text-center text-xs font-semibold text-ink-900 focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all"
                      value={srsConfig.firstReviewIntervals[grade]}
                      onChange={(e) => {
                        const val = Math.max(0, parseInt(e.target.value) || 0);
                        const updated: SRSConfig = {
                          ...srsConfig,
                          firstReviewIntervals: { ...srsConfig.firstReviewIntervals, [grade]: val },
                        };
                        setSrsConfigState(updated);
                        void setSRSConfig(updated);
                      }} />
                    <p className="text-[9px] text-ink-400 mt-1">ngày</p>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2">
              <label className="text-[11px] text-ink-600 shrink-0">Lần ôn thứ 2:</label>
              <input type="number" min={1} max={365}
                className="w-14 rounded-lg border border-ink-200 bg-white px-1 py-1 text-center text-xs font-semibold focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all"
                value={srsConfig.secondReviewInterval}
                onChange={(e) => {
                  const val = Math.max(1, parseInt(e.target.value) || 6);
                  const updated: SRSConfig = { ...srsConfig, secondReviewInterval: val };
                  setSrsConfigState(updated);
                  void setSRSConfig(updated);
                }} />
              <span className="text-[11px] text-ink-400">ngày · Sau đó tự tính SM-2</span>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════ SECTION 4: Danger Zone ═══════════════════ */}
      <section className="rounded-2xl border border-red-200/60 bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="px-4 py-3">
          <button type="button"
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition-all active:scale-[0.97]"
            onClick={() => void onClear()}>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            Xóa toàn bộ dữ liệu
          </button>
        </div>
      </section>
    </div>
  );
}

function today() { return new Date().toISOString().slice(0, 10); }

// ─── Guide Tab ────────────────────────────────────────────────────────────────

function GuideTab() {
  return (
    <div className="space-y-5 text-sm text-ink-800">
      {/* Hero */}
      <div className="rounded-xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 p-4 text-center">
        <h2 className="font-display text-lg font-semibold text-ink-900">Hướng dẫn sử dụng</h2>
      </div>

      {/* Cách thêm từ */}
      <div>
        <h3 className="font-semibold text-ink-900 mb-2 flex items-center gap-1.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">1</span>
          Thêm từ mới
        </h3>
        <div className="space-y-2 pl-7">
          <div className="rounded-lg bg-white border border-ink-100 p-3">
            <p className="font-medium text-ink-900 mb-1">Cách 1: Bôi đen + Click icon</p>
            <ol className="list-decimal pl-4 space-y-1 text-xs text-ink-700">
              <li>Bôi đen từ trên bất kỳ trang web nào</li>
              <li>Click vào icon xuất hiện gần từ</li>
              <li>Side panel mở ra với form nhập nghĩa</li>
              <li>Nghĩa được <strong>tự động điền</strong> từ từ điển, bạn có thể sửa</li>
              <li>Click <strong>"✓ Lưu từ"</strong></li>
            </ol>
          </div>
          <div className="rounded-lg bg-white border border-ink-100 p-3">
            <p className="font-medium text-ink-900 mb-1">Cách 2: Chuột phải</p>
            <ol className="list-decimal pl-4 space-y-1 text-xs text-ink-700">
              <li>Bôi đen từ trên trang web</li>
              <li>Chuột phải → chọn <strong>"Thêm vào từ vựng"</strong></li>
              <li>Side panel mở ra, thao tác giống cách 1</li>
            </ol>
          </div>
          <div className="rounded-lg bg-white border border-ink-100 p-3">
            <p className="font-medium text-ink-900 mb-1">Cách 3: Phím tắt</p>
            <p className="text-xs text-ink-700">
              Bôi đen từ → nhấn <kbd className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[11px]">Alt</kbd> + <kbd className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[11px]">S</kbd>
            </p>
          </div>
        </div>
      </div>

      {/* Từ điển tự động */}
      <div>
        <h3 className="font-semibold text-ink-900 mb-2 flex items-center gap-1.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">2</span>
          Từ điển tự động
        </h3>
        <div className="pl-7 space-y-1 text-xs text-ink-700">
          <p>Khi thêm từ tiếng Anh, extension tự động tra <strong>Free Dictionary API</strong> và hiển thị:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li><strong>Phiên âm</strong> (phonetic) + nút 🔊 nghe phát âm</li>
            <li><strong>Nghĩa</strong> theo từng loại từ (noun, verb, adjective…)</li>
            <li><strong>Ví dụ</strong> cho mỗi nghĩa</li>
            <li><strong>Từ đồng nghĩa / trái nghĩa</strong></li>
          </ul>
          <p className="text-ink-500 italic mt-1">Nghĩa đầu tiên từ từ điển sẽ được tự động điền vào ô "Nghĩa" – bạn có thể sửa lại theo ý mình.</p>
        </div>
      </div>

      {/* Ôn tập */}
      <div>
        <h3 className="font-semibold text-ink-900 mb-2 flex items-center gap-1.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">3</span>
          Ôn tập (Spaced Repetition)
        </h3>
        <div className="pl-7 space-y-2 text-xs text-ink-700">
          <p>Extension sử dụng thuật toán <strong>SM-2</strong> (giống Anki) để lên lịch ôn từ thông minh:</p>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded-lg bg-red-50 p-2 text-center">
              <div className="font-semibold text-red-600">Quên</div>
              <div className="text-[10px] text-red-500">Ôn lại sau 1 ngày</div>
            </div>
            <div className="rounded-lg bg-orange-50 p-2 text-center">
              <div className="font-semibold text-orange-600">Khó</div>
              <div className="text-[10px] text-orange-500">Interval giảm</div>
            </div>
            <div className="rounded-lg bg-green-50 p-2 text-center">
              <div className="font-semibold text-green-600">Tốt</div>
              <div className="text-[10px] text-green-500">Interval bình thường</div>
            </div>
            <div className="rounded-lg bg-sky-50 p-2 text-center">
              <div className="font-semibold text-sky-600">Dễ</div>
              <div className="text-[10px] text-sky-500">Interval tăng mạnh</div>
            </div>
          </div>
          <p>Từ mới sẽ được ôn sau <strong>1 ngày</strong>, rồi <strong>6 ngày</strong>, rồi ngày càng dài ra nếu bạn nhớ tốt.</p>
          <p className="text-ink-500">Badge đỏ trên tab "🎯 Ôn tập" hiển thị số từ cần ôn hôm nay.</p>
        </div>
      </div>

      {/* Xuất nhập */}
      <div>
        <h3 className="font-semibold text-ink-900 mb-2 flex items-center gap-1.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">4</span>
          Xuất / Nhập dữ liệu
        </h3>
        <div className="pl-7 space-y-1 text-xs text-ink-700">
          <p>Vào tab <strong>⚙️ Cài đặt</strong> để:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li><strong>Excel (.xlsx)</strong> — Xuất/nhập danh sách từ, mở được bằng Excel/Google Sheets</li>
            <li><strong>CSV</strong> — Xuất/nhập file CSV, tương thích mọi ứng dụng</li>
            <li><strong>JSON</strong> — Backup đầy đủ bao gồm lịch sử gặp và dữ liệu ôn tập</li>
          </ul>
          <p className="text-ink-500 mt-1">Khi nhập file, từ trùng sẽ được cập nhật (merge), từ mới sẽ được thêm vào.</p>
        </div>
      </div>

      {/* Chỉnh sửa từ */}
      <div>
        <h3 className="font-semibold text-ink-900 mb-2 flex items-center gap-1.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">5</span>
          Chỉnh sửa & Quản lý
        </h3>
        <div className="pl-7 space-y-1 text-xs text-ink-700">
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Click vào từ trong danh sách để xem chi tiết và chỉnh sửa</li>
            <li>Có thể sửa <strong>nghĩa</strong>, <strong>ví dụ</strong>, và <strong>ghi chú</strong> bất cứ lúc nào</li>
            <li>Xem <strong>lịch sử gặp</strong> – biết từ đã gặp ở những trang nào</li>
            <li>Dùng ô <strong>Tìm kiếm</strong> để lọc từ nhanh</li>
          </ul>
        </div>
      </div>

      {/* FAQ */}
      <div>
        <h3 className="font-semibold text-ink-900 mb-2">❓ Câu hỏi thường gặp</h3>
        <div className="space-y-2">
          <div className="rounded-lg bg-white border border-ink-100 p-3">
            <p className="font-medium text-ink-900 text-xs">Click icon không hoạt động?</p>
            <p className="text-[11px] text-ink-600 mt-0.5">Nhấn <strong>F5</strong> để tải lại trang. Điều này xảy ra khi extension vừa được cập nhật.</p>
          </div>
          <div className="rounded-lg bg-white border border-ink-100 p-3">
            <p className="font-medium text-ink-900 text-xs">Không thấy icon khi bôi đen?</p>
            <p className="text-[11px] text-ink-600 mt-0.5">Một số trang (Chrome Web Store, chrome:// pages) không hỗ trợ extension. Thử trên trang web thường.</p>
          </div>
          <div className="rounded-lg bg-white border border-ink-100 p-3">
            <p className="font-medium text-ink-900 text-xs">Từ/nghĩa/phát âm bị thiếu?</p>
            <p className="text-[11px] text-ink-600 mt-0.5">Nguyên nhân do vẫn tồn tại số từ, nghĩa và phát âm bị thiếu trong dữ liệu từ điển.</p>
          </div>
        </div>
      </div>

      {/* Phím tắt tổng hợp */}
      <div className="rounded-lg bg-ink-50 border border-ink-100 p-3">
        <h3 className="font-semibold text-ink-900 mb-2 text-xs">⌨️ Phím tắt</h3>
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-ink-700">Thêm từ đang bôi đen</span>
            <span><kbd className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] border border-ink-200">Alt</kbd> + <kbd className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] border border-ink-200">S</kbd></span>
          </div>
        </div>
      </div>

      <p className="text-center text-[11px] text-ink-400 pb-2">
        Personal Vocabulary Tracker v1.0
      </p>
    </div>
  );
}

// ─── Tab Nav ──────────────────────────────────────────────────────────────────

function TabNav({ tab, setTab, dueCount }: { tab: Tab; setTab: (t: Tab) => void; dueCount: number }) {
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'list', label: 'Từ vựng', icon: '📚' },
    { id: 'study', label: 'Ôn tập', icon: '🎯' },
    { id: 'settings', label: 'Cài đặt', icon: '⚙️' },
    { id: 'guide', label: 'Hướng dẫn', icon: '❓' },
  ];
  return (
    <div className="flex gap-1 mb-4 rounded-lg bg-ink-100 p-1">
      {tabs.map((t) => (
        <button key={t.id} type="button"
          onClick={() => setTab(t.id)}
          className={`flex-1 flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition-colors relative
            ${tab === t.id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-600 hover:text-ink-800'}`}>
          <span>{t.icon}</span>
          <span className="hidden min-[320px]:inline">{t.label}</span>
          {t.id === 'study' && dueCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[9px] font-bold text-white">
              {dueCount > 9 ? '9+' : dueCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<Tab>('list');
  const [query, setQuery] = useState('');
  const { items, stats, loading } = useVocabularies(query);
  const [pendingWord, setPendingWord] = useState<SelectionPayload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Vocabulary | null>(null);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const loadSelected = useCallback(async (id: string | null) => {
    if (!id) { setSelected(null); setEncounters([]); return; }
    const vocab = await storage.getVocabulary(id);
    if (!vocab) { setSelected(null); setEncounters([]); return; }
    setSelected(vocab);
    setEncounters(await storage.getEncountersFor(id));
  }, []);

  useEffect(() => {
    void (async () => {
      const session = await chrome.storage.session.get(['pendingNewWord', 'selectedVocabularyId']);
      const pending = session.pendingNewWord as SelectionPayload | null | undefined;
      if (pending) { setPendingWord(pending); setTab('list'); }
      else {
        const id = session.selectedVocabularyId as string | undefined;
        if (id) { setSelectedId(id); await loadSelected(id); }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onSession = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'session') return;
      if ('pendingNewWord' in changes) {
        const pending = changes.pendingNewWord?.newValue as SelectionPayload | null;
        if (pending) { setPendingWord(pending); setSelected(null); setSelectedId(null); setTab('list'); }
        else { setPendingWord(null); }
      }
      if ('selectedVocabularyId' in changes && !changes.pendingNewWord?.newValue) {
        const id = changes.selectedVocabularyId?.newValue as string | undefined;
        setSelectedId(id ?? null); void loadSelected(id ?? null);
      }
    };
    chrome.storage.onChanged.addListener(onSession);
    return () => chrome.storage.onChanged.removeListener(onSession);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (selectedId) void loadSelected(selectedId); }, [items, selectedId, loadSelected]);

  const selectWord = async (vocab: Vocabulary) => {
    setPendingWord(null);
    setSelectedId(vocab.id);
    await chrome.storage.session.set({ selectedVocabularyId: vocab.id, pendingNewWord: null });
    await loadSelected(vocab.id);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_0%_0%,#e6f2eb,transparent_45%),linear-gradient(180deg,#f6f7f4,#e8ebe3)] p-3">
      {/* Header */}
      <header className="mb-3">
        <h1 className="font-display text-xl font-semibold text-ink-900">Vocabulary</h1>
      </header>

      {/* Tab Nav */}
      <TabNav tab={tab} setTab={setTab} dueCount={stats.dueForReview} />

      {/* Tab: Danh sách */}
      {tab === 'list' && (
        <div>
          {pendingWord && (
            <AddWordForm
              pending={pendingWord}
              onSaved={() => {
                setPendingWord(null);
                setSaveToast('Đã lưu từ thành công! ✓');
                setTimeout(() => setSaveToast(null), 3000);
              }}
              onCancel={async () => {
                setPendingWord(null);
                await chrome.storage.session.set({ pendingNewWord: null });
              }}
            />
          )}
          {saveToast && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm font-medium text-accent-dark shadow-sm animate-[fadeIn_0.2s_ease]">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white text-xs font-bold">✓</span>
              {saveToast}
            </div>
          )}
          {!pendingWord && selected && (
            <WordDetail
              vocab={selected}
              encounters={encounters}
              onUpdated={(v) => setSelected(v)}
              onDeleted={() => { setSelected(null); setSelectedId(null); setEncounters([]); }}
            />
          )}
          {!pendingWord && !selected && (
            <p className="mb-3 rounded-lg border border-dashed border-ink-200 bg-white/80 p-3 text-sm text-ink-500">
              Bôi đen từ trên trang web để thêm vào từ điển cá nhân.
            </p>
          )}
          <div className="mb-3">
            <SearchBox value={query} onChange={setQuery} />
          </div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-600">Danh sách từ</h2>
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent-dark">
              {stats.total} từ
            </span>
          </div>
          {loading ? (
            <p className="text-sm text-ink-500">Đang tải…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-ink-500">Chưa có từ nào.</p>
          ) : (
            <div className="space-y-2">
              {items.slice(0, 60).map((v) => (
                <WordCard key={v.id} vocabulary={v} onClick={selectWord}
                  active={v.id === selectedId && !pendingWord} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Ôn tập */}
      {tab === 'study' && <StudyMode />}

      {/* Tab: Cài đặt */}
      {tab === 'settings' && <SettingsTab />}

      {/* Tab: Hướng dẫn */}
      {tab === 'guide' && <GuideTab />}
    </div>
  );
}
