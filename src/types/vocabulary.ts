import type { DictionaryEntry } from '@/services/dictionary';
import type { ReviewInfo } from '@/services/srs';

export type Vocabulary = {
  id: string;
  word: string;
  normalizedWord: string;
  meaning: string;
  example?: string;
  note?: string;
  dictionary?: DictionaryEntry;
  review?: ReviewInfo;          // Dữ liệu ôn tập SRS
  encounterCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type Encounter = {
  id: string;
  vocabularyId: string;
  sentence: string;
  sourceUrl: string;
  sourceTitle: string;
  domain: string;
  encounteredAt: string;
};

export type VocabularyStats = {
  total: number;
  newThisWeek: number;
  dueForReview: number;        // Số từ đến hạn ôn tập
};

export type SelectionPayload = {
  word: string;
  sentence: string;
  sourceUrl: string;
  sourceTitle: string;
  domain: string;
};

export type SaveWordPayload = {
  word: string;
  sentence: string;
  sourceUrl: string;
  sourceTitle: string;
  domain: string;
  meaning: string;
  example?: string;
  dictionary?: DictionaryEntry;
};

export type SaveResult = {
  vocabulary: Vocabulary;
  encounter: Encounter;
  isNew: boolean;
  wasDebounced: boolean;
};

export type ExportData = {
  version: 2;
  exportedAt: string;
  vocabularies: Vocabulary[];
  encounters: Encounter[];
};

export type { DictionaryEntry, DictionaryMeaning, DictionaryDefinition } from '@/services/dictionary';
export type { ReviewInfo, ReviewGrade } from '@/services/srs';
