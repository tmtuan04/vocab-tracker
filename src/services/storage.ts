import * as XLSX from 'xlsx';
import { normalizeWord } from '@/services/sentence';
import { calculateNextReview, isDue, getSRSConfig } from '@/services/srs';
import type { ReviewGrade } from '@/services/srs';
import type {
  Encounter,
  ExportData,
  SaveResult,
  SaveWordPayload,
  SelectionPayload,
  Vocabulary,
  VocabularyStats,
} from '@/types/vocabulary';

import { scheduleAutoSync } from '@/services/sheets';

const KEYS = { vocabularies: 'vocabularies', encounters: 'encounters' } as const;

function uuid(): string { return crypto.randomUUID(); }

async function getAll(): Promise<{ vocabularies: Vocabulary[]; encounters: Encounter[] }> {
  const result = await chrome.storage.local.get([KEYS.vocabularies, KEYS.encounters]);
  return {
    vocabularies: (result[KEYS.vocabularies] as Vocabulary[] | undefined) ?? [],
    encounters: (result[KEYS.encounters] as Encounter[] | undefined) ?? [],
  };
}

async function setAll(vocabularies: Vocabulary[], encounters: Encounter[], skipAutoSync = false): Promise<void> {
  await chrome.storage.local.set({ [KEYS.vocabularies]: vocabularies, [KEYS.encounters]: encounters });
  // Tự động đồng bộ lên Google Sheets (debounce 3s, im lặng nếu chưa kết nối)
  if (!skipAutoSync) scheduleAutoSync();
}

