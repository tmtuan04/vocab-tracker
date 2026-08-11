import { fetchDictionaryInfo } from '@/services/dictionary';
import { normalizeWord } from '@/services/sentence';
import type {
  Encounter,
  ExportData,
  SaveResult,
  SelectionPayload,
  Vocabulary,
  VocabularyStats,
} from '@/types/vocabulary';

const KEYS = {
  vocabularies: 'vocabularies',
  encounters: 'encounters',
} as const;

const DEBOUNCE_MS = 2 * 60 * 1000;

function uuid(): string {
  return crypto.randomUUID();
}

async function getAll(): Promise<{
  vocabularies: Vocabulary[];
  encounters: Encounter[];
}> {
  const result = await chrome.storage.local.get([KEYS.vocabularies, KEYS.encounters]);
  return {
    vocabularies: (result[KEYS.vocabularies] as Vocabulary[] | undefined) ?? [],
    encounters: (result[KEYS.encounters] as Encounter[] | undefined) ?? [],
  };
}

async function setAll(vocabularies: Vocabulary[], encounters: Encounter[]): Promise<void> {
  await chrome.storage.local.set({
    [KEYS.vocabularies]: vocabularies,
    [KEYS.encounters]: encounters,
  });
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
    .sort(
      (a, b) => new Date(b.encounteredAt).getTime() - new Date(a.encounteredAt).getTime(),
    );
}

export async function saveSelection(payload: SelectionPayload): Promise<SaveResult> {
  const now = new Date().toISOString();
  const normalized = normalizeWord(payload.word);
  if (!normalized) {
    throw new Error('Empty word');
  }

  const { vocabularies, encounters } = await getAll();
  const existing = vocabularies.find((v) => v.normalizedWord === normalized);

  if (existing) {
    const recentDup = encounters.find(
      (e) =>
        e.vocabularyId === existing.id &&
        e.sourceUrl === payload.sourceUrl &&
        nowMs(now) - nowMs(e.encounteredAt) < DEBOUNCE_MS,
    );
    if (recentDup) {
      return {
        vocabulary: existing,
        encounter: recentDup,
        isNew: false,
        wasDebounced: true,
      };
    }

    const encounter: Encounter = {
      id: uuid(),
      vocabularyId: existing.id,
      sentence: payload.sentence,
      sourceUrl: payload.sourceUrl,
      sourceTitle: payload.sourceTitle,
      domain: payload.domain,
      encounteredAt: now,
    };

    const updated: Vocabulary = {
      ...existing,
      encounterCount: existing.encounterCount + 1,
      lastSeenAt: now,
    };

    const nextVocabs = vocabularies.map((v) => (v.id === existing.id ? updated : v));
    await setAll(nextVocabs, [...encounters, encounter]);
    return { vocabulary: updated, encounter, isNew: false, wasDebounced: false };
  }

  const dict = await fetchDictionaryInfo(normalized);
  const vocabulary: Vocabulary = {
    id: uuid(),
    word: payload.word.trim(),
    normalizedWord: normalized,
    phonetic: dict.phonetic,
    partOfSpeech: dict.partOfSpeech,
    meaning: dict.meaning,
    encounterCount: 1,
    firstSeenAt: now,
    lastSeenAt: now,
  };

  const encounter: Encounter = {
    id: uuid(),
    vocabularyId: vocabulary.id,
    sentence: payload.sentence,
    sourceUrl: payload.sourceUrl,
    sourceTitle: payload.sourceTitle,
    domain: payload.domain,
    encounteredAt: now,
  };

  await setAll([...vocabularies, vocabulary], [...encounters, encounter]);
  return { vocabulary, encounter, isNew: true, wasDebounced: false };
}

export async function updateNote(id: string, note: string): Promise<Vocabulary | null> {
  const { vocabularies, encounters } = await getAll();
  const idx = vocabularies.findIndex((v) => v.id === id);
  if (idx < 0) return null;
  const updated = { ...vocabularies[idx]!, note };
  const next = [...vocabularies];
  next[idx] = updated;
  await setAll(next, encounters);
  return updated;
}

export async function updateVocabulary(
  id: string,
  patch: Partial<Pick<Vocabulary, 'meaning' | 'note' | 'phonetic' | 'partOfSpeech'>>,
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

export async function removeVocabulary(id: string): Promise<void> {
  const { vocabularies, encounters } = await getAll();
  await setAll(
    vocabularies.filter((v) => v.id !== id),
    encounters.filter((e) => e.vocabularyId !== id),
  );
}

export async function getStats(): Promise<VocabularyStats> {
  const list = await listVocabularies();
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

  return {
    total: list.length,
    newThisWeek: list.filter((v) => now - nowMs(v.firstSeenAt) <= weekMs).length,
    needsReview: list.filter(
      (v) => v.encounterCount === 1 && now - nowMs(v.lastSeenAt) > threeDaysMs,
    ).length,
  };
}

export async function searchVocabularies(query: string): Promise<Vocabulary[]> {
  const q = query.trim().toLowerCase();
  const list = await listVocabularies();
  if (!q) return list;
  return list.filter(
    (v) =>
      v.normalizedWord.includes(q) ||
      v.word.toLowerCase().includes(q) ||
      v.meaning?.toLowerCase().includes(q) ||
      v.note?.toLowerCase().includes(q),
  );
}

export async function exportData(): Promise<ExportData> {
  const { vocabularies, encounters } = await getAll();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    vocabularies,
    encounters,
  };
}

export async function importData(data: ExportData): Promise<void> {
  if (!data || data.version !== 1 || !Array.isArray(data.vocabularies) || !Array.isArray(data.encounters)) {
    throw new Error('Invalid export file');
  }
  await setAll(data.vocabularies, data.encounters);
}

export async function clearAll(): Promise<void> {
  await setAll([], []);
}

function nowMs(iso: string): number {
  return new Date(iso).getTime();
}