export async function listVocabularies(): Promise<Vocabulary[]> {
  const { vocabularies } = await getAll();
  return [...vocabularies].sort(
    (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
  );
}

export async function getVocabulary(id: string): Promise<Vocabulary | null> {
  const { vocabularies } = await getAll();
  return vocabularies.find((v) => v.id === id) ?? null;
}

export async function findByWord(word: string): Promise<Vocabulary | null> {
  const normalized = normalizeWord(word);
  const { vocabularies } = await getAll();
  return vocabularies.find((v) => v.normalizedWord === normalized) ?? null;
}

export async function getEncountersFor(vocabularyId: string): Promise<Encounter[]> {
  const { encounters } = await getAll();
  return encounters
    .filter((e) => e.vocabularyId === vocabularyId)
    .sort((a, b) => new Date(b.encounteredAt).getTime() - new Date(a.encounteredAt).getTime());
}

export async function saveWord(payload: SaveWordPayload): Promise<SaveResult> {
  const now = new Date().toISOString();
  const normalized = normalizeWord(payload.word);
  if (!normalized) throw new Error('Empty word');

  const { vocabularies, encounters } = await getAll();
  const existing = vocabularies.find((v) => v.normalizedWord === normalized);

  if (existing) {
    const encounter: Encounter = {
      id: uuid(), vocabularyId: existing.id, sentence: payload.sentence,
      sourceUrl: payload.sourceUrl, sourceTitle: payload.sourceTitle,
      domain: payload.domain, encounteredAt: now,
    };
    const updated: Vocabulary = {
      ...existing,
      meaning: payload.meaning || existing.meaning,
      example: payload.example !== undefined ? payload.example : existing.example,
      dictionary: payload.dictionary ?? existing.dictionary,
      encounterCount: existing.encounterCount + 1,
      lastSeenAt: now,
    };
    await setAll(vocabularies.map((v) => (v.id === existing.id ? updated : v)), [...encounters, encounter]);
    return { vocabulary: updated, encounter, isNew: false, wasDebounced: false };
  }

  const vocabulary: Vocabulary = {
    id: uuid(), word: payload.word.trim(), normalizedWord: normalized,
    meaning: payload.meaning, example: payload.example, dictionary: payload.dictionary,
    encounterCount: 1, firstSeenAt: now, lastSeenAt: now,
  };
  const encounter: Encounter = {
    id: uuid(), vocabularyId: vocabulary.id, sentence: payload.sentence,
    sourceUrl: payload.sourceUrl, sourceTitle: payload.sourceTitle,
    domain: payload.domain, encounteredAt: now,
  };
  await setAll([...vocabularies, vocabulary], [...encounters, encounter]);
  return { vocabulary, encounter, isNew: true, wasDebounced: false };
}

export async function saveSelection(payload: SelectionPayload): Promise<SaveResult> {
  return saveWord({ ...payload, meaning: '' });
}

export async function updateVocabulary(
  id: string,
  patch: Partial<Pick<Vocabulary, 'word' | 'meaning' | 'example' | 'note' | 'dictionary' | 'review'>>,
): Promise<Vocabulary | null> {
  const { vocabularies, encounters } = await getAll();
  const idx = vocabularies.findIndex((v) => v.id === id);
  if (idx < 0) return null;
  const updated = { ...vocabularies[idx]!, ...patch };
  const next = [...vocabularies];
  next[idx] = updated;
  await setAll(next, encounters);
  return updated;
}

export async function updateNote(id: string, note: string): Promise<Vocabulary | null> {
  return updateVocabulary(id, { note });
}

export async function removeVocabulary(id: string): Promise<void> {
  const { vocabularies, encounters } = await getAll();
  await setAll(
    vocabularies.filter((v) => v.id !== id),
    encounters.filter((e) => e.vocabularyId !== id),
  );
}

// ─── Spaced Repetition ────────────────────────────────────────────────────────

/** Lấy danh sách từ đến hạn ôn (tối đa maxCount). */
export async function getDueWords(maxCount = 20): Promise<Vocabulary[]> {
  const list = await listVocabularies();
  const due = list.filter((v) => isDue(v.review));
  // Ưu tiên: từ chưa ôn lần nào trước, sau đó đến từ quá hạn lâu nhất
  const neverReviewed = due.filter((v) => !v.review);
  const overdue = due
    .filter((v) => v.review)
    .sort((a, b) => new Date(a.review!.nextReviewAt).getTime() - new Date(b.review!.nextReviewAt).getTime());
  return [...neverReviewed, ...overdue].slice(0, maxCount);
}

/** Ghi nhận kết quả ôn tập và tính lịch tiếp theo. */
export async function submitReview(id: string, grade: ReviewGrade): Promise<Vocabulary | null> {
  const [{ vocabularies, encounters }, srsConfig] = await Promise.all([getAll(), getSRSConfig()]);
  const idx = vocabularies.findIndex((v) => v.id === id);
  if (idx < 0) return null;
  const current = vocabularies[idx]!;
  const newReview = calculateNextReview(current.review, grade, srsConfig);
  const updated = { ...current, review: newReview };
  const next = [...vocabularies];
  next[idx] = updated;
  await setAll(next, encounters);
  return updated;
}

/** Đếm số từ đến hạn ôn. */
export async function getDueCount(): Promise<number> {
  const list = await listVocabularies();
  return list.filter((v) => isDue(v.review)).length;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getStats(): Promise<VocabularyStats> {
  const list = await listVocabularies();
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return {
    total: list.length,
    newThisWeek: list.filter((v) => now - new Date(v.firstSeenAt).getTime() <= weekMs).length,
    dueForReview: list.filter((v) => isDue(v.review)).length,
  };
}

export async function searchVocabularies(query: string): Promise<Vocabulary[]> {
  const q = query.trim().toLowerCase();
  const list = await listVocabularies();
  if (!q) return list;
  return list.filter(
    (v) =>
      v.normalizedWord.includes(q) || v.word.toLowerCase().includes(q) ||
      v.meaning?.toLowerCase().includes(q) || v.example?.toLowerCase().includes(q) ||
      v.note?.toLowerCase().includes(q),
  );
}

// ─── Export / Import JSON ─────────────────────────────────────────────────────

export async function exportData(): Promise<ExportData> {
  const { vocabularies, encounters } = await getAll();
  return { version: 2, exportedAt: new Date().toISOString(), vocabularies, encounters };
}

export async function importData(data: ExportData): Promise<void> {
  if (!data || !([1, 2] as number[]).includes(data.version as number) ||
    !Array.isArray(data.vocabularies) || !Array.isArray(data.encounters)) {
    throw new Error('Invalid export file');
  }
  await setAll(data.vocabularies, data.encounters);
}

// ─── Export / Import Excel (.xlsx) ───────────────────────────────────────────

type SpreadsheetRow = {
  Word: string; Meaning: string; Example: string; Note: string;
  'Encounter Count': number; 'Next Review': string;
  'First Seen': string; 'Last Seen': string;
};

function buildRows(vocabularies: Vocabulary[]): SpreadsheetRow[] {
  return vocabularies
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .map((v) => ({
      Word: v.word, Meaning: v.meaning ?? '', Example: v.example ?? '', Note: v.note ?? '',
      'Encounter Count': v.encounterCount,
      'Next Review': v.review?.nextReviewAt?.slice(0, 10) ?? '',
      'First Seen': v.firstSeenAt.slice(0, 10), 'Last Seen': v.lastSeenAt.slice(0, 10),
    }));
}

export async function exportExcel(): Promise<Blob> {
  const { vocabularies } = await getAll();
  const ws = XLSX.utils.json_to_sheet(buildRows(vocabularies));
  ws['!cols'] = [{ wch: 22 }, { wch: 40 }, { wch: 60 }, { wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vocabulary');
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function importExcel(file: File): Promise<{ imported: number; updated: number }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const wsName = wb.SheetNames[0];
  if (!wsName) throw new Error('File Excel trống');
  const rows = XLSX.utils.sheet_to_json<Partial<SpreadsheetRow>>(wb.Sheets[wsName]!);
  return mergeRows(rows);
}

// ─── Export / Import CSV ──────────────────────────────────────────────────────

const CSV_HEADERS = ['Word', 'Meaning', 'Example', 'Note', 'Encounter Count', 'Next Review', 'First Seen', 'Last Seen'];

function escapeCSV(val: string | number): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function exportCSV(): Promise<string> {
  const { vocabularies } = await getAll();
  const rows = buildRows(vocabularies);
  const lines = [
    CSV_HEADERS.join(','),
    ...rows.map((r) =>
      [r.Word, r.Meaning, r.Example, r.Note, r['Encounter Count'], r['Next Review'], r['First Seen'], r['Last Seen']]
        .map(escapeCSV).join(','),
    ),
  ];
  return lines.join('\n');
}

function parseCSV(content: string): Partial<SpreadsheetRow>[] {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    // Simple CSV parse (handles quoted fields)
    const values: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { values.push(cur); cur = ''; continue; }
      cur += ch;
    }
    values.push(cur);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i]?.trim() ?? ''; });
    return obj as Partial<SpreadsheetRow>;
  });
}

export async function importCSV(content: string): Promise<{ imported: number; updated: number }> {
  return mergeRows(parseCSV(content));
}

// ─── Shared merge logic ───────────────────────────────────────────────────────

async function mergeRows(rows: Partial<SpreadsheetRow>[], skipAutoSync = false): Promise<{ imported: number; updated: number }> {
  const now = new Date().toISOString();
  const { vocabularies, encounters } = await getAll();
  const nextVocabs = [...vocabularies];
  let imported = 0; let updated = 0;

  for (const row of rows) {
    const word = row.Word?.trim();
    if (!word) continue;
    const normalized = normalizeWord(word);
    const idx = nextVocabs.findIndex((v) => v.normalizedWord === normalized);
    if (idx >= 0) {
      const existing = nextVocabs[idx]!;
      nextVocabs[idx] = {
        ...existing,
        meaning: row.Meaning || existing.meaning,
        example: row.Example || existing.example,
        note: row.Note || existing.note,
      };
      updated++;
    } else {
      nextVocabs.push({
        id: uuid(), word, normalizedWord: normalized,
        meaning: row.Meaning ?? '', example: row.Example || undefined, note: row.Note || undefined,
        encounterCount: Number(row['Encounter Count']) || 1,
        firstSeenAt: row['First Seen'] ? new Date(row['First Seen']).toISOString() : now,
        lastSeenAt: row['Last Seen'] ? new Date(row['Last Seen']).toISOString() : now,
      });
      imported++;
    }
  }
  await setAll(nextVocabs, encounters, skipAutoSync);
  return { imported, updated };
}

/** Import rows từ pull (không trigger auto-sync để không ghi đè sheet gốc). */
export async function importRowsFromPull(rows: Partial<SpreadsheetRow>[]): Promise<{ imported: number; updated: number }> {
  return mergeRows(rows, true);
}

export async function clearAll(): Promise<void> { await setAll([], []); }
